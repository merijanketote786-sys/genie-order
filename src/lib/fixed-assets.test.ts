import { describe, expect, test } from "bun:test";
import { assetSchema, assetTotal } from "./fixed-assets";

const base = { id: "10000000-1000-4000-8000-100000000000", name: "Laptop", category: "Computers", quantity: 2, purchase_cost: 50000, purchase_date: null, serial_number: "", location: "", notes: "", status: "active" };
describe("fixed asset register", () => {
  test("accepts arbitrary asset names and custom categories", () => {
    expect(assetSchema.parse({ ...base, name: "Workshop compressor", category: "Workshop equipment" }).category).toBe("Workshop equipment");
  });
  test("total cost is unit cost times quantity", () => { expect(assetTotal(base)).toBe(100000); });
  test("rejects invalid quantity", () => { expect(assetSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false); });
  test("rejects negative cost", () => { expect(assetSchema.safeParse({ ...base, purchase_cost: -1 }).success).toBe(false); });
  test("rejects invalid calendar dates", () => { expect(assetSchema.safeParse({ ...base, purchase_date: "2026-02-30" }).success).toBe(false); });
});