import { PosCustomerSearch } from "@/components/pos-customer-search";
import { PosSubnav } from "@/components/pos-subnav";
import { usePinPrompt, usePosAccess } from "@/components/pos-access";
import { AppShell } from "@/components/app-shell";
import { UnitSelect } from "@/components/unit-select";
import { Button } from "@/components/ui/button";
import { getProducts, type DbProduct } from "@/lib/products.functions";
import { getMySettings } from "@/lib/settings.functions";
import { closePosDoc, getCustomerBalance, listPosDocs, savePosDoc } from "@/lib/pos.functions";
import { saveParty } from "@/lib/records.functions";
import { createPosProduct } from "@/lib/inventory.functions";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";
import { getSyncOverview } from "@/lib/print-admin.functions";
import { Link } from "@tanstack/react-router";
import type { PrintDoc } from "@/lib/print/render";
import {
  RATE_TYPES,
  autoRate,
  isWholesale,
  receiptToDoc,
  lineTax,
  lineTotal,
  money,
  packLabel,
  priceFor,
  receiptText,
  stockDeduction,
  totals,
  type CartLine,
  type PayMethod,
  type PaymentPart,
  type RateType,
  type ReceiptInput,
} from "@/lib/pos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BarcodeScannerDialog } from "@/components/barcode-scanner";
import { Minus, Plus, Printer, ScanBarcode, Trash2, MessageCircle, LayoutGrid, ReceiptText, Save, StickyNote, Pause, FileText, FolderOpen, RotateCcw, Download, Share2, X, UserPlus, Keyboard, Zap } from "lucide-react";

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
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : null}
      {!isLoading && !docs.length ? <p className="text-xs text-muted-foreground">No {kind === "held" ? "held bills" : "quotations"}.</p> : null}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{d.doc_number} · {d.customer_name || "Walk-in"}</p>
              <p className="text-muted-foreground">Rs {money(d.grand_total)} · {new Date(d.created_at).toLocaleString("en-PK")}</p>
            </div>
            <Button size="sm" onClick={() => onOpen(d, true)}>{kind === "held" ? "Open" : "Create invoice"}</Button>
            <Button size="icon-sm" variant="ghost" onClick={() => close(d.id)} aria-label="Close"><Trash2 /></Button>
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
      { name: "description", content: "Fast POS invoicing for counter and phone sales, stock and receipt printing." },
      { property: "og:title", content: "POS Billing — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Scan products, create a bill, print receipt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

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

/** Quantity badalte hi rate khud sale/wholesale me switch ho jati hai. */
const withAutoRate = (l: CartLine): CartLine => ({ ...l, price: autoRate(l) });

function PosPage() {
  const qc = useQueryClient();
  const { data: prodData } = useQuery({ queryKey: ["pos-products"], queryFn: () => getProducts({ data: { scope: "pos" } }) });
  const { data: me } = useQuery({ queryKey: ["my-settings"], queryFn: () => getMySettings() });
  const { can, config: posCfg, cfg } = usePosAccess();
  const pc = usePrintCenter();
  const [lastDoc, setLastDoc] = useState<PrintDoc | null>(null);
  const [pinNode, askPin] = usePinPrompt();
  const [unlocked, setUnlocked] = useState(false);
  const lockPrice = !can("edit_price") && !unlocked;
  const lockDisc = !can("apply_discount") && !unlocked;
  const unlock = async () => {
    if (unlocked) return;
    const pin = await askPin("Enter manager PIN to change rate/discount (for this bill only).");
    if (pin) { setUnlocked(true); toast.success("Unlocked for this bill"); }
  };
  const products = prodData?.products ?? [];

  const rate: RateType = "sale";
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [billDiscount, setBillDiscount] = useState("");
  const [discType, setDiscType] = useState<"amt" | "pct">("amt");
  const [delivery, setDelivery] = useState("");
  const [pays, setPays] = useState<{ method: PayMethod; amount: string }[]>([{ method: "Cash", amount: "" }]);
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<{ id: string; number: string } | null>(null);
  const [docsOpen, setDocsOpen] = useState<"held" | "quotation" | null>(null);
  const [estimate, setEstimate] = useState(false);
  const payRef = useRef<HTMLDivElement>(null);
  const pickCustomer = (c: { name: string | null; phone: string; address: string | null; courierServiceName: string | null; goodsAddaName: string | null }) => {
    setCustomerName(c.name ?? "");
    setCustomerPhone(c.phone ?? "");
    setCustomerAddress(c.address ?? "");
    setCourierServiceName(c.courierServiceName ?? "");
    setGoodsAddaName(c.goodsAddaName ?? "");
  };
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [courierServiceName, setCourierServiceName] = useState("");
  const [goodsAddaName, setGoodsAddaName] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [party, setParty] = useState({ name: "", phone: "", city: "", address: "", courierServiceName: "", goodsAddaName: "" });
  const [partySaving, setPartySaving] = useState(false);

  const addParty = async () => {
    if (!party.name.trim() || !party.phone.trim()) {
      toast.error("Party ka naam aur phone zaroori hain");
      return;
    }
    setPartySaving(true);
    try {
      const r = await saveParty({ data: { name: party.name.trim(), phone: party.phone.trim(), city: party.city.trim() || undefined, address: party.address.trim() || undefined, courierServiceName: party.courierServiceName.trim() || undefined, goodsAddaName: party.goodsAddaName.trim() || undefined } });
      pickCustomer(r.customer);
      setPartyOpen(false);
      setParty({ name: "", phone: "", city: "", address: "", courierServiceName: "", goodsAddaName: "" });
      qc.invalidateQueries({ queryKey: ["pos-customers"] });
      toast.success("Party save ho gayi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Party save nahi hui");
    } finally {
      setPartySaving(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<ReceiptInput | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [dropOpen, setDropOpen] = useState(false);
  const [staged, setStaged] = useState<DbProduct | null>(null);
  const [pendingNew, setPendingNew] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  // Staged product ke quick-edit fields (search bar ke neeche panel)
  const [sf, setSf] = useState({ qty: "1", price: "", unit: "", size: "", weight: "", amount: "" });
  const resetSf = () => setSf({ qty: "1", price: "", unit: "", size: "", weight: "", amount: "" });
  // Product shortcut boxes: default hidden, toggle se khulti hain (is device pe yaad rehta hai)
  const [showGrid, setShowGrid] = useState(false);
  useEffect(() => {
    try {
      setShowGrid(localStorage.getItem(GRID_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const cfgApplied = useRef(false);
  useEffect(() => {
    if (cfgApplied.current || !posCfg || !Object.keys(posCfg).length) return;
    cfgApplied.current = true;
    setPays([{ method: cfg.defaultPay as PayMethod, amount: "" }]);
    try { if (localStorage.getItem(GRID_KEY) == null) setShowGrid(cfg.pos.showGrid); } catch { /* ignore */ }
  }, [posCfg, cfg]);
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


  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return products.slice(0, 24);
    const exact = products.filter((p) => p.barcode?.toLowerCase() === t || p.sku?.toLowerCase() === t);
    const rest = products.filter((p) => !exact.includes(p) && [p.name, p.sku, p.barcode, p.category].some((v) => v?.toLowerCase().includes(t)));
    return [...exact, ...rest].slice(0, 24);
  }, [products, term]);

  const add = (p: DbProduct, rateOverride?: RateType, ov?: { qty?: number; price?: number; unit?: string; size?: string; weight?: string }) => {
    const r = rateOverride ?? rate;
    let price = priceFor(p, r) ?? (rateOverride ? priceFor(p, rate) : null);
    const useRate = priceFor(p, r) != null ? r : rate;
    if (ov?.price != null) price = ov.price;
    if (price == null) {
      toast.error(`${p.name} has no ${RATE_TYPES.find((x) => x.id === r)?.label} rate`);
      return;
    }
    const qty = ov?.qty != null && ov.qty > 0 ? ov.qty : 1;
    const wholesalePrice = useRate === "sale" ? p.wholesale ?? null : null;
    const wholesaleMinQty = useRate === "sale" ? p.wholesaleMinQty ?? null : null;
    const unitOverride = ov?.unit && ov.unit !== p.unit ? ov.unit : undefined;
    setCart((prev) => {
      const key = `${p.name}|${useRate}`;
      const ex = prev.find((l) => l.key === key);
      if (ex && !ov) return prev.map((l) => (l.key === key ? withAutoRate({ ...l, qty: l.qty + 1 }) : l));
      return [...prev, withAutoRate({ key, name: p.name, unit: p.unit, unitOverride, rateType: useRate, price, basePrice: price, wholesalePrice, wholesaleMinQty, qty, discount: 0, taxPercent: cfg.tax.enabled ? cfg.tax.defaultPct : 0, taxIncl: cfg.tax.inclusive, sku: p.sku, barcode: p.barcode, size: ov?.size || undefined, weight: ov?.weight || undefined, priceManual: ov?.price != null ? true : undefined })];
    });
    if (cfg.inventory.trackStock && cfg.inventory.warnOutOfStock && p.stock != null && p.stock <= 0) {
      toast.warning(`${p.name}: out of stock (${p.stock})${cfg.inventory.allowNegativeStock ? "" : " — bill will not save"}`);
    } else toast.success(`${p.name} added to cart`, { duration: 1200 });
  };

  // Two-step add: selecting a product first lands its name in the search bar;
  // Enter again or the ⚡ button then adds it to the bill.
  const stage = (p: DbProduct) => {
    setStaged(p);
    setTerm(p.name);
    setHi(-1);
    setDropOpen(false);
    const pr = priceFor(p, rate);
    setSf({ qty: "1", price: pr != null ? String(pr) : "", unit: p.unit || "", size: "", weight: "", amount: pr != null ? String(pr) : "" });
    scanRef.current?.focus();
  };
  const sfNum = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : null; };
  const stagedOverrides = () => {
    const qty = sfNum(sf.qty);
    const price = sf.price.trim() === "" ? null : sfNum(sf.price);
    return { qty: qty != null && qty > 0 ? qty : 1, price: price ?? undefined, unit: sf.unit.trim() || undefined, size: sf.size.trim() || undefined, weight: sf.weight.trim() || undefined };
  };
  const confirmStaged = () => {
    const t = term.trim().toLowerCase();
    if (staged && t === staged.name.toLowerCase()) {
      add(staged, undefined, stagedOverrides());
      setTerm("");
      setStaged(null);
      setHi(-1);
      resetSf();
      return;
    }
    const exact = results.find((p) => p.name.toLowerCase() === t);
    const pick = exact ?? results[0];
    if (pick) stage(pick);
    else newOrSave();
  };

  // Unsaved name: 1st Enter keeps it in the bar, 2nd Enter / ⚡ saves it to inventory (name only) and adds it to the bill
  const newOrSave = async () => {
    const name = term.trim();
    if (!name) return;
    if (pendingNew?.toLowerCase() !== name.toLowerCase()) {
      setPendingNew(name);
      setDropOpen(false);
      return;
    }
    if (savingNew) return;
    setSavingNew(true);
    try {
      await createPosProduct({ data: { name } });
      const p: DbProduct = { name, unit: sf.unit.trim() || "Piece", p100: null, p250: null, p500: null, sale: 0, stock: null, customSale: null, customP100: null, customP250: null, customP500: null };
      add(p, "sale", stagedOverrides());
      setTerm(""); setPendingNew(null); setHi(-1); resetSf();
      qc.invalidateQueries();
      toast.success(`${name} saved to inventory — edit rates/stock later`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Product save failed");
    } finally {
      setSavingNew(false);
      scanRef.current?.focus();
    }
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
    toast.error("This barcode is not linked to any product — choose a product below to link it");
  };

  // Scanner input page pe kahin bhi aaye (box focus na ho tab bhi) pakar lein
  const scanAutoRef = useRef(true);
  scanAutoRef.current = cfg.pos.scanAutoAdd;
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
          if (!scanAutoRef.current) { setTerm(code); scanRef.current?.focus(); return; }
          if (!handleCodeRef.current(code)) {
            setPendingCode(code.toUpperCase());
            toast.error("This barcode is not linked to any product — choose a product to link it");
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
    setCart((prev) => prev.map((l) => (l.key === key ? withAutoRate({ ...l, ...v }) : l)));

  const pre = totals(cart, 0, 0);
  const discAmt = discType === "pct" ? Math.round(((pre.subtotal + pre.taxTotal) * Math.min(100, n(billDiscount))) / 100 * 100) / 100 : n(billDiscount);
  const { subtotal, taxTotal, itemDiscount, total } = totals(cart, discAmt, n(delivery));
  const qtyTotal = Math.round(cart.reduce((s, l) => s + (l.qty || 0), 0) * 1000) / 1000;

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
    business: cfg.business.name || ws?.businessName || "HB Chemicals Pakistan",
    terms: posCfg.terms || undefined,
    footer: posCfg.receiptFooter || undefined,
    phone: cfg.business.phone || ws?.businessPhone,
    address: cfg.business.address || ws?.businessAddress,
    invoiceNumber,
    title,
    date: new Date().toLocaleString("en-PK"),
    customerName: customerName.trim() || undefined,
    customerPhone: customerPhone.trim() || undefined,
    customerAddress: customerAddress.trim() || undefined,
    courierServiceName: courierServiceName.trim() || undefined,
    goodsAddaName: goodsAddaName.trim() || undefined,
    lines: cart,
    billDiscount: discAmt,
    delivery: n(delivery),
    payMode: methodLabel,
    payments: payParts,
    paid: paidNum,
    previousBalance: balance?.found && balance.balance > 0 ? balance.balance : undefined,
    notes: notes.trim() || undefined,
    currency: cfg.business.currencySymbol || ws?.currency || "Rs",
  });

  const reset = () => {
    setCart([]);
    setTerm("");
    setStaged(null);
    setBillDiscount("");
    setDiscType("amt");
    setDelivery("");
    setUnlocked(false);
    setPays([{ method: cfg.defaultPay as PayMethod, amount: "" }]);
    setNotes("");
    if (!cfg.sales.keepCustomerAfterSale) {
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setCourierServiceName("");
      setGoodsAddaName("");
    }
    setEditing(null);
    if (cfg.pos.autoFocusSearch) scanRef.current?.focus();
  };

  const submitLock = useRef(false);
  const docRef = useRef<string>(newRef());
  const checkout = async (rawKind: "sale" | "held" | "quotation", print: boolean) => {
    const kind = estimate && rawKind === "sale" ? "quotation" : rawKind;
    if (!cart.length || saving || submitLock.current) return;
    if (kind === "sale" && paidNum < total && !customerName.trim() && !customerPhone.trim()) {
      toast.error("Enter customer name or phone for credit / outstanding balance");
      return;
    }
    if (kind === "sale" && cart.some((l) => !(l.qty > 0))) {
      toast.error("Every item's quantity must be greater than 0");
      return;
    }
    if (kind === "sale" && !cfg.inventory.allowFractional && cart.some((l) => !Number.isInteger(l.qty))) {
      toast.error("Decimal quantity not allowed (Settings > Inventory)");
      return;
    }
    if (kind === "sale" && cfg.sales.confirmBeforeSave && !window.confirm(`Save bill? Total Rs ${money(total)}`)) return;
    submitLock.current = true;
    setSaving(true);
    try {
      const title = kind === "quotation" ? (estimate ? "Estimate" : "Quotation") : "Invoice";
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
            note: [l.note, l.weight?.trim() ? `Wt: ${l.weight.trim()}` : "", l.size?.trim() ? `Size: ${l.size.trim()}` : ""].filter(Boolean).join(" · ") || undefined,
          })),
           ui: { cart, billDiscount, discType, delivery, notes, customerName, customerPhone, customerAddress, courierServiceName, goodsAddaName },
          clientRef: docRef.current,
        },
      });
      docRef.current = newRef();
      const final = { ...r, invoiceNumber: res.invoiceNumber };
      if (kind === "held") {
        toast.success(`Bill held: ${res.invoiceNumber}`);
      } else {
        setLast(final);
        const doc = receiptToDoc(final, { kind: kind === "quotation" ? "quotation" : "pos", id: res.id, date: new Date() });
        setLastDoc(doc);
        if (!res.duplicate) {
          if (print) void pc.print(doc);
          else pc.afterSave(doc, kind === "quotation" ? "quotation" : "pos");
          if (kind === "sale" && cfg.sales.autoPdf) void pc.pdf(doc);
        }
        toast.success(`${kind === "quotation" ? (estimate ? "Estimate" : "Quotation") : "Sale"} saved: ${res.invoiceNumber}${res.duplicate ? " (already saved)" : ""}${res.change > 0 ? ` — return change Rs ${money(res.change)}` : ""}`);
        setEstimate(false);
      }
      qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["pos-products"] });
      qc.invalidateQueries({ queryKey: ["pos-docs"] });
      qc.invalidateQueries({ queryKey: ["pos-balance"] });
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save invoice. Please try again.");
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };

  const openDoc = (d: PosDocRow, asInvoice: boolean) => {
    try {
      const ui = d.payload ? (JSON.parse(d.payload) as Partial<{ cart: CartLine[]; billDiscount: string; discType: "amt" | "pct"; delivery: string; notes: string; customerName: string; customerPhone: string; customerAddress: string; courierServiceName: string; goodsAddaName: string }>) : {};
      setCart(ui.cart ?? []);
      setBillDiscount(ui.billDiscount ?? "");
      setDiscType(ui.discType ?? "amt");
      setDelivery(ui.delivery ?? "");
      setNotes(ui.notes ?? "");
      setCustomerName(ui.customerName ?? d.customer_name ?? "");
      setCustomerPhone(ui.customerPhone ?? d.customer_phone ?? "");
      setCustomerAddress(ui.customerAddress ?? "");
      setCourierServiceName(ui.courierServiceName ?? "");
      setGoodsAddaName(ui.goodsAddaName ?? "");
      setPays([{ method: "Cash", amount: "" }]);
      setEditing(asInvoice ? { id: d.id, number: d.doc_number } : null);
      setDocsOpen(null);
      toast.success(`${d.doc_number} opened — now Save`);
    } catch {
      toast.error("Could not open bill");
    }
  };

  // POS Invoices se "Convert to Invoice" — estimate wapas kholne ke liye handoff.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pos-open-doc");
      if (!raw) return;
      sessionStorage.removeItem("pos-open-doc");
      openDoc(JSON.parse(raw) as PosDocRow, true);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts (mouse-free POS). Full list in SHORTCUTS / guide dialog.
  const shortcutsRef = useRef(true);
  shortcutsRef.current = cfg.pos.shortcuts;
  const custRef = useRef<HTMLDivElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const keysRef = useRef({ checkout, reset, setEstimate, setPartyOpen, setDocsOpen, setGuideOpen, setCart });
  keysRef.current = { checkout, reset, setEstimate, setPartyOpen, setDocsOpen, setGuideOpen, setCart };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keysRef.current;
      const key = e.key.toLowerCase();
      const act = (fn: () => void) => { e.preventDefault(); e.stopPropagation(); fn(); };
      if (e.key === "F1" || (e.ctrlKey && key === "/")) return act(() => k.setGuideOpen((o) => !o));
      if (e.key === "Escape") { k.setGuideOpen(false); return; }
      if (!shortcutsRef.current) return;
      const focusPay = () => payRef.current?.querySelector<HTMLElement>("input,select")?.focus();
      const focusCust = () => custRef.current?.querySelector<HTMLElement>("input")?.focus();
      if (e.key === "F2") act(() => k.reset());
      else if (e.key === "F4") act(() => scanRef.current?.focus());
      else if (e.key === "F8") act(focusPay);
      else if (e.key === "F9") act(() => void k.checkout("sale", true));
      else if (e.key === "F10") act(() => void k.checkout("held", false));
      else if (e.ctrlKey && !e.altKey && key === "s") act(() => void k.checkout("sale", true));
      else if (e.ctrlKey && e.key === "Enter") act(() => void k.checkout("sale", false));
      else if (e.ctrlKey && e.shiftKey && key === "h") act(() => void k.checkout("held", false));
      else if (e.ctrlKey && e.shiftKey && e.key === "Backspace") act(() => k.setCart((p) => p.slice(0, -1)));
      else if (e.altKey && !e.ctrlKey) {
        if (key === "c") act(focusCust);
        else if (key === "s" || key === "i") act(() => scanRef.current?.focus());
        else if (key === "m") act(focusPay);
        else if (key === "p") act(() => k.setPartyOpen((o) => !o));
        else if (key === "e") act(() => k.setEstimate((v) => !v));
        else if (key === "h") act(() => k.setDocsOpen("held"));
        else if (key === "q") act(() => k.setDocsOpen("quotation"));
        else if (key === "n") act(() => k.reset());
        else if (key === "k") act(() => k.setGuideOpen((o) => !o));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const whatsapp = (r: ReceiptInput) => {
    const digits = (r.customerPhone ?? "").replace(/\D/g, "").replace(/^0/, "92");
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(receiptText(r))}`, "_blank");
  };
  const share = async (r: ReceiptInput) => {
    const text = receiptText(r);
    try {
      if (navigator.share) await navigator.share({ title: r.invoiceNumber, text });
      else { await navigator.clipboard.writeText(text); toast.success("Bill copied"); }
    } catch { /* user ne cancel kiya */ }
  };

  return (
    <AppShell title="POS Billing" subtitle="Counter + phone sales" active="/pos" wide>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        {guideOpen ? <ShortcutGuide onClose={() => setGuideOpen(false)} /> : null}
        {pinNode}
        {pc.node}
        <PosAlerts cfg={cfg} products={products} credit={balance?.found && balance.creditLimit != null && balance.balance + Math.max(0, total - paidNum) > balance.creditLimit ? { limit: balance.creditLimit, after: balance.balance + Math.max(0, total - paidNum) } : null} />

        <div className="border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
            <h1 className="text-lg font-bold text-foreground">{estimate ? "Estimate" : "Sale"}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{editing ? `Invoice ${editing.number}` : "New invoice"}</span>
              <span className="border-l border-border pl-3">{new Date().toLocaleDateString("en-PK")}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setGuideOpen(true)} title="Keyboard shortcuts (F1)"><Keyboard /> Shortcuts (F1)</Button>
            </div>
          </div>
          <section className="px-4 pb-5 pt-6 sm:min-h-48 sm:px-6 sm:pb-8">
            <div ref={custRef} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:max-w-2xl sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <PosCustomerSearch field="name" className={inputCls} value={customerName} onChange={(v) => { setCustomerName(v); setCustomerAddress(""); setCourierServiceName(""); setGoodsAddaName(""); }} onPick={pickCustomer} placeholder="Customer name (Walk-in)" />
              <div className="col-start-1 row-start-2 sm:col-start-2 sm:row-start-1"><PosCustomerSearch field="phone" className={inputCls} value={customerPhone} onChange={(v) => { setCustomerPhone(v); setCustomerAddress(""); setCourierServiceName(""); setGoodsAddaName(""); }} onPick={pickCustomer} placeholder="Phone (optional)" /></div>
              <Button type="button" variant="outline" className="col-start-2 row-start-1 h-10 gap-1.5 sm:col-start-3" onClick={() => setPartyOpen((o) => !o)} title="Add new party">
                <UserPlus className="size-4" /> Party
              </Button>
            </div>
            <div className="mt-3 grid gap-2 sm:max-w-2xl sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground sm:col-span-2">Customer address
                <input className={inputCls} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Address (optional)" />
              </label>
              <label className="text-xs font-medium text-muted-foreground">Courier service
                <input className={inputCls} value={courierServiceName} onChange={(e) => setCourierServiceName(e.target.value)} placeholder="Courier service name" />
              </label>
              <label className="text-xs font-medium text-muted-foreground">Goods adda
                <input className={inputCls} value={goodsAddaName} onChange={(e) => setGoodsAddaName(e.target.value)} placeholder="Goods adda name" />
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground"><K>Alt+C</K> customer name · <K>Alt+P</K> add new party</p>
            {partyOpen ? (
              <div className="mb-3 rounded-xl border border-primary/40 bg-accent/30 p-3">
                <p className="mb-2 text-sm font-bold text-foreground">Add new party</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Name *" value={party.name} onChange={(e) => setParty((p) => ({ ...p, name: e.target.value }))} />
                  <input className={inputCls} placeholder="Phone *" inputMode="tel" value={party.phone} onChange={(e) => setParty((p) => ({ ...p, phone: e.target.value.replace(/[^\d+\s-]/g, "") }))} />
                  <input className={inputCls} placeholder="City" value={party.city} onChange={(e) => setParty((p) => ({ ...p, city: e.target.value }))} />
                  <input className={inputCls} placeholder="Address" value={party.address} onChange={(e) => setParty((p) => ({ ...p, address: e.target.value }))} />
                  <input className={inputCls} placeholder="Courier service name" value={party.courierServiceName} onChange={(e) => setParty((p) => ({ ...p, courierServiceName: e.target.value }))} />
                  <input className={inputCls} placeholder="Goods adda name" value={party.goodsAddaName} onChange={(e) => setParty((p) => ({ ...p, goodsAddaName: e.target.value }))} />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPartyOpen(false)}>Cancel</Button>
                  <Button type="button" size="sm" disabled={partySaving} onClick={addParty}>{partySaving ? "Saving…" : "Save party"}</Button>
                </div>
              </div>
            ) : null}
            <div className="mt-6 flex w-fit max-w-full gap-1 rounded-lg border-2 border-primary bg-muted p-1.5 shadow-sm" role="group" aria-label="Document type">
              <Button type="button" size="sm" variant={estimate ? "ghost" : "default"} aria-pressed={!estimate} onClick={() => setEstimate(false)} className="min-w-24 shadow-sm">Invoice</Button>
              <Button type="button" size="sm" variant={estimate ? "default" : "ghost"} aria-pressed={estimate} onClick={() => setEstimate(true)} className="min-w-24 shadow-sm">Estimate</Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground"><K>Alt+E</K> switch Invoice / Estimate</p>
            <div className="relative mt-3 max-w-2xl">
            <label className="flex h-11 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCamOpen(true)}
                aria-label="Scan barcode with camera"
                title="Scan barcode with camera"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-md px-1.5 text-primary transition hover:scale-[1.05] hover:bg-accent active:scale-95 motion-reduce:transform-none"
              >
                <ScanBarcode className="size-4" />
              </button>
              <input
                ref={scanRef}
                autoFocus
                value={term}
                role="combobox"
                aria-expanded={dropOpen}
                onChange={(e) => { setTerm(e.target.value); setStaged(null); setPendingNew(null); setHi(-1); setDropOpen(true); resetSf(); }}
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
                    const t = term.trim().toLowerCase();
                    if (staged && t === staged.name.toLowerCase()) {
                      add(staged, undefined, stagedOverrides()); setTerm(""); setStaged(null); setHi(-1); resetSf();
                    } else if (hi >= 0 && list[hi]) {
                      if (pendingCode) saveLink(pendingCode, list[hi]); else stage(list[hi]);
                    } else if (pendingCode) {
                      onScan();
                    } else {
                      const exact = results.find((p) => p.name.toLowerCase() === t);
                      const pick = exact ?? list[0];
                      if (pick) stage(pick); else newOrSave();
                    }
                  }
                }}
                placeholder="Search or scan item"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={confirmStaged}
                aria-label={staged ? `Add ${staged.name} to bill` : "Select first match"}
                title={staged ? `Add ${staged.name} to bill` : "Select first match"}
                className={`inline-flex h-8 shrink-0 items-center justify-center rounded-md px-2 transition hover:scale-[1.05] active:scale-95 motion-reduce:transform-none ${staged ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              >
                <Zap className="size-4" />
              </button>
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
                      onMouseDown={(e) => { e.preventDefault(); if (pendingCode) saveLink(pendingCode, p); else stage(p); }}
                      onMouseEnter={() => setHi(i)}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${i === hi ? "bg-accent text-accent-foreground" : ""}`}
                    >
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{price != null ? `Rs ${money(price)}` : "No rate"} · {p.stock ?? "-"}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground"><K>Alt+S</K> / <K>F4</K> search · <K>Enter</K> select item · <K>Enter</K> again or <K>⚡</K> add to bill · <K>↑</K> <K>↓</K> browse list</p>
            <BarcodeScannerDialog
              open={camOpen}
              onOpenChange={setCamOpen}
              onCode={(code) => {
                setCamOpen(false);
                if (!handleCode(code)) {
                  setPendingCode(code.toUpperCase());
                  toast.error("This barcode is not linked to any product — choose a product to link it");
                }
                scanRef.current?.focus();
              }}
            />
            {staged || (pendingNew && pendingNew === term.trim()) ? (
              <div className="mt-2 rounded-lg border border-primary/50 bg-accent/40 p-2.5">
                <p className="mb-2 text-xs font-semibold text-accent-foreground">
                  <span className="truncate">{(staged?.name ?? pendingNew) || ""}</span>
                  {staged
                    ? <> is ready — edit fields below, then press <K>Enter</K> or ⚡ to add</>
                    : savingNew
                      ? " — Saving…"
                      : <> is not saved — set rate below, then press <K>Enter</K> again or ⚡ to save it to inventory and add it to the bill</>}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Qty</span>
                    <input
                      value={sf.qty}
                      inputMode="decimal"
                      onChange={(e) => {
                        const qty = e.target.value;
                        setSf((s) => {
                          const q = Number(qty), pr = Number(s.price);
                          return { ...s, qty, amount: Number.isFinite(q) && Number.isFinite(pr) && s.price !== "" ? String(r2local(q * pr)) : s.amount };
                        });
                      }}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unit</span>
                    <UnitSelect
                      value={sf.unit}
                      onChange={(v) => setSf((s) => ({ ...s, unit: v }))}
                      className="h-8 w-full rounded-md border border-input bg-background px-1 text-xs outline-none focus:border-ring"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Price/Unit</span>
                    <input
                      value={sf.price}
                      inputMode="decimal"
                      onChange={(e) => {
                        const price = e.target.value;
                        setSf((s) => {
                          const q = Number(s.qty), pr = Number(price);
                          return { ...s, price, amount: Number.isFinite(q) && Number.isFinite(pr) && price !== "" ? String(r2local(q * pr)) : s.amount };
                        });
                      }}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Weight</span>
                    <input
                      value={sf.weight}
                      onChange={(e) => setSf((s) => ({ ...s, weight: e.target.value }))}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Size</span>
                    <input
                      value={sf.size}
                      onChange={(e) => setSf((s) => ({ ...s, size: e.target.value }))}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</span>
                    <input
                      value={sf.amount}
                      inputMode="decimal"
                      onChange={(e) => {
                        const amount = e.target.value;
                        setSf((s) => {
                          const q = Number(s.qty), am = Number(amount);
                          return { ...s, amount, price: Number.isFinite(q) && q > 0 && Number.isFinite(am) && amount !== "" ? String(r2local(am / q)) : s.price };
                        });
                      }}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-semibold outline-none focus:border-ring"
                    />
                  </label>
                </div>
              </div>
            ) : null}
            {pendingCode ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-accent p-2.5 text-xs text-accent-foreground">
                <span>Barcode <b>{pendingCode}</b> is new — search for a product below and press <b>Link</b>, next time scanning will add it directly.</span>
                <Button size="sm" variant="ghost" onClick={() => { setPendingCode(null); setTerm(""); }}>Cancel</Button>
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={toggleGrid}
                aria-expanded={showGrid}
                className="h-8 text-xs"
              >
                <LayoutGrid className="size-3.5" />
                {showGrid ? "Hide shortcuts" : "Show product shortcuts"}
              </Button>
              {pendingCode ? <span className="text-xs text-muted-foreground">List is open for linking</span> : null}
            </div>
            {gridVisible ? (
              <div className="mt-2 grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {results.map((p) => {
                  const price = priceFor(p, rate);
                  return (
                    <Button
                      key={p.name}
                      type="button"
                      variant="outline"
                      onClick={() => (pendingCode ? saveLink(pendingCode, p) : add(p))}
                      disabled={price == null}
                      className="h-auto min-h-16 flex-col items-start whitespace-normal p-2.5 text-left"
                    >
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">{p.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {price != null ? `Rs ${money(price)}` : "No rate"} · stock {p.stock ?? "-"}
                      </p>
                      {pendingCode ? <p className="mt-1 text-xs font-bold text-primary">Link</p> : null}
                    </Button>
                  );
                })}
                {!results.length ? <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No products found. Set product rates and stock in Inventory.</p> : null}
              </div>
            ) : null}
          </section>

          {/* Sale invoice grid — Vyapar jaisi table: # | ITEM | WEIGHT | SIZE | QTY | UNIT | PRICE/UNIT | AMOUNT */}
          <section className="border-y border-border">
            <div className="overflow-x-auto">
            <div className="min-w-[1050px]">
              <div className="grid grid-cols-[36px_minmax(190px,2.4fr)_minmax(92px,0.9fr)_minmax(92px,0.9fr)_minmax(96px,1fr)_minmax(104px,1fr)_minmax(104px,1fr)_minmax(104px,1fr)_42px] border-b border-border bg-surface-2 text-[11px] font-bold uppercase text-muted-foreground">
                <span className="px-2 py-3" />
                <span className="px-2 py-3">Item</span>
                <span className="px-2 py-3">Weight</span>
                <span className="px-2 py-3">Size</span>
                <span className="px-2 py-3 text-center">Qty</span>
                <span className="px-2 py-3">Unit</span>
                <span className="px-2 py-3">Price / unit</span>
                <span className="px-2 py-3 text-right">Amount</span>
                <span />
              </div>
              {cart.map((l, i) => (
                <CartRow key={l.key} index={i + 1} line={l} focus={focusKey === l.key} onFocused={() => setFocusKey(null)} onDone={() => scanRef.current?.focus()} lockPrice={lockPrice} lockDisc={lockDisc} onUnlock={unlock} onPatch={patch} taxRates={cfg.tax.enabled ? cfg.tax.rates : []} onRemove={() => setCart((p) => p.filter((x) => x.key !== l.key))} />
              ))}
              {!cart.length ? <div className="min-h-36 px-4 py-10 text-left text-sm text-muted-foreground">Search an item above to start the invoice.</div> : null}
              <div className="flex items-center justify-between gap-2 border-t border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs uppercase" onClick={() => scanRef.current?.focus()}><Plus /> Add row</Button>
                <span className="hidden sm:inline"><K>Ctrl+Shift+Backspace</K> remove last item</span>
                <span>{cart.length} {cart.length === 1 ? "item" : "items"}</span>
              </div>
              <div className="grid grid-cols-[36px_minmax(190px,2.4fr)_minmax(92px,0.9fr)_minmax(92px,0.9fr)_minmax(96px,1fr)_minmax(104px,1fr)_minmax(104px,1fr)_minmax(104px,1fr)_42px] border-t border-border bg-surface-2 text-sm font-semibold text-foreground">
                <span className="col-span-4 px-2 py-2.5 pr-4 text-right text-[11px] font-bold uppercase text-muted-foreground">Total</span>
                <span className="px-2 py-2.5 text-center">{qtyTotal ? money(qtyTotal) : ""}</span>
                <span className="px-2 py-2.5" />
                <span className="px-2 py-2.5" />
                <span className="px-2 py-2.5 text-right">{money(total)}</span>
                <span />
              </div>
            </div>
            </div>
          </section>

          <section className="grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:gap-12">
            <div className="space-y-4">
              <label className="block text-xs text-muted-foreground">Invoice note<input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — will print on bill" /></label>
              <div ref={payRef} className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-bold text-foreground">Payment {pays.length > 1 ? "(split)" : ""} <span className="font-normal text-muted-foreground">— F8 / Alt+M</span></p>
                {pays.map((p, i) => (
                  <div key={i} className="flex gap-1.5">
                    <select className="h-10 rounded-lg border border-border bg-background px-2 text-sm" value={p.method} onChange={(e) => setPays((all) => all.map((x, j) => (j === i ? { ...x, method: e.target.value as PayMethod } : x)))} aria-label="Payment method">
                      {cfg.payMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input className={inputCls} value={p.amount} inputMode="decimal" placeholder={i === 0 && pays.length === 1 ? `${money(total)} (full)` : "0"} onChange={(e) => setPays((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label="Amount" />
                    {pays.length > 1 ? <Button size="icon" variant="ghost" onClick={() => setPays((all) => all.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button> : null}
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setPays((all) => [...all, { method: all.some((x) => x.method === "Cash") ? "Bank" : "Cash", amount: "" }])}><Plus /> Split payment</Button>
                  <Button size="sm" variant="outline" onClick={() => setPays([{ method: "Credit", amount: "" }])}>Full credit</Button>
                </div>
              </div>
              {balance?.found ? <div className={`border-t border-border pt-3 text-xs ${balance.balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>Previous balance: <b>Rs {money(balance.balance)}</b>{balance.creditLimit ? ` · Credit limit Rs ${money(balance.creditLimit)}` : ""}</div> : null}
            </div>
            <div className="space-y-4">

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">
                <span className="flex items-center justify-between">Bill discount
                  <span className="flex gap-0.5">
                    {(["amt", "pct"] as const).map((k) => (
                      <Button key={k} type="button" size="sm" variant={discType === k ? "default" : "ghost"} onClick={() => setDiscType(k)} className="h-6 px-2 text-[10px]">{k === "amt" ? "Rs" : "%"}</Button>
                    ))}
                  </span>
                </span>
                <input className={inputCls} value={billDiscount} readOnly={lockDisc} onFocus={() => { if (lockDisc) void unlock(); }} onChange={(e) => setBillDiscount(e.target.value)} inputMode="decimal" placeholder={lockDisc ? "PIN" : "0"} />
              </label>
              <label className="text-xs text-muted-foreground">Delivery<input className={inputCls} value={delivery} onChange={(e) => setDelivery(e.target.value)} inputMode="decimal" placeholder="0" /></label>
            </div>

            <div className="space-y-2 border-t border-border pt-4 text-sm">
              <Row a="Subtotal" b={`Rs ${money(subtotal)}`} />
              {itemDiscount ? <Row a="Item discounts" b={`- Rs ${money(itemDiscount)}`} /> : null}
              {taxTotal ? <Row a="Tax" b={`Rs ${money(taxTotal)}`} /> : null}
              {discAmt ? <Row a="Bill discount" b={`- Rs ${money(discAmt)}`} /> : null}
              {n(delivery) ? <Row a="Delivery" b={`Rs ${money(n(delivery))}`} /> : null}
              <Row a="Grand Total" b={`Rs ${money(total)}`} bold />
              <Row a="Paid" b={`Rs ${money(Math.min(paidNum, total))}`} />
              {paidNum > total ? <Row a="Change due" b={`Rs ${money(paidNum - total)}`} /> : null}
              {paidNum < total ? <Row a="Outstanding (credit)" b={`Rs ${money(total - paidNum)}`} /> : null}
            </div>

            {editing ? <p className="rounded-lg bg-accent p-2 text-xs text-accent-foreground">Open: <b>{editing.number}</b> — this will close when saved. <button className="underline" onClick={() => setEditing(null)}>Detach</button></p> : null}

            <Button size="lg" className="h-12 w-full text-base" disabled={!cart.length || saving} onClick={() => checkout("sale", true)}><Printer /> {estimate ? "Save Estimate" : "Save + Print (F9)"} — Rs {money(total)}</Button>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" disabled={!cart.length || saving} onClick={() => checkout("sale", false)}><Save /> Save</Button>
              <Button variant="outline" disabled={!cart.length || saving} onClick={() => checkout("held", false)}><Pause /> Hold (F10)</Button>
              <Button variant="outline" disabled={!cart.length || saving} onClick={() => checkout("quotation", false)}><FileText /> Quotation</Button>
            </div>
            <p className="text-[11px] text-muted-foreground"><K>Ctrl+S</K> / <K>F9</K> save + print · <K>Ctrl+Enter</K> save without print · <K>Ctrl+Shift+H</K> hold · <K>Alt+N</K> new bill</p>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDocsOpen("held")}><FolderOpen /> Held bills</Button>
              <Button variant="ghost" size="sm" onClick={() => setDocsOpen("quotation")}><FolderOpen /> Quotations</Button>
              <Button variant="ghost" size="sm" onClick={() => reset()}><RotateCcw /> New (F2)</Button>
            </div>
            <p className="text-[11px] text-muted-foreground"><K>Alt+H</K> held bills · <K>Alt+Q</K> quotations · <K>F1</K> full shortcut guide</p>

            {last ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
                <span className="font-semibold">Last: {last.invoiceNumber}</span>
                <Button size="sm" variant="outline" onClick={() => lastDoc && pc.print(lastDoc, { reprint: true })}><Printer /> Reprint</Button>
                <Button size="sm" variant="outline" onClick={() => lastDoc && pc.preview(lastDoc, true)}><ReceiptText /> Preview</Button>
                <Button size="sm" variant="outline" onClick={() => lastDoc && pc.pdf(lastDoc)}><Download /> PDF</Button>
                <Button size="sm" variant="outline" onClick={() => share(last)}><Share2 /> Share</Button>
                <Button size="sm" variant="outline" onClick={() => whatsapp(last)}><MessageCircle /> WhatsApp</Button>
              </div>
            ) : null}

            {docsOpen ? (
              <DocsList kind={docsOpen} onClose={() => setDocsOpen(null)} onOpen={openDoc} />
            ) : null}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

