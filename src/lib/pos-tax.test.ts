import { test } from "node:test";
import { strict as assert } from "node:assert";
import { productTaxPercent } from "./pos-tax";
import { lineBase, lineTax, lineTotal, totals, type CartLine } from "./pos";
import { resolveCfg } from "./pos-config";
const line = (overrides: Partial<CartLine> = {}): CartLine => ({ key: "test", name: "test", unit: "kg", rateType: "sale", price: 100, qty: 1, discount: 0, taxPercent: 15, ...overrides });
test("product tax wins; explicit zero stays exempt instead of taking default", () => {
  assert.equal(productTaxPercent(true, 5, 18), 5);
  assert.equal(productTaxPercent(true, 0, 18), 0);
  assert.equal(productTaxPercent(true, null, 18), 18);
  assert.equal(productTaxPercent(false, 18, 18), 0);
});
test("exclusive 15 percent adds 15 to 100", () => {
  assert.equal(lineTax(line()), 15); assert.equal(lineBase(line()), 100); assert.equal(lineTotal(line()), 115);
});
test("inclusive 115 at 15 percent extracts 15 without raising the total", () => {
  const item = line({ price: 115, taxIncl: true });
  assert.equal(lineTax(item), 15); assert.equal(lineBase(item), 100); assert.equal(lineTotal(item), 115);
});
test("mixed rates and line discount calculate independently", () => {
  const result = totals([line({ discount: 20 }), line({ taxPercent: 0 })], 0, 0);
  assert.deepEqual(result, { subtotal: 180, taxTotal: 12, itemDiscount: 20, total: 192 });
});
test("international registration label and timezone remain firm configurable", () => {
  const cfg = resolveCfg({ tax: { registrationLabel: "VAT ID" }, business: { timezone: "America/New_York", currencySymbol: "$" } });
  assert.equal(cfg.tax.registrationLabel, "VAT ID"); assert.equal(cfg.business.timezone, "America/New_York"); assert.equal(cfg.business.currencySymbol, "$");
});