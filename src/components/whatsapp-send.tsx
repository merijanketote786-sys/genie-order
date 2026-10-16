import { Button } from "@/components/ui/button";
import { usePosAccess } from "@/components/pos-access";
import { buildPdfBlob, pdfFileName } from "@/lib/print/dispatch";
import type { ResolvedCfg } from "@/lib/pos-config";
import type { PrintDoc } from "@/lib/print/render";
import { Loader2, Mail, MessageCircle, X } from "lucide-react";
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
  const out: string[] = [...(business ? [`*${business}*`] : []), `${doc.title} ${doc.number}`.trim(), `Date: ${isNaN(date.getTime()) ? String(doc.date) : date.toLocaleDateString("en-PK")}`];
  if (doc.party?.name) out.push(`${doc.party.label || "Customer"}: ${doc.party.name}`);
  if (doc.party?.phone) out.push(`Phone: ${doc.party.phone}`);
  if (doc.party?.address) out.push(`Address: ${doc.party.address}`);
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

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Document ko PDF bana kar share karta hai (text nahi).
 * Mobile: share sheet (PDF attached). Desktop: PDF download + WhatsApp app / email app khulta hai.
 * Returns false agar user ne share sheet cancel kar di.
 */
export async function sharePdf(doc: PrintDoc, cfg: ResolvedCfg, o: { via: "whatsapp"; phone: string } | { via: "email"; email?: string }): Promise<boolean> {
  const blob = await buildPdfBlob(doc, cfg);
  const name = pdfFileName(doc);
  const title = `${doc.title} ${doc.number}`.trim();
  const file = new File([blob], name, { type: "application/pdf" });
  const text = o.via === "whatsapp" ? waMessage(doc, cfg.business.name) : title;
  const nav = navigator as Navigator & { canShare?: (d: { files: File[]; text?: string }) => boolean };
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  // Mobile: share sheet sends PDF + full bill text to WhatsApp (no download). PC: customer's chat opens directly with the text.
  if (mobile && typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    if (o.via === "whatsapp") { try { await navigator.clipboard?.writeText(text); } catch { /* ignore */ } }
    try {
      await navigator.share({ files: [file], title, text });
      toast.success(o.via === "whatsapp" ? "Shared — choose WhatsApp and the customer's chat (bill text is also copied)" : "PDF shared — select your email app");
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return false;
      // share failed (e.g. not allowed here) — fall back below
    }
  }
  downloadBlob(blob, name);
  if (o.via === "whatsapp") {
    openWhatsAppApp(waNumber(o.phone), text);
    toast.success("WhatsApp opened with the bill details — attach the downloaded PDF and send");
  } else {
    const to = o.email?.trim() ? encodeURIComponent(o.email.trim()) : "";
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`Please find attached ${title} (${name}).`)}`;
    toast.success("PDF downloaded — attach it to the email and send");
  }
  return true;
}

/** WhatsApp share: document ko PDF banata hai aur installed WhatsApp app mein customer ki chat ke saath share karta hai. */
export function WhatsAppSendDialog({ doc, onClose }: { doc: PrintDoc; business?: string; onClose: () => void }) {
  const { cfg } = usePosAccess();
  const [phone, setPhone] = useState(doc.party?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const valid = waNumber(phone).length >= 10;

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (await sharePdf(doc, cfg, { via: "whatsapp", phone })) onClose();
    } catch {
      toast.error("PDF could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/50 p-2" role="dialog" aria-modal="true" aria-label="Send on WhatsApp">
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

/** Email share: PDF banata hai; mobile par share sheet, PC par PDF download + email app. */
export function EmailSendDialog({ doc, onClose }: { doc: PrintDoc; onClose: () => void }) {
  const { cfg } = usePosAccess();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await sharePdf(doc, cfg, { via: "email", email })) onClose();
    } catch {
      toast.error("PDF could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/50 p-2" role="dialog" aria-modal="true" aria-label="Email PDF">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-auto rounded-xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Mail className="text-primary" />
          <p className="mr-auto font-bold text-foreground">Email PDF</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <label className="block text-xs text-muted-foreground">Email address (optional)
          <input className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="party@email.com" inputMode="email" />
        </label>
        <p className="mt-3 rounded-xl border border-border bg-surface-2/60 p-3 text-xs text-muted-foreground">
          On mobile, the share sheet opens with the PDF attached — choose your email app. On PC, the PDF downloads and your email app opens — attach the downloaded PDF there.
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={send} className="gap-1.5">
            {busy ? <Loader2 className="animate-spin" /> : <Mail />} {busy ? "Preparing PDF…" : "Send PDF by email"}
          </Button>
        </div>
      </div>
    </div>
  );
}
