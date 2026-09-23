import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { getProducts, type DbProduct } from "@/lib/products.functions";
import { getMySettings } from "@/lib/settings.functions";
import { savePosSale } from "@/lib/pos.functions";
import {
  PRINTER_PRESETS,
  RATE_TYPES,
  lineTotal,
  money,
  packLabel,
  paymentStatus,
  priceFor,
  printReceipt,
  receiptHtml,
  receiptText,
  stockDeduction,
  totals,
  type CartLine,
  type PayMode,
  type RateType,
  type ReceiptInput,
  type ReceiptPrinter,
} from "@/lib/pos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Minus, Plus, Printer, ScanBarcode, ShoppingCart, Trash2, MessageCircle } from "lucide-react";
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
  const [delivery, setDelivery] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("Cash");
  const [paid, setPaid] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [printer, setPrinter] = useState<ReceiptPrinter>(PRINTER_PRESETS[0]);
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

  useEffect(() => setPrinter(loadPrinter()), []);
  const updatePrinter = (p: ReceiptPrinter) => {
    setPrinter(p);
    try {
      localStorage.setItem(PRINTER_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
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

  const { subtotal, total } = totals(cart, n(billDiscount), n(delivery));
  const paidNum = payMode === "Udhaar" ? n(paid) : paid.trim() ? n(paid) : total;

  const ws = me?.workspace;
  const receipt = (invoiceNumber: string): ReceiptInput => ({
    business: ws?.businessName || "HB Chemicals Pakistan",
    phone: ws?.businessPhone,
    address: ws?.businessAddress,
    invoiceNumber,
    date: new Date().toLocaleString("en-PK"),
    customerName: customerName.trim() || undefined,
    customerPhone: customerPhone.trim() || undefined,
    lines: cart,
    billDiscount: n(billDiscount),
    delivery: n(delivery),
    payMode,
    paid: paidNum,
    currency: ws?.currency || "Rs",
  });

  const reset = () => {
    setCart([]);
    setBillDiscount("");
    setDelivery("");
    setPaid("");
    setCustomerName("");
    setCustomerPhone("");
    setPayMode("Cash");
    scanRef.current?.focus();
  };

  const checkout = async (print: boolean) => {
    if (!cart.length || saving) return;
    if (payMode === "Udhaar" && !customerName.trim() && !customerPhone.trim()) {
      toast.error("Udhaar ke liye customer ka naam ya phone likhein");
      return;
    }
    setSaving(true);
    try {
      const r = receipt("{{INVOICE}}");
      const res = await savePosSale({
        data: {
          customerName: r.customerName,
          phone: r.customerPhone,
          total,
          paid: paidNum,
          payMode,
          status: paymentStatus(total, paidNum, payMode),
          invoiceText: receiptText(r),
          stock: cart.map((l) => ({ name: l.name, qty: stockDeduction(l) })),
        },
      });
      const final = { ...r, invoiceNumber: res.invoiceNumber };
      setLast(final);
      if (print) printReceipt(receiptHtml(final, printer));
      toast.success(`Sale save: ${res.invoiceNumber}`);
      qc.invalidateQueries({ queryKey: ["products"] });
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sale save nahi hui");
    } finally {
      setSaving(false);
    }
  };

  const whatsapp = (r: ReceiptInput) => {
    const digits = (r.customerPhone ?? "").replace(/\D/g, "").replace(/^0/, "92");
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(receiptText(r))}`, "_blank");
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

        <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
          {/* Products */}
          <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
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
            <div className="mt-3 grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
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
          </section>

          {/* Cart */}
          <section className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer naam (Walk-in)" />
              <input className={inputCls} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} inputMode="tel" placeholder="Phone (optional)" />
            </div>

            <div className="space-y-2">
              {cart.map((l) => (
                <div key={l.key} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{packLabel(l)} · Rs {money(l.price)}</p>
                    </div>
                    <Button size="icon-sm" variant="ghost" onClick={() => setCart((p) => p.filter((x) => x.key !== l.key))} aria-label="Remove">
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button size="icon-sm" variant="outline" onClick={() => patch(l.key, { qty: Math.max(1, l.qty - 1) })} aria-label="Kam"><Minus /></Button>
                    <input className="h-8 w-14 rounded-md border border-border bg-background text-center text-sm" value={l.qty} inputMode="decimal" onChange={(e) => patch(l.key, { qty: n(e.target.value) || 0 })} aria-label="Qty" />
                    <Button size="icon-sm" variant="outline" onClick={() => patch(l.key, { qty: l.qty + 1 })} aria-label="Zyada"><Plus /></Button>
                    <input className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm" value={String(l.price)} inputMode="decimal" onChange={(e) => patch(l.key, { price: n(e.target.value) })} aria-label="Rate" title="Rate" />
                    <input className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm" value={l.discount ? String(l.discount) : ""} placeholder="Disc" inputMode="decimal" onChange={(e) => patch(l.key, { discount: n(e.target.value) })} aria-label="Discount" />
                    <span className="ml-auto text-sm font-bold text-foreground">Rs {money(lineTotal(l))}</span>
                  </div>
                </div>
              ))}
              {!cart.length ? <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Cart khali hai — product pe tap ya scan karein.</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">Bill discount<input className={inputCls} value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} inputMode="decimal" placeholder="0" /></label>
              <label className="text-xs text-muted-foreground">Delivery<input className={inputCls} value={delivery} onChange={(e) => setDelivery(e.target.value)} inputMode="decimal" placeholder="0" /></label>
            </div>

            <div className="flex gap-1.5">
              {(["Cash", "Card", "Udhaar"] as PayMode[]).map((m) => (
                <Button key={m} className="flex-1" variant={payMode === m ? "default" : "outline"} onClick={() => setPayMode(m)}>{m}</Button>
              ))}
            </div>
            <label className="block text-xs text-muted-foreground">
              {payMode === "Udhaar" ? "Abhi kitna mila (optional)" : "Customer ne diya (khali = poora)"}
              <input className={inputCls} value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" placeholder={payMode === "Udhaar" ? "0" : money(total)} />
            </label>

            <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
              <Row a="Subtotal" b={`Rs ${money(subtotal)}`} />
              {n(billDiscount) ? <Row a="Discount" b={`- Rs ${money(n(billDiscount))}`} /> : null}
              {n(delivery) ? <Row a="Delivery" b={`Rs ${money(n(delivery))}`} /> : null}
              <Row a="Grand Total" b={`Rs ${money(total)}`} bold />
              {paidNum > total ? <Row a="Change wapas" b={`Rs ${money(paidNum - total)}`} /> : null}
              {paidNum < total ? <Row a="Baqaya (udhaar)" b={`Rs ${money(total - paidNum)}`} /> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!cart.length || saving} onClick={() => checkout(false)}>Save sale</Button>
              <Button disabled={!cart.length || saving} onClick={() => checkout(true)}><Printer /> Save + Print</Button>
            </div>

            {last ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-sm">
                <span className="font-semibold">Aakhri: {last.invoiceNumber}</span>
                <Button size="sm" variant="outline" onClick={() => printReceipt(receiptHtml(last, printer))}><Printer /> Dobara print</Button>
                {last.customerPhone ? <Button size="sm" variant="outline" onClick={() => whatsapp(last)}><MessageCircle /> WhatsApp</Button> : null}
              </div>
            ) : null}
          </section>
        </div>

        <PrinterSettings printer={printer} onChange={updatePrinter} />
      </div>
    </AppShell>
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

function PrinterSettings({ printer, onChange }: { printer: ReceiptPrinter; onChange: (p: ReceiptPrinter) => void }) {
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));
  return (
    <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground"><Printer className="size-4 text-primary" /> Receipt printer / paper</p>
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
    </section>
  );
}
