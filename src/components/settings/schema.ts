import { DOC_LABEL, FORMAT_LABEL, TEMPLATE_LABEL, type DocKind, type PaperFormat, type TemplateId } from "@/lib/pos-config";

export type SectionId =
  | "business" | "pos" | "sales" | "purchases" | "inventory" | "customers" | "suppliers" | "payments" | "taxes"
  | "invoices" | "printing" | "printers" | "users" | "notifications" | "backup" | "vyapar" | "audit" | "advanced";

export const SECTIONS: { id: SectionId; label: string; keywords: string }[] = [
  { id: "business", label: "Business", keywords: "business name logo address phone email website ntn gst tax id currency" },
  { id: "pos", label: "POS", keywords: "pos billing barcode scanner search grid shortcuts keyboard cart" },
  { id: "sales", label: "Sales", keywords: "sales credit udhaar discount cashier limit invoice numbering confirmation pdf after sale customer" },
  { id: "purchases", label: "Purchases", keywords: "purchase numbering prefix supplier" },
  { id: "inventory", label: "Inventory", keywords: "inventory stock negative low stock unit fractional decimal barcode out of stock" },
  { id: "customers", label: "Customers", keywords: "customer phone credit limit reminder opening balance" },
  { id: "suppliers", label: "Suppliers", keywords: "supplier payable ledger" },
  { id: "payments", label: "Payments", keywords: "payment method cash card bank jazzcash easypaisa credit custom default" },
  { id: "taxes", label: "Taxes", keywords: "tax gst sales tax inclusive exclusive rate percentage" },
  { id: "invoices", label: "Invoices", keywords: "invoice template fields logo signature terms footer columns sku barcode discount tax show hide" },
  { id: "printing", label: "Printing", keywords: "print printing paper a4 a5 58mm 80mm thermal custom margin font copies auto print preview template design" },
  { id: "printers", label: "Printers", keywords: "printer printers default test print thermal a4 a5 silent desktop" },
  { id: "users", label: "Users & Permissions", keywords: "user staff role permission pin manager cashier salesman" },
  { id: "notifications", label: "Notifications", keywords: "notification alert low stock reminder credit limit sync failed printer error" },
  { id: "backup", label: "Backup & Data", keywords: "backup export csv excel data import products customers sales" },
  { id: "vyapar", label: "Vyapar Sync", keywords: "vyapar sync products history error retry automatic manual" },
  { id: "audit", label: "Audit Logs", keywords: "audit log history reprint cancellation settings change price discount" },
  { id: "advanced", label: "Advanced", keywords: "advanced decimal precision timezone date format time currency formatting api session" },
];

export type Field = {
  s: SectionId;
  path: string;
  label: string;
  type: "bool" | "number" | "text" | "select" | "textarea";
  options?: { v: string; l: string }[];
  help?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Badalne par confirmation dikhai jaye (asar ki wazahat) */
  danger?: string;
  nullable?: boolean;
  def?: unknown;
};

const fmtOpts = (Object.keys(FORMAT_LABEL) as PaperFormat[]).map((f) => ({ v: f, l: FORMAT_LABEL[f] }));
const tplOpts = (Object.keys(TEMPLATE_LABEL) as TemplateId[]).map((t) => ({ v: t, l: TEMPLATE_LABEL[t] }));
const behOpts = [{ v: "auto", l: "Seedha print karein" }, { v: "ask", l: "Pehle preview / poochein" }, { v: "never", l: "Print na karein" }];

