import { Button } from "@/components/ui/button";
import { saveSupplier } from "@/lib/business.functions";
import { saveCustomerAccount } from "@/lib/ledger.functions";
import { saveParty } from "@/lib/records.functions";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Row = { name: string; phone: string; city: string; address: string; type: "customer" | "supplier"; opening: number | null };

const pick = (h: string[], re: RegExp) => h.findIndex((x) => re.test(x.trim()));

function toRows(all: string[][]): Row[] {
  const hi = all.findIndex((r) => r.some((c) => /name|party/i.test(String(c))));
  if (hi < 0) return [];
  const h = all[hi].map((c) => String(c ?? ""));
  const iN = pick(h, /name|party/i), iP = pick(h, /phone|mobile|contact|cell/i), iC = pick(h, /city/i), iA = pick(h, /address/i), iT = pick(h, /type|group/i), iO = pick(h, /opening|balance/i);
  return all.slice(hi + 1).map((r) => {
    const g = (i: number) => (i < 0 ? "" : String(r[i] ?? "").trim());
    const o = g(iO).replace(/[^0-9.\-]/g, "");
    return { name: g(iN), phone: g(iP).replace(/[^0-9+]/g, ""), city: g(iC), address: g(iA), type: /supp|vendor|pay/i.test(g(iT)) ? "supplier" : "customer", opening: o && isFinite(Number(o)) ? Number(o) : null } as Row;
  }).filter((r) => r.name);
}

export function PartyImport({ disabled }: { disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(0);

  const onFile = async (f: File) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const all = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const r = toRows(all);
      if (!r.length) return toast.error("No parties found. File needs a Name column.");
      setRows(r);
    } catch { toast.error("Could not read file"); }
  };

  const sample = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["Name", "Phone", "City", "Address", "Type", "Opening Balance"], ["Ali Traders", "03001234567", "Lahore", "Shop 5, Main Market", "Customer", "0"], ["Khan Supplier", "", "Karachi", "", "Supplier", "0"]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Parties"); XLSX.writeFile(wb, "parties-sample.xlsx");
  };

  const run = async () => {
    if (!rows) return;
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i++) {
      setBusy(i + 1);
      const r = rows[i];
      try {
        if (r.type === "customer" && r.phone.replace(/\D/g, "").length >= 7) {
          const res = await saveParty({ data: { name: r.name.slice(0, 200), phone: r.phone.slice(0, 20), city: r.city || undefined, address: r.address || undefined } });
          if (r.opening != null) await saveCustomerAccount({ data: { id: res.customer.id, openingBalance: r.opening, creditLimit: null } });
        } else {
          await saveSupplier({ data: { name: r.name.slice(0, 120), phone: r.phone.slice(0, 30) || undefined, address: [r.address, r.city].filter(Boolean).join(", ").slice(0, 300) || undefined, openingBalance: r.opening ?? undefined } });
        }
        ok++;
      } catch { fail++; }
    }
    setBusy(0); setRows(null);
    qc.invalidateQueries();
    fail ? toast.warning(`${ok} parties imported, ${fail} failed`) : toast.success(`${ok} parties imported`);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold text-foreground">Import parties (CSV / Excel)</p>
      <p className="text-xs text-muted-foreground">Columns: Name (required), Phone, City, Address, Type (Customer/Supplier), Opening Balance. Customers with the same phone are updated, not duplicated. Customers without a phone are saved as name-only parties.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={disabled || !!busy} onClick={() => ref.current?.click()}><Upload /> Import file</Button>
        <Button size="sm" variant="outline" onClick={sample}><Download /> Download sample</Button>
        <input ref={ref} type="file" hidden accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
      </div>
      {rows ? (
        <div className="space-y-2 rounded-lg bg-muted p-2 text-sm">
          <p><b>{rows.length}</b> parties found · {rows.filter((r) => r.type === "supplier").length} suppliers</p>
          <div className="max-h-48 overflow-auto text-xs">
            <table className="w-full"><thead><tr className="text-left text-muted-foreground"><th>Name</th><th>Phone</th><th>City</th><th>Type</th><th>Opening</th></tr></thead>
              <tbody>{rows.slice(0, 100).map((r, i) => <tr key={i} className="border-t border-border"><td>{r.name}</td><td>{r.phone}</td><td>{r.city}</td><td>{r.type}</td><td>{r.opening ?? ""}</td></tr>)}</tbody></table>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setRows(null)}>Cancel</Button>
            <Button size="sm" disabled={!!busy} onClick={run}>{busy ? `Importing ${busy}/${rows.length}…` : `Import ${rows.length} parties`}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
