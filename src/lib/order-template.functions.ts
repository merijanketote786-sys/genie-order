import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_ORDER_TEMPLATE, ORDER_TEMPLATE_MAX_LENGTH } from "@/lib/order-template";

const templateSchema = z
  .string()
  .trim()
  .min(10, "Template bohat chhoti hai")
  .max(ORDER_TEMPLATE_MAX_LENGTH, "Template bohat lambi hai");

const nameSchema = z
  .string()
  .trim()
  .min(2, "Template ka naam likhein")
  .max(60, "Naam bohat lamba hai");

export type OrderTemplateRow = {
  id: string;
  name: string;
  template: string;
  isSelected: boolean;
};

async function loadAll(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("order_templates")
    .select("id, name, template_text, is_selected")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error("Templates load nahi ho sakin");

  const templates: OrderTemplateRow[] = (data ?? []).map((row: any) => ({
    id: row.id as string,
    name: row.name as string,
    template: row.template_text as string,
    isSelected: Boolean(row.is_selected),
  }));

  const selected = templates.find((t) => t.isSelected);
  return {
    templates,
    selectedId: selected?.id ?? null,
    template: selected?.template ?? DEFAULT_ORDER_TEMPLATE,
  };
}

export const getOrderTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadAll(context as any));

export const saveOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: nameSchema,
        template: templateSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;

    // Naya/edit hone wala template hamesha selected ho jata hai
    await ctx.supabase
      .from("order_templates")
      .update({ is_selected: false })
      .eq("user_id", ctx.userId);

    if (data.id) {
      const { error } = await ctx.supabase
        .from("order_templates")
        .update({ name: data.name, template_text: data.template, is_selected: true })
        .eq("id", data.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error("Template save nahi ho saki");
    } else {
      const { error } = await ctx.supabase.from("order_templates").insert({
        user_id: ctx.userId,
        name: data.name,
        template_text: data.template,
        is_selected: true,
      });
      if (error)
        throw new Error(
          error.code === "23505" ? "Is naam se template pehle se mojood hai" : "Template save nahi ho saki",
        );
    }

    return loadAll(ctx);
  });

export const selectOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await ctx.supabase.from("order_templates").update({ is_selected: false }).eq("user_id", ctx.userId);

    if (data.id) {
      const { error } = await ctx.supabase
        .from("order_templates")
        .update({ is_selected: true })
        .eq("id", data.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error("Template select nahi ho saki");
    }

    return loadAll(ctx);
  });

export const deleteOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase
      .from("order_templates")
      .delete()
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (error) throw new Error("Template delete nahi ho saki");
    return loadAll(ctx);
  });

export const resetOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase
      .from("order_templates")
      .update({ is_selected: false })
      .eq("user_id", ctx.userId);
    if (error) throw new Error("Default template set nahi ho saki");
    return loadAll(ctx);
  });
