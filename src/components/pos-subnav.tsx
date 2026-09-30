import { Link, useRouterState } from "@tanstack/react-router";
import { usePosAccess } from "@/components/pos-access";
import { Button } from "@/components/ui/button";
import type { PosPerm } from "@/lib/pos-access.functions";
import { LayoutDashboard, Landmark, Settings2, BarChart3, Boxes, BookOpen, Notebook, Receipt, Truck, Undo2, ShoppingCart, Users, FileCheck2, ArrowLeft } from "lucide-react";

const ITEMS = [
  { to: "/pos-dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "view_pos" },
  { to: "/pos", label: "Billing", icon: ShoppingCart, perm: "view_pos" },
  { to: "/returns", label: "Returns", icon: Undo2, perm: "create_sale" },
  { to: "/purchases", label: "Purchases", icon: Truck, perm: "manage_purchases" },
  { to: "/suppliers", label: "Parties", icon: Users, perm: "manage_purchases" },
  { to: "/ledger", label: "Credit", icon: BookOpen, perm: "view_balances" },
  { to: "/expenses", label: "Expenses", icon: Receipt, perm: "manage_expenses" },
  { to: "/daybook", label: "Day Book", icon: Notebook, perm: "view_reports" },
  { to: "/inventory", label: "Inventory", icon: Boxes, perm: "edit_stock" },
  { to: "/reports", label: "Reports", icon: BarChart3, perm: "view_reports" },
  { to: "/pos-invoices", label: "Invoices", icon: FileCheck2, perm: "view_pos" },
  { to: "/accounting", label: "Accounting", icon: Landmark, perm: "view_accounting" },
  { to: "/pos-settings", label: "POS Settings", icon: Settings2, perm: "view_pos" },
] as const satisfies ReadonlyArray<{ to: string; label: string; icon: unknown; perm: PosPerm }>;

/** Shared POS navigation, displayed in the app shell rather than on every page. */
export function PosSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = usePosAccess();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="POS navigation">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase text-sidebar-muted">POS</p>
        {ITEMS.filter((i) => can(i.perm)).map((i) => {
          const active = pathname === i.to;
          return (
            <Link key={i.to} to={i.to} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"}`}>
              <i.icon className="size-4 shrink-0" /> {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Button asChild variant="ghost" className="w-full justify-start text-sidebar-foreground">
          <Link to="/dashboard" onClick={onNavigate}><ArrowLeft className="size-4" /> Workspace</Link>
        </Button>
      </div>
    </div>
  );
}

/** Kept for existing POS pages; the shell now renders their navigation once. */
export function PosSubnav() { return null; }

export const posInput = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
export const PAY_OPTS = ["Cash", "Bank", "JazzCash", "Easypaisa", "Card", "Other"];
export const rs = (n: number) => `Rs ${(Math.round(n * 100) / 100 + 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
