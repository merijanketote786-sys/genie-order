// Combined parties browser: customers (parties) and suppliers shown together —
// suppliers section and the Parties dialog both render this component.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileText, MoreVertical, Pencil, Scale, Trash2, UserPlus, Wallet, X } from "lucide-react";
import { usePrintCenter } from "@/components/print-center";
import { getCustomerLedger, getPartyStatementItems, listCustomerBalances, saveCustomerAccount } from "@/lib/ledger.functions";
import { cancelDoc, deletePartyPayment, getPurchaseItems, getSupplierLedger, listSuppliers, partyPayment, saveSupplier } from "@/lib/business.functions";
import { getSaleForEdit } from "@/lib/pos.functions";
import { saveParty } from "@/lib/records.functions";
import { usePosAccess } from "@/components/pos-access";
import { rs } from "@/components/pos-subnav";
import { newRef } from "@/lib/pos-errors";
import { Button } from "@/components/ui/button";
import { PosPage } from "@/routes/_authenticated/pos";
import { toast } from "sonner";

export type Party = { key: string; name: string; phone: string; kind: string; balance: number; customerId?: string; supplierId?: string; address?: string };

const tail = (p: string) => p.replace(/\D/g, "").slice(-10);
const inputCls = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

const OPTS = [
  ["sale", "Sales"], ["saleReturn", "Sale returns"], ["purchase", "Purchases"], ["purchaseReturn", "Purchase returns"],
  ["received", "Amount received"], ["paid", "Amount paid"], ["items", "Item details"], ["qty", "Quantity"], ["unit", "Unit"], ["rate", "Price per unit"], ["lineTotal", "Item amount"],
] as const;
type Opt = (typeof OPTS)[number][0];
const DEFAULT_INC: Record<Opt, boolean> = { sale: true, saleReturn: true, purchase: true, purchaseReturn: true, received: true, paid: true, items: true, qty: true, unit: true, rate: true, lineTotal: true };
const cat = (kind: string): Opt => {
  if (kind === "Sale invoice") return "sale";
  if (kind === "Sale return") return "saleReturn";
  if (kind === "Purchase") return "purchase";
  if (kind === "Purchase return") return "purchaseReturn";
  if (/^(Payment received|Paid on bill|Refund received)/.test(kind)) return "received";
  return "paid";
};
const label = (kind: string, c: Opt) => {
  const m = kind.match(/\(([^)]*)\)/)?.[1];
  const base = c === "received" ? (kind.startsWith("Refund") ? "Refund received" : "Amount received") : c === "paid" ? (kind.startsWith("Refund") ? "Refund paid" : "Amount paid") : kind;
  return m ? `${base} (${m})` : base;
};

