import logoUrl from "@/assets/logo.webp";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  Calculator,
  ClipboardList,
  FileCheck2,
  FileScan,
  History,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Shield,
  Tag,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMyAccess } from "@/lib/admin.functions";
import type { ReactNode } from "react";

const TABS = [
  { to: "/", label: "Order", description: "Format customer orders", icon: ClipboardList },
  { to: "/invoice", label: "Invoice", description: "Create item invoices", icon: ReceiptText },
  { to: "/extract", label: "Extract", description: "Read images and PDFs", icon: FileScan },
  { to: "/rates", label: "Rates", description: "Search staff prices", icon: Tag },
  { to: "/calculator", label: "Calculator", description: "Courier charges calculate", icon: Calculator },
  { to: "/history", label: "History", description: "Saved orders record", icon: History },
  { to: "/invoices", label: "Invoices", description: "Invoice record aur status", icon: FileCheck2 },
  { to: "/customers", label: "Customers", description: "Customer record", icon: Users },
  { to: "/sync", label: "Sync", description: "Vyapar rates update", icon: RefreshCw },
] as const;

const ADMIN_TAB = {
  to: "/admin",
  label: "Admin",
  description: "Users aur access",
  icon: Shield,
} as const;

type AppShellProps = {
  title: string;
  subtitle: string;
  active:
    | "/"
    | "/invoice"
    | "/extract"
    | "/rates"
    | "/calculator"
    | "/history"
    | "/invoices"
    | "/customers"
    | "/sync"
    | "/admin";
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
  const access = useQuery({
    queryKey: ["my-access"],
    queryFn: () => getMyAccess(),
    staleTime: 5 * 60 * 1000,
  });
  const tabs = access.data?.isOwner ? [...TABS, ADMIN_TAB] : [...TABS];

  return (
    <div className="grid h-[100dvh] min-h-0 overflow-hidden bg-background lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-sidebar-border bg-card">
            <img src={logoUrl} alt="HB Chemicals Pakistan" width={40} height={40} className="size-full object-contain" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase text-sidebar-muted">HB Chemicals Pakistan</p>
            <p className="truncate font-display text-base font-bold text-sidebar-foreground">OrderBot</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Main navigation">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase text-sidebar-muted">Operations</p>
          {tabs.map((tab) => {
            const isActive = tab.to === active;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "grid min-h-14 grid-cols-[36px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
              >
                <span className={cn("grid size-9 place-items-center rounded-md", isActive && "bg-sidebar-primary text-sidebar-primary-foreground")}>
                  <Icon className="size-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{tab.label}</span>
                  <span className="block truncate text-[11px] text-sidebar-muted">{tab.description}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-3 py-2.5">
            <span className="size-2 shrink-0 rounded-full bg-success" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground">System online</p>
              <p className="truncate text-[10px] text-sidebar-muted">Ready for operations</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="shrink-0 border-b border-border bg-surface/95 backdrop-blur-sm">
          <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 sm:min-h-16 sm:gap-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-card">
                <img
                  src={logoUrl}
                  alt="HB Chemicals Pakistan"
                  width={32}
                  height={32}
                  loading="eager"
                  decoding="async"
                  className="size-full object-contain"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[9px] font-bold uppercase text-muted-foreground">HB Chemicals Pakistan</p>
                <p className="truncate font-display text-sm font-bold text-foreground">OrderBot</p>
              </div>
            </div>
            <div className="hidden min-w-0 lg:block">
              <h1 className="truncate font-display text-xl font-bold text-foreground">{title}</h1>
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <SignOutButton />
              {showClear && onClear ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                  className="h-10 shrink-0 gap-1.5 border-border bg-card text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New chat</span>
                </Button>
              ) : (
                <span className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex lg:hidden">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Online
                </span>
              )}
            </div>
          </div>

          <nav
            className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border px-3 py-2.5 lg:hidden"
            aria-label="Main navigation"
          >
            {tabs.map((tab) => {
              const isActive = tab.to === active;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-surface-2 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col px-2.5 pb-[env(safe-area-inset-bottom)] sm:px-6 lg:px-8">
          {access.data && access.data.isActive === false ? (
            <div className="glass-panel my-6 rounded-3xl px-4 py-10 text-center">
              <h2 className="font-display text-base font-bold text-foreground">Access band hai</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Aapka account admin ne block kar diya hai. Rabta karein: hhtraders008@gmail.com
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </section>
    </div>
  );
}
