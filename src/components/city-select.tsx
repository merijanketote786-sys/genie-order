import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { searchCities, type City } from "@/lib/postex-cities";

interface Props {
  id: string;
  label: string;
  placeholder?: string;
  value: City | null;
  onChange: (city: City | null) => void;
  /** Inline/compact layout (label hidden, chhoti height). */
  compact?: boolean;
}

export function CitySelect({ id, label, placeholder, value, onChange, compact }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Arrow-key highlight ko scroll kar ke nazar me rakhta hai.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const results = useMemo(() => (open ? searchCities(query) : []), [query, open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const select = (c: City) => {
    onChange(c);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <label
        htmlFor={id}
        className={
          compact
            ? "sr-only"
            : "flex items-center gap-2 text-sm font-semibold text-foreground"
        }
      >
        <MapPin className="h-4 w-4 text-primary" /> {label}
      </label>

      {value ? (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg border border-primary bg-accent ${compact ? "h-10 px-3" : "mt-2 rounded-xl px-4 py-2.5"}`}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-accent-foreground">{value.n}</p>
            {compact ? null : (
              <p className="truncate text-xs text-muted-foreground">
                {value.b} branch · {value.p}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={() => onChange(null)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-input text-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <input
          id={id}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          placeholder={placeholder ?? "Type a city name…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const picked = results[highlight];
              if (picked) select(picked);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className={`w-full border border-input bg-background text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 ${compact ? "h-10 rounded-lg px-3 text-sm" : "mt-2 h-12 rounded-xl px-4 text-base"}`}
        />
      )}

      {!value && open && query.trim() !== "" && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              No PostEx coverage found for “{query}”.
            </li>
          ) : (
            results.map((c, i) => (
              <li key={`${c.n}-${c.b}`} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => select(c)}
                  className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition ${
                    i === highlight ? "bg-accent" : "hover:bg-muted"
                  }`}
                >
                  <span className="text-sm font-semibold text-foreground">{c.n}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.b} branch · {c.p}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
