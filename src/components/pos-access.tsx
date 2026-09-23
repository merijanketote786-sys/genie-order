import { Button } from "@/components/ui/button";
import { getPosAccess, verifyPosPin, type PosPerm } from "@/lib/pos-access.functions";
import { resolveCfg } from "@/lib/pos-config";
import { setMoneyDecimals } from "@/lib/pos";
import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export function usePosAccess() {
  const { data } = useQuery({ queryKey: ["pos-access"], queryFn: () => getPosAccess(), staleTime: 60_000 });
  const can = useCallback((p: PosPerm) => (data ? data.perms.includes(p) : true), [data]);
  const config = data?.config ?? {};
  const cfg = useMemo(() => {
    const r = resolveCfg(config);
    setMoneyDecimals(r.decimals);
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  return { access: data, can, config, cfg };
}

/**
 * Manager PIN prompt. `ask()` true tab deta hai jab PIN sahi ho.
 * `onlyPin` = raw PIN wapas (jaise server-side cancel ke liye).
 */
export function usePinPrompt(): [ReactNode, (why: string) => Promise<string | null>] {
  const [open, setOpen] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const res = useRef<(v: string | null) => void>(() => {});

  const ask = useCallback((why: string) => new Promise<string | null>((resolve) => { res.current = resolve; setPin(""); setOpen(why); }), []);
  const close = (v: string | null) => { setOpen(null); res.current(v); };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await verifyPosPin({ data: { pin } });
      if (r.ok) close(pin); else toast.error("PIN ghalat hai");
    } finally { setBusy(false); }
  };

  const node = open ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label="Manager PIN">
      <div className="w-full max-w-xs space-y-3 rounded-xl border border-border bg-card p-4 shadow-xl">
        <p className="flex items-center gap-2 font-bold text-foreground"><KeyRound className="size-4 text-primary" /> Manager PIN</p>
        <p className="text-xs text-muted-foreground">{open}</p>
        <input autoFocus type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") close(null); }} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-lg tracking-widest outline-none focus:border-primary" aria-label="PIN" />
        <div className="flex gap-2"><Button className="flex-1" disabled={busy || pin.length < 4} onClick={submit}>Theek hai</Button><Button variant="ghost" onClick={() => close(null)}>Cancel</Button></div>
      </div>
    </div>
  ) : null;
  return [node, ask];
}
