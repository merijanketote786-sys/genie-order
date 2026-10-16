import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assetSchema } from "./fixed-assets";

export const listFixedAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("pos_fixed_assets")
      .select("id, name, category, quantity, purchase_cost, purchase_date, serial_number, location, notes, status")
      .order("name");
    if (error) throw new Error("Could not load fixed assets. Please try again.");
    return data ?? [];
  });

export const saveFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pos_fixed_assets").upsert(data, { onConflict: "id" });
    if (error) {
      if (error.code === "42501") throw new Error("You need Edit stock permission to manage fixed assets.");
      if (/subscription|read-only|POS access|not included/i.test(error.message)) throw new Error(error.message);
      throw new Error("Could not save this asset. Please try again.");
    }
    return { ok: true };
  });