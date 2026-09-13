import { createServerFn } from "@tanstack/react-start";

export type DbProduct = {
  name: string;
  unit: string;
  p100: number | null;
  sale: number | null;
  stock: number | null;
};

export const getProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicSupabase } = await import("@/lib/product-sync.server");
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from("products")
    .select("name, unit, sale_price, p100_staff_price, stock")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(5000);

  if (error || !data) return { products: [] as DbProduct[], ok: false };

  return {
    ok: true,
    products: data.map((r: Record<string, unknown>) => ({
      name: String(r["name"]),
      unit: String(r["unit"]),
      p100: r["p100_staff_price"] === null ? null : Number(r["p100_staff_price"]),
      sale: r["sale_price"] === null ? null : Number(r["sale_price"]),
      stock: r["stock"] === null ? null : Number(r["stock"]),
    })) as DbProduct[],
  };
});

export const getSyncStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicSupabase } = await import("@/lib/product-sync.server");
  const supabase = createPublicSupabase();

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
