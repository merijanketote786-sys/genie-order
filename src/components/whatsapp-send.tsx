import { Button } from "@/components/ui/button";
import type { PrintDoc } from "@/lib/print/render";
import { MessageCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

export function WhatsAppSendDialog({ doc, business, onClose }: { doc: PrintDoc; business: string; onClose: () => void }) {
  const [phone, setPhone] = useState(doc.party?.phone ?? "");
  const [text, setText] = useState(() => waMessage(doc, business));
  const [qr, setQr] = useState("");
  const num = waNumber(phone);
  const link = useMemo(() => `https://wa.me/${num}?text=${encodeURIComponent(text)}`, [num, text]);
  const valid = num.length >= 10;

  useEffect(() => {
    let live = true;
    if (valid) void import("qrcode").then((m) => (m.default ?? m).toDataURL(link, { margin: 1, width: 220 })).then((u) => { if (live) setQr(u); }).catch(() => { if (live) setQr(""); });
    else setQr("");
    return () => { live = false; };
  }, [link, valid]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-2" role="dialog" aria-modal="true" aria-label="Send on WhatsApp">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-auto rounded-xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="text-primary" />
          <p className="mr-auto font-bold text-foreground">Send on WhatsApp</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">Party WhatsApp number
              <input className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx xxxxxxx" inputMode="tel" />
            </label>
            <label className="block text-xs text-muted-foreground">Message
              <textarea className="mt-1 h-64 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground" value={text} onChange={(e) => setText(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            {qr ? <img src={qr} alt="WhatsApp QR code" className="h-52 w-52 rounded-md border border-border bg-background" /> : <div className="grid h-52 w-52 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">Enter a valid number</div>}
            <p className="max-w-52 text-xs text-muted-foreground">Scan with your phone camera — WhatsApp opens with the message ready. Just press Send.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => navigator.clipboard?.writeText(text)}>Copy message</Button>
          <Button disabled={!valid} onClick={() => window.open(link, "_blank", "noopener")}><MessageCircle /> Open WhatsApp</Button>
        </div>
      </div>
    </div>
  );
}
