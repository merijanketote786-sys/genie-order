/** Configured scale layout only: RCN formats vary by region and scale. */
export type WeightBarcodeConfig = {
  enabled?: boolean; prefix?: string; productDigits?: number; weightDigits?: number;
  decimals?: number; unit?: "kg" | "g" | "lb"; checkDigit?: boolean;
};
export const DEFAULT_WEIGHT_BARCODE = { enabled: false, prefix: "", productDigits: 5, weightDigits: 5, decimals: 3, unit: "kg" as const, checkDigit: true };
export function weightBarcodeError(c: WeightBarcodeConfig): string | null {
  if (!c.enabled) return null;
  if (!/^\d{1,4}$/.test(c.prefix ?? "")) return "Scale barcode prefix must contain 1 to 4 digits";
  const p = c.productDigits ?? 5, w = c.weightDigits ?? 5, d = c.decimals ?? 3;
  if (!Number.isInteger(p) || p < 1 || p > 8 || !Number.isInteger(w) || w < 1 || w > 8) return "Barcode fields must contain 1 to 8 digits";
  if (!Number.isInteger(d) || d < 0 || d > 6 || d > w) return "Weight decimal places must be between 0 and the weight digit count (maximum 6)";
  if (!["kg", "g", "lb"].includes(c.unit ?? "kg")) return "Choose a supported scale weight unit";
  if ((c.checkDigit ?? true) && (c.prefix ?? "").length + p + w !== 12) return "EAN-13 requires 12 data digits plus the check digit";
  return null;
}
export function validEan13(code: string) {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code.slice(0, 12)].reduce((s, v, i) => s + Number(v) * (i % 2 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(code[12]);
}
export function parseWeightBarcode(raw: string, config: WeightBarcodeConfig) {
  const c = { ...DEFAULT_WEIGHT_BARCODE, ...config }, code = raw.trim();
  if (!c.enabled || !c.prefix || !code.startsWith(c.prefix)) return null;
  const invalid = weightBarcodeError(c);
  if (invalid) throw new Error(invalid);
  const length = c.prefix.length + c.productDigits + c.weightDigits + (c.checkDigit ? 1 : 0);
  if (!/^\d+$/.test(code) || code.length !== length) throw new Error("Invalid scale barcode length or digits");
  if (c.checkDigit && !validEan13(code)) throw new Error("Invalid scale barcode check digit");
  const productCode = code.slice(c.prefix.length, c.prefix.length + c.productDigits);
  const weight = Number(code.slice(c.prefix.length + c.productDigits, c.prefix.length + c.productDigits + c.weightDigits)) / 10 ** c.decimals;
  if (!(weight > 0)) throw new Error("Scale barcode weight must be greater than zero");
  return { productCode, weight, unit: c.unit };
}
export function weightInProductUnit(weight: number, scaleUnit: "kg" | "g" | "lb", productUnit: string) {
  const unit = productUnit.trim().toLowerCase();
  const factor = /^(kg|kilogram|kilograms|kilo)$/.test(unit) ? 1 : /^(g|gm|gram|grams)$/.test(unit) ? 0.001 : /^(lb|lbs|pound|pounds)$/.test(unit) ? 0.45359237 : null;
  if (factor === null) throw new Error("Scale barcode requires a product measured in kg, g or lb");
  const kg = weight * (scaleUnit === "g" ? 0.001 : scaleUnit === "lb" ? 0.45359237 : 1);
  const qty = Math.round(kg / factor * 1000) / 1000;
  if (!(qty > 0)) throw new Error("Weight is below the supported quantity precision");
  return qty;
}