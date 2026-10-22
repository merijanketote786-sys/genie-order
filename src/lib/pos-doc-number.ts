/** Preserve every character after the estimate prefix, including leading zeros. */
export function estimateInvoiceNumber(number: string): string {
  return number.replace(/^QT/, "INV");
}