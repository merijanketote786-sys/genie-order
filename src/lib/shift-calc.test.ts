import { describe, expect, it } from "vitest";
import { shiftSummary } from "./shift-calc";

describe("shiftSummary", () => {
  it("expected cash = float + cash in − cash out + drawer in − drawer out", () => {
    const s = shiftSummary(1000, [
      { direction: "in", method: "Cash", amount: 500, kind: "sale" },
      { direction: "out", method: "Cash", amount: 200, kind: "refund" },
    ], [{ direction: "in", amount: 100 }, { direction: "out", amount: 300 }]);
    expect(s.expected).toBe(1100);
  });
  it("non-cash payments do not change drawer cash", () => {
    const s = shiftSummary(0, [{ direction: "in", method: "JazzCash", amount: 700, kind: "sale" }], []);
    expect(s.expected).toBe(0);
    expect(s.nonCash).toBe(700);
  });
});
