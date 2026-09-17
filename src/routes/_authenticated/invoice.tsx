import { AppShell } from "@/components/app-shell";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ChatComposer, ChatMessage, ChatMessageContent, PlainMessageText } from "@/components/lightweight-chat";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ResultCard } from "@/components/result-card";
import { saveInvoice } from "@/lib/records.functions";
import { useChat } from "@ai-sdk/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ScrollToEnd } from "@/components/scroll-to-end";
import { loadChatHistory, saveChatHistory } from "@/lib/chat-history";
import { setHandoff, takeHandoff } from "@/lib/handoff";
import { WorkspaceHeader } from "@/components/workspace-header";
import { RateMiniCalculatorBody } from "@/components/rate-mini-calculator";
import { CustomerPickerBody } from "@/components/customer-picker";
import { ProductPickerBody } from "@/components/product-picker";
import { WorkspaceTool, WorkspaceToolDock } from "@/components/workspace-tool";
import { Button } from "@/components/ui/button";
import { PaymentModeField, paymentLine, stripPaymentLines, upsertPaymentLine, type PaymentMethod } from "@/components/payment-mode-field";
import { Calculator, CreditCard, Package, Phone, ReceiptText, ShieldCheck, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/invoice")({
  head: () => ({
    meta: [
      { title: "Invoice Bot — Instant Invoice Generator" },
      {
        name: "description",
        content:
          "Kisi bhi format mein inquiry ya order paste karo aur foran clean invoice hasil karo.",
      },
      { property: "og:title", content: "Invoice Bot — Instant Invoice Generator" },
      {
        property: "og:description",
        content: "Products paste karein aur foran professional invoice hasil karein.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvoiceChat,
});

const transport = new DefaultChatTransport({
  api: "/api/invoice",
  // Rate list usi user ke workspace se aati hai, isliye token bhejte hain.
  headers: async (): Promise<Record<string, string>> => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

function messageText(msg: UIMessage): string {
  return msg.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

const STORAGE_KEY = "invoice-bot:messages:v1";
const PHONE_KEY = "invoice-bot:phone:v1";

function InvoiceChat() {
  const [phone, setPhone] = useState("");
  const [composerText, setComposerText] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [codAmount, setCodAmount] = useState("");
  const [paymentEnabled, setPaymentEnabled] = useState(false);

  const appendToComposer = useCallback((block: string) => {
    setComposerText((prev) => `${prev.trimEnd()}${prev.trim() ? "\n" : ""}${block}\n`);
  }, []);
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
    onError: (err) => toast.error(err.message || "Kuch masla ho gaya"),
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const saved = loadChatHistory<UIMessage>(STORAGE_KEY);
    if (saved) setMessages(saved);
  }, [setMessages]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (status === "streaming" || status === "submitted") return;
    if (messages.length === 0) return;
    saveChatHistory(STORAGE_KEY, messages);
  }, [messages, status]);

  useEffect(() => {
    if (status === "ready" && window.matchMedia("(min-width: 768px)").matches) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [status, messages.length]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PHONE_KEY);
      if (saved) setPhone(saved);
    } catch {
      // ignore
    }
  }, []);

  const updatePhone = (value: string) => {
    const cleaned = value.replace(/[^\d+\s-]/g, "");
    setPhone(cleaned);
    try {
      localStorage.setItem(PHONE_KEY, cleaned);
    } catch {
      // ignore
    }
  };

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = async ({ text }: { text: string }) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    await sendMessage({ text: trimmed });
  };

  const handleClear = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <AppShell
      title="Invoice Bot"
      subtitle="Order/inquiry → foran invoice"
      active="/invoice"
      onClear={handleClear}
      showClear={messages.length > 0}
    >
      <WorkspaceHeader
        icon={ReceiptText}
        eyebrow="Billing operations"
        title="Invoice Workspace"
        description="Create a clean item invoice using live staff rates, then amend it through the same conversation."
        meta={["Live rates", "Editable", "WhatsApp ready"]}
      />
      <WorkspaceToolDock>
        <WorkspaceTool icon={Users} label="Customer" title="Customer search" description="Saved customer ko invoice mein add karein.">
          <CustomerPickerBody useLabel="Invoice me daalein" onUse={(block) => {
            appendToComposer(block);
            textareaRef.current?.focus();
            toast.success("Customer detail invoice me daal diya");
          }} />
        </WorkspaceTool>
        <WorkspaceTool icon={Calculator} label="Courier" title="Courier rate" description="Delivery charge foran calculate karein.">
          <RateMiniCalculatorBody useLabel="Invoice me daalein" onUse={(amount) => {
            appendToComposer(`Delivery Charges: ${amount}`);
            textareaRef.current?.focus();
            toast.success(`Delivery Rs ${amount} invoice me daal diya`);
          }} />
        </WorkspaceTool>
        <WorkspaceTool icon={CreditCard} label="Payment" title="Payment status" active={paymentEnabled}>
          <PaymentModeField enabled={paymentEnabled} onEnabledChange={(on) => {
            setPaymentEnabled(on);
            if (on) setComposerText((prev) => upsertPaymentLine(prev, paymentLine(paymentMethod, paymentMethod === "COD" ? codAmount : "")));
            else setComposerText((prev) => `${stripPaymentLines(prev)}${stripPaymentLines(prev).trim() ? "\n" : ""}`);
          }} method={paymentMethod} onMethodChange={(m) => {
            setPaymentMethod(m);
            setComposerText((prev) => upsertPaymentLine(prev, paymentLine(m, m === "COD" ? codAmount : "")));
          }} codAmount={codAmount} onCodAmountChange={setCodAmount} />
        </WorkspaceTool>
        <WorkspaceTool icon={Phone} label="WhatsApp" title="WhatsApp number" active={Boolean(phone)}>
          <label className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border px-3">
            <Phone className="size-4 shrink-0 text-primary" />
            <input value={phone} onChange={(e) => updatePhone(e.target.value)} inputMode="tel" placeholder="03xxxxxxxxx" className="min-w-0 bg-transparent text-sm outline-none" autoComplete="tel" />
            {phone ? <Button type="button" variant="ghost" size="icon-sm" onClick={() => updatePhone("")} aria-label="Clear number"><X /></Button> : null}
          </label>
        </WorkspaceTool>
      </WorkspaceToolDock>
      <Conversation className="flex-1">
        <ConversationContent className="gap-4 px-0 pb-3 pt-3 sm:gap-6 sm:pb-4 sm:pt-5">
          {messages.length === 0 ? <EmptyState /> : null}

          {messages.map((msg) => {
            const text = messageText(msg);
            return (
              <ChatMessage key={msg.id} from={msg.role}>
                {msg.role === "assistant" ? (
                  text ? (
                    <ResultCard
                      text={text}
                      label="Invoice"
                      phone={phone}
                      exportable
                      onSave={async (value) => {
                        const amount = Number(codAmount.replace(/[^\d.]/g, ""));
                        const res = await saveInvoice({
                          data: {
                            invoiceText: value,
                            phone: phone || undefined,
                            paymentMethod: paymentEnabled ? paymentMethod : undefined,
                            codAmount:
                              paymentEnabled &&
                              paymentMethod === "COD" &&
                              Number.isFinite(amount) &&
                              amount > 0
                                ? amount
                                : undefined,
                          },
                        });
                        toast.success(
                          res.duplicate
                            ? `Pehle se saved: ${res.invoiceNumber}`
                            : `Save ho gayi: ${res.invoiceNumber}`,
                        );
                      }}
                    />
                  ) : (
                    <ChatMessageContent>
                      <Shimmer>Invoice ban rahi hai...</Shimmer>
                    </ChatMessageContent>
                  )
                ) : (
                  <ChatMessageContent>
                    <PlainMessageText>{text}</PlainMessageText>
                  </ChatMessageContent>
                )}
              </ChatMessage>
            );
          })}

          {status === "submitted" ? (
            <ChatMessage from="assistant">
              <ChatMessageContent>
                <Shimmer>Invoice ban rahi hai...</Shimmer>
              </ChatMessageContent>
            </ChatMessage>
          ) : null}

          {error ? (
            <p className="text-center text-sm text-destructive">{error.message}</p>
          ) : null}
        </ConversationContent>
        <ScrollToEnd count={messages.length} />
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 bg-background/95 pb-2 pt-2 backdrop-blur-sm sm:pb-4 sm:pt-3">
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20">
          <ChatComposer
            ref={textareaRef}
            onSubmit={handleSubmit}
            status={status}
            disabled={isBusy}
            value={composerText}
            onValueChange={setComposerText}
            placeholder="Products + prices paste karein... (e.g. Conditioner 250ml 750, Glycerine 250ml 250 ...)"
            textareaClassName="min-h-20 px-3 py-2.5 text-sm leading-6 sm:min-h-28 sm:px-4 sm:py-3"
          />
        </div>
        <p className="mt-2 hidden items-center justify-center gap-1.5 text-center text-xs text-muted-foreground sm:flex">
          <ShieldCheck className="size-3.5" />
          Delivery Charges blank rehti hain — baad mein manually add karain.
        </p>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  const example = `Conditioner 250ml 750\nGlycerine 250ml 250\nLanolin 100ml 450\nCocobetaine 500ml 500`;
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-3 py-6 md:grid-cols-[0.8fr_1.2fr]">
      <div className="glass-panel flex flex-col justify-center rounded-3xl p-5 sm:p-6">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground sm:size-10"><ReceiptText className="size-4.5 sm:size-5" /></span>
        <h3 className="mt-3 font-display text-base font-bold text-foreground sm:mt-4 sm:text-lg">No invoice yet</h3>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground sm:mt-2 sm:text-sm sm:leading-6">Paste product details below. Delivery and grand total remain blank until you provide them.</p>
      </div>
      <div className="hidden rounded-3xl border border-border bg-card p-5 sm:block sm:p-6">
        <p className="text-[11px] font-bold uppercase text-muted-foreground">Example input</p>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-4 font-mono text-xs leading-6 text-foreground">{example}</pre>
      </div>
    </div>
  );
}
