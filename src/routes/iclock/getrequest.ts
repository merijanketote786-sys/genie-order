import { createFileRoute } from "@tanstack/react-router";
import { findDevice, text } from "@/lib/attendance-push.server";

export const Route = createFileRoute("/iclock/getrequest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sn = new URL(request.url).searchParams.get("SN") ?? "";
        await findDevice({ serial: sn });
        return text("OK");
      },
    },
  },
});
