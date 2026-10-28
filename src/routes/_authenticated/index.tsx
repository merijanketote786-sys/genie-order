import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "HBPOS — Point of Sale" },
      { name: "description", content: "HBPOS point of sale: billing, stock, parties and reports." },
      { property: "og:title", content: "HBPOS — Point of Sale" },
      { property: "og:description", content: "HBPOS point of sale: billing, stock, parties and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/pos-dashboard", replace: true });
  },
});
