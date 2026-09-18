import { AppShell } from "@/components/app-shell";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ChatComposer, ChatMessage, ChatMessageContent, PlainMessageText } from "@/components/lightweight-chat";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ResultCard } from "@/components/result-card";
import { useChat } from "@ai-sdk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ScrollToEnd } from "@/components/scroll-to-end";
import { loadChatHistory, saveChatHistory } from "@/lib/chat-history";
import { setHandoff, takeHandoff } from "@/lib/handoff";
import { WorkspaceHeader } from "@/components/workspace-header";
import { OrderTemplateDialog } from "@/components/order-template-dialog";
import { RateMiniCalculatorBody } from "@/components/rate-mini-calculator";
import { CustomerPickerBody } from "@/components/customer-picker";
import { ProductPickerBody } from "@/components/product-picker";
import { WorkspaceTool, WorkspaceToolDock } from "@/components/workspace-tool";
import { PaymentModeField, paymentLine, stripPaymentLines, upsertPaymentLine, type PaymentMethod } from "@/components/payment-mode-field";
import { DEFAULT_ORDER_TEMPLATE } from "@/lib/order-template";
import { saveOrder } from "@/lib/records.functions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Calculator, ClipboardList, CreditCard, Languages, MessageSquareText, Package, QrCode, Sparkles, Users } from "lucide-react";


export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Order Format Bot — Instant Order Formatter" },
      {
        name: "description",
        content:
          "Kisi bhi format mein order likho aur foran clean, WhatsApp-ready order format hasil karo.",
      },
      { property: "og:title", content: "Order Format Bot — Instant Order Formatter" },
      {
        property: "og:description",
        content:
          "Kisi bhi format mein order likho aur foran clean, WhatsApp-ready order format hasil karo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrderChat,
});

