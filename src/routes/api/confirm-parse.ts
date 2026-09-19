import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPT = `Aap aik customer-details extractor hain. User kisi bhi format (Urdu, Roman Urdu, English, bikhri hui lines, message text) me customer ki details dega.

Aap ne SIRF aik JSON object return karna hai, bina markdown, bina code fence, bina explanation. Shape bilkul yeh:
{"orderNumber":"","name":"","phone":"","city":"","address":"","notes":""}

Rules:
- SIRF customer ki details nikaalo: order number, naam, phone, city, address, aur koi khaas hidayat (notes).
- Products, items, prices, totals, delivery ya payment ki koi cheez MAT nikaalo — unhe hamesha ignore karo.
- Jo field text me nahi hai usay khali string "" rakho. Kuch guess mat karo.
- phone Pakistani local format me: 11 digits, 0 se start (+92/92 hata kar 0 lagao), koi space ya dash nahi.
- notes me sirf koi khaas hidayat ho to likho, warna "".`;

export const Route = createFileRoute("/api/confirm-parse")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireUserId } = await import("@/lib/api-auth.server");
        const userId = await requireUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { text?: string };
        const text = (body.text || "").trim();
        if (!text) return new Response("Text is required", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: text.slice(0, 8000) },
            ],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return new Response(errText || "AI request failed", { status: res.status });
        }

        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const raw = (data.choices?.[0]?.message?.content ?? "").trim();
        const match = raw.match(/\{[\s\S]*\}/);
        let parsed: Record<string, unknown> = {};
        try {
          parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
        } catch {
          parsed = {};
        }

        const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
        return new Response(
          JSON.stringify({
            orderNumber: str(parsed.orderNumber),
            name: str(parsed.name),
            phone: str(parsed.phone),
            city: str(parsed.city),
            address: str(parsed.address),
            invoice: "",
            productTotal: "",
            delivery: "",
            advance: "",
            notes: str(parsed.notes),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
