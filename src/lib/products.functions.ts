import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type DbProduct = {
  name: string;
  unit: string;
  p100: number | null;
  p250: number | null;
  p500: number | null;
  sale: number | null;
  stock: number | null;
  /** manual overrides (null = auto) */
  customSale: number | null;
  customP100: number | null;
  customP250: number | null;
  customP500: number | null;
  sku?: string;
  barcode?: string;
  category?: string;
};

const num = (v: unknown) => (v == null ? null : Number(v));

async function blocked(context: { supabase: unknown; userId: string }) {
  const { isActiveProfile } = await import("@/lib/access.server");
  return !(await isActiveProfile(context.supabase as never, context.userId));
}

/** Har user apni rate list dekhta hai; kuch accounts aik shared workspace me hote hain. */
async function workspaceOf(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.workspace_id ?? userId;
}

export const getProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: z.enum(["rates", "pos"]).optional() }).optional().parse(d ?? undefined))
  .handler(async ({ context, data: input }) => {
    if (await blocked(context)) return { products: [] as DbProduct[], ok: false };
  const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabase
    .from("products")
    .select(
      "name, unit, sale_price, p100_staff_price, p250_staff_price, p500_staff_price, stock, custom_sale_price, custom_p100_price, custom_p250_price, custom_p500_price, sku, barcode, category",
    )
    .eq("is_active", true)
    .eq("scope", input?.scope ?? "rates")
    .eq("workspace_id", await workspaceOf(context.userId))
    .order("name", { ascending: true })
    .limit(5000);

  if (error || !data) return { products: [] as DbProduct[], ok: false };

  return {
    ok: true,
    products: data.map((r: Record<string, unknown>) => {
      const customSale = num(r["custom_sale_price"]);
      const customP100 = num(r["custom_p100_price"]);
      const customP250 = num(r["custom_p250_price"]);
      const customP500 = num(r["custom_p500_price"]);
      return {
        name: String(r["name"]),
        unit: String(r["unit"]),
        p100: customP100 ?? num(r["p100_staff_price"]),
        p250: customP250 ?? num(r["p250_staff_price"]),
        p500: customP500 ?? num(r["p500_staff_price"]),
        sale: customSale ?? num(r["sale_price"]),
        stock: num(r["stock"]),
        customSale,
        customP100,
        customP250,
        customP500,
        sku: r["sku"] ? String(r["sku"]) : undefined,
        barcode: r["barcode"] ? String(r["barcode"]) : undefined,
        category: r["category"] ? String(r["category"]) : undefined,
      };
    }) as DbProduct[],
  };
});

const priceField = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  });

export const saveProductPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().min(1),
        sale: priceField,
        p100: priceField,
        p250: priceField,
        p500: priceField,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) return { ok: false, message: "Access blocked" };
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    const { error } = await supabase
      .from("products")
      .update({
        custom_sale_price: data.sale,
        custom_p100_price: data.p100,
        custom_p250_price: data.p250,
        custom_p500_price: data.p500,
      })
      .eq("workspace_id", await workspaceOf(context.userId))
      .eq("scope", "rates")
      .eq("name", data.name);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Saved" };
  });

export const saveProductPricesBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              name: z.string().min(1),
              sale: priceField,
              p100: priceField,
              p250: priceField,
              p500: priceField,
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) return { ok: false, saved: 0, message: "Access blocked" };
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");

    const ws = await workspaceOf(context.userId);
    let saved = 0;
    let failed = 0;
    for (const item of data.items) {
      const { error } = await supabase
        .from("products")
        .update({
          custom_sale_price: item.sale,
          custom_p100_price: item.p100,
          custom_p250_price: item.p250,
          custom_p500_price: item.p500,
        })
        .eq("workspace_id", ws)
        .eq("scope", "rates")
        .eq("name", item.name);
      if (error) failed += 1;
      else saved += 1;
    }

    return {
      ok: failed === 0,
      saved,
      failed,
      message: failed === 0 ? `${saved} products saved` : `${saved} saved, ${failed} failed`,
    };
  });

export const syncProductsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fileName: z.string().min(1).max(260),
        fileBase64: z.string().min(1).max(14_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Your access is blocked. Contact the admin." };
    }
    let bytes: Uint8Array;
    try {
      const bin = atob(data.fileBase64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    } catch {
      return { ok: false as const, message: "Could not read file. Please upload again." };
    }
    if (bytes.length > 10 * 1024 * 1024) {
      return { ok: false as const, message: "File is larger than 10MB." };
    }

    const ext = (data.fileName.split(".").pop() ?? "").toLowerCase();
    if (!["xlsx", "xls", "csv", "txt"].includes(ext)) {
      return {
        ok: false as const,
        message: `".${ext}" files are not supported. Upload Excel (.xlsx/.xls) or CSV only — use the card below for PDF/image.`,
      };
    }

    const { parseVyaparSheet } = await import("@/lib/vyapar-sheet.server");
    const parsed = parseVyaparSheet(bytes);
    if (!parsed.ok) return { ok: false as const, message: parsed.error };

    return applyRows(parsed.rows, await workspaceOf(context.userId), {
      fileName: data.fileName,
      sheetName: parsed.sheetName,
      emptyRows: parsed.skipped,
      notes: parsed.notes,
    });
  });

type RowsMeta = {
  fileName?: string;
  sheetName?: string;
  emptyRows?: number;
  notes?: string[];
};

