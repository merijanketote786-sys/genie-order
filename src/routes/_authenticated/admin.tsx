import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import {
  getMyAccess,
  listAppUsers,
  sendPasswordReset,
  setUserPassword,
  updateUserAccess,
  type AdminUserRow,
} from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck, ShieldOff, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Panel — HB Chemicals OrderBot" },
      {
        name: "description",
        content: "Users ke roles aur app access manage karein — sirf admin ke liye.",
      },
      { property: "og:title", content: "Admin Panel — HB Chemicals OrderBot" },
      {
        property: "og:description",
        content: "Staff accounts, admin roles aur access control ek jagah.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const access = useQuery({ queryKey: ["my-access"], queryFn: () => getMyAccess() });
  const isAdmin = access.data?.isAdmin === true;

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listAppUsers(),
    enabled: isAdmin,
  });

  const [pwUser, setPwUser] = useState<AdminUserRow | null>(null);
  const qc = useQueryClient();
  const mutate = useMutation({
    mutationFn: (input: { userId: string; role?: "admin" | "staff"; isActive?: boolean }) =>
      updateUserAccess({ data: input }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message);
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
      } else {
        toast.error(res.message);
      }
    },
    onError: () => toast.error("Update nahi ho saka. Dobara koshish karein."),
  });

  return (
    <AppShell title="Admin Panel" subtitle="Users, roles aur access control" active="/admin">
      <div className="shrink-0 pt-3 sm:pt-4">
        <WorkspaceHeader
          icon={Users}
          eyebrow="Access control"
          title="Team aur permissions"
          description="Yahan se staff accounts ka role aur app access set karein. Sirf admin hi ye page dekh sakta hai."
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-8 pt-3">
        {access.isLoading ? (
          <div className="glass-panel flex items-center gap-2 rounded-xl px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking access…
          </div>
        ) : !isAdmin ? (
          <div className="glass-panel rounded-xl px-4 py-8 text-center">
            <ShieldOff className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 font-display text-base font-bold">Access nahi hai</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ye panel sirf admin account ke liye hai.
            </p>
          </div>
        ) : users.isLoading ? (
          <div className="glass-panel flex items-center gap-2 rounded-xl px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Users load ho rahe hain…
          </div>
        ) : !users.data?.ok ? (
          <div className="glass-panel rounded-xl px-4 py-6 text-sm text-destructive">
            Users load nahi ho sake. {users.data?.message}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatCard label="Total users" value={users.data.users.length} />
              <StatCard
                label="Admins"
                value={users.data.users.filter((u) => u.role === "admin").length}
              />
              <StatCard
                label="Blocked"
                value={users.data.users.filter((u) => !u.isActive).length}
              />
            </div>

            <div className="glass-panel overflow-hidden rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                      <th className="px-4 py-3 font-bold">User</th>
                      <th className="px-4 py-3 font-bold">Role</th>
                      <th className="px-4 py-3 font-bold">Access</th>
                      <th className="px-4 py-3 text-right font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.users.map((u) => (
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
                              {u.role === "admin" ? "Admin hataen" : "Admin banaen"}
                            </Button>
                            <Button
                              size="sm"
                              variant={u.isActive ? "outline" : "default"}
                              disabled={mutate.isPending}
                              onClick={() => mutate.mutate({ userId: u.id, isActive: !u.isActive })}
                              className="h-9 gap-1.5 text-xs"
                            >
                              {u.isActive ? (
                                <UserX className="size-3.5" />
                              ) : (
                                <UserCheck className="size-3.5" />
                              )}
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="px-1 text-xs text-muted-foreground">
              Security ki wajah se purana password kisi ko bhi nazar nahi aata (woh encrypted
              mehfooz hota hai) — aap naya password set kar sakte hain ya reset link bhej sakte
              hain.
            </p>
            <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} />

            <p className="px-1 text-xs text-muted-foreground">
              Block kiye gaye user app ke kisi bhi section (Rates, Sync, Invoice) ka data nahi dekh
              sakte.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-panel rounded-xl px-3 py-3 sm:px-4">
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold text-foreground">{value}</p>
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
    onError: () => toast.error("Password set nahi ho saka."),
  });

  const reset = useMutation({
    mutationFn: (email: string) =>
      sendPasswordReset({
        data: { email, redirectTo: `${window.location.origin}/reset-password` },
      }),
    onSuccess: (res) => (res.ok ? toast.success(res.message) : toast.error(res.message)),
    onError: () => toast.error("Email nahi bheja ja saka."),
  });

  return (
    <Dialog open={user !== null} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Password manage karein</DialogTitle>
          <DialogDescription>
            {user?.email} — purana password kisi ko nazar nahi aa sakta, woh encrypted mehfooz hai.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="new-pw">Naya password</Label>
          <div className="relative">
            <Input
              id="new-pw"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kam az kam 8 characters"
              className="h-11 pr-11"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Password chhupayein" : "Password dikhayein"}
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
            Password set karein
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1 gap-2"
            disabled={reset.isPending || !user?.email}
            onClick={() => user?.email && reset.mutate(user.email)}
          >
            {reset.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Reset link bhejein
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
