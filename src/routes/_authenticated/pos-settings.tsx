import { AppShell } from "@/components/app-shell";
import { usePosAccess } from "@/components/pos-access";
import { PAY_OPTS, PosSubnav, posInput } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { POS_ROLES, exportPosBackup, listPosMembers, savePosSettings, setPosMemberRole, type PosConfig } from "@/lib/pos-access.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pos-settings")({
  head: () => ({
    meta: [
      { title: "POS Staff & Settings — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Staff roles, ijazatein, manager PIN, receipt aur POS defaults, backup." },
      { property: "og:title", content: "POS Staff & Settings — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "POS roles aur settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosSettingsPage,
});

const PERM_LABEL: Record<string, string> = {
  view_pos: "POS dekhna", create_sale: "Sale banana", edit_price: "Rate badalna", apply_discount: "Discount dena", cancel_invoice: "Bill cancel",
  view_reports: "Reports / Day book", view_profit: "Profit dekhna", edit_stock: "Stock edit", edit_products: "Product edit", view_balances: "Customer udhaar",
  manage_expenses: "Expenses", manage_purchases: "Purchases / Suppliers", manage_users: "Staff roles", settings: "Settings",
};
const ROLE_PERMS: Record<string, string[]> = {
  admin: Object.keys(PERM_LABEL),
  manager: Object.keys(PERM_LABEL).filter((p) => p !== "manage_users" && p !== "settings"),
  salesman: ["view_pos", "create_sale", "apply_discount", "view_balances"],
  cashier: ["view_pos", "create_sale", "view_balances", "manage_expenses"],
  staff: ["view_pos", "create_sale"],
};
const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", cashier: "Cashier", salesman: "Salesman", staff: "Staff" };

function PosSettingsPage() {
  const qc = useQueryClient();
  const { access, can } = usePosAccess();
  const isAdmin = can("settings");
  const { data: mem } = useQuery({ queryKey: ["pos-members"], queryFn: () => listPosMembers(), enabled: can("manage_users") });
  const [cfg, setCfg] = useState<PosConfig>({});
  const [pin, setPin] = useState("");
  useEffect(() => { if (access) setCfg(access.config); }, [access]);

  const save = async (pinVal: string | null) => {
    try {
      await savePosSettings({ data: { config: cfg, pin: pinVal } });
      toast.success(pinVal === "" ? "PIN hata diya" : pinVal ? "PIN set ho gaya" : "Settings save");
      setPin(""); qc.invalidateQueries({ queryKey: ["pos-access"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Nahi hua"); }
  };
  const backup = async () => {
    try {
      const { json } = await exportPosBackup();
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Nahi hua"); }
  };
  const L = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="text-xs text-muted-foreground">{label}{children}</label>;

  return (
    <AppShell title="POS Staff & Settings" subtitle="Roles, PIN, receipt" active="/pos">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <section className="rounded-xl border border-border bg-card p-3 text-sm">
          <p className="flex items-center gap-2 font-bold text-foreground"><ShieldCheck className="size-4 text-primary" /> Aap ka role: {ROLE_LABEL[access?.role ?? "staff"]}</p>
          <p className="mt-1 text-xs text-muted-foreground">Ijazatein: {(access?.perms ?? []).map((p) => PERM_LABEL[p]).join(", ")}</p>
          {!isAdmin ? <p className="mt-2 text-xs text-muted-foreground">Settings sirf Admin badal sakta hai. Rate/discount/cancel ki ijazat na ho to manager PIN se kaam ho jata hai.</p> : null}
        </section>

        {can("manage_users") ? (
          <section className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-bold text-foreground">Staff roles</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th>User</th><th>Role</th><th>Kya kar sakta hai</th></tr></thead>
                <tbody>
                  {(mem?.members ?? []).map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="py-1.5">{m.name}{!m.active ? <span className="ml-1 text-xs text-destructive">(inactive)</span> : null}</td>
                      <td>{m.role === "admin" ? <b>Admin (owner)</b> : (
                        <select className="h-8 rounded-md border border-border bg-background px-2" value={m.role} aria-label={`${m.name} role`} onChange={async (e) => {
                          try { await setPosMemberRole({ data: { userId: m.id, role: e.target.value as (typeof POS_ROLES)[number] } }); toast.success("Role save"); qc.invalidateQueries({ queryKey: ["pos-members"] }); } catch (er) { toast.error(er instanceof Error ? er.message : "Nahi hua"); }
                        }}>{POS_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                      )}</td>
                      <td className="text-xs text-muted-foreground">{ROLE_PERMS[m.role].map((p) => PERM_LABEL[p]).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {isAdmin ? (
          <>
            <section className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-bold text-foreground">Manager PIN {access?.hasPin ? <span className="text-xs text-primary">(set hai)</span> : <span className="text-xs text-destructive">(set nahi)</span>}</p>
              <p className="text-xs text-muted-foreground">Cashier/Salesman ko rate badalna, discount dena ya bill cancel karna ho to ye PIN mangta hai. Har PIN istemal audit log me record hota hai.</p>
              <div className="flex flex-wrap gap-2">
                <input className={`${posInput} w-40`} type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Naya PIN (4-8)" aria-label="Naya PIN" />
                <Button disabled={pin.length < 4} onClick={() => save(pin)}>PIN set karein</Button>
                {access?.hasPin ? <Button variant="ghost" onClick={() => save("")}>PIN hatayein</Button> : null}
              </div>
            </section>

            <section className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-bold text-foreground">Receipt aur defaults</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <L label="Receipt par business naam"><input className={posInput} value={cfg.receiptBusiness ?? ""} onChange={(e) => setCfg({ ...cfg, receiptBusiness: e.target.value })} placeholder="Khali = Settings wala naam" /></L>
                <L label="Receipt ke neeche line"><input className={posInput} value={cfg.receiptFooter ?? ""} onChange={(e) => setCfg({ ...cfg, receiptFooter: e.target.value })} placeholder="Shukriya! Dobara tashreef layein." /></L>
                <L label="Default payment"><select className={posInput} value={cfg.defaultPayMethod ?? "Cash"} onChange={(e) => setCfg({ ...cfg, defaultPayMethod: e.target.value })}>{PAY_OPTS.map((m) => <option key={m}>{m}</option>)}</select></L>
                <L label="Default tax %"><input className={posInput} inputMode="decimal" value={cfg.defaultTax ?? ""} onChange={(e) => setCfg({ ...cfg, defaultTax: Number(e.target.value) || 0 })} placeholder="0" /></L>
                <L label="Terms & conditions (receipt par)"><textarea className={`${posInput} h-20 py-2`} value={cfg.terms ?? ""} onChange={(e) => setCfg({ ...cfg, terms: e.target.value })} placeholder="Maal wapas 7 din me..." /></L>
              </div>
              <p className="text-xs text-muted-foreground">Invoice number, currency aur business phone/address Admin panel ki Workspace settings se aate hain. Printer/paper Billing ke "POS Settings" tab me hain (har device ka alag).</p>
              <Button onClick={() => save(null)}><Save /> Settings save</Button>
            </section>

            <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
              <div><p className="text-sm font-bold text-foreground">Backup</p><p className="text-xs text-muted-foreground">Sales, purchases, payments, expenses, customers, suppliers, stock — sab ek file me.</p></div>
              <Button variant="outline" onClick={backup}><Download /> Backup download</Button>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
