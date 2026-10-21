import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/iclock/getrequest")({
  server: { handlers: { GET: async ({ request }) => (await import("@/lib/iclock-handlers.server")).iclockGetRequest(request) } },
});
