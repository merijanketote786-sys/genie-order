import { Link } from "@tanstack/react-router";
import { BarChart3, Boxes, BookOpen, Notebook, Receipt, Truck, Undo2, ShoppingCart, Users } from "lucide-react";

const ITEMS = [
  { to: "/pos", label: "Billing", icon: ShoppingCart },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/purchases", label: "Purchases", icon: Truck },
  { to: "/suppliers", label: "Suppliers", icon: Users },
  { to: "/ledger", label: "Udhaar", icon: BookOpen },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/daybook", label: "Day Book", icon: Notebook },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

/** POS module ke andar tez navigation. */
export function PosSubnav() {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
      {ITEMS.map((i) => (
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
export const rs = (n: number) => `Rs ${(Math.round(n * 100) / 100).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
