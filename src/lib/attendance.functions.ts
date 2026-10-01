import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { friendlyDbError } from "./pos-errors";

type Sb = any;
const r2 = (x: number) => Math.round(x * 100) / 100;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export type Labour = {
  id: string; name: string; phone: string; bioId: string; salaryType: "daily" | "weekly" | "monthly";
  rate: number; workDays: number; fullHours: number; halfHours: number; paidLeaves: number; otRate: number;
  postExpense: boolean; isActive: boolean;
};
export type DayStatus = "full" | "half" | "leave" | "absent";

const mapLabour = (r: any): Labour => ({
  id: r.id, name: r.name, phone: r.phone ?? "", bioId: r.bio_id ?? "", salaryType: r.salary_type, rate: Number(r.rate),
  workDays: Number(r.work_days), fullHours: Number(r.full_hours), halfHours: Number(r.half_hours), paidLeaves: Number(r.paid_leaves),
  otRate: Number(r.ot_rate), postExpense: !!r.post_expense, isActive: !!r.is_active,
});

export const listLabour = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as Sb).from("att_labour").select("*").order("name");
    if (error) throw new Error("Could not load labour list");
    return { labour: (data ?? []).map(mapLabour) };
  });

const labourSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().max(30).optional().default(""),
  bioId: z.string().trim().max(40).optional().default(""),
  salaryType: z.enum(["daily", "weekly", "monthly"]),
  rate: z.number().min(0).max(1e8),
  workDays: z.number().min(1).max(7),
  fullHours: z.number().min(0.5).max(24),
  halfHours: z.number().min(0).max(24),
  paidLeaves: z.number().int().min(0).max(31),
  otRate: z.number().min(0).max(1e6),
  postExpense: z.boolean(),
  isActive: z.boolean(),
});

export const saveLabour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => labourSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const row = { name: data.name, phone: data.phone || null, bio_id: data.bioId || null, salary_type: data.salaryType, rate: data.rate, work_days: data.workDays, full_hours: data.fullHours, half_hours: data.halfHours, paid_leaves: data.paidLeaves, ot_rate: data.otRate, post_expense: data.postExpense, is_active: data.isActive };
    const q = data.id ? sb.from("att_labour").update(row).eq("id", data.id) : sb.from("att_labour").insert(row);
    const { error } = await q;
    if (error) throw new Error(friendlyDbError(error, "Could not save labour. Check your permission."));
    return { ok: true };
  });

export const getDayAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: z.string().regex(dateRe) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await (context.supabase as Sb).from("att_days").select("labour_id, status, in_time, out_time, ot_hours, source").eq("day", data.date);
    return { rows: ((rows ?? []) as any[]).map((r) => ({ labourId: r.labour_id as string, status: r.status as DayStatus, inTime: (r.in_time ?? "").slice(0, 5), outTime: (r.out_time ?? "").slice(0, 5), otHours: Number(r.ot_hours), source: r.source as string })) };
  });

export const saveDayAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    date: z.string().regex(dateRe),
    rows: z.array(z.object({ labourId: z.string().uuid(), status: z.enum(["full", "half", "leave", "absent", "none"]), inTime: z.string().max(5).optional(), outTime: z.string().max(5).optional(), otHours: z.number().min(0).max(24).optional() })).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const del = data.rows.filter((r) => r.status === "none").map((r) => r.labourId);
    const up = data.rows.filter((r) => r.status !== "none").map((r) => ({ labour_id: r.labourId, day: data.date, status: r.status, in_time: r.inTime || null, out_time: r.outTime || null, ot_hours: r.otHours ?? 0, source: "manual", updated_at: new Date().toISOString() }));
    if (up.length) {
      const { error } = await sb.from("att_days").upsert(up, { onConflict: "labour_id,day" });
      if (error) throw new Error(friendlyDbError(error, "Could not save attendance. Check your permission."));
    }
    if (del.length) await sb.from("att_days").delete().eq("day", data.date).in("labour_id", del);
    return { ok: true, saved: up.length };
  });

export const importPunches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deviceId: z.string().uuid().nullable(), punches: z.array(z.object({ bioId: z.string().trim().min(1).max(40), day: z.string().regex(dateRe), tm: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/) })).min(1).max(20000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    let inserted = 0;
    for (let i = 0; i < data.punches.length; i += 500) {
      const chunk = data.punches.slice(i, i + 500).map((p) => ({ bio_id: p.bioId, day: p.day, tm: p.tm.length === 5 ? `${p.tm}:00` : p.tm, device_id: data.deviceId, source: "file" }));
      const { data: rows, error } = await sb.from("att_punches").upsert(chunk, { onConflict: "workspace_id,bio_id,day,tm", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(friendlyDbError(error, "Could not import attendance file."));
      inserted += (rows ?? []).length;
    }
    return { inserted, total: data.punches.length };
  });

/* ------------------------------- Devices ------------------------------- */

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as Sb).from("att_devices").select("id, name, kind, serial, token, last_seen").order("created_at");
    return { devices: ((data ?? []) as any[]).map((d) => ({ id: d.id as string, name: d.name as string, kind: d.kind as "wifi" | "usb", serial: (d.serial ?? "") as string, token: d.token as string, lastSeen: d.last_seen as string | null })) };
  });

