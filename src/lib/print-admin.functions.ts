import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = any;

const printerSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  type: z.enum(["thermal", "a4", "a5", "label", "other"]),
  paper: z.enum(["a4", "a5", "t58", "t80", "custom"]),
  deviceName: z.string().max(200).optional(),
  copies: z.number().int().min(1).max(10).optional(),
});

/** Printer configurations + defaults (manage_printers ya settings ijazat). */
export const savePrinters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    printers: z.array(printerSchema).max(30),
    defaults: z.partialRecord(z.enum(["sales", "pos", "a4", "a5", "thermal", "report"]), z.string().max(40)),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_save_printers", { _printers: data.printers, _defaults: data.defaults });
    if (error) throw new Error(error.message.includes("permission") ? "Not allowed to change printer settings" : "Printer settings could not be saved. Try again.");
    return { ok: true };
  });

/** Reprint / backup / export / print error — audit log me. */
export const logPosEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    action: z.enum(["reprint", "print", "backup", "export", "print_error"]),
    entity: z.string().max(40),
    entityId: z.string().uuid().optional(),
    details: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean()])).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await (context.supabase as Sb).rpc("pos_log_event", { _action: data.action, _entity: data.entity, _entity_id: data.entityId ?? null, _details: data.details ?? {} });
    return { ok: true };
  });

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ action: z.string().max(40).optional(), entity: z.string().max(40).optional(), limit: z.number().int().min(1).max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    let q = sb.from("audit_log").select("id, action, entity, entity_id, details, created_by, created_at").order("created_at", { ascending: false }).limit(data.limit ?? 200);
    if (data.action) q = q.eq("action", data.action);
    if (data.entity) q = q.ilike("entity", `%${data.entity}%`);
    const [{ data: rows, error }, { data: profs }] = await Promise.all([q, sb.from("profiles").select("id, full_name")]);
    if (error) throw new Error("Could not load audit log");
    const nm = new Map<string, string>(((profs ?? []) as any[]).map((p) => [p.id, p.full_name || "User"]));
    return { rows: ((rows ?? []) as any[]).map((r) => ({ id: r.id as string, action: r.action as string, entity: r.entity as string, entityId: (r.entity_id ?? null) as string | null, details: JSON.stringify(r.details ?? {}), user: nm.get(r.created_by) ?? "-", at: r.created_at as string })) };
  });

const EXPORTS = {
  products: "name, sku, barcode, category, brand, unit, sale_price, purchase_price, wholesale_price, min_sale_price, stock, min_stock, tax_percent, is_active",
  customers: "name, phone, city, address, email, opening_balance, credit_limit, created_at",
  suppliers: "name, phone, address, opening_balance, is_active, created_at",
  sales: "doc_type, doc_number, status, payment_status, customer_name, customer_phone, subtotal, discount_total, tax_total, delivery, grand_total, paid_total, balance, cost_total, created_at",
  purchases: "doc_type, doc_number, status, payment_status, supplier_name, subtotal, discount_total, tax_total, grand_total, paid_total, balance, created_at",
  payments: "direction, kind, method, amount, status, note, created_at",
  expenses: "expense_date, category, amount, method, description, status, created_at",
  stock: "kind, qty, note, created_at, product_id",
} as const;
const TABLE: Record<keyof typeof EXPORTS, string> = { products: "products", customers: "customers", suppliers: "suppliers", sales: "pos_sales", purchases: "purchases", payments: "pos_payments", expenses: "expenses", stock: "stock_movements" };

/** CSV-ready rows (sirf safe business columns — koi secret/ID nahi). */
export const exportData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ what: z.enum(Object.keys(EXPORTS) as [keyof typeof EXPORTS, ...(keyof typeof EXPORTS)[]]) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: ok } = await sb.rpc("pos_can", { _perm: "settings" });
    const { data: ok2 } = await sb.rpc("pos_can", { _perm: "view_reports" });
    if (!ok && !ok2) throw new Error("Not allowed to export");
    const { data: rows, error } = await sb.from(TABLE[data.what]).select(EXPORTS[data.what]).limit(50000);
    if (error) throw new Error("Export failed");
    await sb.rpc("pos_log_event", { _action: "export", _entity: data.what, _entity_id: null, _details: { rows: (rows ?? []).length } });
    return { columns: EXPORTS[data.what].split(",").map((c) => c.trim()), rows: ((rows ?? []) as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)]))) as Record<string, string>[] };
  });

export const getSyncOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const [{ data: logs }, { count }, { data: lastBackup }] = await Promise.all([
      sb.from("sync_logs").select("id, synced_at, total_rows, updated_count, inserted_count, skipped_count, error_count, status, error_details").order("synced_at", { ascending: false }).limit(30),
      sb.from("products").select("id", { count: "exact", head: true }),
      sb.from("audit_log").select("created_at").eq("action", "backup").order("created_at", { ascending: false }).limit(1),
    ]);
    return {
      products: count ?? 0,
      lastBackup: ((lastBackup ?? [])[0]?.created_at ?? null) as string | null,
      logs: ((logs ?? []) as any[]).map((l) => ({ id: l.id as string, at: l.synced_at as string, total: l.total_rows as number, updated: l.updated_count as number, inserted: l.inserted_count as number, skipped: l.skipped_count as number, errors: l.error_count as number, status: l.status as string, details: l.error_details ? JSON.stringify(l.error_details).slice(0, 2000) : "" })),
    };
  });
