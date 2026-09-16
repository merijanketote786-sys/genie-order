import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPT = `Aap aik data extraction assistant hain. User aap ko image ya PDF file dega jis me text, order details, invoice, receipt, ya koi bhi likhi hui information ho sakti hai.

Aap ka kaam: file me se SAARI likhi hui text ko accurately extract karo aur clean, readable form me wapas do.

Rules:
- Sirf jo actually file me likha hai wo hi likho — kuch bhi add ya guess mat karo.
- Original structure preserve karo: headings, lists, tables (as text), line breaks.
- Numbers, prices, phone numbers, dates ko exact rakho.
- Agar handwriting ya blurry text hai to best effort karo aur uncertain part ko [?] se mark karo.
- Multiple languages (Urdu, English, Roman Urdu) ho sakti hain — jo dikh raha hai wo hi likho.
- Response me sirf extracted content do — koi intro, greeting, ya "Here is the text:" jaisa preamble nahi.
- Agar file me kuch bhi text nahi hai to bolo "Is file me koi readable text nahi mila."`;

type ExtractBody = {
  prompt?: string;
  file?: { name: string; type: string; dataUrl: string };
};

export const Route = createFileRoute("/api/extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireUserId } = await import("@/lib/api-auth.server");
        const userId = await requireUserId(request);
        if (!userId) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json()) as ExtractBody;
        const file = body.file;
        if (!file?.dataUrl || !file?.type) {
          return new Response("File is required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const userText =
          body.prompt?.trim() ||
          "Is file me se saari text accurately extract karo aur clean form me do.";

        const isImage = file.type.startsWith("image/");
        const content: unknown[] = [{ type: "text", text: userText }];
        if (isImage) {
          content.push({ type: "image_url", image_url: { url: file.dataUrl } });
        } else {
          content.push({
            type: "file",
            file: { filename: file.name || "file", file_data: file.dataUrl },
          });
        }

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content },
            ],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return new Response(errText || "AI request failed", { status: res.status });
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        return new Response(JSON.stringify({ text }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
