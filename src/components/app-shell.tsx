import logoUrl from "@/assets/logo.webp";
import { FontSizeControl } from "@/components/font-size-control";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { WorkspaceNavDialog } from "@/components/workspace-nav-dialog";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  Calculator,
  ClipboardList,
  FileCheck2,
  FileScan,
  FileSignature,
  History,
  LayoutDashboard,
  QrCode,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Settings2,
  Shield,
  Tag,
  Users,
  ShoppingCart,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMyAccess } from "@/lib/admin.functions";
import { getMySettings } from "@/lib/settings.functions";
import { isSectionAllowed } from "@/lib/settings";
import type { ReactNode } from "react";

const TABS = [
  { to: "/dashboard", label: "Dashboard", description: "Full progress at a glance", icon: LayoutDashboard },
  { to: "/", label: "Order", description: "Format customer orders", icon: ClipboardList },
  { to: "/invoice", label: "Invoice", description: "Create item invoices", icon: ReceiptText },
  { to: "/pos", label: "POS", description: "Counter billing and receipt", icon: ShoppingCart },
  { to: "/confirmation", label: "Confirm", description: "Order proforma and WhatsApp", icon: FileSignature },
  { to: "/extract", label: "Extract", description: "Read images and PDFs", icon: FileScan },
  { to: "/rates", label: "Rates", description: "Search staff prices", icon: Tag },
  { to: "/calculator", label: "Calculator", description: "Courier charges calculate", icon: Calculator },
  { to: "/history", label: "History", description: "Saved orders record", icon: History },
  { to: "/invoices", label: "Invoices", description: "Invoice records and status", icon: FileCheck2 },
  { to: "/customers", label: "Customers", description: "Customer record", icon: Users },
  { to: "/labels", label: "Labels", description: "Barcode labels print", icon: QrCode },
  { to: "/sync", label: "Sync", description: "Update trade rates", icon: RefreshCw },
] as const;

const ADMIN_TAB = {
  to: "/admin",
  label: "Admin",
  description: "Users and access",
  icon: Shield,
} as const;

const SETTINGS_TAB = {
  to: "/settings",
  label: "Settings",
  description: "My personal settings",
  icon: Settings2,
} as const;

type AppShellProps = {
  title: string;
  subtitle: string;
  active:
    | "/"
    | "/dashboard"
    | "/invoice"
    | "/pos"
    | "/confirmation"
    | "/extract"
    | "/rates"
    | "/calculator"
    | "/history"
    | "/invoices"
    | "/customers"
    | "/labels"
    | "/sync"
    | "/settings"
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
  const mine = useQuery({
    queryKey: ["my-settings"],
    queryFn: () => getMySettings(),
    staleTime: 5 * 60 * 1000,
  });
  const userAllowed = mine.data?.settings.allowedSections ?? [];
  const workspaceAllowed = mine.data?.workspace.allowedSections ?? [];
  const visibleTabs = TABS.filter((tab) => isSectionAllowed(tab.to, userAllowed, workspaceAllowed));
  const tabs = access.data?.isOwner
    ? [...visibleTabs, SETTINGS_TAB, ADMIN_TAB]
    : [...visibleTabs, SETTINGS_TAB];
  const primaryTabs = visibleTabs.slice(0, 4);

  return (
    <div className="grid h-[100dvh] min-h-0 overflow-hidden bg-background xl:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-border bg-sidebar xl:flex">
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-sidebar-border bg-card">
            <img src={logoUrl} alt="HB Chemicals Pakistan" width={40} height={40} className="size-full object-contain" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase text-sidebar-muted">Workspace</p>
            <p className="truncate font-display text-base font-bold text-sidebar-foreground">HB Chemicals Pakistan</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
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
                    "grid min-h-11 grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
              >
                <span className={cn("grid size-7 place-items-center rounded-md", isActive && "bg-sidebar-primary text-sidebar-primary-foreground")}>
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
            <div className="flex min-w-0 items-center gap-2.5 xl:hidden">
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
                 <p className="truncate font-display text-sm font-bold text-foreground">{title}</p>
              </div>
            </div>
            <div className="hidden min-w-0 xl:block">
              <h1 className="truncate font-display text-xl font-bold text-foreground">{title}</h1>
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <FontSizeControl />
              <Button
                variant="outline"
                size="icon"
                onClick={() => window.location.reload()}
                  className="size-10 shrink-0 border-border bg-card max-[380px]:hidden"
                title="Refresh workspace (your data stays safe)"
                aria-label="Refresh workspace"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
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
                <span className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground lg:flex xl:hidden">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Online
                </span>
              )}
            </div>
          </div>

        </header>

        <main className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col overflow-y-auto px-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-5 xl:px-8 xl:pb-0">
          {access.data && access.data.isActive === false ? (
            <div className="glass-panel my-6 rounded-3xl px-4 py-10 text-center">
              <h2 className="font-display text-base font-bold text-foreground">Access blocked</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your account has been blocked by the admin. Contact: hhtraders008@gmail.com
              </p>
            </div>
          ) : (
            children
          )}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg xl:hidden" aria-label="Mobile navigation">
          <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 p-1.5">
            {primaryTabs.map((tab) => {
              const isActive = tab.to === active;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4.5 shrink-0" />
                  <span className="max-w-full truncate">{tab.label}</span>
                </Link>
              );
            })}
            <WorkspaceNavDialog tabs={tabs} active={active} />
          </div>
        </nav>
      </section>
    </div>
  );
}
