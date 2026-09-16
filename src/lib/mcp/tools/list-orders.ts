import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";
import { likeTerm } from "../filter";

export default defineTool({
  name: "list_orders",
  title: "List orders",
  description:
    "List saved orders for the workspace, newest first. Optionally filter by customer name, phone or status.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Customer name or phone to filter by."),
    status: z.string().trim().min(1).optional().describe("Order status, e.g. Confirmed."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    let q = supabaseForUser(ctx)
      .from("orders")
      .select(
        "order_number, customer_name, phone, city, address, product, qty, product_total, delivery, advance, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (status) q = q.ilike("status", status.replace(/[%(),."\\]/g, ""));
    if (search) {
      const like = likeTerm(search);
      q = q.or(`customer_name.ilike.${like},phone.ilike.${like}`);
    }

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { orders: data ?? [], count: (data ?? []).length },
    };
  },
});
