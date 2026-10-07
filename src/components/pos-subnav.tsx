import { useEffect, useRef, useState } from "react";
import { ItemsDialog } from "@/components/items-dialog";
import { AttendanceDialog } from "@/components/attendance";
import { Link, useRouterState } from "@tanstack/react-router";
import { usePosAccess } from "@/components/pos-access";
import { Button } from "@/components/ui/button";
import type { PosPerm } from "@/lib/pos-access.functions";
import { LayoutDashboard, Landmark, Settings2, BarChart3, Boxes, BookOpen, Notebook, Receipt, Truck, Undo2, ShoppingCart, Users, FileCheck2, ArrowLeft, Package, CalendarCheck, ClipboardList, GripVertical } from "lucide-react";

const ITEMS = [
  { to: "/pos-dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "view_pos" },
  { to: "/pos", label: "Billing", icon: ShoppingCart, perm: "view_pos" },
  { to: "/returns", label: "Returns", icon: Undo2, perm: "create_sale" },
  { to: "/purchases", label: "Purchases", icon: Truck, perm: "manage_purchases" },
  { to: "/parties", label: "Parties", icon: Users, perm: "view_pos" },
  { to: "/ledger", label: "Credit", icon: BookOpen, perm: "view_balances" },
  { to: "/expenses", label: "Expenses", icon: Receipt, perm: "manage_expenses" },
  { to: "/attendance", label: "Attendance", icon: ClipboardList, perm: "manage_expenses" },
  { to: "/daybook", label: "Day Book", icon: Notebook, perm: "view_reports" },
  { to: "/inventory", label: "Inventory", icon: Boxes, perm: "edit_stock" },
  { to: "/reports", label: "Reports", icon: BarChart3, perm: "view_reports" },
  { to: "/pos-invoices", label: "Invoices", icon: FileCheck2, perm: "view_pos" },
  { to: "/accounting", label: "Accounting", icon: Landmark, perm: "view_accounting" },
  { to: "/pos-settings", label: "POS Settings", icon: Settings2, perm: "view_pos" },
] as const satisfies ReadonlyArray<{ to: string; label: string; icon: unknown; perm: PosPerm }>;

const ORDER_KEY = "pos-sidebar-order";
const ALL_KEYS = [...ITEMS.map((i) => i.to as string), "items", "attendance-mark"];

function sortByOrder(keys: string[], order: string[]) {
  const pos = (k: string) => { const i = order.indexOf(k); return i < 0 ? 1000 + ALL_KEYS.indexOf(k) : i; };
  return [...keys].sort((a, b) => pos(a) - pos(b));
}

/** Shared POS navigation, displayed in the app shell rather than on every page. */
export function PosSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can, config } = usePosAccess();
  const attOn = (config as unknown as { attendance?: { enabled?: boolean } }).attendance?.enabled !== false;
  const [attOpen, setAttOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [itemsOpen, setItemsOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const orderRef = useRef<string[]>([]);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]"); if (Array.isArray(s)) setOrder(s); } catch { /* ignore */ }
  }, []);

  const visible = [
    ...ITEMS.filter((i) => can(i.perm) && (i.to !== "/attendance" || attOn)).map((i) => i.to as string),
    ...(can("view_pos") ? ["items"] : []),
    ...(attOn && can("manage_expenses") ? ["attendance-mark"] : []),
  ];
  const keys = sortByOrder(visible, order);
  orderRef.current = sortByOrder(ALL_KEYS, order);

  const startDrag = (key: string, e: React.PointerEvent) => {
    e.preventDefault();
    setDragKey(key);
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-nav-key]") as HTMLElement | null;
      const over = el?.dataset.navKey;
      if (!over || over === key) return;
      const cur = [...orderRef.current];
      const from = cur.indexOf(key), to = cur.indexOf(over);
      if (from < 0 || to < 0) return;
      cur.splice(from, 1); cur.splice(to, 0, key);
      orderRef.current = cur; setOrder(cur);
    };
    const up = () => {
      setDragKey(null);
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(orderRef.current)); } catch { /* ignore */ }
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };

  const rowCls = "flex min-h-11 flex-1 items-center gap-3 rounded-md px-2 text-sm font-semibold transition-colors";
  const idle = "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="POS navigation">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase text-sidebar-muted">POS</p>
        {keys.map((k) => {
          let body: React.ReactNode;
          if (k === "items") {
            body = <button type="button" onClick={() => setItemsOpen(true)} className={`${rowCls} ${idle} text-left`}><Package className="size-4 shrink-0" /> Items</button>;
          } else if (k === "attendance-mark") {
            body = <button type="button" onClick={() => setAttOpen(true)} className={`${rowCls} ${idle} text-left`}><CalendarCheck className="size-4 shrink-0" /> Mark attendance</button>;
          } else {
            const i = ITEMS.find((x) => x.to === k)!;
            const active = pathname === i.to;
            body = (
              <Link to={i.to} onClick={onNavigate} aria-current={active ? "page" : undefined}
                className={`${rowCls} ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : idle}`}>
                <i.icon className="size-4 shrink-0" /> {i.label}
              </Link>
            );
          }
          return (
            <div key={k} data-nav-key={k} className={`flex items-center gap-0.5 rounded-md ${dragKey === k ? "bg-sidebar-accent/40 ring-1 ring-sidebar-border" : ""}`}>
              <span role="button" aria-label="Drag to reorder" title="Drag to move" onPointerDown={(e) => startDrag(k, e)}
                className="flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-sidebar-muted hover:text-sidebar-foreground active:cursor-grabbing">
                <GripVertical className="size-4" />
              </span>
              {body}
            </div>
          );
        })}
        <ItemsDialog open={itemsOpen} onOpenChange={setItemsOpen} />
        <AttendanceDialog open={attOpen} onOpenChange={setAttOpen} />
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
