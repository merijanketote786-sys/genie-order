import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Lock, Plus } from "lucide-react";
import { del } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readOutbox, isOnline } from "@/lib/offline-sync";
import { setSelectedStoreId } from "@/lib/pos-store-client";

type Firm = { id: string; name: string; current: boolean; has_pin: boolean };
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Fully reloads the app inside the chosen firm so no data from the previous firm stays on screen. */
async function enterFirm(id: string, pin?: string) {
  const { error } = await rpc("pos_switch_firm", { _id: id, _pin: pin ?? null });
  if (error) throw new Error(error.message);
  setSelectedStoreId("");
  try { await del("hbpos-query-cache"); } catch { /* ignore */ }
  window.location.reload();
}

const pinInput = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground tracking-widest";

export function FirmSwitcher() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["pos-firms"],
    queryFn: async () => { const { data, error } = await rpc("pos_list_firms"); if (error) throw new Error(error.message); return (data ?? []) as Firm[]; },
    staleTime: 60_000,
  });
  const firms = data ?? [];
  const [open, setOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [name, setName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinFor, setPinFor] = useState<Firm | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  if (!firms.length) return null;
  const current = firms.find((f) => f.current);

  const guard = async () => {
    if (!isOnline()) { toast.error("Connect to the internet to change firm"); return false; }
    if ((await readOutbox()).length) { toast.error("Sync pending offline entries before changing firm"); return false; }
    return true;
  };
  const change = async (id: string) => {
    if (id === current?.id || busy) return;
    if (!(await guard())) return;
    const firm = firms.find((f) => f.id === id);
    if (firm?.has_pin) { setPin(""); setPinFor(firm); return; }
    setBusy(true);
    try { await enterFirm(id); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not change firm"); setBusy(false); }
  };
  const submitPin = async () => {
    if (!pinFor || busy) return;
    if (!pin.trim()) return toast.error("PIN likhein");
    setBusy(true);
    try { await enterFirm(pinFor.id, pin); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not change firm"); setBusy(false); }
  };
  const create = async () => {
    const n = name.trim();
    if (!n) return toast.error("Enter a firm name");
    if (newPin && !/^\d{4,8}$/.test(newPin)) return toast.error("PIN 4 se 8 digits ka hona chahiye");
    if (!(await guard())) return;
    setBusy(true);
    try {
      const { data: id, error } = await rpc("pos_create_firm", { _name: n });
      if (error) throw new Error(error.message);
      if (newPin) {
        const { error: pinErr } = await rpc("pos_set_firm_pin", { _firm: id, _pin: newPin });
        if (pinErr) toast.error("Firm ban gayi lekin PIN set nahi hua");
      }
      toast.success(`Firm "${n}" created`);
      await enterFirm(id as string, newPin || undefined);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create firm"); setBusy(false); }
  };

  return (
    <div className="mb-3 flex items-center gap-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-sidebar-border bg-background px-2">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <select aria-label="Firm" disabled={busy} className="h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none" value={current?.id ?? ""} onChange={(e) => change(e.target.value)}>
          {!current ? <option value="">Select firm</option> : null}
          {firms.map((f) => <option key={f.id} value={f.id}>{f.name}{f.has_pin ? " 🔒" : ""}</option>)}
        </select>
      </div>
      <Button size="icon-sm" variant="outline" aria-label="Firm PIN lock settings" title="Set or remove a firm PIN lock" onClick={() => setLockOpen(true)}><Lock /></Button>
      <Button size="icon-sm" variant="outline" aria-label="Add firm" title="Add a new firm" onClick={() => { setName(""); setNewPin(""); setOpen(true); }}><Plus /></Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add new firm</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Each firm has its own stores, items, parties, bills, accounts and staff. Nothing is shared between firms.</p>
          <input autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} placeholder="Firm name" aria-label="Firm name" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
          <label className="block text-sm text-foreground">PIN lock (optional)
            <input maxLength={8} inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} placeholder="4-8 digits" aria-label="Firm PIN" className={pinInput} />
            <span className="mt-1 block text-xs text-muted-foreground">Is firm ko kholne ke liye PIN lagega. Khali chhoren to PIN nahi hoga.</span>
          </label>
          <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create and open firm"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pinFor} onOpenChange={(b) => { if (!b) setPinFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{pinFor?.name} — PIN</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Ye firm PIN se lock hai. Kholne ke liye PIN likhein.</p>
          <input autoFocus type="password" maxLength={8} inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") void submitPin(); }} placeholder="PIN" aria-label="Firm PIN" className={pinInput} />
          <Button onClick={submitPin} disabled={busy}>{busy ? "Opening…" : "Open firm"}</Button>
        </DialogContent>
      </Dialog>

      <FirmLockDialog open={lockOpen} onOpenChange={setLockOpen} firms={firms} onChanged={() => qc.invalidateQueries({ queryKey: ["pos-firms"] })} />
    </div>
  );
}

function FirmLockDialog({ open, onOpenChange, firms, onChanged }: { open: boolean; onOpenChange: (b: boolean) => void; firms: Firm[]; onChanged: () => void }) {
  const [firmId, setFirmId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const target = firms.find((f) => f.id === firmId) ?? firms[0] ?? null;
  const save = async (clear: boolean) => {
    if (!target || busy) return;
    if (!clear && !/^\d{4,8}$/.test(pin)) return toast.error("PIN 4 se 8 digits ka hona chahiye");
    setBusy(true);
    try {
      const { error } = await rpc("pos_set_firm_pin", { _firm: target.id, _pin: clear ? null : pin });
      if (error) throw new Error(error.message);
      toast.success(clear ? `PIN removed from "${target.name}"` : `PIN set for "${target.name}"`);
      setPin(""); onChanged(); onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save PIN"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Firm PIN lock</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Firm chunein aur us ke liye PIN set ya remove karein. PIN wali firm kholne par PIN mange gi.</p>
        <label className="block text-sm text-foreground">Firm
          <select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" value={target?.id ?? ""} onChange={(e) => setFirmId(e.target.value)} aria-label="Firm">
            {firms.map((f) => <option key={f.id} value={f.id}>{f.name}{f.has_pin ? " (PIN on)" : ""}</option>)}
          </select>
        </label>
        <label className="block text-sm text-foreground">New PIN
          <input type="password" maxLength={8} inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") void save(false); }} placeholder="4-8 digits" aria-label="New firm PIN" className={pinInput} />
        </label>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => save(false)} disabled={busy}>{busy ? "Saving…" : "Save PIN"}</Button>
          <Button variant="outline" onClick={() => save(true)} disabled={busy || !target?.has_pin}>Remove PIN</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
