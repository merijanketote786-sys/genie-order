/**
 * Compact customer search — Order/Invoice pages ke andar.
 * Naam / city / phone se search, select kar ke copy ya seedha composer me add.
 */
import { listCustomers, type CustomerRow } from "@/lib/records.functions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Copy, CornerDownLeft, Loader2, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Props = {
  /** Selected customer ka detail composer me daalne ke liye. */
  onUse?: (text: string, customer: CustomerRow) => void;
  useLabel?: string;
};

export function customerToText(c: CustomerRow): string {
  return [
    `Name: ${c.name || ""}`,
    `Phone: ${c.phone}`,
    `City: ${c.city || ""}`,
    `Address: ${c.address || ""}`,
  ].join("\n");
}

export function CustomerPicker({ onUse, useLabel = "Add" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left sm:px-4"
      >
        <Users className="size-4 shrink-0 text-primary" />
        <span className="text-sm font-semibold text-foreground">Customer search</span>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          · naam, city ya phone se saved customer
        </span>
        <ChevronDown
          className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <CustomerPickerBody onUse={onUse} useLabel={useLabel} /> : null}
    </section>
  );
}

export function CustomerPickerBody({ onUse, useLabel = "Add" }: Props) {
  const load = useServerFn(listCustomers);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setSearch(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ["customer-picker", search],
    queryFn: () => load({ data: search ? { search } : {} }),
    staleTime: 60_000,
    retry: 0,
  });

  const customers: CustomerRow[] = (data?.customers ?? []).slice(0, 25);

  const copy = async (c: CustomerRow) => {
    try {
      await navigator.clipboard.writeText(customerToText(c));
      toast.success("Customer detail copy ho gaya");
    } catch {
      toast.error("Copy nahi ho saka");
    }
  };

  return (
    <div className="space-y-2 border-t border-border px-3 py-3 sm:px-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Naam, city ya phone number likhein"
          aria-label="Customer search"
          className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        {isFetching ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {customers.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          {search ? "Koi customer nahi mila." : "Saved customers yahan dikhenge."}
        </p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {customers.map((c) => {
            const active = selected === c.id;
            return (
              <li key={c.id}>
                <div
                  className={`rounded-xl border px-3 py-2 transition ${active ? "border-primary bg-accent/40" : "border-border bg-background"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(active ? null : c.id)}
                    className="w-full text-left"
                  >
                    <p className="truncate text-sm font-semibold text-foreground">
                      {c.name || "Bina naam"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.phone}
                      {c.city ? ` · ${c.city}` : ""}
                      {c.orderCount ? ` · ${c.orderCount} orders` : ""}
                    </p>
                    {active && c.address ? (
                      <p className="mt-1 text-xs text-muted-foreground">{c.address}</p>
                    ) : null}
                  </button>
                  {active ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copy(c)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        <Copy className="size-3.5" /> Copy
                      </button>
                      {onUse ? (
                        <button
                          type="button"
                          onClick={() => onUse(customerToText(c), c)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                        >
                          <CornerDownLeft className="size-3.5" /> {useLabel}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
