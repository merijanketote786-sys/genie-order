import { useState } from "react";
import { Download, Pencil, Printer, Share2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PrintDoc } from "@/lib/print/render";

/** Turns any invoice/estimate doc into a delivery challan: quantities only, no prices/totals. */
export function toChallan(doc: PrintDoc): PrintDoc {
  return {
    ...doc,
    kind: "pos",
    title: "Delivery Challan",
    number: doc.number.startsWith("DC-") ? doc.number : `DC-${doc.number}`,
    party: { label: "Deliver To", name: doc.party?.name, phone: doc.party?.phone, address: doc.party?.address },
    lines: (doc.lines ?? []).map((l) => ({ ...l, rate: 0, discount: 0, taxPct: 0, total: 0 })),
    totals: [], payments: [], paid: 0, balance: 0, customFields: undefined,
  };
}

const inp = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";

export function ChallanDialog({ doc, onClose, onPrint, onPdf }: { doc: PrintDoc; onClose: () => void; onPrint: (d: PrintDoc) => void; onPdf: (d: PrintDoc) => void }) {
  const [d, setD] = useState<PrintDoc>(doc);
  const [editing, setEditing] = useState(false);
  const setParty = (k: "name" | "phone" | "address", v: string) => setD((x) => ({ ...x, party: { label: "Deliver To", ...x.party, [k]: v } }));
  const text = () => [
    `*Delivery Challan ${d.number}*`,
    new Date(d.date).toLocaleDateString("en-PK"),
    d.party?.name ? `Deliver to: ${d.party.name}` : "",
    d.party?.phone ? `Phone: ${d.party.phone}` : "",
    d.party?.address ? `Address: ${d.party.address}` : "",
    ...(d.meta ?? []).map(([k, v]) => `${k}: ${v}`),
    "",
    ...(d.lines ?? []).map((l, i) => `${i + 1}. ${l.name} ${l.unit ?? ""} x ${l.qty}`),
    d.notes ? `\nNote: ${d.notes}` : "",
  ].filter((l) => l !== "").join("\n");
  const share = async () => {
    const t = text();
    if (navigator.share) { try { await navigator.share({ title: `Delivery Challan ${d.number}`, text: t }); return; } catch { /* cancelled */ } }
    const ph = (d.party?.phone ?? "").replace(/\D/g, "").replace(/^0/, "92");
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(t)}`, "_blank");
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Delivery Challan {d.number}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {editing ? (
            <div className="grid gap-2">
              <input className={inp} value={d.number} onChange={(e) => setD((x) => ({ ...x, number: e.target.value }))} aria-label="Challan number" placeholder="Challan number" />
              <input className={inp} value={d.party?.name ?? ""} onChange={(e) => setParty("name", e.target.value)} placeholder="Deliver to" aria-label="Deliver to" />
              <input className={inp} value={d.party?.phone ?? ""} onChange={(e) => setParty("phone", e.target.value)} placeholder="Phone" aria-label="Phone" />
              <input className={inp} value={d.party?.address ?? ""} onChange={(e) => setParty("address", e.target.value)} placeholder="Address" aria-label="Address" />
            </div>
          ) : (
            <div className="rounded-lg border border-border p-2">
              <p className="font-semibold text-foreground">{d.party?.name || "Walk-in"}</p>
              {d.party?.phone ? <p className="text-muted-foreground">{d.party.phone}</p> : null}
              {d.party?.address ? <p className="text-muted-foreground">{d.party.address}</p> : null}
              {(d.meta ?? []).map(([k, v]) => <p key={k} className="text-muted-foreground">{k}: {v}</p>)}
            </div>
          )}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-1">#</th><th>Item</th><th className="text-right">Qty</th></tr></thead>
            <tbody>
              {(d.lines ?? []).map((l, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-1">{i + 1}</td>
                  <td>{l.name} <span className="text-xs text-muted-foreground">{l.unit}</span></td>
                  <td className="text-right">{editing ? <input className={`${inp} w-20 text-right`} inputMode="decimal" value={String(l.qty)} onChange={(e) => setD((x) => ({ ...x, lines: (x.lines ?? []).map((y, j) => (j === i ? { ...y, qty: Number(e.target.value) || 0 } : y)) }))} aria-label={`Qty ${l.name}`} /> : l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {editing ? <textarea className={`${inp} h-16 py-1`} value={d.notes ?? ""} onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))} placeholder="Note" aria-label="Note" /> : d.notes ? <p className="text-xs text-muted-foreground">Note: {d.notes}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button onClick={() => onPrint(d)}><Printer /> Print</Button>
            <Button variant="outline" onClick={share}><Share2 /> Share</Button>
            <Button variant="outline" onClick={() => onPdf(d)}><Download /> Save</Button>
            <Button variant="outline" onClick={() => setEditing((v) => !v)}>{editing ? <><Check /> Done</> : <><Pencil /> Edit</>}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
