import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const SYSTEM_PROMPT = `Aap aik order-formatter assistant hain. User aap ko kisi bhi format (Urdu, Roman Urdu, English, mixed, ya bikhri hui lines) mein order details bhejega. Aap ne ussi order ko HAMESHA neeche wale exact format mein reply karna hai, koi extra bat/greeting/explanation ke bagair. Sirf ye 11 lines return karo, koi markdown/code fence nahi:

Order Number: 
Name: 
Phone: 
City: 
Address: 
Product: 
Qty:
Product Total: 
Delivery: 
Advance: 
Status: Confirmed

Rules:
- Jo field user ne di hai wo bharo. Missing field ko blank chhor do (colon aur space k baad kuch na likho).
- Product field mein agar 1 se zyada products hain to sab ko aik hi line mein comma se separate kar k likho, jaisay: 1kg glycerine soap base,1kg cocobetain,100gram btms 50
- Qty field mein sirf total items ka number likho (sab products ki quantities ka total count). Example: 3 products hain to "Qty: 3". Agar user ne explicitly qty di ho to wo use karo.
- Status hamesha "Confirmed" rakho jab tak user explicitly kuch aur na kahay.
- Order Number agar user ne na diya ho to blank chhor do.
- Phone number ko as-is rakho, formatting badlo mat.
- Numbers (Product Total, Delivery, Advance) me sirf digits/currency rakho jaisa user ne diya.
- Agar user ne payment status "cc" (cash on delivery / COD wali cc) mention ki ho, to Product Total, Delivery, aur Advance teeno fields me sirf "0" likho (chahe user ne koi bhi amount di ho).
- Response me pehli line se seedha "Order Number:" start karo.`;

type ChatRequestBody = { messages?: unknown };

export const Route = createFileRoute("/api/chat")({
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
