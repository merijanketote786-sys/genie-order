import type { ModuleAccess } from "@/lib/module-access";

export type GuideFaq = { id: string; module: "pos" | "workspace"; category: string; question: string; answer: string; keywords: string };

const aliases: Record<string, string> = {
  godown: "store", godam: "store", warehouse: "store", stores: "store", stock: "stock",
  kharcha: "expense", expenses: "expense", udhaar: "credit", udhar: "credit",
  bill: "invoice", billing: "invoice", invoices: "invoice", quotation: "estimate", estimates: "estimate",
  bottles: "bottle", packing: "manufacturing", percent: "percentage", rates: "price", rate: "price",
  products: "item", items: "item", delete: "cancel", remove: "cancel", whatsapp: "whatsapp",
  گودام: "store", اسٹاک: "stock", سٹاک: "stock", بل: "invoice", خریداری: "purchase", خرچہ: "expense",
  गोदाम: "store", स्टॉक: "stock", बिल: "invoice", खरीद: "purchase", खर्च: "expense",
};
const stopWords = new Set("how do i a an the to in on for of is can my we what why when where and or it this that please me mujhe ka ki ke ko ma mein mai hai ha ho se kar kro kr kya kese kaise kis k ky liye aur apni hum ham bana bna karein करें कैसे मुझे है में को का की के और क्या मैं हम".split(/\s+/));
export function guideWords(text: string): string[] {
  return [...new Set(text.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{M}\p{N}%]+/gu, " ").split(/\s+/).map((word) => aliases[word] ?? word).filter((word) => word && !stopWords.has(word)))];
}
export function availableFaqs(faqs: GuideFaq[], access: ModuleAccess): GuideFaq[] {
  return faqs.filter((faq) => faq.module === "pos" ? access.pos !== false : access.workspace !== false);
}
export function matchGuideQuestion(question: string, faqs: GuideFaq[]): GuideFaq[] {
  const words = guideWords(question);
  if (!words.length) return [];
  return faqs.map((faq, index) => {
    const title = new Set(guideWords(`${faq.question} ${faq.keywords}`));
    const hits = words.filter((word) => title.has(word));
    return { faq, index, score: hits.length / words.length + hits.length * 0.1, hits: hits.length };
  }).filter((row) => row.hits > 0 && row.score >= 0.35).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3).map((row) => row.faq);
}