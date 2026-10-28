export type ShiftPayment = { direction: string; method: string; amount: number; kind: string };
export type ShiftMove = { direction: "in" | "out"; amount: number };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Expected drawer cash = opening float + cash received − cash paid + cash in − cash out. Non-cash methods are reported separately. */
export function shiftSummary(openingFloat: number, payments: ShiftPayment[], moves: ShiftMove[]) {
  let cashIn = 0, cashOut = 0, other = 0, sales = 0;
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    const amt = Number(p.amount) || 0;
    const sign = p.direction === "in" ? 1 : -1;
    byMethod[p.method] = r2((byMethod[p.method] ?? 0) + sign * amt);
    if (p.direction === "in" && p.kind === "sale") sales += amt;
    if (p.method.toLowerCase() === "cash") { if (sign > 0) cashIn += amt; else cashOut += amt; } else other += sign * amt;
  }
  const drawerIn = moves.filter((m) => m.direction === "in").reduce((s, m) => s + Number(m.amount), 0);
  const drawerOut = moves.filter((m) => m.direction === "out").reduce((s, m) => s + Number(m.amount), 0);
  return {
    openingFloat: r2(openingFloat), cashReceived: r2(cashIn), cashPaid: r2(cashOut), drawerIn: r2(drawerIn), drawerOut: r2(drawerOut),
    nonCash: r2(other), salesCollected: r2(sales), byMethod,
    expected: r2(openingFloat + cashIn - cashOut + drawerIn - drawerOut),
  };
}
export type ShiftSummary = ReturnType<typeof shiftSummary>;
