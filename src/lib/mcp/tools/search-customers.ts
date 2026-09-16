import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_customers",
  title: "Search customers",
  description: "Search workspace customers by name, phone or city and return their saved details.",
  inputSchema: {
    query: z.string().trim().min(1).optional().describe("Name, phone or city to search for."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    let q = supabaseForUser(ctx)
      .from("customers")
      .select("name, phone, city, address, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (query) q = q.or(`name.ilike.%${query}%,phone.ilike.%${query}%,city.ilike.%${query}%`);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { customers: data ?? [], count: (data ?? []).length },
    };
  },
});
