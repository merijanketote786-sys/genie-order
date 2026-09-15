import { createServerFn } from "@tanstack/react-start";
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
};

const num = (v: unknown) => (v == null ? null : Number(v));

export const getProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabase
    .from("products")
    .select(
      "name, unit, sale_price, p100_staff_price, p250_staff_price, p500_staff_price, stock, custom_sale_price, custom_p100_price, custom_p250_price, custom_p500_price",
    )
    .eq("is_active", true)
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
  .handler(async ({ data }) => {
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    const { error } = await supabase
      .from("products")
      .update({
        custom_sale_price: data.sale,
        custom_p100_price: data.p100,
        custom_p250_price: data.p250,
        custom_p500_price: data.p500,
      })
      .eq("name", data.name);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Saved" };
  });

export const getSyncStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");


  const [{ count }, { data: logs }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("sync_logs")
      .select("synced_at, total_rows, updated_count, inserted_count, skipped_count, error_count, status")
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
