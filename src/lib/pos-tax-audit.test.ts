import { test } from "node:test";
import { strict as assert } from "node:assert";
import { lineTax, lineTotal, totals, receiptTotals, type CartLine } from "./pos";
import { billDiscountAmount, roundPosAmount } from "./pos-tax";
import { savedSaleToDoc, savedSaleToReceipt, type SavedSaleRow } from "./pos-saved-invoice";
import { renderWaTemplate } from "./pos-wa-template";
import { makeMoney } from "./print/render";
import { resolveCfg } from "./pos-config";

const line = (price: number, taxPercent: number, taxIncl = false): CartLine => ({ key: "test", name: "test", unit: "pcs", rateType: "sale", qty: 1, price, taxPercent, taxIncl, discount: 0 });
for (const [country, rate] of [["UK standard", 20], ["UK reduced", 5], ["UAE standard", 5], ["Japan standard", 10], ["Japan reduced", 8], ["Pakistan configured GST", 18], ["US configured local sales tax", 8.875]] as const) {
  test(`${country}: exclusive/inclusive arithmetic agrees at configured rate`, () => {
    const tax = roundPosAmount(rate);
    assert.equal(lineTax(line(100, rate)), tax);
    assert.equal(lineTotal(line(100, rate)), roundPosAmount(100 + rate));
    assert.equal(lineTax(line(100 + rate, rate, true)), tax);
    assert.equal(lineTotal(line(100 + rate, rate, true)), roundPosAmount(100 + rate));
  });
}
test("half-cent rounds up to match numeric database rounding", () => {
  assert.equal(roundPosAmount(1.005), 1.01);
  assert.equal(lineTax(line(20.1, 5)), 1.01);
});
test("fractional quantity line totals reconcile exactly to invoice totals", () => {
  const lines = [0, 1, 2].map(i => ({ ...line(0.335, 5), key: String(i) }));
  assert.equal(lines.reduce((n, l) => n + Math.round(lineTotal(l) * 100), 0), Math.round(totals(lines, 0, 0).total * 100));
  assert.deepEqual(totals(lines, 0, 0), { subtotal: 1.02, taxTotal: 0.06, itemDiscount: 0, total: 1.08 });
});
test("post-tax bill discount is bounded and does not change saved tax policy", () => {
  assert.equal(billDiscountAmount(500, 120), 120);
  assert.equal(billDiscountAmount(-5, 120), 0);
  assert.equal(totals([line(100, 20)], 500, 10).total, 10);
  assert.equal(totals([line(100, 20)], 10, 0).taxTotal, 20);
});
const sale: SavedSaleRow = {
  id: "audit", doc_number: "audit", doc_type: "sale", status: "completed", payment_status: "partial", customer_name: null, customer_phone: null,
  subtotal: 80, discount_total: 30, tax_total: 16, delivery: 0, grand_total: 86, paid_total: 50, balance: 36, notes: null, created_at: "2026-10-28T03:50:00Z",
  payload: { ui: { currency: "GBP", cart: [{ taxIncl: true }] } },
  items: [{ name: "test", sku: null, unit: "pcs", qty: 1, rate: 116, discount: 20, tax_percent: 20, tax_amount: 16, line_total: 96, note: null }],
  payments: [{ method: "Cash", amount: 50, kind: "received" }],
};
test("reprints subtract only bill discount; preserve persisted amounts and inclusive mode", () => {
  const doc = savedSaleToDoc(sale);
  assert.equal(doc.totals?.find(t => t.neg)?.value, 10);
  assert.equal(doc.lines?.[0].taxAmount, 16);
  assert.equal(doc.lines?.[0].taxIncl, true);
  assert.equal(doc.currency, "GBP");
  assert.equal(doc.totals?.reduce((sum, t) => t.bold ? sum : sum + (t.neg ? -t.value : t.value), 0), 86);
});
test("historical WhatsApp uses saved tax and grand total, not current rate maths", () => {
  const r = savedSaleToReceipt(sale, "", "Rs");
  assert.deepEqual(receiptTotals(r), { subtotal: 80, taxTotal: 16, total: 86 });
  assert.equal(renderWaTemplate("{{tax}}|{{grand_total}}|{{balance}}", r), "GBP 16|GBP 86|GBP 36");
});
test("new WhatsApp amounts include exclusive tax and custom charges", () => {
  const r = { ...savedSaleToReceipt(sale, "", "AED"), savedTotals: undefined, currency: "AED", lines: [line(100, 5)], billDiscount: 0, paid: 100, customFields: [{ label: "Charge", value: "10", addToTotal: true }] };
  assert.equal(renderWaTemplate("{{tax}}|{{grand_total}}|{{balance}}", r), "AED 5|AED 115|AED 15");
});
test("print display honors zero and three decimal settings consistently", () => {
  assert.equal(makeMoney(resolveCfg({ decimals: 0 }))(120), "120");
  assert.equal(makeMoney(resolveCfg({ decimals: 3 }))(120), "120.000");
});