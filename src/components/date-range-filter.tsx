import { Button } from "@/components/ui/button";
import { posInput } from "@/components/pos-subnav";

export type DateRange = { from: string; to: string };
export const ALL_DATES: DateRange = { from: "", to: "" };

/** From/To date filter — jab koi date select na ho to "All" (sab transactions) dikhte hain. */
export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const active = !!(value.from || value.to);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        className={`${posInput} w-36`}
        value={value.from}
        max={value.to || undefined}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        aria-label="From date"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="date"
        className={`${posInput} w-36`}
        value={value.to}
        min={value.from || undefined}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        aria-label="To date"
      />
      {active ? (
        <Button size="sm" variant="outline" onClick={() => onChange(ALL_DATES)}>
          Show all
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">All dates</span>
      )}
    </div>
  );
}

/** Local date boundaries ko ISO mein badalta hai (server filter ke liye). */
export function rangeToIso(r: DateRange): { from?: string; to?: string } {
  return {
    from: r.from ? new Date(`${r.from}T00:00:00`).toISOString() : undefined,
    to: r.to ? new Date(`${r.to}T23:59:59.999`).toISOString() : undefined,
  };
}
