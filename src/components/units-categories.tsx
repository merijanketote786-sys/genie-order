import { useId, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Check, X, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { posInput } from "@/components/pos-subnav";
import { UNIT_GROUPS } from "@/lib/units";
import { catalog, fmtFactor, useCatalogRefresh, usePosCategories, usePosUnits, type PosUnit } from "@/lib/pos-catalog";

const run = async (fn: () => Promise<void>, ok: string, refresh: () => void) => {
  try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
};

function WorldUnitList({ id }: { id: string }) {
  return <datalist id={id}>{UNIT_GROUPS.flatMap((g) => g.units).map((u) => <option key={u} value={u} />)}</datalist>;
}

type Dir = "subPerMain" | "mainPerSub";
const toFactor = (dir: Dir, v: number) => (dir === "subPerMain" ? v : 1 / v);

function SubRow({ sub, main, mains, refresh }: { sub: PosUnit; main: PosUnit; mains: PosUnit[]; refresh: () => void }) {
  const [edit, setEdit] = useState(false);
  const [dir, setDir] = useState<Dir>("subPerMain");
  const [val, setVal] = useState(fmtFactor(sub.factor));
  const [parent, setParent] = useState(main.id);
  const save = () => {
    const v = Number(val);
    if (!(v > 0)) return toast.error("Enter a number above 0");
    void run(() => catalog.updateUnit(sub.id, { factor: toFactor(dir, v), parent_id: parent }), "Conversion saved", refresh).then(() => setEdit(false));
  };
  return (
    <li className="rounded-lg border border-border bg-background p-2 text-sm">
      {!edit ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{sub.name}</span>
          <span className="text-muted-foreground">1 {main.name} = {fmtFactor(sub.factor)} {sub.name}</span>
          <span className="text-muted-foreground">· 1 {sub.name} = {fmtFactor(1 / sub.factor)} {main.name}</span>
          <span className="ml-auto flex gap-1">
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${sub.name}`} onClick={() => { setEdit(true); setDir("subPerMain"); setVal(fmtFactor(sub.factor)); setParent(main.id); }}><Pencil className="size-4" /></Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Make ${sub.name} a main unit`} title="Make main unit" onClick={() => void run(() => catalog.updateUnit(sub.id, { parent_id: null, factor: 1 }), `${sub.name} is now a main unit`, refresh)}><ArrowUpFromLine className="size-4" /></Button>
            <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label={`Delete ${sub.name}`} onClick={() => { if (confirm(`Delete sub unit "${sub.name}"?`)) void run(() => catalog.deleteUnit(sub.id), "Sub unit deleted", refresh); }}><Trash2 className="size-4" /></Button>
          </span>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
          <label className="text-xs text-muted-foreground">Main unit
            <select className={posInput} value={parent} onChange={(e) => setParent(e.target.value)}>{mains.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </label>
          <ConvDir dir={dir} setDir={setDir} main={mains.find((m) => m.id === parent)?.name ?? main.name} sub={sub.name} />
          <label className="text-xs text-muted-foreground">Value<input className={posInput} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /></label>
          <div className="flex items-end gap-1"><Button size="sm" onClick={save}><Check className="size-4" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(false)}><X className="size-4" /></Button></div>
        </div>
      )}
    </li>
  );
}

function ConvDir({ dir, setDir, main, sub }: { dir: Dir; setDir: (d: Dir) => void; main: string; sub: string }) {
  return (
    <label className="text-xs text-muted-foreground">Calculation
      <select className={posInput} value={dir} onChange={(e) => setDir(e.target.value as Dir)}>
        <option value="subPerMain">How many {sub || "sub unit"} in 1 {main || "main unit"}</option>
        <option value="mainPerSub">How many {main || "main unit"} in 1 {sub || "sub unit"}</option>
      </select>
    </label>
  );
}

function MainCard({ u, subs, mains, refresh }: { u: PosUnit; subs: PosUnit[]; mains: PosUnit[]; refresh: () => void }) {
  const listId = useId();
  const [rename, setRename] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dir, setDir] = useState<Dir>("subPerMain");
  const [val, setVal] = useState("");
  const [preview, setPreview] = useState("");
  const add = () => {
    const v = Number(val);
    if (!name.trim()) return toast.error("Enter sub unit name");
    if (!(v > 0)) return toast.error("Enter how many — a number above 0");
    void run(() => catalog.addUnit({ name, parent_id: u.id, factor: toFactor(dir, v) }), "Sub unit added", refresh).then(() => { setName(""); setVal(""); });
  };
  const v = Number(val);
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {rename === null ? (
          <>
            <h4 className="font-display text-base font-bold text-foreground">{u.name}</h4>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Main unit</span>
            <span className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" className="size-8" aria-label={`Rename ${u.name}`} onClick={() => setRename(u.name)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label={`Delete ${u.name}`} onClick={() => { if (confirm(`Delete "${u.name}" and its sub units?`)) void run(() => catalog.deleteUnit(u.id), "Unit deleted", refresh); }}><Trash2 className="size-4" /></Button>
            </span>
          </>
        ) : (
          <div className="flex w-full gap-2">
            <input className={posInput} list={listId} value={rename} onChange={(e) => setRename(e.target.value)} aria-label="Main unit name" /><WorldUnitList id={listId} />
            <Button size="sm" onClick={() => rename.trim() && void run(() => catalog.updateUnit(u.id, { name: rename.trim() }), "Unit renamed", refresh).then(() => setRename(null))}><Check className="size-4" />Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setRename(null)}><X className="size-4" /></Button>
          </div>
        )}
      </div>
      {subs.length ? <ul className="space-y-1.5">{subs.map((s) => <SubRow key={s.id} sub={s} main={u} mains={mains} refresh={refresh} />)}</ul> : <p className="text-xs text-muted-foreground">No sub units yet.</p>}
      <div className="grid gap-2 rounded-lg border border-dashed border-border p-2 sm:grid-cols-[1fr_1.4fr_7rem_auto]">
        <label className="text-xs text-muted-foreground">Sub unit<input className={posInput} list={listId} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. g" /></label>
        <ConvDir dir={dir} setDir={setDir} main={u.name} sub={name} />
        <label className="text-xs text-muted-foreground">Value<input className={posInput} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder="1000" onBlur={() => setPreview(val)} /></label>
        <div className="flex items-end"><Button size="sm" onClick={add}><Plus className="size-4" />Add sub unit</Button></div>
        {name && v > 0 ? <p className="text-xs text-muted-foreground sm:col-span-4" data-p={preview}>1 {u.name} = {fmtFactor(toFactor(dir, v))} {name} · 1 {name} = {fmtFactor(1 / toFactor(dir, v))} {u.name}</p> : null}
      </div>
    </section>
  );
}

