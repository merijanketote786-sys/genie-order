import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { doOutput, toChallan } from "./do";
import type { PrintDoc } from "./render";

const invoice: PrintDoc = {
  kind: "pos", title: "Invoice", number: "INV-1", date: "2026-10-22",
  party: { label: "Customer", name: "Private customer", phone: "Private phone", address: "Private address" },
  meta: [["City / Area", "Private city"], ["Courier service", "Courier"], ["Goods adda", "Transport"]],
  lines: [{ name: "Item", qty: 2, rate: 10, total: 20 }],
};

describe("D-O customer output choice", () => {
  test("includes customer details when chosen", () => {
    const output = doOutput(toChallan(invoice), true);
    assert.deepEqual(output.party, { ...invoice.party, label: "Deliver To" });
    assert.deepEqual(output.meta, invoice.meta);
  });
  test("excludes customer identity and city when not chosen, without changing the invoice", () => {
    const doc = toChallan(invoice);
    const output = doOutput(doc, false);
    assert.equal(output.party, undefined);
    assert.deepEqual(output.meta, [["Courier service", "Courier"], ["Goods adda", "Transport"]]);
    assert.equal(doc.party?.name, "Private customer");
    assert.equal(invoice.party?.address, "Private address");
    assert.equal(output.lines?.[0].qty, 2);
  });
  test("does not change other invoice customer output", () => {
    assert.equal(doOutput(invoice, false, false), invoice);
  });
  test("hides delivery method while retaining customer details", () => {
    const output = doOutput(toChallan(invoice), true, false);
    assert.equal(output.party?.name, "Private customer");
    assert.equal(output.party?.address, "Private address");
    assert.deepEqual(output.meta, [["City / Area", "Private city"]]);
  });
  test("hides both customer details and delivery method", () => {
    const doc = toChallan(invoice);
    const output = doOutput(doc, false, false);
    assert.equal(output.party, undefined);
    assert.deepEqual(output.meta, []);
    assert.deepEqual(doc.meta, invoice.meta);
    assert.equal(output.lines?.[0].qty, 2);
  });
});