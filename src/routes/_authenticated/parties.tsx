import { AppShell } from "@/components/app-shell";
import { PosSubnav } from "@/components/pos-subnav";
import { PartyBrowser } from "@/components/party-browser";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/parties")({
  head: () => ({
    meta: [
       { title: "Parties — HB Chemicals Pakistan Workspace" },
       { name: "description", content: "Parties, balances, ledger, payments and statements." },
       { property: "og:title", content: "Parties — HB Chemicals Pakistan Workspace" },
       { property: "og:description", content: "Parties with balances, ledger and payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartiesPage,
});

function PartiesPage() {
  return (
    <AppShell title="Parties" subtitle="Balances, ledger, payments and statements" active="/pos" wide>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <PartyBrowser />
      </div>
    </AppShell>
  );
}
