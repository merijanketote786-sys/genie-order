import logoUrl from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

const TABS = [
  { to: "/", label: "Order" },
  { to: "/invoice", label: "Invoice" },
  { to: "/extract", label: "Extract" },
] as const;

type AppShellProps = {
  title: string;
  subtitle: string;
  active: "/" | "/invoice" | "/extract";
  onClear?: () => void;
  showClear?: boolean;
  children: ReactNode;
};

export function AppShell({
  title,
  subtitle,
  active,
  onClear,
  showClear,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-surface-2 shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 pt-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="brand-glow grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2">
                <img
                  src={logoUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full object-contain"
                />
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-display text-[15px] font-bold leading-tight tracking-tight text-foreground">
                  {title}
                </h1>
                <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            {showClear && onClear ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onClear}
                className="h-8 shrink-0 gap-1.5 rounded-full border-border/70 bg-surface-2/60 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New chat</span>
              </Button>
            ) : (
              <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-2/60 px-3 py-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Online
              </span>
            )}
          </div>

          <nav className="mt-3 flex gap-1 rounded-full border border-border/70 bg-surface/70 p-1">
            {TABS.map((tab) => {
              const isActive = tab.to === active;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    "flex-1 rounded-full px-3 py-1.5 text-center text-xs font-semibold transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 sm:px-4">
        {children}
      </main>
    </div>
  );
}
