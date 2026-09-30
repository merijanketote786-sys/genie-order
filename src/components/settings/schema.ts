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
  /** Show a confirmation when this changes (explains the impact) */
  danger?: string;
  nullable?: boolean;
  def?: unknown;
};

const fmtOpts = (Object.keys(FORMAT_LABEL) as PaperFormat[]).map((f) => ({ v: f, l: FORMAT_LABEL[f] }));
const tplOpts = (Object.keys(TEMPLATE_LABEL) as TemplateId[]).map((t) => ({ v: t, l: TEMPLATE_LABEL[t] }));
const behOpts = [{ v: "auto", l: "Print directly" }, { v: "ask", l: "Preview / ask first" }, { v: "never", l: "Do not print" }];

export const FIELDS: Field[] = [
  // Business
  { s: "business", path: "business.name", label: "Business name (on print)", type: "text", placeholder: "HB Chemicals Pakistan" },
  { s: "business", path: "business.address", label: "Address", type: "textarea" },
  { s: "business", path: "business.phone", label: "Phone", type: "text" },
  { s: "business", path: "business.email", label: "Email", type: "text" },
  { s: "business", path: "business.website", label: "Website", type: "text" },
  { s: "business", path: "business.taxId", label: "NTN / GST number", type: "text" },
  { s: "business", path: "business.currencySymbol", label: "Currency symbol (on print)", type: "text", placeholder: "Rs", danger: "Changing the currency symbol will print the new symbol on new invoices and receipts. Amounts on old records will not change." },

  // POS
  { s: "pos", path: "pos.autoFocusSearch", label: "Auto-focus search box", type: "bool", def: true, help: "After a sale, cursor jumps straight to product search" },
  { s: "pos", path: "pos.scanAutoAdd", label: "Add scanned product straight to cart", type: "bool", def: true, help: "Scanning again = quantity +1" },
  { s: "pos", path: "pos.showGrid", label: "Show product shortcut grid by default", type: "bool", def: false },
  { s: "pos", path: "pos.shortcuts", label: "Keyboard shortcuts (F2/F4/F8/F9/F10)", type: "bool", def: true },
  { s: "pos", path: "sales.keepCustomerAfterSale", label: "Keep customer after sale", type: "bool", def: false, help: "Off = a new bill (New Sale) after every sale" },

  // Sales
  { s: "sales", path: "sales.requireCustomerForCredit", label: "Customer required for credit / udhaar sale", type: "bool", def: true, help: "Checked on the server" },
  { s: "sales", path: "sales.enforceCreditLimit", label: "Strictly enforce credit limit", type: "bool", def: false, help: "Bills will not save if credit exceeds the limit (server check)", danger: "Turning this on will block new credit for customers whose outstanding balance already exceeds their limit." },
  { s: "sales", path: "sales.maxCashierDiscountPct", label: "Cashier/Salesman max discount %", type: "number", min: 0, max: 100, nullable: true, placeholder: "No limit", help: "Not applicable to Admin/Manager. Checked on the server." },
  { s: "sales", path: "sales.defaultRateType", label: "Default price level", type: "select", options: [{ v: "sale", l: "Sale price" }, { v: "p100", l: "Staff 100g" }, { v: "p250", l: "Staff 250g" }, { v: "p500", l: "Staff 500g" }], def: "sale" },
  { s: "sales", path: "sales.confirmBeforeSave", label: "Confirm before saving bill", type: "bool", def: false },
  { s: "sales", path: "sales.autoPdf", label: "Auto-download PDF after sale", type: "bool", def: false },
  { s: "sales", path: "numbering.salePrefix", label: "Invoice number prefix", type: "text", placeholder: "INV-", help: "Applies only to new bills. The number sequence continues as before.", danger: "Changing the invoice prefix will only affect NEW invoices created with the new prefix. Old invoice numbers will not change at all." },
  { s: "sales", path: "numbering.quotePrefix", label: "Quotation prefix", type: "text", placeholder: "QT-" },
  { s: "sales", path: "numbering.returnPrefix", label: "Sales return prefix", type: "text", placeholder: "SR-" },

  // Purchases
  { s: "purchases", path: "numbering.purchasePrefix", label: "Purchase number prefix", type: "text", placeholder: "PUR-" },
  { s: "purchases", path: "numbering.purchaseReturnPrefix", label: "Purchase return prefix", type: "text", placeholder: "PR-" },

  // Inventory
  { s: "inventory", path: "inventory.trackStock", label: "Stock tracking", type: "bool", def: true, danger: "Turning off stock tracking means stock will NOT increase/decrease on sale/purchase until you turn it back on. Current stock will not change." },
  { s: "inventory", path: "inventory.allowNegativeStock", label: "Allow negative stock (sell more than in stock)", type: "bool", def: true, help: "Stock 0 hone par bhi sale/manufacturing nahi rukti — stock minus mein jata hai aur red mein dikhta hai" },
  { s: "inventory", path: "inventory.warnOutOfStock", label: "Show warning on out-of-stock", type: "bool", def: true },
  { s: "inventory", path: "inventory.lowStockThreshold", label: "Low-stock level (default)", type: "number", min: 0, max: 1e6, def: 5 },
  { s: "inventory", path: "inventory.defaultUnit", label: "Default unit", type: "text", placeholder: "kg" },
  { s: "inventory", path: "inventory.allowFractional", label: "Allow decimal quantity (e.g. 1.5 kg)", type: "bool", def: true, help: "Off = whole quantities only (server check)" },
  { s: "inventory", path: "inventory.qtyDecimals", label: "Quantity decimal precision", type: "number", min: 0, max: 3, def: 3 },

  // Customers
  { s: "customers", path: "customers.requirePhoneForCredit", label: "Phone number required for credit", type: "bool", def: false },
  { s: "customers", path: "customers.defaultCreditLimit", label: "Default credit limit for new customer", type: "number", min: 0, max: 1e9, nullable: true, placeholder: "No limit", help: "Applies to new customers created from POS" },
  { s: "customers", path: "customers.reminderText", label: "Payment reminder message", type: "textarea", placeholder: "Hello {name}, your outstanding balance is {balance}.", help: "{name}, {balance} variables" },

  // Taxes
  { s: "taxes", path: "tax.enabled", label: "Tax enabled", type: "bool", def: true, help: "Off = no tax column/option in POS" },
  { s: "taxes", path: "tax.inclusive", label: "Rates include tax (tax-inclusive)", type: "bool", def: false, danger: "With tax-inclusive on, tax will be extracted from the rate on NEW bills (total stays the same). Old bills will not change." },
  { s: "taxes", path: "tax.defaultPct", label: "Default tax % (on new item)", type: "number", min: 0, max: 100, def: 0 },

  // Invoices (numbers, text)
  { s: "invoices", path: "terms", label: "Terms & conditions", type: "textarea" },
  { s: "invoices", path: "receiptFooter", label: "Footer line", type: "text", placeholder: "Thank you! Please visit again." },
  { s: "invoices", path: "printing.signatureLabel", label: "Signature label", type: "text", placeholder: "Authorized signature" },


  // Notifications
  { s: "notifications", path: "notify.lowStock", label: "Low stock alert (in POS)", type: "bool", def: true },
  { s: "notifications", path: "notify.creditLimit", label: "Credit limit warning (in billing)", type: "bool", def: true },
  { s: "notifications", path: "notify.syncFailed", label: "Vyapar sync fail alert", type: "bool", def: true },
  { s: "notifications", path: "notify.printErrors", label: "Printer error alert", type: "bool", def: true },
  { s: "notifications", path: "notify.paymentReminders", label: "Payment reminder button (in ledger)", type: "bool", def: true },

  // Advanced
  { s: "advanced", path: "decimals", label: "Amount decimal places", type: "number", min: 0, max: 3, def: 2, danger: "Decimal places only affect display/print. Amounts are stored in the database with up to 2 decimal places." },
  { s: "advanced", path: "business.dateFormat", label: "Date format", type: "select", options: [{ v: "dd/mm/yyyy", l: "DD/MM/YYYY" }, { v: "mm/dd/yyyy", l: "MM/DD/YYYY" }, { v: "yyyy-mm-dd", l: "YYYY-MM-DD" }], def: "dd/mm/yyyy" },
  { s: "advanced", path: "business.timeFormat", label: "Time format", type: "select", options: [{ v: "12", l: "12 hour" }, { v: "24", l: "24 hour" }], def: "12" },
  { s: "advanced", path: "business.timezone", label: "Timezone", type: "select", options: ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "UTC"].map((z) => ({ v: z, l: z })), def: "Asia/Karachi" },
];

