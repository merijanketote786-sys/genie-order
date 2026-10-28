export function productTaxPercent(enabled: boolean, productTax: number | null | undefined, defaultTax: number) {
  if (!enabled) return 0;
  const value = productTax ?? defaultTax;
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}