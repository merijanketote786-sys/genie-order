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
import { useEffect, useRef } from "react";
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
    if (status === "ready") textareaRef.current?.focus();
  }, [status, messages.length]);

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
      <Conversation className="flex-1">
        <ConversationContent className="gap-6 px-0 pb-4 pt-5">
          {messages.length === 0 ? <EmptyState /> : null}

          {messages.map((msg) => {
            const text = messageText(msg);
            return (
              <Message key={msg.id} from={msg.role}>
                {msg.role === "assistant" ? (
                  text ? (
                    <ResultCard text={text} label="Invoice" />
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

      <div className="sticky bottom-0 bg-gradient-to-t from-background via-background/95 to-transparent pb-4 pt-3">
        <div className="rounded-3xl border border-border/50 bg-surface-2 p-1.5 shadow-lg">
          <PromptInput onSubmit={handleSubmit} className="border-0 bg-transparent shadow-none">
            <PromptInputTextarea
              ref={textareaRef}
              placeholder="Products + prices paste karein... (e.g. Conditioner 250ml 750, Glycerine 250ml 250 ...)"
              disabled={isBusy}
            />
            <PromptInputFooter className="justify-end border-0">
              <PromptInputSubmit status={status} disabled={isBusy} />
            </PromptInputFooter>
          </PromptInput>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Delivery Charges blank rehti hain — baad mein manually add karain.
        </p>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  const example = `Conditioner 250ml 750\nGlycerine 250ml 250\nLanolin 100ml 450\nCocobetaine 500ml 500`;
  return (
    <div className="glass-panel mx-auto mt-6 w-full max-w-xl rounded-3xl p-6 text-center">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
        Billing desk
      </p>
      <h2 className="mt-2 font-display text-xl font-bold text-foreground">Invoice banayein</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Products aur prices kisi bhi format mein paste karein. Clean invoice format wapas milega —
        Delivery Charges blank rahengi taake aap baad mein add kar sakein.
      </p>
      <div className="mt-4 rounded-2xl border border-border/70 bg-surface-2/50 p-3 text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Example
        </p>
        <pre className="mt-1.5 whitespace-pre-wrap font-mono text-xs text-foreground">{example}</pre>
      </div>
    </div>
  );
}
