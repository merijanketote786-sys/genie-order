import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseWeightBarcode, validEan13, weightBarcodeError, weightInProductUnit } from "./weight-barcode";

const config = { enabled: true, prefix: "24", productDigits: 5, weightDigits: 5, decimals: 3, unit: "kg" as const, checkDigit: true };
const ean = (data: string) => data + (10 - [...data].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10) % 10;
test("configured scale barcode decodes leading-zero SKU and 0.5 kg", () => {
  assert.deepEqual(parseWeightBarcode(ean("240012300500"), config), { productCode: "00123", weight: 0.5, unit: "kg" });
});
test("disabled profile never treats ordinary barcode as weight", () => {
  assert.equal(parseWeightBarcode(ean("240012300500"), { ...config, enabled: false }), null);
  assert.equal(parseWeightBarcode("1234567890123", config), null);
});
test("malformed and wrong check-digit scale barcodes are rejected", () => {
  assert.throws(() => parseWeightBarcode("2400123005009", config), /check digit/);
  assert.throws(() => parseWeightBarcode("2400123", config), /length/);
  assert.equal(validEan13("4006381333931"), true);
});
test("zero weight and invalid enabled configuration are rejected", () => {
  assert.throws(() => parseWeightBarcode(ean("240012300000"), config), /greater than zero/);
  assert.ok(weightBarcodeError({ ...config, prefix: "" }));
  assert.ok(weightBarcodeError({ ...config, productDigits: 4 }));
});
test("kg, grams and pounds convert to actual stock quantity, not a label", () => {
  assert.equal(weightInProductUnit(500, "g", "kg"), 0.5);
  assert.equal(weightInProductUnit(0.5, "kg", "g"), 500);
  assert.equal(weightInProductUnit(1, "lb", "kg"), 0.454);
  assert.throws(() => weightInProductUnit(1, "kg", "Piece"), /measured/);
});