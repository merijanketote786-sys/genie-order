import { AppShell } from "@/components/app-shell";
import { PAY_OPTS, PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { partyPayment } from "@/lib/business.functions";
import { getCustomerLedger, listCustomerBalances, saveCustomerAccount } from "@/lib/ledger.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Printer, Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ledger")({
  head: () => ({
    meta: [
      { title: "Customer Ledger (Udhaar) — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Customer udhaar, running balance ledger, payment receive aur statement print." },
      { property: "og:title", content: "Customer Ledger — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Customer udhaar aur statements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgerPage,
});

function LedgerPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["cust-bal"], queryFn: () => listCustomerBalances() });
  const [q, setQ] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "Cash", note: "" });
  const [acct, setAcct] = useState<{ opening: string; limit: string } | null>(null);
  const { data: led } = useQuery({ queryKey: ["cust-ledger", sel], queryFn: () => getCustomerLedger({ data: { id: sel! } }), enabled: !!sel });

  const all = data?.customers ?? [];
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((c) => (!onlyDue || Math.abs(c.balance) > 0.009) && (!t || `${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(t))).sort((a, b) => b.balance - a.balance);
  }, [all, q, onlyDue]);
  const cur = all.find((c) => c.id === sel);
  const receivable = all.reduce((s, c) => s + Math.max(0, c.balance), 0);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["cust-bal"] }); qc.invalidateQueries({ queryKey: ["cust-ledger"] }); };
  const receive = async () => {
    const a = Number(pay.amount);
    if (!sel || !(a > 0)) return;
    try {
      await partyPayment({ data: { kind: "receipt", partyId: sel, amount: a, method: pay.method, note: pay.note || undefined } });
      toast.success(`Payment ${rs(a)} mil gayi`);
      setPay({ amount: "", method: "Cash", note: "" });
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Nahi hua"); }
  };
  const saveAcct = async () => {
    if (!sel || !acct) return;
    try {
      await saveCustomerAccount({ data: { id: sel, openingBalance: Number(acct.opening) || 0, creditLimit: acct.limit.trim() ? Number(acct.limit) || 0 : null } });
      toast.success("Save ho gaya"); setAcct(null); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Nahi hua"); }
  };
  const printStatement = () => {
    if (!led || !cur) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const rows = led.rows.map((r) => `<tr><td>${new Date(r.date).toLocaleDateString("en-PK")}</td><td>${r.kind}</td><td>${r.ref}</td><td class=n>${r.debit ? r.debit.toFixed(2) : ""}</td><td class=n>${r.credit ? r.credit.toFixed(2) : ""}</td><td class=n>${r.balance.toFixed(2)}</td></tr>`).join("");
    const esc = (s: string) => s.replace(/[<>&]/g, "");
    w.document.write(`<html><head><title>Statement ${esc(cur.name)}</title><style>body{font-family:Arial;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ccc;padding:5px;text-align:left}.n{text-align:right}h2{margin:0}</style></head><body><h2>Customer Statement</h2><p><b>${esc(cur.name)}</b> ${esc(cur.phone)} ${esc(cur.city)}<br>Date: ${new Date().toLocaleDateString("en-PK")}</p><table><tr><th>Date</th><th>Detail</th><th>Ref</th><th class=n>Debit</th><th class=n>Credit</th><th class=n>Balance</th></tr><tr><td colspan=5>Opening balance</td><td class=n>${led.opening.toFixed(2)}</td></tr>${rows}</table><h3 style="text-align:right">Baqaya: Rs ${cur.balance.toFixed(2)}</h3><script>print()</script></body></html>`);
    w.document.close();
  };
  const whatsapp = () => {
    if (!cur) return;
    const ph = cur.phone.replace(/\D/g, "").replace(/^0/, "92");
    const msg = `Assalam o Alaikum ${cur.name}, aap ka baqaya Rs ${cur.balance.toLocaleString("en-PK")} hai. Shukriya.`;
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <AppShell title="Customer Ledger" subtitle="Udhaar aur payments" active="/pos">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <section className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-bold text-foreground">Kul lena (receivable): <span className="text-destructive">{rs(receivable)}</span></p>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
              <Search className="size-4 text-primary" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam, phone ya city" />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Sirf baqaya wale customers</label>
            <ul className="max-h-[30rem] space-y-1 overflow-y-auto">
              {list.slice(0, 300).map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setSel(c.id); setAcct(null); }} className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left text-sm ${sel === c.id ? "border-primary bg-accent" : "border-border"}`}>
                    <span className="min-w-0"><b className="block truncate text-foreground">{c.name || c.phone}</b><span className="text-xs text-muted-foreground">{c.phone} {c.city}</span></span>
                    <span className={`shrink-0 font-semibold ${c.balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>{rs(c.balance)}</span>
                  </button>
                </li>
              ))}
              {data && !list.length ? <p className="py-4 text-center text-xs text-muted-foreground">Koi customer nahi mila.</p> : null}
            </ul>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-3">
            {!cur ? <p className="py-10 text-center text-sm text-muted-foreground">Customer chunein — ledger, payment aur statement yahan.</p> : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-foreground">{cur.name}</p>
                    <p className="text-xs text-muted-foreground">{cur.phone} {cur.city} · Sales {rs(cur.sales)} · Paid {rs(cur.paid)}{cur.creditLimit != null ? ` · Limit ${rs(cur.creditLimit)}` : ""}</p>
                    <p className={`text-lg font-bold ${cur.balance > 0 ? "text-destructive" : "text-foreground"}`}>Baqaya {rs(cur.balance)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAcct({ opening: String(cur.opening), limit: cur.creditLimit == null ? "" : String(cur.creditLimit) })}>Opening / Limit</Button>
                    <Button size="sm" variant="outline" onClick={printStatement}><Printer /> Statement</Button>
                    <Button size="sm" variant="outline" disabled={!cur.phone} onClick={whatsapp}><MessageCircle /> Reminder</Button>
                  </div>
                </div>
                {acct ? (
                  <div className="grid gap-2 rounded-lg border border-primary p-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input className={posInput} value={acct.opening} inputMode="decimal" onChange={(e) => setAcct({ ...acct, opening: e.target.value })} placeholder="Opening balance" aria-label="Opening balance" />
                    <input className={posInput} value={acct.limit} inputMode="decimal" onChange={(e) => setAcct({ ...acct, limit: e.target.value })} placeholder="Credit limit (khali = koi nahi)" aria-label="Credit limit" />
                    <Button onClick={saveAcct}>Save</Button>
                  </div>
                ) : null}
                <div className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                  <input className={posInput} value={pay.amount} inputMode="decimal" onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder="Amount mili" aria-label="Receive amount" />
                  <select className={posInput} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} aria-label="Method">{PAY_OPTS.map((m) => <option key={m}>{m}</option>)}</select>
                  <input className={posInput} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Note" />
                  <Button onClick={receive}><Wallet /> Receive Payment</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Detail</th><th>Ref</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
                    <tbody>
                      <tr className="border-t border-border"><td colSpan={5} className="py-1.5">Opening balance</td><td className="text-right">{rs(led?.opening ?? 0)}</td></tr>
                      {(led?.rows ?? []).map((r, i) => (
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
