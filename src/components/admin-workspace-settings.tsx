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
import { listAppUsers, deleteAppUser } from "@/lib/admin.functions";
import { listPosMembers, setPosMemberRole, setPosMemberPerms, POS_ROLES, POS_PERM_GROUPS, ROLE_PERMS } from "@/lib/pos-access.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Save, SlidersHorizontal, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function AdminWorkspaceSettings({ onAddUser, usersOnly }: { onAddUser?: () => void; usersOnly?: boolean } = {}) {
  const qc = useQueryClient();
  const ws = useQuery({ queryKey: ["workspace-settings"], queryFn: () => getWorkspaceSettings() });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => listAppUsers() });
  const members = useQuery({ queryKey: ["member-sections"], queryFn: () => listMemberSections() });
  const posMembers = useQuery({ queryKey: ["pos-members"], queryFn: () => listPosMembers() });
  const posRoleOf = (id: string) => posMembers.data?.members.find((m) => m.id === id)?.role;
  const delUser = useMutation({
    mutationFn: (userId: string) => deleteAppUser({ data: { userId } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.message);
      toast.success("User deleted");
      ["admin-users", "pos-members", "member-sections", "admin-stats"].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: () => toast.error("Could not delete user"),
  });
  const posPermsOf = (id: string): string[] => {
    const m = posMembers.data?.members.find((x) => x.id === id);
    return m?.perms ?? ROLE_PERMS[m?.role ?? "manager"] ?? [];
  };
  const setPerms = useMutation({
    mutationFn: (v: { userId: string; perms: string[] }) => setPosMemberPerms({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pos-members"] }),
    onError: () => toast.error("Could not save POS access"),
  });
  const togglePerm = (userId: string, key: string) => {
    const cur = posPermsOf(userId);
    setPerms.mutate({ userId, perms: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] });
  };
  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: (typeof POS_ROLES)[number] }) => setPosMemberRole({ data: v }),
    onSuccess: () => {
      toast.success("POS role saved");
      void qc.invalidateQueries({ queryKey: ["pos-members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save role"),
    onError: () => toast.error("Could not save POS role"),
  });

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
    onError: () => toast.error("Save failed, please try again."),
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
      <div className={usersOnly ? "hidden" : "glass-panel space-y-4 rounded-2xl p-4"}>
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <h3 className="font-display text-sm font-bold">Business and workspace defaults</h3>
        </div>

        {ws.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name">
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
            <Field label="Order number starts from">
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
          Save workspace settings
        </Button>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" />
            <h3 className="font-display text-sm font-bold">Users and feature access</h3>
          </div>
          {onAddUser ? (
            <Button size="sm" className="gap-1.5" onClick={onAddUser}>
              <UserPlus className="size-4" /> Add user
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Add as many users as you need. Turn sections on or off for each user, and choose their POS
          role to control what they can do inside POS.
        </p>

        {users.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading users…
          </p>
        ) : (
          <div className="space-y-3">
            {(users.data?.users ?? []).map((u) => {
              const allowed = sectionsFor(u.id);
              const posRole = posRoleOf(u.id);
              return (
                <div key={u.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{u.fullName || u.email}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                    </div>
                    {posRole !== "admin" ? (
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-destructive" disabled={delUser.isPending}
                        onClick={() => { if (window.confirm(`Delete ${u.email}? They will lose all access and only see the sign-in page.`)) delUser.mutate(u.id); }}
                        aria-label={`Delete ${u.email}`}>
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    ) : null}
                    {posRole === "admin" ? (
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">POS: Admin (full access)</span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                        POS role
                        <select
                          value={posRole ?? "manager"}
                          onChange={(e) => setRole.mutate({ userId: u.id, role: e.target.value as (typeof POS_ROLES)[number] })}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs capitalize text-foreground"
                          aria-label={`POS role for ${u.email}`}
                        >
                          {POS_ROLES.map((r) => (
                            <option key={r} value={r} className="capitalize">{r}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
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
                  {posRole && posRole !== "admin" ? (
                    <details className="mt-3 rounded-lg border border-border bg-background/50 p-2">
                      <summary className="cursor-pointer text-xs font-semibold">POS features ({posPermsOf(u.id).length} on)</summary>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {POS_PERM_GROUPS.map((g) => (
                          <div key={g.title}>
                            <p className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">{g.title}</p>
                            <ul className="space-y-1">
                              {g.items.map((it) => (
                                <li key={it.key}>
                                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                                    <input type="checkbox" className="size-4 accent-primary"
                                      checked={posPermsOf(u.id).includes(it.key)}
                                      disabled={setPerms.isPending}
                                      onChange={() => togglePerm(u.id, it.key)} />
                                    {it.label}
                                  </label>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">Changing the POS role resets these ticks to that role's defaults.</p>
                    </details>
                  ) : null}
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
