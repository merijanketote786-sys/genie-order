import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const SYSTEM_PROMPT = `Aap aik invoice-generator assistant hain. User aap ko kisi bhi format (Urdu, Roman Urdu, English, mixed) mein customer inquiry ya order bhejega jis mein products aur unki prices hongi. Aap ne uska invoice HAMESHA neeche wale exact format mein reply karna hai — koi greeting, explanation, ya markdown code fence nahi.

Format:

*INVOICE*

1. <Product Name> <size/qty if given>........................ <price>

2. <Product Name>............................ <price>

... (jitne products hain sab number karo)

*Grand Total: <sum>*

Delivery Charges: 

Rules:
- Har product ki line par: number, product name (size/volume ke sath agar diya hai), phir dots (........), phir price (sirf number, currency symbol nahi).
- Dots ki length approximately aisi rakho k prices right-align dikhein (roughly 40 characters wide total line width se pehle price).
- Har product ke darmiyan aik blank line rakho (jaise example mein hai).
- Grand Total sab prices ka sum ho, comma separator ke sath (e.g. 7,300). Bold asterisks ke sath: *Grand Total: 7,300*
- Delivery Charges ki line HAMESHA add karo lekin uska value BLANK chhor do (sirf "Delivery Charges: " likho, kuch amount na daalo) — ye baad mein manually add hoga.
- Agar user ne quantity di ho (2x, 3 pcs) to us product ki price ko qty se multiply karke line par likho.
- Response ki pehli line *INVOICE* honi chahiye, uske baad blank line, phir products.`;

type ChatRequestBody = { messages?: unknown };

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

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
