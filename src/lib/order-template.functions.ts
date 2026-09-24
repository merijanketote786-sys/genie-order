import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_ORDER_TEMPLATE,
  ORDER_TEMPLATE_MAX_LENGTH,
} from "@/lib/order-template";

const templateSchema = z
  .string()
  .trim()
  .min(10, "Template is too short")
  .max(ORDER_TEMPLATE_MAX_LENGTH, "Template is too long");

const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter a template name")
  .max(60, "Name is too long");

const kindSchema = z.enum(["order", "confirmation"]).default("order");

export type OrderTemplateRow = {
  id: string;
  name: string;
  template: string;
  isSelected: boolean;
};

function fallbackFor(kind: string) {
  return kind === "confirmation" ? DEFAULT_CONFIRMATION_TEMPLATE : DEFAULT_ORDER_TEMPLATE;
}

async function loadAll(context: { supabase: any; userId: string }, kind: string) {
  const { data, error } = await context.supabase
    .from("order_templates")
    .select("id, name, template_text, is_selected")
    .eq("user_id", context.userId)
    .eq("kind", kind)
    .order("created_at", { ascending: true });

  if (error) throw new Error("Could not load templates");

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
    template: selected?.template ?? fallbackFor(kind),
  };
}

export const getOrderTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ kind: kindSchema }).parse(data ?? {}))
  .handler(async ({ data, context }) => loadAll(context as any, data.kind));

export const saveOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: nameSchema,
        template: templateSchema,
        kind: kindSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;

    // Naya/edit hone wala template hamesha selected ho jata hai
    await ctx.supabase
      .from("order_templates")
      .update({ is_selected: false })
      .eq("user_id", ctx.userId)
      .eq("kind", data.kind);

    if (data.id) {
      const { error } = await ctx.supabase
        .from("order_templates")
        .update({ name: data.name, template_text: data.template, is_selected: true })
        .eq("id", data.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error("Could not save template");
    } else {
      const { error } = await ctx.supabase.from("order_templates").insert({
        user_id: ctx.userId,
        name: data.name,
        template_text: data.template,
        is_selected: true,
        kind: data.kind,
      });
      if (error)
        throw new Error(
          error.code === "23505" ? "A template with this name already exists" : "Could not save template",
        );
    }

    return loadAll(ctx, data.kind);
  });

export const selectOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid().nullable(), kind: kindSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    await ctx.supabase
      .from("order_templates")
      .update({ is_selected: false })
      .eq("user_id", ctx.userId)
      .eq("kind", data.kind);

    if (data.id) {
      const { error } = await ctx.supabase
        .from("order_templates")
        .update({ is_selected: true })
        .eq("id", data.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error("Could not select template");
    }

    return loadAll(ctx, data.kind);
  });

export const deleteOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), kind: kindSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase
      .from("order_templates")
      .delete()
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (error) throw new Error("Could not delete template");
    return loadAll(ctx, data.kind);
  });

export const resetOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ kind: kindSchema }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { error } = await ctx.supabase
      .from("order_templates")
      .update({ is_selected: false })
      .eq("user_id", ctx.userId)
      .eq("kind", data.kind);
    if (error) throw new Error("Could not reset to default template");
    return loadAll(ctx, data.kind);
  });
