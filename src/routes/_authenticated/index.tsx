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
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ScrollToEnd } from "@/components/scroll-to-end";
import { loadChatHistory, saveChatHistory } from "@/lib/chat-history";
import { WorkspaceHeader } from "@/components/workspace-header";
import { OrderTemplateDialog } from "@/components/order-template-dialog";
import { DEFAULT_ORDER_TEMPLATE } from "@/lib/order-template";
import { saveOrder } from "@/lib/records.functions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Languages, MessageSquareText, Sparkles } from "lucide-react";

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
  const [orderTemplate, setOrderTemplate] = useState(DEFAULT_ORDER_TEMPLATE);
  const handleTemplateChange = useCallback((template: string) => setOrderTemplate(template), []);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
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
    saveOrder({ data: { orderText: text } }).catch(() => {
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
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm sm:px-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Order format</p>
          <p className="truncate text-xs text-muted-foreground">
            {orderTemplate === DEFAULT_ORDER_TEMPLATE ? "Default template active" : "Aapki custom template active"}
          </p>
        </div>
        <OrderTemplateDialog template={orderTemplate} onTemplateChange={handleTemplateChange} />
      </div>
      <Conversation className="flex-1">
        <ConversationContent className="gap-4 px-0 pb-4 pt-3 sm:gap-6 sm:pb-6 sm:pt-5">
          {messages.length === 0 ? <EmptyState /> : null}

          {messages.map((msg) => {
            const text = messageText(msg);
            return (
              <ChatMessage key={msg.id} from={msg.role}>
                {msg.role === "assistant" ? (
                  text ? (
                    <ResultCard text={text} label="Formatted order" />
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
