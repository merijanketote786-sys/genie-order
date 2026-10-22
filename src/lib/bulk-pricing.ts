// ============= Rate-by-percentage rules for POS "Bulk update items" =============
// The "Rate by %" switch is the master gate for every percentage-driven rate change.
// When it is off, no rate is ever calculated from a percentage — rates only move when
// they are typed directly or set with a fixed value / +/− amount.

export type PctRow = { purchase_price: string; sale_price: string; wholesale_price: string };

export type PctApply = {
  /** Master switch ("Rate by %") state. */
  on: boolean;
  /** Apply the percentage to the sale price. */
  sale: boolean;
  /** Apply the percentage to the wholesale price. */
  ws: boolean;
  salePct: string;
  wsPct: string;
};

/** purchase price + pct%, rounded to 2 decimals; null when either value is unusable. */
export function priced(pp: string, pct: string): string | null {
  const c = Number(pp), x = Number(pct);
  return pp.trim() === "" || pct.trim() === "" || !isFinite(c) || !isFinite(x) ? null : String(Math.round(c * (1 + x / 100) * 100) / 100);
}

/**
 * Apply percentage rates to one row. The row comes back untouched whenever the master
 * switch is off, so a switched-off toggle can never move a price.
 */
export function applyPctRates<T extends PctRow>(row: T, o: PctApply): T {
  if (!o.on) return row;
  const out = { ...row };
  if (o.sale) { const v = priced(row.purchase_price, o.salePct); if (v != null) out.sale_price = v; }
  if (o.ws) { const v = priced(row.purchase_price, o.wsPct); if (v != null) out.wholesale_price = v; }
  return out;
}
