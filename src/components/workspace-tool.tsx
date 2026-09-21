import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type WorkspaceToolProps = {
  icon: LucideIcon;
  label: string;
  title: string;
  description?: string;
  active?: boolean;
  children: ReactNode;
  contentClassName?: string;
};

export function WorkspaceTool({
  icon: Icon,
  label,
  title,
  description,
  active,
  children,
  contentClassName,
}: WorkspaceToolProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "relative h-16 w-full min-w-0 flex-col gap-1 rounded-lg px-1.5 text-xs text-muted-foreground sm:h-14 sm:px-2",
            active && "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="size-5 shrink-0 sm:size-4.5" />
          <span className="max-w-full whitespace-normal text-center leading-tight">{label}</span>
          {active ? <span className="absolute right-2 top-2 size-1.5 rounded-full bg-success" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[88dvh] w-full gap-0 overflow-y-auto p-0 sm:max-w-xl sm:rounded-xl",
          contentClassName,
        )}
      >
        <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="font-display text-base">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="p-4 sm:p-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceToolDock({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm min-[480px]:grid-cols-4 lg:grid-cols-6">
      {children}
    </div>
  );
}