/** Cart ki ek line — #, item, weight, size, qty, unit, rate, discount, tax, note aur total sab manually likhe ja sakte hain. */
function CartRow({ index, line, focus, onFocused, onDone, onPatch, onRemove, lockPrice = false, lockDisc = false, onUnlock, taxRates = [] }: { index: number; line: CartLine; focus?: boolean; onFocused?: () => void; onDone?: () => void; onPatch: (key: string, v: Partial<CartLine>) => void; onRemove: () => void; lockPrice?: boolean; lockDisc?: boolean; onUnlock?: () => void; taxRates?: { name: string; pct: number }[] }) {
  const [totalText, setTotalText] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(!!line.note);
  const qtyRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus && qtyRef.current) { qtyRef.current.focus(); qtyRef.current.select(); onFocused?.(); }
  }, [focus, onFocused]);
  const total = lineTotal(line);
  const setTotal = (raw: string) => {
    setTotalText(raw);
    const t = line.taxIncl ? n(raw) : n(raw) / (1 + (line.taxPercent || 0) / 100);
    const q = line.qty || 1;
    onPatch(line.key, { price: Math.round(((t + (line.discount || 0)) / q) * 100) / 100, priceManual: true });
  };
  const small = "h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary";
  return (
    <div className="border-b border-border even:bg-surface/60">
      <div className="grid grid-cols-[36px_minmax(190px,2.4fr)_minmax(92px,0.9fr)_minmax(92px,0.9fr)_minmax(96px,1fr)_minmax(104px,1fr)_minmax(104px,1fr)_minmax(104px,1fr)_42px] items-center text-sm">
        <div className="px-1 text-center text-xs font-semibold text-muted-foreground">{index}</div>
        <div className="min-w-0 px-2 py-2">
          <p className="truncate font-semibold text-foreground" title={line.name}>{line.name}{isWholesale(line) ? <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-primary">Wholesale</span> : null}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-6 px-0 text-xs text-muted-foreground" onClick={() => setShowNote((v) => !v)}><StickyNote className="size-3" /> {line.note ? "Edit note" : "Add note"}</Button>
            {line.priceManual ? <Button size="sm" variant="ghost" className="h-6 px-0 text-xs text-muted-foreground" onClick={() => onPatch(line.key, { priceManual: false })}>Auto rate</Button> : null}
          </div>
        </div>
        <div className="px-2"><input className={`${small} w-full`} value={line.weight ?? ""} placeholder="—" onChange={(e) => onPatch(line.key, { weight: e.target.value })} aria-label="Weight" /></div>
        <div className="px-2"><input className={`${small} w-full`} value={line.size ?? ""} placeholder="—" onChange={(e) => onPatch(line.key, { size: e.target.value })} aria-label="Size" /></div>
        <div className="flex items-center gap-0.5 px-1">
          <Button size="icon-sm" variant="ghost" className="h-7 w-6" onClick={() => onPatch(line.key, { qty: Math.max(0.001, +(line.qty - 1).toFixed(3)) || 1 })} aria-label="Decrease"><Minus /></Button>
          <input ref={qtyRef} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setQtyText(null); onDone?.(); } }} className={`${small} w-full text-center`} value={qtyText ?? String(line.qty)} inputMode="decimal" onChange={(e) => { setQtyText(e.target.value); onPatch(line.key, { qty: n(e.target.value) }); }} onBlur={() => setQtyText(null)} aria-label="Qty" title="Quantity (0.5, 1.25 kg too)" />
          <Button size="icon-sm" variant="ghost" className="h-7 w-6" onClick={() => onPatch(line.key, { qty: +(line.qty + 1).toFixed(3) })} aria-label="Increase"><Plus /></Button>
        </div>
        <div className="px-2"><UnitSelect className={`${small} w-full`} value={line.unitOverride?.trim() || line.unit || ""} onChange={(v) => onPatch(line.key, { unitOverride: v === line.unit ? undefined : v })} /></div>
        <div className="px-2"><input className={`${small} w-full text-right ${isWholesale(line) ? "border-primary text-primary" : ""}`} value={String(line.price)} readOnly={lockPrice} onFocus={() => { if (lockPrice) onUnlock?.(); }} inputMode="decimal" onChange={(e) => onPatch(line.key, { price: n(e.target.value), priceManual: true })} aria-label="Rate" title={line.wholesaleMinQty ? `Wholesale rate applies from qty ${line.wholesaleMinQty}` : undefined} /></div>
        <div className="px-2"><input className={`${small} w-full text-right font-semibold text-foreground`} value={totalText ?? String(total)} readOnly={lockPrice} onFocus={() => { if (lockPrice) onUnlock?.(); }} inputMode="decimal" onChange={(e) => setTotal(e.target.value)} onBlur={() => setTotalText(null)} aria-label="Total" /></div>
        <Button size="icon-sm" variant="ghost" className="h-9 w-9" onClick={onRemove} aria-label="Remove"><Trash2 /></Button>
      </div>
      {(showNote || taxRates.length > 0 || line.discount > 0) ? <div className="flex flex-wrap items-end gap-3 px-10 pb-2">
        {showNote ? <input className={`${small} min-w-44 flex-1`} value={line.note ?? ""} placeholder="Item note (will print on receipt)" onChange={(e) => onPatch(line.key, { note: e.target.value })} aria-label="Item note" /> : null}
        <label className="text-[11px] text-muted-foreground">Discount<input className={`${small} block w-20`} value={line.discount ? String(line.discount) : ""} placeholder="0" readOnly={lockDisc} onFocus={() => { if (lockDisc) onUnlock?.(); }} inputMode="decimal" onChange={(e) => onPatch(line.key, { discount: n(e.target.value) })} aria-label="Discount" /></label>
        {taxRates.length ? <label className="text-[11px] text-muted-foreground">Tax<select className={`${small} block w-24`} value={line.taxPercent ?? 0} onChange={(e) => onPatch(line.key, { taxPercent: Number(e.target.value) })} aria-label="Tax">{[...taxRates, ...(taxRates.some((t) => t.pct === (line.taxPercent ?? 0)) ? [] : [{ name: `${line.taxPercent}%`, pct: line.taxPercent ?? 0 }])].map((t) => <option key={t.name + t.pct} value={t.pct}>{t.name}</option>)}</select></label> : null}
      </div> : <div className="px-10 pb-2"><Button size="sm" variant="ghost" className="h-6 px-0 text-xs text-muted-foreground" onClick={() => setShowNote(true)}>Discount / details</Button></div>}
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

