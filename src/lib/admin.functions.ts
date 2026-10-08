import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const OWNER_EMAIL = "hhtraders008@gmail.com";

export type AccessInfo = {
  isAdmin: boolean;
  isOwner: boolean;
  isActive: boolean;
  email: string;
  fullName: string;
};

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "staff";
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  confirmed: boolean;
  /** true when the user runs their own separate workspace (self signup) */
  separate: boolean;
  /** mobile signup waiting for owner approval */
  pending: boolean;
};

type RpcClient = { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown }> };

async function isAdminUser(supabase: unknown, userId: string) {
  const { data } = await (supabase as RpcClient).rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  return data === true;
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    const [isAdmin, profile] = await Promise.all([
      isAdminUser(supabase, userId),
      supabase.from("profiles").select("full_name, is_active").eq("id", userId).maybeSingle(),
    ]);

    const email = (claims as Record<string, unknown>)["email"];

    const emailStr = typeof email === "string" ? email : "";

    return {
      isAdmin,
      isOwner: emailStr.toLowerCase() === OWNER_EMAIL,
      isActive: profile.data?.is_active !== false,
      email: emailStr,
      fullName: profile.data?.full_name ?? "",
    } satisfies AccessInfo;
  });

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, users: [] as AdminUserRow[], message: "Sirf admin" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) return { ok: false as const, users: [] as AdminUserRow[], message: error.message };

    const ids = authData.users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }, { data: pendingRows }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, is_active, workspace_id").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      (supabaseAdmin as any).from("signup_requests").select("user_id").is("approved_at", null),
    ]);
    const pendingIds = new Set(((pendingRows ?? []) as { user_id: string }[]).map((r) => r.user_id));

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const myWs = profileMap.get(context.userId)?.workspace_id;
    const adminIds = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));

    const users: AdminUserRow[] = authData.users.map((u) => {
      const p = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        fullName: p?.full_name ?? "",
        role: adminIds.has(u.id) ? "admin" : "staff",
        isActive: p?.is_active !== false,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        confirmed: Boolean(u.email_confirmed_at),
        separate: Boolean(p && myWs && p.workspace_id !== myWs),
        pending: pendingIds.has(u.id),
      };
    });

    users.sort((a, b) => a.email.localeCompare(b.email));
    return { ok: true as const, users, message: "" };
  });

export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "staff"]).optional(),
        isActive: z.boolean().optional(),
        fullName: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Only an admin can make this change." };
    }
    if (data.userId === context.userId && (data.role === "staff" || data.isActive === false)) {
      return { ok: false as const, message: "You cannot remove your own admin access." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role) {
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("workspace_id")
        .eq("id", data.userId)
        .maybeSingle();
      const targetWs = targetProfile?.workspace_id;
      if (!targetWs) {
        return { ok: false as const, message: "Could not find the user's workspace." };
      }
      if (data.role === "admin") {
        await supabaseAdmin
          .from("user_roles")
          .upsert(
            { user_id: data.userId, role: "admin", workspace_id: targetWs },
            { onConflict: "user_id,role,workspace_id" },
          );
      } else {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", data.userId)
          .eq("role", "admin");
      }
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: data.userId, role: "staff", workspace_id: targetWs },
          { onConflict: "user_id,role,workspace_id" },
        );
    }


    const patch: {
      role?: string;
      is_active?: boolean;
      full_name?: string;
    } = {};
    if (data.role) patch.role = data.role;
    if (typeof data.isActive === "boolean") patch.is_active = data.isActive;
    if (typeof data.fullName === "string") patch.full_name = data.fullName;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
      if (error) return { ok: false as const, message: error.message };
    }

    return { ok: true as const, message: "Updated successfully" };
  });

/** Platform owner approves a pending mobile-number signup. */
export const approveSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: owner } = await (context.supabase as any).rpc("is_platform_owner");
    if (owner !== true) return { ok: false as const, message: "Only the main owner can approve signups." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("signup_requests")
      .update({ approved_at: new Date().toISOString() })
      .eq("user_id", data.userId);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Signup approved" };
  });

