/** Lightweight "Label: value" parsers for saving order/invoice records. */

function fields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\*?\s*([A-Za-z][A-Za-z /#.]{1,30}?)\s*\*?\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase().replace(/\s+/g, " ");
    const value = m[2].replace(/\*/g, "").trim();
    if (!(key in out)) out[key] = value;
  }
  return out;
}

const pick = (f: Record<string, string>, keys: string[]) => {
  for (const k of keys) {
    const v = f[k];
    if (v) return v;
  }
  return "";
};

export function toAmount(value: string): number | null {
  const clean = value.replace(/[^\d.]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** 03001234567 normalized key for customer matching */
export function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("0092")) n = n.slice(4);
  if (n.startsWith("92")) n = n.slice(2);
  if (n.startsWith("0")) n = n.slice(1);
  if (n.length !== 10) return null;
  return `0${n}`;
}

export type ParsedOrder = {
  orderNumber: string;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  product: string;
  qty: string;
  productTotal: number | null;
  delivery: string;
  advance: string;
  status: string;
};

export function parseOrderText(text: string): ParsedOrder {
  const f = fields(text);
  return {
    orderNumber: pick(f, ["order number", "order no", "order #", "order id"]),
    customerName: pick(f, ["name", "customer name", "customer"]),
    phone: pick(f, ["phone", "phone number", "mobile", "contact"]),
    city: pick(f, ["city"]),
    address: pick(f, ["address"]),
    product: pick(f, ["product", "products", "item", "items"]),
    qty: pick(f, ["qty", "quantity"]),
    productTotal: toAmount(pick(f, ["product total", "total", "amount", "grand total"])),
    delivery: pick(f, ["delivery", "delivery charges", "shipping"]),
    advance: pick(f, ["advance", "paid"]),
    status: pick(f, ["status"]) || "Confirmed",
  };
}

export type ParsedInvoiceSummary = {
  customerName: string;
  phone: string;
  total: number | null;
};

export function parseInvoiceSummary(text: string): ParsedInvoiceSummary {
  const f = fields(text);
  const total =
    toAmount(pick(f, ["grand total"])) ?? toAmount(pick(f, ["product total", "total", "subtotal"]));
  return {
    customerName: pick(f, ["name", "customer name", "customer", "bill to"]),
    phone: pick(f, ["phone", "phone number", "mobile", "contact"]),
    total,
  };
}
