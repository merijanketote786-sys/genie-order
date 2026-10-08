import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // getSession reads the locally cached session (no network round-trip),
  // so switching tabs doesn't wait on an auth request every time.
  beforeLoad: async () => {
    // Server par session hota hi nahi — wahan redirect karne se server ka HTML
    // aur client ka first render alag ban jata tha (hydration mismatch → page
    // reload maangta tha). Redirect sirf browser mein hota hai.
    if (typeof window === "undefined") return { user: null };
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (error || !user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
