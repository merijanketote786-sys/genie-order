import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { doOutput, toChallan } from "./do";
import type { PrintDoc } from "./render";

const invoice: PrintDoc = {
  kind: "pos", title: "Invoice", number: "INV-1", date: "2026-10-22",
  party: { label: "Customer", name: "Private customer", phone: "Private phone", address: "Private address" },
  meta: [["City / Area", "Private city"], ["Courier service", "Courier"]],
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
    assert.deepEqual(output.meta, [["Courier service", "Courier"]]);
    assert.equal(doc.party?.name, "Private customer");
    assert.equal(invoice.party?.address, "Private address");
    assert.equal(output.lines?.[0].qty, 2);
  });
  test("does not change other invoice customer output", () => {
    assert.equal(doOutput(invoice, false), invoice);
  });
});