import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { listCouriers } from "@/lib/courier-rates.functions";
import {
  exportMyRecordsCsv,
  getMySettings,
  saveMyProfileName,
  saveMySettings,
} from "@/lib/settings.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Database,
  Download,
  KeyRound,
  Loader2,
  Moon,
  Package,
  ReceiptText,
  Save,
  Settings2,
  Sun,
  Trash2,
  UserCog,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — HB Chemicals OrderBot" },
      {
        name: "description",
        content: "Set your profile, order/invoice defaults, courier and data controls.",
      },
      { property: "og:title", content: "Settings — HB Chemicals OrderBot" },
      {
        property: "og:description",
        content: "Every user can manage their own settings — theme, defaults and data export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

type Tab = "profile" | "orders" | "courier" | "data";

function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("profile");
  const mine = useQuery({ queryKey: ["my-settings"], queryFn: () => getMySettings() });

  const tabs = [
    { key: "profile" as const, label: "Profile", icon: UserCog },
    { key: "orders" as const, label: "Order/Invoice", icon: ReceiptText },
    { key: "courier" as const, label: "Courier", icon: Package },
    { key: "data" as const, label: "Data", icon: Database },
  ];

  return (
    <AppShell title="Settings" subtitle="Controls for your account" active="/settings" wide>
      <div className="shrink-0 pt-3 sm:pt-4">
        <WorkspaceHeader
          icon={Settings2}
          eyebrow="My settings"
          title="My settings"
          description="These are only your account's settings — each user has their own."
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-8 pt-3">
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-card p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <Button
                key={t.key}
                variant={tab === t.key ? "default" : "ghost"}
                onClick={() => setTab(t.key)}
                className="h-14 min-w-0 flex-col gap-1 px-1 text-[10px]"
              >
                <Icon className="size-4" />
                <span className="max-w-full truncate">{t.label}</span>
              </Button>
            );
          })}
        </div>

        {mine.isLoading ? (
          <div className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {tab === "profile" ? <ProfileTab data={mine.data} qc={qc} /> : null}
            {tab === "orders" ? <DefaultsTab data={mine.data} qc={qc} /> : null}
            {tab === "courier" ? <CourierTab data={mine.data} qc={qc} /> : null}
            {tab === "data" ? <DataTab /> : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

type MineData = Awaited<ReturnType<typeof getMySettings>> | undefined;
type QC = ReturnType<typeof useQueryClient>;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel space-y-3 rounded-2xl p-4">
      <h3 className="font-display text-sm font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function applyTheme(theme: "light" | "dark" | "system") {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.classList.toggle("light", resolved === "light");
  try {
    localStorage.setItem("app-theme", resolved);
  } catch {
    // ignore
  }
}

function ProfileTab({ data, qc }: { data: MineData; qc: QC }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    if (!data) return;
    setName(data.fullName);
    setTheme(data.settings.theme);
  }, [data]);

  const saveName = useMutation({
    mutationFn: () => saveMyProfileName({ data: { fullName: name } }),
    onSuccess: (r) => {
      r.ok ? toast.success(r.message) : toast.error(r.message);
      void qc.invalidateQueries({ queryKey: ["my-settings"] });
      void qc.invalidateQueries({ queryKey: ["my-access"] });
    },
  });

  const saveTheme = useMutation({
    mutationFn: (v: "system" | "light" | "dark") => saveMySettings({ data: { theme: v } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["my-settings"] }),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      setPassword("");
      toast.success("Password changed");
    },
    onError: (e: Error) => toast.error(e.message || "Password change failed"),
  });

  return (
    <div className="space-y-4">
      <Panel title="Account">
        <Field label="Email">
          <Input value={data?.email ?? ""} readOnly className="bg-muted/40" />
        </Field>
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </Field>
        <Button onClick={() => saveName.mutate()} disabled={saveName.isPending} className="gap-2">
          {saveName.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save name
        </Button>
      </Panel>

      <Panel title="Theme">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: "light" as const, label: "Light", icon: Sun },
              { key: "dark" as const, label: "Dark", icon: Moon },
              { key: "system" as const, label: "System", icon: Settings2 },
            ]
          ).map((t) => {
            const Icon = t.icon;
            return (
              <Button
                key={t.key}
                variant={theme === t.key ? "default" : "outline"}
                className="h-11 gap-2"
                onClick={() => {
                  setTheme(t.key);
                  applyTheme(t.key);
                  saveTheme.mutate(t.key);
                }}
              >
                <Icon className="size-4" />
                {t.label}
              </Button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Password">
        <Field label="New password (at least 8 characters)">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button
          onClick={() => changePassword.mutate()}
          disabled={password.length < 8 || changePassword.isPending}
          className="gap-2"
        >
          {changePassword.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          Update password
        </Button>
      </Panel>
    </div>
  );
}

function DefaultsTab({ data, qc }: { data: MineData; qc: QC }) {
  const [form, setForm] = useState({
    paymentEnabled: false,
    defaultPaymentMethod: "COD" as "COD" | "CC",
    defaultDelivery: "",
    defaultCity: "",
    autoOrderNumber: true,
  });

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setForm({
      paymentEnabled: s.paymentEnabled,
      defaultPaymentMethod: s.defaultPaymentMethod,
      defaultDelivery: s.defaultDelivery || data.workspace.defaultDelivery,
      defaultCity: s.defaultCity,
      autoOrderNumber: s.autoOrderNumber,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveMySettings({ data: form }),
    onSuccess: (r) => {
      r.ok ? toast.success(r.message) : toast.error(r.message);
      void qc.invalidateQueries({ queryKey: ["my-settings"] });
    },
  });

  return (
    <div className="space-y-4">
      <Panel title="Order and invoice defaults">
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
          <span className="text-sm font-semibold">Payment status by default on</span>
          <Button
            variant={form.paymentEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setForm((f) => ({ ...f, paymentEnabled: !f.paymentEnabled }))}
          >
            {form.paymentEnabled ? "On" : "Off"}
          </Button>
        </div>

        <Field label="Default payment">
          <div className="grid grid-cols-2 gap-2">
            {(["COD", "CC"] as const).map((m) => (
              <Button
                key={m}
                variant={form.defaultPaymentMethod === m ? "default" : "outline"}
                className="h-10"
                onClick={() => setForm((f) => ({ ...f, defaultPaymentMethod: m }))}
              >
                {m}
              </Button>
            ))}
          </div>
        </Field>

        <Field label="Default delivery charges">
          <Input
            value={form.defaultDelivery}
            onChange={(e) => setForm((f) => ({ ...f, defaultDelivery: e.target.value }))}
            placeholder="250"
          />
        </Field>

        <Field label="Default city">
          <Input
            value={form.defaultCity}
            onChange={(e) => setForm((f) => ({ ...f, defaultCity: e.target.value }))}
            placeholder="Lahore"
          />
        </Field>

        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
          <span className="text-sm font-semibold">Assign auto order number</span>
          <Button
            variant={form.autoOrderNumber ? "default" : "outline"}
            size="sm"
            onClick={() => setForm((f) => ({ ...f, autoOrderNumber: !f.autoOrderNumber }))}
          >
            {form.autoOrderNumber ? "On" : "Off"}
          </Button>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
      </Panel>
    </div>
  );
}

function CourierTab({ data, qc }: { data: MineData; qc: QC }) {
  const couriers = useQuery({ queryKey: ["couriers"], queryFn: () => listCouriers() });
  const [selected, setSelected] = useState<string | null>(null);
  const [weight, setWeight] = useState("1");

  useEffect(() => {
    if (!data) return;
    setSelected(data.settings.defaultCourierProfileId);
    setWeight(data.settings.defaultWeight);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveMySettings({ data: { defaultCourierProfileId: selected, defaultWeight: weight } }),
    onSuccess: (r) => {
      r.ok ? toast.success(r.message) : toast.error(r.message);
      void qc.invalidateQueries({ queryKey: ["my-settings"] });
    },
  });

  return (
    <Panel title="Courier and rates">
      <Field label="Default courier">
        <div className="space-y-2">
          <Button
            variant={selected === null ? "default" : "outline"}
            className="h-10 w-full justify-start"
            onClick={() => setSelected(null)}
          >
            Built-in / no default
          </Button>
          {(couriers.data?.couriers ?? []).map((c) => (
            <Button
              key={c.id}
              variant={selected === c.id ? "default" : "outline"}
              className="h-10 w-full justify-start"
              onClick={() => setSelected(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </Field>

      <Field label="Default weight (kg)">
        <Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
      </Field>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save
      </Button>
    </Panel>
  );
}

function DataTab() {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (kind: "orders" | "invoices" | "customers") => {
    setBusy(kind);
    try {
      const res = await exportMyRecordsCsv({ data: { kind } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${res.rows} rows downloaded`);
    } finally {
      setBusy(null);
    }
  };

  const clearChats = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.includes("chat") || k.startsWith("workspace-handoff"))
        .forEach((k) => localStorage.removeItem(k));
      toast.success("Chat history cleared");
    } catch {
      toast.error("Clear failed");
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Export my data">
        <div className="grid gap-2 sm:grid-cols-3">
          {(["orders", "invoices", "customers"] as const).map((k) => (
            <Button
              key={k}
              variant="outline"
              className="h-11 gap-2"
              disabled={busy === k}
              onClick={() => void download(k)}
            >
              {busy === k ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {k}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Only records that you created.</p>
      </Panel>

      <Panel title="Chat history on this device">
        <Button variant="outline" className="h-11 gap-2" onClick={clearChats}>
          <Trash2 className="size-4" /> Clear chat history
        </Button>
        <p className="text-xs text-muted-foreground">
          Saved orders, invoices and customers will remain intact — only old chat box messages will be removed.
        </p>
      </Panel>
    </div>
  );
}
