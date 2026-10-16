import { createFileRoute } from "@tanstack/react-router";
import { LabelsPage } from "./labels";

export const Route = createFileRoute("/_authenticated/pos-labels")({
  head: () => ({
    meta: [
      { title: "POS Labels — HBPOS" },
      { name: "description", content: "Print barcode labels for your POS items — pick an item or type a custom name." },
      { property: "og:title", content: "POS Labels — HBPOS" },
      { property: "og:description", content: "Pick POS items and print barcode labels instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LabelsPage pos />,
});
