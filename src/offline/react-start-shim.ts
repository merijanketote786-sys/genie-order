/** Offline build me server functions plain async functions hain. */
export function useServerFn<T>(fn: T): T {
  return fn;
}

export function createServerFn() {
  throw new Error("createServerFn is not available in the offline build.");
}

export function createMiddleware() {
  throw new Error("createMiddleware is not available in the offline build.");
}

export function createStart() {
  return {};
}
