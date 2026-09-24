import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const SYSTEM_PROMPT = `Aap aik invoice-generator assistant hain. User aap ko kisi bhi format (Urdu, Roman Urdu, English, mixed) mein customer inquiry ya order bhejega jis mein products aur unki prices hongi. Aap ne uska invoice HAMESHA neeche wale exact format mein reply karna hai — koi greeting, explanation, ya markdown code fence nahi.

Format:

*INVOICE*

1. <Product Name> <size/qty if given>........................ <price>

2. <Product Name>............................ <price>

... (jitne products hain sab number karo)

Product Total: <sum>

Delivery Charges:

Grand Total:

Rules:
- Har product ki line par: number, product name (size/volume ke sath agar diya hai), phir dots (........), phir price (sirf number, currency symbol nahi).
- Dots ki length approximately aisi rakho k prices right-align dikhein (roughly 40 characters wide total line width se pehle price).
- Har product ke darmiyan aik blank line rakho (jaise example mein hai).
- Invoice ke END par yeh 3 fields HAMESHA isi exact sequence mein aane chahye:
  1) "Product Total: <sum>" — sab product prices ka total, comma separator ke sath (e.g. Product Total: 7,300). Yeh HAMESHA filled hoga.
  2) "Delivery Charges:" — value HAMESHA BLANK chhor do, kuch amount na likho — ye baad mein manually add hoga.
  3) "Grand Total:" — value HAMESHA BLANK chhor do, kuch amount na likho — ye baad mein manually add hoga.
- Agar user ne quantity di ho (2x, 3 pcs) to us product ki price ko qty se multiply karke line par likho.
- Response ki pehli line *INVOICE* honi chahiye, uske baad blank line, phir products.
- EDIT/AMENDMENT RULE: Agar user invoice banne ke baad koi addition, removal, qty change, price change, ya koi aur amendment bole (jaise "ye item hata do", "2kg kar do", "delivery 200 laga do"), to poori invoice DOBARA banao wohi exact format mein, requested changes apply karke. Kabhi sirf summary ya explanation mat do — hamesha poori updated invoice do. Agar user khud Delivery Charges ya Grand Total ki value de to wohi value use karo; warna blank hi rakho.

RATE RULES (agar neeche OFFICIAL RATE LIST di gayi ho):
- User agar price na de to rate HAMESHA official rate list se lo, apni taraf se price mat banao.
- WEIGHT SLAB RULE (bohat zaroori) — product ka weight dekh kar slab choose karo, phir usi slab ke rate se proportionally calculate karo:
  * 1g se 100g tak  -> 100g wala rate use karo. Price = 100g rate x (weight / 100).
  * 101g se 250g tak -> 250g wala rate use karo. Price = 250g rate x (weight / 250).
  * 251g se 500g tak -> 500g wala rate use karo. Price = 500g rate x (weight / 500).
  * 501g se 1000g (1kg) tak -> 1 kg (unit) rate use karo. Price = unit rate x (weight / 1000).
  * 1kg se zyada -> unit rate x (weight in kg). Bache hue hisse par bhi yahi slab rule laga sakte ho.
- Exact slab weight ho (theek 100g / 250g / 500g / 1kg) to seedha usi slab ka rate lagao, koi calculation nahi.
- ml / litre wale products par bhi yehi slab rule laga do (100ml, 250ml, 500ml, 1 litre).
- Final price hamesha nearest whole number par round karo.
- Agar kisi slab ka rate list me mojood na ho to us se agli available slab ya unit rate se proportionally nikalo.
- Quantity (2x, 3 pcs) ho to line price = rate x qty.
- Agar user ne khud price di ho to user ki price ko tarjeeh do.
- Agar koi product rate list mein na mile to us ki price blank chhor do (dots ke baad kuch na likho) aur Product Total mein usay count na karo.`;

type ChatRequestBody = { messages?: unknown };

const STOP_WORDS = new Set([
  "kg", "kilogram", "kilograms", "gram", "grams", "gm", "gms", "g", "ml", "litre", "liter", "ltr", "l",
  "pcs", "piece", "pieces", "bottle", "bottles", "bundle", "bundles", "pack", "packs",
  "ka", "ki", "ke", "aur", "and", "or", "invoice", "banao", "bana", "do", "de", "den", "rate", "rates",
  "price", "prices", "total", "order", "chahye", "chahiye", "mujhe", "please", "the", "for", "of", "with",
]);

function textFromMessage(m: unknown): string {
  const msg = m as { content?: unknown; parts?: Array<{ type?: string; text?: string }> };
  if (typeof msg?.content === "string") return msg.content;
  if (Array.isArray(msg?.parts)) {
    return msg.parts.filter((p) => p?.type === "text" && p.text).map((p) => p.text).join(" ");
  }
  return "";
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/** Bearer token se user nikaal kar uske workspace ki rate list choose karta hai. */
async function workspaceFromRequest(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { createPublicSupabase } = await import("@/lib/product-sync.server");
    const { data } = await createPublicSupabase().auth.getUser(token);
    const userId = data.user?.id;
    if (!userId) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("workspace_id")
      .eq("id", userId)
      .maybeSingle();
    return profile?.workspace_id ?? userId;
  } catch {
    return null;
  }
}

async function buildRateContext(messages: unknown[], workspaceId: string): Promise<string> {
  try {
    const userText = messages
      .filter((m) => (m as { role?: string }).role === "user")
      .slice(-3)
      .map(textFromMessage)
      .join(" ");
    const tokens = tokenize(userText);
    if (tokens.length === 0) return "";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("products")
      .select(
        "name, unit, sale_price, p100_staff_price, p250_staff_price, p500_staff_price, custom_sale_price, custom_p100_price, custom_p250_price, custom_p500_price, stock",
      )
      .eq("is_active", true)
      .eq("scope", "rates")
      .eq("workspace_id", workspaceId)
      .limit(5000);
    if (!data || data.length === 0) return "";

    const scored = (data as Array<Record<string, unknown>>)
      .map((r) => {
        const nameTokens = tokenize(String(r["name"]));
        const hits = nameTokens.filter((t) => tokens.includes(t)).length;
        return { r, score: nameTokens.length ? hits / nameTokens.length + hits * 0.1 : 0, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    if (scored.length === 0) return "";

    const lines = scored.map(({ r }) => {
      const unit = String(r["unit"]);
      const pick = (custom: string, auto: string) => {
        const v = r[custom] ?? r[auto];
        return v == null ? null : Number(v);
      };
      const sale = pick("custom_sale_price", "sale_price");
      const p100 = pick("custom_p100_price", "p100_staff_price");
      const p250 = pick("custom_p250_price", "p250_staff_price");
      const p500 = pick("custom_p500_price", "p500_staff_price");
      const parts = [`${String(r["name"])} | unit: ${unit}`];
      if (sale != null) parts.push(`1 ${unit} = ${sale}`);
      if (p100 != null) parts.push(`100g = ${p100}`);
      if (p250 != null) parts.push(`250g = ${p250}`);
      if (p500 != null) parts.push(`500g = ${p500}`);
      return `- ${parts.join(" | ")}`;
    });

    return `\n\nOFFICIAL RATE LIST (sirf ye rates use karo, khud se price mat banao):\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/api/invoice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const workspaceId = await workspaceFromRequest(request);
        if (!workspaceId) {
          return new Response("Unauthorized", { status: 401 });
        }
        const rateContext = await buildRateContext(messages, workspaceId);

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM_PROMPT + rateContext,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
