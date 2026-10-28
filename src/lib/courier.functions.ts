import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Ctx = { supabase: any; userId: string };

const SECRET_KEYS = ["token", "apiKey", "apiPassword", "webhookSecret"];

async function guard(ctx: Ctx, perm: "view_pos" | "create_sale" | "admin") {
  const sb = ctx.supabase;
  const ok = perm === "admin"
    ? (await sb.rpc("pos_is_admin")).data
    : (await sb.rpc("pos_can", { _perm: perm })).data;
  if (!ok) throw new Error("You do not have permission for courier booking");
  const { admin } = await import("./courier-core.server");
  const a = await admin();
  const { data } = await a.from("profiles").select("workspace_id").eq("id", ctx.userId).maybeSingle();
  const ws = data?.workspace_id ?? ctx.userId;
  return { a, ws };
}

function newToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* ---------- Courier accounts (admin) ---------- */

export const listCourierAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const isAdmin = !!(await sb.rpc("pos_is_admin")).data;
    const { a, ws } = await guard(context as Ctx, "view_pos");
    const { data } = await a.from("pos_courier_accounts").select("*").eq("workspace_id", ws).order("created_at");
    return {
      isAdmin,
      accounts: ((data ?? []) as any[]).map((r: any) => {
        const creds: Record<string, string> = {};
        for (const [k, v] of Object.entries(r.credentials ?? {})) creds[k] = SECRET_KEYS.includes(k) ? (v ? "••••••" : "") : String(v ?? "");
        return { id: r.id as string, courier: r.courier as string, label: r.label as string, isActive: r.is_active as boolean, isDefault: r.is_default as boolean, settings: (r.settings ?? {}) as Record<string, boolean | string>, credentials: isAdmin ? creds : {}, webhookToken: isAdmin ? (r.webhook_token as string | null) : null };
      }),
    };
  });

export const saveCourierAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    courier: z.enum(["postex", "trax", "leopards", "manual", "confirmflow"]),
    label: z.string().trim().min(1).max(60),
    credentials: z.record(z.string().max(40), z.string().max(500)),
    settings: z.object({ autoBookOnConfirm: z.boolean().optional(), requireConfirmation: z.boolean().optional(), bookWithAccountId: z.string().max(40).optional() }),
    isActive: z.boolean(),
    isDefault: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { a, ws } = await guard(context as Ctx, "admin");
    let prev: any = null;
    if (data.id) {
      const r = await a.from("pos_courier_accounts").select("*").eq("id", data.id).eq("workspace_id", ws).maybeSingle();
      prev = r.data;
      if (!prev) throw new Error("Account not found");
    }
    const creds: Record<string, string> = { ...(prev?.credentials ?? {}) };
    for (const [k, v] of Object.entries(data.credentials)) {
      if (v === "••••••") continue; // unchanged secret
      if (v === "") delete creds[k]; else creds[k] = v.trim();
    }
    if (data.isDefault) await a.from("pos_courier_accounts").update({ is_default: false }).eq("workspace_id", ws);
    const row = {
      workspace_id: ws, courier: data.courier, label: data.label, credentials: creds, settings: data.settings,
      is_active: data.isActive, is_default: data.isDefault, updated_at: new Date().toISOString(),
      webhook_token: prev?.webhook_token ?? (data.courier === "confirmflow" ? newToken() : null),
    };
    const q = data.id ? a.from("pos_courier_accounts").update(row).eq("id", data.id) : a.from("pos_courier_accounts").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCourierAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { a, ws } = await guard(context as Ctx, "admin");
    const { error } = await a.from("pos_courier_accounts").delete().eq("id", data.id).eq("workspace_id", ws);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateWebhookToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { a, ws } = await guard(context as Ctx, "admin");
    await a.from("pos_courier_accounts").update({ webhook_token: newToken() }).eq("id", data.id).eq("workspace_id", ws);
    return { ok: true };
  });

/* ---------- Shipments ---------- */

