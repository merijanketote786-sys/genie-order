export function productTaxPercent(enabled: boolean, productTax: number | null | undefined, defaultTax: number) {
  if (!enabled) return 0;
  const value = productTax ?? defaultTax;
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** Match PostgreSQL numeric half-up rounding for POS's two-decimal ledger. */
export function roundPosAmount(value: number) {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON * Math.max(1, Math.abs(value))) * 100) / 100;
}

/** Bill discounts are post-tax deductions, never larger than the item total. */
export function billDiscountAmount(value: number, gross: number) {
  return roundPosAmount(Math.min(Math.max(0, Number.isFinite(value) ? value : 0), Math.max(0, gross)));
}