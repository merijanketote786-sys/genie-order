/**
 * Offline stand-in for the Supabase client. Desktop app me koi login nahi hota —
 * ek local session hamesha mojood hai aur koi network call nahi jati.
 */
import { nextOrderNumberOffline, OFFLINE_USER_ID } from "@/offline/store";

const user = {
  id: OFFLINE_USER_ID,
  email: "offline@device",
  user_metadata: { full_name: "Offline User" },
  app_metadata: {},
  aud: "authenticated",
  created_at: new Date(0).toISOString(),
};

const session = {
  access_token: "offline",
  refresh_token: "offline",
  token_type: "bearer",
  expires_in: 999999,
  expires_at: Math.floor(Date.now() / 1000) + 999999,
  user,
};

const ok = <T,>(data: T) => Promise.resolve({ data, error: null });

function table() {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") return undefined;
      if (prop === "maybeSingle" || prop === "single") return () => ok(null);
      return () => self;
    },
  });
  return self as never;
}

export const supabase = {
  auth: {
    getSession: () => ok({ session }),
    getUser: () => ok({ user }),
    onAuthStateChange: (_event: unknown) => ({
      data: { subscription: { unsubscribe() {} } },
    }),
    signOut: () => ok(null),
    signInWithPassword: () => ok({ session, user }),
    signInWithOAuth: () => ok({ url: null, provider: "google" }),
    signUp: () => ok({ session, user }),
    resetPasswordForEmail: () => ok({}),
    updateUser: () => ok({ user }),
  },
  from: () => table(),
  rpc: (fn: string) => {
    if (fn === "next_order_number") return ok(nextOrderNumberOffline());
    return ok(null);
  },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
  functions: { invoke: () => ok(null) },
} as unknown as typeof import("@/integrations/supabase/client")["supabase"];
