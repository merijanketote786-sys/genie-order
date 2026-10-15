import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import { startOfflineSync } from "@/lib/offline-sync";

const SW_URL = "/sw.js";

function swRefused() {
  if (!import.meta.env.PROD) return true;
  try { if (window.self !== window.top) return true; } catch { return true; }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (/(^|\.)lovableproject(-dev)?\.com$/.test(h)) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function registerSw() {
  if (!("serviceWorker" in navigator)) return;
  if (swRefused()) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter((r) => r.active?.scriptURL.endsWith(SW_URL)).map((r) => r.unregister()));
    return;
  }
  try { await navigator.serviceWorker.register(SW_URL, { scope: "/" }); } catch { /* ignore */ }
}

/** Client-only: keeps a device copy of loaded data, starts outbox sync and the offline app cache. */
export function bootOffline(queryClient: QueryClient) {
  const persister = createAsyncStoragePersister({
    storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
    key: "hbpos-query-cache",
    throttleTime: 2000,
  });
  const [unsub] = persistQueryClient({ queryClient, persister, maxAge: 1000 * 60 * 60 * 24 * 30, buster: "v1" });
  const stop = startOfflineSync(queryClient);
  void registerSw();
  return () => { unsub(); stop(); };
}
