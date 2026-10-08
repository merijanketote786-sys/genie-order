import { createFileRoute, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SubscriptionBanner } from "@/components/subscription";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // getSession reads the locally cached session (no network round-trip),
  // so switching tabs doesn't wait on an auth request every time.
  // Server par session hota hi nahi — wahan redirect karne se server ka HTML
  // aur client ka first render alag ban jata tha (hydration mismatch → page
  // reload maangta tha). Is liye redirect component gate mein hota hai.
  beforeLoad: async () => {
    if (typeof window === "undefined") return { user: null };
    const { data, error } = await supabase.auth.getSession();
    if (error) return { user: null };
    return { user: data.session?.user ?? null };
  },
  component: AuthGate,
});

function AuthGate() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    // Logout par purani queries bina login ke dobara na chalein (Unauthorized error).
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.cancelQueries();
        queryClient.clear();
        navigate({ to: "/auth", replace: true });
        router.invalidate();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, router, queryClient]);
  useEffect(() => {
    if (!user) navigate({ to: "/auth", replace: true });
  }, [user, navigate]);
  if (!user) return null;
  return <><SubscriptionBanner /><Outlet /></>;
}
