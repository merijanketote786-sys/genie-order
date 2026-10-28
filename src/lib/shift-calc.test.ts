import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { shiftSummary } from "./shift-calc";

describe("shiftSummary", () => {
  test("expected cash = float + cash in − cash out + drawer in − drawer out", () => {
    const s = shiftSummary(1000, [
      { direction: "in", method: "Cash", amount: 500, kind: "sale" },
      { direction: "out", method: "Cash", amount: 200, kind: "refund" },
    ], [{ direction: "in", amount: 100 }, { direction: "out", amount: 300 }]);
    assert.equal(s.expected, 1100);
  });
  test("non-cash payments do not change drawer cash", () => {
    const s = shiftSummary(0, [{ direction: "in", method: "JazzCash", amount: 700, kind: "sale" }], []);
    assert.equal(s.expected, 0);
    assert.equal(s.nonCash, 700);
  });
});
