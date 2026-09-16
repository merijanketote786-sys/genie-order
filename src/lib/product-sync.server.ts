import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export function normalizeName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s*\/(kg|piece|ltr|litre|gram|g)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const productSchema = z.object({
  name: z.string().min(1).max(300),
  unit: z.enum(["kg", "piece", "litre", "grammes", "pcs", "bottles", "bundles"]),
  sale_price: z.coerce.number().finite().min(0),
  stock: z.coerce.number().finite().default(0),
});

const payloadSchema = z.object({
  products: z.array(z.unknown()).min(1).max(5000),
});

type SyncResult = {
  total_rows: number;
  updated_count: number;
  inserted_count: number;
  skipped_count: number;
  error_count: number;
  sync_id: string | null;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** HB (owner) workspace — auto-sync/API key isi list ko update karta hai. */
export async function getOwnerWorkspaceId(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const owner = data?.users.find((u) => (u.email ?? "").toLowerCase() === "hhtraders008@gmail.com");
  return owner?.id ?? null;
}

export async function syncProductRows(
  products: unknown[],
  workspaceId: string,
): Promise<{
  result: SyncResult;
  status: "success" | "partial" | "failed";
  errors: Array<{ index: number; reason: string }>;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const totalRows = products.length;
  const errors: Array<{ index: number; reason: string }> = [];
  const byName = new Map<
    string,
    { name: string; normalized_name: string; unit: string; sale_price: number; stock: number }
  >();
  let skipped = 0;

  products.forEach((item, index) => {
    const row = productSchema.safeParse(item);
    if (!row.success) {
      errors.push({ index, reason: row.error.issues[0]?.message ?? "invalid row" });
      return;
    }
    const normalized = normalizeName(row.data.name);
    if (!normalized) {
      errors.push({ index, reason: "empty name" });
      return;
    }
    // Never wipe an existing rate with 0 — skip rows without a real price.
    if (!(row.data.sale_price > 0)) {
      skipped += 1;
      return;
    }
    if (byName.has(normalized)) skipped += 1;
    byName.set(normalized, {
      name: row.data.name.trim(),
      normalized_name: normalized,
      unit: row.data.unit,
      sale_price: row.data.sale_price,
      stock: row.data.stock,
    });
  });

  const rows = [...byName.values()];

  let inserted = 0;
  let updated = 0;

  if (rows.length > 0) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("products")
      .select("normalized_name")
      .eq("workspace_id", workspaceId)
      .in(
        "normalized_name",
        rows.map((r) => r.normalized_name),
      );

    if (existingError) {
      errors.push({ index: -1, reason: existingError.message });
    }

    const existingSet = new Set((existing ?? []).map((r) => r.normalized_name));

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabaseAdmin
        .from("products")
        .upsert(
          chunk.map((r) => ({ ...r, is_active: true })),
          { onConflict: "normalized_name" },
        );
      if (error) {
        errors.push({ index: i, reason: error.message });
        continue;
      }
      for (const r of chunk) {
        if (existingSet.has(r.normalized_name)) updated += 1;
        else inserted += 1;
      }
    }
  }

  const errorCount = errors.length;
  const status = errorCount === 0 ? "success" : inserted + updated > 0 ? "partial" : "failed";

  const { data: log } = await supabaseAdmin
    .from("sync_logs")
    .insert({
      total_rows: totalRows,
      updated_count: updated,
      inserted_count: inserted,
      skipped_count: skipped,
      error_count: errorCount,
      status,
      error_details: errorCount ? errors.slice(0, 50) : null,
    })
    .select("id")
    .single();

  return {
    status,
    errors,
    result: {
      total_rows: totalRows,
      updated_count: updated,
      inserted_count: inserted,
      skipped_count: skipped,
      error_count: errorCount,
      sync_id: log?.id ?? null,
    },
  };
}

export async function handleProductSync(request: Request): Promise<Response> {
  const expected = process.env["PRODUCT_SYNC_API_KEY"];
  if (!expected) {
    return json({ error: "Sync is not configured on the server." }, 503);
  }

  const provided =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (provided.length !== expected.length || provided !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Invalid payload: expected { products: [...] }" }, 400);
  }

  const { result, status } = await syncProductRows(parsed.data.products);

  return json(result, status === "failed" ? 500 : 200);
}

export function createPublicSupabase() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}
