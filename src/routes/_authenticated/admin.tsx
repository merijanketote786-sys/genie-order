import { AppShell } from "@/components/app-shell";
import { AdminWorkspaceSettings } from "@/components/admin-workspace-settings";
import { SubscriptionManager } from "@/components/subscription";
import { MfgPinSettings } from "@/components/mfg-pin-settings";
import { Settings2 } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import {
  createAppUser,
  deleteAppUser,
  exportRecordsCsv,
  getAdminStats,
  getMyAccess,
  listAppUsers,
  sendPasswordReset,
  setUserPassword,
  updateUserAccess,
  type AdminUserRow,
} from "@/lib/admin.functions";
import {
  deleteInvoice,
  deleteOrder,
  listInvoices,
  listOrders,
  setInvoiceStatus,
  type InvoiceRow,
  type OrderRow,
} from "@/lib/records.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Panel — HB Chemicals OrderBot" },
      {
        name: "description",
        content: "Manage users, records and app access — owner only.",
      },
      { property: "og:title", content: "Admin Panel — HB Chemicals OrderBot" },
      {
        property: "og:description",
        content: "Team accounts, dashboard stats, records control and data export in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const access = useQuery({ queryKey: ["my-access"], queryFn: () => getMyAccess() });
  const isOwner = access.data?.isOwner === true;
  const [section, setSection] = useState<
    "dashboard" | "users" | "settings" | "records" | "export"
  >("dashboard");
  const sections = [
    { key: "dashboard" as const, label: "Overview", icon: BarChart3 },
    { key: "users" as const, label: "Users", icon: Users },
    { key: "settings" as const, label: "Settings", icon: Settings2 },
    { key: "records" as const, label: "Records", icon: Database },
    { key: "export" as const, label: "Export", icon: Download },
  ];

  return (
    <AppShell title="Admin Panel" subtitle="Users, records and access control" active="/admin" wide>
      <div className="shrink-0 pt-3 sm:pt-4">
        <WorkspaceHeader
          icon={Users}
          eyebrow="Control center"
          title="Team, records and data"
          description="Create accounts, set roles, manage records and export data from here."
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-8 pt-3">
        {access.isLoading ? (
          <div className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking access…
          </div>
        ) : !isOwner ? (
          <div className="glass-panel rounded-2xl px-4 py-8 text-center">
            <ShieldOff className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 font-display text-base font-bold">No Access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This panel is only for the owner account.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-card p-1">
              {sections.map((item) => {
                const Icon = item.icon;
                return (
                  <Button key={item.key} variant={section === item.key ? "default" : "ghost"} onClick={() => setSection(item.key)} className="h-14 min-w-0 flex-col gap-1 px-1 text-[10px]">
                    <Icon className="size-4" />
                    <span className="max-w-full truncate">{item.label}</span>
                  </Button>
                );
              })}
            </div>
            {section === "dashboard" ? <StatsSection /> : null}
            {section === "users" ? <UsersSection /> : null}
            {section === "settings" ? <SettingsSection /> : null}
            {section === "records" ? <RecordsSection /> : null}
            {section === "export" ? <ExportSection /> : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ------------------------------- stats ---------------------------------- */

function StatsSection() {
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => getAdminStats() });
  const s = stats.data?.ok ? stats.data.stats : null;

  if (stats.isLoading) {
    return (
      <div className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Dashboard loading…
      </div>
    );
  }
  if (!s) return null;

  return (
    <section className="space-y-2">
      <SectionTitle>Dashboard</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatCard label="Team users" value={s.users} hint={`${s.activeUsers} active · ${s.blockedUsers} blocked`} />
        <StatCard label="Orders" value={s.orders} hint={`Today ${s.ordersToday}`} />
        <StatCard label="Invoices" value={s.invoices} hint={`${s.unpaidInvoices} unpaid`} />
        <StatCard label="Unpaid amount" value={Math.round(s.unpaidAmount)} hint="Rs" />
        <StatCard label="Customers" value={s.customers} />
        <StatCard label="Products" value={s.products} />
        <StatCard label="Admins" value={s.admins} />
        <div className="glass-panel rounded-2xl px-3 py-3 sm:px-4">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Last sync</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : "Not yet"}
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- users --------------------------------- */

function UsersSection() {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => listAppUsers() });
  const [pwUser, setPwUser] = useState<AdminUserRow | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const mutate = useMutation({
    mutationFn: (input: { userId: string; role?: "admin" | "staff"; isActive?: boolean }) =>
      updateUserAccess({ data: input }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
      } else toast.error(res.message);
    },
    onError: () => toast.error("Update failed. Please try again."),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => deleteAppUser({ data: { userId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
        void qc.invalidateQueries({ queryKey: ["admin-stats"] });
      } else toast.error(res.message);
    },
    onError: () => toast.error("Could not delete user."),
  });

  const rows = useMemo(() => {
    const list = users.data?.ok ? users.data.users : [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) => u.email.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q),
    );
  }, [users.data, search]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Users</SectionTitle>
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setShowCreate(true)}>
          <UserPlus className="size-3.5" /> New user
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name"
          className="h-11 pl-9"
        />
      </div>

      {users.isLoading ? (
        <div className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading users…
        </div>
      ) : !users.data?.ok ? (
        <div className="glass-panel rounded-2xl px-4 py-6 text-sm text-destructive">
          Could not load users. {users.data?.message}
        </div>
      ) : (
        <div className="glass-panel overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-bold">User</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Access</th>
                  <th className="px-4 py-3 font-bold">Last login</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{u.fullName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === "admin" ? "primary" : "muted"}>
                        {u.role === "admin" ? "Admin" : "Staff"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.isActive ? "success" : "danger"}>
                        {u.isActive ? "Active" : "Blocked"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mutate.isPending}
                          onClick={() =>
                            mutate.mutate({
                              userId: u.id,
                              role: u.role === "admin" ? "staff" : "admin",
                            })
                          }
                          className="h-9 gap-1.5 text-xs"
                        >
                          <ShieldCheck className="size-3.5" />
                          {u.role === "admin" ? "Remove admin" : "Make admin"}
                        </Button>
                        <Button
                          size="sm"
                          variant={u.isActive ? "outline" : "default"}
                          disabled={mutate.isPending}
                          onClick={() => mutate.mutate({ userId: u.id, isActive: !u.isActive })}
                          className="h-9 gap-1.5 text-xs"
                        >
                          {u.isActive ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                          {u.isActive ? "Block" : "Unblock"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPwUser(u)}
                          className="h-9 gap-1.5 text-xs"
                        >
                          <KeyRound className="size-3.5" />
                          Password
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete account for ${u.email}?`)) {
                              remove.mutate(u.id);
                            }
                          }}
                          className="h-9 gap-1.5 text-xs text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        The old password is not visible to anyone (it is encrypted and secure) — set a new password
        or send a reset link. Blocked users cannot see any data in the app.
      </p>

      <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} />
      <CreateUserDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </section>
  );
}

function SettingsSection() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SubscriptionManager />
      <MfgPinSettings />
      <AdminWorkspaceSettings onAddUser={() => setOpen(true)} />
      <CreateUserDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (invite: boolean) =>
      createAppUser({
        data: {
          email,
          fullName,
          role,
          invite,
          password: invite ? undefined : password,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        setEmail("");
        setFullName("");
        setPassword("");
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
        void qc.invalidateQueries({ queryKey: ["admin-stats"] });
        onClose();
      } else toast.error(res.message);
    },
    onError: () => toast.error("Could not create user."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Create new user</DialogTitle>
          <DialogDescription>
            Set the password yourself, or send an invite email so the user can create their own password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nu-email">Email</Label>
            <Input
              id="nu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-name">Full name</Label>
            <Input
              id="nu-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Name"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-pw">Password (leave blank to send an invite)</Label>
            <Input
              id="nu-pw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              {(["staff", "admin"] as const).map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant={role === r ? "default" : "outline"}
                  className="h-10 flex-1 text-xs capitalize"
                  onClick={() => setRole(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="h-11 flex-1 gap-2"
            disabled={create.isPending || !email || password.length < 8}
            onClick={() => create.mutate(false)}
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Create user
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1 gap-2"
            disabled={create.isPending || !email}
            onClick={() => create.mutate(true)}
          >
            <Mail className="size-4" /> Send invite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- export --------------------------------- */

const EXPORTS = [
  { kind: "orders", label: "Orders" },
  { kind: "invoices", label: "Invoices" },
  { kind: "customers", label: "Customers" },
  { kind: "products", label: "Products" },
] as const;

function ExportSection() {
  const download = useMutation({
    mutationFn: (kind: (typeof EXPORTS)[number]["kind"]) => exportRecordsCsv({ data: { kind } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.message);
      if (!res.csv) return toast.error("No records found to export.");
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${res.rows} records downloaded`);
    },
    onError: () => toast.error("Export failed."),
  });

  return (
    <section className="space-y-2">
      <SectionTitle>Data export</SectionTitle>
      <div className="glass-panel flex flex-wrap gap-2 rounded-2xl p-3">
        {EXPORTS.map((e) => (
          <Button
            key={e.kind}
            variant="outline"
            size="sm"
            disabled={download.isPending}
            onClick={() => download.mutate(e.kind)}
            className="h-10 gap-1.5 text-xs"
          >
            <Download className="size-3.5" /> {e.label} CSV
          </Button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- records -------------------------------- */

function RecordsSection() {
  const [tab, setTab] = useState<"orders" | "invoices">("orders");
  const qc = useQueryClient();

  const orders = useQuery({
    queryKey: ["admin-recent-orders"],
    queryFn: () => listOrders({ data: { limit: 25 } }),
    enabled: tab === "orders",
  });
  const invoices = useQuery({
    queryKey: ["admin-recent-invoices"],
    queryFn: () => listInvoices({ data: {} }),
    enabled: tab === "invoices",
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-recent-orders"] });
    void qc.invalidateQueries({ queryKey: ["admin-recent-invoices"] });
    void qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const removeOrder = useMutation({
    mutationFn: (id: string) => deleteOrder({ data: { id } }),
    onSuccess: () => {
      toast.success("Order deleted");
      refresh();
    },
    onError: () => toast.error("Delete failed."),
  });

  const removeInvoice = useMutation({
    mutationFn: (id: string) => deleteInvoice({ data: { id } }),
    onSuccess: () => {
      toast.success("Invoice deleted");
      refresh();
    },
    onError: () => toast.error("Delete failed."),
  });

  const status = useMutation({
    mutationFn: (input: { id: string; status: "unpaid" | "paid" }) => setInvoiceStatus({ data: input }),
    onSuccess: () => {
      toast.success("Status updated");
      refresh();
    },
    onError: () => toast.error("Could not update status."),
  });

  return (
    <section className="space-y-2">
      <SectionTitle>Records control</SectionTitle>
      <div className="flex gap-2">
        {(["orders", "invoices"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
            className="h-9 text-xs capitalize"
          >
            {t}
          </Button>
        ))}
      </div>

      <div className="glass-panel overflow-hidden rounded-2xl">
        {tab === "orders" ? (
          orders.isLoading ? (
            <Loading />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-bold">Order</th>
                    <th className="px-4 py-3 font-bold">Customer</th>
                    <th className="px-4 py-3 font-bold">Total</th>
                    <th className="px-4 py-3 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {((orders.data?.orders ?? []) as OrderRow[]).slice(0, 25).map((o) => (
                    <tr key={o.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{o.orderNumber || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{o.customerName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{o.phone || ""}</p>
                      </td>
                      <td className="px-4 py-3">{o.total == null ? "—" : `Rs ${o.total}`}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 gap-1.5 text-xs text-destructive"
                          disabled={removeOrder.isPending}
                          onClick={() => window.confirm("Delete this order?") && removeOrder.mutate(o.id)}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : invoices.isLoading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-bold">Invoice</th>
                  <th className="px-4 py-3 font-bold">Customer</th>
                  <th className="px-4 py-3 font-bold">Total</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {((invoices.data?.invoices ?? []) as InvoiceRow[]).slice(0, 25).map((i) => (
                  <tr key={i.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{i.invoiceNumber}</p>
                      <Badge tone={i.paymentStatus === "paid" ? "success" : "danger"}>
                        {i.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p>{i.customerName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{i.phone || ""}</p>
                    </td>
                    <td className="px-4 py-3">{i.total == null ? "—" : `Rs ${i.total}`}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-xs"
                          disabled={status.isPending}
                          onClick={() =>
                            status.mutate({
                              id: i.id,
                              status: i.paymentStatus === "paid" ? "unpaid" : "paid",
                            })
                          }
                        >
                          {i.paymentStatus === "paid" ? "Mark unpaid" : "Mark paid"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 gap-1.5 text-xs text-destructive"
                          disabled={removeInvoice.isPending}
                          onClick={() => window.confirm("Delete this invoice?") && removeInvoice.mutate(i.id)}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------- shared --------------------------------- */

function Loading() {
  return (
    <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 font-display text-sm font-bold text-foreground">{children}</h2>;
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="glass-panel rounded-2xl px-3 py-3 sm:px-4">
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "primary" | "muted" | "success" | "danger";
  children: React.ReactNode;
}) {
  const tones = {
    primary: "border-primary/30 bg-primary/10 text-primary",
    muted: "border-border bg-muted text-muted-foreground",
    success: "border-success/30 bg-success/10 text-success",
    danger: "border-destructive/30 bg-destructive/10 text-destructive",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function PasswordDialog({ user, onClose }: { user: AdminUserRow | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  const save = useMutation({
    mutationFn: (input: { userId: string; password: string }) => setUserPassword({ data: input }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        setPassword("");
        onClose();
      } else toast.error(res.message);
    },
    onError: () => toast.error("Could not set password."),
  });

  const reset = useMutation({
    mutationFn: (email: string) =>
      sendPasswordReset({
        data: { email, redirectTo: `${window.location.origin}/reset-password` },
      }),
    onSuccess: (res) => (res.ok ? toast.success(res.message) : toast.error(res.message)),
    onError: () => toast.error("Could not send email."),
  });

  return (
    <Dialog open={user !== null} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Manage password</DialogTitle>
          <DialogDescription>
            {user?.email} — the old password is not visible to anyone, it is encrypted and secure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="new-pw">New password</Label>
          <div className="relative">
            <Input
              id="new-pw"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-11 pr-11"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="h-11 flex-1 gap-2"
            disabled={password.length < 8 || save.isPending || !user}
            onClick={() => user && save.mutate({ userId: user.id, password })}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Set password
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1 gap-2"
            disabled={reset.isPending || !user?.email}
            onClick={() => user?.email && reset.mutate(user.email)}
          >
            {reset.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Send reset link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
