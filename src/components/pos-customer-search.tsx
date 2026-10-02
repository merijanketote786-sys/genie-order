import { listCustomers, saveParty } from "@/lib/records.functions";
import { listSuppliers } from "@/lib/business.functions";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

type Cust = { supplier?: boolean; id: string; name: string | null; phone: string; city: string | null; address: string | null; courierServiceName: string | null; goodsAddaName: string | null };

export function PosCustomerSearch({
  value,
  onChange,
  onPick,
  field,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (c: Cust) => void;
  field: "name" | "phone";
  placeholder: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  // Arrow-key highlight ko scroll kar ke nazar me rakhta hai.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [idx]);
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 200);
    return () => clearTimeout(t);
  }, [value]);

  const { data } = useQuery({
    queryKey: ["pos-customers", q],
    queryFn: () => listCustomers({ data: { search: q || undefined } }),
    enabled: open,
    staleTime: 30_000,
  });
  const { data: sup } = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers(), enabled: open, staleTime: 30_000 });
  const custs = (data?.customers ?? []) as Cust[];
  const phones = new Set(custs.map((c) => c.phone.replace(/\D/g, "")).filter((p) => p.length >= 7).map((p) => p.slice(-10)));
  const ql = q.toLowerCase();
  // Suppliers bhi party ke tor par dikhte hain (jo pehle se customer na hon).
  const sups: Cust[] = (sup?.suppliers ?? [])
    .filter((s) => { const digits = s.phone.replace(/\D/g, ""); return digits.length < 7 || !phones.has(digits.slice(-10)); })
    .filter((s) => !ql || s.name.toLowerCase().includes(ql) || (s.phone ?? "").includes(q))
    .map((s) => ({ supplier: true, id: s.id, name: s.name, phone: s.phone ?? "", city: null, address: s.address || null, courierServiceName: null, goodsAddaName: null }));
  const list = [...custs.slice(0, 8), ...sups.slice(0, 5)];
  useEffect(() => setIdx(0), [q]);

  // A complete, unambiguous saved name/number fills the address without requiring a click.
  useEffect(() => {
    if (!open || !q || q !== value.trim()) return;
    const matches = custs.filter((c) => field === "phone"
      ? c.phone.replace(/\D/g, "") === q.replace(/\D/g, "")
      : c.name?.trim().toLowerCase() === q.toLowerCase());
    if (matches.length === 1) onPick(matches[0]);
    // Only react to fresh search results; onPick updates the other input as well.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, open, field]);

  const pick = async (c: Cust) => {
    setOpen(false);
    if (!c.supplier) return onPick(c);
    if (!c.phone || c.phone.replace(/\D/g, "").length < 7) return toast.error("Add a phone number to this party first");
    try {
      // Supplier ko party (customer) record se link karte hain taake bill aur ledger save hon.
      const res = await saveParty({ data: { name: c.name || "Party", phone: c.phone, address: c.address || undefined } });
      onPick(res.customer);
    } catch (e) { toast.error((e as Error).message || "Could not use party"); }
  };

  return (
    <div className="relative">
      <input
        className={className}
        value={value}
        inputMode={field === "phone" ? "tel" : undefined}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          const v = field === "phone" ? e.target.value.replace(/[^\d+\s-]/g, "") : e.target.value;
          onChange(v);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(list[idx]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && list.length > 0 ? (
        <ul ref={listRef} className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
          {list.map((c, i) => (
            <li key={(c.supplier ? "s" : "c") + c.id} role="option" aria-selected={i === idx}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                onMouseEnter={() => setIdx(i)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left ${i === idx ? "bg-accent text-accent-foreground" : "text-popover-foreground"}`}
              >
                 <p className="truncate text-sm font-semibold">{c.name || "No name"}</p>
                <p className="truncate text-xs text-muted-foreground">{c.phone}{c.city ? ` · ${c.city}` : ""}</p>
                 {c.address ? <p className="truncate text-xs text-muted-foreground">{c.address}</p> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
