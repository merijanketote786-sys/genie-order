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
import { setHandoff, takeHandoff } from "@/lib/handoff";
import { DEFAULT_CONFIRMATION_TEMPLATE } from "@/lib/order-template";
import {
  EMPTY_CONFIRMATION,
  detectInvoicePayment,
  grandTotal,
  numberInvoiceItems,
  renderConfirmation,
  type ConfirmationValues,
} from "@/lib/confirmation";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CreditCard, Eraser, FileSignature, Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/confirmation")({
  head: () => ({
    meta: [
      { title: "Order Confirmation — Performa aur WhatsApp Share" },
      {
        name: "description",
        content:
          "Invoice aur customer details se order confirmation performa banayein aur foran WhatsApp par customer ko bhejein.",
      },
      { property: "og:title", content: "Order Confirmation — Performa aur WhatsApp Share" },
      {
        property: "og:description",
        content: "Customer details, COD/CC status aur apni template se order performa banayein.",
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
  const applyInvoiceText = (raw: string) => {
    const invoice = numberInvoiceItems(raw);
    const pay = detectInvoicePayment(raw);
    if (pay.method) {
      setPaymentEnabled(true);
      setPaymentMethod(pay.method);
      setCodAmount(pay.method === "COD" ? pay.codAmount : "0");
      setParcelStatus(pay.status);
    }
    return { invoice, pay };
  };


  const set = <K extends keyof ConfirmationValues>(key: K, value: ConfirmationValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setValues({ ...EMPTY_CONFIRMATION, ...JSON.parse(saved) });
    } catch {
      // ignore
    }
    const incoming = takeHandoff("confirmation");
    if (incoming) {
      const { invoice } = applyInvoiceText(incoming);
      setValues((prev) => ({ ...prev, invoice }));
      toast.success("Invoice confirmation section me aa gayi");
    }
  }, []);

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

  const build = () => {
    if (!values.name.trim() && !values.phone.trim() && !values.invoice.trim()) {
      toast.error("Customer detail ya invoice text zaroori hai");
      return;
    }
    buildFrom(values);
    toast.success("Order performa taiyar hai");
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
      toast.success("Data template ke mutabiq bhar diya");
    } catch {
      toast.error("Text samajh nahi aaya — dobara koshish karein");
    } finally {
      setParsing(false);
    }
  };

  const clearAll = () => {
    setValues(EMPTY_CONFIRMATION);
    setPerforma("");
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
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-1">
        <WorkspaceHeader
          icon={FileSignature}
          eyebrow="Customer confirmation"
          title="Order Performa"
          description="Invoice section se aayi invoice, customer details aur payment status ko apni template mein daal kar customer ko WhatsApp par bhejein."
          meta={["Templates", "COD / CC", "WhatsApp"]}
        />

        <WorkspaceToolDock>
          <WorkspaceTool
            icon={Users}
            label="Customer"
            title="Customer search"
            description="Saved customer choose karein — details khud bhar jayengi."
          >
            <CustomerPickerBody
              useLabel="Confirmation me daalein"
              onUse={(_text, customer) => {
                setValues((prev) => ({
                  ...prev,
                  name: customer.name || prev.name,
                  phone: customer.phone || prev.phone,
                  city: customer.city || prev.city,
                  address: customer.address || prev.address,
                }));
                toast.success("Customer detail bhar di gayi");
              }}
            />
          </WorkspaceTool>
          <WorkspaceTool icon={CreditCard} label="Payment" title="Payment status" active={paymentEnabled}>
            <PaymentModeField
              enabled={paymentEnabled}
              onEnabledChange={setPaymentEnabled}
              method={paymentMethod}
              onMethodChange={setPaymentMethod}
              codAmount={codAmount}
              onCodAmountChange={setCodAmount}
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
            Data paste karein
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Kisi bhi format me order/customer detail paste karein — fields khud bhar jayenge aur
            selected template ke mutabiq performa ban jayega.
          </p>
          <div className="mt-2 rounded-xl border border-border bg-background">
            <ChatComposer
              value={pasted}
              onValueChange={setPasted}
              disabled={parsing}
              placeholder="Yahan order ya customer ki details paste karein…"
              textareaClassName="min-h-24 px-3 pt-3 text-sm"
              onSubmit={({ text }) => fillFromText(text)}
            />
          </div>
        </section>



        <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[11px] font-bold uppercase text-muted-foreground">Customer details</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label="Order #" value={values.orderNumber} onChange={(v) => set("orderNumber", v)} placeholder="00370" />
            <Field label="Name" value={values.name} onChange={(v) => set("name", v)} placeholder="Customer ka naam" />
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
              placeholder="Poora address"
              className="mt-1 min-h-16 rounded-xl bg-background text-sm"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[11px] font-bold uppercase text-muted-foreground">Invoice / items</p>
          <Textarea
            value={values.invoice}
            onChange={(e) => set("invoice", e.target.value)}
            placeholder="Invoice section se 'Confirmation me bhejein' dabayein, ya yahan items paste karein."
            className="mt-2 min-h-32 rounded-xl bg-background font-mono text-[13px] leading-6"
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Field label="Product Total" value={values.productTotal} onChange={(v) => set("productTotal", v)} placeholder="5000" inputMode="decimal" />
            <Field label="Delivery" value={values.delivery} onChange={(v) => set("delivery", v)} placeholder="250" inputMode="decimal" />
            <Field label="Advance" value={values.advance} onChange={(v) => set("advance", v)} placeholder="1000" inputMode="decimal" />
          </div>
          <div className="mt-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="conf-notes">
              Notes (optional)
            </label>
            <Textarea
              id="conf-notes"
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Koi khaas hidayat…"
              className="mt-1 min-h-14 rounded-xl bg-background text-sm"
            />
          </div>
          {total ? (
            <p className="mt-2 text-sm font-semibold text-foreground">Grand Total: {total}</p>
          ) : null}
          <Button type="button" onClick={build} className="mt-3 h-11 w-full gap-1.5 rounded-xl sm:w-auto">
            <Sparkles className="size-4" /> Performa banayein
          </Button>
        </section>

        {performa ? (
          <ResultCard text={performa} label="Order performa" phone={values.phone} />
        ) : (
          <p className="pb-4 text-center text-xs text-muted-foreground">
            Performa banane ke baad yahan preview aur WhatsApp share button aa jayega.
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
