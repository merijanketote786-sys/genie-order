/**
 * Offline outbox for POS writes. When the device is offline, a save is stored
 * on the device (IndexedDB) and replayed through the same server function when
 * internet returns. Every payload carries a clientRef, so a retry never posts twice.
 */
import { get, set } from "idb-keyval";
import { useEffect, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { savePosDoc } from "@/lib/pos.functions";
import { savePurchase, saveSalesReturn, saveUnlinkedSalesReturn } from "@/lib/business.functions";
import { getSelectedStoreId, setStoreOverride } from "@/lib/pos-store-client";

export type OutboxKind = "posDoc" | "purchase" | "salesReturn" | "unlinkedReturn" | "raw";
export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  label: string;
  number: string;
  storeId: string;
  data: Record<string, unknown>;
  /** kind "raw": the exact server request, replayed with a fresh sign-in token. */
  raw?: { url: string; body: string; headers: Record<string, string> };
  createdAt: string;
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FNS: Record<Exclude<OutboxKind, "raw">, (a: { data: any }) => Promise<unknown>> = {
  posDoc: savePosDoc,
  purchase: savePurchase,
  salesReturn: saveSalesReturn,
  unlinkedReturn: saveUnlinkedSalesReturn,
};

const KEY = "pos-outbox-v1";
const EVT = "pos-outbox-change";
let syncing = false;
let qc: QueryClient | null = null;

export async function readOutbox(): Promise<OutboxItem[]> {
  try { return ((await get(KEY)) as OutboxItem[] | undefined) ?? []; } catch { return []; }
}
async function writeOutbox(items: OutboxItem[]) {
  await set(KEY, items);
  window.dispatchEvent(new Event(EVT));
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function isNetworkError(e: unknown) {
  if (!isOnline()) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg);
}

// ---------- Device prefix (offline bill numbers) ----------
const PREFIX_KEY = "pos-device-prefix";
const SEQ_KEY = "pos-device-seq";
export function getDevicePrefix(): string {
  if (typeof window === "undefined") return "";
  let p = localStorage.getItem(PREFIX_KEY);
  if (!p) {
    p = "D" + Math.random().toString(36).slice(2, 4).toUpperCase();
    localStorage.setItem(PREFIX_KEY, p);
  }
  return p;
}
export function setDevicePrefix(p: string) {
  const v = p.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (v) localStorage.setItem(PREFIX_KEY, v);
  window.dispatchEvent(new Event(EVT));
  return v;
}
export function nextOfflineNumber(): string {
  const seq = (Number(localStorage.getItem(SEQ_KEY)) || 0) + 1;
  localStorage.setItem(SEQ_KEY, String(seq));
  return `${getDevicePrefix()}-${String(seq).padStart(4, "0")}`;
}

// ---------- Run now, or queue when offline ----------
export type Queued = { queued: true; number: string };

export async function runOrQueue<T>(kind: OutboxKind, data: Record<string, unknown>, opts: { label: string; numberField?: string }): Promise<T | Queued> {
  if (isOnline()) {
    try { return (await FNS[kind as Exclude<OutboxKind, "raw">]({ data })) as T; } catch (e) { if (!isNetworkError(e)) throw e; }
  }
  const number = opts.numberField && typeof data[opts.numberField] === "string" && data[opts.numberField]
    ? String(data[opts.numberField])
    : nextOfflineNumber();
  const payload = opts.numberField ? { ...data, [opts.numberField]: number } : data;
  const items = await readOutbox();
  items.push({ id: crypto.randomUUID(), kind, label: opts.label, number, storeId: getSelectedStoreId(), data: payload, createdAt: new Date().toISOString() });
  await writeOutbox(items);
  return { queued: true, number };
}

export function isQueued(r: unknown): r is Queued {
  return !!r && typeof r === "object" && (r as Queued).queued === true;
}

export async function removeOutboxItem(id: string) {
  await writeOutbox((await readOutbox()).filter((i) => i.id !== id));
}

export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (syncing || !isOnline()) return { sent: 0, failed: 0 };
  syncing = true;
  window.dispatchEvent(new Event(EVT));
  let sent = 0, failed = 0;
  try {
    for (const item of await readOutbox()) {
      try {
        setStoreOverride(item.storeId || null);
        if (item.kind === "raw" && item.raw) await replayRaw(item.raw);
        else await FNS[item.kind as Exclude<OutboxKind, "raw">]({ data: item.data });
        await writeOutbox((await readOutbox()).filter((i) => i.id !== item.id));
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        failed++;
        const msg = e instanceof Error ? e.message : "Sync failed";
        await writeOutbox((await readOutbox()).map((i) => (i.id === item.id ? { ...i, error: msg } : i)));
      } finally {
        setStoreOverride(null);
      }
    }
  } finally {
    syncing = false;
    window.dispatchEvent(new Event(EVT));
    if (sent && qc) void qc.invalidateQueries();
  }
  return { sent, failed };
}

/** Call once on the client: auto-sync on reconnect and every 60s. */
export function startOfflineSync(queryClient: QueryClient) {
  qc = queryClient;
  const run = () => { void flushOutbox(); };
  window.addEventListener("online", run);
  const t = window.setInterval(run, 60_000);
  run();
  return () => { window.removeEventListener("online", run); window.clearInterval(t); };
}

