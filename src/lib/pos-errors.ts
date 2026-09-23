/** Database errors ko user-friendly message me badalta hai (kabhi silent fail nahi). */
const KNOWN = [
  "Access denied",
  "Discount permission required",
  "Purchase permission required",
  "Return quantity exceeds sold quantity",
  "Original invoice not found or cancelled",
  "Product is inactive",
  "Customer not found",
  "Supplier not found",
  "Invalid amount",
  "Invoice not found or already cancelled",
  "Cancel the returns of this invoice first",
  "Stock edit ki ijazat nahi",
  "Cancel ki ijazat nahi",
];

export function friendlyDbError(err: { message?: string; code?: string } | null | undefined, fallback: string): string {
  const msg = err?.message ?? "";
  const hit = KNOWN.find((k) => msg.includes(k));
  if (hit) return msg.replace(/^.*?(?=\b(?:[A-Z]))/, "").trim() || hit;
  if (err?.code === "23505") return "Yeh entry pehle hi save ho chuki hai (duplicate roki gayi).";
  if (/fetch|network|timeout/i.test(msg)) return "Internet masla — dobara try karein. Kuch bhi aadha save nahi hua.";
  return `${fallback} Dobara try karein.`;
}

export const newRef = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
