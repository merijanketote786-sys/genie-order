/** Shared shipment logic used by authenticated server functions and public webhook/confirm routes. */
import { bookShipment, trackShipment, type CourierId } from "./courier-booking.server";

type Admin = any;

export async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function pushHistory(history: unknown, entry: { status: string; note?: string; by?: string }) {
  const list = Array.isArray(history) ? history : [];
  return [...list, { ...entry, at: new Date().toISOString() }].slice(-60);
}

/** Books a shipment with its courier account. Safe to call again: already-booked rows are left alone. */
export async function bookRow(sb: Admin, shipmentId: string, by = "system") {
  const { data: s } = await sb.from("pos_shipments").select("*").eq("id", shipmentId).maybeSingle();
  if (!s) throw new Error("Shipment not found");
  if (s.tracking_number) return s;
  if (s.confirmation === "cancelled") throw new Error("Customer cancelled this order");
  const { data: acc } = s.account_id ? await sb.from("pos_courier_accounts").select("*").eq("id", s.account_id).eq("workspace_id", s.workspace_id).maybeSingle() : { data: null };
  if (!acc) throw new Error("Courier account not found");
  try {
    const r = await bookShipment(acc.courier as CourierId, acc.credentials ?? {}, {
      docNumber: s.doc_number, name: s.consignee_name, phone: s.consignee_phone, address: s.consignee_address,
      city: s.city, cityCode: s.city_code, cod: Number(s.cod_amount), weightKg: Number(s.weight_kg),
      pieces: Number(s.pieces), items: s.item_summary, remarks: s.remarks,
    });
    const { data: up, error } = await sb.from("pos_shipments").update({
      tracking_number: r.tracking, status: "booked", booked_at: new Date().toISOString(), last_error: null,
      history: pushHistory(s.history, { status: "booked", note: `Tracking ${r.tracking}`, by }), updated_at: new Date().toISOString(),
    }).eq("id", s.id).select("*").single();
    if (error) throw new Error(error.message);
    return up;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("pos_shipments").update({ status: "booking_failed", last_error: msg.slice(0, 500), history: pushHistory(s.history, { status: "booking_failed", note: msg.slice(0, 200), by }), updated_at: new Date().toISOString() }).eq("id", s.id);
    throw new Error(msg);
  }
}

export async function trackRow(sb: Admin, shipmentId: string) {
  const { data: s } = await sb.from("pos_shipments").select("*").eq("id", shipmentId).maybeSingle();
  if (!s?.tracking_number) throw new Error("Not booked yet");
  const { data: acc } = await sb.from("pos_courier_accounts").select("*").eq("id", s.account_id).maybeSingle();
  if (!acc) throw new Error("Courier account not found");
  const r = await trackShipment(acc.courier as CourierId, acc.credentials ?? {}, s.tracking_number);
  if (r.status !== s.status) {
    await sb.from("pos_shipments").update({ status: r.status, history: pushHistory(s.history, { status: r.status, note: r.detail, by: acc.courier }), updated_at: new Date().toISOString() }).eq("id", s.id);
  }
  return { status: r.status, detail: r.detail };
}

/** Customer (or ConfirmFlow) confirmed / cancelled. Auto-books when the account allows it. */
export async function applyConfirmation(sb: Admin, s: any, decision: "confirmed" | "cancelled", by: string) {
  if (s.confirmation === decision) return s;
  if (s.tracking_number && decision === "cancelled") {
    await sb.from("pos_shipments").update({ history: pushHistory(s.history, { status: "cancel_requested", note: "Customer asked to cancel after booking", by }) }).eq("id", s.id);
    return s;
  }
  await sb.from("pos_shipments").update({
    confirmation: decision, status: decision === "cancelled" ? "cancelled" : "confirmed",
    history: pushHistory(s.history, { status: decision, by }), updated_at: new Date().toISOString(),
  }).eq("id", s.id);
  if (decision === "confirmed" && s.account_id) {
    const { data: acc } = await sb.from("pos_courier_accounts").select("courier, settings").eq("id", s.account_id).maybeSingle();
    if (acc && acc.courier !== "manual" && acc.courier !== "confirmflow" && acc.settings?.autoBookOnConfirm) {
      try { await bookRow(sb, s.id, "auto"); } catch { /* error saved on the row */ }
    }
  }
  return s;
}
