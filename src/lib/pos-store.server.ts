import { getRequestHeader } from "@tanstack/react-start/server";

/** Selected POS store (sent by the browser as x-pos-store) forwarded to database stock functions. */
export function withStore<T>(q: T): T {
  const id = getRequestHeader("x-pos-store");
  const b = q as unknown as { setHeader?: (k: string, v: string) => T };
  if (id && /^[0-9a-f-]{36}$/i.test(id) && typeof b.setHeader === "function") return b.setHeader("x-pos-store", id);
  return q;
}
