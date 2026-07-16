import logoUrl from "@/assets/logo.png";
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
import { Button } from "@/components/ui/button";
import { useChat } from "@ai-sdk/react";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { RotateCcw, Share2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
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
        content: "Kisi bhi format mein order likho aur foran clean, WhatsApp-ready order format hasil karo.",
      },
    ],
  }),
  component: OrderChat,
});

const transport = new DefaultChatTransport({ api: "/api/chat" });

function messageText(msg: UIMessage): string {
  return msg.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

function shareOnWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

const STORAGE_KEY = "order-format-bot:messages:v1";

function OrderChat() {
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
    onError: (err) => toast.error(err.message || "Kuch masla ho gaya"),
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate from localStorage once on mount
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

  // Persist to localStorage whenever messages change (only after hydration)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (status === "streaming" || status === "submitted") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore quota errors
    }
  }, [messages, status]);

  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status, messages.length]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Order Format Bot"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg bg-card object-contain shadow-sm"
            />
            <div>
              <h1 className="text-base font-semibold leading-tight text-foreground">
                Order Format Bot
              </h1>
              <p className="text-xs text-muted-foreground">
                Kisi bhi format ka order → foran clean format
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
        <Conversation className="flex-1">
          <ConversationContent className="pb-4 pt-6">
            {messages.length === 0 ? <EmptyState /> : null}

            {messages.map((msg) => {
              const text = messageText(msg);
              return (
                <Message key={msg.id} from={msg.role}>
                  {msg.role === "assistant" ? (
                    <>
                      <MessageContent>
                        {text ? (
                          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed">
                            {text}
                          </pre>
                        ) : (
                          <Shimmer>Format ho raha hai...</Shimmer>
                        )}
                      </MessageContent>
                      {text ? (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => shareOnWhatsApp(text)}
                            className="gap-1.5"
                          >
                            <Share2 className="h-4 w-4" />
                            WhatsApp par bhejo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await navigator.clipboard.writeText(text);
                              toast.success("Copy ho gaya");
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <MessageContent>
                      <MessageResponse>{text}</MessageResponse>
                    </MessageContent>
                  )}
                </Message>
              );
            })}

            {status === "submitted" ? (
              <Message from="assistant">
                <MessageContent>
                  <Shimmer>Format ho raha hai...</Shimmer>
                </MessageContent>
              </Message>
            ) : null}

            {error ? (
              <p className="text-center text-sm text-destructive">{error.message}</p>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-2">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              ref={textareaRef}
              placeholder="Order details paste karein... (name, phone, city, address, product, total, delivery, advance)"
              disabled={isBusy}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={isBusy} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            "WhatsApp par bhejo" dabao → WhatsApp khulega → apna group choose karo.
          </p>
        </div>
      </main>
    </div>
  );
}

function EmptyState() {
  const example = `Ahmad ali\n03001234567\nLahore, model town H block ghar 42\niPhone case black\nTotal 1500, delivery 200, advance 500`;
  return (
    <div className="mx-auto mt-8 max-w-xl rounded-xl border border-border/60 bg-card/50 p-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">Order paste karein</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Kisi bhi shakal mein: bikhri hui lines, Urdu, Roman Urdu, ya English. Main aap ko standard
        order format mein foran wapas dunga — phir ek tap se WhatsApp group par bhej dain.
      </p>
      <div className="mt-4 rounded-lg bg-muted/60 p-3 text-left">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Example
        </p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-foreground">{example}</pre>
      </div>
    </div>
  );
}