export function UnitsPanel() {
  const listId = useId();
  const { data, isLoading, isError, refetch } = usePosUnits();
  const refresh = useCatalogRefresh();
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const all = data ?? [];
  const mains = all.filter((u) => !u.parent_id || !all.some((m) => m.id === u.parent_id));
  const shown = mains.filter((m) => !q || [m, ...all.filter((s) => s.parent_id === m.id)].some((x) => x.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <section className="space-y-2 rounded-xl border border-border bg-card p-3">
        <p className="text-sm font-bold text-foreground">Add main unit</p>
        <p className="text-xs text-muted-foreground">Pick any unit from the world list (kg, litre, foot, carton, tola, marla…) or type your own.</p>
        <div className="flex gap-2">
          <input className={posInput} list={listId} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. kg" aria-label="Main unit name" onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget.nextElementSibling?.nextElementSibling as HTMLButtonElement | null)?.click(); }} />
          <WorldUnitList id={listId} />
          <Button onClick={() => { if (!name.trim()) return toast.error("Enter unit name"); void run(() => catalog.addUnit({ name }), "Main unit added", refresh).then(() => setName("")); }}><Plus className="size-4" />Add</Button>
        </div>
      </section>
      <input className={posInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search units" aria-label="Search units" />
      {isError ? <p className="text-sm text-destructive">Units could not load. <button className="underline" onClick={() => refetch()}>Retry</button></p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !shown.length ? <p className="text-sm text-muted-foreground">No units saved yet.</p> : null}
      {shown.map((m) => <MainCard key={m.id} u={m} subs={all.filter((s) => s.parent_id === m.id)} mains={mains} refresh={refresh} />)}
    </div>
  );
}

function CatRow({ id, name, refresh }: { id: string; name: string; refresh: () => void }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm">
      {v === null ? <span className="mr-auto font-medium text-foreground">{name}</span> : <input className={posInput} value={v} onChange={(e) => setV(e.target.value)} aria-label="Category name" autoFocus />}
      {v === null ? (
        <>
          <Button size="icon" variant="ghost" className="size-8" aria-label={`Rename ${name}`} onClick={() => setV(name)}><Pencil className="size-4" /></Button>
          <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label={`Delete ${name}`} onClick={() => { if (confirm(`Delete category "${name}"? Items keep their current category text.`)) void run(() => catalog.deleteCategory(id), "Category deleted", refresh); }}><Trash2 className="size-4" /></Button>
        </>
      ) : (
        <>
          <Button size="sm" onClick={() => v.trim() && void run(() => catalog.updateCategory(id, v), "Category renamed", refresh).then(() => setV(null))}><Check className="size-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setV(null)}><X className="size-4" /></Button>
        </>
      )}
    </li>
  );
}

export function CategoriesPanel() {
  const { data, isLoading, isError, refetch } = usePosCategories();
  const refresh = useCatalogRefresh();
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const add = () => { if (!name.trim()) return toast.error("Enter category name"); void run(() => catalog.addCategory(name), "Category saved", refresh).then(() => setName("")); };
  const list = (data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <section className="space-y-2 rounded-xl border border-border bg-card p-3">
        <p className="text-sm font-bold text-foreground">New category</p>
        <div className="flex gap-2">
          <input className={posInput} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="e.g. Chemicals" aria-label="New category name" />
          <Button onClick={add}><Plus className="size-4" />Save</Button>
        </div>
        <p className="text-xs text-muted-foreground">Saved categories appear in every Category dropdown in POS.</p>
      </section>
      <input className={posInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories" aria-label="Search categories" />
      {isError ? <p className="text-sm text-destructive">Categories could not load. <button className="underline" onClick={() => refetch()}>Retry</button></p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !list.length ? <p className="text-sm text-muted-foreground">No categories saved yet.</p> : null}
      <ul className="space-y-1.5">{list.map((c) => <CatRow key={c.id} id={c.id} name={c.name} refresh={refresh} />)}</ul>
    </div>
  );
}
