import logoUrl from "@/assets/logo.png";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

const TABS = [
  { to: "/", label: "Order" },
  { to: "/invoice", label: "Invoice" },
  { to: "/extract", label: "Extract" },
  { to: "/rates", label: "Rates" },
] as const;

type AppShellProps = {
  title: string;
  subtitle: string;
  active: "/" | "/invoice" | "/extract" | "/rates";
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
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/60 bg-surface-2 shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
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
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              {showClear && onClear ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                  className="h-8 shrink-0 gap-1.5 rounded-full border-border/70 bg-surface-2 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New chat</span>
                </Button>
              ) : (
                <span className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-surface-2 px-3 py-1 text-[11px] text-muted-foreground sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Online
                </span>
              )}
            </div>
          </div>


          <nav className="mt-3 flex">
            {TABS.map((tab) => {
              const isActive = tab.to === active;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    "flex-1 border-b-[3px] px-3 pb-2 pt-1.5 text-center text-xs font-semibold uppercase tracking-wide transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-3 sm:px-4">
        {children}
      </main>
    </div>
  );
}
