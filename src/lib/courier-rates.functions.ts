import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeConfig, type CourierProfile } from "@/lib/courier-rates";

async function blocked(context: { supabase: unknown; userId: string }) {
  const { isActiveProfile } = await import("@/lib/access.server");
  return !(await isActiveProfile(context.supabase as never, context.userId));
}

async function workspaceOf(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.workspace_id ?? userId;
}

/** HB workspace ko built-in PostEx rules milte hain, baaqi sab apni rate sheet upload karte hain. */
export const getCalculatorMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnerWorkspaceId } = await import("@/lib/product-sync.server");
    const [ws, owner] = await Promise.all([workspaceOf(context.userId), getOwnerWorkspaceId()]);
    return { builtin: !!owner && ws === owner };
  });

export const listCouriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (await blocked(context)) return { couriers: [] as CourierProfile[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("courier_profiles")
      .select("id, name, config, source_file, updated_at")
      .eq("workspace_id", await workspaceOf(context.userId))
      .order("name", { ascending: true })
      .limit(50);

    const couriers: CourierProfile[] = [];
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const config = normalizeConfig(r["config"]);
      if (!config) continue;
      couriers.push({
        id: String(r["id"]),
        name: String(r["name"]),
        sourceFile: r["source_file"] ? String(r["source_file"]) : null,
        config,
        updatedAt: String(r["updated_at"]),
      });
    }
    return { couriers };
  });

const IMPORT_PROMPT = `Aap aik courier rate-sheet extractor hain. Di gayi file me courier ki shipping rate list hai.

Sirf JSON output dein (koi baat nahi, koi code fence nahi) is shape me:
{
  "services": [{"id":"standard","label":"Standard Delivery"}],
  "slabs": [{"serviceId":"standard","zoneId":"within_city","uptoKg":0.5,"rate":85}],
  "additionalKgRate": 50,
  "fuelPct": 15,
  "taxPct": 18,
  "codPct": 4,
  "materials": [{"id":"flyer","label":"Small Flyer","rate":15}],
  "notes": ["file me jo baat clear na thi"]
}

Rules:
- zoneId sirf in me se: "within_city" (same city), "same_province" (same province, different city), "cross_province" (province to province / nationwide). Agar file me sirf aik hi rate ho to teeno zones ke liye same slab likh dein.
- slabs me "uptoKg" us slab ki upper weight limit hai (kg me). Har service + zone ke liye slabs dein.
- additionalKgRate = slab ke baad har extra kg ka charge. Na mile to 0.
- fuelPct / taxPct / codPct percentage numbers hain (15 ka matlab 15%). Na mile to 0.
- materials optional packaging charges hain (flyer, sticker, box). Na mile to khali array.
- Sirf wahi numbers jo file me likhe hain — kuch guess mat karein.
- Agar file me rate table nahi hai to sirf ye likhein: NO_TABLE`;

