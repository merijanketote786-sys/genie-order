import { AppShell } from "@/components/app-shell";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ResultCard } from "@/components/result-card";
import { useChat } from "@ai-sdk/react";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ScrollToEnd } from "@/components/scroll-to-end";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Phone, ReceiptText, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/invoice")({
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

const transport = new DefaultChatTransport({ api: "/api/invoice" });

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
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
    onError: (err) => toast.error(err.message || "Kuch masla ho gaya"),
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UIMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {
      // ignore
    }
  }, [setMessages]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (status === "streaming" || status === "submitted") return;
    if (messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
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
      <Conversation className="flex-1">
        <ConversationContent className="gap-4 px-0 pb-3 pt-3 sm:gap-6 sm:pb-4 sm:pt-5">
          {messages.length === 0 ? <EmptyState /> : null}

          {messages.map((msg) => {
            const text = messageText(msg);
            return (
              <Message key={msg.id} from={msg.role}>
                {msg.role === "assistant" ? (
                  text ? (
                    <ResultCard text={text} label="Invoice" phone={phone} />
                  ) : (
                    <MessageContent>
                      <Shimmer>Invoice ban rahi hai...</Shimmer>
                    </MessageContent>
                  )
                ) : (
                  <MessageContent className="bubble-out group-[.is-user]:bg-bubble-out group-[.is-user]:text-foreground">
                    <MessageResponse>{text}</MessageResponse>
                  </MessageContent>
                )}
              </Message>
            );
          })}

          {status === "submitted" ? (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Invoice ban rahi hai...</Shimmer>
              </MessageContent>
            </Message>
          ) : null}

          {error ? (
            <p className="text-center text-sm text-destructive">{error.message}</p>
          ) : null}
        </ConversationContent>
        <ScrollToEnd count={messages.length} />
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 bg-background/95 pb-2 pt-2 backdrop-blur-sm sm:pb-4 sm:pt-3">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20">
          <label className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 sm:px-4">
            <Phone className="size-4 shrink-0 text-primary" />
            <span className="sr-only">Customer WhatsApp number</span>
            <input
              value={phone}
              onChange={(e) => updatePhone(e.target.value)}
              inputMode="tel"
              placeholder="Customer WhatsApp number (03xxxxxxxxx)"
              className="min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="tel"
            />
            {phone ? (
              <button type="button" onClick={() => updatePhone("")} aria-label="Clear number" className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" />
              </button>
            ) : null}
          </label>
          <PromptInput onSubmit={handleSubmit} className="border-0 bg-transparent shadow-none">
            <PromptInputTextarea
              ref={textareaRef}
              placeholder="Products + prices paste karein... (e.g. Conditioner 250ml 750, Glycerine 250ml 250 ...)"
              disabled={isBusy}
              className="min-h-20 px-3 py-2.5 text-sm leading-6 sm:min-h-28 sm:px-4 sm:py-3"
            />
            <PromptInputFooter className="justify-end border-0 px-2 pb-2 sm:px-3 sm:pb-3">
              <PromptInputSubmit status={status} disabled={isBusy} />
            </PromptInputFooter>
          </PromptInput>
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
    <div className="mx-auto grid w-full max-w-4xl gap-3 md:grid-cols-[0.8fr_1.2fr]">
      <div className="glass-panel flex flex-col justify-center rounded-xl p-4 sm:p-6">
        <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground sm:size-10"><ReceiptText className="size-4.5 sm:size-5" /></span>
        <h3 className="mt-3 font-display text-base font-bold text-foreground sm:mt-4 sm:text-lg">No invoice yet</h3>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground sm:mt-2 sm:text-sm sm:leading-6">Paste product details below. Delivery and grand total remain blank until you provide them.</p>
      </div>
      <div className="hidden rounded-xl border border-border bg-card p-5 sm:block sm:p-6">
        <p className="text-[11px] font-bold uppercase text-muted-foreground">Example input</p>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-4 font-mono text-xs leading-6 text-foreground">{example}</pre>
      </div>
    </div>
  );
}
