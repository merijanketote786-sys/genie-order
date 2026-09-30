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
          "Upload the Excel or CSV exported from Vyapar to instantly update product rates and stock.",
      },
      { property: "og:title", content: "Vyapar Sync — HB Chemicals OrderBot" },
      {
        property: "og:description",
        content: "Upload Vyapar's Excel to update rates and stock, and view sync status.",
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
      subtitle="Update rates and stock from Vyapar's Excel"
      active="/sync"
      wide
    >
      <div className="shrink-0 pt-3 sm:pt-4">
        <WorkspaceHeader
          icon={RefreshCw}
          eyebrow="Rates sync"
          title="Vyapar synchronization"
          description="Export your items' Excel (or CSV) from Vyapar and upload it here. Old products are not deleted, and your customized prices are preserved."
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6 pt-3">
        <SyncStatusPanel />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <WorkspaceTool icon={FileSpreadsheet} label="Excel / CSV" title="Excel / CSV upload"><VyaparUploadCard /></WorkspaceTool>
          <WorkspaceTool icon={ClipboardPaste} label="Paste rates" title="Paste rate list"><PasteRatesCard /></WorkspaceTool>
          <WorkspaceTool icon={FileScan} label="PDF / Image" title="Document se rates"><DocumentImportCard /></WorkspaceTool>
          <WorkspaceTool icon={Zap} label="Auto sync" title="Automatic sync"><AutoSyncCard /></WorkspaceTool>
          <WorkspaceTool icon={Plug} label="API connect" title="Software connection"><ConnectApiCard /></WorkspaceTool>
          <WorkspaceTool icon={HelpCircle} label="Help" title="Vyapar se export">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Vyapar Desktop kholein → Reports → Item / Stock Summary.</li>
              <li>Press Export to Excel; make sure Item Name and Sale Price columns are included.</li>
              <li>Choose the file from the Excel / CSV icon to update rates.</li>
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">Rows with a zero or blank rate are skipped; the old rate is preserved.</p>
          </WorkspaceTool>
        </div>
      </div>
    </AppShell>
  );
}
