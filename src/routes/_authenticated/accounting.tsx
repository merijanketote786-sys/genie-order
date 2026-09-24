import { AppShell } from "@/components/app-shell";
import { posInput, rs } from "@/components/pos-subnav";
import { usePosAccess } from "@/components/pos-access";
import { usePrintCenter } from "@/components/print-center";
import { Button } from "@/components/ui/button";
import type { PosPerm } from "@/lib/pos-access.functions";
import {
  ACC_TYPES, deleteAccount, getAccountingBase, getAccountingDashboard, getBalanceSheet, getGeneralLedger, getPayables, getProfitLoss,
  getReceivables, getTrialBalance, journalAction, listJournals, saveAccSettings, saveAccount, saveJournal, syncAccounting,
  type Account, type AccType,
} from "@/lib/accounting.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounting")({
  head: () => ({
    meta: [
      { title: "Accounting — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Double-entry accounting: chart of accounts, journals, ledger, trial balance, P&L, balance sheet, AR and AP." },
      { property: "og:title", content: "Accounting — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Double-entry accounting linked to POS, purchases, payments and expenses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountingPage,
});

const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const yearStart = () => `${today().slice(0, 4)}-01-01`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const n = (v: number) => (Math.abs(v) < 0.005 ? "" : rs(v));

const TABS: { id: string; label: string; perm: PosPerm }[] = [
  { id: "dash", label: "Dashboard", perm: "view_accounting" },
  { id: "coa", label: "Chart of Accounts", perm: "view_accounting" },
  { id: "jr", label: "Journal Entries", perm: "view_accounting" },
  { id: "gl", label: "General Ledger", perm: "view_ledger" },
  { id: "tb", label: "Trial Balance", perm: "view_trial_balance" },
  { id: "pl", label: "Profit & Loss", perm: "view_pnl" },
  { id: "bs", label: "Balance Sheet", perm: "view_balance_sheet" },
  { id: "ar", label: "Accounts Receivable", perm: "view_ar_ap" },
  { id: "ap", label: "Accounts Payable", perm: "view_ar_ap" },
  { id: "set", label: "Accounting Settings", perm: "view_accounting" },
];

function csv(name: string, head: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob(["\ufeff" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

type Report = { title: string; number: string; head: string[]; rows: (string | number)[][]; align?: ("l" | "r")[]; totals?: { label: string; value: number; bold?: boolean }[]; meta?: [string, string][] };

function useExport() {
  const pc = usePrintCenter();
  const bar = (r: Report | null) => (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={!r} onClick={() => r && pc.preview({ kind: "report", title: r.title, number: r.number, date: new Date(), meta: r.meta, table: { head: r.head, rows: r.rows, align: r.align }, totals: r.totals })}><Printer /> Print / PDF</Button>
      <Button size="sm" variant="outline" disabled={!r} onClick={() => r && csv(r.title.replace(/\W+/g, "-"), r.head, r.rows)}><Download /> CSV / Excel</Button>
    </div>
  );
  return { node: pc.node, bar };
}

const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => <section className={`rounded-xl border border-border bg-card p-3 ${className}`}>{children}</section>;
const Stat = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
  <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`text-lg font-bold ${strong ? (value < 0 ? "text-destructive" : "text-primary") : "text-foreground"}`}>{rs(value)}</p></div>
);
const Th = ({ children, r }: { children?: ReactNode; r?: boolean }) => <th className={`px-2 py-1.5 text-xs font-semibold text-muted-foreground ${r ? "text-right" : "text-left"}`}>{children}</th>;
const Td = ({ children, r, b }: { children?: ReactNode; r?: boolean; b?: boolean }) => <td className={`px-2 py-1.5 ${r ? "text-right tabular-nums" : ""} ${b ? "font-bold" : ""}`}>{children}</td>;

function AccountingPage() {
  const { can } = usePosAccess();
  const tabs = TABS.filter((t) => can(t.perm));
  const [tab, setTab] = useState("dash");
  const base = useQuery({ queryKey: ["acc-base"], queryFn: () => getAccountingBase(), enabled: can("view_accounting") });
  const ex = useExport();

  if (!can("view_accounting")) {
    return <AppShell title="Accounting" subtitle="Double-entry books" active="/accounting"><p className="p-6 text-sm text-muted-foreground">You don't have permission to view accounting.</p></AppShell>;
  }
  const accounts = base.data?.accounts ?? [];
  return (
    <AppShell title="Accounting" subtitle="Double-entry books linked to POS" active="/accounting">
      {ex.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>{t.label}</button>
          ))}
        </nav>
        {tab === "dash" && <Dashboard />}
        {tab === "coa" && <ChartOfAccounts accounts={accounts} used={base.data?.usedIds ?? []} canEdit={can("manage_accounts")} />}
        {tab === "jr" && <Journals accounts={accounts} canCreate={can("create_journal")} canPost={can("post_journal")} />}
        {tab === "gl" && <Ledger accounts={accounts} bar={ex.bar} />}
        {tab === "tb" && <TrialBalance bar={ex.bar} />}
        {tab === "pl" && <ProfitLoss bar={ex.bar} />}
        {tab === "bs" && <BalanceSheet bar={ex.bar} />}
        {tab === "ar" && <Aging kind="ar" bar={ex.bar} />}
        {tab === "ap" && <Aging kind="ap" bar={ex.bar} />}
        {tab === "set" && base.data && <Settings s={base.data.settings} canEdit={can("close_period")} />}
      </div>
    </AppShell>
  );
}

/* ------------------------------- Dashboard ------------------------------- */
function Dashboard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["acc-dash"], queryFn: () => getAccountingDashboard({ data: { today: today() } }) });
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try { const r = await syncAccounting(); toast.success(`Checked ${r.checked} transactions`); qc.invalidateQueries(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Financial year from {data?.fyStart ?? "…"} to today. Values come from posted journal entries.</p>
        <Button size="sm" variant="outline" disabled={busy} onClick={sync}><RefreshCw /> Re-check transactions</Button>
      </div>
      {data?.syncErrors ? <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{data.syncErrors} transaction(s) could not be posted to accounting automatically. Press "Re-check transactions".</p> : null}
      {data ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Cash" value={data.cash} /><Stat label="Bank" value={data.bank} /><Stat label="Receivables" value={data.receivables} />
          <Stat label="Payables" value={data.payables} /><Stat label="Inventory value" value={data.inventory} /><Stat label="Net sales" value={data.sales} />
          <Stat label="Expenses" value={data.expenses} /><Stat label="Gross profit" value={data.gross} strong /><Stat label="Net profit" value={data.net} strong />
        </div>
      ) : <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}

/* ---------------------------- Chart of accounts --------------------------- */
function ChartOfAccounts({ accounts, used, canEdit }: { accounts: Account[]; used: string[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ id?: string; code: string; name: string; type: AccType; parentId: string; opening: string; active: boolean; system?: boolean } | null>(null);
  const usedSet = new Set(used);
  const save = async () => {
    if (!form) return;
    try {
      await saveAccount({ data: { id: form.id, code: form.code, name: form.name, type: form.type, parentId: form.parentId || null, opening: Number(form.opening) || 0, active: form.active } });
      toast.success("Account saved"); setForm(null); qc.invalidateQueries({ queryKey: ["acc-base"] });
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (a: Account) => {
    if (!confirm(`Delete account ${a.code} ${a.name}?`)) return;
    try { await deleteAccount({ data: { id: a.id } }); toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["acc-base"] }); } catch (e) { toast.error(errMsg(e)); }
  };
  const name = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "";
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-bold">Chart of Accounts</p>
        {canEdit && <Button size="sm" onClick={() => setForm({ code: "", name: "", type: "expense", parentId: "", opening: "", active: true })}><Plus /> New account</Button>}
      </div>
      {form && (
        <div className="mb-3 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
          <input className={posInput} placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input className={posInput} placeholder="Account name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className={posInput} value={form.type} disabled={form.system} onChange={(e) => setForm({ ...form, type: e.target.value as AccType })}>
            {ACC_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <select className={posInput} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
            <option value="">No parent</option>
            {accounts.filter((a) => a.id !== form.id).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
          <input className={posInput} inputMode="decimal" placeholder="Opening balance" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} disabled={form.system} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
          <div className="flex gap-2 sm:col-span-3"><Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><Th>Code</Th><Th>Name</Th><Th>Type</Th><Th>Parent</Th><Th r>Opening</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {ACC_TYPES.flatMap((t) => accounts.filter((a) => a.type === t.v).map((a) => (
              <tr key={a.id} className="border-t border-border">
                <Td>{a.code}</Td><Td>{a.name} {a.system && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">system</span>}</Td>
                <Td>{t.label}</Td><Td>{name(a.parentId)}</Td><Td r>{n(a.opening)}</Td><Td>{a.active ? "Active" : "Inactive"}</Td>
                <Td r>{canEdit && <span className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => setForm({ id: a.id, code: a.code, name: a.name, type: a.type, parentId: a.parentId ?? "", opening: String(a.opening || ""), active: a.active, system: a.system })}>Edit</Button>
                  {!a.key && !usedSet.has(a.id) && <Button size="icon" variant="ghost" aria-label="Delete account" onClick={() => del(a)}><Trash2 /></Button>}
                </span>}</Td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Customer and supplier opening balances are added to Accounts Receivable / Payable automatically; differences go to Opening Balance Equity.</p>
    </Card>
  );
}

/* -------------------------------- Journals -------------------------------- */
type Line = { accountId: string; debit: string; credit: string; memo: string };
const SOURCES = [["", "All types"], ["manual", "Manual"], ["sale", "Sales / returns"], ["purchase", "Purchases"], ["payment", "Payments"], ["expense", "Expenses"], ["reversal", "Reversals"]];

function Journals({ accounts, canCreate, canPost }: { accounts: Account[]; canCreate: boolean; canPost: boolean }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["acc-jr", from, to, source, q], queryFn: () => listJournals({ data: { from, to, source: source || undefined, q: q || undefined } }) });
  const blank = (): Line => ({ accountId: "", debit: "", credit: "", memo: "" });
  const [ed, setEd] = useState<{ id?: string; date: string; reference: string; description: string; lines: Line[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : "—"; };
  const td = ed ? ed.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) : 0;
  const tc = ed ? ed.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) : 0;
  const balanced = Math.abs(td - tc) < 0.005 && td > 0;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["acc-jr"] }); qc.invalidateQueries({ queryKey: ["acc-base"] }); qc.invalidateQueries({ queryKey: ["acc-dash"] }); };

  const save = async (post: boolean) => {
    if (!ed || busy) return;
    if (!balanced) return toast.error("Total debit must equal total credit");
    setBusy(true);
    try {
      await saveJournal({ data: { id: ed.id, date: ed.date, reference: ed.reference, description: ed.description, post, lines: ed.lines.filter((l) => l.accountId && (Number(l.debit) || Number(l.credit))).map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo })) } });
      toast.success(post ? "Journal posted" : "Draft saved"); setEd(null); refresh();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const act = async (id: string, action: "post" | "reverse" | "cancel") => {
    let reason: string | undefined;
    if (action === "reverse") { const r = prompt("Reason for reversal"); if (r === null) return; reason = r; }
    if (action === "cancel" && !confirm("Cancel this draft?")) return;
    try { await journalAction({ data: { id, action, date: today(), reason } }); toast.success("Done"); refresh(); } catch (e) { toast.error(errMsg(e)); }
  };
  const setLine = (i: number, p: Partial<Line>) => ed && setEd({ ...ed, lines: ed.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const active = accounts.filter((a) => a.active);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${posInput} w-40`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className={`${posInput} w-40`} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <select className={`${posInput} w-44`} value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input className={`${posInput} w-44`} placeholder="Reference" value={q} onChange={(e) => setQ(e.target.value)} />
        {canCreate && <Button size="sm" onClick={() => setEd({ date: today(), reference: "", description: "", lines: [blank(), blank()] })}><Plus /> Manual journal</Button>}
      </div>
      {ed && (
        <Card className="space-y-2">
          <p className="font-bold">{ed.id ? "Edit draft journal" : "New journal entry"}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className={posInput} type="date" value={ed.date} onChange={(e) => setEd({ ...ed, date: e.target.value })} />
            <input className={posInput} placeholder="Reference" value={ed.reference} onChange={(e) => setEd({ ...ed, reference: e.target.value })} />
            <input className={posInput} placeholder="Description" value={ed.description} onChange={(e) => setEd({ ...ed, description: e.target.value })} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr><Th>Account</Th><Th>Memo</Th><Th r>Debit</Th><Th r>Credit</Th><Th /></tr></thead>
              <tbody>
                {ed.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="p-1"><select className={posInput} value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}><option value="">Select account</option>{active.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
                    <td className="p-1"><input className={posInput} value={l.memo} onChange={(e) => setLine(i, { memo: e.target.value })} /></td>
                    <td className="w-36 p-1"><input className={`${posInput} text-right`} inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} /></td>
                    <td className="w-36 p-1"><input className={`${posInput} text-right`} inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} /></td>
                    <td className="p-1">{ed.lines.length > 2 && <Button size="icon" variant="ghost" aria-label="Remove line" onClick={() => setEd({ ...ed, lines: ed.lines.filter((_, j) => j !== i) })}><Trash2 /></Button>}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-bold"><Td>Total</Td><Td /><Td r>{rs(td)}</Td><Td r>{rs(tc)}</Td><Td /></tr>
              </tbody>
            </table>
          </div>
          <p className={`text-xs ${balanced ? "text-primary" : "text-destructive"}`}>{balanced ? "Balanced" : `Difference: ${rs(Math.abs(td - tc))}`}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEd({ ...ed, lines: [...ed.lines, blank()] })}><Plus /> Line</Button>
            <Button size="sm" variant="outline" disabled={busy || !balanced} onClick={() => save(false)}>Save draft</Button>
            {canPost && <Button size="sm" disabled={busy || !balanced} onClick={() => save(true)}>Save & post</Button>}
            <Button size="sm" variant="ghost" onClick={() => setEd(null)}>Close</Button>
          </div>
        </Card>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr><Th>Date</Th><Th>Reference</Th><Th>Description / lines</Th><Th>Type</Th><Th>Status</Th><Th r>Amount</Th><Th /></tr></thead>
            <tbody>
              {(data?.journals ?? []).map((j) => (
                <tr key={j.id} className="border-t border-border align-top">
                  <Td>{j.date}</Td><Td>{j.reference}</Td>
                  <Td><p>{j.description}</p>{j.lines.map((l, i) => <p key={i} className="text-xs text-muted-foreground">{l.debit ? "Dr" : "\u00a0\u00a0\u00a0Cr"} {accName(l.accountId)} — {rs(l.debit || l.credit)}</p>)}</Td>
                  <Td>{j.source}</Td>
                  <Td>{j.reversedBy ? "Reversed" : j.status}</Td><Td r>{rs(j.total)}</Td>
                  <Td r><span className="flex justify-end gap-1">
                    {j.status === "draft" && canCreate && <Button size="sm" variant="outline" onClick={() => setEd({ id: j.id, date: j.date, reference: j.reference, description: j.description, lines: j.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", memo: l.memo })) })}>Edit</Button>}
                    {j.status === "draft" && canPost && <Button size="sm" onClick={() => act(j.id, "post")}>Post</Button>}
                    {j.status === "draft" && canCreate && <Button size="sm" variant="ghost" onClick={() => act(j.id, "cancel")}>Cancel</Button>}
                    {j.status === "posted" && !j.reversedBy && !j.reversalOf && j.source === "manual" && canPost && <Button size="sm" variant="outline" onClick={() => act(j.id, "reverse")}>Reverse</Button>}
                  </span></Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.journals.length && <p className="p-3 text-sm text-muted-foreground">No journal entries in this period.</p>}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ General ledger ----------------------------- */
type Bar = (r: Report | null) => ReactNode;
function Ledger({ accounts, bar }: { accounts: Account[]; bar: Bar }) {
  const [acc, setAcc] = useState("");
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [ref, setRef] = useState("");
  const [source, setSource] = useState("");
  const accountId = acc || accounts.find((a) => a.key === "cash")?.id || "";
  const { data } = useQuery({ queryKey: ["acc-gl", accountId, from, to, ref, source], enabled: !!accountId, queryFn: () => getGeneralLedger({ data: { accountId, from, to, ref: ref || undefined, source: source || undefined } }) });
  const report: Report | null = data ? {
    title: `General Ledger - ${data.account.code} ${data.account.name}`, number: `${from} to ${to}`,
    head: ["Date", "Reference", "Description", "Debit", "Credit", "Balance"], align: ["l", "l", "l", "r", "r", "r"],
    rows: [["", "", "Opening balance", "", "", data.opening], ...data.rows.map((r) => [r.date, r.reference, r.description, r.debit || "", r.credit || "", r.balance])],
    totals: [{ label: "Closing balance", value: data.closing, bold: true }],
  } : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${posInput} w-60`} value={accountId} onChange={(e) => setAcc(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>
        <input className={`${posInput} w-40`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className={`${posInput} w-40`} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <input className={`${posInput} w-40`} placeholder="Reference" value={ref} onChange={(e) => setRef(e.target.value)} />
        <select className={`${posInput} w-44`} value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {bar(report)}
      </div>
      <Card>
        {data?.filtered && <p className="mb-2 text-xs text-muted-foreground">Filtered view — running balance includes only matching entries.</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead><tr><Th>Date</Th><Th>Reference</Th><Th>Description</Th><Th r>Debit</Th><Th r>Credit</Th><Th r>Balance</Th></tr></thead>
            <tbody>
              <tr className="border-t border-border"><Td /><Td /><Td b>Opening balance</Td><Td /><Td /><Td r b>{rs(data?.opening ?? 0)}</Td></tr>
              {(data?.rows ?? []).map((r, i) => <tr key={i} className="border-t border-border"><Td>{r.date}</Td><Td>{r.reference}</Td><Td>{r.description}</Td><Td r>{n(r.debit)}</Td><Td r>{n(r.credit)}</Td><Td r>{rs(r.balance)}</Td></tr>)}
              <tr className="border-t border-border"><Td /><Td /><Td b>Closing balance</Td><Td /><Td /><Td r b>{rs(data?.closing ?? 0)}</Td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ Trial balance ------------------------------ */
function TrialBalance({ bar }: { bar: Bar }) {
  const [to, setTo] = useState(today());
  const { data } = useQuery({ queryKey: ["acc-tb", to], queryFn: () => getTrialBalance({ data: { to } }) });
  const report: Report | null = data ? { title: "Trial Balance", number: `As of ${to}`, head: ["Code", "Account", "Debit", "Credit"], align: ["l", "l", "r", "r"], rows: [...data.rows.map((r) => [r.code, r.name, r.debit || "", r.credit || ""]), ["", "Total", data.debit, data.credit]] } : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm">As of</span><input className={`${posInput} w-40`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />{bar(report)}</div>
      <Card>
        <table className="w-full text-sm">
          <thead><tr><Th>Code</Th><Th>Account</Th><Th r>Debit</Th><Th r>Credit</Th></tr></thead>
          <tbody>
            {(data?.rows ?? []).map((r) => <tr key={r.code} className="border-t border-border"><Td>{r.code}</Td><Td>{r.name}</Td><Td r>{n(r.debit)}</Td><Td r>{n(r.credit)}</Td></tr>)}
            <tr className="border-t-2 border-border"><Td /><Td b>Total</Td><Td r b>{rs(data?.debit ?? 0)}</Td><Td r b>{rs(data?.credit ?? 0)}</Td></tr>
          </tbody>
        </table>
        {data && <p className={`mt-2 text-sm font-semibold ${data.balanced ? "text-primary" : "text-destructive"}`}>{data.balanced ? "Balanced: total debits equal total credits." : "Not balanced — please contact support."}</p>}
      </Card>
    </div>
  );
}

/* ------------------------------ Profit & loss ------------------------------ */
function ProfitLoss({ bar }: { bar: Bar }) {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const { data: d } = useQuery({ queryKey: ["acc-pl", from, to], queryFn: () => getProfitLoss({ data: { from, to } }) });
  const rows: [string, number | null, boolean?][] = d ? [
    ["Sales", d.sales], ["Less: Sales returns", -d.salesReturns], ["Net sales", d.netSales, true],
    ...d.cogsRows.map((r) => [`  ${r.name}`, -r.amount] as [string, number]), ["Cost of goods sold", -d.cogs, true], ["Gross profit", d.gross, true],
    ["Other income", d.otherIncome], ...d.expRows.map((r) => [`  ${r.name}`, -r.amount] as [string, number]), ["Operating expenses", -d.opex, true],
    ["Other expenses", -d.otherExpenses], [d.net >= 0 ? "Net profit" : "Net loss", d.net, true],
  ] : [];
  const report: Report | null = d ? { title: "Profit & Loss", number: `${from} to ${to}`, head: ["Item", "Amount"], align: ["l", "r"], rows: rows.map(([l, v]) => [l, v ?? ""]) } : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${posInput} w-40`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className={`${posInput} w-40`} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />{bar(report)}
      </div>
      <Card className="max-w-2xl">
        <table className="w-full text-sm"><tbody>
          {rows.map(([l, v, b], i) => <tr key={i} className="border-t border-border"><Td b={b}>{l}</Td><Td r b={b}>{rs(v ?? 0)}</Td></tr>)}
        </tbody></table>
      </Card>
    </div>
  );
}

/* ------------------------------ Balance sheet ------------------------------ */
function BalanceSheet({ bar }: { bar: Bar }) {
  const [to, setTo] = useState(today());
  const { data: d } = useQuery({ queryKey: ["acc-bs", to], queryFn: () => getBalanceSheet({ data: { to } }) });
  const report: Report | null = d ? {
    title: "Balance Sheet", number: `As of ${to}`, head: ["Section", "Account", "Amount"], align: ["l", "l", "r"],
    rows: [...d.assets.map((r) => ["Assets", r.name, r.amount]), ["", "Total assets", d.totalAssets], ...d.liabilities.map((r) => ["Liabilities", r.name, r.amount]), ["", "Total liabilities", d.totalLiabilities], ...d.equity.map((r) => ["Equity", r.name, r.amount]), ["", "Total equity", d.totalEquity]],
  } : null;
  const Sec = ({ title, rows, total }: { title: string; rows: { name: string; amount: number }[]; total: number }) => (
    <Card>
      <p className="mb-1 font-bold">{title}</p>
      <table className="w-full text-sm"><tbody>
        {rows.map((r) => <tr key={r.name} className="border-t border-border"><Td>{r.name}</Td><Td r>{rs(r.amount)}</Td></tr>)}
        <tr className="border-t-2 border-border"><Td b>Total {title.toLowerCase()}</Td><Td r b>{rs(total)}</Td></tr>
      </tbody></table>
    </Card>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm">As of</span><input className={`${posInput} w-40`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />{bar(report)}</div>
      {d && <>
        <div className="grid gap-3 lg:grid-cols-3"><Sec title="Assets" rows={d.assets} total={d.totalAssets} /><Sec title="Liabilities" rows={d.liabilities} total={d.totalLiabilities} /><Sec title="Equity" rows={d.equity} total={d.totalEquity} /></div>
        <p className={`text-sm font-semibold ${d.balanced ? "text-primary" : "text-destructive"}`}>Assets {rs(d.totalAssets)} {d.balanced ? "=" : "≠"} Liabilities + Equity {rs(d.totalLiabilities + d.totalEquity)}</p>
      </>}
    </div>
  );
}

/* --------------------------------- AR / AP -------------------------------- */
function Aging({ kind, bar }: { kind: "ar" | "ap"; bar: Bar }) {
  const { data: d } = useQuery({ queryKey: ["acc-aging", kind], queryFn: () => (kind === "ar" ? getReceivables : getPayables)({ data: { today: today() } }) });
  const party = kind === "ar" ? "Customer" : "Supplier";
  const doc = kind === "ar" ? "Invoice" : "Bill";
  const report: Report | null = useMemo(() => d ? {
    title: kind === "ar" ? "Accounts Receivable" : "Accounts Payable", number: today(),
    head: [party, doc, "Date", "Due date", "Amount", "Paid", "Outstanding", "Days overdue"], align: ["l", "l", "l", "l", "r", "r", "r", "r"],
    rows: d.rows.map((r) => [r.partyName, r.ref, r.date, r.due, r.amount, r.paid, r.outstanding, r.days]),
    meta: [["Current", rs(d.aging.current)], ["1-30", rs(d.aging.d30)], ["31-60", rs(d.aging.d60)], ["61-90", rs(d.aging.d90)], ["90+", rs(d.aging.d90p)]],
    totals: [{ label: "Total outstanding", value: d.total, bold: true }],
  } : null, [d, kind, party, doc]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Due date = {doc.toLowerCase()} date + {d?.creditDays ?? 30} days (change in Accounting Settings). Payments are applied to the oldest {doc.toLowerCase()}s first.</p>{bar(report)}</div>
      {d && <>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Stat label="Current" value={d.aging.current} /><Stat label="1–30 days" value={d.aging.d30} /><Stat label="31–60 days" value={d.aging.d60} />
          <Stat label="61–90 days" value={d.aging.d90} /><Stat label="90+ days" value={d.aging.d90p} /><Stat label="Total" value={d.total} strong />
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead><tr><Th>{party}</Th><Th>{doc}</Th><Th>Date</Th><Th>Due date</Th><Th r>Amount</Th><Th r>Paid</Th><Th r>Outstanding</Th><Th r>Days overdue</Th></tr></thead>
              <tbody>{d.rows.map((r, i) => <tr key={i} className="border-t border-border"><Td>{r.partyName}</Td><Td>{r.ref}</Td><Td>{r.date}</Td><Td>{r.due}</Td><Td r>{rs(r.amount)}</Td><Td r>{n(r.paid)}</Td><Td r b>{rs(r.outstanding)}</Td><Td r>{r.days || ""}</Td></tr>)}</tbody>
            </table>
            {!d.rows.length && <p className="p-3 text-sm text-muted-foreground">Nothing outstanding.</p>}
          </div>
        </Card>
        <Card>
          <p className="mb-1 font-bold">{party} balances</p>
          <table className="w-full text-sm"><tbody>{d.summary.map((s) => <tr key={s.party} className="border-t border-border"><Td>{s.name}</Td><Td r>{s.advance > 0 ? <span className="text-xs text-muted-foreground">advance {rs(s.advance)}</span> : null}</Td><Td r b>{rs(s.balance)}</Td></tr>)}</tbody></table>
        </Card>
      </>}
    </div>
  );
}

/* -------------------------------- Settings -------------------------------- */
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
function Settings({ s, canEdit }: { s: { fyStart: string | null; fyEnd: string | null; lockDate: string | null; creditDays: number }; canEdit: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ fyStart: s.fyStart ?? "", fyEnd: s.fyEnd ?? "", lockDate: s.lockDate ?? "", creditDays: String(s.creditDays) });
  const save = async () => {
    if (f.lockDate && f.lockDate !== (s.lockDate ?? "") && !confirm(`Lock all postings up to ${f.lockDate}? Existing entries are not changed.`)) return;
    try {
      await saveAccSettings({ data: { fyStart: f.fyStart || null, fyEnd: f.fyEnd || null, lockDate: f.lockDate || null, creditDays: Math.max(0, Math.round(Number(f.creditDays) || 0)) } });
      toast.success("Accounting settings saved"); qc.invalidateQueries();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Card className="max-w-xl space-y-3">
      <p className="font-bold">Financial period</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Financial year start"><input className={posInput} type="date" disabled={!canEdit} value={f.fyStart} onChange={(e) => setF({ ...f, fyStart: e.target.value })} /></Field>
        <Field label="Financial year end"><input className={posInput} type="date" disabled={!canEdit} value={f.fyEnd} onChange={(e) => setF({ ...f, fyEnd: e.target.value })} /></Field>
        <Field label="Lock postings up to (inclusive)"><input className={posInput} type="date" disabled={!canEdit} value={f.lockDate} onChange={(e) => setF({ ...f, lockDate: e.target.value })} /></Field>
        <Field label="Credit days for due dates (AR/AP)"><input className={posInput} inputMode="numeric" disabled={!canEdit} value={f.creditDays} onChange={(e) => setF({ ...f, creditDays: e.target.value })} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">No journal can be posted on or before the lock date. Closing a period never changes past transactions. New POS entries dated in a locked period are posted on the first open day.</p>
      {canEdit ? <Button size="sm" onClick={save}>Save</Button> : <p className="text-xs text-muted-foreground">Only Admin can change periods.</p>}
    </Card>
  );
}
