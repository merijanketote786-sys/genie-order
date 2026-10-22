import { AppShell } from "@/components/app-shell";
import { PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { EXPENSE_CATEGORIES, cancelExpense, listExpenses, moveExpenseStore, saveExpense } from "@/lib/ledger.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRightLeft, Plus } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useActiveStore } from "@/components/store-switcher";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";
import { usePosAccess } from "@/components/pos-access";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Record expenses like rent, electricity, salary, courier etc. and see category-wise totals." },
      { property: "og:title", content: "Expenses — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Record of business expenses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const CUSTOM = "__custom__";

function ExpensesPage() {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const { cfg } = usePosAccess();
  const { stores: allStores, store: activeStore, isAllStores } = useActiveStore();
  const stores = allStores.filter((s) => s.isActive);
  const storeName = (id: string | null) => allStores.find((s) => s.id === id)?.name ?? "—";
  const today = localDate();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [filterStore, setFilterStore] = useState<string>("");
  const [f, setF] = useState({ category: "Rent", custom: "", amount: "", date: today, method: "Cash", description: "", storeId: "" });
  const [moving, setMoving] = useState<{ id: string; storeId: string } | null>(null);
  useEffect(() => { if (!f.storeId && activeStore && !isAllStores) setF((p) => ({ ...p, storeId: activeStore.id })); }, [activeStore, isAllStores, f.storeId]);
  const { data } = useQuery({ queryKey: ["expenses", from, to, filterStore], queryFn: () => listExpenses({ data: { from, to, storeId: filterStore || undefined } }) });
  const rows = data?.expenses ?? [];
  const categories = data?.categories ?? EXPENSE_CATEGORIES;
  const active = rows.filter((r) => r.status !== "cancelled");
  const byCat: Record<string, number> = {};
  for (const r of active) byCat[r.category] = (byCat[r.category] ?? 0) + r.amount;

  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const add = async () => {
    const a = Number(f.amount);
    const category = f.category === CUSTOM ? f.custom.trim() : f.category;
    if (!category) return toast.error("Enter an expense name");
    if (category.length > 60) return toast.error("Expense name is too long");
    if (!(a > 0)) return toast.error("Enter an amount");
    if (!f.storeId) return toast.error("Select a store");
    if (lockRef.current) return;
    lockRef.current = true;
    try {
      await saveExpense({ data: { category, amount: a, date: f.date, method: f.method, description: f.description || undefined, clientRef: opRef.current, storeId: f.storeId } });
      opRef.current = newRef();
      toast.success(`Expense ${rs(a)} saved`);
      setF({ ...f, category: f.category === CUSTOM ? category : f.category, custom: "", amount: "", description: "" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save expense. Please try again."); } finally { lockRef.current = false; }
  };
  const move = async () => {
    if (!moving) return;
    try {
      await moveExpenseStore({ data: moving });
      toast.success(`Expense moved to ${storeName(moving.storeId)}`);
      setMoving(null);
      qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not move expense"); }
  };

  return (
    <AppShell title="Expenses" subtitle="Business expenses" active="/pos" wide>
      {pc.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <section className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-3 lg:grid-cols-7">
          <select className={posInput} value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })} aria-label="Store">
            <option value="">Select store</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind === "godown" ? " (Godown)" : ""}</option>)}
          </select>
          <select className={posInput} value={categories.includes(f.category) ? f.category : CUSTOM} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category">
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={CUSTOM}>+ Custom expense…</option>
          </select>
          {f.category === CUSTOM ? <input className={posInput} autoFocus value={f.custom} maxLength={60} onChange={(e) => setF({ ...f, custom: e.target.value })} placeholder="Expense name" aria-label="Custom expense name" /> : null}
          <input className={posInput} value={f.amount} inputMode="decimal" onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Amount" aria-label="Amount" />
          <input className={posInput} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
          <select className={posInput} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} aria-label="Method">{cfg.payMethods.filter((m) => m !== "Credit").map((m) => <option key={m}>{m}</option>)}</select>
          <input className={posInput} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Detail" />
          <Button className="h-10" onClick={add}><Plus /> Expense add</Button>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className={`${posInput} w-44!`} value={filterStore} onChange={(e) => setFilterStore(e.target.value)} aria-label="Filter by store">
              <option value="">All stores</option>
              {allStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className={`${posInput} w-40!`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span>to</span>
            <input className={`${posInput} w-40!`} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            <b className="ml-auto text-foreground">Total: {rs(active.reduce((s, r) => s + r.amount, 0))}</b>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byCat).map(([k, v]) => <span key={k} className="rounded-full border border-border px-3 py-1 text-xs">{k}: <b>{rs(v)}</b></span>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Store</th><th>Category</th><th>Detail</th><th>Method</th><th className="text-right">Amount</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-border ${r.status === "cancelled" ? "opacity-50 line-through" : ""}`}>
                    <td className="py-1.5">{r.date}</td><td className="text-xs">{storeName(r.storeId)}</td><td>{r.category}</td><td className="text-xs">{r.description}</td><td>{r.method}</td><td className="text-right font-semibold">{rs(r.amount)}</td>
                    <td className="whitespace-nowrap text-right">
                      {moving?.id === r.id ? (
                        <span className="inline-flex items-center gap-1">
                          <select className={`${posInput} h-8! w-36!`} value={moving.storeId} onChange={(e) => setMoving({ id: r.id, storeId: e.target.value })} aria-label="Move to store">
                            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <Button size="sm" onClick={move} disabled={moving.storeId === r.storeId}>Move</Button>
                          <Button size="sm" variant="ghost" onClick={() => setMoving(null)}>Close</Button>
                        </span>
                      ) : (<>
                      <Button size="sm" variant="ghost" onClick={() => pc.preview({ kind: "expense", id: r.id, title: "Expense Voucher", number: `EXP-${r.id.slice(0, 6).toUpperCase()}`, date: r.date, meta: [["Store", storeName(r.storeId)], ["Category", r.category], ["Method", r.method], ["Status", r.status]], notes: r.description || undefined, totals: [{ label: "Amount", value: r.amount, bold: true }] })}>Print</Button>
                      {r.status !== "cancelled" && stores.length > 1 ? <Button size="sm" variant="ghost" onClick={() => setMoving({ id: r.id, storeId: stores.find((s) => s.id !== r.storeId)?.id ?? "" })}><ArrowRightLeft className="size-4" /> Transfer</Button> : null}
                      {r.status !== "cancelled" ? <Button size="sm" variant="ghost" onClick={async () => { if (!confirm("Cancel this expense?")) return; await cancelExpense({ data: { id: r.id } }); qc.invalidateQueries({ queryKey: ["expenses"] }); }}>Cancel</Button> : null}
                      </>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && !rows.length ? <p className="py-4 text-center text-xs text-muted-foreground">No expenses in this period.</p> : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
