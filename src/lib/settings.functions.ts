import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  DEFAULT_USER_SETTINGS,
  DEFAULT_WORKSPACE_SETTINGS,
  type UserSettings,
  type WorkspaceSettings,
} from "@/lib/settings";

type AnySupabase = { from: (t: string) => any; rpc: (fn: string, args: unknown) => any };

async function isAdminUser(supabase: unknown, userId: string) {
  const { data } = await (supabase as AnySupabase).rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  return data === true;
}

async function workspaceOf(supabase: unknown, userId: string): Promise<string> {
  const { data } = await (supabase as AnySupabase)
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.workspace_id as string) ?? userId;
}

function toUserSettings(row: Record<string, any> | null): UserSettings {
  if (!row) return { ...DEFAULT_USER_SETTINGS };
  return {
    theme: (row["theme"] ?? "system") as UserSettings["theme"],
    paymentEnabled: Boolean(row["payment_enabled"]),
    defaultPaymentMethod: (row["default_payment_method"] ?? "COD") as UserSettings["defaultPaymentMethod"],
    defaultDelivery: String(row["default_delivery"] ?? ""),
    defaultCity: String(row["default_city"] ?? ""),
    defaultCourierProfileId: (row["default_courier_profile_id"] as string | null) ?? null,
    defaultWeight: String(row["default_weight"] ?? "1"),
    autoOrderNumber: row["auto_order_number"] !== false,
    compactMode: Boolean(row["compact_mode"]),
    allowedSections: Array.isArray(row["allowed_sections"]) ? (row["allowed_sections"] as string[]) : [],
  };
}

function toWorkspaceSettings(row: Record<string, any> | null): WorkspaceSettings {
  if (!row) return { ...DEFAULT_WORKSPACE_SETTINGS };
  return {
    businessName: String(row["business_name"] ?? ""),
    businessPhone: String(row["business_phone"] ?? ""),
    businessAddress: String(row["business_address"] ?? ""),
    currency: String(row["currency"] ?? "Rs"),
    invoicePrefix: String(row["invoice_prefix"] ?? "INV-"),
    orderNumberStart: Number(row["order_number_start"] ?? 370),
    defaultDelivery: String(row["default_delivery"] ?? ""),
    defaultPaymentMethod: (row["default_payment_method"] ?? "COD") as WorkspaceSettings["defaultPaymentMethod"],
    allowedSections: Array.isArray(row["allowed_sections"]) ? (row["allowed_sections"] as string[]) : [],
  };
}

export const getMySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const userId = context.userId;
    const [{ data: settingsRow }, { data: profile }, { data: wsRow }, isAdmin] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name, workspace_id").eq("id", userId).maybeSingle(),
      supabase.from("workspace_settings").select("*").maybeSingle(),
      isAdminUser(context.supabase, userId),
    ]);

    const email = (context.claims as Record<string, unknown>)["email"];
    return {
      settings: toUserSettings(settingsRow),
      workspace: toWorkspaceSettings(wsRow),
      isAdmin,
      email: typeof email === "string" ? email : "",
      fullName: (profile?.full_name as string) ?? "",
    };
  });

const userSettingsInput = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  paymentEnabled: z.boolean().optional(),
  defaultPaymentMethod: z.enum(["COD", "CC"]).optional(),
  defaultDelivery: z.string().max(40).optional(),
  defaultCity: z.string().max(80).optional(),
  defaultCourierProfileId: z.string().uuid().nullable().optional(),
  defaultWeight: z.string().max(10).optional(),
  autoOrderNumber: z.boolean().optional(),
  compactMode: z.boolean().optional(),
});

export const saveMySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => userSettingsInput.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const userId = context.userId;
    const patch: Record<string, unknown> = {};
    if (data.theme) patch["theme"] = data.theme;
    if (typeof data.paymentEnabled === "boolean") patch["payment_enabled"] = data.paymentEnabled;
    if (data.defaultPaymentMethod) patch["default_payment_method"] = data.defaultPaymentMethod;
    if (typeof data.defaultDelivery === "string") patch["default_delivery"] = data.defaultDelivery;
    if (typeof data.defaultCity === "string") patch["default_city"] = data.defaultCity;
    if (data.defaultCourierProfileId !== undefined)
      patch["default_courier_profile_id"] = data.defaultCourierProfileId;
    if (typeof data.defaultWeight === "string") patch["default_weight"] = data.defaultWeight;
    if (typeof data.autoOrderNumber === "boolean") patch["auto_order_number"] = data.autoOrderNumber;
    if (typeof data.compactMode === "boolean") patch["compact_mode"] = data.compactMode;

    const { data: existing } = await supabase
      .from("user_settings")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("user_settings").update(patch).eq("user_id", userId);
      if (error) return { ok: false as const, message: error.message };
    } else {
      const workspaceId = await workspaceOf(context.supabase, userId);
      const { error } = await supabase
        .from("user_settings")
        .insert({ user_id: userId, workspace_id: workspaceId, ...patch });
      if (error) return { ok: false as const, message: error.message };
    }
    return { ok: true as const, message: "Settings save ho gayin" };
  });

