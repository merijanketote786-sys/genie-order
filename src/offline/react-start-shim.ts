/** Offline build me server functions plain async functions hain. */
export function useServerFn<T>(fn: T): T {
  return fn;
}

export function createServerFn() {
  throw new Error("createServerFn offline build me available nahi hai.");
}

export function createMiddleware() {
  throw new Error("createMiddleware offline build me available nahi hai.");
}

export function createStart() {
  return {};
}
