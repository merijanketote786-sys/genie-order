import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { posInput, rs } from "@/components/pos-subnav";
import { addBankAccount, getCashCount, listMoneyAccounts, saveCashCount, type MoneyAccount } from "@/lib/money-accounts.functions";
import { getDayBook, saveCashEntry } from "@/lib/ledger.functions";

export const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Balance ko naye amount par lane ke liye farq ki entry (accounting mein Opening Balance Equity ke against). */
async function adjustTo(acc: MoneyAccount, target: number, note: string, date = localDate()) {
  const diff = Math.round((target - acc.balance) * 100) / 100;
  if (Math.abs(diff) < 0.01) return false;
  await saveCashEntry({ data: { date, direction: diff > 0 ? "in" : "out", method: acc.kind === "cash" ? "Cash" : acc.name, category: acc.kind === "cash" ? "Cash adjustment" : "Balance adjustment", amount: Math.abs(diff), note: note || `Adjusted to ${target}`, clientRef: crypto.randomUUID() } });
  return true;
}

/** Shaam ko galle (till) mein mojood cash darj karna. */
export function CashCountPanel({ initialDate }: { initialDate?: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(initialDate ?? localDate());
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const day = useQuery({ queryKey: ["daybook", date], queryFn: () => getDayBook({ data: { date, tzOffsetMin: new Date(`${date}T12:00:00`).getTimezoneOffset() } }) });
  const saved = useQuery({ queryKey: ["cash-count", date], queryFn: () => getCashCount({ data: { date } }) });
  const expected = day.data?.closing ?? 0;
  const c = counted.trim() ? Number(counted) : null;
  const diff = c != null && Number.isFinite(c) ? Math.round((c - expected) * 100) / 100 : null;

  const save = async (adjust: boolean) => {
    if (c == null || !(c >= 0)) { toast.error("Enter the cash counted in the till"); return; }
    setBusy(true);
    try {
      await saveCashCount({ data: { date, counted: c, expected, note: note || undefined } });
      if (adjust && diff && Math.abs(diff) >= 0.01) {
        await saveCashEntry({ data: { date, direction: diff > 0 ? "in" : "out", method: "Cash", category: "Cash adjustment", amount: Math.abs(diff), note: `Till count ${diff > 0 ? "excess" : "short"}${note ? " · " + note : ""}`, clientRef: crypto.randomUUID() } });
      }
      toast.success(adjust && diff ? "Cash count saved and cash in hand adjusted" : "Cash count saved");
      qc.invalidateQueries({ queryKey: ["daybook"] }); qc.invalidateQueries({ queryKey: ["cash-count"] }); qc.invalidateQueries({ queryKey: ["money-accounts"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 text-sm">
      <label className="block space-y-1"><span className="text-xs text-muted-foreground">Date</span><input className={`${posInput} max-w-xs`} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Expected cash (system)</p><p className="text-lg font-bold">{day.data ? rs(expected) : "…"}</p></div>
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Saved count</p><p className="text-lg font-bold">{saved.data?.count ? rs(saved.data.count.counted) : "Not saved"}</p></div>
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Difference</p><p className={`text-lg font-bold ${diff == null ? "" : Math.abs(diff) < 0.01 ? "text-primary" : "text-destructive"}`}>{diff == null ? "—" : Math.abs(diff) < 0.01 ? "Matched" : `${diff > 0 ? "Excess" : "Short"} ${rs(Math.abs(diff))}`}</p></div>
      </div>
      <label className="block space-y-1"><span className="text-xs text-muted-foreground">Cash in the till right now</span><input className={`${posInput} max-w-xs text-lg`} inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" autoFocus /></label>
      <label className="block space-y-1"><span className="text-xs text-muted-foreground">Note (optional)</span><input className={`${posInput} max-w-md`} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => save(false)}>Save count</Button>
        <Button variant="outline" disabled={busy || diff == null || Math.abs(diff) < 0.01} onClick={() => save(true)}>Save & adjust cash in hand</Button>
      </div>
      <p className="text-xs text-muted-foreground">"Save & adjust" makes the system cash equal to the counted cash; the difference is recorded as a cash adjustment in the day book and accounting.</p>
    </div>
  );
}

/** Cash in hand + bank accounts: balances, add bank account, adjust balance. */
export function MoneyAccountsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["money-accounts"], queryFn: () => listMoneyAccounts() });
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);
  const [adj, setAdj] = useState<{ acc: MoneyAccount; value: string; note: string } | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["money-accounts"] }); qc.invalidateQueries({ queryKey: ["daybook"] }); qc.invalidateQueries({ queryKey: ["pos-access"] }); qc.invalidateQueries(); };

  const add = async () => {
    if (name.trim().length < 2) { toast.error("Enter the account name, e.g. Meezan Bank"); return; }
    setBusy(true);
    try { await addBankAccount({ data: { name: name.trim(), opening: Number(opening) || 0 } }); toast.success("Bank account added — it now shows in payment methods"); setName(""); setOpening(""); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  const saveAdj = async () => {
    if (!adj) return;
    const t = Number(adj.value);
    if (!adj.value.trim() || !Number.isFinite(t)) { toast.error("Enter the correct balance"); return; }
    setBusy(true);
    try { const changed = await adjustTo(adj.acc, t, adj.note); toast.success(changed ? "Balance adjusted" : "Balance is already correct"); setAdj(null); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 text-sm">
      <section className="rounded-xl border border-border p-3">
        <p className="mb-2 font-bold">Accounts & balances</p>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
        <div className="divide-y divide-border">
          {(data?.accounts ?? []).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div><p className="font-semibold">{a.name}</p><p className="text-xs text-muted-foreground">{a.kind === "cash" ? "Cash" : "Bank / wallet"} · {a.code}</p></div>
              <div className="flex items-center gap-2"><b className={a.balance < 0 ? "text-destructive" : ""}>{rs(a.balance)}</b><Button size="sm" variant="outline" onClick={() => setAdj({ acc: a, value: String(a.balance), note: "" })}>Adjust</Button></div>
            </div>
          ))}
        </div>
      </section>
      {adj ? (
        <section className="space-y-2 rounded-xl border border-primary p-3">
          <p className="font-bold">Adjust balance — {adj.acc.name}</p>
          <p className="text-xs text-muted-foreground">Current: {rs(adj.acc.balance)}. Enter the actual balance; the difference is posted as an adjustment.</p>
          <div className="flex flex-wrap gap-2">
            <input className={`${posInput} max-w-[12rem]`} inputMode="decimal" value={adj.value} onChange={(e) => setAdj({ ...adj, value: e.target.value })} aria-label="Correct balance" autoFocus />
            <input className={`${posInput} max-w-xs`} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Note (optional)" aria-label="Note" />
            <Button disabled={busy} onClick={saveAdj}>Save</Button>
            <Button variant="ghost" onClick={() => setAdj(null)}>Cancel</Button>
          </div>
        </section>
      ) : null}
      <section className="space-y-2 rounded-xl border border-border p-3">
        <p className="font-bold">Add bank account</p>
        <div className="flex flex-wrap gap-2">
          <input className={`${posInput} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meezan Bank, HBL, JazzCash shop" aria-label="Account name" />
          <input className={`${posInput} max-w-[12rem]`} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Opening balance" aria-label="Opening balance" />
          <Button disabled={busy} onClick={add}>Add account</Button>
        </div>
        <p className="text-xs text-muted-foreground">New accounts appear as payment methods on invoices, purchases, payments and expenses; money received or paid through them updates their balance.</p>
      </section>
    </div>
  );
}
