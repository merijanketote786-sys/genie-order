/** Offline build me server functions plain async functions hain. */
export function useServerFn<T>(fn: T): T {
  return fn;
}

const OFFLINE_MSG = "This feature needs an internet connection.";

/**
 * Chainable stub: modules that build server functions at import time load fine,
 * and only calling the function offline throws a clear error.
 */
function chain(): any {
  const fn = async () => {
    throw new Error(OFFLINE_MSG);
  };
  return new Proxy(fn, {
    get: (_t, key) => (key === "then" ? undefined : () => chain()),
  });
}

export function createServerFn(): any {
  return chain();
}

export function createMiddleware(): any {
  return chain();
}

export function createStart() {
  return {};
}
