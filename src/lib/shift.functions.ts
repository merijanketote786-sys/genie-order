import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { shiftSummary } from "./shift-calc";

type Sb = any;

async function summarize(sb: Sb, shift: any, userId: string) {
  const until = shift.closed_at ?? new Date().toISOString();
  const { data: pays } = await sb.from("pos_payments").select("direction, method, amount, kind").eq("created_by", userId).eq("status", "completed").gte("created_at", shift.opened_at).lte("created_at", until).limit(5000);
  const { data: moves } = await sb.from("pos_shift_moves").select("id, direction, amount, note, created_at").eq("shift_id", shift.id).order("created_at");
  return { summary: shiftSummary(Number(shift.opening_float), (pays ?? []) as any, (moves ?? []) as any), moves: moves ?? [] };
}

export const getShiftState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const { data: open } = await sb.from("pos_shifts").select("*").eq("user_id", context.userId).eq("status", "open").maybeSingle();
    const { data: history } = await sb.from("pos_shifts").select("id, user_id, opened_at, closed_at, opening_float, counted_cash, expected_cash, note").eq("status", "closed").order("closed_at", { ascending: false }).limit(30);
    if (!open) return { open: null, history: history ?? [] };
    const s = await summarize(sb, open, context.userId);
    return { open: { ...open, ...s }, history: history ?? [] };
  });

export const openShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ float: z.number().min(0).max(1e9) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).from("pos_shifts").insert({ opening_float: data.float });
    if (error) throw new Error(error.code === "23505" ? "A shift is already open" : error.message);
    return { ok: true };
  });

export const addShiftMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ shiftId: z.string().uuid(), direction: z.enum(["in", "out"]), amount: z.number().positive().max(1e9), note: z.string().trim().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).from("pos_shift_moves").insert({ shift_id: data.shiftId, direction: data.direction, amount: data.amount, note: data.note || null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ shiftId: z.string().uuid(), counted: z.number().min(0).max(1e10), note: z.string().trim().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: shift } = await sb.from("pos_shifts").select("*").eq("id", data.shiftId).eq("user_id", context.userId).eq("status", "open").maybeSingle();
    if (!shift) throw new Error("No open shift found");
    const closedAt = new Date().toISOString();
    const { summary } = await summarize(sb, { ...shift, closed_at: closedAt }, context.userId);
    const { error } = await sb.from("pos_shifts").update({ status: "closed", closed_at: closedAt, counted_cash: data.counted, expected_cash: summary.expected, summary, note: data.note || null }).eq("id", shift.id);
    if (error) throw new Error(error.message);
    return { summary, counted: data.counted, closedAt, openedAt: shift.opened_at };
  });