async function applyRows(
  rows: Array<{ name: string; unit: string; sale_price: number; stock: number }>,
  workspaceId: string,
  meta: RowsMeta = {},
) {
  const { syncProductRows } = await import("@/lib/product-sync.server");
  const { result, errors } = await syncProductRows(rows, workspaceId);

  return {
    ok: true as const,
    message: "Rates updated",
    fileName: meta.fileName,
    sheetName: meta.sheetName,
    emptyRows: meta.emptyRows ?? 0,
    ...result,
    errors: [
      ...(meta.notes ?? []),
      ...errors.slice(0, 10).map((e) => `Row ${e.index + 2}: ${e.reason}`),
    ],
  };
}

/** Kisi bhi software se copy ki hui table paste kar ke rates update karna. */
export const syncProductsFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ text: z.string().min(10).max(2_000_000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Your access is blocked. Contact the admin." };
    }
    const { parseDelimitedText } = await import("@/lib/vyapar-sheet.server");
    const parsed = parseDelimitedText(data.text);
    if (!parsed.ok) return { ok: false as const, message: parsed.error };
    return applyRows(parsed.rows, await workspaceOf(context.userId), {
      sheetName: parsed.sheetName,
      emptyRows: parsed.skipped,
      notes: parsed.notes,
    });
  });

const DOC_PROMPT = `Aap aik rate-list extractor hain. Di gayi file (PDF ya tasveer) me se products ki rate list nikaalein.

Sirf TSV (tab separated) output dein, koi baat nahi, koi code fence nahi.
Pehli line bilkul ye ho:
Item Name\tSale Price\tUnit\tStock

Phir har product ki aik line. Rules:
- Sirf wahi rows jo file me likhi hain — kuch guess mat karein.
- Sale Price sirf number (currency symbol, comma ke bagair).
- Unit me kg, grammes, litre, pcs, piece, bottles, bundles me se jo laagu ho; na pata ho to khali chhorein.
- Stock na ho to 0.
- Agar file me rate list ka table nahi hai to sirf ye likhein: NO_TABLE`;

/** PDF ya tasveer se rate list padh kar preview banata hai (save nahi karta). */
export const previewProductsFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fileName: z.string().min(1).max(260),
        fileType: z.string().min(1).max(120),
        dataUrl: z.string().min(1).max(14_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Your access is blocked. Contact the admin." };
    }
    const isImage = data.fileType.startsWith("image/");
    const isPdf = data.fileType === "application/pdf";
    if (!isImage && !isPdf) {
      return {
        ok: false as const,
        message: "Only PDF or image (JPG/PNG) is supported.",
      };
    }

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, message: "AI service is not configured." };

    const content: unknown[] = [{ type: "text", text: "Is file ki rate list TSV me dein." }];
    if (isImage) content.push({ type: "image_url", image_url: { url: data.dataUrl } });
    else
      content.push({
        type: "file",
        file: { filename: data.fileName, file_data: data.dataUrl },
      });

    let text = "";
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: DOC_PROMPT },
            { role: "user", content },
          ],
        }),
      });
      if (res.status === 429) {
        return { ok: false as const, message: "Too many requests right now — try again in a bit." };
      }
      if (res.status === 402) {
        return { ok: false as const, message: "AI credits have run out. Please add credits." };
      }
      if (!res.ok) {
        return { ok: false as const, message: "There was a problem reading the file. Try again." };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      text = json.choices?.[0]?.message?.content ?? "";
    } catch {
      return { ok: false as const, message: "There was a problem reading the file. Try again." };
    }

    const cleaned = text.replace(/```[a-z]*/gi, "").trim();
    if (!cleaned || /NO_TABLE/i.test(cleaned)) {
      return { ok: false as const, message: "No rate list table found in the file." };
    }

    const { parseDelimitedText } = await import("@/lib/vyapar-sheet.server");
    const parsed = parseDelimitedText(cleaned);
    if (!parsed.ok) return { ok: false as const, message: parsed.error };

    return {
      ok: true as const,
      rows: parsed.rows.slice(0, 5000),
      skipped: parsed.skipped,
      notes: parsed.notes,
    };
  });

/** Preview confirm hone ke baad rows save karta hai. */
export const applyProductRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              name: z.string().min(1).max(300),
              unit: z.string().min(1).max(40),
              sale_price: z.number().finite().positive(),
              stock: z.number().finite().min(0).default(0),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Your access is blocked. Contact the admin." };
    }
    return applyRows(data.rows, await workspaceOf(context.userId), {
      sheetName: "Document import",
    });
  });

export const getSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (await blocked(context)) return { productCount: 0, last: null };
  const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");


  const ws = await workspaceOf(context.userId);
  const [{ count }, { data: logs }] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("scope", "rates")
      .eq("workspace_id", ws),
    supabase
      .from("sync_logs")
      .select("synced_at, total_rows, updated_count, inserted_count, skipped_count, error_count, status")
      .eq("workspace_id", ws)
      .order("synced_at", { ascending: false })
      .limit(1),
  ]);

  const last = (logs ?? [])[0] as Record<string, unknown> | undefined;
  return {
    productCount: count ?? 0,
    last: last
      ? {
          synced_at: String(last["synced_at"]),
          total_rows: Number(last["total_rows"]),
          updated_count: Number(last["updated_count"]),
          inserted_count: Number(last["inserted_count"]),
          skipped_count: Number(last["skipped_count"]),
          error_count: Number(last["error_count"]),
          status: String(last["status"]),
        }
      : null,
  };
});