/** Platform owner moves a self-signed-up user (their own workspace) into the owner's workspace as staff. */
export const adoptAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: owner } = await (context.supabase as any).rpc("is_platform_owner");
    if (owner !== true) return { ok: false as const, message: "Only the main owner can do this." };
    if (data.userId === context.userId) return { ok: false as const, message: "You cannot move your own account." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: me }, { data: target }, { data: authUser }] = await Promise.all([
      supabaseAdmin.from("profiles").select("workspace_id").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("profiles").select("workspace_id").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.userId),
    ]);
    const em = (authUser?.user?.email ?? "").toLowerCase();
    if (em === "hhtraders008@gmail.com" || em === "merijanketote786@gmail.com") return { ok: false as const, message: "Owner accounts cannot be moved." };
    if (!me?.workspace_id || !target) return { ok: false as const, message: "User not found." };
    if (target.workspace_id === me.workspace_id) return { ok: false as const, message: "User is already in your workspace." };
    const ws = me.workspace_id;
    const sb = supabaseAdmin as any;
    const { error } = await sb.from("profiles").update({ workspace_id: ws, role: "staff" }).eq("id", data.userId);
    if (error) return { ok: false as const, message: "Could not move user: " + error.message };
    await sb.from("user_roles").delete().eq("user_id", data.userId);
    await sb.from("user_roles").insert({ user_id: data.userId, role: "staff", workspace_id: ws });
    await sb.from("pos_member_roles").delete().eq("user_id", data.userId);
    await sb.from("user_settings").update({ workspace_id: ws }).eq("user_id", data.userId);
    await sb.from("label_settings").update({ workspace_id: ws }).eq("user_id", data.userId);
    return { ok: true as const, message: "User added to your workspace as staff" };
  });

/** Platform owner moves a staff user out into their own separate workspace, where they become admin. */
export const detachAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: owner } = await (context.supabase as any).rpc("is_platform_owner");
    if (owner !== true) return { ok: false as const, message: "Only the main owner can do this." };
    if (data.userId === context.userId) return { ok: false as const, message: "You cannot move your own account." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: target }, { data: authUser }] = await Promise.all([
      supabaseAdmin.from("profiles").select("workspace_id").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.userId),
    ]);
    const em = (authUser?.user?.email ?? "").toLowerCase();
    if (em === "hhtraders008@gmail.com" || em === "merijanketote786@gmail.com") return { ok: false as const, message: "Owner accounts cannot be moved." };
    if (!target) return { ok: false as const, message: "User not found." };
    if (target.workspace_id === data.userId) return { ok: false as const, message: "User already has a separate account." };
    const ws = data.userId;
    const sb = supabaseAdmin as any;
    const { error } = await sb.from("profiles").update({ workspace_id: ws, role: "admin" }).eq("id", data.userId);
    if (error) return { ok: false as const, message: "Could not move user: " + error.message };
    await sb.from("user_roles").delete().eq("user_id", data.userId);
    await sb.from("user_roles").insert({ user_id: data.userId, role: "admin", workspace_id: ws });
    await sb.from("pos_member_roles").delete().eq("user_id", data.userId);
    await sb.from("user_settings").update({ workspace_id: ws }).eq("user_id", data.userId);
    await sb.from("label_settings").update({ workspace_id: ws }).eq("user_id", data.userId);
    // new separate workspace starts inactive until the owner activates it in Subscriptions
    await sb.from("workspace_subscriptions").upsert({ workspace_id: ws, expires_at: new Date().toISOString() }, { onConflict: "workspace_id", ignoreDuplicates: true });
    return { ok: true as const, message: "User moved to a separate account" };
  });

