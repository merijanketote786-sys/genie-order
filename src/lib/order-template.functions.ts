import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_ORDER_TEMPLATE, ORDER_TEMPLATE_MAX_LENGTH } from "@/lib/order-template";

const templateSchema = z
  .string()
  .trim()
  .min(10, "Template bohat chhoti hai")
  .max(ORDER_TEMPLATE_MAX_LENGTH, "Template bohat lambi hai");

export const getOrderTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("order_templates")
      .select("template_text")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error("Template load nahi ho saki");
    return {
      template: data?.template_text ?? DEFAULT_ORDER_TEMPLATE,
      isCustom: Boolean(data?.template_text),
    };
  });

export const saveOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ template: templateSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("order_templates").upsert(
      {
        user_id: context.userId,
        template_text: data.template,
      },
      { onConflict: "user_id" },
    );

    if (error) throw new Error("Template save nahi ho saki");
    return { ok: true, template: data.template };
  });

export const resetOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("order_templates")
      .delete()
      .eq("user_id", context.userId);

    if (error) throw new Error("Template reset nahi ho saki");
    return { ok: true, template: DEFAULT_ORDER_TEMPLATE };
  });