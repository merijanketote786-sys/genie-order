import { useId } from "react";
import { usePosCategories } from "@/lib/pos-catalog";

/** Text box with a dropdown arrow listing saved POS categories (typing a new name still works). */
export function CategoryInput({ value, onChange, className, label = "Category" }: { value: string; onChange: (v: string) => void; className?: string; label?: string }) {
  const id = useId();
  const { data } = usePosCategories();
  const names = [...new Set((data ?? []).map((c) => c.name))].sort((a, b) => a.localeCompare(b));
  return (
    <div className="relative">
      <input className={`${className ?? ""} pr-7`} list={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder="Select category" />
      <svg aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      <datalist id={id}>{names.map((n) => <option key={n} value={n} />)}</datalist>
    </div>
  );
}
