import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export function GoogleButton({ disabled, next }: { disabled?: boolean; next?: string }) {
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      const mod = (await import("@/integrations/lovable")) as {
        lovable: {
          auth: {
            signInWithOAuth: (
              provider: string,
              opts: { redirect_uri: string },
            ) => Promise<{ error?: unknown; redirected?: boolean }>;
          };
        };
      };
      const result = await mod.lovable.auth.signInWithOAuth("google", {
        redirect_uri: next ? window.location.origin + next : window.location.origin,
      });
      if (result.error) throw new Error(String(result.error));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={signIn}
      disabled={disabled || busy}
      className="h-11 w-full gap-2 border-border bg-card"
    >
      Continue with Google
    </Button>
  );
}
