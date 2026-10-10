import { useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type PastedCustomer = { name?: string; phone?: string; address?: string; city?: string; goodsAdda?: string; courier?: string };

export const CUSTOMER_FORMAT = "Name: \nPhone: \nAddress: \nCity: \nGoods adda: \nCourier: ";

const KEYS: [keyof PastedCustomer, RegExp][] = [
  ["goodsAdda", /^(goods\s*adda|adda|goods)/i],
  ["courier", /^(courier(\s*service)?|courier\s*name)/i],
  ["phone", /^(phone|mobile|number|contact|cell|whatsapp|no\.?)/i],
  ["address", /^(address|addr)/i],
  ["city", /^(city(\s*\/\s*area)?|area)/i],
  ["name", /^(name|customer(\s*name)?)/i],
];

/** Rule-based parser (no AI). Lines "Label: value"; unlabeled lines guessed (phone by digits, then name, address). */
export function parseCustomerText(text: string): PastedCustomer {
  const out: PastedCustomer = {};
  const loose: string[] = [];
  const parts = text.split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean);
  for (const line of parts) {
    const m = line.match(/^([^:=\-–]{1,25})\s*[:=\-–]\s*(.*)$/);
    const key = m ? KEYS.find(([, re]) => re.test(m[1].trim()))?.[0] : undefined;
    if (m && key) { const v = m[2].trim(); if (v) out[key] = v; continue; }
    loose.push(line);
  }
  for (const line of loose) {
    const digits = line.replace(/[^\d+]/g, "");
    if (!out.phone && /^\+?\d{10,13}$/.test(digits) && digits.length >= line.replace(/\s|-/g, "").length - 1) out.phone = line.replace(/\s|-/g, "");
    else if (!out.name) out.name = line;
    else if (!out.address) out.address = line;
    else if (!out.city) out.city = line;
  }
  return out;
}

export function CustomerPasteBox({ onApply }: { onApply: (c: PastedCustomer) => void }) {
  const [text, setText] = useState("");
  const apply = () => {
    const c = parseCustomerText(text);
    if (!Object.values(c).some(Boolean)) return toast.error("Nothing found — use the format: Name: … Phone: …");
    onApply(c);
    setText("");
    toast.success("Customer details filled");
  };
  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">Paste customer details</p>
        <button type="button" className="text-[11px] text-primary underline" onClick={() => setText(CUSTOMER_FORMAT)}>Insert format</button>
      </div>
      <textarea
        aria-label="Paste customer details"
        className="min-h-[5.5rem] w-full rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); apply(); } }}
        placeholder={"Name: Ali Khan\nPhone: 03001234567\nAddress: House 5, Street 2\nCity: Lahore\nGoods adda: Daewoo\nCourier: TCS"}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Enter = fill fields · Shift+Enter = new line</p>
        <Button type="button" size="sm" onClick={apply} disabled={!text.trim()}><ClipboardPaste /> Fill details</Button>
      </div>
    </div>
  );
}
