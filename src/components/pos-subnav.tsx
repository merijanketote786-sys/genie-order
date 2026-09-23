import { Link } from "@tanstack/react-router";
import { usePosAccess } from "@/components/pos-access";
import type { PosPerm } from "@/lib/pos-access.functions";
import { Settings2, BarChart3, Boxes, BookOpen, Notebook, Receipt, Truck, Undo2, ShoppingCart, Users } from "lucide-react";

const ITEMS = [
  { to: "/pos", label: "Billing", icon: ShoppingCart, perm: "view_pos" },
  { to: "/returns", label: "Returns", icon: Undo2, perm: "create_sale" },
  { to: "/purchases", label: "Purchases", icon: Truck, perm: "manage_purchases" },
  { to: "/suppliers", label: "Suppliers", icon: Users, perm: "manage_purchases" },
  { to: "/ledger", label: "Udhaar", icon: BookOpen, perm: "view_balances" },
  { to: "/expenses", label: "Expenses", icon: Receipt, perm: "manage_expenses" },
  { to: "/daybook", label: "Day Book", icon: Notebook, perm: "view_reports" },
  { to: "/inventory", label: "Inventory", icon: Boxes, perm: "edit_stock" },
  { to: "/reports", label: "Reports", icon: BarChart3, perm: "view_reports" },
  { to: "/pos-settings", label: "Staff & Settings", icon: Settings2, perm: "view_pos" },
] as const satisfies ReadonlyArray<{ to: string; label: string; icon: unknown; perm: PosPerm }>;

/** POS module ke andar tez navigation. */
export function PosSubnav() {
  const { can } = usePosAccess();
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
      {ITEMS.filter((i) => can(i.perm)).map((i) => (
        <Link
          key={i.to}
          to={i.to}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          activeProps={{ className: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" }}
        >
          <i.icon className="size-4" /> {i.label}
        </Link>
      ))}
    </nav>
  );
}

export const posInput = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
export const PAY_OPTS = ["Cash", "Bank", "JazzCash", "Easypaisa", "Card", "Other"];
export const rs = (n: number) => `Rs ${(Math.round(n * 100) / 100 + 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
