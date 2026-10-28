import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Settings2, Send, Search, Copy, Trash2, KeyRound, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PosSubnav, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePosAccess } from "@/components/pos-access";
import {
  bookShipmentNow, deleteCourierAccount, listCourierAccounts, listShipments, refreshAllTracking,
  rotateWebhookToken, saveCourierAccount, trackShipmentNow, updateShipment,
} from "@/lib/courier.functions";
import { COURIER_FIELDS, COURIER_NAMES, STATUS_LABEL, confirmMessage } from "@/lib/courier-ui";

export const Route = createFileRoute("/_authenticated/shipments")({
  head: () => ({ meta: [
    { title: "Shipments & Courier Booking — HBPOS" },
    { name: "description", content: "Book PostEx, Trax and Leopards parcels, confirm COD orders and track deliveries." },
    { property: "og:title", content: "Shipments & Courier Booking — HBPOS" },
    { property: "og:description", content: "Courier booking, order confirmation and tracking inside the POS." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ShipmentsPage,
});

const FILTERS = ["all", "pending", "booked", "in_transit", "delivered", "returned", "cancelled", "booking_failed"];

function ShipmentsPage() {
  const { cfg } = usePosAccess();
  const business = cfg.business.name || "HBPOS";
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState(false);
  const [tracking, setTracking] = useState<{ id: string; value: string } | null>(null);
  const list = useServerFn(listShipments);
  const book = useServerFn(bookShipmentNow);
  const track = useServerFn(trackShipmentNow);
  const refreshAll = useServerFn(refreshAllTracking);
  const update = useServerFn(updateShipment);
  const accList = useServerFn(listCourierAccounts);
  const accQ = useQuery({ queryKey: ["courier-accounts"], queryFn: () => accList() });
  const q = useQuery({ queryKey: ["shipments", status, search], queryFn: () => list({ data: { status, search: search || undefined } }) });
  const rows = (q.data?.shipments ?? []) as any[];
  const refresh = () => qc.invalidateQueries({ queryKey: ["shipments"] });

  async function run(p: Promise<unknown>, ok: string) {
    try { await p; toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { refresh(); }
  }

  const counts = rows.reduce((m: Record<string, number>, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {});
  const codPending = rows.filter((r) => !["delivered", "returned", "cancelled"].includes(r.status)).reduce((s, r) => s + Number(r.cod_amount), 0);

  return (
    <AppShell title="Shipments" subtitle="Courier booking, confirmation & tracking" active="/pos" wide>
      <div className="space-y-4">
        <PosSubnav />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search invoice, name, phone, tracking" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <Button variant="outline" onClick={() => void run(refreshAll(), "Tracking refreshed")}><RefreshCw className="size-4" /> Refresh tracking</Button>
          {accQ.data?.isAdmin ? <Button variant="secondary" onClick={() => setSettings(true)}><Settings2 className="size-4" /> Courier Settings</Button> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Shipments" value={String(rows.length)} />
          <Stat label="Awaiting confirmation" value={String(rows.filter((r) => r.confirmation === "pending").length)} />
          <Stat label="Delivered" value={String(counts["delivered"] ?? 0)} />
          <Stat label="COD in transit" value={rs(codPending)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => <button key={f} onClick={() => setStatus(f)} className={`rounded-full border px-3 py-1 text-xs ${status === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{f === "all" ? "All" : f === "pending" ? "Awaiting confirmation" : STATUS_LABEL[f]}</button>)}
        </div>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No shipments yet. Open <b>Invoices</b> → ⋮ → <b>Book courier</b> on any invoice.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const link = `${typeof window !== "undefined" ? window.location.origin : ""}/confirm/${r.confirm_token}`;
              const canBook = !r.tracking_number && !["manual", "confirmflow"].includes(r.courier) && r.confirmation !== "cancelled" && r.confirmation !== "pending";
              return (
                <div key={r.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{r.doc_number}</b>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{COURIER_NAMES[r.courier] ?? r.courier}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "delivered" ? "bg-primary/15" : ["booking_failed", "returned", "cancelled"].includes(r.status) ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    {r.tracking_number ? <span className="font-mono text-xs">#{r.tracking_number}</span> : null}
                    <span className="ml-auto text-sm font-semibold">COD {rs(Number(r.cod_amount))}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{r.consignee_name} · {r.consignee_phone} · {r.city} — {r.consignee_address}</div>
                  {r.last_error ? <div className="mt-1 text-xs text-destructive">{r.last_error}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.confirmation === "pending" ? <>
                      <Button size="sm" variant="outline" onClick={() => { const d = r.consignee_phone.replace(/\D/g, "").replace(/^0/, "92"); window.open(`https://wa.me/${d}?text=${encodeURIComponent(confirmMessage(business, r.doc_number, r.consignee_name, Number(r.cod_amount), link))}`, "_blank"); }}><MessageCircle className="size-4" /> Resend confirm</Button>
                      <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copied"); }}><Copy className="size-4" /> Copy link</Button>
                      <Button size="sm" onClick={() => void run(update({ data: { id: r.id, action: "confirm" } }), "Marked confirmed")}>Mark confirmed</Button>
                      <Button size="sm" variant="outline" onClick={() => void run(update({ data: { id: r.id, action: "cancel" } }), "Marked cancelled")}>Mark cancelled</Button>
                    </> : null}
                    {canBook ? <Button size="sm" onClick={() => void run(book({ data: { id: r.id } }), "Booked")}><Send className="size-4" /> Book now</Button> : null}
                    {!r.tracking_number && r.confirmation !== "cancelled" ? <Button size="sm" variant="outline" onClick={() => setTracking({ id: r.id, value: "" })}>Enter tracking no.</Button> : null}
                    {r.tracking_number && ["postex", "trax", "leopards"].includes(r.courier) ? <Button size="sm" variant="outline" onClick={() => void run(track({ data: { id: r.id } }), "Status updated")}><RefreshCw className="size-4" /> Track</Button> : null}
                    {r.tracking_number ? (
                      <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value="" onChange={(e) => e.target.value && void run(update({ data: { id: r.id, action: "set_status", status: e.target.value as any } }), "Status updated")}>
                        <option value="">Set status…</option>
                        {["in_transit", "out_for_delivery", "delivered", "returned", "attempted", "cancelled"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    ) : null}
                  </div>
                  {Array.isArray(r.history) && r.history.length ? (
                    <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">History ({r.history.length})</summary>
                      <ul className="mt-1 space-y-0.5">{[...r.history].reverse().map((h: any, i: number) => <li key={i}>{new Date(h.at).toLocaleString("en-GB")} — {STATUS_LABEL[h.status] ?? h.status}{h.note ? ` · ${h.note}` : ""}{h.by ? ` (${h.by})` : ""}</li>)}</ul>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {tracking ? (
        <Dialog open onOpenChange={(o) => !o && setTracking(null)}>
          <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Enter tracking number</DialogTitle><DialogDescription>For parcels booked on the courier's own portal.</DialogDescription></DialogHeader>
            <Input autoFocus value={tracking.value} onChange={(e) => setTracking({ ...tracking, value: e.target.value })} />
            <Button disabled={!tracking.value.trim()} onClick={() => { const t = tracking; setTracking(null); void run(update({ data: { id: t.id, action: "set_tracking", tracking: t.value } }), "Tracking saved"); }}>Save</Button>
          </DialogContent>
        </Dialog>
      ) : null}
      {settings ? <CourierSettings onClose={() => setSettings(false)} /> : null}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold">{value}</div></div>;
}

type Acc = Awaited<ReturnType<typeof listCourierAccounts>>["accounts"][number];

function CourierSettings({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listCourierAccounts);
  const save = useServerFn(saveCourierAccount);
  const del = useServerFn(deleteCourierAccount);
  const rotate = useServerFn(rotateWebhookToken);
  const q = useQuery({ queryKey: ["courier-accounts"], queryFn: () => list() });
  const [edit, setEdit] = useState<Partial<Acc> & { courier: string } | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: ["courier-accounts"] });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function submit() {
    if (!edit) return;
    try {
      await save({ data: {
        id: edit.id, courier: edit.courier as any, label: edit.label || COURIER_NAMES[edit.courier] || edit.courier,
        credentials: (edit.credentials ?? {}) as Record<string, string>,
        settings: { autoBookOnConfirm: !!edit.settings?.["autoBookOnConfirm"], requireConfirmation: edit.settings?.["requireConfirmation"] !== false },
        isActive: edit.isActive ?? true, isDefault: !!edit.isDefault,
      } });
      toast.success("Courier account saved"); setEdit(null); reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Courier Settings</DialogTitle><DialogDescription>Connect your courier accounts. Keys are stored securely and only admins can see this.</DialogDescription></DialogHeader>
        {!edit ? (
          <div className="space-y-2">
            {(q.data?.accounts ?? []).map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center gap-2"><b>{a.label}</b><span className="text-xs text-muted-foreground">{COURIER_NAMES[a.courier]}</span>{a.isDefault ? <span className="rounded bg-primary/15 px-1.5 text-xs">Default</span> : null}{!a.isActive ? <span className="text-xs text-destructive">Off</span> : null}
                  <div className="ml-auto flex gap-1"><Button size="sm" variant="outline" onClick={() => setEdit({ ...a })}>Edit</Button><Button size="sm" variant="outline" aria-label="Delete" onClick={() => void del({ data: { id: a.id } }).then(reload)}><Trash2 className="size-4" /></Button></div>
                </div>
                {a.courier === "confirmflow" && a.webhookToken ? (
                  <div className="mt-2 space-y-1 rounded bg-muted p-2 text-xs">
                    <div>Webhook URL — give this to the ConfirmFlow developer:</div>
                    <div className="flex items-center gap-1"><code className="flex-1 break-all">{origin}/api/public/confirmflow/{a.webhookToken}</code>
                      <Button size="sm" variant="outline" aria-label="Copy webhook URL" onClick={() => { void navigator.clipboard.writeText(`${origin}/api/public/confirmflow/${a.webhookToken}`); toast.success("Copied"); }}><Copy className="size-3" /></Button>
                      <Button size="sm" variant="outline" aria-label="New webhook URL" title="Generate new URL" onClick={() => void rotate({ data: { id: a.id } }).then(reload)}><KeyRound className="size-3" /></Button></div>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
              {Object.keys(COURIER_NAMES).map((c) => <Button key={c} variant="outline" size="sm" onClick={() => setEdit({ courier: c, label: COURIER_NAMES[c], credentials: {}, settings: { requireConfirmation: true }, isActive: true })}>+ {COURIER_NAMES[c]}</Button>)}
            </div>
            <ConfirmFlowDocs />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={edit.label ?? ""} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></div>
            {(COURIER_FIELDS[edit.courier] ?? []).map((fd) => (
              <div key={fd.key} className="space-y-1"><Label className="text-xs">{fd.label}</Label>
                <Input type={fd.secret ? "password" : "text"} value={(edit.credentials as any)?.[fd.key] ?? ""} onChange={(e) => setEdit({ ...edit, credentials: { ...(edit.credentials ?? {}), [fd.key]: e.target.value } })} />
                {fd.help ? <p className="text-xs text-muted-foreground">{fd.help}</p> : null}
              </div>
            ))}
            {edit.courier !== "confirmflow" ? <>
              <Toggle label="Ask customer to confirm before booking (default)" checked={edit.settings?.["requireConfirmation"] !== false} onChange={(v) => setEdit({ ...edit, settings: { ...(edit.settings ?? {}), requireConfirmation: v } })} />
              {edit.courier !== "manual" ? <Toggle label="Book automatically when customer confirms" checked={!!edit.settings?.["autoBookOnConfirm"]} onChange={(v) => setEdit({ ...edit, settings: { ...(edit.settings ?? {}), autoBookOnConfirm: v } })} /> : null}
            </> : null}
            <Toggle label="Default courier" checked={!!edit.isDefault} onChange={(v) => setEdit({ ...edit, isDefault: v })} />
            <Toggle label="Active" checked={edit.isActive ?? true} onChange={(v) => setEdit({ ...edit, isActive: v })} />
            <div className="flex gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Back</Button><Button className="flex-1" onClick={() => void submit()}>Save</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm"><span>{label}</span><Switch checked={checked} onCheckedChange={onChange} /></label>;
}

function ConfirmFlowDocs() {
  return (
    <details className="rounded-lg border border-border p-3 text-xs">
      <summary className="cursor-pointer font-medium">ConfirmFlow developer documentation</summary>
      <div className="mt-2 space-y-2">
        <p><b>1. Webhook (ConfirmFlow → HB POS):</b> POST JSON to the Webhook URL above. Fields (any of these names work):</p>
        <pre className="overflow-x-auto rounded bg-muted p-2">{`{
  "order_ref": "INV-00054",        // HB POS invoice number (required)
  "status": "confirmed",           // confirmed | cancelled | booked | in_transit | delivered | returned
  "tracking_number": "CN123456",   // optional
  "courier": "PostEx"              // optional
}`}</pre>
        <p>Optional security: if a Webhook secret is saved, send header <code>X-Signature</code> = hex HMAC-SHA256(secret, raw body). Reply is <code>{`{"ok":true}`}</code>.</p>
        <p><b>2. Order push (HB POS → ConfirmFlow):</b> if an "order API URL" is saved, every new ConfirmFlow shipment is POSTed there with header <code>Authorization: Bearer &lt;API key&gt;</code>:</p>
        <pre className="overflow-x-auto rounded bg-muted p-2">{`{ "order_ref", "customer_name", "customer_phone", "address",
  "city", "cod_amount", "weight_kg", "pieces", "items", "remarks" }`}</pre>
      </div>
    </details>
  );
}
