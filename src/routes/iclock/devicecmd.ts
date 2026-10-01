import { createFileRoute } from "@tanstack/react-router";
import { text } from "@/lib/attendance-push.server";

export const Route = createFileRoute("/iclock/devicecmd")({
  server: { handlers: { POST: async () => text("OK") } },
});
