import { PrintTemplatesPicker } from "@/components/settings/print-templates";
import { AppShell } from "@/components/app-shell";
import { usePosAccess } from "@/components/pos-access";
import { usePrintCenter } from "@/components/print-center";
import { PosSubnav } from "@/components/pos-subnav";
import { FIELDS, SECTIONS, type Field, type SectionId } from "@/components/settings/schema";
import { AdvancedStatus, AuditSection, BackupSection, InvoiceFieldsEditor, LogoField, PaymentsEditor, PrintersManager, SuppliersInfo, TaxRatesEditor, UsersSection, VyaparSection, inp, sampleDoc } from "@/components/settings/sections";
import { Button } from "@/components/ui/button";
import { savePosSettings } from "@/lib/pos-access.functions";
import { getPath, resolveCfg, setPath, type PaperFormat, type PosConfig } from "@/lib/pos-config";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Eye, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pos-settings")({
  head: () => ({
    meta: [
      { title: "Business Settings & Printing — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Business, POS, sales, inventory, tax, printing, printers, permissions, backup, Vyapar sync and audit settings in one place — with search." },
      { property: "og:title", content: "Business Settings & Printing — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Advanced POS settings and printing system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsHub,
});

/** Custom (non-schema) blocks har section me. keywords search ke liye. */
const CUSTOM: Partial<Record<SectionId, { keywords: string; render: (p: { draft: PosConfig; upd: (p: string, v: unknown) => void; disabled: boolean; dirty: boolean; saving: boolean; onSave: () => void }) => ReactNode }[]>> = {
  business: [{ keywords: "logo image", render: (p) => <LogoField {...p} /> }],
  payments: [{ keywords: "payment method cash card bank jazzcash easypaisa credit custom default", render: (p) => <PaymentsEditor {...p} /> }],
  taxes: [{ keywords: "tax rates multiple gst percentage name", render: (p) => <TaxRatesEditor {...p} /> }],
  invoices: [{ keywords: "invoice fields show hide logo signature sku barcode columns width discount tax", render: (p) => <InvoiceFieldsEditor {...p} /> }],
  printing: [{ keywords: "template size orientation a4 a5 thermal 58mm 80mm letter label landscape portrait", render: (p) => <PrintTemplatesPicker {...p} /> }],
  printers: [{ keywords: "printer default test print rename remove paper status", render: () => <PrintersManager /> }],
  users: [{ keywords: "user role permission pin staff cashier manager", render: () => <UsersSection /> }],
  backup: [{ keywords: "backup export csv excel import data", render: () => <BackupSection /> }],
  vyapar: [{ keywords: "vyapar sync history error manual automatic retry", render: () => <VyaparSection /> }],
  audit: [{ keywords: "audit log history reprint", render: () => <AuditSection /> }],
  suppliers: [{ keywords: "supplier payable", render: () => <SuppliersInfo /> }],
  advanced: [{ keywords: "api status session cache numbering", render: () => <AdvancedStatus /> }],
};

const norm = (s: string) => s.toLowerCase();

function SettingsHub() {
  const qc = useQueryClient();
  const { access, can } = usePosAccess();
  const pc = usePrintCenter();
  const admin = can("settings");
  const [draft, setDraft] = useState<PosConfig>({});
  const [saved, setSaved] = useState<PosConfig>({});
  const [section, setSection] = useState<SectionId>("business");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (access) { setDraft(access.config); setSaved(access.config); } }, [access]);
  const resolved = useMemo(() => resolveCfg(draft), [draft]);
  const upd = (path: string, v: unknown) => setDraft((d) => setPath(d, path, v));
  const dirty = JSON.stringify(stripPrinters(draft)) !== JSON.stringify(stripPrinters(saved));

  const query = norm(q.trim());
  const matches = (f: Field) => !query || norm(`${f.label} ${f.help ?? ""} ${f.path}`).includes(query);
  const sectionHits = useMemo(() => {
    if (!query) return null;
    const hits = new Set<SectionId>();
    for (const f of FIELDS) if (matches(f)) hits.add(f.s);
    for (const s of SECTIONS) {
      if (norm(`${s.label} ${s.keywords}`).includes(query)) hits.add(s.id);
      for (const c of CUSTOM[s.id] ?? []) if (norm(c.keywords).includes(query)) hits.add(s.id);
    }
    return SECTIONS.filter((s) => hits.has(s.id)).map((s) => s.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const doSave = async () => {
    setSaving(true);
    try {
      await savePosSettings({ data: { config: stripPrinters(draft) as Record<string, unknown>, pin: null } });
      toast.success("Settings saved — applied on all devices");
      setSaved(draft); setConfirm(null);
      qc.invalidateQueries({ queryKey: ["pos-access"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };
  const trySave = () => {
    const warns = FIELDS.filter((f) => f.danger && JSON.stringify(getPath(draft, f.path) ?? null) !== JSON.stringify(getPath(saved, f.path) ?? null)).map((f) => f.danger!);
    if (warns.length) setConfirm(warns); else void doSave();
  };

  const renderField = (f: Field) => {
    const raw = getPath(draft, f.path);
    const val = raw ?? getPath(resolved, f.path) ?? f.def;
    const dis = !admin;
    const lbl = <span className="flex items-center gap-1">{f.label}{f.danger ? <AlertTriangle className="size-3 text-destructive" aria-label="Important setting" /> : null}</span>;
    let control: ReactNode;
    if (f.type === "bool") {
      return (
        <label key={f.path} className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm">
          <input type="checkbox" className="mt-0.5" disabled={dis} checked={!!val} onChange={(e) => upd(f.path, e.target.checked)} />
          <span><span className="text-foreground">{lbl}</span>{f.help ? <span className="block text-xs text-muted-foreground">{f.help}</span> : null}</span>
        </label>
      );
    }
    if (f.type === "select") control = <select className={inp} disabled={dis} value={String(val ?? "")} onChange={(e) => upd(f.path, f.path.endsWith("copies") ? Number(e.target.value) : e.target.value)}>{f.options!.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
    else if (f.type === "textarea") control = <textarea className={`${inp} h-20 py-1.5`} disabled={dis} value={String(val ?? "")} placeholder={f.placeholder} maxLength={1000} onChange={(e) => upd(f.path, e.target.value)} />;
    else if (f.type === "number") control = <input className={inp} disabled={dis} inputMode="decimal" value={val == null ? "" : String(val)} placeholder={f.placeholder} onChange={(e) => {
      const t = e.target.value.trim();
      if (!t) return upd(f.path, f.nullable ? null : undefined);
      const n = Number(t); if (Number.isNaN(n)) return;
      upd(f.path, Math.min(f.max ?? 1e9, Math.max(f.min ?? -1e9, n)));
    }} />;
    else control = <input className={inp} disabled={dis} value={String(val ?? "")} placeholder={f.placeholder} maxLength={200} onChange={(e) => upd(f.path, e.target.value)} />;
    return <label key={f.path} className="block text-xs text-muted-foreground">{lbl}{control}{f.help ? <span className="mt-0.5 block text-[11px]">{f.help}</span> : null}</label>;
  };

  const renderSection = (id: SectionId, filtered: boolean) => {
    const meta = SECTIONS.find((s) => s.id === id)!;
    const fields = FIELDS.filter((f) => f.s === id && (!filtered || matches(f) || norm(`${meta.label} ${meta.keywords}`).includes(query)));
    const bools = fields.filter((f) => f.type === "bool");
    const others = fields.filter((f) => f.type !== "bool");
    const custom = (CUSTOM[id] ?? []).filter((c) => !filtered || norm(`${c.keywords} ${meta.label} ${meta.keywords}`).includes(query) || fields.length > 0);
    return (
      <section key={id} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-foreground">{meta.label}</h2>
          {id === "printing" || id === "invoices" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => pc.preview({ ...sampleDoc(), kind: "sale" })}><Eye /> Sample preview</Button>
              {id === "printing" ? (
                <Button size="sm" disabled={!admin || saving || !dirty} onClick={trySave} title={dirty ? "Save the selected print template" : "Nothing to save"}>
                  <Save /> {saving ? "Saving…" : dirty ? "Save template" : "Saved"}
                </Button>
              ) : null}
              <span className="text-[11px] text-muted-foreground">Preview shows saved settings — save first</span>
            </div>
          ) : null}
        </div>
        {custom.map((c, i) => <div key={i}>{c.render({ draft, upd, disabled: !admin, dirty, saving, onSave: trySave })}</div>)}
        {others.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{others.map(renderField)}</div> : null}
        {bools.length ? <div className="grid gap-2 sm:grid-cols-2">{bools.map(renderField)}</div> : null}
      </section>
    );
  };

  const visible = sectionHits ?? [section];

  return (
    <AppShell title="POS Settings" subtitle="Business, POS, printing, staff" active="/pos">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-24 pt-3">
        <PosSubnav />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary" value={q} onChange={(e) => setQ(e.target.value)} placeholder='Settings search — "printer", "invoice", "discount", "barcode"…' aria-label="Settings search" />
        </div>
        {!admin ? <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">You can view settings; only Admin can make changes{can("manage_printers") ? " (you can manage Printers)" : ""}.</p> : null}
        <div className="flex flex-col gap-3 lg:flex-row">
          <nav className="flex gap-1 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" onClick={() => { setSection(s.id); setQ(""); }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${!sectionHits && section === s.id ? "bg-primary text-primary-foreground" : sectionHits?.includes(s.id) ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>{s.label}</button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 space-y-3">
            {sectionHits && !sectionHits.length ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No setting found for "{q}"</p> : null}
            {visible.map((id) => renderSection(id, !!sectionHits))}
          </div>
        </div>
      </div>
      {admin && dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
            <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>
            <Button variant="ghost" onClick={() => setDraft(saved)}>Revert</Button>
            <Button disabled={saving} onClick={trySave}><Save /> Save changes</Button>
          </div>
        </div>
      ) : null}
      {confirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-4" role="alertdialog" aria-modal="true" aria-label="Confirm">
          <div className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-4 shadow-xl">
            <p className="flex items-center gap-2 font-bold text-foreground"><AlertTriangle className="size-5 text-destructive" /> Important change — please confirm</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{confirm.map((w) => <li key={w}>{w}</li>)}</ul>
            <p className="text-xs text-muted-foreground">Past financial data is never changed.</p>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button disabled={saving} onClick={doSave}>Yes, save</Button></div>
          </div>
        </div>
      ) : null}
      {pc.node}
    </AppShell>
  );
}

function stripPrinters(c: PosConfig): PosConfig {
  const { printers: _p, printerDefaults: _d, ...rest } = c;
  return rest;
}