export function useOutboxStatus() {
  const [s, setS] = useState({ online: true, syncing: false, items: [] as OutboxItem[], prefix: "" });
  useEffect(() => {
    const load = async () => setS({ online: isOnline(), syncing, items: await readOutbox(), prefix: getDevicePrefix() });
    void load();
    window.addEventListener(EVT, load);
    window.addEventListener("online", load);
    window.addEventListener("offline", load);
    return () => { window.removeEventListener(EVT, load); window.removeEventListener("online", load); window.removeEventListener("offline", load); };
  }, []);
  return s;
}

// ---------- Offline sign-in ----------
/** Last signed-in user saved on this device (used only when there is no internet). */
export function storedOfflineUser(): { id: string; email?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (!/^sb-.*-auth-token$/.test(k)) continue;
      const v = JSON.parse(localStorage.getItem(k) ?? "null");
      const u = v?.user ?? v?.currentSession?.user;
      if (u?.id) return u;
    }
  } catch { /* ignore */ }
  return null;
}

/** Offline search: filter an already-downloaded full list instead of asking the server. */
export function offlineFilter<T extends Record<string, unknown>>(rows: T[] | undefined, q: string, fields: (keyof T)[]) {
  const t = q.trim().toLowerCase();
  const digits = t.replace(/\D/g, "");
  if (!rows) return [];
  if (!t) return rows;
  return rows.filter((r) => fields.some((f) => {
    const v = String(r[f] ?? "").toLowerCase();
    return v.includes(t) || (digits.length >= 3 && v.replace(/\D/g, "").includes(digits));
  }));
}

let lastWarm = 0;
/** While online, download full lists so search keeps working without internet. */
export async function warmOfflineData(queryClient: QueryClient) {
  if (!isOnline() || Date.now() - lastWarm < 5 * 60_000) return;
  lastWarm = Date.now();
  const [{ listCustomers }, { getProducts }, biz] = await Promise.all([
    import("@/lib/records.functions"), import("@/lib/products.functions"), import("@/lib/business.functions"),
  ]);
  const opt = { staleTime: 5 * 60_000 };
  await Promise.allSettled([
    queryClient.prefetchQuery({ queryKey: ["pos-customers", ""], queryFn: () => listCustomers({ data: { posOnly: true } }), ...opt }),
    queryClient.prefetchQuery({ queryKey: ["customer-picker", ""], queryFn: () => listCustomers({ data: {} }), ...opt }),
    queryClient.prefetchQuery({ queryKey: ["suppliers"], queryFn: () => biz.listSuppliers(), ...opt }),
    queryClient.prefetchQuery({ queryKey: ["pos-products"], queryFn: () => getProducts({ data: { scope: "pos" } }), ...opt }),
    queryClient.prefetchQuery({ queryKey: ["products-lite"], queryFn: () => biz.listProductsLite(), ...opt }),
  ]);
  // Main screens ko offline kholne ke liye pehle se save kar lo (sirf live site par service worker hota hai).
  try {
    if ("caches" in window && navigator.serviceWorker?.controller) {
      const c = await caches.open("hbpos-pages");
      await Promise.allSettled(["/pos", "/pos-dashboard", "/purchases", "/returns", "/labels", "/auth", "/"].map((u) => c.add(u)));
    }
  } catch { /* ignore */ }
}

// ---------- Generic offline queue for any allowed save (via fetch) ----------
async function replayRaw(raw: NonNullable<OutboxItem["raw"]>) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(raw.headers);
  if (data.session?.access_token) headers.set("authorization", `Bearer ${data.session.access_token}`);
  const res = await fetch(raw.url, { method: "POST", body: raw.body, headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const m = t.match(/"message"\s*:\s*"([^"]{1,200})"/);
    throw new Error(m?.[1] ?? `Server rejected this entry (${res.status})`);
  }
}

/** Custom fetch for server calls: when offline, allowed saves are stored and a "queued" answer is returned. */
export const offlineFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? "GET").toUpperCase();
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const canQueue = method === "POST" && typeof init?.body === "string";
  if (isOnline() || !canQueue) {
    try { return await fetch(input, init); } catch (e) { if (!canQueue || !isNetworkError(e)) throw e; }
  }
  const { queueLabelFor } = await import("@/lib/offline-registry");
  const label = queueLabelFor(url);
  if (!label) throw new Error("No internet — this action needs internet. Please try again when online.");
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => { if (k !== "authorization") headers[k] = v; });
  const number = nextOfflineNumber();
  const items = await readOutbox();
  items.push({ id: crypto.randomUUID(), kind: "raw", label, number, storeId: headers["x-pos-store"] ?? "", data: {}, raw: { url, body: init!.body as string, headers }, createdAt: new Date().toISOString() });
  await writeOutbox(items);
  void import("sonner").then(({ toast }) => toast.info(`No internet — ${label} ${number} saved on this device. It will sync automatically.`));
  const answer = { queued: true, offline: true, number, invoiceNumber: number, id: "", ok: true };
  return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
};