/** Full parties + suppliers browser. Set enabled=false inside dialogs until they open. */
export function PartyBrowser({ enabled = true }: { enabled?: boolean }) {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const { cfg } = usePosAccess();
  const methods = cfg.payMethods.filter((m) => m !== "Credit");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Party | null>(null);

  // Add party
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"customer" | "supplier">("customer");
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit supplier
  const [form, setForm] = useState<{ name: string; phone: string; address: string; opening: string } | null>(null);

  // Payment
  const [dir, setDir] = useState<"in" | "out">("in");
  const [pay, setPay] = useState({ amount: "", method: "Cash", note: "" });
  const [payBusy, setPayBusy] = useState(false);
  const opRef = useRef(newRef());

  // Statement
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [stOpen, setStOpen] = useState(false);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [stBusy, setStBusy] = useState(false);
  const [inc, setInc] = useState<Record<Opt, boolean>>(DEFAULT_INC);

  // Adjust balance (opening balance set karna)
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjDir, setAdjDir] = useState<"receive" | "pay">("receive");
  const [adjAmt, setAdjAmt] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);

  const c = useQuery({ queryKey: ["customer-balances", "pos"], queryFn: () => listCustomerBalances({ data: { posOnly: true } }), enabled, staleTime: 15_000 });
  const s = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers(), enabled, staleTime: 15_000 });

  const cl = useQuery({ queryKey: ["party-ledger-c", sel?.customerId], queryFn: () => getCustomerLedger({ data: { id: sel!.customerId! } }), enabled: enabled && !!sel?.customerId });
  const sl = useQuery({ queryKey: ["party-ledger-s", sel?.supplierId], queryFn: () => getSupplierLedger({ data: { id: sel!.supplierId! } }), enabled: enabled && !!sel?.supplierId });

  // Combined balance: positive = hum ne lene hain (receivable), negative = dene hain (payable).
  const map = new Map<string, Party>();
  for (const x of c.data?.customers ?? []) {
    const k = x.phone ? `p${tail(x.phone)}` : `c${x.id}`;
    map.set(k, { key: k, name: x.name || x.phone || "No name", phone: x.phone, kind: "Customer", balance: x.balance, customerId: x.id });
  }
  for (const x of s.data?.suppliers ?? []) {
    const k = x.phone ? `p${tail(x.phone)}` : `s${x.id}`;
    const e = map.get(k);
    if (e) { e.balance -= x.balance; e.kind = "Customer · Supplier"; e.supplierId = x.id; }
    else map.set(k, { key: k, name: x.name, phone: x.phone, kind: "Supplier", balance: -x.balance, supplierId: x.id, address: x.address ?? "" });
  }
  const ql = q.trim().toLowerCase();
  const list = [...map.values()]
    .filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.phone.includes(ql))
    .sort((a, b) => a.name.localeCompare(b.name));
  const loading = c.isLoading || s.isLoading;
  const toReceive = r2(list.reduce((a, p) => a + Math.max(0, p.balance), 0));
  const toPay = r2(list.reduce((a, p) => a + Math.max(0, -p.balance), 0));

  const addParty = async () => {
    if (!addName.trim() || !addPhone.trim()) { toast.error("Name aur phone zaroori hain"); return; }
    setSaving(true);
    try {
      if (addKind === "customer") await saveParty({ data: { name: addName.trim(), phone: addPhone.trim() } });
      else await saveSupplier({ data: { name: addName.trim(), phone: addPhone.trim() } });
      toast.success("Party add ho gayi");
      setAddName(""); setAddPhone(""); setAddOpen(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["customer-balances"] }), qc.invalidateQueries({ queryKey: ["suppliers"] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Party add nahi hui"); }
    setSaving(false);
  };

  const saveSupplierForm = async () => {
    if (!sel?.supplierId || !form?.name.trim()) return;
    try {
      await saveSupplier({ data: { id: sel.supplierId, name: form.name, phone: form.phone, address: form.address, openingBalance: Number(form.opening) || 0 } });
      toast.success("Supplier save");
      setForm(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["suppliers"] }), qc.invalidateQueries({ queryKey: ["party-ledger-s"] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const openAdjust = () => {
    if (!sel) return;
    // Current opening balance pre-fill: customer = receivable, supplier = payable
    const cust = (c.data?.customers ?? []).find((x) => x.id === sel.customerId);
    const sup = (s.data?.suppliers ?? []).find((x) => x.id === sel.supplierId);
    if (sel.customerId && (!sel.supplierId || Number(cust?.opening ?? 0) !== 0)) {
      setAdjDir("receive"); setAdjAmt(String(Number(cust?.opening ?? 0) || ""));
    } else {
      setAdjDir("pay"); setAdjAmt(String(Number(sup?.openingBalance ?? 0) || ""));
    }
    setAdjOpen(true);
  };

  const saveAdjust = async () => {
    if (!sel) return;
    const amt = Number(adjAmt);
    if (!Number.isFinite(amt) || amt < 0) { toast.error("Sahi amount likhein"); return; }
    setAdjBusy(true);
    try {
      if (adjDir === "receive") {
        if (!sel.customerId) throw new Error("Is party ka customer record nahi — pehle customer ke tor par add karein");
        await saveCustomerAccount({ data: { id: sel.customerId, openingBalance: amt, creditLimit: cl.data?.customer?.creditLimit ?? null } });
      } else {
        if (!sel.supplierId) throw new Error("Is party ka supplier record nahi — pehle supplier ke tor par add karein");
        const sup = (s.data?.suppliers ?? []).find((x) => x.id === sel.supplierId);
        await saveSupplier({ data: { id: sel.supplierId, name: sup?.name ?? sel.name, phone: sup?.phone ?? sel.phone, address: sup?.address ?? "", openingBalance: amt } });
      }
      toast.success("Opening balance save ho gaya");
      setAdjOpen(false);
      await Promise.all(["customer-balances", "suppliers", "party-ledger-c", "party-ledger-s", "pos-dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save nahi hua"); }
    setAdjBusy(false);
  };

  const payNow = async () => {
    const a = Number(pay.amount);
    if (!sel || !(a > 0) || payBusy) { if (!sel) toast.error("Select a party"); else if (!(a > 0)) toast.error("Enter a valid amount"); return; }
    setPayBusy(true);
    try {
      const kind = dir === "in" ? (sel.customerId ? "receipt" : "supplier_receipt") : (sel.supplierId ? "supplier_payment" : "customer_payment_out");
      const partyId = (kind === "receipt" || kind === "customer_payment_out" ? sel.customerId : sel.supplierId)!;
      await partyPayment({ data: { kind, partyId, amount: a, method: pay.method, note: pay.note.trim() || undefined, clientRef: opRef.current } });
      opRef.current = newRef();
      toast.success(`${dir === "in" ? "Payment In" : "Payment Out"} ${rs(a)} saved`);
      const after = sel.balance + (dir === "in" ? -a : a);
      pc.afterSave({
        kind: "receipt", title: dir === "in" ? "Payment In Receipt" : "Payment Out Voucher",
        number: `${dir === "in" ? "PIN" : "POUT"}-${Date.now().toString().slice(-6)}`, date: new Date(),
        party: { label: dir === "in" ? "Received from" : "Paid to", name: sel.name, phone: sel.phone },
        payments: [{ method: pay.method, amount: a }],
        totals: [{ label: dir === "in" ? "Amount received" : "Amount paid", value: a, bold: true }, { label: after >= 0 ? "Balance (receivable)" : "Balance (payable)", value: Math.abs(after) }],
        notes: pay.note.trim() || undefined,
      }, "receipt");
      setPay({ amount: "", method: "Cash", note: "" });
      await Promise.all(["customer-balances", "suppliers", "party-ledger-c", "party-ledger-s", "pos-dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Payment could not be saved. Please try again."); }
    setPayBusy(false);
  };

  // Combined ledger: customer rows (receivable) minus supplier rows (payable).
  type Row = { date: string; kind: string; ref: string; debit: number; credit: number; balance: number; id: string; entity: "sale" | "purchase" | "payment"; standalone: boolean };
  const ledgerRows: Row[] = (() => {
    const all = [...(cl.data?.rows ?? []), ...(sl.data?.rows ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    let run = r2(Number(cl.data?.opening ?? 0) - Number(sl.data?.opening ?? 0));
    return all.map((r) => { run = r2(run + r.debit - r.credit); return { ...r, balance: run }; });
  })();
  const ledgerOpening = r2(Number(cl.data?.opening ?? 0) - Number(sl.data?.opening ?? 0));
  const ledgerLoading = (sel?.customerId && cl.isLoading) || (sel?.supplierId && sl.isLoading);

  // Transaction open / edit / delete
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [txBusy, setTxBusy] = useState(false);
  const [editSale, setEditSale] = useState(false);

  const refreshLedger = () =>
    Promise.all(["customer-balances", "suppliers", "party-ledger-c", "party-ledger-s", "pos-dashboard", "pos-sales"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const openEditSale = async (r: Row) => {
    setTxBusy(true);
    try {
      const { sale: s } = await getSaleForEdit({ data: { id: r.id } });
      const cart = s.items.map((i: any, idx: number) => ({ key: `conv-${s.id}-${idx}`, name: i.name, unit: i.unit ?? "pcs", rateType: "custom", price: Number(i.rate), qty: Number(i.qty), discount: Number(i.discount), taxPercent: Number(i.tax_percent), sku: i.sku ?? undefined, note: i.note ?? undefined }));
      const payload = JSON.stringify({ cart, notes: s.notes ?? "", customerName: s.customer_name ?? "", customerPhone: s.customer_phone ?? "", delivery: String(Number(s.delivery) || "") });
      sessionStorage.setItem("pos-open-doc", JSON.stringify({ id: s.id, doc_number: s.doc_number, doc_type: s.doc_type, customer_name: s.customer_name, customer_phone: s.customer_phone, grand_total: s.grand_total, created_at: s.created_at, payload, status: s.status }));
      setEditSale(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Invoice could not be opened"); }
    setTxBusy(false);
  };

  const previewPurchase = async (r: Row) => {
    setTxBusy(true);
    try {
      const { purchase, items } = await getPurchaseItems({ data: { id: r.id } });
      pc.preview({
        kind: "pos", title: r.kind, number: purchase?.doc_number ?? r.ref, date: new Date(r.date),
        party: { label: "Supplier", name: purchase?.supplier_name ?? sel?.name ?? "", phone: sel?.phone ?? "" },
        lines: items.map((i) => ({ name: i.name, unit: i.unit || undefined, qty: i.qty, rate: i.rate, discount: i.discount, taxPct: i.taxPercent, total: r2(i.qty * i.rate - i.discount) })),
        totals: [{ label: "Grand Total", value: r.debit || r.credit, bold: true }],
      }, true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not be opened"); }
    setTxBusy(false);
  };

  const deleteSale = async (r: Row) => {
    const reason = window.prompt(`Cancel ${r.ref}? Reason (optional):`);
    if (reason === null) return;
    setTxBusy(true);
    try { await cancelDoc({ data: { id: r.id, reason } }); toast.success(`${r.ref} cancelled`); await refreshLedger(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Cancel failed"); }
    setTxBusy(false);
  };

  const deletePayment = async (r: Row) => {
    if (!window.confirm(`Delete this payment of ${rs(r.debit || r.credit)}? This cannot be undone.`)) return;
    setTxBusy(true);
    try { await deletePartyPayment({ data: { id: r.id } }); toast.success("Payment deleted"); await refreshLedger(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
    setTxBusy(false);
  };

  const openRow = (r: Row) => {
    if (txBusy) return;
    if (r.entity === "sale") void openEditSale(r);
    else if (r.entity === "purchase") void previewPurchase(r);
  };

  const openStatement = async () => {
    const p = sel; if (!p) return;
    if (from > to) { toast.error("From date must be before To date"); return; }
    setStBusy(true);
    try {
      const items = inc.items && (p.customerId || p.supplierId)
        ? await getPartyStatementItems({ data: { customerId: p.customerId, supplierId: p.supplierId } })
        : null;
      type R = { date: string; kind: string; ref: string; debit: number; credit: number };
      const rows: R[] = [...(cl.data?.rows ?? []), ...(sl.data?.rows ?? [])];
      rows.sort((a, b) => a.date.localeCompare(b.date));
      let run = Number(cl.data?.opening ?? 0) - Number(sl.data?.opening ?? 0);
      const d = (x: string) => new Date(x).toLocaleDateString("en-CA");
      const inRange: (string | number)[][] = [];
      let dr = 0, cr = 0;
      for (const r of rows) {
        const day = d(r.date);
        if (day > to) break;
        run = Math.round((run + r.debit - r.credit) * 100) / 100;
        if (day < from) continue;
        dr += r.debit; cr += r.credit;
        const k = cat(r.kind);
        if (!inc[k]) continue;
        inRange.push([new Date(r.date).toLocaleDateString("en-PK"), label(r.kind, k), r.ref, r.debit || "", r.credit || "", run]);
        for (const it of (inc.items ? items?.items[r.ref] : null) ?? []) {
          const parts = [`• ${it.name}`];
          if (inc.qty) parts.push(`${it.qty}${inc.unit && it.unit ? " " + it.unit : ""}`);
          else if (inc.unit && it.unit) parts.push(it.unit);
          if (inc.rate) parts.push(`@ Rs ${it.rate.toLocaleString("en-PK")}`);
          if (inc.lineTotal) parts.push(`= Rs ${it.total.toLocaleString("en-PK")}`);
          inRange.push(["", parts.join("  "), "", "", "", ""]);
        }
      }
      const opening = Math.round((run - dr + cr) * 100) / 100;
      const fmt = (x: string) => new Date(x).toLocaleDateString("en-PK");
      pc.preview({
        kind: "statement", title: "Party Statement", number: p.name, date: new Date(),
        party: { label: p.kind, name: p.name, phone: p.phone, address: p.address ?? "" },
        meta: [["Period", `${fmt(from)} to ${fmt(to)}`]],
        table: { head: ["Date", "Detail", "Ref", "Debit", "Credit", "Balance"], align: ["l", "l", "l", "r", "r", "r"], rows: [["", "Opening balance", "", "", "", opening], ...inRange] },
        totals: [
          { label: "Total debit", value: dr },
          { label: "Total credit", value: cr },
          { label: run >= 0 ? "Closing balance (receivable)" : "Closing balance (payable)", value: Math.abs(run), bold: true },
        ],
      });
      setStOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Statement could not be loaded"); }
    setStBusy(false);
  };

  return (
    <>
      {pc.node}
      {editSale ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <button
            type="button"
            aria-label="Close edit"
            title="Close"
            onClick={() => { setEditSale(false); void refreshLedger(); }}
            className="fixed right-4 top-4 z-[60] rounded-full border border-border bg-card p-2 shadow-lg transition-transform hover:scale-110 hover:bg-accent"
          >
            <X className="size-5" />
          </button>
          <PosPage onSaved={() => { setEditSale(false); void refreshLedger(); }} />
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">Parties ({list.length}) · <span className="text-success">To receive {rs(toReceive)}</span> · <span className="text-destructive">To pay {rs(toPay)}</span></p>
            <Button size="sm" onClick={() => setAddOpen((o) => !o)}><UserPlus className="size-4" /> New</Button>
          </div>
          {addOpen ? (
            <div className="space-y-2 rounded-lg border border-primary p-2">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={addKind === "customer" ? "default" : "outline"} onClick={() => setAddKind("customer")}>Customer</Button>
                <Button type="button" size="sm" variant={addKind === "supplier" ? "default" : "outline"} onClick={() => setAddKind("supplier")}>Supplier</Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={inputCls} placeholder="Name *" value={addName} onChange={(e) => setAddName(e.target.value)} />
                <input className={inputCls} placeholder="Phone *" inputMode="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} />
              </div>
              <Button type="button" className="w-full" disabled={saving} onClick={addParty}>{saving ? "Saving…" : "Save party"}</Button>
            </div>
          ) : null}
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party or supplier · name / phone" />
          <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
            {loading ? <li className="py-4 text-center text-xs text-muted-foreground">Loading parties…</li> : null}
            {!loading && !list.length ? <li className="py-4 text-center text-xs text-muted-foreground">No parties found — press "New".</li> : null}
            {list.map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => { setSel(p); setForm(null); setStOpen(false); }} className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left text-sm ${sel?.key === p.key ? "border-primary bg-accent" : "border-border"}`}>
                  <span className="min-w-0">
                    <b className="block truncate text-foreground">{p.name}</b>
                    <span className="text-xs text-muted-foreground">{p.kind}{p.phone ? ` · ${p.phone}` : ""}</span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold ${p.balance > 0 ? "text-success" : "text-destructive"}`}>{rs(Math.abs(p.balance))}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground"><span className="text-success">Green</span> = to receive · <span className="text-destructive">Red</span> = to pay / zero</p>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-3">
          {!sel ? <p className="py-10 text-center text-sm text-muted-foreground">Select a party or supplier — ledger, payments and statement will appear here.</p> : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-foreground">{sel.name}</p>
                  <p className="text-xs text-muted-foreground">{sel.kind}{sel.phone ? ` · ${sel.phone}` : ""}{sel.address ? ` · ${sel.address}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${sel.balance > 0 ? "text-success" : "text-destructive"}`}>{sel.balance > 0 ? "To receive" : "To pay"} {rs(Math.abs(sel.balance))}</span>
                  {sel.supplierId ? <Button size="sm" variant="outline" onClick={() => { const sup = (s.data?.suppliers ?? []).find((x) => x.id === sel.supplierId); setForm({ name: sup?.name ?? sel.name, phone: sup?.phone ?? sel.phone, address: sup?.address ?? "", opening: String(sup?.openingBalance ?? 0) }); }}><Pencil className="size-4" /> Edit</Button> : null}
                  <Button size="sm" variant="outline" onClick={openAdjust}><Scale className="size-4" /> Adjust balance</Button>
                  <Button size="sm" variant="outline" onClick={() => setStOpen((o) => !o)}><FileText className="size-4" /> Statement</Button>
                </div>
              </div>

              {adjOpen ? (
                <div className="space-y-2 rounded-lg border border-primary p-2">
                  <p className="text-xs font-semibold text-muted-foreground">Adjust balance — party ka opening / previous balance set karein (ledger ki shuruaat isi se hogi)</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={adjDir === "receive" ? "default" : "outline"} disabled={!sel.customerId} onClick={() => setAdjDir("receive")}>To receive (humein lene hain)</Button>
                    <Button type="button" size="sm" variant={adjDir === "pay" ? "default" : "outline"} disabled={!sel.supplierId} onClick={() => setAdjDir("pay")}>To pay (humein dene hain)</Button>
                  </div>
                  <div className="flex gap-2">
                    <input className={inputCls} inputMode="decimal" value={adjAmt} onChange={(e) => setAdjAmt(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Amount (0 = koi opening balance nahi)" aria-label="Opening balance" />
                    <Button type="button" size="sm" disabled={adjBusy} onClick={saveAdjust}>{adjBusy ? "Saving…" : "Save"}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAdjOpen(false)}>Cancel</Button>
                  </div>
                </div>
              ) : null}

              {form ? (
                <div className="grid gap-2 rounded-lg border border-primary p-2 sm:grid-cols-2">
                  <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplier name *" />
                  <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
                  <input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
                  <input className={inputCls} value={form.opening} inputMode="decimal" onChange={(e) => setForm({ ...form, opening: e.target.value })} placeholder="Opening balance (we owe)" />
                  <div className="flex gap-2 sm:col-span-2"><Button size="sm" onClick={saveSupplierForm}>Save</Button><Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
                </div>
              ) : null}

              {stOpen ? (
                <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-muted-foreground">From<input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
                    <label className="text-xs text-muted-foreground">To<input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">Include in statement</p>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {OPTS.map(([k, l]) => (
                      <label key={k} className={`flex items-center gap-2 text-xs ${["qty", "unit", "rate", "lineTotal"].includes(k) && !inc.items ? "opacity-50" : ""}`}>
                        <input type="checkbox" className="size-4 accent-primary" checked={inc[k]} disabled={["qty", "unit", "rate", "lineTotal"].includes(k) && !inc.items} onChange={(e) => setInc({ ...inc, [k]: e.target.checked })} />{l}
                      </label>
                    ))}
                  </div>
                  <Button type="button" className="w-full" size="sm" disabled={stBusy} onClick={openStatement}>{stBusy ? "Loading…" : "Preview statement · Print / PDF / Share"}</Button>
                </div>
              ) : null}

              <div className="grid gap-2 rounded-lg border border-border p-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" size="sm" variant={dir === "in" ? "default" : "outline"} onClick={() => setDir("in")}><Wallet className="size-4" /> Payment In</Button>
                  <Button type="button" size="sm" variant={dir === "out" ? "default" : "outline"} onClick={() => setDir("out")}><Wallet className="size-4" /> Payment Out</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                  <input className={inputCls} inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder={dir === "in" ? "Amount received" : "Amount paid"} aria-label="Amount" />
                  <select className={inputCls} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} aria-label="Method">{methods.map((m) => <option key={m}>{m}</option>)}</select>
                  <input className={inputCls} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Note" />
                  <Button disabled={payBusy} onClick={payNow}>{payBusy ? "Saving…" : dir === "in" ? "Save Payment In" : "Save Payment Out"}</Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Detail</th><th>Ref</th><th className="text-right">Debit (to receive)</th><th className="text-right">Credit (to pay)</th><th className="text-right">Balance</th><th className="w-8" /></tr></thead>
                  <tbody>
                    <tr className="border-t border-border"><td colSpan={5} className="py-1.5">Opening balance</td><td className="text-right">{rs(ledgerOpening)}</td><td /></tr>
                    {ledgerLoading ? <tr className="border-t border-border"><td colSpan={7} className="py-2 text-center text-xs text-muted-foreground">Loading ledger…</td></tr> : null}
                    {ledgerRows.map((r, i) => (
                      <tr key={`${r.entity}-${r.id}-${i}`} className={`border-t border-border ${r.entity !== "payment" ? "cursor-pointer hover:bg-accent/60" : ""}`} onClick={() => openRow(r)} title={r.entity === "sale" ? "Click to open / edit" : r.entity === "purchase" ? "Click to preview" : undefined}>
                        <td className="py-1.5 text-xs">{new Date(r.date).toLocaleDateString("en-PK")}</td><td>{r.kind}</td><td className="text-xs">{r.ref}</td>
                        <td className="text-right">{r.debit ? rs(r.debit) : ""}</td><td className="text-right">{r.credit ? rs(r.credit) : ""}</td><td className="text-right font-semibold">{rs(r.balance)}</td>
                        <td className="relative text-right" onClick={(e) => e.stopPropagation()}>
                          {r.entity === "sale" || (r.entity === "payment" && r.standalone) ? (
                            <>
                              <button type="button" aria-label={`Actions for ${r.ref || r.kind}`} disabled={txBusy} onClick={() => setMenuFor(menuFor === r.id ? null : r.id)} className="rounded-md border border-border p-1 hover:bg-accent disabled:opacity-50"><MoreVertical className="size-3.5" /></button>
                              {menuFor === r.id ? (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                                  <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-popover py-1 text-left shadow-xl">
                                    {r.entity === "sale" ? (
                                      <>
                                        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent" onClick={() => { setMenuFor(null); void openEditSale(r); }}><Pencil className="size-4" /> Edit</button>
                                        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent" onClick={() => { setMenuFor(null); void deleteSale(r); }}><Trash2 className="size-4" /> Delete</button>
                                      </>
                                    ) : (
                                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent" onClick={() => { setMenuFor(null); void deletePayment(r); }}><Trash2 className="size-4" /> Delete</button>
                                    )}
                                  </div>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!ledgerLoading && !ledgerRows.length ? <tr className="border-t border-border"><td colSpan={7} className="py-2 text-center text-xs text-muted-foreground">No entries yet.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

const r2 = (x: number) => Math.round(x * 100) / 100;
