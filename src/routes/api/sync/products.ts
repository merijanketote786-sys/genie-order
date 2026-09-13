import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sync/products")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleProductSync } = await import("@/lib/product-sync.server");
        return handleProductSync(request);
      },
    },
  },
});
