import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { findDevice, savePunches } from "@/lib/attendance-push.server";

// Generic push for any machine/middleware: POST JSON with the machine's secret token.
const schema = z.object({
  token: z.string().min(16).max(80),
  punches: z.array(z.object({ id: z.string().trim().min(1).max(40), time: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/) })).min(1).max(5000),
});

export const Route = createFileRoute("/api/public/attendance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof schema>;
        try { body = schema.parse(await request.json()); } catch { return Response.json({ error: "Invalid body" }, { status: 400 }); }
        const dev = await findDevice({ token: body.token });
        if (!dev) return Response.json({ error: "Invalid token" }, { status: 401 });
        const n = await savePunches(dev, body.punches.map((p) => {
          const [d, t] = p.time.replace("T", " ").split(" ");
          return { bioId: p.id, day: d, tm: t.length === 5 ? `${t}:00` : t.slice(0, 8) };
        }), "push");
        return Response.json({ ok: true, received: n });
      },
    },
  },
});