/** Admin removes a user: access ends immediately and they only see the sign-in page. */
export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Only an admin can delete users." };
    }
    if (data.userId === context.userId) return { ok: false as const, message: "You cannot delete your own account." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: me }, { data: target }, { data: authUser }] = await Promise.all([
      supabaseAdmin.from("profiles").select("workspace_id").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("profiles").select("workspace_id").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.userId),
    ]);
    if (!target || target.workspace_id !== me?.workspace_id) return { ok: false as const, message: "User not found in your workspace." };
    if ((authUser?.user?.email ?? "").toLowerCase() === OWNER_EMAIL) return { ok: false as const, message: "The owner account cannot be deleted." };
    await supabaseAdmin.from("profiles").update({ is_active: false }).eq("id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await (supabaseAdmin as any).from("pos_member_roles").delete().eq("user_id", data.userId);
    // Soft delete keeps their past bills/orders linked, but the login is gone and sessions stop working.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId, true);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "User deleted" };
  });

/** Admin sets a new password for a user. Existing passwords are hashed and can never be read back. */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(8).max(72),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Only an admin can make this change." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "New password set successfully" };
  });

/** Sends the user an email with a password reset link. */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ email: z.string().email(), redirectTo: z.string().url() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Sirf admin ye kar sakta hai." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Reset link email par bhej diya" };
  });

/** Admin-only: generates the one-click Windows auto-sync installer (.cmd). */
export const getAutoSyncSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ folder: z.string().min(2).max(120).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Sirf admin ye file download kar sakta hai." };
    }
    const apiKey = process.env["PRODUCT_SYNC_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, message: "Sync key is not set on the server." };
    }
    const folder = (data.folder ?? "C:\\VyaparExport").replace(/["']/g, "");
    const { buildSetupCmd } = await import("@/lib/autosync-script.server");
    return {
      ok: true as const,
      fileName: "OrderBot-AutoSync-Setup.cmd",
      folder,
      content: buildSetupCmd({
        apiKey,
        url: "https://orderbot.hbchemicalspakistan.com/api/public/sync/products",
        folder,
      }),
    };
  });

/** Admin-only: endpoint + key so any other software can push rates directly. */
export const getSyncConnectInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Only an admin can view this information." };
    }
    const apiKey = process.env["PRODUCT_SYNC_API_KEY"];
    if (!apiKey) return { ok: false as const, message: "Sync key is not set on the server." };
    return {
      ok: true as const,
      endpoint: "https://orderbot.hbchemicalspakistan.com/api/public/sync/products",
      apiKey,
    };
  });

/* ---------------------------- dashboard stats --------------------------- */

async function workspaceOf(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.workspace_id ?? userId;
}

export type AdminStats = {
  users: number;
  activeUsers: number;
  blockedUsers: number;
  admins: number;
  orders: number;
  ordersToday: number;
  customers: number;
  invoices: number;
  unpaidInvoices: number;
  unpaidAmount: number;
  products: number;
  lastSyncAt: string | null;
};

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, stats: null, message: "Sirf admin" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ws = await workspaceOf(context.userId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const count = async (table: "orders" | "customers" | "invoices" | "products") => {
      const { count: c } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws);
      return c ?? 0;
    };

    const [orders, customers, invoices, products] = await Promise.all([
      count("orders"),
      count("customers"),
      count("invoices"),
      count("products"),
    ]);

    const [{ count: ordersToday }, { data: unpaid }, { data: lastSync }, { data: profiles }, { data: roles }] =
      await Promise.all([
        supabaseAdmin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws)
          .gte("created_at", startOfDay.toISOString()),
        supabaseAdmin
          .from("invoices")
          .select("total")
          .eq("workspace_id", ws)
          .neq("payment_status", "paid"),
        supabaseAdmin
          .from("sync_logs")
          .select("synced_at")
          .eq("workspace_id", ws)
          .order("synced_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin.from("profiles").select("id, is_active").eq("workspace_id", ws),
        supabaseAdmin.from("user_roles").select("user_id, role").eq("role", "admin"),
      ]);

    const memberIds = new Set((profiles ?? []).map((p) => p.id));
    const stats: AdminStats = {
      users: profiles?.length ?? 0,
      activeUsers: (profiles ?? []).filter((p) => p.is_active !== false).length,
      blockedUsers: (profiles ?? []).filter((p) => p.is_active === false).length,
      admins: (roles ?? []).filter((r) => memberIds.has(r.user_id)).length,
      orders,
      ordersToday: ordersToday ?? 0,
      customers,
      invoices,
      unpaidInvoices: unpaid?.length ?? 0,
      unpaidAmount: (unpaid ?? []).reduce((sum, r) => sum + Number(r.total ?? 0), 0),
      products,
      lastSyncAt: lastSync?.synced_at ?? null,
    };

    return { ok: true as const, stats, message: "" };
  });

