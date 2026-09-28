import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = any;
export type PosStore = { id: string; name: string; kind: "store" | "godown"; isDefault: boolean; isActive: boolean };

export const listStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as Sb).rpc("pos_list_stores");
    if (error) throw new Error("Failed to load stores");
    return data as { stores: PosStore[]; commonProducts: boolean };
  });

export const saveStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().nullable(), name: z.string().trim().min(1).max(80), kind: z.enum(["store", "godown"]), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as Sb).rpc("pos_save_store", { _id: data.id, _name: data.name, _kind: data.kind, _active: data.active });
    if (error) throw new Error(error.message || "Failed to save store");
    return { id: id as string };
  });

export const setCommonProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_set_common_products", { _on: data.on });
    if (error) throw new Error(error.message || "Failed to save");
    return { ok: true };
  });

export const transferStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    from: z.string().uuid(), to: z.string().uuid(), note: z.string().max(200),
    items: z.array(z.object({ productId: z.string().uuid(), qty: z.number().positive().max(1e7) })).min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await (context.supabase as Sb).rpc("pos_transfer_stock", {
      _from: data.from, _to: data.to, _note: data.note, _items: data.items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    });
    if (error) throw new Error(error.message || "Transfer failed");
    return { count: n as number };
  });

/** Per-store stock + product visibility (when products are not common between stores). */
export const getStoreStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: st }, { data: prods }, { data: store }] = await Promise.all([
      sb.from("pos_store_stock").select("product_id, qty").eq("store_id", data.storeId).limit(10000),
      sb.from("products").select("id, name, store_id").eq("scope", "pos").eq("is_active", true).limit(10000),
      sb.from("pos_stores").select("is_default").eq("id", data.storeId).maybeSingle(),
    ]);
    const qty = new Map<string, number>(((st ?? []) as any[]).map((r) => [r.product_id, Number(r.qty)]));
    const byId: Record<string, number> = {};
    const byName: Record<string, number> = {};
    const visibleIds: string[] = [];
    for (const p of (prods ?? []) as any[]) {
      const q = qty.get(p.id) ?? 0;
      byId[p.id] = q;
      byName[p.name] = q;
      if (p.store_id === data.storeId || (!p.store_id && store?.is_default) || q !== 0) visibleIds.push(p.id);
    }
    const visibleNames = ((prods ?? []) as any[]).filter((p) => visibleIds.includes(p.id)).map((p) => p.name as string);
    return { byId, byName, visibleIds, visibleNames };
  });

/** Combined stock across every active store/godown. This is a read-only overview. */
export const getAllStoresStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const [{ data: stores, error: storesError }, { data: prods, error: productsError }] = await Promise.all([
      sb.from("pos_stores").select("id").eq("is_active", true).limit(1000),
      sb.from("products").select("id, name").eq("scope", "pos").eq("is_active", true).limit(10000),
    ]);
    if (storesError || productsError) throw new Error("Failed to load all-store stock");
    const storeIds = ((stores ?? []) as Array<{ id: string }>).map((store) => store.id);
    const { data: rows, error: stockError } = storeIds.length
      ? await sb.from("pos_store_stock").select("product_id, qty").in("store_id", storeIds).limit(50000)
      : { data: [], error: null };
    if (stockError) throw new Error("Failed to load all-store stock");
    const byId: Record<string, number> = {};
    for (const row of (rows ?? []) as Array<{ product_id: string; qty: number | string }>) {
      byId[row.product_id] = (byId[row.product_id] ?? 0) + Number(row.qty ?? 0);
    }
    const byName: Record<string, number> = {};
    const visibleIds: string[] = [];
    const visibleNames: string[] = [];
    for (const product of (prods ?? []) as Array<{ id: string; name: string }>) {
      const qty = byId[product.id] ?? 0;
      byId[product.id] = qty;
      byName[product.name] = (byName[product.name] ?? 0) + qty;
      visibleIds.push(product.id);
      visibleNames.push(product.name);
    }
    return { byId, byName, visibleIds, visibleNames };
  });