export const FIELDS: Field[] = [
  // Business
  { s: "business", path: "business.name", label: "Business name (print par)", type: "text", placeholder: "HB Chemicals Pakistan" },
  { s: "business", path: "business.address", label: "Address", type: "textarea" },
  { s: "business", path: "business.phone", label: "Phone", type: "text" },
  { s: "business", path: "business.email", label: "Email", type: "text" },
  { s: "business", path: "business.website", label: "Website", type: "text" },
  { s: "business", path: "business.taxId", label: "NTN / GST number", type: "text" },
  { s: "business", path: "business.currencySymbol", label: "Currency symbol (print par)", type: "text", placeholder: "Rs", danger: "Currency symbol badalne se naye invoices aur receipts par naya symbol chhapega. Purane records ki raqam nahi badlegi." },

  // POS
  { s: "pos", path: "pos.autoFocusSearch", label: "Search box par auto-focus", type: "bool", def: true, help: "Sale ke baad cursor seedha product search me" },
  { s: "pos", path: "pos.scanAutoAdd", label: "Barcode scan par product seedha cart me", type: "bool", def: true, help: "Dobara scan = quantity +1" },
  { s: "pos", path: "pos.showGrid", label: "Product shortcut grid default dikhayein", type: "bool", def: false },
  { s: "pos", path: "pos.shortcuts", label: "Keyboard shortcuts (F2/F4/F8/F9/F10)", type: "bool", def: true },
  { s: "pos", path: "sales.keepCustomerAfterSale", label: "Sale ke baad customer rehne dein", type: "bool", def: false, help: "Off = har sale ke baad naya bill (New Sale)" },

  // Sales
  { s: "sales", path: "sales.requireCustomerForCredit", label: "Udhaar / credit sale ke liye customer zaroori", type: "bool", def: true, help: "Server par check hota hai" },
  { s: "sales", path: "sales.enforceCreditLimit", label: "Credit limit sakhti se lagayein", type: "bool", def: false, help: "Limit se zyada udhaar par bill save nahi hoga (server check)", danger: "Credit limit on karne se jin customers ka baqaya limit se zyada hai unhein naya udhaar nahi diya ja sakega." },
  { s: "sales", path: "sales.maxCashierDiscountPct", label: "Cashier/Salesman max discount %", type: "number", min: 0, max: 100, nullable: true, placeholder: "Koi limit nahi", help: "Admin/Manager par lagu nahi. Server par check." },
  { s: "sales", path: "sales.defaultRateType", label: "Default price level", type: "select", options: [{ v: "sale", l: "Sale price" }, { v: "p100", l: "Staff 100g" }, { v: "p250", l: "Staff 250g" }, { v: "p500", l: "Staff 500g" }], def: "sale" },
  { s: "sales", path: "sales.confirmBeforeSave", label: "Bill save se pehle confirm karein", type: "bool", def: false },
  { s: "sales", path: "sales.autoPdf", label: "Sale ke baad PDF auto download", type: "bool", def: false },
  { s: "sales", path: "numbering.salePrefix", label: "Invoice number prefix", type: "text", placeholder: "INV-", help: "Sirf naye bills par. Number sequence wahi chalta rehta hai.", danger: "Invoice prefix badalne se sirf NAYE invoices naye prefix se banenge. Purane invoice numbers bilkul nahi badlenge." },
  { s: "sales", path: "numbering.quotePrefix", label: "Quotation prefix", type: "text", placeholder: "QT-" },
  { s: "sales", path: "numbering.returnPrefix", label: "Sales return prefix", type: "text", placeholder: "SR-" },

  // Purchases
  { s: "purchases", path: "numbering.purchasePrefix", label: "Purchase number prefix", type: "text", placeholder: "PUR-" },
  { s: "purchases", path: "numbering.purchaseReturnPrefix", label: "Purchase return prefix", type: "text", placeholder: "PR-" },

  // Inventory
  { s: "inventory", path: "inventory.trackStock", label: "Stock tracking", type: "bool", def: true, danger: "Stock tracking band karne se sale/purchase par stock kam/zyada NAHI hoga jab tak dobara on na karein. Mojooda stock nahi badlega." },
  { s: "inventory", path: "inventory.allowNegativeStock", label: "Negative stock allow (stock se zyada bechna)", type: "bool", def: true, help: "Off = kam stock par 'Insufficient stock' — server check", danger: "Negative stock band karne se jin products ka stock system me kam hai unka bill nahi banega jab tak purchase/adjustment se stock theek na ho." },
  { s: "inventory", path: "inventory.warnOutOfStock", label: "Out-of-stock par warning dikhayein", type: "bool", def: true },
  { s: "inventory", path: "inventory.lowStockThreshold", label: "Low-stock level (default)", type: "number", min: 0, max: 1e6, def: 5 },
  { s: "inventory", path: "inventory.defaultUnit", label: "Default unit", type: "text", placeholder: "kg" },
  { s: "inventory", path: "inventory.allowFractional", label: "Decimal quantity (jaise 1.5 kg) allow", type: "bool", def: true, help: "Off = sirf poori quantity (server check)" },
  { s: "inventory", path: "inventory.qtyDecimals", label: "Quantity decimal precision", type: "number", min: 0, max: 3, def: 3 },

  // Customers
  { s: "customers", path: "customers.requirePhoneForCredit", label: "Udhaar ke liye phone number zaroori", type: "bool", def: false },
  { s: "customers", path: "customers.defaultCreditLimit", label: "Naye customer ki default credit limit", type: "number", min: 0, max: 1e9, nullable: true, placeholder: "Koi limit nahi", help: "POS se banne wale naye customers par lagegi" },
  { s: "customers", path: "customers.reminderText", label: "Payment reminder message", type: "textarea", placeholder: "Assalam o alaikum {name}, aap ka baqaya {balance} hai.", help: "{name}, {balance} variables" },

  // Taxes
  { s: "taxes", path: "tax.enabled", label: "Tax enabled", type: "bool", def: true, help: "Off = POS me tax column/option nahi" },
  { s: "taxes", path: "tax.inclusive", label: "Rates me tax shamil hai (tax-inclusive)", type: "bool", def: false, danger: "Tax-inclusive par NAYE bills me rate ke andar se tax nikala jayega (total wahi rahega). Purane bills nahi badlenge." },
  { s: "taxes", path: "tax.defaultPct", label: "Default tax % (naye item par)", type: "number", min: 0, max: 100, def: 0 },

  // Invoices (numbers, text)
  { s: "invoices", path: "terms", label: "Terms & conditions", type: "textarea" },
  { s: "invoices", path: "receiptFooter", label: "Footer line", type: "text", placeholder: "Shukriya! Dobara tashreef layein." },
  { s: "invoices", path: "printing.signatureLabel", label: "Signature label", type: "text", placeholder: "Authorized signature" },

  // Printing — layout
  { s: "printing", path: "printing.layout.marginTop", label: "Top margin (mm) — A4/custom", type: "number", min: 0, max: 40, def: 12 },
  { s: "printing", path: "printing.layout.marginBottom", label: "Bottom margin (mm)", type: "number", min: 0, max: 40, def: 12 },
  { s: "printing", path: "printing.layout.marginLeft", label: "Left margin (mm)", type: "number", min: 0, max: 40, def: 12 },
  { s: "printing", path: "printing.layout.marginRight", label: "Right margin (mm)", type: "number", min: 0, max: 40, def: 12 },
  { s: "printing", path: "printing.layout.fontPt", label: "Font size (pt)", type: "number", min: 6, max: 16, step: 0.5, def: 10 },
  { s: "printing", path: "printing.layout.tableFontPt", label: "Table font size (pt)", type: "number", min: 6, max: 16, step: 0.5, def: 9.5 },
  { s: "printing", path: "printing.layout.headerPt", label: "Header size (pt)", type: "number", min: 10, max: 36, def: 18 },
  { s: "printing", path: "printing.layout.footerPt", label: "Footer size (pt)", type: "number", min: 6, max: 14, step: 0.5, def: 8.5 },
  { s: "printing", path: "printing.layout.logoMm", label: "Logo size (mm)", type: "number", min: 6, max: 60, def: 18 },
  { s: "printing", path: "printing.layout.logoAlign", label: "Logo / header alignment", type: "select", options: [{ v: "left", l: "Left" }, { v: "center", l: "Center" }, { v: "right", l: "Right" }], def: "left" },
  { s: "printing", path: "printing.layout.lineHeight", label: "Line spacing", type: "number", min: 1, max: 2, step: 0.05, def: 1.35 },
  { s: "printing", path: "printing.layout.copies", label: "Default copies", type: "select", options: [{ v: "1", l: "1 copy" }, { v: "2", l: "2 copies" }, { v: "3", l: "3 copies" }, { v: "4", l: "4 copies" }], def: "1" },
  // A5
  { s: "printing", path: "printing.a5.orientation", label: "A5 orientation", type: "select", options: [{ v: "portrait", l: "Portrait" }, { v: "landscape", l: "Landscape" }], def: "portrait" },
  { s: "printing", path: "printing.a5.marginMm", label: "A5 margin (mm)", type: "number", min: 0, max: 25, def: 7 },
  { s: "printing", path: "printing.a5.fontPt", label: "A5 font size (pt)", type: "number", min: 6, max: 12, step: 0.5, def: 8.5 },
  { s: "printing", path: "printing.a5.logoMm", label: "A5 logo size (mm)", type: "number", min: 5, max: 40, def: 12 },
  { s: "printing", path: "printing.a5.footer", label: "A5 footer (khali = main footer)", type: "text" },
  { s: "printing", path: "printing.a5.signature", label: "A5 par signature line", type: "bool", def: false },
  // Thermal
  { s: "printing", path: "printing.thermal.fontPt", label: "Thermal font size (pt)", type: "number", min: 6, max: 12, step: 0.5, def: 8.5 },
  { s: "printing", path: "printing.thermal.marginMm", label: "Thermal margin (mm)", type: "number", min: 0, max: 8, step: 0.5, def: 2 },
  { s: "printing", path: "printing.thermal.showQtyRate", label: "Thermal: qty × rate line", type: "bool", def: true },
  { s: "printing", path: "printing.thermal.boldTotal", label: "Thermal: bold grand total", type: "bool", def: true },
  { s: "printing", path: "printing.thermal.showCustomer", label: "Thermal: customer info", type: "bool", def: true },
  { s: "printing", path: "printing.thermal.showBarcode", label: "Thermal: invoice barcode", type: "bool", def: false },
  { s: "printing", path: "printing.thermal.showQr", label: "Thermal: QR code", type: "bool", def: false },
  { s: "printing", path: "printing.thermal.footer", label: "Thermal footer (khali = main footer)", type: "text" },
  { s: "printing", path: "printing.thermal.feedLines", label: "Receipt ke baad khali lines", type: "number", min: 0, max: 15, def: 3 },
  // Custom paper
  { s: "printing", path: "printing.custom.widthMm", label: "Custom paper width (mm)", type: "number", min: 40, max: 330, def: 100 },
  { s: "printing", path: "printing.custom.heightMm", label: "Custom paper height (mm, khali = roll)", type: "number", min: 30, max: 600, nullable: true },

  // Notifications
  { s: "notifications", path: "notify.lowStock", label: "Low stock alert (POS par)", type: "bool", def: true },
  { s: "notifications", path: "notify.creditLimit", label: "Credit limit warning (billing me)", type: "bool", def: true },
  { s: "notifications", path: "notify.syncFailed", label: "Vyapar sync fail alert", type: "bool", def: true },
  { s: "notifications", path: "notify.printErrors", label: "Printer error alert", type: "bool", def: true },
  { s: "notifications", path: "notify.paymentReminders", label: "Payment reminder button (ledger me)", type: "bool", def: true },

  // Advanced
  { s: "advanced", path: "decimals", label: "Amount decimal places", type: "number", min: 0, max: 3, def: 2, danger: "Decimal places sirf dikhane/print par asar karte hain. Database me raqam 2 decimal tak hi save hoti hai." },
  { s: "advanced", path: "business.dateFormat", label: "Date format", type: "select", options: [{ v: "dd/mm/yyyy", l: "DD/MM/YYYY" }, { v: "mm/dd/yyyy", l: "MM/DD/YYYY" }, { v: "yyyy-mm-dd", l: "YYYY-MM-DD" }], def: "dd/mm/yyyy" },
  { s: "advanced", path: "business.timeFormat", label: "Time format", type: "select", options: [{ v: "12", l: "12 hour" }, { v: "24", l: "24 hour" }], def: "12" },
  { s: "advanced", path: "business.timezone", label: "Timezone", type: "select", options: ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "UTC"].map((z) => ({ v: z, l: z })), def: "Asia/Karachi" },
];

// Printing defaults per document + template per paper + behavior
for (const k of Object.keys(DOC_LABEL) as DocKind[]) {
  FIELDS.push({ s: "printing", path: `printing.defaults.${k}`, label: `Default paper — ${DOC_LABEL[k]}`, type: "select", options: fmtOpts });
}
for (const f of Object.keys(FORMAT_LABEL) as PaperFormat[]) {
  FIELDS.push({ s: "printing", path: `printing.templates.${f}`, label: `Design — ${FORMAT_LABEL[f]}`, type: "select", options: tplOpts });
}
for (const [k, l] of [["pos", "POS sale"], ["sale", "Sales invoice"], ["quotation", "Quotation"], ["return", "Sales return"], ["purchase", "Purchase"], ["receipt", "Payment receipt"]] as const) {
  FIELDS.push({ s: "printing", path: `printing.behavior.${k}`, label: `Save ke baad — ${l}`, type: "select", options: behOpts });
}
