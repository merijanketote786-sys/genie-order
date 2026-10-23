import { AppShell } from "@/components/app-shell";
import { useMySubscription } from "@/components/subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GUIDE_FAQS } from "@/lib/pos-guide-faqs";
import { availableFaqs, matchGuideQuestion, type GuideFaq } from "@/lib/pos-guide";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, CircleHelp, Search, Send, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/_authenticated/pos-guide")({
  head: () => ({ meta: [
    { title: "App Guide — HBPOS" },
    { name: "description", content: "Ready-made answers to HBPOS billing, stock, purchases, printing and app questions." },
    { property: "og:title", content: "App Guide — HBPOS" },
    { property: "og:description", content: "Find instant answers in the HBPOS app guide." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: GuidePage,
});

function GuidePage() {
  const subscription = useMySubscription().data;
  const faqs = useMemo(() => availableFaqs(GUIDE_FAQS, { pos: subscription?.pos ?? false, workspace: subscription?.workspace ?? false }), [subscription?.pos, subscription?.workspace]);
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("All topics");
  const [asked, setAsked] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const result = useMemo(() => matchGuideQuestion(asked, faqs), [asked, faqs]);
  const categories = ["All topics", ...new Set(faqs.map((faq) => faq.category))];
  const rows = faqs.filter((faq) => category === "All topics" || faq.category === category);
  const ask = (value: string) => { if (value.trim()) { setAsked(value.trim()); setQuestion(value); } };
  return <AppShell title="Guide" subtitle="App questions & answers" active="/pos">
    <section className="py-6 sm:py-8">
      <div className="mb-6 flex items-center gap-3"><BookOpen className="size-7 text-primary" /><h2 className="font-display text-2xl font-bold">App Guide</h2></div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input ref={input} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about billing, stock, purchases..." aria-label="Your app question" maxLength={500} className="h-12 pl-9" /></div>
        <Button type="submit" disabled={!question.trim()} className="h-12"><Send className="size-4" /><span className="hidden sm:inline">Ask</span></Button>
      </form>
      {asked && <section className="mt-6 border-y border-border py-5" aria-label="Question answers" aria-live="polite">
        <div className="mb-4 flex items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">{asked}</h3><Button variant="ghost" size="icon" aria-label="Clear question" onClick={() => { setAsked(""); setQuestion(""); input.current?.focus(); }}><X className="size-4" /></Button></div>
        {result.length ? <div className="space-y-5">{result.map((faq) => <Answer key={faq.id} faq={faq} />)}</div> : <p className="text-sm text-muted-foreground">No ready-made answer matches this question yet. Try the feature name or choose a question below. For account-specific issues, contact your admin.</p>}
      </section>}
      <div className="mt-7 flex flex-wrap gap-2" aria-label="Guide topics">{categories.map((name) => <Button key={name} variant={category === name ? "default" : "outline"} size="sm" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</Button>)}</div>
      <div className="mt-5 divide-y divide-border">{rows.map((faq) => <details key={faq.id} className="group py-4"><summary className="flex cursor-pointer list-none items-start gap-3 font-medium text-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1">{faq.question}</span><span className="text-muted-foreground group-open:hidden">+</span></summary><p className="mt-3 pl-7 text-sm leading-7 text-muted-foreground">{faq.answer}</p></details>)}</div>
    </section>
  </AppShell>;
}

function Answer({ faq }: { faq: GuideFaq }) {
  return <article><p className="mb-1 text-xs font-semibold uppercase text-primary">{faq.category}</p><h4 className="font-semibold">{faq.question}</h4><p className="mt-2 text-sm leading-7 text-muted-foreground">{faq.answer}</p></article>;
}