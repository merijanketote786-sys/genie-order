import { PosCustomerSearch } from "@/components/pos-customer-search";
import { PosSubnav } from "@/components/pos-subnav";
import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { getProducts, type DbProduct } from "@/lib/products.functions";
import { getMySettings } from "@/lib/settings.functions";
import { closePosDoc, getCustomerBalance, listPosDocs, savePosDoc } from "@/lib/pos.functions";
import {
  PAY_METHODS,
  PRINTER_PRESETS,
  RATE_TYPES,
  TAX_RATES,
  downloadReceiptPdf,
  lineTax,
  lineTotal,
  money,
  packLabel,
  priceFor,
  printReceipt,
  receiptHtml,
  receiptText,
  stockDeduction,
  totals,
  type CartLine,
  type PayMethod,
  type PaymentPart,
  type RateType,
  type ReceiptInput,
  type ReceiptPrinter,
} from "@/lib/pos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Minus, Plus, Printer, ScanBarcode, ShoppingCart, Trash2, MessageCircle, LayoutGrid, Settings2, ReceiptText, Save, StickyNote, Pause, FileText, FolderOpen, RotateCcw, Download, Share2, X } from "lucide-react";

type PosDocRow = { id: string; doc_number: string; customer_name: string | null; customer_phone: string | null; grand_total: number; created_at: string; payload: string | null; status: string };

