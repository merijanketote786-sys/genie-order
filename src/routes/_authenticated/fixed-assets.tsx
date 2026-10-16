import { AppShell } from "@/components/app-shell";
import { usePosAccess } from "@/components/pos-access";
import { posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ASSET_CATEGORIES, assetSchema, assetTotal, blankAsset, type FixedAsset } from "@/lib/fixed-assets";
import { listFixedAssets, saveFixedAsset } from "@/lib/fixed-assets.functions";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Pencil, Plus, Search, Save, Boxes } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const assetsQuery = queryOptions({ queryKey: ["pos-fixed-assets"], queryFn: () => listFixedAssets() });
export const Route = createFileRoute("/_authenticated/fixed-assets")({
  loader: ({ context }) => context.queryClient.ensureQueryData(assetsQuery),
  head: () => ({ meta: [
    { title: "Fixed Assets — HBPOS" },
    { name: "description", content: "Manage machinery, furniture, computers and other POS business fixed assets." },
    { property: "og:title", content: "Fixed Assets — HBPOS" },
    { property: "og:description", content: "Business asset register with costs, quantities and asset details." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: FixedAssetsPage,
});

function FixedAssetsPage() {
  const { data: assets } = useSuspenseQuery(assetsQuery);
  const qc = useQueryClient();
  const saveFn = useServerFn(saveFixedAsset);
  const { access, can } = usePosAccess();
  const editable = !!access && can("edit_stock");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("current");
  const [form, setForm] = useState<FixedAsset | null>(null);
  const [original, setOriginal] = useState("");
  const [archiving, setArchiving] = useState<FixedAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dirty = !!form && JSON.stringify(form) !== original;
  const categories = [...new Set([...ASSET_CATEGORIES, ...assets.map((a) => a.category)])].sort();
  const rows = assets.filter((a) => (!category || a.category === category) && (status === "all" || (status === "current" ? a.status !== "archived" : a.status === status)) && `${a.name} ${a.category} ${a.serial_number} ${a.location}`.toLowerCase().includes(q.trim().toLowerCase()));
  const open = (a: FixedAsset) => { setForm(a); setOriginal(JSON.stringify(a)); };
  const persist = async (a: FixedAsset) => {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try {
      await saveFn({ data: a });
      qc.setQueryData(assetsQuery.queryKey, (old: FixedAsset[] = []) => [...old.filter((r) => r.id !== a.id), a].sort((x, y) => x.name.localeCompare(y.name)));
      if (navigator.onLine) await qc.invalidateQueries({ queryKey: assetsQuery.queryKey });
      toast.success(navigator.onLine ? "Asset saved" : "Asset saved on this device — sync pending");
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save asset"); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  const submit = async () => {
    const result = assetSchema.safeParse(form);
    if (!result.success) { toast.error(result.error.issues[0]?.message ?? "Check the asset details"); return; }
    if (await persist(result.data)) setForm(null);
  };
  const guard = useUnsavedGuard(dirty, submit);
  const update = (key: keyof FixedAsset, value: string | number | null) => setForm((f) => f ? { ...f, [key]: value } : f);
  return <AppShell title="Fixed Assets" subtitle="Asset register" active="/pos" wide>
    {guard}
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-xl font-bold"><Boxes className="size-5 text-primary" /> Fixed Assets</h1><Button disabled={!editable} onClick={() => open(blankAsset())}><Plus /> Add asset</Button></div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-y border-border py-3 text-sm"><span>Assets: <b>{rows.length}</b></span><span>Quantity: <b>{rows.reduce((sum, a) => sum + a.quantity, 0).toLocaleString()}</b></span><span>Acquisition value: <b>{rs(rows.reduce((sum, a) => sum + assetTotal(a), 0))}</b></span></div>
      <div className="flex flex-wrap gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input className={`${posInput} pl-9`} aria-label="Search assets" placeholder="Search assets" value={q} onChange={(e) => setQ(e.target.value)} /></div><select className={`${posInput} sm:w-48`} aria-label="Filter category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select><select className={`${posInput} sm:w-44`} aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="current">Not archived</option><option value="all">All statuses</option><option value="active">Active</option><option value="repair">Under repair</option><option value="retired">Retired</option><option value="archived">Archived</option></select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr>{["Asset / Serial number", "Category", "Location", "Purchase date", "Qty", "Unit cost", "Total cost", "Status", ""].map((h, i) => <th key={i} className="px-2 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((a) => <tr key={a.id} className="border-b border-border"><td className="max-w-56 px-2 py-3"><span className="block break-words font-semibold">{a.name}</span><span className="text-xs text-muted-foreground">{a.serial_number}</span></td><td className="px-2">{a.category}</td><td className="max-w-40 break-words px-2">{a.location || "—"}</td><td className="px-2">{a.purchase_date ?? "—"}</td><td className="px-2">{a.quantity}</td><td className="whitespace-nowrap px-2">{rs(a.purchase_cost)}</td><td className="whitespace-nowrap px-2 font-semibold">{rs(assetTotal(a))}</td><td className="px-2 capitalize">{a.status === "repair" ? "Under repair" : a.status}</td><td className="whitespace-nowrap px-2"><Button size="icon" variant="ghost" title="Edit asset" aria-label={`Edit ${a.name}`} disabled={!editable || busy} onClick={() => open(a)}><Pencil className="size-4" /></Button>{a.status !== "archived" && <Button size="icon" variant="ghost" title="Archive asset" aria-label={`Archive ${a.name}`} disabled={!editable || busy} onClick={() => setArchiving(a)}><Archive className="size-4" /></Button>}</td></tr>)}</tbody></table>{!rows.length && <p className="py-12 text-center text-sm text-muted-foreground">No assets found.</p>}</div>
    </div>
    <Dialog open={!!form} onOpenChange={(v) => { if (!v && !busy) { if (dirty) { toast.info("Save the changes or choose Discard"); return; } setForm(null); } }}><DialogContent className="max-w-2xl" aria-describedby={undefined}><DialogTitle>{assets.some((a) => a.id === form?.id) ? "Edit asset" : "Add asset"}</DialogTitle>{form && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-muted-foreground">Asset name *<input className={posInput} autoFocus required maxLength={160} value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Category *<input className={posInput} required list="asset-categories" maxLength={80} value={form.category} onChange={(e) => update("category", e.target.value)} /><datalist id="asset-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
      <label className="text-xs text-muted-foreground">Quantity *<input className={posInput} required type="number" min="0.001" step="any" value={form.quantity} onChange={(e) => update("quantity", Number(e.target.value))} /></label>
      <label className="text-xs text-muted-foreground">Purchase cost per unit (Rs)<input className={posInput} type="number" min="0" step="0.01" value={form.purchase_cost} onChange={(e) => update("purchase_cost", Number(e.target.value))} /></label>
      <label className="text-xs text-muted-foreground">Purchase date<input className={posInput} type="date" value={form.purchase_date ?? ""} onChange={(e) => update("purchase_date", e.target.value || null)} /></label>
      <label className="text-xs text-muted-foreground">Serial number / Asset code<input className={posInput} maxLength={160} value={form.serial_number} onChange={(e) => update("serial_number", e.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Location<input className={posInput} maxLength={200} value={form.location} onChange={(e) => update("location", e.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Status<select className={posInput} value={form.status} onChange={(e) => update("status", e.target.value)}><option value="active">Active</option><option value="repair">Under repair</option><option value="retired">Retired</option><option value="archived">Archived</option></select></label>
      <label className="text-xs text-muted-foreground sm:col-span-2">Notes<textarea className={`${posInput} h-20 py-2`} maxLength={2000} value={form.notes} onChange={(e) => update("notes", e.target.value)} /></label>
    </fieldset><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">Total cost: {rs(assetTotal(form))}</b><div className="flex gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setForm(null)}>Discard</Button><Button type="submit" disabled={busy || !editable}><Save />{busy ? "Saving…" : "Save asset"}</Button></div></div></form>}</DialogContent></Dialog>
    <Dialog open={!!archiving} onOpenChange={(v) => { if (!v && !busy) setArchiving(null); }}><DialogContent><DialogTitle>Archive asset?</DialogTitle><DialogDescription>{archiving?.name}</DialogDescription><div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setArchiving(null)}>Cancel</Button><Button disabled={busy} onClick={async () => { if (archiving && await persist({ ...archiving, status: "archived" })) setArchiving(null); }}>Archive</Button></div></DialogContent></Dialog>
  </AppShell>;
}