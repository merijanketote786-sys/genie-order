import { AppShell } from "@/components/app-shell";
import { PosSubnav } from "@/components/pos-subnav";
import { PartyBrowser } from "@/components/party-browser";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Parties & Suppliers — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Combined parties list: customers aur suppliers, balances, ledger, payments aur statements." },
      { property: "og:title", content: "Parties & Suppliers — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Combined parties list with balances, ledger and payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  return (
    <AppShell title="Parties & Suppliers" subtitle="Customers aur suppliers ek hi list mein — balances, ledger, payments aur statement" active="/pos" wide>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <PartyBrowser />
      </div>
    </AppShell>
  );
}
