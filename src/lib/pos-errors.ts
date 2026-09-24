/** Database errors ko user-friendly message me badalta hai (kabhi silent fail nahi). */

/** Known Roman Urdu exception messages raised by database functions — translated to English here without touching the database. */
const DB_MESSAGE_TRANSLATIONS: [RegExp, string][] = [
  [/Product add karne ki ijazat nahi/g, "Not allowed to add products"],
  [/Product delete karne ki ijazat nahi/g, "Not allowed to delete products"],
  [/Product edit ki ijazat nahi/g, "Not allowed to edit products"],
  [/Product name khali nahi ho sakta/g, "Product name cannot be empty"],
  [/Product name likhein/g, "Enter a product name"],
  [/Is naam ka product pehle se maujood hai/g, "A product with this name already exists"],
  [/Zyada products/g, "Too many products"],
  [/Cancel ki ijazat nahi — manager PIN chahiye/g, "Not allowed to cancel — manager PIN required"],
  [/Stock edit ki ijazat nahi/g, "Not allowed to edit stock"],
  [/Purchase ki ijazat nahi/g, "Not allowed to manage purchases"],
  [/Expense ki ijazat nahi/g, "Not allowed to manage expenses"],
  [/Bill nahi mila ya pehle se cancel/g, "Bill not found or already cancelled"],
  [/Access band hai/g, "Access denied"],
  [/Ijazat nahi/g, "Not allowed"],
];

/** Translates known Roman Urdu DB exception messages to English (DB itself is left untouched). */
function translateDbMessage(msg: string): string {
  let out = msg;
  for (const [re, en] of DB_MESSAGE_TRANSLATIONS) out = out.replace(re, en);
  return out;
}

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
  "Not allowed to edit stock",
  "Not allowed to cancel",
];

export function friendlyDbError(err: { message?: string; code?: string } | null | undefined, fallback: string): string {
  const msg = translateDbMessage(err?.message ?? "");
  const hit = KNOWN.find((k) => msg.includes(k));
  if (hit) return msg;
  if (err?.code === "23505") return "This entry has already been saved (duplicate blocked).";
  if (/fetch|network|timeout/i.test(msg)) return "Internet issue — please try again. Nothing was partially saved.";
  return `${fallback} Try again.`;
}

export const newRef = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
