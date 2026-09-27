import { withStore } from "@/lib/pos-store.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = any;

export const POS_ROLES = ["manager", "cashier", "salesman", "staff"] as const;
export type PosPerm =
  | "view_pos" | "create_sale" | "edit_price" | "apply_discount" | "cancel_invoice" | "view_reports" | "view_profit"
  | "edit_stock" | "edit_products" | "view_balances" | "manage_expenses" | "manage_purchases" | "manage_users" | "settings"
  | "edit_sale" | "return_sale" | "manage_customers" | "manage_suppliers" | "manage_printers"
  | "view_accounting" | "create_journal" | "post_journal" | "view_ledger" | "view_trial_balance" | "view_pnl"
  | "view_balance_sheet" | "view_ar_ap" | "manage_accounts" | "close_period";

export type { PosConfig } from "./pos-config";
import type { PosConfig } from "./pos-config";

export const getPosAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const [{ data: acc }, { data: st }] = await Promise.all([
      sb.rpc("pos_my_access"),
      sb.from("pos_settings").select("config").maybeSingle(),
    ]);
    const a = (acc ?? {}) as { role?: string; perms?: string[]; hasPin?: boolean };
    return { role: a.role ?? "staff", perms: (a.perms ?? []) as PosPerm[], hasPin: !!a.hasPin, config: ((st?.config ?? {}) as PosConfig) };
  });

export const verifyPosPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pin: z.string().max(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await (context.supabase as Sb).rpc("pos_verify_pin", { _pin: data.pin });
    if (ok) await (context.supabase as Sb).from("audit_log").insert({ action: "pin_override", entity: "pos", details: {} }).then(() => null, () => null);
    return { ok: !!ok };
  });

export const savePosSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    config: z.record(z.string(), z.unknown()).refine((c) => JSON.stringify(c).length < 600_000, "Settings are too large (shrink the logo)"),
    pin: z.string().max(8).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_save_settings", { _config: data.config, _pin: data.pin });
    if (error) throw new Error(error.message.includes("PIN") ? "PIN must be 4 to 8 digits" : error.message.includes("permission") ? "Not allowed to change settings" : "Settings could not be saved. Try again.");
    return { ok: true };
  });

export const listPosMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const [{ data: profs }, { data: roles }, { data: admins }] = await Promise.all([
      sb.from("profiles").select("id, full_name, is_active"),
      sb.from("pos_member_roles").select("user_id, role"),
      sb.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]);
    const rm = new Map<string, string>(((roles ?? []) as any[]).map((r) => [r.user_id, r.role]));
    const am = new Set(((admins ?? []) as any[]).map((r) => r.user_id));
    return { members: ((profs ?? []) as any[]).map((p) => ({ id: p.id as string, name: (p.full_name || "User") as string, active: !!p.is_active, role: am.has(p.id) ? "admin" : rm.get(p.id) ?? "manager" })) };
  });

export const setPosMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), role: z.enum(POS_ROLES) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_set_member_role", { _user: data.userId, _role: data.role });
    if (error) throw new Error("Could not save role");
    return { ok: true };
  });

export const cancelWithPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.string().max(300), pin: z.string().max(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await withStore((context.supabase as Sb).rpc("pos_cancel_sale_pin", { _id: data.id, _reason: data.reason, _pin: data.pin }));
    if (error) throw new Error(error.message.includes("PIN") ? "Incorrect PIN" : "Could not cancel");
    return { ok: true };
  });

/** Admin backup: POS ke tamam records JSON me. */
export const exportPosBackup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const { data: ok } = await sb.rpc("pos_can", { _perm: "settings" });
    if (!ok) throw new Error("Not allowed");
    const tables = ["customers", "suppliers", "pos_sales", "pos_sale_items", "purchases", "purchase_items", "pos_payments", "expenses", "stock_movements", "products"];
    const out: Record<string, unknown[]> = {};
    for (const t of tables) { const { data } = await sb.from(t).select("*").limit(50000); out[t] = data ?? []; }
    await sb.rpc("pos_log_event", { _action: "backup", _entity: "pos", _entity_id: null, _details: { tables: tables.length } });
    return { json: JSON.stringify({ exportedAt: new Date().toISOString(), tables: out }) };
  });
