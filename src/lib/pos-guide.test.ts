import { test } from "node:test";
import { strict as assert } from "node:assert";
import { availableFaqs, matchGuideQuestion } from "./pos-guide";
import { GUIDE_FAQS } from "./pos-guide-faqs";
import { moduleEntryAllowed, moduleRedirect } from "./module-access";

test("free-text store questions return the store stock answer immediately", () => {
  assert.equal(matchGuideQuestion("Godown stock", GUIDE_FAQS)[0]?.id, "stores");
  assert.equal(matchGuideQuestion("गोदाम स्टॉक", GUIDE_FAQS)[0]?.id, "stores");
});
test("unknown questions never invent an answer", () => {
  assert.deepEqual(matchGuideQuestion("astronaut astrophysics", GUIDE_FAQS), []);
  assert.deepEqual(matchGuideQuestion("", GUIDE_FAQS), []);
});
test("every POS user can open Guide without additional action permissions", () => {
  assert.equal(moduleEntryAllowed("/pos-guide", { pos: true, workspace: false }), true);
  assert.equal(moduleRedirect("/pos-guide", { pos: false, workspace: true }), null);
});
test("disabled Workspace answers never enter question matching or topic list", () => {
  const allowed = availableFaqs(GUIDE_FAQS, { pos: true, workspace: false });
  assert.equal(allowed.some((faq) => faq.module === "workspace"), false);
  assert.equal(availableFaqs(GUIDE_FAQS, { pos: true, workspace: true }).some((faq) => faq.module === "workspace"), true);
});