export const importCourierDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fileName: z.string().min(1).max(260),
        fileType: z.string().max(200).default(""),
        dataUrl: z.string().min(1).max(14_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Your access is blocked. Contact the admin." };
    }

    const ext = (data.fileName.split(".").pop() ?? "").toLowerCase();
    const allowed = ["pdf", "xlsx", "xls", "csv", "txt", "docx", "png", "jpg", "jpeg", "webp"];
    if (!allowed.includes(ext)) {
      return {
        ok: false as const,
        message: `".${ext}" files are not supported. Upload PDF, Word (.docx), Excel (.xlsx/.xls), CSV, or an image.`,
      };
    }

    const base64 = data.dataUrl.includes(",") ? data.dataUrl.split(",")[1]! : data.dataUrl;
    let bytes: Uint8Array;
    try {
      const bin = atob(base64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    } catch {
      return { ok: false as const, message: "Could not read the file. Please upload it again." };
    }
    if (bytes.length > 10 * 1024 * 1024) {
      return { ok: false as const, message: "File 10MB se bari hai." };
    }

    let extracted = "";
    try {
      if (["xlsx", "xls", "csv"].includes(ext)) {
        const { sheetToText } = await import("@/lib/courier-doc.server");
        extracted = sheetToText(bytes);
      } else if (ext === "docx") {
        const { docxToText } = await import("@/lib/courier-doc.server");
        extracted = await docxToText(bytes);
      } else if (ext === "txt") {
        extracted = new TextDecoder().decode(bytes).slice(0, 60_000);
      }
    } catch {
      return {
        ok: false as const,
        message: "Could not read the file's data — it may be corrupted or password-protected.",
      };
    }
    if (["xlsx", "xls", "csv", "docx", "txt"].includes(ext) && extracted.trim().length < 10) {
      return { ok: false as const, message: "The file appears empty — no rate table found." };
    }

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, message: "AI service is not configured." };

    const content: unknown[] = [
      { type: "text", text: "Is courier rate sheet ko JSON me convert karein." },
    ];
    if (extracted) content.push({ type: "text", text: extracted });
    else if (ext === "pdf")
      content.push({ type: "file", file: { filename: data.fileName, file_data: data.dataUrl } });
    else content.push({ type: "image_url", image_url: { url: data.dataUrl } });

    let text = "";
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: IMPORT_PROMPT },
            { role: "user", content },
          ],
        }),
      });
      if (res.status === 429)
        return {
          ok: false as const,
          message: "Too many requests right now — please try again shortly.",
        };
      if (res.status === 402)
        return { ok: false as const, message: "AI credits have run out. Please add credits." };
      if (!res.ok)
        return { ok: false as const, message: "There was a problem reading the file. Please try again." };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      text = json.choices?.[0]?.message?.content ?? "";
    } catch {
      return { ok: false as const, message: "There was a problem reading the file. Please try again." };
    }

    const cleaned = text.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
    if (!cleaned || /NO_TABLE/i.test(cleaned)) {
      return { ok: false as const, message: "No courier rate table was found in the file." };
    }
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return { ok: false as const, message: "Could not understand the rate sheet. Please upload a clearer file." };
    }

    const config = normalizeConfig(parsed);
    if (!config) {
      return {
        ok: false as const,
        message: "The rate sheet is missing weight slabs or rates — please check the file and re-upload.",
      };
    }
    return { ok: true as const, config, fileName: data.fileName };
  });

const configSchema = z.object({
  services: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(1),
  slabs: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        zoneId: z.enum(["within_city", "same_province", "cross_province"]),
        uptoKg: z.number().finite().positive(),
        rate: z.number().finite().positive(),
      }),
    )
    .min(1)
    .max(400),
  additionalKgRate: z.number().finite().min(0),
  fuelPct: z.number().finite().min(0),
  taxPct: z.number().finite().min(0),
  codPct: z.number().finite().min(0),
  materials: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1), rate: z.number().finite().min(0) }))
    .max(30),
  notes: z.array(z.string()).max(10).optional(),
});

export const saveCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        sourceFile: z.string().max(260).nullable().default(null),
        // client percent (0-100) bhejta hai, engine fraction rakhta hai — yahan fraction hi aata hai
        config: configSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Your access is blocked. Contact the admin." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const workspaceId = await workspaceOf(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("courier_profiles")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("name", data.name)
      .maybeSingle();

    const row = {
      workspace_id: workspaceId,
      name: data.name,
      config: data.config,
      source_file: data.sourceFile,
      created_by: context.userId,
    };

    const { error } = existing?.id
      ? await supabaseAdmin
          .from("courier_profiles")
          .update({ config: row.config, source_file: row.source_file })
          .eq("id", existing.id)
      : await supabaseAdmin.from("courier_profiles").insert(row);

    if (error) return { ok: false as const, message: "Failed to save the courier." };
    return { ok: true as const, message: `${data.name} saved successfully` };
  });

export const deleteCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Aapka access band hai." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("courier_profiles")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", await workspaceOf(context.userId));
    if (error) return { ok: false as const, message: "Failed to delete." };
    return { ok: true as const, message: "Courier hata diya" };
  });