function messageText(msg: UIMessage): string {
  return msg.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

const STORAGE_KEY = "order-format-bot:messages:v1";

function OrderChat() {
  const navigate = useNavigate();

  const [orderTemplate, setOrderTemplate] = useState(DEFAULT_ORDER_TEMPLATE);
  const [composerText, setComposerText] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [codAmount, setCodAmount] = useState("");
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const paymentRef = useRef({ enabled: false, method: "COD" as PaymentMethod, cod: "" });
  paymentRef.current = { enabled: paymentEnabled, method: paymentMethod, cod: codAmount };

  const appendToComposer = useCallback((block: string) => {
    setComposerText((prev) => `${prev.trimEnd()}${prev.trim() ? "\n" : ""}${block}\n`);
  }, []);
  const handleTemplateChange = useCallback((template: string) => setOrderTemplate(template), []);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async (): Promise<Record<string, string>> => {
          const { supabase } = await import("@/integrations/supabase/client");
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, template: orderTemplate },
        }),
      }),
    [orderTemplate],
  );
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
    onError: (err) => toast.error(err.message || "Kuch masla ho gaya"),
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hydratedRef = useRef(false);
  const savedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const saved = loadChatHistory<UIMessage>(STORAGE_KEY);
    if (saved) setMessages(saved);
    const incoming = takeHandoff("order");
    if (incoming) {
      setComposerText(`${incoming.trim()}\n\nIs invoice ka order format banayein.\n`);
      toast.success("Invoice order section me aa gayi");
    }
  }, [setMessages]);


  useEffect(() => {
    if (!hydratedRef.current) return;
    if (status === "streaming" || status === "submitted") return;
    // Never overwrite saved history with an empty array (clearing removes the key directly)
    if (messages.length === 0) return;
    saveChatHistory(STORAGE_KEY, messages);
  }, [messages, status]);

  useEffect(() => {
    if (status === "ready" && window.matchMedia("(min-width: 768px)").matches) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [status, messages.length]);

  // Har mukammal order khud record ho jata hai (History page)
  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = messageText(last);
    if (text.length < 10 || savedRef.current.has(text)) return;
    savedRef.current.add(text);
    const pay = paymentRef.current;
    const amount = Number(pay.cod.replace(/[^\d.]/g, ""));
    saveOrder({
      data: {
        orderText: text,
        paymentMethod: pay.enabled ? pay.method : undefined,
        codAmount:
          pay.enabled && pay.method === "COD" && Number.isFinite(amount) && amount > 0
            ? amount
            : undefined,
      },
    }).catch(() => {
      savedRef.current.delete(text);
    });
  }, [status, messages]);

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
      title="Order Format Bot"
      subtitle="Kisi bhi format ka order → clean format"
      active="/"
      onClear={handleClear}
      showClear={messages.length > 0}
    >
      <WorkspaceHeader
        icon={ClipboardList}
        eyebrow="Order operations"
        title="Create Order"
        description="Paste any customer order and instantly convert it into a clean standard format."
        meta={["Urdu", "Roman Urdu", "English"]}
      />
      <WorkspaceToolDock>
        <WorkspaceTool icon={Users} label="Customer" title="Customer search" description="Naam, city ya phone se saved customer dhoondein.">
          <CustomerPickerBody useLabel="Order me daalein" onUse={(block) => {
            appendToComposer(block);
            textareaRef.current?.focus();
            toast.success("Customer detail order me daal diya");
          }} />
        </WorkspaceTool>
        <WorkspaceTool icon={Package} label="Product" title="Product select" description="Rate list se product, pack aur qty choose karein.">
          <ProductPickerBody useLabel="Order me daalein" onUse={(line) => {
            appendToComposer(line);
            textareaRef.current?.focus();
            toast.success("Product order me daal diya");
          }} />
        </WorkspaceTool>
        <WorkspaceTool icon={Calculator} label="Courier" title="Courier rate" description="Weight aur city se delivery charge calculate karein.">

          <RateMiniCalculatorBody useLabel="Order me daalein" onUse={(amount) => {
            appendToComposer(`Delivery: ${amount}`);
            textareaRef.current?.focus();
            toast.success(`Delivery Rs ${amount} order me daal diya`);
          }} />
        </WorkspaceTool>
        <WorkspaceTool icon={CreditCard} label="Payment" title="Payment status" active={paymentEnabled}>
          <PaymentModeField
            enabled={paymentEnabled}
            onEnabledChange={(on) => {
              setPaymentEnabled(on);
              if (on) setComposerText((prev) => upsertPaymentLine(prev, paymentLine(paymentMethod, paymentMethod === "COD" ? codAmount : "")));
              else setComposerText((prev) => `${stripPaymentLines(prev)}${stripPaymentLines(prev).trim() ? "\n" : ""}`);
            }}
            method={paymentMethod}
            onMethodChange={(m) => {
              setPaymentMethod(m);
              setComposerText((prev) => upsertPaymentLine(prev, paymentLine(m, m === "COD" ? codAmount : "")));
            }}
            codAmount={codAmount}
            onCodAmountChange={setCodAmount}
          />
        </WorkspaceTool>
        <OrderTemplateDialog template={orderTemplate} onTemplateChange={handleTemplateChange} compact />
      </WorkspaceToolDock>
      <Conversation className="flex-1">
        <ConversationContent className="gap-4 px-0 pb-4 pt-3 sm:gap-6 sm:pb-6 sm:pt-5">
          {messages.length === 0 ? <EmptyState /> : null}

          {messages.map((msg) => {
            const text = messageText(msg);
            return (
              <ChatMessage key={msg.id} from={msg.role}>
                {msg.role === "assistant" ? (
                  text ? (
                    <ResultCard
                      text={text}
                      label="Formatted order"
                      forward={{
                        label: "Invoice me bhejein",
                        onClick: (value) => {
                          setHandoff("invoice", value);
                          navigate({ to: "/invoice" });
                        },
                      }}
                    />

                  ) : (
                    <ChatMessageContent>
                      <Shimmer>Format ho raha hai...</Shimmer>
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
                <Shimmer>Format ho raha hai...</Shimmer>
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
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold text-foreground sm:px-4 sm:py-2.5">
            <MessageSquareText className="size-4 text-primary" /> Customer order
            <span className="ml-auto hidden text-[11px] font-normal text-muted-foreground sm:inline">Enter to process · Shift+Enter for new line</span>
          </div>
          <ChatComposer
            ref={textareaRef}
            onSubmit={handleSubmit}
            status={status}
            disabled={isBusy}
            value={composerText}
            onValueChange={setComposerText}
            placeholder="Order details paste karein... (name, phone, city, address, product, total)"
            textareaClassName="min-h-20 px-3 py-2.5 text-sm leading-6 sm:min-h-32 sm:px-4 sm:py-3"
          />
        </div>
        <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">
          "WhatsApp par bhejo" dabao → WhatsApp khulega → apna group choose karo.
        </p>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  const example = `Ahmad ali\n03001234567\nLahore, model town H block ghar 42\niPhone case black\nTotal 1500, delivery 200, advance 500`;
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-3 py-6 md:grid-cols-[0.8fr_1.2fr]">
      <div className="glass-panel flex flex-col justify-center rounded-3xl p-5 sm:p-6">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground sm:size-10"><Sparkles className="size-4.5 sm:size-5" /></span>
        <h3 className="mt-3 font-display text-base font-bold text-foreground sm:mt-4 sm:text-lg">No order yet</h3>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground sm:mt-2 sm:text-sm sm:leading-6">Paste an order below to standardize customer, delivery and payment details.</p>
        <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-muted-foreground sm:mt-4 sm:text-xs"><Languages className="size-4 shrink-0 text-primary" /> Urdu, Roman Urdu and English supported</div>
      </div>
      <div className="hidden rounded-3xl border border-border bg-card p-5 sm:block sm:p-6">
        <p className="text-[11px] font-bold uppercase text-muted-foreground">Example input</p>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-4 font-mono text-xs leading-6 text-foreground">{example}</pre>
      </div>
    </div>
  );
}
