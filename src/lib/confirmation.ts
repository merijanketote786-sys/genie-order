/**
 * Order confirmation performa — template ke variables ko form values se bharta hai.
 */
export type ConfirmationValues = {
  orderNumber: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  invoice: string;
  productTotal: string;
  delivery: string;
  advance: string;
  payment: string;
  notes: string;
};

export const EMPTY_CONFIRMATION: ConfirmationValues = {
  orderNumber: "",
  name: "",
  phone: "",
  city: "",
  address: "",
  invoice: "",
  productTotal: "",
  delivery: "",
  advance: "",
  payment: "",
  notes: "",
};

/** Invoice ki lines jo item nahi hain (totals, customer detail, headings). */
const NON_ITEM = /^(invoice|order|name|naam|phone|mobile|city|address|date|customer|sub\s*total|subtotal|total|product\s*total|delivery|shipping|advance|grand\s*total|payment|status|cod|cc|thanks|shukriya|note|notes)\b/i;

/** Item line lagti hai: naam + koi number (price/qty) ho. */
const looksLikeItem = (line: string) =>
  line.trim().length > 2 && /\d/.test(line) && /[a-zA-Z\u0600-\u06FF]/.test(line) && !NON_ITEM.test(line.trim());

/**
 * Invoice text ke products ko number wise sort (1. 2. 3.) kar deta hai,
 * baqi lines (totals waghera) waisi ki waisi rehti hain.
 */
export function numberInvoiceItems(text: string): string {
  let n = 0;
  return text
    .split("\n")
    .map((line) => {
      const raw = line.trim();
      if (!looksLikeItem(raw)) return line;
      const clean = raw.replace(/^\s*(\d+)\s*[).:-]\s*/, "");
      n += 1;
      return `${n}. ${clean}`;
    })
    .join("\n")
    .trim();
}

/**
 * Kisi bhi paste kiye gaye text me se sirf invoice item lines uthata hai —
 * naam, phone, address, totals waghera sab chhor deta hai — aur items ko
 * 1, 2, 3 number wise sort karta hai.
 */
export function extractInvoiceOnly(text: string): string {
  let n = 0;
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((raw) => looksLikeItem(raw))
    .map((raw) => {
      const clean = raw.replace(/^\s*(\d+)\s*[).:-]\s*/, "");
      n += 1;
      return `${n}. ${clean}`;
    })
    .join("\n");
}

export type InvoicePayment = {
  method: "COD" | "CC" | null;
  codAmount: string;
  status: "paid" | "unpaid" | "";
};

/**
 * Grand total ke neeche likha CC = 0 amount parcel (paid),
 * COD ya COD amount = unpaid parcel.
 */
export function detectInvoicePayment(text: string): InvoicePayment {
  const codMatch = text.match(/\bC\.?O\.?D\.?\b[^0-9\n]*([\d,]+(?:\.\d+)?)?/i);
  if (codMatch) {
    const amount = (codMatch[1] ?? "").replace(/,/g, "");
    return { method: "COD", codAmount: amount, status: "unpaid" };
  }
  if (/\bC\.?C\.?\b|credit\s*card|prepaid|paid\b/i.test(text)) {
    return { method: "CC", codAmount: "0", status: "paid" };
  }
  return { method: null, codAmount: "", status: "" };
}

const num = (value: string) => {
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function grandTotal(values: ConfirmationValues): string {
  const total = num(values.productTotal) + num(values.delivery) - num(values.advance);
  if (!values.productTotal.trim()) return "";
  return total > 0 ? total.toLocaleString("en-PK") : "";
}

export function renderConfirmation(template: string, values: ConfirmationValues): string {
  const map: Record<string, string> = {
    "{{order_number}}": values.orderNumber.trim(),
    "{{date}}": new Date().toLocaleDateString("en-GB"),
    "{{name}}": values.name.trim(),
    "{{phone}}": values.phone.trim(),
    "{{city}}": values.city.trim(),
    "{{address}}": values.address.trim(),
    "{{invoice}}": values.invoice.trim(),
    "{{product_total}}": values.productTotal.trim(),
    "{{delivery}}": values.delivery.trim(),
    "{{advance}}": values.advance.trim(),
    "{{grand_total}}": grandTotal(values),
    "{{payment}}": values.payment.trim(),
    "{{notes}}": values.notes.trim(),
  };

  let output = template;
  for (const [token, value] of Object.entries(map)) {
    output = output.split(token).join(value);
  }

  // Khali fields wali lines hata dein (e.g. "Advance: ")
  const lines = output
    .split("\n")
    .filter((line) => !/^[^\n:]{1,30}:\s*$/.test(line.trim()));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
