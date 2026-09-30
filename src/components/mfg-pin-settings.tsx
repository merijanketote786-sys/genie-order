import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Factory } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMfgStatus } from "@/components/mfg-gate";
import { setMfgPin } from "@/lib/manufacturing.functions";

export function MfgPinSettings() {
  const { data } = useMfgStatus();
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data?.isAdmin) return null;
  const save = async (value: string | null) => {
    setBusy(true);
    try { await setMfgPin({ data: { pin: value } }); toast.success(value ? "Manufacturing PIN saved" : "Manufacturing PIN removed"); setPin(""); sessionStorage.removeItem("mfg-unlocked"); qc.invalidateQueries({ queryKey: ["mfg-status"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save PIN"); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold text-foreground"><Factory className="size-4 text-primary" /> Manufacturing PIN lock</p>
      <p className="text-xs text-muted-foreground">Status: {data.hasPin ? "PIN is set — manufacturing asks for it" : "No PIN set"}. Only admin can set or change this PIN.</p>
      <div className="flex flex-wrap gap-2">
        <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="New PIN (4-8 digits)" aria-label="New manufacturing PIN" className="h-10 w-48 rounded-lg border border-border bg-background px-3 text-sm" />
        <Button disabled={busy || pin.length < 4} onClick={() => save(pin)}>{data.hasPin ? "Change PIN" : "Set PIN"}</Button>
        {data.hasPin ? <Button variant="outline" disabled={busy} onClick={() => save(null)}>Remove PIN</Button> : null}
      </div>
    </section>
  );
}
