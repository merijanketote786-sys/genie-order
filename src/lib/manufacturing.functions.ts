import { withStore } from "@/lib/pos-store.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = any;
export type RecipeMaterial = { product_id: string; qty: number };
export type RecipeExpense = { name: string; amount: number };
export type Recipe = { productId: string; outputQty: number; materials: RecipeMaterial[]; expenses: RecipeExpense[] };

export const listRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as Sb).from("pos_recipes").select("product_id, output_qty, materials, expenses");
    if (error) throw new Error("Could not load manufacturing setups");
    const recipes: Recipe[] = ((data ?? []) as any[]).map((r) => ({ productId: r.product_id, outputQty: Number(r.output_qty), materials: r.materials ?? [], expenses: r.expenses ?? [] }));
    return { recipes };
  });

export const saveRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    productId: z.string().uuid(), outputQty: z.number().positive().max(1e7),
    materials: z.array(z.object({ product_id: z.string().uuid(), qty: z.number().positive().max(1e7) })).max(100),
    expenses: z.array(z.object({ name: z.string().max(100), amount: z.number().min(0).max(1e9) })).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_save_recipe", { _p: { product_id: data.productId, output_qty: data.outputQty, materials: data.materials, expenses: data.expenses } });
    if (error) throw new Error(error.message || "Save failed");
    return { ok: true };
  });

export const deleteRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_delete_recipe", { _product: data.productId });
    if (error) throw new Error(error.message || "Delete failed");
    return { ok: true };
  });

export const manufactureProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid(), qty: z.number().positive().max(1e7), note: z.string().max(300).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await withStore((context.supabase as Sb).rpc("pos_manufacture", { _product: data.productId, _qty: data.qty, _note: data.note }));
    if (error) throw new Error(error.message || "Manufacturing failed");
    return res as { qty: number; materialCost: number; expenses: number; unitCost: number };
  });
