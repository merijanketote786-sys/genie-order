import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const sb = supabase as any;
type MySub = { active: boolean; expires_at: string | null; owner: boolean; pos?: boolean; workspace?: boolean };
type SubRow = { workspace_id: string; email: string | null; name: string | null; business: string | null; created_at: string; expires_at: string | null; pos_enabled: boolean; ws_enabled: boolean };

export function useMySubscription() {
  return useQuery({
    queryKey: ["my-subscription"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("my_subscription");
      if (error) return null;
      return data as MySub;
    },
    staleTime: 60_000,
  });
}

/** Read-only notice for workspaces whose subscription is not active. */
export function SubscriptionBanner() {
  const { data } = useMySubscription();
  if (!data || data.active) return null;
  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
      <Lock className="size-4 shrink-0" />
      Subscription inactive — your account is read-only. You can view your records but cannot add or change anything. Please contact the admin to renew.
    </div>
  );
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Unlimited");
const addMonths = (from: Date, m: number) => { const d = new Date(from); d.setMonth(d.getMonth() + m); return d.toISOString(); };

/** Platform-owner panel to activate, extend or expire client workspaces. */
export function SubscriptionManager() {
  const { data: me } = useMySubscription();
  const qc = useQueryClient();
  const [dates, setDates] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: ["sub-list"],
    enabled: !!me?.owner,
    queryFn: async () => {
      const { data, error } = await sb.rpc("sub_list");
      if (error) throw new Error("Could not load subscriptions");
      return (data ?? []) as SubRow[];
    },
  });
  const set = useMutation({
    mutationFn: async (v: { ws: string; exp: string | null }) => {
      const { error } = await sb.rpc("sub_set", { _ws: v.ws, _expires: v.exp });
      if (error) throw new Error("Could not update subscription");
    },
    onSuccess: () => { toast.success("Subscription updated"); qc.invalidateQueries({ queryKey: ["sub-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mods = useMutation({
    mutationFn: async (v: { ws: string; pos: boolean; workspace: boolean }) => {
      const { error } = await sb.rpc("sub_set_modules", { _ws: v.ws, _pos: v.pos, _workspace: v.workspace });
      if (error) throw new Error(error.message.includes("at least one") ? "Keep at least one of POS or Workspace enabled" : "Could not update access");
    },
    onSuccess: () => { toast.success("Access updated"); qc.invalidateQueries({ queryKey: ["sub-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!me?.owner) return null;
  const now = Date.now();
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Subscriptions</h2>
        <p className="text-xs text-muted-foreground">New accounts start inactive (read-only) until you activate them. Expired accounts become read-only automatically.</p>
      </div>
      {list.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <div className="space-y-2">
        {(list.data ?? []).map((r) => {
          const active = !r.expires_at || new Date(r.expires_at).getTime() > now;
          const base = r.expires_at && new Date(r.expires_at).getTime() > now ? new Date(r.expires_at) : new Date();
          return (
            <div key={r.workspace_id} className="flex flex-col gap-2 rounded-lg border border-border p-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{r.business || r.name || "Workspace"}</p>
                <p className="truncate text-xs text-muted-foreground">{r.email ?? "—"} · Joined {fmt(r.created_at)}</p>
                <p className={`text-xs font-semibold ${active ? "text-primary" : "text-destructive"}`}>
                  {active ? `Active · ${r.expires_at ? `until ${fmt(r.expires_at)}` : "Unlimited"}` : `Inactive${r.expires_at ? ` · expired ${fmt(r.expires_at)}` : ""}`}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-foreground">
                  <span className="text-muted-foreground">Access:</span>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.pos_enabled} disabled={mods.isPending} onChange={(e) => mods.mutate({ ws: r.workspace_id, pos: e.target.checked, workspace: r.ws_enabled })} /> POS</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.ws_enabled} disabled={mods.isPending} onChange={(e) => mods.mutate({ ws: r.workspace_id, pos: r.pos_enabled, workspace: e.target.checked })} /> Workspace</label>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" disabled={set.isPending} onClick={() => set.mutate({ ws: r.workspace_id, exp: addMonths(base, 1) })}>+1 month</Button>
                <Button size="sm" variant="outline" disabled={set.isPending} onClick={() => set.mutate({ ws: r.workspace_id, exp: addMonths(base, 12) })}>+1 year</Button>
                <input type="date" aria-label="Expiry date" value={dates[r.workspace_id] ?? ""} onChange={(e) => setDates((d) => ({ ...d, [r.workspace_id]: e.target.value }))} className="h-8 rounded-md border border-border bg-background px-2 text-sm" />
                <Button size="sm" variant="outline" disabled={set.isPending || !dates[r.workspace_id]} onClick={() => set.mutate({ ws: r.workspace_id, exp: new Date(`${dates[r.workspace_id]}T23:59:59`).toISOString() })}>Set date</Button>
                <Button size="sm" variant="outline" disabled={set.isPending} onClick={() => set.mutate({ ws: r.workspace_id, exp: null })}>Unlimited</Button>
                <Button size="sm" variant="destructive" disabled={set.isPending || !active} onClick={() => set.mutate({ ws: r.workspace_id, exp: new Date().toISOString() })}>Deactivate</Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
