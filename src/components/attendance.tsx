import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { posInput } from "@/components/pos-subnav";
import { usePosAccess } from "@/components/pos-access";
import {
  deleteDevice, getDayAttendance, importPunches, listDevices, listLabour, saveDayAttendance, saveDevice, saveLabour,
  type DayStatus, type Labour,
} from "@/lib/attendance.functions";
import { Copy, Pencil, Plus, Trash2, Upload, UserPlus } from "lucide-react";

export const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const STATUS: { v: DayStatus | "none"; l: string }[] = [
  { v: "full", l: "Full day" }, { v: "half", l: "Half day" }, { v: "leave", l: "Leave" }, { v: "absent", l: "Absent" }, { v: "none", l: "—" },
];
const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

export function useLabour() {
  return useQuery({ queryKey: ["att-labour"], queryFn: () => listLabour() });
}

/* --------------------------- Mark attendance popup --------------------------- */

type Row = { status: DayStatus | "none"; inTime: string; outTime: string; otHours: string; source?: string };

export function AttendanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(localDate());
  const { data: lab } = useLabour();
  const labour = (lab?.labour ?? []).filter((l) => l.isActive);
  const { data: day } = useQuery({ queryKey: ["att-day", date], queryFn: () => getDayAttendance({ data: { date } }), enabled: open });
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const m: Record<string, Row> = {};
    for (const r of day?.rows ?? []) m[r.labourId] = { status: r.status, inTime: r.inTime, outTime: r.outTime, otHours: r.otHours ? String(r.otHours) : "", source: r.source };
    setRows(m);
  }, [day]);

  const get = (id: string): Row => rows[id] ?? { status: "none", inTime: "", outTime: "", otHours: "" };
  const set = (id: string, p: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...get(id), ...p } }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveDayAttendance({ data: { date, rows: labour.map((l) => { const r = get(l.id); return { labourId: l.id, status: r.status, inTime: r.inTime || undefined, outTime: r.outTime || undefined, otHours: Number(r.otHours) || 0 }; }) } });
      toast.success(`Attendance saved (${res.saved})`);
      qc.invalidateQueries({ queryKey: ["att-day"] }); qc.invalidateQueries({ queryKey: ["att-salary"] });
      onOpenChange(false);
    } catch (e) { toast.error(errMsg(e, "Could not save")); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-3xl flex-col">
        <DialogHeader><DialogTitle>Mark attendance</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className={`${posInput} w-44`} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <Button size="sm" variant="outline" onClick={() => setRows(Object.fromEntries(labour.map((l) => [l.id, { ...get(l.id), status: "full" as DayStatus }])))}>All present</Button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {!labour.length ? <p className="py-6 text-center text-sm text-muted-foreground">No labour added yet. Add labour from Attendance page or POS Settings → Attendance.</p> : null}
          {labour.map((l) => {
            const r = get(l.id);
            return (
              <div key={l.id} className="space-y-2 rounded-lg border border-border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{l.name}{r.source === "device" ? <span className="ml-2 text-[11px] font-normal text-muted-foreground">(machine)</span> : null}</span>
                  <div className="flex flex-wrap gap-1">
                    {STATUS.map((s) => (
                      <button key={s.v} type="button" onClick={() => set(l.id, { status: s.v })}
                        className={`rounded-md border px-2.5 py-1 text-xs ${r.status === s.v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"}`}>{s.l}</button>
                    ))}
                  </div>
                </div>
                {r.status === "full" || r.status === "half" ? (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[11px] text-muted-foreground">In<input type="time" className={posInput} value={r.inTime} onChange={(e) => set(l.id, { inTime: e.target.value })} /></label>
                    <label className="text-[11px] text-muted-foreground">Out<input type="time" className={posInput} value={r.outTime} onChange={(e) => set(l.id, { outTime: e.target.value })} /></label>
                    <label className="text-[11px] text-muted-foreground">Overtime hrs<input className={posInput} inputMode="decimal" value={r.otHours} onChange={(e) => set(l.id, { otHours: e.target.value })} /></label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button><Button disabled={saving || !labour.length} onClick={save}>{saving ? "Saving…" : "Save attendance"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Labour manager ------------------------------- */

const blank: Omit<Labour, "id"> & { id?: string } = { name: "", phone: "", bioId: "", salaryType: "daily", rate: 0, workDays: 6, fullHours: 8, halfHours: 4, paidLeaves: 0, otRate: 0, postExpense: true, isActive: true };
const TYPE_LABEL = { daily: "Daily wage", weekly: "Weekly salary", monthly: "Monthly salary" } as const;

export function LabourManager() {
  const qc = useQueryClient();
  const { can } = usePosAccess();
  const { data } = useLabour();
  const [edit, setEdit] = useState<typeof blank | null>(null);
  const allowed = can("manage_expenses");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Labour / staff</h3>
        {allowed ? <Button size="sm" onClick={() => setEdit({ ...blank })}><UserPlus /> Add labour</Button> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th>Name</th><th>Machine ID</th><th>Salary</th><th className="text-right">Rate</th><th>Expense</th><th /></tr></thead>
          <tbody>
            {(data?.labour ?? []).map((l) => (
              <tr key={l.id} className={`border-t border-border ${l.isActive ? "" : "opacity-50"}`}>
                <td className="py-1.5">{l.name}{l.isActive ? "" : " (inactive)"}</td><td>{l.bioId || "—"}</td><td>{TYPE_LABEL[l.salaryType]}</td>
                <td className="text-right">Rs {l.rate.toLocaleString()}</td><td>{l.postExpense ? "On" : "Off"}</td>
                <td className="text-right">{allowed ? <Button size="sm" variant="ghost" onClick={() => setEdit({ ...l })} aria-label="Edit"><Pencil /></Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.labour.length ? <p className="py-3 text-center text-xs text-muted-foreground">No labour added yet.</p> : null}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[92vh] w-[94vw] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit labour" : "Add labour"}</DialogTitle></DialogHeader>
          {edit ? <LabourForm v={edit} onChange={setEdit} onDone={() => { setEdit(null); qc.invalidateQueries({ queryKey: ["att-labour"] }); qc.invalidateQueries({ queryKey: ["att-salary"] }); }} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LabourForm({ v, onChange, onDone }: { v: typeof blank; onChange: (v: typeof blank) => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const num = (k: keyof typeof blank) => ({ inputMode: "decimal" as const, className: posInput, value: String(v[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, [k]: Number(e.target.value) || 0 }) });
  const rateLabel = v.salaryType === "daily" ? "Daily wage (Rs)" : v.salaryType === "weekly" ? "Weekly salary (Rs)" : "Monthly salary (Rs)";
  const submit = async () => {
    if (!v.name.trim()) return toast.error("Enter a name");
    setSaving(true);
    try { await saveLabour({ data: { ...v, paidLeaves: Math.round(v.paidLeaves) } }); toast.success("Labour saved"); onDone(); }
    catch (e) { toast.error(errMsg(e, "Could not save")); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Name<input className={posInput} value={v.name} onChange={(e) => onChange({ ...v, name: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Phone<input className={posInput} value={v.phone} onChange={(e) => onChange({ ...v, phone: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Machine user ID / card no.<input className={posInput} value={v.bioId} onChange={(e) => onChange({ ...v, bioId: e.target.value })} placeholder="Same ID as on the biometric machine" /></label>
        <label className="text-xs text-muted-foreground">Salary type
          <select className={posInput} value={v.salaryType} onChange={(e) => onChange({ ...v, salaryType: e.target.value as Labour["salaryType"] })}>
            <option value="daily">Daily wage</option><option value="weekly">Weekly salary</option><option value="monthly">Monthly salary</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">{rateLabel}<input {...num("rate")} /></label>
        <label className="text-xs text-muted-foreground">Working days per week<input {...num("workDays")} /></label>
        <label className="text-xs text-muted-foreground">Full day hours<input {...num("fullHours")} /></label>
        <label className="text-xs text-muted-foreground">Half day hours<input {...num("halfHours")} /></label>
        <label className="text-xs text-muted-foreground">Paid leaves per month<input {...num("paidLeaves")} /></label>
        <label className="text-xs text-muted-foreground">Overtime rate per hour (Rs)<input {...num("otRate")} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.postExpense} onChange={(e) => onChange({ ...v, postExpense: e.target.checked })} /> Post salary payments to Expenses</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isActive} onChange={(e) => onChange({ ...v, isActive: e.target.checked })} /> Active</label>
      <p className="text-[11px] text-muted-foreground">Half day = half of the daily rate. Weekly/monthly salary is converted to a per-day rate using working days.</p>
      <div className="flex justify-end"><Button disabled={saving} onClick={submit}>{saving ? "Saving…" : "Save"}</Button></div>
    </div>
  );
}

/* ------------------------------- Machines + import ------------------------------- */

export function DevicesManager({ disabled }: { disabled: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["att-devices"], queryFn: () => listDevices() });
  const [f, setF] = useState({ name: "", kind: "wifi" as "wifi" | "usb", serial: "" });
  const origin = typeof window !== "undefined" ? window.location.host : "";
  const add = async () => {
    if (!f.name.trim()) return toast.error("Enter machine name");
    if (f.kind === "wifi" && !f.serial.trim()) return toast.error("Enter the machine serial number (SN)");
    try { await saveDevice({ data: f }); setF({ name: "", kind: "wifi", serial: "" }); qc.invalidateQueries({ queryKey: ["att-devices"] }); toast.success("Machine added"); }
    catch (e) { toast.error(errMsg(e, "Could not add")); }
  };
  const copy = (s: string) => { void navigator.clipboard.writeText(s); toast.success("Copied"); };
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-foreground">Biometric machines</h3>
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p><b className="text-foreground">Wi-Fi / LAN machine (ZKTeco & other ADMS / Cloud push machines):</b> in the machine menu open Comm → Cloud Server Setting, set Server address <b className="text-foreground">{origin || "your app address"}</b>, Port <b className="text-foreground">443</b> (HTTPS on) or 80, then add the machine here with its serial number (SN). Punches arrive live.</p>
        <p><b className="text-foreground">USB / offline machine:</b> export the attendance log from the machine (USB pen drive or its software) and upload the file below.</p>
        <p><b className="text-foreground">Other software / middleware:</b> POST JSON to <code>/api/public/attendance</code> with {"{"} token, punches: [{"{"} id, time {"}"}] {"}"} using the machine token.</p>
      </div>
      {!disabled ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <input className={posInput} placeholder="Machine name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className={posInput} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "wifi" | "usb" })}><option value="wifi">Wi-Fi / LAN</option><option value="usb">USB / file</option></select>
          <input className={posInput} placeholder="Serial number (SN)" value={f.serial} onChange={(e) => setF({ ...f, serial: e.target.value })} />
          <Button className="h-10" onClick={add}><Plus /> Add machine</Button>
        </div>
      ) : null}
      <div className="space-y-2">
        {(data?.devices ?? []).map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
            <b className="text-foreground">{d.name}</b>
            <span className="text-xs text-muted-foreground">{d.kind === "wifi" ? "Wi-Fi / LAN" : "USB / file"}{d.serial ? ` · SN ${d.serial}` : ""}</span>
            <span className="text-xs text-muted-foreground">{d.lastSeen ? `Last seen ${new Date(d.lastSeen).toLocaleString()}` : "Not connected yet"}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => copy(d.token)}><Copy /> Token</Button>
            {!disabled ? <Button size="sm" variant="ghost" aria-label="Remove" onClick={async () => { if (!confirm("Remove this machine?")) return; await deleteDevice({ data: { id: d.id } }); qc.invalidateQueries({ queryKey: ["att-devices"] }); }}><Trash2 /></Button> : null}
          </div>
        ))}
      </div>
      <FileImport devices={data?.devices ?? []} />
    </div>
  );
}

type P = { bioId: string; day: string; tm: string };
const DT = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?|(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i;
const pad = (n: string | number) => String(n).padStart(2, "0");

/** Any machine export: each row needs a user ID + a date-time. Auto-detected. */
export function parsePunchRows(rows: string[][], idCol: number | null): P[] {
  const out: P[] = [];
  for (const cells of rows) {
    const joined = cells.join(" ");
    const m = joined.match(DT);
    if (!m) continue;
    let y: string, mo: string, d: string, h: number, mi: string, s: string;
    if (m[1]) { y = m[1]; mo = m[2]; d = m[3]; h = Number(m[4]); mi = m[5]; s = m[6] ?? "00"; }
    else { d = m[7]; mo = m[8]; y = m[9]; h = Number(m[10]); mi = m[11]; s = m[12] ?? "00"; const ap = m[13]?.toUpperCase(); if (ap === "PM" && h < 12) h += 12; if (ap === "AM" && h === 12) h = 0; }
    let id = idCol != null ? String(cells[idCol] ?? "").trim() : "";
    if (!id) id = cells.map((c) => String(c).trim()).find((c) => /^\d{1,12}$/.test(c)) ?? "";
    if (!id) continue;
    out.push({ bioId: id, day: `${y}-${pad(mo)}-${pad(d)}`, tm: `${pad(h)}:${mi}:${pad(s)}` });
  }
  return out;
}

function FileImport({ devices }: { devices: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<string[][]>([]);
  const [idCol, setIdCol] = useState<number | null>(null);
  const [dev, setDev] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const punches = useMemo(() => parsePunchRows(rows, idCol), [rows, idCol]);
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0);

  const onFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    let r: string[][];
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const wb = XLSX.read(buf, { cellDates: false });
      r = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" }).map((x) => x.map(String));
    } else {
      r = new TextDecoder().decode(buf).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(/\t|,|;/).map((c) => c.trim().replace(/^"|"$/g, "")));
    }
    setRows(r); setIdCol(null);
  };

  const run = async () => {
    setBusy(true);
    try {
      const res = await importPunches({ data: { deviceId: dev || null, punches } });
      toast.success(`${res.inserted} new punches imported (${res.total - res.inserted} already existed)`);
      setRows([]); qc.invalidateQueries({ queryKey: ["att-day"] }); qc.invalidateQueries({ queryKey: ["att-salary"] });
    } catch (e) { toast.error(errMsg(e, "Import failed")); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm font-semibold text-foreground">Upload attendance file (USB export)</p>
      <p className="text-[11px] text-muted-foreground">Supported: .dat / .txt (ZKTeco attlog), .csv, .xlsx / .xls. Each row needs the machine user ID and the date-time.</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
        <Upload className="size-4" /> Choose file
        <input type="file" className="hidden" accept=".dat,.txt,.csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      </label>
      {rows.length ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>User ID column:</span>
            <select className={`${posInput} w-36`} value={idCol ?? ""} onChange={(e) => setIdCol(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">Auto detect</option>
              {Array.from({ length: cols }, (_, i) => <option key={i} value={i}>Column {i + 1} ({String(rows[0]?.[i] ?? "").slice(0, 12)})</option>)}
            </select>
            {devices.length ? <select className={`${posInput} w-40`} value={dev} onChange={(e) => setDev(e.target.value)}><option value="">No machine</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select> : null}
          </div>
          <p className="text-xs text-muted-foreground">{punches.length} punches found in {rows.length} rows. Preview: {punches.slice(0, 3).map((p) => `ID ${p.bioId} · ${p.day} ${p.tm}`).join(" | ")}</p>
          <Button size="sm" disabled={busy || !punches.length} onClick={run}>{busy ? "Importing…" : `Import ${punches.length} punches`}</Button>
        </div>
      ) : null}
    </div>
  );
}
