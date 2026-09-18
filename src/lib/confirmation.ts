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
