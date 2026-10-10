import { Button } from "@/components/ui/button";
import { usePosAccess } from "@/components/pos-access";
import { buildPdfBlob, pdfFileName } from "@/lib/print/dispatch";
import type { PrintDoc } from "@/lib/print/render";
import { Loader2, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Pakistani numbers → international digits (03xx → 923xx). */
export function waNumber(raw?: string) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "92" + d.slice(1);
  else if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d;
}

/** Open the installed WhatsApp app: mobile uses the whatsapp:// deep link, desktop wa.me (opens the installed app if present). */
export function openWhatsAppApp(num: string, text: string) {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  const url = mobile
    ? `whatsapp://send?phone=${num}&text=${encodeURIComponent(text)}`
    : `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
}

export function waMessage(doc: PrintDoc, business: string) {
  const money = (n: number) => `Rs ${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-PK")}`;
  const date = new Date(doc.date);
  const out: string[] = [`*${business || "HB Chemicals Pakistan"}*`, `${doc.title} ${doc.number}`.trim(), `Date: ${isNaN(date.getTime()) ? String(doc.date) : date.toLocaleDateString("en-PK")}`];
  if (doc.party?.name) out.push(`${doc.party.label || "Party"}: ${doc.party.name}`);
  if (doc.lines?.length) {
    out.push("");
    doc.lines.slice(0, 40).forEach((l, i) => out.push(`${i + 1}. ${l.name} — ${l.qty}${l.unit ? " " + l.unit : ""} × ${money(l.rate)} = ${money(l.total)}`));
    if (doc.lines.length > 40) out.push(`...and ${doc.lines.length - 40} more items`);
  }
  if (doc.totals?.length) { out.push(""); doc.totals.forEach((t) => out.push(`${t.bold ? "*" : ""}${t.label}: ${t.neg ? "-" : ""}${money(t.value)}${t.bold ? "*" : ""}`)); }
  if (doc.paid != null) out.push(`Paid: ${money(doc.paid)}`);
  if (doc.balance != null) out.push(`Balance: ${money(doc.balance)}`);
  if (doc.notes) out.push("", doc.notes);
  out.push("", "Thank you!");
  return out.join("\n");
}

/**
 * WhatsApp share: document ko PDF banata hai aur installed WhatsApp app mein
 * customer ki chat ke saath share karta hai. Mobile par share sheet se WhatsApp
 * khulta hai (PDF attached); desktop par PDF download hota hai aur WhatsApp app
 * customer ki chat ke saath khul jata hai (PDF attach karna hota hai).
 */
export function WhatsAppSendDialog({ doc, business, onClose }: { doc: PrintDoc; business: string; onClose: () => void }) {
  const { cfg } = usePosAccess();
  const [phone, setPhone] = useState(doc.party?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const num = waNumber(phone);
  const valid = num.length >= 10;

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const blob = await buildPdfBlob(doc, cfg);
      const file = new File([blob], pdfFileName(doc), { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${doc.title} ${doc.number}`.trim() });
        toast.success("PDF shared — select WhatsApp and the customer's chat");
      } else {
        // Desktop / unsupported: PDF download + installed WhatsApp app mein customer ki chat
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = pdfFileName(doc);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        openWhatsAppApp(num, `${doc.title} ${doc.number} — PDF downloaded, please attach it here.`);
        toast.success("PDF downloaded — WhatsApp opened, attach the PDF and send");
      }
      onClose();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user cancelled share sheet
      toast.error("PDF could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-2" role="dialog" aria-modal="true" aria-label="Send on WhatsApp">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-auto rounded-xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="text-primary" />
          <p className="mr-auto font-bold text-foreground">Send on WhatsApp</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">Party WhatsApp number
            <input className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx xxxxxxx" inputMode="tel" />
          </label>
          <div className="rounded-xl border border-border bg-surface-2/60 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">{doc.title} {doc.number}</p>
            <p className="mt-1">The document will be sent as a <b>PDF file</b>, not as text.</p>
            <p className="mt-1">On mobile, the share sheet opens — choose WhatsApp and the customer's chat. On PC, the PDF downloads and the installed WhatsApp app opens with the customer's chat — attach the downloaded PDF there.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || busy} onClick={send} className="gap-1.5">
            {busy ? <Loader2 className="animate-spin" /> : <MessageCircle />} {busy ? "Preparing PDF…" : "Send PDF on WhatsApp"}
          </Button>
        </div>
      </div>
    </div>
  );
}
