import { useEffect, useRef, useState } from "react";
import { ItemsDialog } from "@/components/items-dialog";
import { AttendanceDialog } from "@/components/attendance";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { usePosAccess } from "@/components/pos-access";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { PosPerm } from "@/lib/pos-access.functions";
import { LayoutDashboard, Landmark, Settings2, BarChart3, Boxes, BookOpen, Notebook, Receipt, Truck, Undo2, ShoppingCart, Users, FileCheck2, ArrowLeft, Package, CalendarCheck, ClipboardList, GripVertical, Search } from "lucide-react";

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

const KEYWORDS: Record<string, string> = {
  "/pos-dashboard": "home quick actions overview summary units categories cash in hand",
  "/pos": "sale bill billing new sale invoice counter checkout",
  "/returns": "sale return refund credit note purchase return",
  "/purchases": "purchase buy supplier stock in bill",
  "/parties": "customers suppliers party balance statement payment in out",
  "/ledger": "credit udhaar receivable payable balances",
  "/expenses": "expense kharcha spending",
  "/attendance": "attendance labour salary staff",
  "/daybook": "day book daily cash in hand closing",
  "/inventory": "inventory stock bulk update products items csv adjust",
  "/reports": "reports profit sales report stock summary",
  "/pos-invoices": "invoices estimates delivery challan reprint",
  "/accounting": "accounting ledger bank accounts balance sheet profit loss",
  "/pos-settings": "settings printing backup restore permissions",
  items: "items products stock price",
  "attendance-mark": "mark attendance check in",
};
// Every feature inside POS pages, so search finds it from anywhere.
const FEATURES: { label: string; to: string; kw: string }[] = [
  { label: "New sale / invoice", to: "/pos", kw: "bill sale invoice counter checkout new" },
  { label: "Barcode scan", to: "/pos", kw: "barcode scanner scan item code" },
  { label: "Estimate / quotation", to: "/pos", kw: "estimate quotation quote" },
  { label: "Credit (udhaar) sale", to: "/pos", kw: "credit udhaar sale party" },
  { label: "Discount & tax on bill", to: "/pos", kw: "discount tax gst charges" },
  { label: "Print / PDF / WhatsApp bill", to: "/pos", kw: "print pdf whatsapp share receipt thermal" },
  { label: "Hold bill", to: "/pos", kw: "hold park draft" },
  { label: "Quick actions", to: "/pos-dashboard", kw: "quick actions shortcuts popup" },
  { label: "Units (main & sub)", to: "/pos-dashboard", kw: "units unit kg gram litre conversion sub unit" },
  { label: "Categories", to: "/pos-dashboard", kw: "category categories group" },
  { label: "Manufacturing", to: "/pos-dashboard", kw: "manufacture manufacturing production raw material finished goods" },
  { label: "Payment In", to: "/pos-dashboard", kw: "payment in receive received collection" },
  { label: "Payment Out", to: "/pos-dashboard", kw: "payment out pay paid supplier" },
  { label: "Sales summary", to: "/pos-dashboard", kw: "today sales summary overview stats" },
  { label: "Sale return", to: "/returns", kw: "sale return refund credit note" },
  { label: "Bill-free return", to: "/returns", kw: "return without bill free" },
  { label: "New purchase", to: "/purchases", kw: "purchase buy stock in supplier bill" },
  { label: "Purchase return", to: "/purchases", kw: "purchase return debit note" },
  { label: "Purchase history / edit / cancel", to: "/purchases", kw: "purchase history edit cancel reprint" },
  { label: "Add / edit party", to: "/parties", kw: "add party customer supplier contact phone" },
  { label: "Adjust party balance", to: "/parties", kw: "opening balance adjust to receive to pay" },
  { label: "Party transactions / statement", to: "/parties", kw: "statement transactions history party ledger" },
  { label: "WhatsApp reminder", to: "/parties", kw: "whatsapp reminder message" },
  { label: "Receivables & payables", to: "/ledger", kw: "udhaar credit receivable payable due balance" },
  { label: "Add expense", to: "/expenses", kw: "expense kharcha rent bill electricity spending" },
  { label: "Staff attendance & salary", to: "/attendance", kw: "attendance staff labour salary employee" },
  { label: "Day book entry (money in/out)", to: "/daybook", kw: "day book entry money in out daily hisab" },
  { label: "Cash in hand count", to: "/daybook", kw: "cash in hand galla till count closing adjust" },
  { label: "Bulk update items", to: "/inventory", kw: "bulk update edit price items" },
  { label: "CSV import prices", to: "/inventory", kw: "csv import excel upload price" },
  { label: "Add / edit product", to: "/inventory", kw: "add product item new edit" },
  { label: "Stock adjustment", to: "/inventory", kw: "stock adjust adjustment quantity" },
  { label: "Low / out of stock", to: "/inventory", kw: "low stock min stock out of stock reorder" },
  { label: "Stores / stock transfer", to: "/inventory", kw: "store stores branch transfer" },
  { label: "Barcode labels", to: "/inventory", kw: "barcode label print sticker" },
  { label: "Sales report", to: "/reports", kw: "sales report daily monthly" },
  { label: "Profit & loss", to: "/reports", kw: "profit loss margin p&l" },
  { label: "Stock summary report", to: "/reports", kw: "stock summary value report" },
  { label: "Invoices list", to: "/pos-invoices", kw: "invoices list search history" },
  { label: "Estimates", to: "/pos-invoices", kw: "estimate quotation convert" },
  { label: "Delivery challan", to: "/pos-invoices", kw: "delivery challan dc convert" },
  { label: "Edit / cancel / reprint invoice", to: "/pos-invoices", kw: "edit cancel reprint duplicate invoice" },
  { label: "Bank accounts", to: "/accounting", kw: "bank account add adjust balance jazzcash easypaisa" },
  { label: "Chart of accounts / journal", to: "/accounting", kw: "chart accounts journal entry double entry" },
  { label: "Balance sheet / trial balance", to: "/accounting", kw: "balance sheet trial balance" },
  { label: "Print / invoice design settings", to: "/pos-settings", kw: "print printing invoice design font template logo" },
  { label: "Backup & restore", to: "/pos-settings", kw: "backup restore download save computer" },
  { label: "Users & permissions", to: "/pos-settings", kw: "users permissions roles access pin" },
  { label: "Invoice numbering", to: "/pos-settings", kw: "numbering prefix invoice number" },
  { label: "Custom charges", to: "/pos-settings", kw: "custom charges delivery fee freight" },
];

