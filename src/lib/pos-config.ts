/** Business / POS configuration — workspace-level, pos_settings.config (JSONB) me save hoti hai. Client-safe. */

export type PaperFormat = "a4" | "a5" | "t58" | "t80" | "custom";
export type TemplateId = "modern" | "classic" | "compact" | "minimal" | "retail" | "thermal";
export type PrintBehavior = "auto" | "ask" | "never";
export type DocKind =
  | "pos" | "sale" | "quotation" | "return" | "purchase" | "purchase_return"
  | "statement" | "receipt" | "expense" | "report";
export type PrinterRole = "sales" | "pos" | "a4" | "a5" | "thermal" | "report";
export type ColKey = "sku" | "barcode" | "unit" | "qty" | "rate" | "discount" | "tax";
export type FieldKey =
  | "logo" | "businessName" | "address" | "phone" | "email" | "website" | "taxId"
  | "title" | "number" | "dateTime" | "customer" | "customerPhone" | "customerAddress"
  | "subtotal" | "paid" | "balance" | "paymentMethod" | "notes" | "terms" | "footer" | "signature";

export const INVOICE_FONTS = {
  default: "Template default", arial: "Arial", georgia: "Georgia", times: "Times New Roman",
  courier: "Courier New", verdana: "Verdana", tahoma: "Tahoma", trebuchet: "Trebuchet MS",
} as const;
export type InvoiceFont = keyof typeof INVOICE_FONTS;
export const INVOICE_TEXT_FIELDS = {
  businessName: "Business name", address: "Business address", phone: "Business phone", email: "Business email",
  website: "Website", taxId: "NTN/GST", title: "Invoice title", number: "Invoice number", dateTime: "Date & time",
  customer: "Customer name", customerPhone: "Customer phone", customerAddress: "Customer address", meta: "Other details",
  tableHeader: "Item table headings", item: "Product name", sku: "SKU", barcode: "Barcode", unit: "Unit",
  qty: "Quantity", rate: "Rate", discount: "Discount", tax: "Tax", amount: "Item amount",
  subtotal: "Subtotal", totals: "Other totals", grandTotal: "Grand total", paid: "Paid", balance: "Balance",
  paymentMethod: "Payment method", notes: "Notes", terms: "Terms", footer: "Footer", signature: "Signature",
} as const;
export type InvoiceTextField = keyof typeof INVOICE_TEXT_FIELDS;

export type PrinterCfg = {
  id: string;
  name: string;
  type: "thermal" | "a4" | "a5" | "label" | "other";
  paper: PaperFormat;
  /** Windows printer ka exact naam — sirf desktop app me silent print ke liye. */
  deviceName?: string;
  copies?: number;
};

export type TaxRate = { name: string; pct: number };

export type PosConfig = {
  // legacy (Phase 6)
  receiptBusiness?: string;
  receiptFooter?: string;
  terms?: string;
  defaultPayMethod?: string;
  defaultTax?: number;
  decimals?: number;
  lowStockDefault?: number;

  business?: {
    name?: string; address?: string; phone?: string; email?: string; website?: string; taxId?: string;
    logo?: string; currencySymbol?: string;
    dateFormat?: "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd"; timeFormat?: "12" | "24"; timezone?: string;
  };
  numbering?: { salePrefix?: string; quotePrefix?: string; returnPrefix?: string; purchasePrefix?: string; purchaseReturnPrefix?: string };
  sales?: {
    requireCustomerForCredit?: boolean; enforceCreditLimit?: boolean; maxCashierDiscountPct?: number | null;
    defaultRateType?: "sale" | "p100" | "p250" | "p500"; keepCustomerAfterSale?: boolean; autoPdf?: boolean; confirmBeforeSave?: boolean;
  };
  inventory?: {
    trackStock?: boolean; allowNegativeStock?: boolean; lowStockThreshold?: number; defaultUnit?: string;
    allowFractional?: boolean; qtyDecimals?: number; warnOutOfStock?: boolean;
  };
  customers?: { requirePhoneForCredit?: boolean; defaultCreditLimit?: number | null; reminderText?: string };
  payments?: { enabled?: string[]; custom?: string[]; default?: string };
  tax?: { enabled?: boolean; inclusive?: boolean; rates?: TaxRate[]; defaultPct?: number };
  pos?: { autoFocusSearch?: boolean; showGrid?: boolean; scanAutoAdd?: boolean; shortcuts?: boolean };
  printing?: {
    defaults?: Partial<Record<DocKind, PaperFormat>>;
    templates?: Partial<Record<PaperFormat, TemplateId>>;
    behavior?: Partial<Record<"pos" | "sale" | "quotation" | "return" | "purchase" | "receipt", PrintBehavior>>;
    fields?: Partial<Record<FieldKey, boolean>>;
    columns?: Partial<Record<ColKey, boolean>>;
    colWidths?: Partial<Record<"item" | ColKey | "total", number>>;
    layout?: {
      marginTop?: number; marginBottom?: number; marginLeft?: number; marginRight?: number;
      fontPt?: number; tableFontPt?: number; headerPt?: number; footerPt?: number;
      logoMm?: number; logoAlign?: "left" | "center" | "right"; lineHeight?: number; copies?: number;
    };
    a5?: {
      orientation?: "portrait" | "landscape"; marginMm?: number; fontPt?: number; logoMm?: number;
      columns?: Partial<Record<ColKey, boolean>>; footer?: string; signature?: boolean;
    };
    thermal?: {
      fontPt?: number; showQtyRate?: boolean; boldTotal?: boolean; showBarcode?: boolean; showQr?: boolean;
      showCustomer?: boolean; footer?: string; feedLines?: number; marginMm?: number;
    };
    custom?: { widthMm?: number; heightMm?: number | null };
    signatureLabel?: string;
    preset?: string;
    fontFamily?: InvoiceFont;
    fontSizes?: Partial<Record<InvoiceTextField, number>>;
  };
  printers?: PrinterCfg[];
  printerDefaults?: Partial<Record<PrinterRole, string>>;
  notify?: { lowStock?: boolean; paymentReminders?: boolean; creditLimit?: boolean; syncFailed?: boolean; printErrors?: boolean; txErrors?: boolean };
};

