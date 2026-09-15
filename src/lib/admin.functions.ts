import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AccessInfo = {
  isAdmin: boolean;
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

    return {
      isAdmin,
      isActive: profile.data?.is_active !== false,
      email: typeof email === "string" ? email : "",
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
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, is_active").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
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
      return { ok: false as const, message: "Sirf admin ye change kar sakta hai." };
    }
    if (data.userId === context.userId && (data.role === "staff" || data.isActive === false)) {
      return { ok: false as const, message: "Apna hi admin access nahi hata sakte." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role) {
      if (data.role === "admin") {
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      } else {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", data.userId)
          .eq("role", "admin");
      }
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "staff" }, { onConflict: "user_id,role" });
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

    return { ok: true as const, message: "Update ho gaya" };
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
      return { ok: false as const, message: "Sirf admin ye change kar sakta hai." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Naya password set ho gaya" };
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
