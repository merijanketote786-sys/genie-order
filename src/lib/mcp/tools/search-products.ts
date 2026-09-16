import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Search product rates",
  description:
    "Search the workspace rate list by product name and return unit, sale price, 100g/250g/500g staff rates and stock.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Product name or part of it."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("products")
      .select(
        "name, unit, sale_price, p100_staff_price, p250_staff_price, p500_staff_price, stock, custom_sale_price, custom_p100_price, custom_p250_price, custom_p500_price",
      )
      .eq("is_active", true)
      .ilike("name", `%${query}%`)
      .order("name", { ascending: true })
      .limit(limit ?? 10);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = (data ?? []).map((r: Record<string, unknown>) => ({
      name: r["name"],
      unit: r["unit"],
      sale: r["custom_sale_price"] ?? r["sale_price"],
      p100: r["custom_p100_price"] ?? r["p100_staff_price"],
      p250: r["custom_p250_price"] ?? r["p250_staff_price"],
      p500: r["custom_p500_price"] ?? r["p500_staff_price"],
      stock: r["stock"],
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { products: rows, count: rows.length },
    };
  },
});
