import { fillTemplate, parseMessage, tokensOf, type Vars } from "@/lib/template-engine";

export const DEFAULT_ORDER_INPUT_TEMPLATE = `Order Number: {{order_number}}
Name: {{name}}
Phone: {{phone}}
City: {{city}}
Address: {{address}}
Product: {{product}}
Qty: {{qty}}
Product Total: {{product_total}}
Delivery: {{delivery}}
Advance: {{advance}}`;

const amount = (v?: string) => (v ?? "").replace(/[^\d.,]/g, "").trim();

/** Rule-based order formatter (no AI). */
export function formatOrder(
  text: string,
  outputTemplate: string,
  inputTemplate: string,
  autoOrderNumber?: string | null,
): { output: string; vars: Vars } {
  const { vars } = parseMessage(text, { inputTemplate, extraKeys: tokensOf(outputTemplate) });

  const isCC = /payment\s*status\s*[:\-]?\s*(cc|credit card|card|paid)/i.test(text) || /\bC\.?C\.?\b/.test(text);
  const isCOD = /payment\s*status\s*[:\-]?\s*(cod|cash on delivery)/i.test(text) || /\bcod\b/i.test(text);
  const codAmount = text.match(/cod\s*amount\s*[:\-=]?\s*(?:rs\.?|pkr)?\s*([\d,]+(?:\.\d+)?)/i)?.[1] ?? "";

  if (!vars["qty"] && vars["product"]) {
    vars["qty"] = String(vars["product"].split(",").filter((p) => p.trim()).length);
  }
  for (const k of ["product_total", "delivery", "advance"]) if (vars[k]) vars[k] = amount(vars[k]);
  if (isCOD && !vars["product_total"] && codAmount) vars["product_total"] = codAmount;
  if (isCC && !isCOD) {
    vars["product_total"] = "0";
    vars["delivery"] = "0";
    vars["advance"] = "0";
  }
  if (!vars["status"]) vars["status"] = "Confirmed";
  if (!vars["order_number"] && autoOrderNumber) vars["order_number"] = autoOrderNumber;

  let output = fillTemplate(outputTemplate, vars);
  // Status in default template is a fixed "Confirmed" line — keep explicit status if given.
  const extra = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(payment\s*status|cod\s*amount)\s*:/i.test(l) && !output.includes(l));
  if (extra.length) output = `${output}\n${extra.join("\n")}`;
  return { output, vars };
}
