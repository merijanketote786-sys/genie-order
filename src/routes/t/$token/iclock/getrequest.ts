import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/t/$token/iclock/getrequest")({
  server: { handlers: { GET: async ({ request, params }) => (await import("@/lib/iclock-handlers.server")).iclockGetRequest(request, params.token) } },
});
