import { Button } from "@/components/ui/button";
import { usePinPrompt, usePosAccess } from "@/components/pos-access";
import { usePrintCenter } from "@/components/print-center";
import { POS_ROLES, exportPosBackup, listPosMembers, savePosSettings, setPosMemberRole } from "@/lib/pos-access.functions";
import { BASE_PAY_METHODS, DEFAULT_TAX_RATES, FORMAT_LABEL, ROLE_LABEL, type ColKey, type FieldKey, type PaperFormat, type PosConfig, type PrinterCfg, type PrinterRole } from "@/lib/pos-config";
import { exportData, getSyncOverview, listAuditLog, savePrinters } from "@/lib/print-admin.functions";
import { printBridge, type BridgePrinter } from "@/lib/print/dispatch";
import type { PrintDoc } from "@/lib/print/render";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, Plus, Printer, RefreshCw, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const inp = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary";
type Upd = (path: string, v: unknown) => void;

/* ------------------------------ Business logo ------------------------------ */
export function LogoField({ draft, upd, disabled }: { draft: PosConfig; upd: Upd; disabled: boolean }) {
  const logo = draft.business?.logo;
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(f.type)) return toast.error("PNG/JPG/WebP/SVG logo chunein");
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 400 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/png");
      if (url.length > 350_000) return toast.error("Logo bohat bara hai — chhoti file chunein");
      upd("business.logo", url);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <div className="grid size-20 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-background">
        {logo ? <img src={logo} alt="Business logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Business logo</p>
        <p className="text-xs text-muted-foreground">Invoices/receipts par chhapta hai (400px tak resize).</p>
        <div className="flex gap-2">
          <label className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-sm ${disabled ? "pointer-events-none opacity-50" : ""}`}><Upload className="size-4" /> Upload<input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /></label>
          {logo ? <Button size="sm" variant="ghost" disabled={disabled} onClick={() => upd("business.logo", "")}>Hatayein</Button> : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Payments -------------------------------- */
export function PaymentsEditor({ draft, upd, disabled }: { draft: PosConfig; upd: Upd; disabled: boolean }) {
  const enabled = draft.payments?.enabled ?? [...BASE_PAY_METHODS];
  const custom = draft.payments?.custom ?? [];
  const [nm, setNm] = useState("");
  const all = [...BASE_PAY_METHODS, ...custom];
  const active = all.filter((m) => enabled.includes(m) || custom.includes(m));
  const def = draft.payments?.default || draft.defaultPayMethod || "Cash";
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BASE_PAY_METHODS.map((m) => (
          <label key={m} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
            <input type="checkbox" disabled={disabled || m === "Cash"} checked={enabled.includes(m)} onChange={(e) => upd("payments.enabled", e.target.checked ? [...enabled, m] : enabled.filter((x) => x !== m))} />
            {m}{m === "Cash" ? <span className="text-xs text-muted-foreground">(hamesha on)</span> : m === "Credit" ? <span className="text-xs text-muted-foreground">(udhaar)</span> : null}
          </label>
        ))}
        {custom.map((m) => (
          <div key={m} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
            <span>{m} <span className="text-xs text-muted-foreground">(custom)</span></span>
            <Button size="icon" variant="ghost" disabled={disabled} aria-label={`${m} hatayein`} onClick={() => upd("payments.custom", custom.filter((x) => x !== m))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className={`${inp} max-w-56`} value={nm} maxLength={30} onChange={(e) => setNm(e.target.value)} placeholder="Naya method (jaise Meezan Bank)" aria-label="Custom payment method" disabled={disabled} />
        <Button size="sm" variant="outline" disabled={disabled || !nm.trim() || all.includes(nm.trim())} onClick={() => { upd("payments.custom", [...custom, nm.trim()]); setNm(""); }}><Plus /> Add</Button>
      </div>
      <label className="block max-w-xs text-xs text-muted-foreground">Default payment method
        <select className={inp} value={def} disabled={disabled} onChange={(e) => upd("payments.default", e.target.value)}>{active.map((m) => <option key={m}>{m}</option>)}</select>
      </label>
    </div>
  );
}

/* -------------------------------- Tax rates -------------------------------- */
export function TaxRatesEditor({ draft, upd, disabled }: { draft: PosConfig; upd: Upd; disabled: boolean }) {
  const rates = draft.tax?.rates?.length ? draft.tax.rates : DEFAULT_TAX_RATES;
  const set = (i: number, k: "name" | "pct", v: string) => upd("tax.rates", rates.map((r, j) => (j === i ? { ...r, [k]: k === "pct" ? Math.min(100, Math.max(0, Number(v) || 0)) : v.slice(0, 30) } : r)));
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Tax rates (POS me product-level chunne ke liye)</p>
      {rates.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input className={inp} value={r.name} onChange={(e) => set(i, "name", e.target.value)} aria-label="Tax name" disabled={disabled} />
          <input className={`${inp} w-24`} inputMode="decimal" value={r.pct} onChange={(e) => set(i, "pct", e.target.value)} aria-label="Tax %" disabled={disabled} />
          <Button size="icon" variant="ghost" disabled={disabled || rates.length <= 1} aria-label="Hatayein" onClick={() => upd("tax.rates", rates.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
        </div>
      ))}
      <Button size="sm" variant="outline" disabled={disabled || rates.length >= 12} onClick={() => upd("tax.rates", [...rates, { name: "New tax", pct: 0 }])}><Plus /> Rate add</Button>
    </div>
  );
}

/* ------------------------------ Invoice fields ------------------------------ */
const FIELD_LABEL: Record<FieldKey, string> = {
  logo: "Logo", businessName: "Business name", address: "Business address", phone: "Phone", email: "Email", website: "Website", taxId: "NTN/GST",
  title: "Invoice title", number: "Invoice number", dateTime: "Time (date ke saath)", customer: "Customer name", customerPhone: "Customer phone", customerAddress: "Customer address",
  subtotal: "Subtotal", paid: "Paid", balance: "Balance", paymentMethod: "Payment method", notes: "Notes", terms: "Terms", footer: "Footer", signature: "Signature",
};
const COL_LABEL: Record<ColKey, string> = { sku: "SKU", barcode: "Barcode", unit: "Unit", qty: "Quantity", rate: "Rate", discount: "Discount", tax: "Tax" };
export function InvoiceFieldsEditor({ draft, upd, disabled }: { draft: PosConfig; upd: Upd; disabled: boolean }) {
  const f = draft.printing?.fields ?? {};
  const c = { sku: false, barcode: false, unit: true, qty: true, rate: true, discount: true, tax: true, ...(draft.printing?.columns ?? {}) };
  const a5c = { sku: false, barcode: false, unit: true, qty: true, rate: true, discount: false, tax: false, ...(draft.printing?.a5?.columns ?? {}) };
  const w = draft.printing?.colWidths ?? {};
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Invoice par kya dikhe</p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(FIELD_LABEL) as FieldKey[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={f[k] ?? true} onChange={(e) => upd(`printing.fields.${k}`, e.target.checked)} />{FIELD_LABEL[k]}</label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Table columns — A4 / custom (width %, khali = auto)</p>
          {(Object.keys(COL_LABEL) as ColKey[]).map((k) => (
            <div key={k} className="mb-1 flex items-center gap-2 text-sm">
              <label className="flex flex-1 items-center gap-2"><input type="checkbox" disabled={disabled} checked={c[k]} onChange={(e) => upd(`printing.columns.${k}`, e.target.checked)} />{COL_LABEL[k]}</label>
              <input className={`${inp} w-20`} inputMode="numeric" disabled={disabled} value={w[k] ?? ""} placeholder="auto" aria-label={`${COL_LABEL[k]} width`} onChange={(e) => upd(`printing.colWidths.${k}`, e.target.value ? Math.min(60, Math.max(3, Number(e.target.value) || 0)) : undefined)} />
            </div>
          ))}
          <div className="flex items-center gap-2 text-sm"><span className="flex-1">Item name width %</span><input className={`${inp} w-20`} inputMode="numeric" disabled={disabled} value={w.item ?? ""} placeholder="auto" aria-label="Item width" onChange={(e) => upd("printing.colWidths.item", e.target.value ? Math.min(80, Math.max(10, Number(e.target.value) || 0)) : undefined)} /></div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">A5 columns (A5 ka apna set)</p>
          {(Object.keys(COL_LABEL) as ColKey[]).map((k) => (
            <label key={k} className="mb-1 flex items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={a5c[k]} onChange={(e) => upd(`printing.a5.columns.${k}`, e.target.checked)} />{COL_LABEL[k]}</label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Print test -------------------------------- */
export function sampleDoc(): PrintDoc {
  return {
    kind: "sale", title: "Test Invoice", number: "TEST-0001", date: new Date(),
    party: { label: "Customer", name: "Ali Traders", phone: "03001234567", address: "Shop 12, Main Market, Lahore" },
    lines: [
      { name: "Acetanilide", sku: "ACT-01", barcode: "100001", unit: "kg", qty: 2, rate: 920, total: 1840 },
      { name: "Citric Acid Monohydrate (food grade, bara naam wrap test)", sku: "CIT-02", unit: "100gram", qty: 5, rate: 85, discount: 25, total: 400 },
      { name: "Glycerine", unit: "ltr", qty: 1.5, rate: 640, taxPct: 18, total: 1132.8 },
    ],
    totals: [{ label: "Subtotal", value: 3200 }, { label: "Tax", value: 172.8 }, { label: "Grand Total", value: 3372.8, bold: true }],
    payments: [{ method: "Cash", amount: 3000 }], paid: 3000, balance: 372.8, notes: "Sample print — koi record nahi bana",
  };
}

/* -------------------------------- Printers -------------------------------- */
export function PrintersManager() {
  const qc = useQueryClient();
  const { cfg, can } = usePosAccess();
  const pc = usePrintCenter();
  const allowed = can("manage_printers") || can("settings");
  const [list, setList] = useState<PrinterCfg[]>(cfg.printers);
  const [defs, setDefs] = useState<Partial<Record<PrinterRole, string>>>(cfg.printerDefaults);
  const [sys, setSys] = useState<BridgePrinter[] | null>(null);
  const bridge = printBridge();
  useEffect(() => { setList(cfg.printers); setDefs(cfg.printerDefaults); }, [cfg.printers, cfg.printerDefaults]);
  const refresh = async () => { if (!bridge) return; try { setSys(await bridge.getPrinters()); } catch { toast.error("Printers list nahi mili"); } };
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async (l = list, d = defs) => {
    try {
      const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v && l.some((p) => p.id === v))) as Record<string, string>;
      await savePrinters({ data: { printers: l, defaults: clean } });
      toast.success("Printer settings save");
      qc.invalidateQueries({ queryKey: ["pos-access"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save nahi hua"); }
  };
  const add = (p?: Partial<PrinterCfg>) => {
    const np: PrinterCfg = { id: `p${Date.now().toString(36)}`, name: p?.name ?? "Naya printer", type: p?.type ?? "thermal", paper: p?.paper ?? "t80", deviceName: p?.deviceName, copies: 1 };
    setList([...list, np]);
  };
  const upd = (id: string, patch: Partial<PrinterCfg>) => setList(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const statusText = (s: number) => (s === 0 ? "Ready (Windows)" : `Windows status code ${s}`);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {bridge ? (
          <p><b className="text-foreground">Desktop app:</b> Windows ke installed printers neeche dikh rahe hain. Printer config me Windows printer chunein to print seedha (bina dialog) wahan jayega.</p>
        ) : (
          <p><b className="text-foreground">Browser:</b> security ki wajah se website Windows printers ki list nahi dekh sakti aur khud printer nahi chun sakti. Yahan apne printers ke naam, paper aur role save karein — print par sahi paper size ke saath print window khulegi; wahan ek dafa printer chunein, Chrome usay yaad rakhta hai. Seedha (silent) print ke liye Windows desktop app istemal karein.</p>
        )}
      </div>

      {bridge ? (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-foreground">Windows printers</p><Button size="sm" variant="ghost" onClick={refresh}><RefreshCw /> Refresh</Button></div>
          {sys?.length ? sys.map((s) => (
            <div key={s.name} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-1.5 text-sm">
              <span>{s.displayName || s.name}{s.isDefault ? <span className="ml-1 text-xs text-primary">(Windows default)</span> : null} <span className="text-xs text-muted-foreground">· {statusText(s.status)}</span></span>
              <Button size="sm" variant="outline" disabled={!allowed} onClick={() => add({ name: s.displayName || s.name, deviceName: s.name, type: /80|58|pos|thermal|receipt/i.test(s.name) ? "thermal" : "a4", paper: /58/.test(s.name) ? "t58" : /80|pos|thermal|receipt/i.test(s.name) ? "t80" : "a4" })}><Plus /> Config banayein</Button>
            </div>
          )) : <p className="text-xs text-muted-foreground">Koi printer nahi mila.</p>}
        </div>
      ) : null}

      <div className="space-y-2">
        {list.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Abhi koi printer config nahi. "Printer add" dabayein.</p> : null}
        {list.map((p) => {
          const roles = (Object.keys(ROLE_LABEL) as PrinterRole[]).filter((r) => defs[r] === p.id);
          return (
            <div key={p.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <label className="text-xs text-muted-foreground">Naam<input className={inp} value={p.name} disabled={!allowed} maxLength={60} onChange={(e) => upd(p.id, { name: e.target.value })} /></label>
                <label className="text-xs text-muted-foreground">Type<select className={inp} value={p.type} disabled={!allowed} onChange={(e) => upd(p.id, { type: e.target.value as PrinterCfg["type"] })}><option value="thermal">Thermal</option><option value="a4">A4 laser/inkjet</option><option value="a5">A5</option><option value="label">Label</option><option value="other">Other</option></select></label>
                <label className="text-xs text-muted-foreground">Paper<select className={inp} value={p.paper} disabled={!allowed} onChange={(e) => upd(p.id, { paper: e.target.value as PaperFormat })}>{(Object.keys(FORMAT_LABEL) as PaperFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}</select></label>
                <label className="text-xs text-muted-foreground">Copies<input className={inp} inputMode="numeric" value={p.copies ?? 1} disabled={!allowed} onChange={(e) => upd(p.id, { copies: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></label>
                <label className="text-xs text-muted-foreground">Windows printer {bridge ? "" : "(desktop app)"}
                  {bridge ? (
                    <select className={inp} value={p.deviceName ?? ""} disabled={!allowed} onChange={(e) => upd(p.id, { deviceName: e.target.value || undefined })}><option value="">— print window —</option>{(sys ?? []).map((s) => <option key={s.name} value={s.name}>{s.displayName || s.name}</option>)}</select>
                  ) : (
                    <input className={inp} value={p.deviceName ?? ""} disabled={!allowed} placeholder="Desktop app me chunein" onChange={(e) => upd(p.id, { deviceName: e.target.value || undefined })} />
                  )}
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Default for:</span>
                {(Object.keys(ROLE_LABEL) as PrinterRole[]).map((r) => (
                  <label key={r} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${defs[r] === p.id ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                    <input type="checkbox" className="size-3" disabled={!allowed} checked={defs[r] === p.id} onChange={(e) => setDefs({ ...defs, [r]: e.target.checked ? p.id : undefined })} />{ROLE_LABEL[r]}
                  </label>
                ))}
                <span className="ml-auto" />
                <span className="text-muted-foreground">{roles.length ? "Default" : "Secondary"}{p.deviceName && bridge ? ` · ${sys?.find((s) => s.name === p.deviceName) ? statusText(sys.find((s) => s.name === p.deviceName)!.status) : "Windows par nahi mila"}` : ""}</span>
                <Button size="sm" variant="outline" onClick={() => pc.print({ ...sampleDoc(), kind: p.paper.startsWith("t") ? "pos" : "sale" }, { format: p.paper, copies: 1 })}><Printer /> Test print</Button>
                <Button size="sm" variant="ghost" disabled={!allowed} aria-label="Printer config hatayein" onClick={() => { setList(list.filter((x) => x.id !== p.id)); setDefs(Object.fromEntries(Object.entries(defs).filter(([, v]) => v !== p.id))); }}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!allowed || list.length >= 30} onClick={() => add()}><Plus /> Printer add</Button>
        <Button disabled={!allowed} onClick={() => save()}>Printers save</Button>
      </div>
      <p className="text-xs text-muted-foreground">Test print ek sample invoice chhapta hai — koi sale/record nahi banta. Note: test print abhi-saved printer defaults use karta hai; naye badlao pehle save karein.</p>
      {pc.node}
    </div>
  );
}

/* ------------------------------ Users & PIN ------------------------------ */
export const PERM_LABEL: Record<string, string> = {
  view_pos: "View POS", create_sale: "Create sale", edit_sale: "Edit sale (held/quotation)", return_sale: "Return sale", edit_price: "Edit price", apply_discount: "Apply discount",
  cancel_invoice: "Cancel sale", view_reports: "View reports", view_profit: "View profit", edit_stock: "Edit stock", edit_products: "Edit products", view_balances: "Customer balances",
  manage_customers: "Manage customers", manage_suppliers: "Manage suppliers", manage_expenses: "Manage expenses", manage_purchases: "Manage purchases", manage_printers: "Manage printers",
  manage_users: "Manage users", settings: "Manage settings",
};
const ROLE_PERMS: Record<string, string[]> = {
  admin: Object.keys(PERM_LABEL),
  manager: Object.keys(PERM_LABEL).filter((p) => p !== "manage_users" && p !== "settings"),
  salesman: ["view_pos", "create_sale", "return_sale", "apply_discount", "view_balances", "manage_customers"],
  cashier: ["view_pos", "create_sale", "return_sale", "view_balances", "manage_expenses", "manage_customers"],
  staff: ["view_pos", "create_sale"],
};
const ROLE_NAME: Record<string, string> = { admin: "Admin", manager: "Manager", cashier: "Cashier", salesman: "Salesman", staff: "Staff" };

export function UsersSection() {
  const qc = useQueryClient();
  const { access, can } = usePosAccess();
  const { data: mem } = useQuery({ queryKey: ["pos-members"], queryFn: () => listPosMembers(), enabled: can("manage_users") });
  const [pin, setPin] = useState("");
  const savePin = async (v: string) => {
    try { await savePosSettings({ data: { config: (access?.config ?? {}) as Record<string, unknown>, pin: v } }); toast.success(v ? "PIN set ho gaya" : "PIN hata diya"); setPin(""); qc.invalidateQueries({ queryKey: ["pos-access"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Nahi hua"); }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">Aap ka role: <b>{ROLE_NAME[access?.role ?? "staff"]}</b></p>
      {can("manage_users") ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50 text-left text-xs text-muted-foreground"><th className="p-2">User</th><th className="p-2">Role</th><th className="p-2">Permissions</th></tr></thead>
            <tbody>{(mem?.members ?? []).map((m) => (
              <tr key={m.id} className="border-t border-border align-top">
                <td className="p-2">{m.name}{!m.active ? <span className="ml-1 text-xs text-destructive">(inactive)</span> : null}</td>
                <td className="p-2">{m.role === "admin" ? <b>Admin (owner)</b> : (
                  <select className={inp} value={m.role} aria-label={`${m.name} role`} onChange={async (e) => {
                    try { await setPosMemberRole({ data: { userId: m.id, role: e.target.value as (typeof POS_ROLES)[number] } }); toast.success("Role save"); qc.invalidateQueries({ queryKey: ["pos-members"] }); } catch (er) { toast.error(er instanceof Error ? er.message : "Nahi hua"); }
                  }}>{POS_ROLES.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}</select>
                )}</td>
                <td className="p-2 text-xs text-muted-foreground">{(ROLE_PERMS[m.role] ?? []).map((p) => PERM_LABEL[p]).join(", ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="text-xs text-muted-foreground">Roles sirf Admin badal sakta hai.</p>}
      {can("settings") ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold">Manager PIN {access?.hasPin ? <span className="text-xs text-primary">(set hai)</span> : <span className="text-xs text-destructive">(set nahi)</span>}</p>
          <p className="text-xs text-muted-foreground">Jin ke paas ijazat nahi (rate badalna, discount, cancel) unke liye PIN approval. Har istemal audit log me.</p>
          <div className="flex flex-wrap gap-2">
            <input className={`${inp} w-40`} type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Naya PIN (4-8)" aria-label="Naya PIN" />
            <Button disabled={pin.length < 4} onClick={() => savePin(pin)}>PIN set</Button>
            {access?.hasPin ? <Button variant="ghost" onClick={() => savePin("")}>PIN hatayein</Button> : null}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Sab permissions server par bhi check hoti hain (sale, discount, return, cancel, stock, purchases, settings, printers).</p>
    </div>
  );
}

/* ------------------------------ Backup & data ------------------------------ */
function csvDownload(name: string, columns: string[], rows: Record<string, string>[]) {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = [columns.join(","), ...rows.map((r) => columns.map((c) => q(r[c] ?? "")).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
async function xlsxDownload(name: string, columns: string[], rows: Record<string, string>[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows, { header: columns });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 30));
  XLSX.writeFile(wb, `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
const EXPORT_ITEMS = [["products", "Products"], ["customers", "Customers"], ["suppliers", "Suppliers"], ["sales", "Sales / returns / quotations"], ["purchases", "Purchases"], ["payments", "Payments (transactions)"], ["expenses", "Expenses"], ["stock", "Stock movements"]] as const;
export function BackupSection() {
  const { can } = usePosAccess();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sync-overview"], queryFn: () => getSyncOverview(), staleTime: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (what: (typeof EXPORT_ITEMS)[number][0], kind: "csv" | "xlsx") => {
    setBusy(what + kind);
    try { const r = await exportData({ data: { what } }); if (kind === "csv") csvDownload(what, r.columns, r.rows); else await xlsxDownload(what, r.columns, r.rows); toast.success(`${r.rows.length} rows export`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export nahi hua"); } finally { setBusy(null); }
  };
  const backup = async () => {
    setBusy("backup");
    try {
      const { json } = await exportPosBackup();
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      qc.invalidateQueries({ queryKey: ["sync-overview"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Nahi hua"); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
        <div><p className="text-sm font-semibold">Full backup (JSON)</p><p className="text-xs text-muted-foreground">Last backup: {data?.lastBackup ? new Date(data.lastBackup).toLocaleString("en-PK") : "kabhi nahi"} · Koi password/secret key shamil nahi.</p></div>
        <Button variant="outline" disabled={!can("settings") || busy === "backup"} onClick={backup}><Download /> Backup download</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {EXPORT_ITEMS.map(([k, l]) => (
          <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
            <span>{l}</span>
            <span className="flex gap-1"><Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(k, "csv")}>CSV</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(k, "xlsx")}>Excel</Button></span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Import: products/rates <Link to="/sync" className="text-primary underline">Vyapar Sync</Link> page se (Excel/CSV, validation ke saath) aur inventory page se. Sales/payments ka import jaan boojh kar band hai taake hisaab kharab na ho.</p>
    </div>
  );
}

/* ------------------------------- Vyapar sync ------------------------------- */
export function VyaparSection() {
  const { data, refetch, isFetching } = useQuery({ queryKey: ["sync-overview"], queryFn: () => getSyncOverview(), staleTime: 30_000 });
  const last = data?.logs[0];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        {[["Last sync", last ? new Date(last.at).toLocaleString("en-PK") : "—"], ["Status", last?.status ?? "—"], ["Products (central list)", String(data?.products ?? "—")], ["Last run failed rows", String(last?.errors ?? 0)]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold">{v}</p></div>
        ))}
      </div>
      {last?.errors && last.details ? <pre className="max-h-32 overflow-auto rounded-lg border border-border bg-muted/40 p-2 text-xs whitespace-pre-wrap">{last.details}</pre> : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild><Link to="/sync">Manual sync / file upload</Link></Button>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw /> Refresh status</Button>
      </div>
      <p className="text-xs text-muted-foreground">Automatic sync: Sync page se Windows auto-sync file (PowerShell) set karein — wo Vyapar export ko khud upload karti hai. Failed rows ko dobara chalane ke liye file theek karke dobara sync karein (sirf ghalat rows skip hoti hain; baqi update ho jati hain). POS hamesha isi ek central product list ko use karta hai.</p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead><tr className="bg-muted/50 text-left text-muted-foreground"><th className="p-2">Time</th><th className="p-2">Status</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Updated</th><th className="p-2 text-right">New</th><th className="p-2 text-right">Skipped</th><th className="p-2 text-right">Errors</th></tr></thead>
          <tbody>{(data?.logs ?? []).map((l) => (
            <tr key={l.id} className="border-t border-border"><td className="p-2">{new Date(l.at).toLocaleString("en-PK")}</td><td className="p-2">{l.status}</td><td className="p-2 text-right">{l.total}</td><td className="p-2 text-right">{l.updated}</td><td className="p-2 text-right">{l.inserted}</td><td className="p-2 text-right">{l.skipped}</td><td className={`p-2 text-right ${l.errors ? "text-destructive" : ""}`}>{l.errors}</td></tr>
          ))}{!data?.logs.length ? <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Abhi koi sync history nahi</td></tr> : null}</tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------- Audit log -------------------------------- */
const AUDIT_ACTIONS = ["", "create", "cancel", "settings_change", "printer_change", "reprint", "pin_override", "adjust_in", "adjust_out", "damage", "update", "backup", "export", "print_error"];
export function AuditSection() {
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const { data, isFetching, refetch } = useQuery({ queryKey: ["audit", action, entity], queryFn: () => listAuditLog({ data: { action: action || undefined, entity: entity || undefined, limit: 300 } }) });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Audit logging hamesha on hai aur band nahi ho sakti (records sirf parhne ke liye — edit/delete nahi). Track hota hai: sales, returns, cancellations, discounts, payments, stock adjustments, product/price changes, settings, printer changes, role changes, PIN approvals, reprints, backups.</p>
      <div className="flex flex-wrap gap-2">
        <select className={`${inp} max-w-48`} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action filter">{AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a || "Sab actions"}</option>)}</select>
        <input className={`${inp} max-w-48`} value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Entity (sale, stock...)" aria-label="Entity filter" />
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw /> Refresh</Button>
      </div>
      <div className="max-h-[480px] overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card"><tr className="text-left text-muted-foreground"><th className="p-2">Time</th><th className="p-2">User</th><th className="p-2">Action</th><th className="p-2">Entity</th><th className="p-2">Details</th></tr></thead>
          <tbody>{(data?.rows ?? []).map((r) => (
            <tr key={r.id} className="border-t border-border align-top"><td className="whitespace-nowrap p-2">{new Date(r.at).toLocaleString("en-PK")}</td><td className="p-2">{r.user}</td><td className="p-2 font-medium">{r.action}</td><td className="p-2">{r.entity}</td><td className="max-w-md break-all p-2 text-muted-foreground">{r.details === "{}" ? "" : r.details}</td></tr>
          ))}{data && !data.rows.length ? <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Koi entry nahi</td></tr> : null}</tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------- Suppliers / Advanced --------------------------- */
export function SuppliersInfo() {
  return (
    <div className="space-y-2 text-sm">
      <p>Supplier payable = opening balance + purchases − payments − purchase returns (ledger me running balance).</p>
      <p className="text-xs text-muted-foreground">Suppliers aur purchases ka kaam "Manage purchases" / "Manage suppliers" ijazat se hota hai (Users & Permissions). Purchase numbering Purchases section me.</p>
      <Button asChild variant="outline" size="sm"><Link to="/suppliers">Suppliers kholein</Link></Button>
    </div>
  );
}

export function AdvancedStatus() {
  const bridge = printBridge();
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <p className="font-semibold">System status</p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>Backend: connected (records aur settings server par, har device par ek jaise)</li>
        <li>Printing: {bridge ? "Desktop bridge active — silent print available" : "Browser print window (silent print sirf desktop app me)"}</li>
        <li>Transaction safety: har bill/payment ek database transaction me, duplicate-submit protection on</li>
        <li>Numbering: automatic, server par sequence — duplicate number mumkin nahi; reset ki ijazat nahi (hisaab ki hifazat)</li>
        <li>Cache: settings 1 minute cache — "Refresh workspace" se foran reload</li>
        <li>Session timeout / ek-waqt-ek-login: is app se control nahi hota (login system ki setting) — is liye yahan switch nahi diya</li>
        <li>API keys / secrets: kabhi browser me nahi dikhaye jate</li>
      </ul>
    </div>
  );
}

export { usePinPrompt };
