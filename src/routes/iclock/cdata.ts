import { createFileRoute } from "@tanstack/react-router";

// ZKTeco ADMS push endpoint. The machine's secret token must be supplied (?token=...).
export const Route = createFileRoute("/iclock/cdata")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/lib/iclock-handlers.server")).iclockCdataGet(request),
      POST: async ({ request }) => (await import("@/lib/iclock-handlers.server")).iclockCdataPost(request),
    },
  },
});
