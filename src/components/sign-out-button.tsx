import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await queryClient.cancelQueries();
    // Leave protected screens first so no mounted query refetches without a session
    await navigate({ to: "/auth", replace: true });
    await supabase.auth.signOut();
    queryClient.clear();
  };

  if (import.meta.env.VITE_OFFLINE === "1") return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={signOut}
      aria-label="Sign out"
      className="h-10 shrink-0 gap-1.5 border-border bg-card text-xs"
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
