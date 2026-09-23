import { AppShell } from "@/components/app-shell";
import { PAY_OPTS, PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { getSupplierLedger, listSuppliers, partyPayment, saveSupplier } from "@/lib/business.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Printer, Wallet } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";
import { usePosAccess } from "@/components/pos-access";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Supplier profiles, outstanding, ledger aur supplier payments." },
      { property: "og:title", content: "Suppliers — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Supplier ledger aur payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const { cfg } = usePosAccess();
  const { data } = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });
  const [form, setForm] = useState<{ id?: string; name: string; phone: string; address: string; opening: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "Cash", note: "" });
  const { data: ledger } = useQuery({ queryKey: ["sup-ledger", sel], queryFn: () => getSupplierLedger({ data: { id: sel! } }), enabled: !!sel });
  const sups = data?.suppliers ?? [];
  const current = sups.find((s) => s.id === sel);

  const save = async () => {
    if (!form?.name.trim()) return;
    try {
      await saveSupplier({ data: { id: form.id, name: form.name, phone: form.phone, address: form.address, openingBalance: Number(form.opening) || 0 } });
      toast.success("Supplier save");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Nahi hua"); }
  };
  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const paySupplier = async () => {
    const a = Number(pay.amount);
    if (!sel || !(a > 0) || lockRef.current) return;
    lockRef.current = true;
    try {
      await partyPayment({ data: { kind: "supplier_payment", partyId: sel, amount: a, method: pay.method, note: pay.note || undefined, clientRef: opRef.current } });
      opRef.current = newRef();
      toast.success(`Payment ${rs(a)} save`);
      if (current) pc.afterSave({ kind: "receipt", title: "Supplier Payment Voucher", number: `PV-${Date.now().toString().slice(-6)}`, date: new Date(), party: { label: "Paid to", name: current.name, phone: current.phone }, payments: [{ method: pay.method, amount: a }], totals: [{ label: "Amount paid", value: a, bold: true }], notes: pay.note || undefined }, "receipt");
      setPay({ amount: "", method: "Cash", note: "" });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["sup-ledger"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Payment save nahi hui. Dobara try karein."); } finally { lockRef.current = false; }
  };

  return (
    <AppShell title="Suppliers" subtitle="Ledger aur payments" active="/pos">
      {pc.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <section className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">Suppliers ({sups.length}) · Payable {rs(sups.reduce((s, x) => s + Math.max(0, x.balance), 0))}</p>
              <Button size="sm" onClick={() => setForm({ name: "", phone: "", address: "", opening: "" })}><Plus /> Naya</Button>
            </div>
            {form ? (
              <div className="grid gap-2 rounded-lg border border-primary p-2 sm:grid-cols-2">
                <input className={posInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplier naam *" />
                <input className={posInput} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
                <input className={posInput} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
                <input className={posInput} value={form.opening} inputMode="decimal" onChange={(e) => setForm({ ...form, opening: e.target.value })} placeholder="Opening balance (hum ne dena)" />
                <div className="flex gap-2 sm:col-span-2"><Button onClick={save}>Save</Button><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
              </div>
            ) : null}
            <ul className="max-h-[30rem] space-y-1 overflow-y-auto">
              {sups.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setSel(s.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left text-sm ${sel === s.id ? "border-primary bg-accent" : "border-border"}`}>
                    <span className="min-w-0"><b className="block truncate text-foreground">{s.name}</b><span className="text-xs text-muted-foreground">{s.phone}</span></span>
                    <span className={`shrink-0 text-sm font-semibold ${s.balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>{rs(s.balance)}</span>
                  </button>
                </li>
              ))}
              {!sups.length ? <p className="py-4 text-center text-xs text-muted-foreground">Abhi koi supplier nahi — "Naya" dabayein.</p> : null}
            </ul>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-3" id="sup-statement">
            {!current ? <p className="py-10 text-center text-sm text-muted-foreground">Supplier chunein — ledger aur payment yahan.</p> : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="font-bold text-foreground">{current.name}</p><p className="text-xs text-muted-foreground">{current.phone} {current.address}</p></div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setForm({ id: current.id, name: current.name, phone: current.phone, address: current.address, opening: String(current.openingBalance) })}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => pc.preview({
                      kind: "statement", title: "Supplier Statement", number: current.name, date: new Date(),
                      party: { label: "Supplier", name: current.name, phone: current.phone, address: current.address },
                      table: { head: ["Date", "Detail", "Ref", "Paid (Dr)", "Purchase (Cr)", "Balance"], align: ["l", "l", "l", "r", "r", "r"], rows: [["", "Opening balance", "", "", "", ledger?.opening ?? 0], ...(ledger?.rows ?? []).map((r) => [new Date(r.date).toLocaleDateString("en-PK"), r.kind, r.ref, r.debit || "", r.credit || "", r.balance] as (string | number)[])] },
                      totals: [{ label: "Payable balance", value: current.balance, bold: true }],
                    })}><Printer /> Statement</Button>
                  </div>
                </div>
                <div className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                  <input className={posInput} value={pay.amount} inputMode="decimal" onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder={`Amount (baqaya ${rs(current.balance)})`} />
                  <select className={posInput} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} aria-label="Method">{cfg.payMethods.filter((m) => m !== "Credit").map((m) => <option key={m}>{m}</option>)}</select>
                  <input className={posInput} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Note" />
                  <Button onClick={paySupplier}><Wallet /> Pay Supplier</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Detail</th><th>Ref</th><th className="text-right">Diya (Dr)</th><th className="text-right">Lena (Cr)</th><th className="text-right">Balance</th></tr></thead>
                    <tbody>
                      <tr className="border-t border-border"><td colSpan={5} className="py-1.5">Opening balance</td><td className="text-right">{rs(ledger?.opening ?? 0)}</td></tr>
                      {(ledger?.rows ?? []).map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1.5 text-xs">{new Date(r.date).toLocaleDateString("en-PK")}</td><td>{r.kind}</td><td className="text-xs">{r.ref}</td>
                          <td className="text-right">{r.debit ? rs(r.debit) : ""}</td><td className="text-right">{r.credit ? rs(r.credit) : ""}</td><td className="text-right font-semibold">{rs(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
