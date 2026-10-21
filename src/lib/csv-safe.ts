/** Neutralize spreadsheet formula injection: text cells starting with = + - @ tab or CR get a leading apostrophe. Numbers are left as-is. */
export function csvSafe(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
