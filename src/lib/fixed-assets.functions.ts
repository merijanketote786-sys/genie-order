import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assetSchema } from "./fixed-assets";

export const listFixedAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await context.supabase.from("pos_fixed_assets")
        .select("id, name, category, quantity, purchase_cost, purchase_date, serial_number, location, notes, status")
        .order("name").order("id").range(offset, offset + 999);
      if (error) throw new Error("Could not load fixed assets. Please try again.");
      rows.push(...(data ?? []).map((row) => assetSchema.parse(row)));
      if (!data || data.length < 1000) break;
    }
    return rows;
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