export const listShipments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: z.string().max(30).optional(), search: z.string().max(80).optional(), saleId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { a, ws } = await guard(context as Ctx, "view_pos");
    let q = a.from("pos_shipments").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(300);
    if (data.saleId) q = q.eq("sale_id", data.saleId);
    if (data.status && data.status !== "all") q = data.status === "pending" ? q.eq("confirmation", "pending") : q.eq("status", data.status);
    if (data.search) {
      const s = data.search.replace(/[%,()*]/g, "");
      q = q.or(`doc_number.ilike.%${s}%,consignee_name.ilike.%${s}%,consignee_phone.ilike.%${s}%,tracking_number.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { shipments: rows ?? [] };
  });

export const createShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    saleId: z.string().uuid().nullable(),
    docNumber: z.string().trim().min(1).max(40),
    accountId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(7).max(20),
    address: z.string().trim().min(3).max(400),
    city: z.string().trim().min(2).max(60),
    cityCode: z.string().trim().max(20).optional(),
    cod: z.number().min(0).max(1e8),
    weightKg: z.number().positive().max(500),
    pieces: z.number().int().min(1).max(500),
    items: z.string().max(600),
    remarks: z.string().max(300).optional(),
    requireConfirmation: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { a, ws } = await guard(context as Ctx, "create_sale");
    const { data: acc } = await a.from("pos_courier_accounts").select("*").eq("id", data.accountId).eq("workspace_id", ws).eq("is_active", true).maybeSingle();
    if (!acc) throw new Error("Choose an active courier account");
    const core = await import("./courier-core.server");
    const { data: row, error } = await a.from("pos_shipments").insert({
      workspace_id: ws, sale_id: data.saleId, doc_number: data.docNumber, account_id: acc.id, courier: acc.courier,
      confirmation: data.requireConfirmation ? "pending" : "not_required",
      status: data.requireConfirmation ? "awaiting_confirmation" : "draft",
      consignee_name: data.name, consignee_phone: data.phone, consignee_address: data.address, city: data.city,
      city_code: data.cityCode || null, cod_amount: data.cod, weight_kg: data.weightKg, pieces: data.pieces,
      item_summary: data.items, remarks: data.remarks || null, created_by: context.userId,
      history: core.pushHistory([], { status: "created", by: "user" }),
    }).select("*").single();
    if (error) throw new Error(error.message);
    let bookError: string | null = null;
    if (acc.courier === "confirmflow") {
      try {
        const { pushToConfirmFlow } = await import("./courier-booking.server");
        const r = await pushToConfirmFlow(acc.credentials ?? {}, { docNumber: data.docNumber, name: data.name, phone: data.phone, address: data.address, city: data.city, cod: data.cod, weightKg: data.weightKg, pieces: data.pieces, items: data.items, remarks: data.remarks, confirmUrl: "" });
        await a.from("pos_shipments").update({ status: r ? "sent_to_confirmflow" : "awaiting_confirmflow", history: core.pushHistory(row.history, { status: r ? "sent_to_confirmflow" : "awaiting_confirmflow", by: "system" }) }).eq("id", row.id);
      } catch (e) { bookError = e instanceof Error ? e.message : String(e); await a.from("pos_shipments").update({ last_error: bookError }).eq("id", row.id); }
    } else if (!data.requireConfirmation && acc.courier !== "manual") {
      try { await core.bookRow(a, row.id, "user"); } catch (e) { bookError = e instanceof Error ? e.message : String(e); }
    }
    const { data: fresh } = await a.from("pos_shipments").select("*").eq("id", row.id).single();
    return { shipment: fresh, bookError };
  });

const idInput = (d: unknown) => z.object({ id: z.string().uuid() }).parse(d);

async function ownRow(a: any, ws: string, id: string) {
  const { data } = await a.from("pos_shipments").select("*").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!data) throw new Error("Shipment not found");
  return data;
}

export const bookShipmentNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { a, ws } = await guard(context as Ctx, "create_sale");
    await ownRow(a, ws, data.id);
    const { bookRow } = await import("./courier-core.server");
    return { shipment: await bookRow(a, data.id, "user") };
  });

export const trackShipmentNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { a, ws } = await guard(context as Ctx, "view_pos");
    await ownRow(a, ws, data.id);
    const { trackRow } = await import("./courier-core.server");
    return await trackRow(a, data.id);
  });

export const refreshAllTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { a, ws } = await guard(context as Ctx, "view_pos");
    const { data: rows } = await a.from("pos_shipments").select("id, courier").eq("workspace_id", ws).not("tracking_number", "is", null)
      .not("status", "in", "(delivered,returned,cancelled)").in("courier", ["postex", "trax", "leopards"]).limit(40);
    const { trackRow } = await import("./courier-core.server");
    let ok = 0, failed = 0;
    for (const r of rows ?? []) { try { await trackRow(a, r.id); ok++; } catch { failed++; } }
    return { ok, failed };
  });

export const updateShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["confirm", "cancel", "set_tracking", "set_status"]),
    tracking: z.string().trim().max(60).optional(),
    status: z.enum(["booked", "in_transit", "out_for_delivery", "delivered", "returned", "attempted", "cancelled"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { a, ws } = await guard(context as Ctx, "create_sale");
    const s = await ownRow(a, ws, data.id);
    const core = await import("./courier-core.server");
    if (data.action === "confirm" || data.action === "cancel") {
      await core.applyConfirmation(a, s, data.action === "confirm" ? "confirmed" : "cancelled", "staff");
    } else if (data.action === "set_tracking") {
      if (!data.tracking) throw new Error("Enter a tracking number");
      await a.from("pos_shipments").update({ tracking_number: data.tracking, status: "booked", booked_at: new Date().toISOString(), last_error: null, history: core.pushHistory(s.history, { status: "booked", note: `Tracking ${data.tracking}`, by: "staff" }), updated_at: new Date().toISOString() }).eq("id", s.id);
    } else if (data.status) {
      await a.from("pos_shipments").update({ status: data.status, history: core.pushHistory(s.history, { status: data.status, by: "staff" }), updated_at: new Date().toISOString() }).eq("id", s.id);
    }
    return { ok: true };
  });

/* ---------- Public customer confirmation page ---------- */

const tokenInput = (d: unknown) => z.object({ token: z.string().regex(/^[a-f0-9]{48,80}$/) }).parse(d);

export const getConfirmInfo = createServerFn({ method: "GET" })
  .inputValidator(tokenInput)
  .handler(async ({ data }) => {
    const { admin } = await import("./courier-core.server");
    const a = await admin();
    const { data: s } = await a.from("pos_shipments").select("doc_number, item_summary, cod_amount, city, confirmation, consignee_name, workspace_id").eq("confirm_token", data.token).maybeSingle();
    if (!s) return null;
    const { data: st } = await a.from("pos_settings").select("config").eq("workspace_id", s.workspace_id).maybeSingle();
    const business = (st as any)?.config?.business?.name || "Our store";
    return { business: String(business), doc: s.doc_number, items: s.item_summary, cod: Number(s.cod_amount), city: s.city, firstName: String(s.consignee_name).split(" ")[0] ?? "", confirmation: s.confirmation };
  });

export const submitConfirmation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[a-f0-9]{48,80}$/), decision: z.enum(["confirmed", "cancelled"]) }).parse(d))
  .handler(async ({ data }) => {
    const core = await import("./courier-core.server");
    const a = await core.admin();
    const { data: s } = await a.from("pos_shipments").select("*").eq("confirm_token", data.token).maybeSingle();
    if (!s) throw new Error("Link is not valid");
    if (s.confirmation !== "pending") return { confirmation: s.confirmation as string };
    await core.applyConfirmation(a, s, data.decision, "customer");
    return { confirmation: data.decision as string };
  });
