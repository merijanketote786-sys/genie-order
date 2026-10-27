import { useMemo, useRef, useState, type ComponentType } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PosSubnav } from "@/components/pos-subnav";
import { EmbeddedUnsavedCtx, UnsavedCloseDialog, useUnsavedGuard, type UnsavedGuardState } from "@/hooks/use-unsaved-guard";

type PageProps = { tabbed?: boolean; active?: boolean };
type Tab = { id: number; label: number };

/** Each tab is its own independent bill; hidden tabs stay mounted so entries survive switching. */
export function PosTabs({ Page }: { Page: ComponentType<PageProps> }) {
  const seq = useRef(1);
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, label: 1 }]);
  const [active, setActive] = useState(1);
  const [guards, setGuards] = useState<Record<number, UnsavedGuardState>>({});
  const [closing, setClosing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const ctxs = useMemo(() => new Map<number, { setGuard: (g: UnsavedGuardState) => void }>(), []);
  const ctxFor = (id: number) => {
    let c = ctxs.get(id);
    if (!c) {
      c = { setGuard: (g) => setGuards((m) => (m[id] === g ? m : { ...m, [id]: g })) };
      ctxs.set(id, c);
    }
    return c;
  };

  const addTab = () => {
    const id = ++seq.current;
    setTabs((t) => [...t, { id, label: Math.max(0, ...t.map((x) => x.label)) + 1 }]);
    setActive(id);
  };
  const remove = (id: number) => {
    setTabs((t) => {
      const i = t.findIndex((x) => x.id === id);
      const next = t.filter((x) => x.id !== id);
      if (!next.length) {
        const nid = ++seq.current;
        setActive(nid);
        return [{ id: nid, label: 1 }];
      }
      if (active === id) setActive(next[Math.max(0, i - 1)].id);
      return next;
    });
    setGuards((m) => { const { [id]: _, ...rest } = m; return rest; });
    ctxs.delete(id);
  };
  const askClose = (id: number) => {
    if (guards[id]?.dirty) { setActive(id); setClosing(id); } else remove(id);
  };
  const saveAndClose = async () => {
    if (closing == null) return;
    setSaving(true);
    try {
      await guards[closing]?.onSave?.();
      remove(closing);
      setClosing(null);
    } catch {
      toast.error("Bill was not saved — fix the entries and try again");
    } finally { setSaving(false); }
  };

  // Leaving the POS screen while any bill tab has entries shows the same warning.
  const anyDirty = Object.values(guards).some((g) => g?.dirty);
  const guardNode = useUnsavedGuard(anyDirty, guards[active]?.dirty ? guards[active]?.onSave : undefined);

  return (
    <AppShell title="POS Billing" subtitle="Counter + phone sales" active="/pos" wide>
      <div className="flex min-h-0 flex-1 flex-col pt-3">
        <PosSubnav />
        {guardNode}
        <UnsavedCloseDialog
          open={closing != null}
          saving={saving}
          onCancel={() => setClosing(null)}
          onLeave={() => { if (closing != null) remove(closing); setClosing(null); }}
          onSave={() => void saveAndClose()}
        />
        <div role="tablist" aria-label="Bills" className="mt-3 flex items-end gap-1 overflow-x-auto border-b border-border">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <div key={t.id} className={`flex shrink-0 items-center rounded-t-md border border-b-0 text-sm ${on ? "border-border bg-card font-semibold text-foreground" : "border-transparent bg-muted text-muted-foreground hover:text-foreground"}`}>
                <button type="button" role="tab" aria-selected={on} onClick={() => setActive(t.id)} className="px-3 py-2">
                  Bill {t.label}{guards[t.id]?.dirty ? " •" : ""}
                </button>
                <button type="button" onClick={() => askClose(t.id)} aria-label={`Close bill ${t.label}`} title="Close bill" className="mr-1 rounded-sm p-1 hover:bg-accent hover:text-accent-foreground">
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
          <button type="button" onClick={addTab} aria-label="New bill" title="New bill" className="mb-1 ml-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-accent">
            <Plus className="size-4" />
          </button>
        </div>
        {tabs.map((t) => (
          <div key={t.id} role="tabpanel" hidden={t.id !== active} className={t.id === active ? "flex min-h-0 flex-1 flex-col" : ""}>
            <EmbeddedUnsavedCtx.Provider value={ctxFor(t.id)}>
              <Page tabbed active={t.id === active} />
            </EmbeddedUnsavedCtx.Provider>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
