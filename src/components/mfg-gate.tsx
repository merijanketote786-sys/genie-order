import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMfgStatus, verifyMfgPin } from "@/lib/manufacturing.functions";

const KEY = "mfg-unlocked";

export function useMfgStatus() {
  return useQuery({ queryKey: ["mfg-status"], queryFn: () => getMfgStatus(), staleTime: 60_000 });
}

/** Manufacturing sirf admin ke liye; PIN set ho to pehle unlock. */
export function MfgGate({ children, mode = "settings" }: { children: ReactNode; mode?: "settings" | "use" }) {
  const { data, isLoading } = useMfgStatus();
  const qc = useQueryClient();
  const [unlocked, setUnlocked] = useState(() => typeof window !== "undefined" && sessionStorage.getItem(KEY) === "1");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Checking access…</p>;
  if (mode === "use" && data?.canManufacture) return <>{children}</>;
  if (!(mode === "use" ? data?.canManufacture : data?.canSettings)) return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <ShieldOff className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-2 font-semibold text-foreground">No access</p>
      <p className="text-sm text-muted-foreground">Ask the admin to enable manufacturing for your account.</p>
    </div>
  );
  if (!data.hasPin || unlocked) return <>{children}</>;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await verifyMfgPin({ data: { pin } });
      if (r.ok) { sessionStorage.setItem(KEY, "1"); setUnlocked(true); } else { toast.error("Incorrect PIN"); setPin(""); qc.invalidateQueries({ queryKey: ["mfg-status"] }); }
    } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto w-full max-w-xs space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 font-bold text-foreground"><Lock className="size-4 text-primary" /> Manufacturing locked</p>
      <p className="text-xs text-muted-foreground">Enter the manufacturing PIN to continue.</p>
      <input autoFocus type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-lg tracking-widest outline-none focus:border-primary" aria-label="Manufacturing PIN" />
      <Button className="w-full" disabled={busy || pin.length < 4} onClick={submit}>Unlock</Button>
    </div>
  );
}
