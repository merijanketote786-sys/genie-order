/** Courier API adapters (server-only). Each returns a normalized booking / tracking result. */

export type CourierId = "postex" | "trax" | "leopards" | "manual" | "confirmflow";

export interface ShipmentInput {
  docNumber: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  cityCode?: string | null;
  cod: number;
  weightKg: number;
  pieces: number;
  items: string;
  remarks?: string | null;
}

export interface BookResult { tracking: string; raw: unknown }
export interface TrackResult { status: string; detail: string; raw: unknown }

type Creds = Record<string, string | undefined>;

async function call(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) throw new Error(`Courier responded ${res.status}: ${String(text).slice(0, 300)}`);
  return body;
}

function need(c: Creds, ...keys: string[]) {
  for (const k of keys) if (!c[k]) throw new Error(`Courier account is missing "${k}". Add it in Courier Settings.`);
}

/** Map any courier wording to our simple status set. */
export function normalizeStatus(s: string): string {
  const t = s.toLowerCase();
  if (/deliver(ed)?\b|delivered to|successfully delivered/.test(t) && !/undeliver|not deliver/.test(t)) return "delivered";
  if (/return|rto|refused/.test(t)) return "returned";
  if (/cancel/.test(t)) return "cancelled";
  if (/out for delivery/.test(t)) return "out_for_delivery";
  if (/transit|arriv|dispatch|depart|hub|picked|en.?route/.test(t)) return "in_transit";
  if (/book|unbooked|created|pending|awaiting/.test(t)) return "booked";
  if (/fail|attempt|undeliver/.test(t)) return "attempted";
  return "in_transit";
}

export async function bookShipment(courier: CourierId, c: Creds, s: ShipmentInput): Promise<BookResult> {
  if (courier === "postex") {
    need(c, "token");
    const body = {
      orderRefNumber: s.docNumber,
      invoicePayment: s.cod,
      orderDetail: s.items.slice(0, 250),
      customerName: s.name,
      customerPhone: s.phone,
      deliveryAddress: s.address,
      cityName: s.city,
      invoiceDivision: 1,
      items: s.pieces,
      orderType: "Normal",
      transactionNotes: s.remarks ?? "",
      ...(c.pickupAddressCode ? { pickupAddressCode: c.pickupAddressCode } : {}),
    };
    const r = await call("https://api.postex.pk/services/integration/api/order/v3/create-order", {
      method: "POST", headers: { token: c.token!, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const tn = r?.dist?.trackingNumber;
    if (!tn) throw new Error(r?.statusMessage || "PostEx did not return a tracking number");
    return { tracking: String(tn), raw: r };
  }
  if (courier === "trax") {
    need(c, "apiKey", "pickupAddressId");
    if (!s.cityCode) throw new Error("Trax needs the destination city ID (enter it in the City code box).");
    const body = {
      service_type_id: 1, pickup_address_id: Number(c.pickupAddressId), information_display: 1,
      consignee_city_id: Number(s.cityCode), consignee_name: s.name, consignee_address: s.address,
      consignee_phone_number_1: s.phone, consignee_email_address: c.email || "orders@example.invalid",
      order_id: s.docNumber, item_product_type_id: 1, item_description: s.items.slice(0, 250),
      item_quantity: s.pieces, item_insurance: 0, pickup_date: new Date().toISOString().slice(0, 10),
      special_instructions: s.remarks || "-", estimated_weight: s.weightKg, shipping_mode_id: 1,
      amount: s.cod, payment_mode_id: 1, charges_mode_id: 4,
    };
    const r = await call("https://sonic.pk/api/shipment/book", {
      method: "POST", headers: { Authorization: c.apiKey!, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const tn = r?.tracking_number;
    if (!tn) throw new Error(r?.message || "Trax did not return a tracking number");
    return { tracking: String(tn), raw: r };
  }
  if (courier === "leopards") {
    need(c, "apiKey", "apiPassword");
    if (!s.cityCode) throw new Error("Leopards needs the destination city ID (enter it in the City code box).");
    const body = {
      api_key: c.apiKey, api_password: c.apiPassword,
      booked_packet_weight: Math.max(1, Math.round(s.weightKg * 1000)), booked_packet_no_piece: s.pieces,
      booked_packet_collect_amount: s.cod, booked_packet_order_id: s.docNumber,
      origin_city: c.originCity || "self", destination_city: s.cityCode,
      shipment_name_eng: "self", shipment_email: "self", shipment_phone: "self", shipment_address: "self",
      consignment_name_eng: s.name, consignment_phone: s.phone, consignment_address: s.address,
      special_instructions: s.remarks || s.items.slice(0, 200) || "-",
    };
    const r = await call("https://merchantapi.leopardscourier.com/api/bookPacket/format/json/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (Number(r?.status) !== 1 || !r?.track_number) throw new Error(r?.error || "Leopards booking failed");
    return { tracking: String(r.track_number), raw: r };
  }
  throw new Error("This courier is booked manually — enter the tracking number by hand.");
}

export async function trackShipment(courier: CourierId, c: Creds, tracking: string): Promise<TrackResult> {
  if (courier === "postex") {
    need(c, "token");
    const r = await call(`https://api.postex.pk/services/integration/api/order/v1/track-order/${encodeURIComponent(tracking)}`, { headers: { token: c.token! } });
    const st = String(r?.dist?.transactionStatus ?? r?.dist?.transactionStatusHistory?.at?.(-1)?.transactionStatusMessage ?? "");
    return { status: normalizeStatus(st), detail: st, raw: r };
  }
  if (courier === "trax") {
    need(c, "apiKey");
    const r = await call(`https://sonic.pk/api/shipment/track?tracking_number=${encodeURIComponent(tracking)}&type=0`, { headers: { Authorization: c.apiKey! } });
    const list = r?.details?.tracking_history ?? [];
    const st = String(list[0]?.status ?? r?.details?.status ?? "");
    return { status: normalizeStatus(st), detail: st, raw: r };
  }
  if (courier === "leopards") {
    need(c, "apiKey", "apiPassword");
    const r = await call("https://merchantapi.leopardscourier.com/api/trackBookedPacket/format/json/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: c.apiKey, api_password: c.apiPassword, track_numbers: tracking }),
    });
    const st = String(r?.packet_list?.[0]?.booked_packet_status ?? "");
    return { status: normalizeStatus(st), detail: st, raw: r };
  }
  throw new Error("Live tracking is not available for this courier.");
}

/** Optional: push the order to ConfirmFlow (endpoint provided by their developer). */
export async function pushToConfirmFlow(c: Creds, s: ShipmentInput & { confirmUrl: string }) {
  if (!c.outboundUrl) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (c.apiKey) headers["Authorization"] = `Bearer ${c.apiKey}`;
  return call(c.outboundUrl, {
    method: "POST", headers,
    body: JSON.stringify({
      order_ref: s.docNumber, customer_name: s.name, customer_phone: s.phone, address: s.address,
      city: s.city, cod_amount: s.cod, weight_kg: s.weightKg, pieces: s.pieces, items: s.items, remarks: s.remarks ?? "",
    }),
  });
}

export async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