export const saveDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60), kind: z.enum(["wifi", "usb"]), serial: z.string().trim().max(60).optional().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const row = { name: data.name, kind: data.kind, serial: data.serial ? data.serial.toUpperCase() : null };
    const { error } = data.id ? await sb.from("att_devices").update(row).eq("id", data.id) : await sb.from("att_devices").insert(row);
    if (error) throw new Error(error.code === "23505" ? "This serial number is already registered" : "Could not save machine (admin only)");
    return { ok: true };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).from("att_devices").delete().eq("id", data.id);
    if (error) throw new Error("Could not remove machine");
    return { ok: true };
  });

/* ------------------------------- Salary ------------------------------- */

export type SalaryRow = Labour & { full: number; half: number; leave: number; absent: number; paidLeaveUsed: number; otHours: number; perDay: number; earned: number; advances: number; paid: number; net: number };

export function perDayRate(l: Pick<Labour, "salaryType" | "rate" | "workDays">) {
  if (l.salaryType === "daily") return l.rate;
  if (l.salaryType === "weekly") return l.rate / l.workDays;
  return l.rate / ((l.workDays * 52) / 12);
}

export const getSalarySheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string().regex(dateRe), to: z.string().regex(dateRe) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: lab }, { data: days }, { data: pays }] = await Promise.all([
      sb.from("att_labour").select("*").order("name"),
      sb.from("att_days").select("labour_id, status, ot_hours").gte("day", data.from).lte("day", data.to).limit(50000),
      sb.from("att_payments").select("id, labour_id, kind, amount, pay_date, method, note, expense_posted").gte("pay_date", data.from).lte("pay_date", data.to).order("pay_date").limit(10000),
    ]);
    const months = Math.max(1, Math.round((Date.parse(data.to) - Date.parse(data.from)) / 86400000 / 30));
    const rows: SalaryRow[] = ((lab ?? []) as any[]).map(mapLabour).map((l) => {
      const ds = ((days ?? []) as any[]).filter((d) => d.labour_id === l.id);
      const c = (s: string) => ds.filter((d) => d.status === s).length;
      const full = c("full"), half = c("half"), leave = c("leave"), absent = c("absent");
      const otHours = r2(ds.reduce((s, d) => s + Number(d.ot_hours ?? 0), 0));
      const paidLeaveUsed = Math.min(leave, l.paidLeaves * months);
      const pd = perDayRate(l);
      const earned = r2(full * pd + half * pd / 2 + paidLeaveUsed * pd + otHours * l.otRate);
      const ps = ((pays ?? []) as any[]).filter((p) => p.labour_id === l.id);
      const advances = r2(ps.filter((p) => p.kind === "advance").reduce((s, p) => s + Number(p.amount), 0));
      const paid = r2(ps.filter((p) => p.kind === "salary").reduce((s, p) => s + Number(p.amount), 0));
      return { ...l, full, half, leave, absent, paidLeaveUsed, otHours, perDay: r2(pd), earned, advances, paid, net: r2(earned - advances - paid) };
    });
    const payments = ((pays ?? []) as any[]).map((p) => ({ id: p.id as string, labourId: p.labour_id as string, kind: p.kind as string, amount: Number(p.amount), date: p.pay_date as string, method: p.method as string, note: (p.note ?? "") as string, posted: !!p.expense_posted }));
    return { rows, payments };
  });

export const payLabour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    labourId: z.string().uuid(), kind: z.enum(["salary", "advance"]), amount: z.number().positive().max(1e9),
    date: z.string().regex(dateRe), method: z.string().max(30), from: z.string().regex(dateRe).optional(), to: z.string().regex(dateRe).optional(),
    note: z.string().max(300).optional(), clientRef: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: l }, { data: st }] = await Promise.all([
      sb.from("att_labour").select("name, post_expense").eq("id", data.labourId).maybeSingle(),
      sb.from("pos_settings").select("config").maybeSingle(),
    ]);
    if (!l) throw new Error("Labour not found");
    const att = ((st?.config ?? {}) as any).attendance ?? {};
    const post = att.postExpenses !== false && !!l.post_expense;
    const { error } = await sb.from("att_payments").insert({ labour_id: data.labourId, kind: data.kind, amount: data.amount, pay_date: data.date, method: data.method, period_from: data.from ?? null, period_to: data.to ?? null, note: data.note || null, client_ref: data.clientRef, expense_posted: post });
    if (error?.code === "23505") return { ok: true, duplicate: true, posted: post };
    if (error) throw new Error(friendlyDbError(error, "Could not save payment. Check your permission."));
    if (post) {
      const desc = `${data.kind === "advance" ? "Salary advance" : "Salary"} — ${l.name}${data.from && data.to ? ` (${data.from} to ${data.to})` : ""}${data.note ? ` · ${data.note}` : ""}`;
      // Expense failure must never block the payment record.
      await sb.from("expenses").insert({ category: "Salary", amount: data.amount, expense_date: data.date, method: data.method, description: desc.slice(0, 500), client_ref: data.clientRef }).then(() => null, () => null);
    }
    return { ok: true, posted: post };
  });
