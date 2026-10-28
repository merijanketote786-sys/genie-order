import { createFileRoute } from "@tanstack/react-router";

/**
 * ConfirmFlow webhook receiver.
 * URL: /api/public/confirmflow/<token>  (token shown in Courier Settings)
 * Optional: if a "Webhook secret" is saved, the request must carry header
 * X-Signature = hex HMAC-SHA256(secret, raw body).
 */
export const Route = createFileRoute("/api/public/confirmflow/$token")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "HB POS ConfirmFlow webhook" }),
      POST: async ({ request, params }) => {
        const token = String(params.token ?? "");
        if (!/^[a-f0-9]{32,80}$/.test(token)) return new Response("Not found", { status: 404 });
        const raw = await request.text();
        if (raw.length > 256_000) return new Response("Too large", { status: 413 });

        const core = await import("@/lib/courier-core.server");
        const { hmacHex, safeEqual, normalizeStatus } = await import("@/lib/courier-booking.server");
        const a = await core.admin();
        const { data: acc } = await a.from("pos_courier_accounts").select("*").eq("webhook_token", token).eq("courier", "confirmflow").maybeSingle();
        if (!acc || !acc.is_active) return new Response("Not found", { status: 404 });

        const secret = acc.credentials?.webhookSecret as string | undefined;
        if (secret) {
          const sig = (request.headers.get("x-signature") ?? request.headers.get("x-confirmflow-signature") ?? "").replace(/^sha256=/, "").toLowerCase();
          if (!sig || !safeEqual(sig, await hmacHex(secret, raw))) return new Response("Invalid signature", { status: 401 });
        }

        let body: any;
        try { body = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
        const p = body?.data && typeof body.data === "object" ? { ...body, ...body.data } : body;

        const { data: ev, error: evErr } = await a.from("pos_courier_events").insert({ workspace_id: acc.workspace_id, source: "confirmflow", payload: body }).select("id").single();
        if (evErr) return new Response("Storage error", { status: 500 });

        const ref = String(p.order_ref ?? p.order_id ?? p.orderRef ?? p.reference ?? p.invoice_no ?? p.order_number ?? "").trim();
        if (!ref) { await a.from("pos_courier_events").update({ result: "no order reference" }).eq("id", ev.id); return Response.json({ ok: true, matched: false }); }

        const { data: s } = await a.from("pos_shipments").select("*").eq("workspace_id", acc.workspace_id).eq("doc_number", ref).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!s) { await a.from("pos_courier_events").update({ result: `order ${ref} not found` }).eq("id", ev.id); return Response.json({ ok: true, matched: false }); }

        const statusText = String(p.status ?? p.event ?? p.order_status ?? "").toLowerCase();
        const tracking = String(p.tracking_number ?? p.trackingNumber ?? p.cn ?? p.consignment_no ?? "").trim();
        const notes: string[] = [];

        if (/confirm/.test(statusText) && !/unconfirm/.test(statusText)) { await core.applyConfirmation(a, s, "confirmed", "confirmflow"); notes.push("confirmed"); }
        else if (/cancel|reject|declin/.test(statusText) && !tracking) { await core.applyConfirmation(a, s, "cancelled", "confirmflow"); notes.push("cancelled"); }

        const { data: cur } = await a.from("pos_shipments").select("*").eq("id", s.id).single();
        const patch: Record<string, unknown> = {};
        if (tracking && tracking !== cur.tracking_number) { patch["tracking_number"] = tracking; patch["booked_at"] = new Date().toISOString(); patch["status"] = "booked"; notes.push(`tracking ${tracking}`); }
        if (statusText && !/confirm|cancel|reject|declin/.test(statusText)) { patch["status"] = normalizeStatus(statusText); notes.push(String(patch["status"])); }
        const courierName = String(p.courier ?? p.courier_name ?? "").trim();
        if (Object.keys(patch).length) {
          patch["history"] = core.pushHistory(cur.history, { status: String(patch["status"] ?? cur.status), note: [courierName, tracking].filter(Boolean).join(" ") || statusText, by: "confirmflow" });
          patch["updated_at"] = new Date().toISOString();
          await a.from("pos_shipments").update(patch).eq("id", s.id);
        }
        await a.from("pos_courier_events").update({ shipment_id: s.id, result: notes.join(", ") || "stored" }).eq("id", ev.id);
        return Response.json({ ok: true, matched: true });
      },
    },
  },
});
