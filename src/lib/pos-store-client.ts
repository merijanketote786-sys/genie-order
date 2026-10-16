import { createMiddleware } from "@tanstack/react-start";
import { useEffect, useState } from "react";

const KEY = "pos-store-id";
const EVT = "pos-store-change";
export const ALL_STORES_ID = "all-stores";

export function getSelectedStoreId(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export function setSelectedStoreId(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
}

export function useSelectedStoreId(): string {
  const [id, setId] = useState("");
  useEffect(() => {
    const sync = () => setId(getSelectedStoreId());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return id;
}

/** Sends the selected POS store with every server call so stock moves in that store. */
let storeOverride: string | null = null;
/** Offline sync replays a queued bill in the store it was made in. */
export function setStoreOverride(id: string | null) { storeOverride = id; }

export const attachPosStore = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const id = storeOverride ?? getSelectedStoreId();
  const { offlineFetch } = await import("@/lib/offline-sync");
  return next({ headers: id ? { "x-pos-store": id } : {}, fetch: offlineFetch });
});
