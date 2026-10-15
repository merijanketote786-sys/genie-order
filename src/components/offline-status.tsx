import { useState } from "react";
import { CloudOff, Cloud, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { flushOutbox, removeOutboxItem, setDevicePrefix, useOutboxStatus } from "@/lib/offline-sync";

export function OfflineStatus() {
  const s = useOutboxStatus();
  const [prefix, setPrefix] = useState("");
  const waiting = s.items.length;
  const failed = s.items.filter((i) => i.error).length;
  const tone = !s.online ? "border-destructive/50 text-destructive" : failed ? "border-destructive/50 text-destructive" : waiting ? "border-primary/50 text-primary" : "border-border text-muted-foreground";
  const label = !s.online ? `Offline${waiting ? ` · ${waiting}` : ""}` : s.syncing ? "Syncing…" : waiting ? `${waiting} waiting` : "Synced";

  const syncNow = async () => {
    const r = await flushOutbox();
    if (r.sent) toast.success(`${r.sent} offline entr${r.sent === 1 ? "y" : "ies"} synced`);
    if (r.failed) toast.error(`${r.failed} entr${r.failed === 1 ? "y" : "ies"} could not sync — see details`);
  };

  return (
    <Popover onOpenChange={(o) => o && setPrefix(s.prefix)}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-10 shrink-0 gap-1.5 bg-card px-2.5 font-semibold ${tone}`} title="Offline & sync status" aria-label="Offline and sync status">
          {s.online ? (s.syncing ? <RefreshCw className="size-4 animate-spin" /> : <Cloud className="size-4" />) : <CloudOff className="size-4" />}
          <span className="hidden text-xs sm:inline">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-bold text-foreground">{s.online ? "Online" : "Offline mode"}</p>
          <p className="text-xs text-muted-foreground">
            {s.online ? "Bills made offline are sent automatically." : "New bills, purchases and returns are saved on this device and sync when internet returns."}
          </p>
        </div>
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {waiting === 0 ? <p className="text-xs text-muted-foreground">Nothing waiting to sync.</p> : s.items.map((i) => (
            <div key={i.id} className="rounded-md border border-border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{i.label} · {i.number}</span>
                {i.error && (
                  <button type="button" className="text-destructive" aria-label="Discard entry" title="Discard entry"
                    onClick={() => { if (window.confirm(`Discard ${i.number}? It will not be saved.`)) void removeOutboxItem(i.id); }}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="text-muted-foreground">{new Date(i.createdAt).toLocaleString()}</p>
              {i.error && <p className="text-destructive">{i.error}</p>}
            </div>
          ))}
        </div>
        <Button size="sm" className="w-full" disabled={!s.online || s.syncing || !waiting} onClick={() => void syncNow()}>
          <RefreshCw className="mr-1.5 size-4" /> Sync now
        </Button>
        <div className="space-y-1 border-t border-border pt-3">
          <label htmlFor="device-prefix" className="text-xs font-semibold text-foreground">This device's offline bill prefix</label>
          <div className="flex gap-2">
            <input id="device-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={6}
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm uppercase" />
            <Button size="sm" variant="outline" onClick={() => { const v = setDevicePrefix(prefix); if (v) toast.success(`Prefix set: ${v}`); }}>Save</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Offline bills are numbered {s.prefix || "A"}-0001, {s.prefix || "A"}-0002… Give every device a different prefix.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
