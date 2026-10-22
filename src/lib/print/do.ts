import type { PrintDoc } from "./render";

/** Print-only conversion; never modifies the saved invoice or its customer. */
export function toChallan(doc: PrintDoc): PrintDoc {
  return {
    ...doc,
    kind: "pos",
    title: "D-O",
    number: doc.number.startsWith("DC-") ? doc.number : `DC-${doc.number}`,
    party: { label: "Deliver To", name: doc.party?.name, phone: doc.party?.phone, address: doc.party?.address },
    lines: (doc.lines ?? []).map((line) => ({ ...line, rate: 0, discount: 0, taxPct: 0, total: 0 })),
    totals: [], payments: [], paid: 0, balance: 0, customFields: undefined,
  };
}

export function doOutput(doc: PrintDoc, includeCustomer: boolean): PrintDoc {
  if (doc.title !== "D-O" || includeCustomer) return doc;
  return {
    ...doc,
    party: undefined,
    meta: doc.meta?.filter(([label]) => label !== "City / Area"),
  };
}