export const saveMyProfileName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fullName: z.string().max(120) }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: data.fullName })
      .eq("id", context.userId);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Naam update ho gaya" };
  });

/* ------------------------------ admin side ------------------------------ */

export const getWorkspaceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, settings: { ...DEFAULT_WORKSPACE_SETTINGS }, message: "Sirf admin" };
    }
    const { data } = await supabase.from("workspace_settings").select("*").maybeSingle();
    return { ok: true as const, settings: toWorkspaceSettings(data), message: "" };
  });

export const saveWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        businessName: z.string().max(120).optional(),
        businessPhone: z.string().max(40).optional(),
        businessAddress: z.string().max(240).optional(),
        currency: z.string().max(8).optional(),
        invoicePrefix: z.string().max(12).optional(),
        orderNumberStart: z.number().int().min(1).max(9_999_999).optional(),
        defaultDelivery: z.string().max(40).optional(),
        defaultPaymentMethod: z.enum(["COD", "CC"]).optional(),
        allowedSections: z.array(z.string().max(40)).max(30).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Sirf admin workspace settings badal sakta hai." };
    }
    const workspaceId = await workspaceOf(context.supabase, context.userId);

    const patch: Record<string, unknown> = { updated_by: context.userId };
    if (data.businessName !== undefined) patch["business_name"] = data.businessName;
    if (data.businessPhone !== undefined) patch["business_phone"] = data.businessPhone;
    if (data.businessAddress !== undefined) patch["business_address"] = data.businessAddress;
    if (data.currency !== undefined) patch["currency"] = data.currency;
    if (data.invoicePrefix !== undefined) patch["invoice_prefix"] = data.invoicePrefix;
    if (data.orderNumberStart !== undefined) patch["order_number_start"] = data.orderNumberStart;
    if (data.defaultDelivery !== undefined) patch["default_delivery"] = data.defaultDelivery;
    if (data.defaultPaymentMethod !== undefined) patch["default_payment_method"] = data.defaultPaymentMethod;
    if (data.allowedSections !== undefined) patch["allowed_sections"] = data.allowedSections;

    const { data: existing } = await supabase
      .from("workspace_settings")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("workspace_settings")
        .update(patch)
        .eq("workspace_id", workspaceId);
      if (error) return { ok: false as const, message: error.message };
    } else {
      const { error } = await supabase
        .from("workspace_settings")
        .insert({ workspace_id: workspaceId, ...patch });
      if (error) return { ok: false as const, message: error.message };
    }
    if (data.orderNumberStart !== undefined) {
      await supabase.rpc("set_order_number_start", { _start: data.orderNumberStart });
    }
    return { ok: true as const, message: "Workspace settings save ho gayin" };
  });

export type MemberSectionRow = { userId: string; allowedSections: string[] };

export const listMemberSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, members: [] as MemberSectionRow[] };
    }
    const { data } = await supabase.from("user_settings").select("user_id, allowed_sections");
    const members: MemberSectionRow[] = (data ?? []).map((r: Record<string, any>) => ({
      userId: r["user_id"] as string,
      allowedSections: Array.isArray(r["allowed_sections"]) ? (r["allowed_sections"] as string[]) : [],
    }));
    return { ok: true as const, members };
  });

export const saveMemberSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ userId: z.string().uuid(), allowedSections: z.array(z.string().max(40)).max(30) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) {
      return { ok: false as const, message: "Sirf admin ye change kar sakta hai." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const workspaceId = await workspaceOf(context.supabase, context.userId);
    const { error } = await (supabaseAdmin as unknown as AnySupabase)
      .from("user_settings")
      .upsert(
        {
          user_id: data.userId,
          workspace_id: workspaceId,
          allowed_sections: data.allowedSections,
        },
        { onConflict: "user_id" },
      );
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Access update ho gaya" };
  });

/* ---------------------------- personal export ---------------------------- */

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export const exportMyRecordsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ kind: z.enum(["orders", "invoices", "customers"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const columns: Record<string, string> = {
      orders:
        "order_number, customer_name, phone, city, address, product, qty, product_total, delivery, advance, status, created_at",
      invoices: "invoice_number, customer_name, phone, total, payment_status, paid_at, created_at",
      customers: "name, phone, city, address, created_at",
    };
    const { data: rows, error } = await supabase
      .from(data.kind)
      .select(columns[data.kind]!)
      .eq("created_by", context.userId)
      .limit(5000);
    if (error) return { ok: false as const, message: error.message };
    return {
      ok: true as const,
      fileName: `my-${data.kind}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv((rows ?? []) as Record<string, unknown>[]),
      rows: rows?.length ?? 0,
      message: "",
    };
  });
