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
import { Link, createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { RotateCcw, Share2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/invoice")({
  head: () => ({
    meta: [
      { title: "Invoice Bot — Instant Invoice Generator" },
      {
        name: "description",
        content: "Kisi bhi format mein inquiry ya order paste karo aur foran clean invoice hasil karo.",
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

function shareOnWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

const STORAGE_KEY = "invoice-bot:messages:v1";

function InvoiceChat() {
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore
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
              alt="Invoice Bot"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg bg-card object-contain shadow-sm"
            />
            <div>
              <h1 className="text-base font-semibold leading-tight text-foreground">
                Invoice Bot
              </h1>
              <p className="text-xs text-muted-foreground">
                Order/inquiry → foran invoice
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/">
              <Button variant="ghost" size="sm">Order Bot</Button>
            </Link>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
              </Button>
            )}
          </div>
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
                          <Shimmer>Invoice ban rahi hai...</Shimmer>
                        )}
                      </MessageContent>
                      {text ? (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => shareOnWhatsApp(text)} className="gap-1.5">
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
                  <Shimmer>Invoice ban rahi hai...</Shimmer>
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
              placeholder="Products + prices paste karein... (e.g. Conditioner 250ml 750, Glycerine 250ml 250 ...)"
              disabled={isBusy}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={isBusy} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Delivery Charges blank rehti hain — baad mein manually add karain.
          </p>
        </div>
      </main>
    </div>
  );
}

function EmptyState() {
  const example = `Conditioner 250ml 750\nGlycerine 250ml 250\nLanolin 100ml 450\nCocobetaine 500ml 500`;
  return (
    <div className="mx-auto mt-8 max-w-xl rounded-xl border border-border/60 bg-card/50 p-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">Invoice banayein</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Products aur unki prices kisi bhi format mein paste karein. Main clean invoice format mein
        wapas dunga — Delivery Charges blank rahengi taake aap baad mein add kar sakein.
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
