import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "set_invoice_status",
  title: "Set invoice payment status",
  description: "Mark an invoice as paid or unpaid using its invoice number.",
  inputSchema: {
    invoice_number: z.string().trim().min(3).describe("Invoice number, e.g. INV-2609-0012."),
    payment_status: z.enum(["paid", "unpaid"]).describe("New payment status."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ invoice_number, payment_status }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("invoices")
      .update({
        payment_status,
        paid_at: payment_status === "paid" ? new Date().toISOString() : null,
      })
      .eq("invoice_number", invoice_number)
      .select("invoice_number, customer_name, total, payment_status, paid_at");

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0)
      return {
        content: [{ type: "text", text: `No invoice found with number ${invoice_number}.` }],
        isError: true,
      };

    return {
      content: [{ type: "text", text: JSON.stringify(data[0], null, 2) }],
      structuredContent: { invoice: data[0] },
    };
  },
});
