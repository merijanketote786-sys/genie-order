import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeConfig, type LabelConfig } from "@/lib/label-settings";

type AnySupabase = { from: (t: string) => any };
type LabelScope = "workspace" | "pos";

function scopeOf(data: unknown): LabelScope {
  return (data as any)?.scope === "pos" ? "pos" : "workspace";
}

export const getMyLabelSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({ scope: scopeOf(data) }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const { data: row } = await supabase
      .from("label_settings")
      .select("config")
      .eq("user_id", context.userId)
      .eq("scope", data.scope)
      .maybeSingle();
    return { config: normalizeConfig(row?.config) };
  });

export const saveMyLabelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ({
    scope: scopeOf(data),
    config: normalizeConfig((data as any)?.config),
  }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const userId = context.userId;
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", userId)
      .maybeSingle();
    const workspaceId = (profile?.workspace_id as string) ?? userId;

    const { error } = await supabase
      .from("label_settings")
      .upsert(
        {
          user_id: userId,
          workspace_id: workspaceId,
          scope: data.scope,
          config: data.config as unknown as LabelConfig,
        },
        { onConflict: "user_id,scope" },
      );
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Label setup saved successfully" };
  });
