/** Offline (desktop) build: POS access/settings is device par localStorage me. Sab ijazat owner ko. */
export const POS_ROLES = ["manager", "cashier", "salesman", "staff"] as const;
export type PosPerm = string;
export type { PosConfig } from "@/lib/pos-config";
const KEY = "hbchem-offline-pos-settings:v1";
const read = (): Record<string, unknown> => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const allPerms = { includes: () => true } as unknown as PosPerm[];
export async function getPosAccess() { return { role: "admin", perms: allPerms, hasPin: false, config: read() }; }
export async function verifyPosPin(_a: { data: { pin: string } }) { return { ok: true }; }
export async function savePosSettings(a: { data: { config: Record<string, unknown>; pin: string | null } }) {
  const prev = read();
  const next = { ...a.data.config };
  if (next.printers === undefined) next.printers = prev.printers;
  if (next.printerDefaults === undefined) next.printerDefaults = prev.printerDefaults;
  localStorage.setItem(KEY, JSON.stringify(next));
  return { ok: true };
}
export async function listPosMembers() { return { members: [] as { id: string; name: string; active: boolean; role: string }[] }; }
export async function setPosMemberRole(_a: unknown) { throw new Error("Offline app me staff roles available nahi"); }
export async function cancelWithPin(_a: unknown) { throw new Error("Offline app me available nahi"); }
export async function exportPosBackup() { return { tables: {} as Record<string, unknown[]> }; }
export function _savePrintersLocal(printers: unknown, defaults: unknown) {
  localStorage.setItem(KEY, JSON.stringify({ ...read(), printers, printerDefaults: defaults }));
}
