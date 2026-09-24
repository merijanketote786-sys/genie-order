import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import { CornerDownLeft, Loader2 } from "lucide-react";
import {
  forwardRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";

export function ChatMessage({
  from,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" | "system" }) {
  return (
    <div
      className={cn(
        "flex w-full max-w-[95%] flex-col gap-2",
        from === "user" ? "ml-auto items-end" : "items-start",
        className,
      )}
      {...props}
    />
  );
}

export function ChatMessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bubble-out w-fit min-w-0 max-w-full overflow-hidden px-4 py-3 text-sm text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function PlainMessageText({ children }: { children: string }) {
  return <p className="whitespace-pre-wrap break-words leading-6">{children}</p>;
}

type ChatComposerProps = {
  onSubmit: (message: { text: string }) => void | Promise<void>;
  status?: ChatStatus;
  disabled?: boolean;
  placeholder: string;
  textareaClassName?: string;
  /** Optional controlled value (e.g. to insert text from the rate calculator). */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Whether Enter submits, or only the send button does. Default true. */
  submitOnEnter?: boolean;
};

export const ChatComposer = forwardRef<HTMLTextAreaElement, ChatComposerProps>(
  (
    { onSubmit, status, disabled, placeholder, textareaClassName, value: controlled, onValueChange, submitOnEnter = true },
    ref,
  ) => {
    const [inner, setInner] = useState("");
    const value = controlled ?? inner;
    const setValue = (next: string) => {
      if (onValueChange) onValueChange(next);
      else setInner(next);
    };
    const busy = disabled || status === "submitted" || status === "streaming";

    const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = value.trim();
      if (!text || busy) return;
      await onSubmit({ text });
      setValue("");
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!submitOnEnter) return;
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    };

    return (
      <form onSubmit={submit} className="grid" aria-label="Chat message">
        <textarea
          ref={ref}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={busy}
          className={cn(
            "w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60",
            textareaClassName,
          )}
        />
        <div className="flex justify-end px-2 pb-2 sm:px-3 sm:pb-3">
          <Button
            type="submit"
            size="icon-sm"
            disabled={busy || value.trim().length === 0}
            aria-label={busy ? "Processing" : "Submit"}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
          </Button>
        </div>
      </form>
    );
  },
);

ChatComposer.displayName = "ChatComposer";