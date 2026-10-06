import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { WorkspaceTool, WorkspaceToolDock } from "@/components/workspace-tool";
import { CustomerPickerBody } from "@/components/customer-picker";
import { OrderTemplateDialog } from "@/components/order-template-dialog";
import { PaymentModeField, paymentLine, type PaymentMethod } from "@/components/payment-mode-field";
import { ResultCard } from "@/components/result-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChatComposer } from "@/components/lightweight-chat";
import { supabase } from "@/integrations/supabase/client";
import { clearHandoff, peekHandoff, setHandoff } from "@/lib/handoff";
import { getMySettings } from "@/lib/settings.functions";
import { DEFAULT_CONFIRMATION_TEMPLATE } from "@/lib/order-template";
import {
  EMPTY_CONFIRMATION,
  detectInvoicePayment,
  extractInvoiceOnly,
  grandTotal,
  numberInvoiceItems,
  renderConfirmation,
  type ConfirmationValues,
} from "@/lib/confirmation";
import { RateMiniCalculatorBody } from "@/components/rate-mini-calculator";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Calculator, Eraser, FileSignature, Sparkles, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/confirmation")({
  head: () => ({
    meta: [
      { title: "Order Confirmation — Performa and WhatsApp Share" },
      {
        name: "description",
        content:
          "Create an order confirmation performa from invoice and customer details, and send it to the customer on WhatsApp instantly.",
      },
      { property: "og:title", content: "Order Confirmation — Performa and WhatsApp Share" },
      {
        property: "og:description",
        content: "Build an order performa from customer details, COD/CC status and your own template.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConfirmationPage,
});

const STORAGE_KEY = "order-confirmation:draft:v1";

function ConfirmationPage() {
  const [template, setTemplate] = useState(DEFAULT_CONFIRMATION_TEMPLATE);
  const [values, setValues] = useState<ConfirmationValues>(EMPTY_CONFIRMATION);
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [codAmount, setCodAmount] = useState("");
  const [performa, setPerforma] = useState("");
  const [pasted, setPasted] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parcelStatus, setParcelStatus] = useState<"paid" | "unpaid" | "">("");
  const navigate = useNavigate();

  /** Invoice text ko number-wise sort karta hai aur COD/CC status set karta hai. */
  const applyInvoiceText = (raw: string, detectSource = raw) => {
    // Sirf invoice item lines uthao — baqi text (naam, address waghera) chhor do.
    const items = extractInvoiceOnly(raw);
    const invoice = items || numberInvoiceItems(raw);
    const pay = detectInvoicePayment(detectSource);
    if (pay.method) {
      setPaymentEnabled(true);
      setPaymentMethod(pay.method);
      setCodAmount(pay.method === "COD" ? pay.codAmount : "0");
      setParcelStatus(pay.status);
    }
    return { invoice, pay };
  };

  /** Manually likhe/paste kiye gaye text ko box se bahar aate hi sirf invoice items tak mehdood karta hai. */
  const cleanInvoiceField = () => {
    const raw = values.invoice;
    if (!raw.trim()) return;
    const items = extractInvoiceOnly(raw);
    if (!items) return; // koi item line nahi mili to text waise ka waisa rakho
    if (items !== raw.trim()) {
      setPerforma("");
      setValues((prev) => ({ ...prev, invoice: items }));
    }
  };


  const set = <K extends keyof ConfirmationValues>(key: K, value: ConfirmationValues[K]) => {
    // Koi bhi field badle to neeche para purana performa foran hata dein —
    // naya performa sirf "Performa banayein" se bane ga.
    setPerforma("");
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  /** Settings me auto order number on ho aur field khali ho to sequence se naya number le aata hai. */
  const fetchAutoOrderNumber = async (): Promise<string | null> => {
    try {
      const mine = await getMySettings();
      if (mine && mine.settings && mine.settings.autoOrderNumber === false) return null;
      const { data, error } = await supabase.rpc("next_order_number");
      if (error || !data) return null;
      return String(data);
    } catch {
      return null;
    }
  };

  /** Khali order number field ko auto number se bhar deta hai. */
  const withAutoOrderNumber = async (vals: ConfirmationValues): Promise<ConfirmationValues> => {
    if (vals.orderNumber.trim()) return vals;
    const n = await fetchAutoOrderNumber();
    return n ? { ...vals, orderNumber: n } : vals;
  };

  useEffect(() => {
    let draft = EMPTY_CONFIRMATION;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) draft = { ...EMPTY_CONFIRMATION, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    // Purane drafts me khali totals ko 0 par set karein.
    draft.productTotal = draft.productTotal.trim() || "0";
    draft.delivery = draft.delivery.trim() || "0";
    draft.advance = draft.advance.trim() || "0";
    // Peek (remove nahi): agar page remount ho jaye to dobara apply ho jaye.
    const incoming = peekHandoff("confirmation");
    if (incoming) {
      const { invoice, pay } = applyInvoiceText(incoming);
      void (async () => {
        const merged = await withAutoOrderNumber({ ...draft, invoice });
        setValues(merged);
        // Nayi invoice par purana performa hata kar naya foran bana dein.
        buildFrom(merged, pay.method ? { method: pay.method, codAmount: pay.codAmount, status: pay.status } : undefined);
      })();
      toast.success("Invoice added to the confirmation section");
    } else {
      setValues(draft);
    }
  }, []);

  // Jab invoice field me data aa chuka ho tab handoff clear karein.
  useEffect(() => {
    if (values.invoice.trim()) clearHandoff("confirmation");
  }, [values.invoice]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      // ignore
    }
  }, [values]);

  const buildFrom = (
    vals: ConfirmationValues,
    pay?: { method: "COD" | "CC"; codAmount: string; status: "paid" | "unpaid" | "" },
  ) => {
    const method = pay?.method ?? paymentMethod;
    const cod = pay ? pay.codAmount : codAmount;
    const status = pay ? pay.status : parcelStatus;
    const on = pay ? true : paymentEnabled;
    const base = on ? paymentLine(method, method === "COD" ? cod : "") : "";
    const suffix =
      on && status
        ? method === "CC"
          ? " — 0 amount parcel (Paid)"
          : " — Unpaid parcel"
        : "";
    setPerforma(renderConfirmation(template, { ...vals, payment: base ? `${base}${suffix}` : "" }));
  };

  const build = async () => {
    if (!values.name.trim() && !values.phone.trim() && !values.invoice.trim()) {
      toast.error("Customer details or invoice text is required");
      return;
    }
    const sorted = { ...values, invoice: numberInvoiceItems(values.invoice) };
    // Order number khali ho to isi waqt sequence se auto number lein — number sirf tab kharch hota hai jab performa bane.
    const numbered = await withAutoOrderNumber(sorted);
    setValues(numbered);
    buildFrom(numbered);
    toast.success("Order performa is ready");
  };

  const fillFromText = async (text: string) => {
    setParsing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/confirm-parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const parsed = (await res.json()) as Partial<ConfirmationValues>;
      let next: ConfirmationValues = values;
      setValues((prev) => {
        const merged = { ...prev };
        for (const [key, value] of Object.entries(parsed) as [keyof ConfirmationValues, string][]) {
          if (typeof value === "string" && value.trim()) merged[key] = value.trim();
        }
        next = merged;
        return merged;
      });
      buildFrom(next);
      setPasted("");
      toast.success("Data filled in as per the template");
    } catch {
      toast.error("Could not understand the text — please try again");
    } finally {
      setParsing(false);
    }
  };

  const clearAll = () => {
    setValues(EMPTY_CONFIRMATION);
    setPerforma("");
    setParcelStatus("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const total = grandTotal(values);

  return (
    <AppShell
      title="Order Confirmation"
      subtitle="Invoice + customer → performa → WhatsApp"
      active="/confirmation"
      onClear={clearAll}
      showClear
      wide
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-1">
        <WorkspaceHeader
          icon={FileSignature}
          eyebrow="Customer confirmation"
          title="Order Performa"
          description="Fill invoice from the Invoice section, customer details and payment status into your template, and send it to the customer on WhatsApp."
          meta={["Templates", "COD / CC", "WhatsApp"]}
        />

        <WorkspaceToolDock>
          <WorkspaceTool
            icon={Users}
            label="Customer"
            title="Customer search"
            description="Choose a saved customer — details will fill in automatically."
          >
            <CustomerPickerBody
              useLabel="Add to confirmation"
              onUse={(_text, customer) => {
                setPerforma("");
                setValues((prev) => ({
                  ...prev,
                  name: customer.name || prev.name,
                  phone: customer.phone || prev.phone,
                  city: customer.city || prev.city,
                  address: customer.address || prev.address,
                }));
                toast.success("Customer details filled in");
              }}
            />
          </WorkspaceTool>
          <WorkspaceTool
            icon={Calculator}
            label="Courier"
            title="Courier rate"
            description="Calculate delivery charge from weight and city."
          >
            <RateMiniCalculatorBody
              useLabel="Add to performa"
              onUse={(amount) => {
                setPerforma("");
                set("delivery", String(amount));
                toast.success(`Delivery Rs ${amount} added to performa`);
              }}
            />
          </WorkspaceTool>
          <OrderTemplateDialog
            kind="confirmation"
            template={template}
            onTemplateChange={setTemplate}
            compact
          />
          <Button
            type="button"
            variant="ghost"
            onClick={clearAll}
            className="h-14 w-full min-w-0 flex-col gap-1 rounded-lg px-2 text-[10px] text-muted-foreground"
          >
            <Eraser className="size-4.5" /> Clear
          </Button>
        </WorkspaceToolDock>

        <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[11px] font-bold uppercase text-muted-foreground">
            Paste customer details
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Write or paste customer details in any format — as soon as you press send, only the
            name, phone, city, address etc. will be filled into the fields below.
          </p>
          <div className="mt-2 rounded-xl border border-border bg-background">
            <ChatComposer
              value={pasted}
              onValueChange={setPasted}
              disabled={parsing}
              submitOnEnter={false}
              placeholder="Paste customer details here…"
              textareaClassName="min-h-24 px-3 pt-3 text-sm"
              onSubmit={({ text }) => fillFromText(text)}
            />
          </div>
        </section>



        <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[11px] font-bold uppercase text-muted-foreground">Customer details</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label="Order #" value={values.orderNumber} onChange={(v) => set("orderNumber", v)} placeholder="00370" />
            <Field label="Name" value={values.name} onChange={(v) => set("name", v)} placeholder="Customer's name" />
            <Field label="Phone" value={values.phone} onChange={(v) => set("phone", v)} placeholder="03xxxxxxxxx" inputMode="tel" />
            <Field label="City" value={values.city} onChange={(v) => set("city", v)} placeholder="Lahore" />
          </div>
          <div className="mt-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="conf-address">
              Address
            </label>
            <Textarea
              id="conf-address"
              value={values.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Full address"
              className="mt-1 min-h-16 rounded-xl bg-background text-sm"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[11px] font-bold uppercase text-muted-foreground">Invoice / items</p>
          <Textarea
            value={values.invoice}
            onChange={(e) => set("invoice", e.target.value)}
            placeholder="Press 'Send to Confirmation' in the Invoice section, or paste items here."
            className="mt-2 min-h-32 rounded-xl bg-background font-mono text-[13px] leading-6"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Paste invoice items here — your text is kept as you typed it.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Field label="Product Total" value={values.productTotal} onChange={(v) => set("productTotal", v)} placeholder="5000" inputMode="decimal" />
            <Field label="Delivery" value={values.delivery} onChange={(v) => set("delivery", v)} placeholder="250" inputMode="decimal" />
            <Field label="Advance (optional)" value={values.advance} onChange={(v) => set("advance", v)} placeholder="0" inputMode="decimal" />
          </div>
          <div className="mt-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="conf-notes">
              Notes (optional)
            </label>
            <Textarea
              id="conf-notes"
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any special instructions…"
              className="mt-1 min-h-14 rounded-xl bg-background text-sm"
            />
          </div>
          {total ? (
            <p className="mt-2 text-sm font-semibold text-foreground">Grand Total: {total}</p>
          ) : null}
          {parcelStatus ? (
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {parcelStatus === "paid"
                ? "CC — 0 amount parcel (Paid)"
                : `COD — Unpaid parcel${codAmount ? ` (${codAmount})` : ""}`}
            </p>
          ) : null}
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Payment status</p>
            <div className="mt-2">
              <PaymentModeField
                enabled={paymentEnabled}
                onEnabledChange={setPaymentEnabled}
                method={paymentMethod}
                onMethodChange={setPaymentMethod}
                codAmount={codAmount}
                onCodAmountChange={setCodAmount}
              />
            </div>
          </div>
          <Button type="button" onClick={build} className="mt-3 h-11 w-full gap-1.5 rounded-xl sm:w-auto">
            <Sparkles className="size-4" /> Generate performa
          </Button>
        </section>

        {performa ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Order performa</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPerforma("");
                  toast.success("Performa deleted");
                }}
                className="h-8 gap-1.5 rounded-lg text-xs"
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
            <ResultCard
              text={performa}
              label="Order performa"
              phone={values.phone}
              forward={{
                label: "Send to order",
                onClick: (value) => {
                  setHandoff("order", value);
                  navigate({ to: "/" });
                },
              }}
            />
          </div>
        ) : (
          <p className="pb-4 text-center text-xs text-muted-foreground">
            After generating the performa, the preview and WhatsApp share button will appear here.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "tel" | "decimal";
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 rounded-xl bg-background"
      />
    </label>
  );
}
