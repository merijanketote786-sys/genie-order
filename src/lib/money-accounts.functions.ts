import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = any;
const r2 = (x: number) => Math.round(x * 100) / 100;

export type MoneyAccount = { id: string; name: string; code: string; kind: "cash" | "bank"; balance: number };

/** Cash in hand + bank accounts with live balances from posted journals. */
export const listMoneyAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const { data: accs } = await sb.from("acc_accounts").select("id, code, name, system_key, is_payment, opening_balance, is_active").or("system_key.in.(cash,bank),is_payment.eq.true").eq("is_active", true).order("code");
    const list = (accs ?? []) as any[];
    const ids = list.map((a) => a.id);
    const bal = new Map<string, number>();
    if (ids.length) {
      for (let from = 0; ; from += 1000) {
        const { data: lines } = await sb.from("acc_journal_lines").select("account_id, debit, credit, acc_journals!inner(status)").in("account_id", ids).eq("acc_journals.status", "posted").range(from, from + 999);
        for (const l of (lines ?? []) as any[]) bal.set(l.account_id, (bal.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
        if (!lines || lines.length < 1000) break;
      }
    }
    const accounts: MoneyAccount[] = list.map((a) => ({ id: a.id, code: a.code, name: a.system_key === "cash" ? "Cash in hand" : a.name, kind: a.system_key === "cash" ? "cash" : "bank", balance: r2(Number(a.opening_balance ?? 0) + (bal.get(a.id) ?? 0)) }));
    return { accounts };
  });

export const addBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(2).max(60), opening: z.number().min(-1e10).max(1e10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_add_bank_account", { _name: data.name, _opening: data.opening });
    if (error) throw new Error(error.message.includes("permission") ? "You don't have permission to add accounts" : error.message);
    return { ok: true };
  });

export const saveCashCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), counted: z.number().min(0).max(1e10), expected: z.number(), note: z.string().max(300).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_save_cash_count", { _date: data.date, _counted: data.counted, _expected: data.expected, _note: data.note ?? "" });
    if (error) throw new Error(error.message.includes("permission") ? "You don't have permission" : "Could not save cash count");
    return { ok: true };
  });

export const getCashCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await (context.supabase as Sb).from("pos_cash_counts").select("counted, expected, note, created_at").eq("count_date", data.date).maybeSingle();
    return { count: row ? { counted: Number(row.counted), expected: Number(row.expected), note: (row.note ?? "") as string, at: row.created_at as string } : null };
  });
