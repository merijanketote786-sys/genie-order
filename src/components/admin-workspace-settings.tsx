import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_SECTIONS } from "@/lib/settings";
import {
  getWorkspaceSettings,
  listMemberSections,
  saveMemberSections,
  saveWorkspaceSettings,
} from "@/lib/settings.functions";
import { listAppUsers } from "@/lib/admin.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function AdminWorkspaceSettings() {
  const qc = useQueryClient();
  const ws = useQuery({ queryKey: ["workspace-settings"], queryFn: () => getWorkspaceSettings() });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => listAppUsers() });
  const members = useQuery({ queryKey: ["member-sections"], queryFn: () => listMemberSections() });

  const [form, setForm] = useState({
    businessName: "",
    businessPhone: "",
    businessAddress: "",
    currency: "Rs",
    invoicePrefix: "INV-",
    orderNumberStart: "370",
    defaultDelivery: "",
    defaultPaymentMethod: "COD" as "COD" | "CC",
  });

  useEffect(() => {
    const s = ws.data?.settings;
    if (!s) return;
    setForm({
      businessName: s.businessName,
      businessPhone: s.businessPhone,
      businessAddress: s.businessAddress,
      currency: s.currency,
      invoicePrefix: s.invoicePrefix,
      orderNumberStart: String(s.orderNumberStart),
      defaultDelivery: s.defaultDelivery,
      defaultPaymentMethod: s.defaultPaymentMethod,
    });
  }, [ws.data]);

  const save = useMutation({
    mutationFn: () =>
      saveWorkspaceSettings({
        data: {
          businessName: form.businessName,
          businessPhone: form.businessPhone,
          businessAddress: form.businessAddress,
          currency: form.currency,
          invoicePrefix: form.invoicePrefix,
          orderNumberStart: Number(form.orderNumberStart) || 370,
          defaultDelivery: form.defaultDelivery,
          defaultPaymentMethod: form.defaultPaymentMethod,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        void qc.invalidateQueries({ queryKey: ["workspace-settings"] });
      } else toast.error(res.message);
    },
    onError: () => toast.error("Save nahi hua, dobara koshish karein."),
  });

  const saveSections = useMutation({
    mutationFn: (v: { userId: string; allowedSections: string[] }) => saveMemberSections({ data: v }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        void qc.invalidateQueries({ queryKey: ["member-sections"] });
      } else toast.error(res.message);
    },
  });

  const sectionsFor = (userId: string) =>
    members.data?.members?.find((m) => m.userId === userId)?.allowedSections ?? [];

  const toggleSection = (userId: string, key: string) => {
    const current = sectionsFor(userId);
    const all = APP_SECTIONS.map((s) => s.key as string);
    const base = current.length ? current : all;
    const next = base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    saveSections.mutate({ userId, allowedSections: next.length === all.length ? [] : next });
  };

  return (
    <section className="space-y-4">
      <div className="glass-panel space-y-4 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <h3 className="font-display text-sm font-bold">Business aur workspace defaults</h3>
        </div>

        {ws.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Load ho raha hai…
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business ka naam">
              <Input
                value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                placeholder="HB Chemicals Pakistan"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.businessPhone}
                onChange={(e) => setForm((f) => ({ ...f, businessPhone: e.target.value }))}
                placeholder="03xx-xxxxxxx"
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={form.businessAddress}
                onChange={(e) => setForm((f) => ({ ...f, businessAddress: e.target.value }))}
                placeholder="Shop / office address"
              />
            </Field>
            <Field label="Currency">
              <Input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                placeholder="Rs"
              />
            </Field>
            <Field label="Invoice prefix">
              <Input
                value={form.invoicePrefix}
                onChange={(e) => setForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
                placeholder="INV-"
              />
            </Field>
            <Field label="Order number yahan se shuru">
              <Input
                inputMode="numeric"
                value={form.orderNumberStart}
                onChange={(e) => setForm((f) => ({ ...f, orderNumberStart: e.target.value }))}
                placeholder="370"
              />
            </Field>
            <Field label="Default delivery charges">
              <Input
                value={form.defaultDelivery}
                onChange={(e) => setForm((f) => ({ ...f, defaultDelivery: e.target.value }))}
                placeholder="250"
              />
            </Field>
            <Field label="Default payment">
              <div className="grid grid-cols-2 gap-2">
                {(["COD", "CC"] as const).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={form.defaultPaymentMethod === m ? "default" : "outline"}
                    onClick={() => setForm((f) => ({ ...f, defaultPaymentMethod: m }))}
                    className="h-10"
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </Field>
          </div>
        )}

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full gap-2 sm:w-auto">
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Workspace settings save karein
        </Button>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <h3 className="font-display text-sm font-bold">Har user ko kaunse sections dikhein</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Sab buttons on hon to user ko poora app dikhta hai. Jo section off karein ge wo us user se chhup
          jayega.
        </p>

        {users.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Users load ho rahe hain…
          </p>
        ) : (
          <div className="space-y-3">
            {(users.data?.users ?? []).map((u) => {
              const allowed = sectionsFor(u.id);
              return (
                <div key={u.id} className="rounded-xl border border-border bg-card p-3">
                  <p className="truncate text-sm font-semibold">{u.fullName || u.email}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {APP_SECTIONS.map((s) => {
                      const on = allowed.length === 0 || allowed.includes(s.key);
                      return (
                        <Button
                          key={s.key}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          className="h-8 px-2.5 text-[11px]"
                          onClick={() => toggleSection(u.id, s.key)}
                        >
                          {s.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
