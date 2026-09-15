import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ChatMessage, ChatMessageContent } from "@/components/lightweight-chat";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AppShell } from "@/components/app-shell";
import { ResultCard } from "@/components/result-card";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardPaste, FileText, Paperclip, Send, X } from "lucide-react";
import { ScrollToEnd } from "@/components/scroll-to-end";
import { WorkspaceHeader } from "@/components/workspace-header";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/extract")({
  head: () => ({
    meta: [
      { title: "Extract Bot — Image/PDF to Text" },
      {
        name: "description",
        content:
          "Koi bhi image ya PDF upload karo aur accurate text form me data hasil karo.",
      },
      { property: "og:title", content: "Extract Bot — Image/PDF to Text" },
      {
        property: "og:description",
        content: "Image ya PDF upload karein aur accurate text foran hasil karein.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

  const attachFile = (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File 15MB se kam honi chahiye");
      return false;
    }
    const isSupported = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!isSupported) {
      toast.error("Sirf image ya PDF file support hai");
      return false;
    }
    if (pendingPreview?.startsWith("blob:")) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    return true;
  };

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || busy) return;
    if (messages.length === 0) return;
    try {
      // Drop blob: previews (invalid after reload) and oversized data URLs
      const light = messages.map((m) =>
        m.role === "user" &&
        m.previewUrl &&
        (m.previewUrl.startsWith("blob:") || m.previewUrl.length > 200_000)
          ? { ...m, previewUrl: undefined }
          : m
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
    } catch {
      // ignore
    }
  }, [messages, busy]);

  // Revoke any live object URL when unmounting
  useEffect(() => {
    return () => {
      if (pendingPreview?.startsWith("blob:")) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  const handlePick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    attachFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const pastedFile = items
      .find((item) => item.kind === "file" && (item.type.startsWith("image/") || item.type === "application/pdf"))
      ?.getAsFile();
    if (!pastedFile) return;

    e.preventDefault();
    const extension = pastedFile.type === "application/pdf" ? "pdf" : pastedFile.type.split("/")[1] || "png";
    const namedFile = pastedFile.name
      ? pastedFile
      : new File([pastedFile], `pasted-${Date.now()}.${extension}`, { type: pastedFile.type });
    if (attachFile(namedFile)) toast.success("Copied file attach ho gayi");
  };

  const clearPending = () => {
    if (pendingPreview?.startsWith("blob:")) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  };

  const handleSend = async () => {
    if (!pendingFile || busy) return;
    const file = pendingFile;
    const currentPrompt = prompt.trim();
    const loadingId = crypto.randomUUID();
    setPrompt("");
    setPendingFile(null);
    setPendingPreview(null);
    setBusy(true);

    try {
      const dataUrl = await readAsDataUrl(file);
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        fileName: file.name,
        fileType: file.type,
        previewUrl: file.type.startsWith("image/") ? dataUrl : undefined,
        prompt: currentPrompt || undefined,
      };
      setMessages((m) => [
        ...m,
        userMsg,
        { id: loadingId, role: "assistant", text: "", loading: true },
      ]);

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
          msg.id === loadingId
            ? { ...msg, text: text || "Kuch nahi mila.", loading: false }
            : msg
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Extraction failed";
      toast.error(message);
      setMessages((m) => m.filter((msg) => msg.id !== loadingId));
    } finally {
      if (pendingPreview?.startsWith("blob:")) URL.revokeObjectURL(pendingPreview);
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

  return (
    <AppShell
      title="Extract Bot"
      subtitle="Image/PDF → accurate text"
      active="/extract"
      onClear={handleClear}
      showClear={messages.length > 0}
    >
      <WorkspaceHeader
        icon={FileText}
        eyebrow="Document operations"
        title="Data Extraction"
        description="Upload an image or PDF, add optional instructions, and review clean extracted text."
        meta={["Paste", "Images", "PDF", "15 MB max"]}
      />
      <Conversation className="flex-1">
        <ConversationContent className="gap-4 px-0 pb-3 pt-3 sm:gap-6 sm:pb-4 sm:pt-5">
          {messages.length === 0 ? <EmptyState /> : null}

          {messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <ChatMessage key={msg.id} from="user">
                  <ChatMessageContent>
                    <div className="flex flex-col gap-2">
                      {msg.previewUrl && msg.fileType.startsWith("image/") ? (
                        <img
                          src={msg.previewUrl}
                          alt={msg.fileName}
                          loading="lazy"
                          className="max-h-64 rounded-xl border border-border/60 object-contain"
                        />
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs">
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate">{msg.fileName}</span>
                        </div>
                      )}
                      {msg.prompt ? <p className="text-sm">{msg.prompt}</p> : null}
                    </div>
                  </ChatMessageContent>
                </ChatMessage>
              );
            }
            return (
              <ChatMessage key={msg.id} from="assistant">
                {msg.loading || !msg.text ? (
                  <ChatMessageContent>
                    <Shimmer>Text extract ho rahi hai...</Shimmer>
                  </ChatMessageContent>
                ) : (
                  <ResultCard text={msg.text} label="Extracted text" />
                )}
              </ChatMessage>
            );
          })}
        </ConversationContent>
        <ScrollToEnd count={messages.length} />
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 bg-background/95 pb-2 pt-2 backdrop-blur-sm sm:pb-4 sm:pt-3">
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20">
          {pendingFile ? (
            <div className="m-3 mb-0 flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 p-2">
              {pendingPreview ? (
                <img
                  src={pendingPreview}
                  alt={pendingFile.name}
                  className="h-12 w-12 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-background text-[10px] font-bold text-primary">
                  PDF
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{pendingFile.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(pendingFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={clearPending}
                aria-label="Remove file"
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Image/PDF yahan paste karein, ya optional instruction likhein"
            disabled={busy}
            rows={2}
            aria-label="Extraction instructions"
            className="min-h-16 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground sm:min-h-20 sm:px-4 sm:py-3"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-2 sm:px-3 sm:py-3">
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
              className="gap-1.5 border-border bg-card"
            >
              <Paperclip className="h-4 w-4" />
              {pendingFile ? "Change" : "Attach"}
            </Button>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <ClipboardPaste className="size-3.5" /> Ctrl+V se paste
            </span>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!pendingFile || busy}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" />
              {busy ? "Extracting..." : "Extract"}
            </Button>
          </div>
        </div>
        <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">
          Image ya PDF paste/attach karein → text extract ho jayegi.
        </p>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="glass-panel mx-auto mt-2 flex w-full max-w-3xl flex-col items-center rounded-2xl border-dashed p-5 text-center sm:p-12">
      <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground sm:size-12"><FileText className="size-5 sm:size-6" /></span>
      <h3 className="mt-3 font-display text-base font-bold text-foreground sm:mt-4 sm:text-lg">No document selected</h3>
      <p className="mt-1.5 max-w-md text-[13px] leading-5 text-muted-foreground sm:mt-2 sm:text-sm sm:leading-6">Copy-paste or attach a screenshot, receipt, order slip or PDF to extract readable Urdu, Roman Urdu or English text.</p>
    </div>
  );
}
