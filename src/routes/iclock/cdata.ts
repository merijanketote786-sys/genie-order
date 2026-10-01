import { createFileRoute } from "@tanstack/react-router";
import { findDevice, optionsReply, parseAttLog, savePunches, text } from "@/lib/attendance-push.server";

// ZKTeco ADMS ("Cloud Server") push endpoint — machines call /iclock/cdata.
export const Route = createFileRoute("/iclock/cdata")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const sn = u.searchParams.get("SN") ?? "";
        const dev = await findDevice({ serial: sn });
        if (!dev) return text("Unknown device", 403);
        return text(optionsReply(sn));
      },
      POST: async ({ request }) => {
        const u = new URL(request.url);
        const sn = u.searchParams.get("SN") ?? "";
        const dev = await findDevice({ serial: sn });
        if (!dev) return text("Unknown device", 403);
        const body = (await request.text()).slice(0, 2_000_000);
        if ((u.searchParams.get("table") ?? "").toUpperCase() !== "ATTLOG") return text("OK");
        const n = await savePunches(dev, parseAttLog(body), "device");
        return text(`OK: ${n}`);
      },
    },
  },
});
