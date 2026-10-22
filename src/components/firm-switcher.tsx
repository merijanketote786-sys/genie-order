import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import { del } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readOutbox, isOnline } from "@/lib/offline-sync";
import { setSelectedStoreId } from "@/lib/pos-store-client";

type Firm = { id: string; name: string; current: boolean };
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Fully reloads the app inside the chosen firm so no data from the previous firm stays on screen. */
async function enterFirm(id: string) {
  const { error } = await rpc("pos_switch_firm", { _id: id });
  if (error) throw new Error(error.message);
  setSelectedStoreId("");
  try { await del("hbpos-query-cache"); } catch { /* ignore */ }
  window.location.reload();
}

export function FirmSwitcher() {
  const { data } = useQuery({
    queryKey: ["pos-firms"],
    queryFn: async () => { const { data, error } = await rpc("pos_list_firms"); if (error) throw new Error(error.message); return (data ?? []) as Firm[]; },
    staleTime: 60_000,
  });
  const firms = data ?? [];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
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
    setBusy(true);
    try { await enterFirm(id); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not change firm"); setBusy(false); }
  };
  const create = async () => {
    const n = name.trim();
    if (!n) return toast.error("Enter a firm name");
    if (!(await guard())) return;
    setBusy(true);
    try {
      const { data: id, error } = await rpc("pos_create_firm", { _name: n });
      if (error) throw new Error(error.message);
      toast.success(`Firm "${n}" created`);
      await enterFirm(id as string);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create firm"); setBusy(false); }
  };

  return (
    <div className="mb-3 flex items-center gap-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-sidebar-border bg-background px-2">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <select aria-label="Firm" disabled={busy} className="h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none" value={current?.id ?? ""} onChange={(e) => change(e.target.value)}>
          {!current ? <option value="">Select firm</option> : null}
          {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <Button size="icon-sm" variant="outline" aria-label="Add firm" title="Add a new firm" onClick={() => setOpen(true)}><Plus /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add new firm</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Each firm has its own stores, items, parties, bills, accounts and staff. Nothing is shared between firms.</p>
          <input autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} placeholder="Firm name" aria-label="Firm name" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
          <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create and open firm"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
