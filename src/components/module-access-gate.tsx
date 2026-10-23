import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMySubscription } from "@/components/subscription";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { accessGateReady, moduleRedirect, routeModule } from "@/lib/module-access";

/** Keep restricted pages unmounted, including restored sessions and direct links. */
export function ModuleAccessGate({ children }: { children: ReactNode }) {
  const access = useMySubscription();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session?.user) return;
      channel = supabase.channel(`module-access-${data.session.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${data.session.user.id}` }, () => {
          void queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
          void queryClient.invalidateQueries({ queryKey: ["my-settings"] });
        }).subscribe();
    });
    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel); };
  }, [queryClient]);

  // Once access data is known, a failed background refetch (weak Wi-Fi) must not wipe the screen.
  const ready = accessGateReady(!!access.data, offline, access.isFetchedAfterMount);
  const destination = ready && access.data ? moduleRedirect(pathname, access.data) : null;
  const module = routeModule(pathname);
  const blocked = ready && access.data && (module === "pos" ? access.data.pos === false : module === "workspace" ? access.data.workspace === false : false);
  useEffect(() => {
    if (destination) void navigate({ to: destination, replace: true });
  }, [destination, navigate]);

  if (destination) return null;
  if (!ready || blocked) {
    return <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">{blocked ? "Access disabled. Please contact your admin." : access.isError ? "Could not check access. Please try again." : "Loading…"}</p>
        {(blocked || access.isError) && <div className="flex justify-center gap-2">
          {!blocked && <Button variant="outline" onClick={() => void access.refetch()}>Try again</Button>}
          <SignOutButton />
        </div>}
      </div>
    </main>;
  }
  return children;
}