import logoUrl from "@/assets/logo.png";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Paperclip, RotateCcw, Send, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/extract")({
  head: () => ({
    meta: [
      { title: "Extract Bot — Image/PDF to Text" },
      {
        name: "description",
        content:
          "Koi bhi image ya PDF upload karo aur accurate text form me data hasil karo.",
      },
    ],
  }),
  component: ExtractChat,
});

type ChatMessage =
  | {
      id: string;
      role: "user";
      fileName: string;
      fileType: string;
      previewUrl?: string;
      prompt?: string;
    }
  | { id: string; role: "assistant"; text: string; loading?: boolean };

const STORAGE_KEY = "extract-bot:messages:v1";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ExtractChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || busy) return;
    try {
      // Strip large data URLs before persisting
      const light = messages.map((m) =>
        m.role === "user" && m.previewUrl && m.previewUrl.length > 200_000
          ? { ...m, previewUrl: undefined }
          : m
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
    } catch {
      // ignore
    }
  }, [messages, busy]);

  const handlePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File 15MB se kam honi chahiye");
      return;
    }
    const ok =
      file.type.startsWith("image/") || file.type === "application/pdf";
    if (!ok) {
      toast.error("Sirf image ya PDF file support hai");
      return;
    }
    setPendingFile(file);
    if (file.type.startsWith("image/")) {
      setPendingPreview(URL.createObjectURL(file));
    } else {
      setPendingPreview(null);
    }
  };

  const clearPending = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  };

  const handleSend = async () => {
    if (!pendingFile || busy) return;
    const file = pendingFile;
    const currentPrompt = prompt.trim();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      fileName: file.name,
      fileType: file.type,
      previewUrl: pendingPreview ?? undefined,
      prompt: currentPrompt || undefined,
    };
    const loadingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      loading: true,
    };
    setMessages((m) => [...m, userMsg, loadingMsg]);
    setPrompt("");
    setPendingFile(null);
    setPendingPreview(null);
    setBusy(true);

    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentPrompt,
          file: { name: file.name, type: file.type, dataUrl },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Extraction failed");
      }
      const { text } = (await res.json()) as { text: string };
      setMessages((m) =>
        m.map((msg) =>
          msg.id === loadingMsg.id
            ? { ...msg, text: text || "Kuch nahi mila.", loading: false }
            : msg
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Extraction failed";
      toast.error(message);
      setMessages((m) => m.filter((msg) => msg.id !== loadingMsg.id));
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const shareOnWhatsApp = (text: string) => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Extract Bot"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg bg-card object-contain shadow-sm"
            />
            <div>
              <h1 className="text-base font-semibold leading-tight text-foreground">
                Extract Bot
              </h1>
              <p className="text-xs text-muted-foreground">
                Image/PDF → accurate text
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/">
              <Button variant="ghost" size="sm">
                Order
              </Button>
            </Link>
            <Link to="/invoice">
              <Button variant="ghost" size="sm">
                Invoice
              </Button>
            </Link>
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
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
        <Conversation className="flex-1">
          <ConversationContent className="pb-4 pt-6">
            {messages.length === 0 ? <EmptyState /> : null}

            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <Message key={msg.id} from="user">
                    <MessageContent>
                      <div className="flex flex-col gap-2">
                        {msg.previewUrl && msg.fileType.startsWith("image/") ? (
                          <img
                            src={msg.previewUrl}
                            alt={msg.fileName}
                            className="max-h-64 rounded-md object-contain"
                          />
                        ) : (
                          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
                            📄 {msg.fileName}
                          </div>
                        )}
                        {msg.prompt ? <p className="text-sm">{msg.prompt}</p> : null}
                      </div>
                    </MessageContent>
                  </Message>
                );
              }
              return (
                <Message key={msg.id} from="assistant">
                  <MessageContent>
                    {msg.loading ? (
                      <Shimmer>Text extract ho rahi hai...</Shimmer>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed">
                        {msg.text}
                      </pre>
                    )}
                  </MessageContent>
                  {!msg.loading && msg.text ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => shareOnWhatsApp(msg.text)}
                        className="gap-1.5"
                      >
                        <Share2 className="h-4 w-4" />
                        WhatsApp par bhejo
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(msg.text);
                          toast.success("Copy ho gaya");
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  ) : null}
                </Message>
              );
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-2">
          <div className="rounded-xl border border-border/60 bg-card p-3">
            {pendingFile ? (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 p-2">
                {pendingPreview ? (
                  <img
                    src={pendingPreview}
                    alt={pendingFile.name}
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-background text-xs">
                    PDF
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {pendingFile.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {(pendingFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={clearPending}
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Optional: kuch specific batao (e.g. sirf phone numbers nikalo)"
              disabled={busy}
              rows={2}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePick}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <Paperclip className="h-4 w-4" />
                  {pendingFile ? "Change" : "Attach"}
                </Button>
              </div>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!pendingFile || busy}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                Extract
              </Button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Image ya PDF (max 15MB) attach karein → text extract ho jayegi.
          </p>
        </div>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-8 max-w-xl rounded-xl border border-border/60 bg-card/50 p-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">
        Image ya PDF upload karein
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Screenshot, receipt, order slip, ya PDF — jo bhi ho, main us me se saari
        text accurately nikaal ke doon ga. Roman Urdu, Urdu, English — sab
        support hai.
      </p>
    </div>
  );
}
