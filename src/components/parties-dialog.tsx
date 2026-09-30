// Parties dialog — same combined parties browser as the Suppliers page, in a popup.
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PartyBrowser } from "@/components/party-browser";

export function PartiesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Parties</DialogTitle></DialogHeader>
        <PartyBrowser enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
