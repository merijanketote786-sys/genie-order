import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createShipment, listCourierAccounts } from "@/lib/courier.functions";
import { confirmMessage, COURIER_NAMES } from "@/lib/courier-ui";

export interface BookSource {
  saleId: string | null;
  docNumber: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  cod: number;
  items: string;
}

export function CourierBookingDialog({ source, business, onClose }: { source: BookSource; business: string; onClose: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listCourierAccounts);
  const create = useServerFn(createShipment);
  const accQ = useQuery({ queryKey: ["courier-accounts"], queryFn: () => list() });
  const accounts = (accQ.data?.accounts ?? []).filter((a) => a.isActive);
  const [f, setF] = useState({ ...source, cityCode: "", weightKg: "0.5", pieces: "1", remarks: "", accountId: "", requireConfirmation: true });
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);
  const acc = accounts.find((a) => a.id === f.accountId);

  useEffect(() => {
    if (!f.accountId && accounts.length) {
      const d = accounts.find((a) => a.isDefault) ?? accounts[0]!;
      setF((p) => ({ ...p, accountId: d.id, requireConfirmation: d.courier === "confirmflow" ? false : d.settings["requireConfirmation"] !== false }));
    }
  }, [accounts, f.accountId]);

  async function submit() {
    if (!acc) return toast.error("Add a courier account first (Courier Settings)");
    setBusy(true);
    try {
      const r = await create({ data: {
        saleId: f.saleId, docNumber: f.docNumber, accountId: acc.id, name: f.name, phone: f.phone, address: f.address,
        city: f.city, cityCode: f.cityCode || undefined, cod: Number(f.cod) || 0, weightKg: Number(f.weightKg) || 0.5,
        pieces: Math.max(1, Math.round(Number(f.pieces) || 1)), items: f.items, remarks: f.remarks || undefined,
        requireConfirmation: acc.courier === "confirmflow" ? false : f.requireConfirmation,
      } });
      qc.invalidateQueries({ queryKey: ["shipments"] });
      const s: any = r.shipment;
      if (r.bookError) toast.error(`Saved, but booking failed: ${r.bookError}`);
      else if (s?.tracking_number) toast.success(`Booked — tracking ${s.tracking_number}`);
      else toast.success("Shipment saved");
      if (s?.confirmation === "pending") {
        const link = `${window.location.origin}/confirm/${s.confirm_token}`;
        const digits = f.phone.replace(/\D/g, "").replace(/^0/, "92");
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(confirmMessage(business, f.docNumber, f.name, Number(f.cod) || 0, link))}`, "_blank");
      }
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  }

  const field = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1"><Label className="text-xs">{label}</Label><Input value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value)} {...props} /></div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Book courier — {source.docNumber}</DialogTitle><DialogDescription>Send this order to a courier, with optional customer confirmation first.</DialogDescription></DialogHeader>
        {accQ.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : accounts.length === 0 ? (
          <p className="rounded-lg bg-muted p-3 text-sm">No courier account yet. Open <b>Shipments → Courier Settings</b> and add PostEx, Trax, Leopards, Manual or ConfirmFlow.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Courier account</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.accountId} onChange={(e) => set("accountId", e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({COURIER_NAMES[a.courier] ?? a.courier})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">{field("name", "Customer name")}{field("phone", "Phone", { inputMode: "tel" })}</div>
            {field("address", "Address")}
            <div className="grid grid-cols-2 gap-2">{field("city", "City")}{acc && (acc.courier === "trax" || acc.courier === "leopards") ? field("cityCode", "City code (courier ID)") : <div />}</div>
            <div className="grid grid-cols-3 gap-2">{field("cod", "COD amount", { inputMode: "decimal" })}{field("weightKg", "Weight (kg)", { inputMode: "decimal" })}{field("pieces", "Pieces", { inputMode: "numeric" })}</div>
            <div className="space-y-1"><Label className="text-xs">Items</Label><textarea className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm" value={f.items} onChange={(e) => set("items", e.target.value)} maxLength={600} /></div>
            {field("remarks", "Remarks (optional)")}
            {acc && acc.courier !== "confirmflow" ? (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <span><b>Ask customer to confirm first</b><br /><span className="text-muted-foreground">Sends a WhatsApp confirm/cancel link; booking happens after they confirm.</span></span>
                <Switch checked={f.requireConfirmation} onCheckedChange={(v) => set("requireConfirmation", v)} />
              </label>
            ) : acc ? <p className="rounded-lg bg-muted p-3 text-xs">ConfirmFlow will confirm with the customer and send back status and tracking automatically.</p> : null}
            <Button className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : f.requireConfirmation && acc?.courier !== "confirmflow" ? "Save & send confirmation" : acc?.courier === "manual" ? "Save shipment" : "Book now"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
