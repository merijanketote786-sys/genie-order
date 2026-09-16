import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";
import { likeTerm } from "../filter";

export default defineTool({
  name: "list_invoices",
  title: "List invoices",
  description: "List saved invoices for the workspace, newest first, with payment status and totals.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Customer name, phone or invoice number."),
    payment_status: z.enum(["paid", "unpaid"]).optional().describe("Filter by payment status."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, payment_status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    let q = supabaseForUser(ctx)
      .from("invoices")
      .select("invoice_number, customer_name, phone, total, payment_status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (payment_status) q = q.eq("payment_status", payment_status);
    if (search) {
      const like = likeTerm(search);
      q = q.or(`customer_name.ilike.${like},phone.ilike.${like},invoice_number.ilike.${like}`);
    }

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { invoices: data ?? [], count: (data ?? []).length },
    };
  },
});