function PosAlerts({ cfg, products, credit }: { cfg: ReturnType<typeof usePosAccess>["cfg"]; products: DbProduct[]; credit: { limit: number; after: number } | null }) {
  const low = cfg.notify.lowStock && cfg.inventory.trackStock ? products.filter((p) => p.stock != null && p.stock > 0 && p.stock <= cfg.inventory.lowStockThreshold).length : 0;
  const { data: sync } = useQuery({ queryKey: ["sync-overview"], queryFn: () => getSyncOverview(), enabled: cfg.notify.syncFailed, staleTime: 5 * 60_000 });
  const lastSync = sync?.logs[0];
  const syncBad = cfg.notify.syncFailed && lastSync && (lastSync.status !== "success" || lastSync.errors > 0);
  if (!low && !credit && !syncBad) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {credit && cfg.notify.creditLimit ? <span className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-destructive">Credit limit {money(credit.limit)} — outstanding after this bill {money(credit.after)}{cfg.sales.enforceCreditLimit ? " (will not save)" : ""}</span> : null}
      {low ? <Link to="/inventory" className="rounded-full border border-border bg-muted px-3 py-1 text-foreground">{low} products low stock (≤ {cfg.inventory.lowStockThreshold})</Link> : null}
      {syncBad ? <Link to="/sync" className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-destructive">Vyapar sync issue: {lastSync!.status} · {lastSync!.errors} errors</Link> : null}
    </div>
  );
}

/** Chhota kbd chip — section-wise shortcut hints ke liye. */
function K({ children }: { children: string }) {
  return <kbd className="whitespace-nowrap rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-foreground">{children}</kbd>;
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  { group: "Navigation", items: [["Tab / Shift+Tab", "Move to next / previous field or button"], ["Enter / Space", "Press the focused button"], ["Alt+C", "Customer name"], ["Alt+S or F4", "Item search"], ["Alt+M or F8", "Payment"], ["Esc", "Close popup / search list"]] },
  { group: "Items", items: [["↑ / ↓", "Move in search results"], ["Enter", "Select item — lands in search bar"], ["Enter again / ⚡", "Add selected item to bill"], ["Enter (in qty)", "Back to search"], ["Ctrl+Shift+Backspace", "Remove last item"]] },
  { group: "Bill", items: [["Alt+E", "Switch Invoice / Estimate"], ["Alt+P", "Add new party"], ["Ctrl+S or F9", "Save + Print"], ["Ctrl+Enter", "Save without print"], ["Ctrl+Shift+H or F10", "Hold bill"], ["Alt+N or F2", "New bill"]] },
  { group: "Lists & help", items: [["Alt+H", "Held bills"], ["Alt+Q", "Quotations / estimates"], ["F1, Alt+K or Ctrl+/", "Open / close this guide"]] },
];

function ShortcutGuide({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Keyboard shortcuts</h2>
          <Button ref={ref} size="sm" variant="outline" onClick={onClose}>Close (Esc)</Button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {SHORTCUTS.map((g) => (
            <div key={g.group}>
              <p className="mb-2 text-xs font-bold uppercase text-primary">{g.group}</p>
              <ul className="space-y-1.5">
                {g.items.map(([k, d]) => (
                  <li key={k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{d}</span>
                    <kbd className="whitespace-nowrap rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-foreground">{k}</kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
