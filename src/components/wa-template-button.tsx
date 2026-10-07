import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptInput } from "@/lib/pos";
import { openWhatsAppApp, waNumber } from "@/components/whatsapp-send";
import { Copy, MessageCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type Tpl = { id: string; name: string; body: string };
type Stored = { enabled: boolean; selected: string | null; templates: Tpl[] };

const DEFAULT_BODY = `*{{business}}*
Invoice: {{invoice_number}}
Date: {{date}}

Customer: {{customer_name}}
Phone: {{customer_phone}}

{{items}}

Subtotal: {{subtotal}}
Discount: {{discount}}
Delivery: {{delivery}}
*Grand Total: {{grand_total}}*
Paid: {{paid}}
Balance: {{balance}}

Thank you for your order!`;

const VARS = ["business", "invoice_number", "date", "customer_name", "customer_phone", "customer_address", "city", "items", "subtotal", "discount", "delivery", "grand_total", "paid", "balance", "payment", "notes"];
const KEY = "pos_wa_templates";
const money = (n: number) => `Rs ${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-PK")}`;

function render(body: string, r: ReceiptInput) {
  const sub = r.lines.reduce((s, l) => s + l.price * l.qty - (l.discount || 0), 0);
  const grand = sub - (r.billDiscount || 0) + (r.delivery || 0);
  const items = r.lines.map((l, i) => `${i + 1}. ${l.name} — ${l.qty} ${l.unitOverride || l.unit || ""} × ${money(l.price)} = ${money(l.price * l.qty - (l.discount || 0))}`.replace(/\s+×/, " ×")).join("\n");
  const map: Record<string, string> = {
    business: r.business, invoice_number: r.invoiceNumber, date: r.date,
    customer_name: r.customerName ?? "", customer_phone: r.customerPhone ?? "",
    customer_address: r.customerAddress ?? "", city: r.customerCityArea ?? "",
    items, subtotal: money(sub), discount: money(r.billDiscount || 0), delivery: money(r.delivery || 0),
    grand_total: money(grand), paid: money(r.paid || 0), balance: money(Math.max(0, grand - (r.paid || 0))),
    payment: String(r.payMode ?? ""), notes: r.notes ?? "",
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in map ? map[k] : m));
}

export function WaTemplateButton({ getReceipt, disabled }: { getReceipt: () => ReceiptInput; disabled?: boolean }) {
  const [st, setSt] = useState<Stored>({ enabled: false, selected: null, templates: [] });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Tpl | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const v = data.user?.user_metadata?.[KEY] as Stored | undefined;
      if (v && Array.isArray(v.templates)) setSt(v);
    });
  }, []);

  const persist = async (next: Stored) => {
    setSt(next);
    const { error } = await supabase.auth.updateUser({ data: { [KEY]: next } });
    if (error) toast.error("Could not save template settings");
  };

  const current = st.templates.find((t) => t.id === st.selected) ?? st.templates[0];
  const openPopup = () => {
    setText(render(current?.body ?? DEFAULT_BODY, getReceipt()));
    setEdit(null);
    setOpen(true);
  };
  const choose = (id: string) => {
    const t = st.templates.find((x) => x.id === id);
    void persist({ ...st, selected: id });
    if (t) setText(render(t.body, getReceipt()));
  };
  const saveTpl = () => {
    if (!edit) return;
    if (!edit.name.trim() || !edit.body.trim()) return toast.error("Enter template name and message");
    const exists = st.templates.some((t) => t.id === edit.id);
    const templates = exists ? st.templates.map((t) => (t.id === edit.id ? edit : t)) : [...st.templates, edit];
    void persist({ ...st, templates, selected: edit.id });
    setText(render(edit.body, getReceipt()));
    setEdit(null);
    toast.success("Template saved");
  };
  const del = (id: string) => {
    const templates = st.templates.filter((t) => t.id !== id);
    void persist({ ...st, templates, selected: templates[0]?.id ?? null });
    setText(render(templates[0]?.body ?? DEFAULT_BODY, getReceipt()));
  };
  const phone = useMemo(() => (open ? waNumber(getReceipt().customerPhone) : ""), [open, getReceipt]);

  return (
    <>
      <div className="flex items-center gap-2">
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title="Enable WhatsApp message button">
          <input type="checkbox" className="size-4 accent-primary" checked={st.enabled} onChange={(e) => void persist({ ...st, enabled: e.target.checked })} />
          Enable
        </label>
        <Button variant="outline" className="flex-1" disabled={!st.enabled || disabled} onClick={openPopup}><MessageCircle /> WhatsApp message</Button>
      </div>
      {open ? createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-foreground/40 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold">WhatsApp message</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close"><X /></Button>
            </div>
            <div className="grid gap-3 overflow-y-auto p-4">
              {edit ? (
                <>
                  <input className="h-10 rounded-lg border bg-background px-3 text-sm" placeholder="Template name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} />
                  <div className="flex flex-wrap gap-1">
                    {VARS.map((v) => (
                      <button key={v} type="button" className="rounded-md bg-accent px-2 py-1 text-[11px] text-accent-foreground" onClick={() => setEdit({ ...edit, body: `${edit.body}{{${v}}}` })}>{v}</button>
                    ))}
                  </div>
                  <textarea className="min-h-56 rounded-lg border bg-background p-3 font-mono text-xs" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} maxLength={3000} />
                  <p className="text-[11px] text-muted-foreground">Use *bold*, _italic_ like WhatsApp. Tap a variable to insert it.</p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
                    <Button onClick={saveTpl}><Save /> Save template</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" value={current?.id ?? ""} onChange={(e) => choose(e.target.value)}>
                      {st.templates.length === 0 ? <option value="">Default template</option> : null}
                      {st.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {current ? <Button variant="outline" size="icon" onClick={() => setEdit({ ...current })} aria-label="Edit template"><Pencil /></Button> : null}
                    {current ? <Button variant="outline" size="icon" onClick={() => del(current.id)} aria-label="Delete template"><Trash2 /></Button> : null}
                    <Button variant="outline" onClick={() => setEdit({ id: crypto.randomUUID(), name: "", body: current?.body ?? DEFAULT_BODY })}><Plus /> New</Button>
                  </div>
                  <div className="rounded-lg bg-accent/40 p-3">
                    <textarea className="min-h-64 w-full resize-y rounded-lg border bg-card p-3 text-sm leading-6" value={text} onChange={(e) => setText(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(text).then(() => toast.success("Message copied")); }}><Copy /> Copy</Button>
                    <Button onClick={() => phone ? openWhatsAppApp(phone, text) : window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")}><MessageCircle /> Send to WhatsApp</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
