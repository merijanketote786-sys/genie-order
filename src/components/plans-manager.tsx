import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type Plan = {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  features: string;
  highlight: boolean;
  is_active: boolean;
  sort_order: number;
};

export const plansQuery = {
  queryKey: ["subscription-plans"],
  queryFn: async (): Promise<Plan[]> => {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("id,name,price,currency,period,features,highlight,is_active,sort_order")
      .order("sort_order")
      .order("price");
    if (error) throw error;
    return (data ?? []) as Plan[];
  },
};

export function formatPlanPrice(p: Pick<Plan, "price" | "currency" | "period">) {
  const n = Number(p.price).toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return `${p.currency} ${n}${p.period ? ` / ${p.period}` : ""}`;
}

function PlanRow({ plan }: { plan: Plan }) {
  const qc = useQueryClient();
  const [d, setD] = useState(plan);
  const save = useMutation({
    mutationFn: async () => {
      if (!d.name.trim()) throw new Error("Plan name is required");
      const { error } = await supabase.from("subscription_plans").update({
        name: d.name.trim(), price: Number(d.price) || 0, currency: d.currency.trim() || "PKR",
        period: d.period.trim(), features: d.features, highlight: d.highlight,
        is_active: d.is_active, sort_order: Number(d.sort_order) || 0, updated_at: new Date().toISOString(),
      }).eq("id", plan.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan saved"); qc.invalidateQueries({ queryKey: plansQuery.queryKey }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subscription_plans").delete().eq("id", plan.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan deleted"); qc.invalidateQueries({ queryKey: plansQuery.queryKey }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1 sm:col-span-2"><Label>Plan name</Label><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
        <div className="grid gap-1"><Label>Price</Label><Input type="number" min={0} value={d.price} onChange={(e) => setD({ ...d, price: Number(e.target.value) })} /></div>
        <div className="grid gap-1"><Label>Currency</Label><Input value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value })} /></div>
        <div className="grid gap-1"><Label>Period</Label><Input value={d.period} placeholder="month / year" onChange={(e) => setD({ ...d, period: e.target.value })} /></div>
        <div className="grid gap-1"><Label>Order</Label><Input type="number" value={d.sort_order} onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })} /></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={d.highlight} onCheckedChange={(v) => setD({ ...d, highlight: v })} /> Popular</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={d.is_active} onCheckedChange={(v) => setD({ ...d, is_active: v })} /> Show on login</label>
      </div>
      <div className="grid gap-1"><Label>Features (one per line)</Label><Textarea rows={4} value={d.features} onChange={(e) => setD({ ...d, features: e.target.value })} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { if (confirm("Delete this plan?")) del.mutate(); }} disabled={del.isPending}><Trash2 className="size-4" /> Delete</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save</Button>
      </div>
    </div>
  );
}

export function PlansManager() {
  const qc = useQueryClient();
  const plans = useQuery(plansQuery);
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subscription_plans").insert({ name: "New plan", price: 0, is_active: false, sort_order: (plans.data?.length ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: plansQuery.queryKey }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add plan"),
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold">Subscription plans</h2>
          <p className="text-sm text-muted-foreground">Plans marked "Show on login" appear in the login page header.</p>
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending}><Plus className="size-4" /> Add plan</Button>
      </div>
      {plans.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
      {plans.data?.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No plans yet — add your first plan.</p> : null}
      {plans.data?.map((p) => <PlanRow key={p.id + p.sort_order} plan={p} />)}
    </div>
  );
}
