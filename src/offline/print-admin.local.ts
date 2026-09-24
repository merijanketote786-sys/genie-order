/** Offline build: printers device par save, audit/sync/export available nahi. */
import { _savePrintersLocal } from "./pos-access.local";
export async function savePrinters(a: { data: { printers: unknown; defaults: unknown } }) { _savePrintersLocal(a.data.printers, a.data.defaults); return { ok: true }; }
export async function logPosEvent(_a: unknown) { return { ok: true }; }
export async function listAuditLog(_a?: unknown) { return { rows: [] as { id: string; action: string; entity: string; entityId: string | null; details: string; user: string; at: string }[] }; }
export async function exportData(_a: unknown): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> { throw new Error("Server export is not available in the offline app"); }
export async function getSyncOverview() { return { products: 0, lastBackup: null as string | null, logs: [] as { id: string; at: string; total: number; updated: number; inserted: number; skipped: number; errors: number; status: string; details: string }[] }; }
