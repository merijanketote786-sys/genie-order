import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { assetSchema, assetTotal } from "./fixed-assets";

const base = { id: "10000000-1000-4000-8000-100000000000", name: "Laptop", category: "Computers", quantity: 2, purchase_cost: 50000, purchase_date: null, serial_number: "", location: "", notes: "", status: "active" };
describe("fixed asset register", () => {
  test("accepts arbitrary asset names and custom categories", () => {
    assert.equal(assetSchema.parse({ ...base, name: "Workshop compressor", category: "Workshop equipment" }).category, "Workshop equipment");
  });
  test("total cost is unit cost times quantity", () => { assert.equal(assetTotal(base), 100000); });
  test("rejects invalid quantity", () => { assert.equal(assetSchema.safeParse({ ...base, quantity: 0 }).success, false); });
  test("rejects negative cost", () => { assert.equal(assetSchema.safeParse({ ...base, purchase_cost: -1 }).success, false); });
  test("rejects invalid calendar dates", () => { assert.equal(assetSchema.safeParse({ ...base, purchase_date: "2026-02-30" }).success, false); });
});