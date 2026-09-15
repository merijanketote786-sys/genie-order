import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { SyncStatusPanel, VyaparUploadCard } from "@/components/vyapar-sync";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/sync")({
  head: () => ({
    meta: [
      { title: "Vyapar Sync — HB Chemicals OrderBot" },
      {
        name: "description",
        content:
          "Vyapar se export ki hui Excel ya CSV upload karein aur product rates, stock foran update karein.",
      },
      { property: "og:title", content: "Vyapar Sync — HB Chemicals OrderBot" },
      {
        property: "og:description",
        content: "Vyapar Excel upload kar ke rates aur stock update karein, sync status dekhein.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SyncPage,
});

function SyncPage() {
  return (
    <AppShell
      title="Vyapar Sync"
      subtitle="Vyapar ki Excel se rates aur stock update karein"
      active="/sync"
    >
      <div className="shrink-0 pt-3 sm:pt-4">
        <WorkspaceHeader
          icon={RefreshCw}
          eyebrow="Rates sync"
          title="Vyapar synchronization"
          description="Vyapar se items ki Excel (ya CSV) export karein aur yahan upload karein. Purane products delete nahi hote, aapki customize ki hui prices bhi mehfooz rehti hain."
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6 pt-3">
        <VyaparUploadCard />
        <SyncStatusPanel />

        <section className="glass-panel rounded-xl px-4 py-4 text-sm">
          <h2 className="font-display text-[15px] font-bold">Vyapar se export kaise karein</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Vyapar Desktop kholein → Reports → Item / Stock Summary.</li>
            <li>Export to Excel dabayein (file me Item Name aur Sale Price column zaroor hon).</li>
            <li>Yahan wahi file choose kar ke "Rates update karein" dabayein.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Note: jis row me rate khaali ya 0 ho, woh chhoR di jati hai — purana rate kabhi zaya
            nahi hota.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