export const BASE_PAY_METHODS = ["Cash", "Card", "Bank", "JazzCash", "Easypaisa", "Credit", "Other"] as const;
export const DEFAULT_TAX_RATES: TaxRate[] = [
  { name: "No tax", pct: 0 }, { name: "GST 5%", pct: 5 }, { name: "GST 13%", pct: 13 }, { name: "GST 16%", pct: 16 }, { name: "GST 17%", pct: 17 }, { name: "GST 18%", pct: 18 },
];

export const FORMAT_LABEL: Record<PaperFormat, string> = { a4: "A4", a5: "A5", t58: "Thermal 58mm", t80: "Thermal 80mm", custom: "Custom" };
export const TEMPLATE_LABEL: Record<TemplateId, string> = { modern: "Modern", classic: "Classic", compact: "Compact", minimal: "Minimal", retail: "Retail", thermal: "Thermal" };
export const DOC_LABEL: Record<DocKind, string> = {
  pos: "POS receipt", sale: "Sales invoice", quotation: "Quotation", return: "Sales return", purchase: "Purchase", purchase_return: "Purchase return",
  statement: "Customer / supplier statement", receipt: "Payment receipt", expense: "Expense receipt", report: "Reports",
};
export const ROLE_LABEL: Record<PrinterRole, string> = { sales: "Sales printer", pos: "POS printer", a4: "A4 printer", a5: "A5 printer", thermal: "Thermal printer", report: "Report printer" };

const DEFAULT_FORMATS: Record<DocKind, PaperFormat> = {
  pos: "t80", sale: "a4", quotation: "a4", return: "t80", purchase: "a4", purchase_return: "a4", statement: "a4", receipt: "t80", expense: "t80", report: "a4",
};
const DEFAULT_TEMPLATES: Record<PaperFormat, TemplateId> = { a4: "modern", a5: "compact", t58: "thermal", t80: "thermal", custom: "minimal" };