const LABELS: Record<string, string> = { items: "Items", "attendance-mark": "Mark attendance" };

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
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]"); if (Array.isArray(s)) setOrder(s); } catch { /* ignore */ }
    // Account-level order (saved on the signed-in user) wins over the local copy.
    void supabase.auth.getUser().then(({ data }) => {
      const s = (data.user?.user_metadata as { pos_sidebar_order?: unknown } | undefined)?.pos_sidebar_order;
      if (Array.isArray(s)) { setOrder(s as string[]); try { localStorage.setItem(ORDER_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
    });
  }, []);

  const visible = [
    ...ITEMS.filter((i) => can(i.perm) && (i.to !== "/attendance" || attOn)).map((i) => i.to as string),
    ...(can("view_pos") ? ["items"] : []),
    ...(attOn && can("manage_expenses") ? ["attendance-mark"] : []),
  ];
  const label = (k: string) => LABELS[k] ?? ITEMS.find((x) => x.to === k)?.label ?? k;
  const ql = q.trim().toLowerCase();
  const keys = sortByOrder(visible, order).filter((k) => !ql || `${label(k)} ${KEYWORDS[k] ?? ""}`.toLowerCase().includes(ql));
  const words = ql.split(/\s+/).filter(Boolean);
  const hit = (t: string) => words.every((w) => t.toLowerCase().includes(w));
  const featHits = ql ? FEATURES.filter((f) => visible.includes(f.to) && hit(`${f.label} ${f.kw} ${label(f.to)}`)).slice(0, 20) : [];
  const openKey = (k: string) => {
    setQ("");
    if (k === "items") setItemsOpen(true);
    else if (k === "attendance-mark") setAttOpen(true);
    else { void navigate({ to: k }); onNavigate?.(); }
  };
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
      void supabase.auth.updateUser({ data: { pos_sidebar_order: orderRef.current } });
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };

  const rowCls = "flex min-h-11 flex-1 items-center gap-3 rounded-md px-2 text-sm font-semibold transition-colors";
  const idle = "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="POS navigation">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-sidebar-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features..." aria-label="Search POS features"
            onKeyDown={(e) => { if (e.key === "Enter" && (keys[0] || featHits[0])) { e.preventDefault(); openKey(keys[0] ?? featHits[0].to); } else if (e.key === "Escape") setQ(""); }}
            className="h-10 w-full rounded-lg border border-sidebar-border bg-background pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary" />
        </div>
        {ql && !keys.length && !featHits.length ? <p className="px-3 text-xs text-sidebar-muted">No feature found</p> : null}
        {keys.map((k) => {
          let body: React.ReactNode;
          if (k === "items") {
            body = <button type="button" onClick={() => openKey("items")} className={`${rowCls} ${idle} text-left`}><Package className="size-4 shrink-0" /> Items</button>;
          } else if (k === "attendance-mark") {
            body = <button type="button" onClick={() => openKey("attendance-mark")} className={`${rowCls} ${idle} text-left`}><CalendarCheck className="size-4 shrink-0" /> Mark attendance</button>;
          } else {
            const i = ITEMS.find((x) => x.to === k)!;
            const active = pathname === i.to;
            body = (
              <Link to={i.to} onClick={() => { setQ(""); onNavigate?.(); }} aria-current={active ? "page" : undefined}
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
        {featHits.length ? (
          <div className="mt-3 space-y-0.5 border-t border-sidebar-border pt-2">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">Features</p>
            {featHits.map((f, n) => (
              <button key={n} type="button" onClick={() => openKey(f.to)} className={`${rowCls} ${idle} w-full text-left`}>
                <Search className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block truncate">{f.label}</span><span className="block text-[11px] font-normal text-sidebar-muted">in {label(f.to)}</span></span>
              </button>
            ))}
          </div>
        ) : null}
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