function DocsList({ kind, onClose, onOpen }: { kind: "held" | "quotation"; onClose: () => void; onOpen: (d: PosDocRow, asInvoice: boolean) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["pos-docs", kind], queryFn: () => listPosDocs({ data: { docType: kind } }) });
  const docs = (data?.docs ?? []) as PosDocRow[];
  const close = async (id: string) => {
    await closePosDoc({ data: { id } });
    qc.invalidateQueries({ queryKey: ["pos-docs"] });
  };
  return (
    <div className="rounded-xl border border-primary p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">{kind === "held" ? "Held bills" : "Quotations"}</p>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Band"><X /></Button>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Load ho raha hai…</p> : null}
      {!isLoading && !docs.length ? <p className="text-xs text-muted-foreground">Koi {kind === "held" ? "held bill" : "quotation"} nahi.</p> : null}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{d.doc_number} · {d.customer_name || "Walk-in"}</p>
              <p className="text-muted-foreground">Rs {money(d.grand_total)} · {new Date(d.created_at).toLocaleString("en-PK")}</p>
            </div>
            <Button size="sm" onClick={() => onOpen(d, true)}>{kind === "held" ? "Kholein" : "Invoice banayein"}</Button>
            <Button size="icon-sm" variant="ghost" onClick={() => close(d.id)} aria-label="Band karein"><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "POS Billing — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Counter aur phone sales ke liye tez POS invoicing, stock aur receipt printing." },
      { property: "og:title", content: "POS Billing — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Product scan karein, bill banayein, receipt print karein." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

const PRINTER_KEY = "pos-printer:v1";
const LINKS_KEY = "pos-barcode-links:v1";
const GRID_KEY = "pos-show-grid:v1";
const POS_VIEW_KEY = "pos-active-view:v1";
/** Labels section ke auto code jaisa base (naam ke pehle 10 harf). */
function labelBase(name: string) {
  return name
    .replace(/\s*\/\s*(kg|kilogram|g|gm|gram|ml|ltr|litre|liter|pcs|pc|piece|bottle)s?\b/gi, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10) || "ITEM";
}
const inputCls = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const n = (v: string) => {
  const x = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(x) ? x : 0;
};

function loadPrinter(): ReceiptPrinter {
  try {
    const raw = localStorage.getItem(PRINTER_KEY);
    if (raw) return { ...PRINTER_PRESETS[0], ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return PRINTER_PRESETS[0];
}

function PosPage() {
  const qc = useQueryClient();
  const { data: prodData } = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });
  const { data: me } = useQuery({ queryKey: ["my-settings"], queryFn: () => getMySettings() });
  const products = prodData?.products ?? [];

  const [rate, setRate] = useState<RateType>("sale");
  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [billDiscount, setBillDiscount] = useState("");
  const [discType, setDiscType] = useState<"amt" | "pct">("amt");
  const [delivery, setDelivery] = useState("");
  const [pays, setPays] = useState<{ method: PayMethod; amount: string }[]>([{ method: "Cash", amount: "" }]);
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<{ id: string; number: string } | null>(null);
  const [docsOpen, setDocsOpen] = useState<"held" | "quotation" | null>(null);
  const payRef = useRef<HTMLDivElement>(null);
  const pickCustomer = (c: { name: string | null; phone: string }) => {
    setCustomerName(c.name ?? "");
    setCustomerPhone(c.phone ?? "");
  };
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [printer, setPrinter] = useState<ReceiptPrinter>(PRINTER_PRESETS[0]);
  const [view, setView] = useState<"billing" | "settings">("billing");
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<ReceiptInput | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [hi, setHi] = useState(-1);
  const [dropOpen, setDropOpen] = useState(false);
  // Product shortcut boxes: default hidden, toggle se khulti hain (is device pe yaad rehta hai)
  const [showGrid, setShowGrid] = useState(false);
  useEffect(() => {
    try {
      setShowGrid(localStorage.getItem(GRID_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleGrid = () => {
    setShowGrid((v) => {
      try {
        localStorage.setItem(GRID_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  useEffect(() => {
    setPrinter(loadPrinter());
    try {
      if (localStorage.getItem(POS_VIEW_KEY) === "settings") setView("settings");
    } catch {
      /* ignore */
    }
  }, []);
  const changeView = (next: "billing" | "settings") => {
    setView(next);
    try {
      localStorage.setItem(POS_VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const savePrinter = () => {
    try {
      localStorage.setItem(PRINTER_KEY, JSON.stringify(printer));
      toast.success("Printer aur paper settings save ho gayi hain");
    } catch {
      toast.error("Settings save nahi ho sakin");
    }
  };

  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return products.slice(0, 24);
    return products.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 24);
  }, [products, term]);

  const add = (p: DbProduct, rateOverride?: RateType) => {
    const r = rateOverride ?? rate;
    const price = priceFor(p, r) ?? (rateOverride ? priceFor(p, rate) : null);
    const useRate = priceFor(p, r) != null ? r : rate;
    if (price == null) {
      toast.error(`${p.name} ka ${RATE_TYPES.find((x) => x.id === r)?.label} rate nahi hai`);
      return;
    }
    setCart((prev) => {
      const key = `${p.name}|${useRate}`;
      const ex = prev.find((l) => l.key === key);
      if (ex) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key, name: p.name, unit: p.unit, rateType: useRate, price, qty: 1, discount: 0 }];
    });
    toast.success(`${p.name} cart me add`, { duration: 1200 });
  };

  // Barcode ↔ product links (company ke apne barcodes ke liye), is device pe saved
  const [links, setLinks] = useState<Record<string, { name: string; rate: RateType }>>({});
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLinks(JSON.parse(localStorage.getItem(LINKS_KEY) || "{}"));
    } catch {
      /* ignore */
    }
  }, []);
  // Naya barcode link karte waqt boxes khud khul jate hain, warna sirf toggle se
  const gridVisible = showGrid || !!pendingCode;
  const saveLink = (code: string, p: DbProduct) => {
    const next = { ...links, [code]: { name: p.name, rate } };
    setLinks(next);
    try {
      localStorage.setItem(LINKS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setPendingCode(null);
    setTerm("");
    add(p);
  };

  const findByCode = (raw: string): { p: DbProduct; rate?: RateType } | null => {
    const code = raw.trim().toUpperCase();
    if (!code) return null;
    const link = links[code];
    if (link) {
      const p = products.find((x) => x.name === link.name);
      if (p) return { p, rate: link.rate };
    }
    const lower = code.toLowerCase();
    const byName = products.find((x) => x.name.toLowerCase() === lower);
    if (byName) return { p: byName };
    // Labels section wala code: NAAM(10 harf)-PACK, e.g. GLYCERINE-100G
    const [base, suffix = ""] = code.split("-");
    const p = products.find((x) => labelBase(x.name) === base);
    if (p) {
      const g = suffix.replace(/\D/g, "");
      const r: RateType | undefined = g === "100" ? "p100" : g === "250" ? "p250" : g === "500" ? "p500" : undefined;
      return { p, rate: r };
    }
    return null;
  };

  const handleCode = (raw: string) => {
    const hit = findByCode(raw);
    if (hit) {
      add(hit.p, hit.rate);
      setTerm("");
      setPendingCode(null);
      return true;
    }
    return false;
  };

  // Barcode scanner: code type hota hai + Enter
  const onScan = () => {
    const t = term.trim();
    if (!t) return;
    if (handleCode(t)) return;
    if (results.length === 1) {
      add(results[0]);
      setTerm("");
      return;
    }
    setPendingCode(t.toUpperCase());
    setTerm("");
    toast.error("Ye barcode kisi product se juda nahi — neeche product chun kar link karein");
  };

  // Scanner input page pe kahin bhi aaye (box focus na ho tab bhi) pakar lein
  const handleCodeRef = useRef(handleCode);
  handleCodeRef.current = handleCode;
  useEffect(() => {
    let buf = "";
    let lastAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const t = Date.now();
      if (t - lastAt > 80) buf = "";
      lastAt = t;
      if (e.key === "Enter" || e.key === "Tab") {
        if (buf.length >= 3) {
          e.preventDefault();
          const code = buf;
          buf = "";
          if (!handleCodeRef.current(code)) {
            setPendingCode(code.toUpperCase());
            toast.error("Ye barcode kisi product se juda nahi — product chun kar link karein");
          }
        }
        return;
      }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const patch = (key: string, v: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...v } : l)));

  const pre = totals(cart, 0, 0);
  const discAmt = discType === "pct" ? Math.round(((pre.subtotal + pre.taxTotal) * Math.min(100, n(billDiscount))) / 100 * 100) / 100 : n(billDiscount);
  const { subtotal, taxTotal, itemDiscount, total } = totals(cart, discAmt, n(delivery));

  // Payments: sirf ek line aur amount khali = poora us method se
  const payParts: PaymentPart[] = (() => {
    const filled = pays.map((p) => ({ method: p.method, amount: n(p.amount) }));
    if (pays.length === 1 && !pays[0].amount.trim()) return [{ method: pays[0].method, amount: total }];
    return filled.filter((p) => p.amount > 0);
  })();
  const paidNum = payParts.filter((p) => p.method !== "Credit").reduce((s, p) => s + p.amount, 0);
  const methodLabel = payParts.length ? payParts.map((p) => p.method).join("+") : "Credit";

  const phoneDigits = customerPhone.replace(/\D/g, "");
  const { data: balance } = useQuery({
    queryKey: ["pos-balance", phoneDigits],
    queryFn: () => getCustomerBalance({ data: { phone: phoneDigits } }),
    enabled: phoneDigits.length >= 10,
    staleTime: 30_000,
  });

  const ws = me?.workspace;
  const receipt = (invoiceNumber: string, title = "Invoice"): ReceiptInput => ({
    business: ws?.businessName || "HB Chemicals Pakistan",
    phone: ws?.businessPhone,
    address: ws?.businessAddress,
    invoiceNumber,
    title,
    date: new Date().toLocaleString("en-PK"),
    customerName: customerName.trim() || undefined,
    customerPhone: customerPhone.trim() || undefined,
    lines: cart,
    billDiscount: discAmt,
    delivery: n(delivery),
    payMode: methodLabel,
    payments: payParts,
    paid: paidNum,
    previousBalance: balance?.found && balance.balance > 0 ? balance.balance : undefined,
    notes: notes.trim() || undefined,
    currency: ws?.currency || "Rs",
  });

  const reset = () => {
    setCart([]);
    setBillDiscount("");
    setDiscType("amt");
    setDelivery("");
    setPays([{ method: "Cash", amount: "" }]);
    setNotes("");
    setCustomerName("");
    setCustomerPhone("");
    setEditing(null);
    scanRef.current?.focus();
  };

  const checkout = async (kind: "sale" | "held" | "quotation", print: boolean) => {
    if (!cart.length || saving) return;
    if (kind === "sale" && paidNum < total && !customerName.trim() && !customerPhone.trim()) {
      toast.error("Udhaar / baqaya ke liye customer ka naam ya phone likhein");
      return;
    }
    if (kind === "sale" && cart.some((l) => !(l.qty > 0))) {
      toast.error("Har item ki quantity 0 se zyada honi chahiye");
      return;
    }
    setSaving(true);
    try {
      const title = kind === "quotation" ? "Quotation" : "Invoice";
      const r = receipt("{{INVOICE}}", title);
      const res = await savePosDoc({
        data: {
          docType: kind,
          customerName: r.customerName,
          phone: r.customerPhone,
          subtotal,
          discountTotal: Math.round((itemDiscount + discAmt) * 100) / 100,
          taxTotal,
          delivery: n(delivery),
          total,
          notes: r.notes,
          convertFromId: editing?.id,
          methodLabel,
          invoiceText: receiptText(r),
          payments: kind === "sale" ? [...payParts, ...(total - paidNum > 0 ? [{ method: "Credit" as const, amount: Math.round((total - paidNum) * 100) / 100 }] : [])] : [],
          items: cart.map((l) => ({
            name: l.name,
            unit: packLabel(l),
            rateType: l.rateType,
            qty: l.qty,
            stockQty: stockDeduction(l),
            rate: l.price,
            discount: l.discount || 0,
            taxPercent: l.taxPercent || 0,
            taxAmount: lineTax(l),
            lineTotal: lineTotal(l),
            note: l.note || undefined,
          })),
          ui: { cart, billDiscount, discType, delivery, notes, customerName, customerPhone },
        },
      });
      const final = { ...r, invoiceNumber: res.invoiceNumber };
      if (kind === "held") {
        toast.success(`Bill hold: ${res.invoiceNumber}`);
      } else {
        setLast(final);
        if (print) printReceipt(receiptHtml(final, printer));
        toast.success(`${kind === "quotation" ? "Quotation" : "Sale"} save: ${res.invoiceNumber}`);
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["pos-docs"] });
      qc.invalidateQueries({ queryKey: ["pos-balance"] });
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save nahi hua");
    } finally {
      setSaving(false);
    }
  };

  const openDoc = (d: PosDocRow, asInvoice: boolean) => {
    try {
      const ui = d.payload ? (JSON.parse(d.payload) as Partial<{ cart: CartLine[]; billDiscount: string; discType: "amt" | "pct"; delivery: string; notes: string; customerName: string; customerPhone: string }>) : {};
      setCart(ui.cart ?? []);
      setBillDiscount(ui.billDiscount ?? "");
      setDiscType(ui.discType ?? "amt");
      setDelivery(ui.delivery ?? "");
      setNotes(ui.notes ?? "");
      setCustomerName(ui.customerName ?? d.customer_name ?? "");
      setCustomerPhone(ui.customerPhone ?? d.customer_phone ?? "");
      setPays([{ method: "Cash", amount: "" }]);
      setEditing(asInvoice ? { id: d.id, number: d.doc_number } : null);
      setDocsOpen(null);
      toast.success(`${d.doc_number} khul gaya — ab Save karein`);
    } catch {
      toast.error("Bill khul nahi saka");
    }
  };

  // Keyboard shortcuts: F2 naya, F4 search, F8 payment, F9 save+print, F10 hold
  const keysRef = useRef({ checkout, reset });
  keysRef.current = { checkout, reset };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); keysRef.current.reset(); }
      else if (e.key === "F4") { e.preventDefault(); scanRef.current?.focus(); }
      else if (e.key === "F8") { e.preventDefault(); payRef.current?.querySelector("input")?.focus(); }
      else if (e.key === "F9") { e.preventDefault(); void keysRef.current.checkout("sale", true); }
      else if (e.key === "F10") { e.preventDefault(); void keysRef.current.checkout("held", false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const whatsapp = (r: ReceiptInput) => {
    const digits = (r.customerPhone ?? "").replace(/\D/g, "").replace(/^0/, "92");
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(receiptText(r))}`, "_blank");
  };
  const share = async (r: ReceiptInput) => {
    const text = receiptText(r);
    try {
      if (navigator.share) await navigator.share({ title: r.invoiceNumber, text });
      else { await navigator.clipboard.writeText(text); toast.success("Bill copy ho gaya"); }
    } catch { /* user ne cancel kiya */ }
  };

  return (
    <AppShell title="POS Billing" subtitle="Counter + phone sales" active="/pos">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <WorkspaceHeader
          icon={ShoppingCart}
          eyebrow="Point of sale"
          title="POS Invoicing"
          description="Product scan ya search karein, cart banayein, payment lein aur receipt print karein. Stock khud kam hota hai."
          meta={["Barcode scan", "Discount", "Cash/Card/Udhaar"]}
        />

        <PosSubnav />

        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1 sm:w-fit sm:min-w-80">
          <Button variant={view === "billing" ? "default" : "ghost"} onClick={() => changeView("billing")}>
            <ReceiptText /> Billing
          </Button>
          <Button variant={view === "settings" ? "default" : "ghost"} onClick={() => changeView("settings")}>
            <Settings2 /> POS Settings
          </Button>
        </div>

        {view === "billing" ? (
        <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
          {/* Products */}
          <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <PosCustomerSearch field="name" className={inputCls} value={customerName} onChange={setCustomerName} onPick={pickCustomer} placeholder="Customer naam (Walk-in)" />
              <PosCustomerSearch field="phone" className={inputCls} value={customerPhone} onChange={setCustomerPhone} onPick={pickCustomer} placeholder="Phone (optional)" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RATE_TYPES.map((r) => (
                <Button key={r.id} size="sm" variant={rate === r.id ? "default" : "outline"} onClick={() => setRate(r.id)}>
                  {r.label}
                </Button>
              ))}
            </div>
            <div className="relative mt-3">
            <label className="flex h-11 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
              <ScanBarcode className="size-4 text-primary" />
              <input
                ref={scanRef}
                autoFocus
                value={term}
                role="combobox"
                aria-expanded={dropOpen}
                onChange={(e) => { setTerm(e.target.value); setHi(-1); setDropOpen(true); }}
                onFocus={() => setDropOpen(true)}
                onBlur={() => setTimeout(() => setDropOpen(false), 150)}
                onKeyDown={(e) => {
                  const list = term.trim() ? results.slice(0, 10) : [];
                  if (e.key === "ArrowDown" && list.length) {
                    e.preventDefault(); setDropOpen(true); setHi((h) => (h + 1) % list.length);
                  } else if (e.key === "ArrowUp" && list.length) {
                    e.preventDefault(); setHi((h) => (h <= 0 ? list.length - 1 : h - 1));
                  } else if (e.key === "Escape") {
                    setDropOpen(false); setHi(-1);
                  } else if ((e.key === "Enter" || e.key === "Tab") && term.trim()) {
                    e.preventDefault();
                    if (hi >= 0 && list[hi]) {
                      if (pendingCode) saveLink(pendingCode, list[hi]); else add(list[hi]);
                      setTerm(""); setHi(-1);
                    } else if (!handleCode(term) && list[0] && !pendingCode) {
                      add(list[0]); setTerm("");
                    } else if (!list.length) onScan();
                  }
                }}
                placeholder="Barcode scan karein ya product naam likhein (↓ ↑ + Enter)"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            {dropOpen && term.trim() && results.length ? (
              <ul role="listbox" className="absolute inset-x-0 top-12 z-30 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                {results.slice(0, 10).map((p, i) => {
                  const price = priceFor(p, rate);
                  return (
                    <li
                      key={p.name}
                      role="option"
                      aria-selected={i === hi}
                      onMouseDown={(e) => { e.preventDefault(); if (pendingCode) saveLink(pendingCode, p); else add(p); setTerm(""); setHi(-1); }}
                      onMouseEnter={() => setHi(i)}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${i === hi ? "bg-accent text-accent-foreground" : ""}`}
                    >
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{price != null ? `Rs ${money(price)}` : "Rate nahi"} · {p.stock ?? "-"}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            </div>
            {pendingCode ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-accent p-2.5 text-xs text-accent-foreground">
                <span>Barcode <b>{pendingCode}</b> naya hai — neeche product search kar ke <b>Link</b> dabayein, agli dafa scan se seedha add hoga.</span>
                <Button size="sm" variant="ghost" onClick={() => { setPendingCode(null); setTerm(""); }}>Cancel</Button>
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleGrid}
                aria-expanded={showGrid}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
              >
                <LayoutGrid className="size-3.5" />
                {showGrid ? "Shortcuts chhupayein" : "Product shortcuts dikhayein"}
              </button>
              {pendingCode ? <span className="text-xs text-muted-foreground">Link ke liye list khuli hai</span> : null}
            </div>
            {gridVisible ? (
              <div className="mt-2 grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {results.map((p) => {
                  const price = priceFor(p, rate);
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => (pendingCode ? saveLink(pendingCode, p) : add(p))}
                      disabled={price == null}
                      className="rounded-xl border border-border bg-background p-2.5 text-left transition hover:border-primary disabled:opacity-40"
                    >
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">{p.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {price != null ? `Rs ${money(price)}` : "Rate nahi"} · stock {p.stock ?? "-"}
                      </p>
                      {pendingCode ? <p className="mt-1 text-xs font-bold text-primary">Link karein</p> : null}
                    </button>
                  );
                })}
                {!results.length ? <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Koi product nahi mila. Rates section me products add karein.</p> : null}
              </div>
            ) : null}
          </section>

          {/* Cart */}
          <section className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">

            <div className="space-y-2">
              {cart.map((l) => (
                <CartRow key={l.key} line={l} onPatch={patch} onRemove={() => setCart((p) => p.filter((x) => x.key !== l.key))} />
              ))}
              {!cart.length ? <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Cart khali hai — product pe tap ya scan karein.</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">
                <span className="flex items-center justify-between">Bill discount
                  <span className="flex gap-0.5">
                    {(["amt", "pct"] as const).map((k) => (
                      <button key={k} type="button" onClick={() => setDiscType(k)} className={`rounded px-1.5 text-[10px] font-bold ${discType === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{k === "amt" ? "Rs" : "%"}</button>
                    ))}
                  </span>
                </span>
                <input className={inputCls} value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} inputMode="decimal" placeholder="0" />
              </label>
              <label className="text-xs text-muted-foreground">Delivery<input className={inputCls} value={delivery} onChange={(e) => setDelivery(e.target.value)} inputMode="decimal" placeholder="0" /></label>
            </div>

            <div ref={payRef} className="space-y-2 rounded-xl border border-border p-2.5">
              <p className="text-xs font-bold text-foreground">Payment {pays.length > 1 ? "(split)" : ""} <span className="font-normal text-muted-foreground">— F8</span></p>
              {pays.map((p, i) => (
                <div key={i} className="flex gap-1.5">
                  <select className="h-10 rounded-lg border border-border bg-background px-2 text-sm" value={p.method} onChange={(e) => setPays((all) => all.map((x, j) => (j === i ? { ...x, method: e.target.value as PayMethod } : x)))} aria-label="Payment method">
                    {PAY_METHODS.map((m) => <option key={m} value={m}>{m === "Credit" ? "Credit / Udhaar" : m}</option>)}
                  </select>
                  <input className={inputCls} value={p.amount} inputMode="decimal" placeholder={i === 0 && pays.length === 1 ? `${money(total)} (poora)` : "0"} onChange={(e) => setPays((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label="Amount" />
                  {pays.length > 1 ? <Button size="icon" variant="ghost" onClick={() => setPays((all) => all.filter((_, j) => j !== i))} aria-label="Hatayein"><Trash2 /></Button> : null}
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setPays((all) => [...all, { method: all.some((x) => x.method === "Cash") ? "Bank" : "Cash", amount: "" }])}><Plus /> Split payment</Button>
                <Button size="sm" variant="outline" onClick={() => setPays([{ method: "Credit", amount: "" }])}>Poora udhaar</Button>
              </div>
            </div>

            {balance?.found ? (
              <div className={`rounded-lg border p-2 text-xs ${balance.balance > 0 ? "border-destructive text-destructive" : "border-border text-muted-foreground"}`}>
                Purana baqaya: <b>Rs {money(balance.balance)}</b>{balance.creditLimit ? ` · Credit limit Rs ${money(balance.creditLimit)}` : ""}
              </div>
            ) : null}

            <label className="block text-xs text-muted-foreground">Invoice note<input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — bill pe chhapega" /></label>

            <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
              <Row a="Subtotal" b={`Rs ${money(subtotal)}`} />
              {itemDiscount ? <Row a="Item discounts" b={`- Rs ${money(itemDiscount)}`} /> : null}
              {taxTotal ? <Row a="Tax" b={`Rs ${money(taxTotal)}`} /> : null}
              {discAmt ? <Row a="Bill discount" b={`- Rs ${money(discAmt)}`} /> : null}
              {n(delivery) ? <Row a="Delivery" b={`Rs ${money(n(delivery))}`} /> : null}
              <Row a="Grand Total" b={`Rs ${money(total)}`} bold />
              <Row a="Paid" b={`Rs ${money(Math.min(paidNum, total))}`} />
              {paidNum > total ? <Row a="Change wapas" b={`Rs ${money(paidNum - total)}`} /> : null}
              {paidNum < total ? <Row a="Baqaya (udhaar)" b={`Rs ${money(total - paidNum)}`} /> : null}
            </div>

            {editing ? <p className="rounded-lg bg-accent p-2 text-xs text-accent-foreground">Khula hua: <b>{editing.number}</b> — save karne par ye band ho jayega. <button className="underline" onClick={() => setEditing(null)}>Alag karein</button></p> : null}

            <Button size="lg" className="h-14 w-full text-base" disabled={!cart.length || saving} onClick={() => checkout("sale", true)}><Printer /> Save + Print (F9) — Rs {money(total)}</Button>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" disabled={!cart.length || saving} onClick={() => checkout("sale", false)}><Save /> Save</Button>
              <Button variant="outline" disabled={!cart.length || saving} onClick={() => checkout("held", false)}><Pause /> Hold (F10)</Button>
              <Button variant="outline" disabled={!cart.length || saving} onClick={() => checkout("quotation", false)}><FileText /> Quotation</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDocsOpen("held")}><FolderOpen /> Held bills</Button>
              <Button variant="ghost" size="sm" onClick={() => setDocsOpen("quotation")}><FolderOpen /> Quotations</Button>
              <Button variant="ghost" size="sm" onClick={() => reset()}><RotateCcw /> Naya (F2)</Button>
            </div>

            {last ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-sm">
                <span className="font-semibold">Aakhri: {last.invoiceNumber}</span>
                <Button size="sm" variant="outline" onClick={() => printReceipt(receiptHtml(last, printer))}><Printer /> Print</Button>
                <Button size="sm" variant="outline" onClick={() => downloadReceiptPdf(last).catch(() => toast.error("PDF nahi bana"))}><Download /> PDF</Button>
                <Button size="sm" variant="outline" onClick={() => share(last)}><Share2 /> Share</Button>
                <Button size="sm" variant="outline" onClick={() => whatsapp(last)}><MessageCircle /> WhatsApp</Button>
              </div>
            ) : null}

            {docsOpen ? (
              <DocsList kind={docsOpen} onClose={() => setDocsOpen(null)} onOpen={openDoc} />
            ) : null}
          </section>
        </div>
        ) : (
          <PosSettings printer={printer} onChange={setPrinter} onSave={savePrinter} />
        )}
      </div>
    </AppShell>
  );
}

/** Cart ki ek line — qty, rate, discount, tax, unit, note aur total sab manually likhe ja sakte hain. */
function CartRow({ line, onPatch, onRemove }: { line: CartLine; onPatch: (key: string, v: Partial<CartLine>) => void; onRemove: () => void }) {
  const [totalText, setTotalText] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(!!line.note);
  const total = lineTotal(line);
  const setTotal = (raw: string) => {
    setTotalText(raw);
    const t = n(raw) / (1 + (line.taxPercent || 0) / 100);
    const q = line.qty || 1;
    onPatch(line.key, { price: Math.round(((t + (line.discount || 0)) / q) * 100) / 100 });
  };
  const small = "h-8 rounded-md border border-border bg-background px-2 text-sm";
  return (
    <div className="rounded-xl border border-border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{line.name}</p>
          <p className="text-xs text-muted-foreground">{packLabel(line)} · Rs {money(line.price)}{line.taxPercent ? ` · tax ${line.taxPercent}%` : ""}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setShowNote((v) => !v)} aria-label="Note"><StickyNote /></Button>
          <Button size="icon-sm" variant="ghost" onClick={onRemove} aria-label="Remove"><Trash2 /></Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="outline" onClick={() => onPatch(line.key, { qty: Math.max(0.001, +(line.qty - 1).toFixed(3)) || 1 })} aria-label="Kam"><Minus /></Button>
          <input className={`${small} w-16 text-center`} value={qtyText ?? String(line.qty)} inputMode="decimal" onChange={(e) => { setQtyText(e.target.value); onPatch(line.key, { qty: n(e.target.value) }); }} onBlur={() => setQtyText(null)} aria-label="Qty" title="Quantity (0.5, 1.25 kg bhi)" />
          <Button size="icon-sm" variant="outline" onClick={() => onPatch(line.key, { qty: +(line.qty + 1).toFixed(3) })} aria-label="Zyada"><Plus /></Button>
        </div>
        <label className="text-[10px] text-muted-foreground">Rate<input className={`${small} block w-20`} value={String(line.price)} inputMode="decimal" onChange={(e) => onPatch(line.key, { price: n(e.target.value) })} aria-label="Rate" /></label>
        <label className="text-[10px] text-muted-foreground">Unit<input className={`${small} block w-16`} value={line.unitOverride ?? ""} placeholder={packLabel(line)} onChange={(e) => onPatch(line.key, { unitOverride: e.target.value })} aria-label="Unit" /></label>
        <label className="text-[10px] text-muted-foreground">Disc<input className={`${small} block w-16`} value={line.discount ? String(line.discount) : ""} placeholder="0" inputMode="decimal" onChange={(e) => onPatch(line.key, { discount: n(e.target.value) })} aria-label="Discount" /></label>
        <label className="text-[10px] text-muted-foreground">Tax %<select className={`${small} block w-16 px-1`} value={line.taxPercent ?? 0} onChange={(e) => onPatch(line.key, { taxPercent: Number(e.target.value) })} aria-label="Tax">{TAX_RATES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="ml-auto text-[10px] text-muted-foreground">Total<input className={`${small} block w-24 text-right font-semibold text-foreground`} value={totalText ?? String(total)} inputMode="decimal" onChange={(e) => setTotal(e.target.value)} onBlur={() => setTotalText(null)} aria-label="Total" /></label>
      </div>
      {showNote ? <input className={`${small} mt-2 w-full`} value={line.note ?? ""} placeholder="Item note (receipt pe chhapega)" onChange={(e) => onPatch(line.key, { note: e.target.value })} aria-label="Item note" /> : null}
    </div>
  );
}

function Row({ a, b, bold }: { a: string; b: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold text-foreground" : "text-muted-foreground"}`}>
      <span>{a}</span>
      <span>{b}</span>
    </div>
  );
}

function PosSettings({ printer, onChange, onSave }: { printer: ReceiptPrinter; onChange: (p: ReceiptPrinter) => void; onSave: () => void }) {
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));
  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
        <p className="flex items-center gap-2 font-display text-base font-bold text-foreground"><Settings2 className="size-4 text-primary" /> POS Settings</p>
        <p className="mt-1 text-sm text-muted-foreground">POS ki tamam mojooda aur anay wali settings yahan milengi.</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground"><Printer className="size-4 text-primary" /> Printer aur paper</p>
        <p className="mt-1 text-xs text-muted-foreground">Kisi bhi brand ka printer chalega — Print dabane par system dialog me apna printer chunein, Margins "None" aur Scale 100% rakhein. Ye setting is device pe yaad rehti hai.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRINTER_PRESETS.map((p) => (
            <Button key={p.id} size="sm" variant={printer.id === p.id ? "default" : "outline"} onClick={() => onChange(p)}>{p.name}</Button>
          ))}
          <Button size="sm" variant={printer.id === "custom" ? "default" : "outline"} onClick={() => onChange({ ...printer, id: "custom", name: "Custom" })}>Custom</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-xs text-muted-foreground">Width (mm)<input className={inputCls} type="number" value={printer.widthMm} onChange={(e) => onChange({ ...printer, id: "custom", name: "Custom", widthMm: num(e.target.value, 30, 330) })} /></label>
          <label className="text-xs text-muted-foreground">Height (mm, khali = roll)<input className={inputCls} type="number" value={printer.heightMm ?? ""} onChange={(e) => onChange({ ...printer, id: "custom", name: "Custom", heightMm: e.target.value ? num(e.target.value, 30, 500) : null })} /></label>
          <label className="text-xs text-muted-foreground">Margin (mm)<input className={inputCls} type="number" value={printer.marginMm} onChange={(e) => onChange({ ...printer, id: "custom", name: "Custom", marginMm: num(e.target.value, 0, 30) })} /></label>
          <label className="text-xs text-muted-foreground">Font (pt)<input className={inputCls} type="number" value={printer.fontPt} onChange={(e) => onChange({ ...printer, id: "custom", name: "Custom", fontPt: num(e.target.value, 6, 16) })} /></label>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={onSave}><Save /> Save settings</Button>
        </div>
      </div>
    </section>
  );
}
