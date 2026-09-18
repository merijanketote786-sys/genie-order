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
import { Link } from "@tanstack/react-router";
import { Grid2X2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type WorkspacePath =
  | "/"
  | "/invoice"
  | "/extract"
  | "/rates"
  | "/calculator"
  | "/history"
  | "/invoices"
  | "/customers"
  | "/sync"
  | "/settings"
  | "/admin";

type NavItem = { to: WorkspacePath; label: string; description: string; icon: LucideIcon };

export function WorkspaceNavDialog({ tabs, active }: { tabs: readonly NavItem[]; active: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-14 w-full min-w-0 flex-col gap-1 rounded-lg px-2 text-[10px] text-muted-foreground">
          <Grid2X2 className="size-4.5" />
          More
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] w-full gap-0 overflow-y-auto p-0 sm:max-w-lg sm:rounded-xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="font-display text-base">All sections</DialogTitle>
          <DialogDescription>Jis workspace ki zaroorat ho usay kholein.</DialogDescription>
        </DialogHeader>
        <nav className="grid grid-cols-3 gap-2 p-4" aria-label="All workspace sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.to === active;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-accent",
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="max-w-full truncate text-xs font-semibold">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </DialogContent>
    </Dialog>
  );
}