/** Sab defaults ke saath resolved view (undefined kabhi nahi). */
export function resolveCfg(c: PosConfig = {}) {
  const pr = c.printing ?? {};
  const payEnabled = c.payments?.enabled ?? [...BASE_PAY_METHODS];
  const methods = [...payEnabled, ...(c.payments?.custom ?? [])].filter((m, i, a) => m && a.indexOf(m) === i);
  const taxRates = c.tax?.rates?.length ? c.tax.rates : DEFAULT_TAX_RATES;
  return {
    raw: c,
    business: {
      name: c.business?.name || c.receiptBusiness || "",
      address: c.business?.address ?? "", phone: c.business?.phone ?? "", email: c.business?.email ?? "", website: c.business?.website ?? "",
      taxId: c.business?.taxId ?? "", logo: c.business?.logo ?? "",
      currencySymbol: c.business?.currencySymbol ?? "", dateFormat: c.business?.dateFormat ?? "dd/mm/yyyy", timeFormat: c.business?.timeFormat ?? "12",
      timezone: c.business?.timezone ?? "Asia/Karachi",
    },
    decimals: c.decimals ?? 2,
    terms: c.terms ?? "",
    footer: c.receiptFooter ?? "",
    sales: { requireCustomerForCredit: c.sales?.requireCustomerForCredit ?? true, enforceCreditLimit: !!c.sales?.enforceCreditLimit, maxCashierDiscountPct: c.sales?.maxCashierDiscountPct ?? null, defaultRateType: c.sales?.defaultRateType ?? "sale", keepCustomerAfterSale: !!c.sales?.keepCustomerAfterSale, autoPdf: !!c.sales?.autoPdf, confirmBeforeSave: !!c.sales?.confirmBeforeSave },
    inventory: { trackStock: c.inventory?.trackStock ?? true, allowNegativeStock: c.inventory?.allowNegativeStock ?? true, lowStockThreshold: c.inventory?.lowStockThreshold ?? c.lowStockDefault ?? 5, defaultUnit: c.inventory?.defaultUnit ?? "kg", allowFractional: c.inventory?.allowFractional ?? true, qtyDecimals: c.inventory?.qtyDecimals ?? 3, warnOutOfStock: c.inventory?.warnOutOfStock ?? true },
    customers: { requirePhoneForCredit: !!c.customers?.requirePhoneForCredit, defaultCreditLimit: c.customers?.defaultCreditLimit ?? null, reminderText: c.customers?.reminderText ?? "" },
    payMethods: methods.length ? methods : ["Cash"],
    defaultPay: c.payments?.default || c.defaultPayMethod || "Cash",
    tax: { enabled: c.tax?.enabled ?? true, inclusive: !!c.tax?.inclusive, rates: taxRates, defaultPct: c.tax?.defaultPct ?? c.defaultTax ?? 0 },
    pos: { autoFocusSearch: c.pos?.autoFocusSearch ?? true, showGrid: c.pos?.showGrid ?? false, scanAutoAdd: c.pos?.scanAutoAdd ?? true, shortcuts: c.pos?.shortcuts ?? true },
    printing: {
      defaults: { ...DEFAULT_FORMATS, ...(pr.defaults ?? {}) } as Record<DocKind, PaperFormat>,
      templates: { ...DEFAULT_TEMPLATES, ...(pr.templates ?? {}) } as Record<PaperFormat, TemplateId>,
      behavior: { pos: "auto", sale: "ask", quotation: "ask", return: "ask", purchase: "never", receipt: "ask", ...(pr.behavior ?? {}) } as Record<"pos" | "sale" | "quotation" | "return" | "purchase" | "receipt", PrintBehavior>,
      fields: new Proxy(pr.fields ?? {}, { get: (t, k: string) => (t as Record<string, boolean | undefined>)[k] ?? true }) as Record<FieldKey, boolean>,
      columns: { sku: false, barcode: false, unit: true, qty: true, rate: true, discount: true, tax: true, ...(pr.columns ?? {}) } as Record<ColKey, boolean>,
      colWidths: pr.colWidths ?? {},
      layout: { marginTop: 12, marginBottom: 12, marginLeft: 12, marginRight: 12, fontPt: 10, tableFontPt: 9.5, headerPt: 18, footerPt: 8.5, logoMm: 18, logoAlign: "left" as const, lineHeight: 1.35, copies: 1, ...(pr.layout ?? {}) },
      a5: { orientation: "portrait" as const, marginMm: 7, fontPt: 8.5, logoMm: 12, footer: "", signature: false, ...(pr.a5 ?? {}), columns: { sku: false, barcode: false, unit: true, qty: true, rate: true, discount: false, tax: false, ...(pr.a5?.columns ?? {}) } as Record<ColKey, boolean> },
      thermal: { fontPt: 8.5, showQtyRate: true, boldTotal: true, showBarcode: false, showQr: false, showCustomer: true, footer: "", feedLines: 3, marginMm: 2, ...(pr.thermal ?? {}) },
      custom: { widthMm: 100, heightMm: null as number | null, ...(pr.custom ?? {}) },
      signatureLabel: pr.signatureLabel ?? "Authorized signature",
      fontFamily: pr.fontFamily ?? "default",
      fontSizes: pr.fontSizes ?? {},
    },
    printers: c.printers ?? [],
    printerDefaults: c.printerDefaults ?? {},
    notify: { lowStock: true, paymentReminders: true, creditLimit: true, syncFailed: true, printErrors: true, txErrors: true, ...(c.notify ?? {}) },
  };
}
export type ResolvedCfg = ReturnType<typeof resolveCfg>;

/** Nested path par value set (immutable). */
export function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  let cur = out;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else { cur[k] = { ...((cur[k] as Record<string, unknown>) ?? {}) }; cur = cur[k] as Record<string, unknown>; }
  });
  return out as T;
}
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function formatDate(d: Date, cfg: ResolvedCfg, withTime = true) {
  const tz = cfg.business.timezone;
  let parts: Record<string, string> = {};
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: cfg.business.timeFormat === "12" }).formatToParts(d).map((p) => [p.type, p.value]));
  } catch {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: cfg.business.timeFormat === "12" }).formatToParts(d).map((p) => [p.type, p.value]));
  }
  const date = cfg.business.dateFormat === "mm/dd/yyyy" ? `${parts.month}/${parts.day}/${parts.year}` : cfg.business.dateFormat === "yyyy-mm-dd" ? `${parts.year}-${parts.month}-${parts.day}` : `${parts.day}/${parts.month}/${parts.year}`;
  return withTime ? `${date} ${parts.hour}:${parts.minute}${parts.dayPeriod ? ` ${parts.dayPeriod.toUpperCase()}` : ""}` : date;
}
