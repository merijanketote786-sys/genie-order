import { UNIT_GROUPS, ALL_UNITS } from "@/lib/units";

export function UnitSelect({ value, onChange, className, group, label }: { value: string; onChange: (v: string) => void; className?: string; group?: string; label?: string }) {
  const groups = group ? UNIT_GROUPS.filter((g) => g.group === group) : UNIT_GROUPS;
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label ?? "Unit"}>
      {!value ? <option value="">Select unit</option> : null}
      {value && !ALL_UNITS.includes(value) ? <option value={value}>{value}</option> : null}
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>{g.units.map((u) => <option key={u} value={u}>{u}</option>)}</optgroup>
      ))}
    </select>
  );
}
