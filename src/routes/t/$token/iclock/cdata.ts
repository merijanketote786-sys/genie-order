import { createFileRoute } from "@tanstack/react-router";

// Token-in-path variant: set the machine's server address to <app>/t/<token>.
export const Route = createFileRoute("/t/$token/iclock/cdata")({
  server: {
    handlers: {
      GET: async ({ request, params }) => (await import("@/lib/iclock-handlers.server")).iclockCdataGet(request, params.token),
      POST: async ({ request, params }) => (await import("@/lib/iclock-handlers.server")).iclockCdataPost(request, params.token),
    },
  },
});
