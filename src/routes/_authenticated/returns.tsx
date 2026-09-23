import { AppShell } from "@/components/app-shell";
import { PAY_OPTS, PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { cancelDoc, getSaleForReturn, listReturns, saveSalesReturn, searchSales } from "@/lib/business.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/returns")({
  head: () => ({
    meta: [
      { title: "Sales Returns — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Purane bill se poora ya partial return, refund ya customer credit, stock khud wapas." },
      { property: "og:title", content: "Sales Returns — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Sales return aur refund history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"refund" | "credit">("refund");
  const [method, setMethod] = useState("Cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: found } = useQuery({ queryKey: ["ret-search", dq], queryFn: () => searchSales({ data: { q: dq } }) });
  const { data: sale } = useQuery({ queryKey: ["ret-sale", saleId], queryFn: () => getSaleForReturn({ data: { id: saleId! } }), enabled: !!saleId });
  const { data: hist } = useQuery({ queryKey: ["ret-list"], queryFn: () => listReturns() });

  const items = sale?.items ?? [];
  const lines = items.map((i) => ({ i, q: Math.min(Number(qty[i.id] || 0), i.qty - i.returned) })).filter((x) => x.q > 0);
  const total = lines.reduce((s, x) => s + x.q * x.i.unitRefund, 0);

  const submit = async () => {
    if (!saleId || !lines.length) return;
    setSaving(true);
    try {
      const r = await saveSalesReturn({ data: { saleId, mode, method, reason: reason || undefined, lines: lines.map((x) => ({ itemId: x.i.id, qty: x.q })) } });
      toast.success(`Return save: ${r.number} — ${rs(r.total)}`);
      setQty({}); setReason("");
      qc.invalidateQueries({ queryKey: ["ret-sale"] });
      qc.invalidateQueries({ queryKey: ["ret-list"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Return save nahi hua");
    } finally { setSaving(false); }
  };

  return (
    <AppShell title="Sales Returns" subtitle="Refund ya customer credit" active="/pos">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          <section className="rounded-xl border border-border bg-card p-3">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
              <Search className="size-4 text-primary" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice number, naam ya phone" />
            </label>
            <ul className="mt-2 max-h-[28rem] space-y-1 overflow-y-auto">
              {(found?.sales ?? []).map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => { setSaleId(s.id); setQty({}); }} className={`w-full rounded-lg border p-2 text-left text-sm ${saleId === s.id ? "border-primary bg-accent" : "border-border"}`}>
                    <span className="font-semibold text-foreground">{s.doc_number}</span> · {s.customer_name || "Walk-in"}
                    <span className="block text-xs text-muted-foreground">{rs(s.grand_total)} · {s.payment_status} · {new Date(s.created_at).toLocaleString("en-PK")}</span>
                  </button>
                </li>
              ))}
              {found && !found.sales.length ? <p className="py-4 text-center text-xs text-muted-foreground">Koi bill nahi mila.</p> : null}
            </ul>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-3">
            {!sale ? <p className="py-10 text-center text-sm text-muted-foreground">Baen taraf se bill chunein.</p> : (
              <>
                <p className="font-bold text-foreground">{sale.sale.number} · {sale.sale.customerName || "Walk-in"} · {rs(sale.sale.total)}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th>Item</th><th>Becha</th><th>Wapas ho chuka</th><th>Rate</th><th>Return qty</th></tr></thead>
                    <tbody>
                      {items.map((i) => {
                        const left = Math.round((i.qty - i.returned) * 1000) / 1000;
                        return (
                          <tr key={i.id} className="border-t border-border">
                            <td className="py-1.5">{i.name} <span className="text-xs text-muted-foreground">{i.unit}</span></td>
                            <td>{i.qty}</td><td>{i.returned}</td><td>{rs(i.unitRefund)}</td>
                            <td className="w-28">
                              <div className="flex gap-1">
                                <input className="h-8 w-16 rounded-md border border-border bg-background px-2" inputMode="decimal" disabled={left <= 0} value={qty[i.id] ?? ""} placeholder="0" onChange={(e) => setQty((m) => ({ ...m, [i.id]: e.target.value.replace(/[^\d.]/g, "") }))} aria-label={`${i.name} return qty`} />
                                <Button size="sm" variant="ghost" disabled={left <= 0} onClick={() => setQty((m) => ({ ...m, [i.id]: String(left) }))}>Sab</Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <select className={posInput} value={mode} onChange={(e) => setMode(e.target.value as "refund" | "credit")} aria-label="Return mode">
                    <option value="refund">Paise wapas (refund)</option>
                    <option value="credit" disabled={!sale.sale.hasCustomer}>Customer account me credit</option>
                  </select>
                  {mode === "refund" ? <select className={posInput} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Refund method">{PAY_OPTS.map((m) => <option key={m}>{m}</option>)}</select> : <div />}
                  <input className={posInput} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wajah (optional)" />
                </div>
                <Button size="lg" className="w-full" disabled={!lines.length || saving} onClick={submit}><Undo2 /> Return save — {rs(total)}</Button>
                <p className="text-xs text-muted-foreground">Asal bill tabdeel nahi hota — alag return record banta hai aur stock khud wapas aata hai.</p>
              </>
            )}
          </section>
        </div>

        <section className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-sm font-bold text-foreground">Return history</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>No.</th><th>Customer</th><th>Amount</th><th>Refund</th><th>Note</th><th>Date</th><th /></tr></thead>
              <tbody>
                {(hist?.returns ?? []).map((r) => (
                  <tr key={r.id} className={`border-t border-border ${r.status === "cancelled" ? "opacity-50" : ""}`}>
                    <td className="py-1.5 font-semibold">{r.doc_number}</td><td>{r.customer_name}</td><td>{rs(r.grand_total)}</td><td>{r.paid_total ? rs(r.paid_total) : "Credit"}</td>
                    <td className="max-w-48 truncate text-xs">{r.notes}</td><td className="text-xs">{new Date(r.created_at).toLocaleString("en-PK")}</td>
                    <td>{r.status === "cancelled" ? "Cancelled" : <Button size="sm" variant="ghost" onClick={async () => { if (!confirm("Return cancel karein? Stock dobara kam hoga.")) return; try { await cancelDoc({ data: { id: r.id, reason: "manual" } }); qc.invalidateQueries({ queryKey: ["ret-list"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Nahi hua"); } }}>Cancel</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hist && !hist.returns.length ? <p className="py-3 text-center text-xs text-muted-foreground">Abhi koi return nahi.</p> : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
