import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { WorkspaceTool } from "@/components/workspace-tool";
import {
  AutoSyncCard,
  ConnectApiCard,
  DocumentImportCard,
  PasteRatesCard,
  SyncStatusPanel,
  VyaparUploadCard,
} from "@/components/vyapar-sync";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardPaste, FileScan, FileSpreadsheet, HelpCircle, Plug, RefreshCw, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sync")({
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
        <SyncStatusPanel />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <WorkspaceTool icon={FileSpreadsheet} label="Excel / CSV" title="Excel / CSV upload"><VyaparUploadCard /></WorkspaceTool>
          <WorkspaceTool icon={ClipboardPaste} label="Paste rates" title="Rate list paste karein"><PasteRatesCard /></WorkspaceTool>
          <WorkspaceTool icon={FileScan} label="PDF / Image" title="Document se rates"><DocumentImportCard /></WorkspaceTool>
          <WorkspaceTool icon={Zap} label="Auto sync" title="Automatic sync"><AutoSyncCard /></WorkspaceTool>
          <WorkspaceTool icon={Plug} label="API connect" title="Software connection"><ConnectApiCard /></WorkspaceTool>
          <WorkspaceTool icon={HelpCircle} label="Help" title="Vyapar se export">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Vyapar Desktop kholein → Reports → Item / Stock Summary.</li>
              <li>Export to Excel dabayein; Item Name aur Sale Price columns zaroor hon.</li>
              <li>Excel / CSV icon se file choose karke rates update karein.</li>
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">Zero ya khaali rate wali row skip hoti hai; purana rate mehfooz rehta hai.</p>
          </WorkspaceTool>
        </div>
      </div>
    </AppShell>
  );
}