/* --------------------------- user create/delete -------------------------- */

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().email().optional(),
        phone: z.string().max(20).optional(),
        fullName: z.string().max(120).optional(),
        password: z.string().min(8).max(72).optional(),
        role: z.enum(["admin", "staff"]).default("staff"),
        invite: z.boolean().default(false),
        redirectTo: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Sirf admin naya user bana sakta hai." };
    }
    // Phone number ko wahi internal email ID di jati hai jo sign-in page use karta hai,
    // taake staff apne number + password se login kar sake.
    let email = data.email;
    if (data.phone) {
      let digits = data.phone.replace(/\D/g, "");
      if (digits.startsWith("0")) digits = "92" + digits.slice(1);
      if (!digits.startsWith("92")) digits = "92" + digits;
      if (digits.length < 11) return { ok: false as const, message: "Enter a valid mobile number (e.g. 03001234567)" };
      email = `p${digits}@phone.hbchemicalspakistan.com`;
    }
    if (!email) return { ok: false as const, message: "Enter an email or mobile number." };
    const invite = data.invite && !data.phone; // phone users cannot receive invite emails
    if (!invite && !data.password) {
      return { ok: false as const, message: "Enter a password or send an invite email." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ws = await workspaceOf(context.userId);

    let userId: string | null = null;
    if (invite) {
      const { data: res, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: data.redirectTo,
        data: { full_name: data.fullName ?? "" },
      });
      if (error) return { ok: false as const, message: error.message };
      userId = res.user?.id ?? null;
    } else {
      const { data: res, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password!,
        email_confirm: true,
        user_metadata: { full_name: data.fullName ?? "" },
      });
      if (error) return { ok: false as const, message: error.message };
      userId = res.user?.id ?? null;
    }

    if (!userId) return { ok: false as const, message: "User was created, but the id was not found." };

    await supabaseAdmin
      .from("profiles")
      .update({
        workspace_id: ws,
        full_name: data.fullName ?? "",
        role: data.role,
      })
      .eq("id", userId);

    // keep role rows in the same workspace as the profile
    await supabaseAdmin.from("user_roles").update({ workspace_id: ws }).eq("user_id", userId);

    if (data.role === "admin") {
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "admin", workspace_id: ws },
          { onConflict: "user_id,role,workspace_id" },
        );
    }


    return {
      ok: true as const,
      message: invite
        ? "Invite email bhej diya"
        : data.phone
          ? "Naya user ban gaya — woh apne mobile number aur password se sign in karega"
          : "Naya user ban gaya",
    };
  });

/* ------------------------------ CSV export ------------------------------ */

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export const exportRecordsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ kind: z.enum(["orders", "invoices", "customers", "products"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Sirf admin export kar sakta hai." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ws = await workspaceOf(context.userId);

    const columns: Record<string, string> = {
      orders: "order_number, customer_name, phone, city, address, product, qty, product_total, delivery, advance, status, created_at",
      invoices: "invoice_number, customer_name, phone, total, payment_status, paid_at, created_at",
      customers: "name, phone, city, address, created_at",
      products: "name, unit, sale_price, p100_staff_price, p250_staff_price, p500_staff_price, stock, updated_at",
    };

    const { data: rows, error } = await supabaseAdmin
      .from(data.kind)
      .select(columns[data.kind]!)
      .eq("workspace_id", ws)
      .limit(5000);
    if (error) return { ok: false as const, message: error.message };

    return {
      ok: true as const,
      fileName: `${data.kind}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv((rows ?? []) as unknown as Record<string, unknown>[]),
      rows: rows?.length ?? 0,
      message: "",
    };
  });
