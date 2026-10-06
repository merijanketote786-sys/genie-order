import { UNIT_GROUPS, ALL_UNITS } from "@/lib/units";
import { usePosUnits } from "@/lib/pos-catalog";

export function UnitSelect({ value, onChange, className, group, label }: { value: string; onChange: (v: string) => void; className?: string; group?: string; label?: string }) {
  const { data: mine } = usePosUnits();
  const myNames = (mine ?? []).map((u) => u.name);
  const groups = group ? UNIT_GROUPS.filter((g) => g.group === group) : UNIT_GROUPS;
  const known = [...ALL_UNITS, ...myNames];
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label ?? "Unit"}>
      {!value ? <option value="">Select unit</option> : null}
      {value && !known.includes(value) ? <option value={value}>{value}</option> : null}
      {myNames.length ? <optgroup label="My units">{myNames.map((u) => <option key={`m-${u}`} value={u}>{u}</option>)}</optgroup> : null}
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>{g.units.filter((u) => !myNames.includes(u)).map((u) => <option key={u} value={u}>{u}</option>)}</optgroup>
      ))}
    </select>
  );
}
