import { useEffect, useState } from "react";
import billing from "@/assets/slide-billing.jpg";
import stock from "@/assets/slide-stock.jpg";
import reports from "@/assets/slide-reports.jpg";
import mobile from "@/assets/slide-mobile.jpg";

const SLIDES = [
  { img: billing, tag: "Billing", title: "Fast counter billing", text: "Multiple invoice tabs, barcode scanning, split payments and instant thermal or A4 printing." },
  { img: stock, tag: "Inventory", title: "Multi-store stock control", text: "Per-store stock, transfers, purchase orders, manufacturing and low-stock alerts." },
  { img: reports, tag: "Reports", title: "40+ business reports", text: "Profit, day book, party ledgers, cash flow and balance sheet — export to Excel or PDF." },
  { img: mobile, tag: "Anywhere", title: "Works offline, syncs automatically", text: "Use it on PC, tablet or phone. Sales keep saving even when the internet drops." },
];

export function AuthShowcase() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden bg-sidebar">
      {SLIDES.map((s, k) => (
        <img
          key={s.tag}
          src={s.img}
          alt={s.title}
          width={1280}
          height={1600}
          loading={k === 0 ? "eager" : "lazy"}
          className={`showcase-img absolute inset-0 size-full object-cover ${k === i ? "is-active" : ""}`}
        />
      ))}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/60 to-sidebar/10" />
      <div className="absolute inset-x-0 bottom-0 p-12 text-sidebar-foreground">
        <div key={i} className="auth-rise max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar/60 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="size-1.5 rounded-full bg-gold" /> {SLIDES[i].tag}
          </span>
          <h2 className="mt-4 font-display text-4xl font-bold leading-tight">{SLIDES[i].title}</h2>
          <p className="mt-3 text-sidebar-muted">{SLIDES[i].text}</p>
        </div>
        <div className="mt-8 flex gap-2">
          {SLIDES.map((s, k) => (
            <button
              key={s.tag}
              type="button"
              aria-label={`Show ${s.title}`}
              onClick={() => setI(k)}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-sidebar-foreground/20"
            >
              {k === i ? <span key={i} className="showcase-bar block h-full rounded-full bg-sidebar-primary" /> : k < i ? <span className="block h-full bg-sidebar-primary/70" /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
