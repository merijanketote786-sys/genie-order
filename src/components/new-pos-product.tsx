import { Button } from "@/components/ui/button";
import { posInput } from "@/components/pos-subnav";
import { UnitSelect } from "@/components/unit-select";
import { CategoryInput } from "@/components/category-input";
import { createPosProduct } from "@/lib/inventory.functions";
import { UNIT_GROUPS } from "@/lib/units";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const EMPTY = { name: "", sku: "", barcode: "", category: "", brand: "", sale_price: "", purchase_price: "", wholesale_price: "", wholesale_min_qty: "", stock: "", min_stock: "", tax_percent: "" };
type K = keyof typeof EMPTY;

export function NewPosProduct({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [group, setGroup] = useState(UNIT_GROUPS[0].group);
  const [unit, setUnit] = useState("piece");
  const [saving, setSaving] = useState(false);
  const I = ({ k, label, dec }: { k: K; label: string; dec?: boolean }) => (
    <label className="text-xs text-muted-foreground">{label}<input className={posInput} value={f[k]} inputMode={dec ? "decimal" : undefined} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} /></label>
  );
  const save = async () => {
    if (!f.name.trim()) return toast.error("Enter product name");
    for (const k of ["sale_price", "purchase_price", "wholesale_price", "wholesale_min_qty", "stock", "min_stock", "tax_percent"] as K[]) if (f[k] !== "" && !isFinite(Number(f[k]))) return toast.error("Invalid number");
    setSaving(true);
    try { await createPosProduct({ data: { ...f, unit } }); toast.success("New item added"); setF(EMPTY); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Add failed"); } finally { setSaving(false); }
  };
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center"><p className="mr-auto font-bold text-foreground">New item</p><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2">{I({ k: "name", label: "Product name" })}</div>
        <label className="text-xs text-muted-foreground">Unit category
          <select className={posInput} value={group} onChange={(e) => { const g = e.target.value; setGroup(g); setUnit(UNIT_GROUPS.find((x) => x.group === g)!.units[0]); }} aria-label="Unit category">
            {UNIT_GROUPS.map((g) => <option key={g.group}>{g.group}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Unit<UnitSelect className={posInput} value={unit} onChange={setUnit} group={group} /></label>
        {I({ k: "sku", label: "Item code" })}{I({ k: "barcode", label: "Barcode" })}<label className="text-xs text-muted-foreground">Category<CategoryInput className={posInput} value={f.category} onChange={(v) => setF((x) => ({ ...x, category: v }))} /></label>{I({ k: "brand", label: "Brand" })}
        {I({ k: "sale_price", label: "Sale price", dec: true })}{I({ k: "purchase_price", label: "Purchase price", dec: true })}{I({ k: "wholesale_price", label: "Wholesale price", dec: true })}{I({ k: "wholesale_min_qty", label: "Min wholesale qty", dec: true })}{I({ k: "stock", label: "Opening stock", dec: true })}
        {I({ k: "min_stock", label: "Min stock", dec: true })}{I({ k: "tax_percent", label: "Tax %", dec: true })}
      </div>
      <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save item"}</Button>
    </section>
  );
}
