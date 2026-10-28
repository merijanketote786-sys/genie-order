import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PosSubnav } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
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
  const tabRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusTab = useRef(false);
  useEffect(() => {
    const tab = tabRefs.current.get(active);
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focusTab.current) { tab?.focus({ preventScroll: true }); focusTab.current = false; }
  }, [active]);

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
    focusTab.current = true;
    const id = ++seq.current;
    setTabs((t) => [...t, { id, label: Math.max(0, ...t.map((x) => x.label)) + 1 }]);
    setActive(id);
  };
  const remove = (id: number) => {
    if (active === id) focusTab.current = true;
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
        <div className="mt-3 flex min-w-0 items-end gap-1 border-b border-border">
        <div role="tablist" aria-label="Bills" className="flex min-w-0 items-end gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <div key={t.id} className={`flex shrink-0 items-center rounded-t-md border border-b-0 text-sm ${on ? "border-border bg-card font-semibold text-foreground" : "border-transparent bg-muted text-muted-foreground hover:text-foreground"}`}>
                <Button ref={(node) => { if (node) tabRefs.current.set(t.id, node); else tabRefs.current.delete(t.id); }} type="button" variant="ghost" role="tab" id={`bill-tab-${t.id}`} aria-controls={`bill-panel-${t.id}`} aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => setActive(t.id)} onKeyDown={(e) => {
                  const index = tabs.findIndex((tab) => tab.id === t.id);
                  const target = e.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length] : e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : undefined;
                  if (target) { e.preventDefault(); focusTab.current = true; setActive(target.id); }
                }} className="h-10 rounded-none px-3">
                  Bill {t.label}{guards[t.id]?.dirty ? " •" : ""}
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => askClose(t.id)} aria-label={`Close bill ${t.label}`} title="Close bill" className="size-9 rounded-sm">
                  <X className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
          <Button type="button" size="icon-sm" variant="outline" onClick={addTab} aria-label="New bill" title="New bill" className="mb-1 ml-1 shrink-0 rounded-md">
            <Plus className="size-4" />
          </Button>
        </div>
        {tabs.map((t) => (
          <div key={t.id} id={`bill-panel-${t.id}`} role="tabpanel" aria-labelledby={`bill-tab-${t.id}`} hidden={t.id !== active} className={t.id === active ? "flex min-h-0 flex-1 flex-col" : ""}>
            <EmbeddedUnsavedCtx.Provider value={ctxFor(t.id)}>
              <Page tabbed active={t.id === active} />
            </EmbeddedUnsavedCtx.Provider>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
