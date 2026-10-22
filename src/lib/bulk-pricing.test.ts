import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { applyPctRates, priced } from "./bulk-pricing";

const row = { purchase_price: "100", sale_price: "0", wholesale_price: "0" };

describe("Bulk update rate-by-percentage toggle", () => {
  test("switch off: both rates stay exactly as they were", () => {
    const out = applyPctRates(row, { on: false, sale: true, ws: true, salePct: "45", wsPct: "15" });
    assert.equal(out.sale_price, "0");
    assert.equal(out.wholesale_price, "0");
  });
  test("switch on: sale = purchase +45%, wholesale = purchase +15%", () => {
    const out = applyPctRates(row, { on: true, sale: true, ws: true, salePct: "45", wsPct: "15" });
    assert.equal(out.sale_price, "145");
    assert.equal(out.wholesale_price, "115");
  });
  test("switch on, wholesale only: typed sale rate is left alone", () => {
    const out = applyPctRates({ ...row, sale_price: "77" }, { on: true, sale: false, ws: true, salePct: "45", wsPct: "15" });
    assert.equal(out.sale_price, "77");
    assert.equal(out.wholesale_price, "115");
  });
  test("switch on with no purchase price: rates are not overwritten with NaN", () => {
    const out = applyPctRates({ ...row, purchase_price: "" }, { on: true, sale: true, ws: true, salePct: "45", wsPct: "15" });
    assert.equal(out.sale_price, "0");
    assert.equal(out.wholesale_price, "0");
  });
  test("percentage maths: 12.5 + 20% = 15, 1 + 33.33% = 1.33", () => {
    assert.equal(priced("12.5", "20"), "15");
    assert.equal(priced("1", "33.33"), "1.33");
    assert.equal(priced("10", ""), null);
  });
});
