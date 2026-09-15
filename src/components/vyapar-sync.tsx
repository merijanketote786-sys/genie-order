import { Button } from "@/components/ui/button";
import { getSyncStatus, syncProductsFromSheet } from "@/lib/products.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function SyncStatusPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => getSyncStatus(),
    refetchInterval: 60_000,
  });

  const last = data?.last ?? null;

  return (
    <div className="glass-panel mb-3 rounded-2xl px-4 py-3 text-xs">
      <p className="font-display text-[11px] font-bold uppercase text-primary">Sync status</p>
      {isLoading ? (
        <p className="mt-2 text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-2 space-y-1 text-muted-foreground">
          <p>
            Products in database: <span className="text-foreground">{data?.productCount ?? 0}</span>
          </p>
          <p>
            Last sync:{" "}
            <span className="text-foreground">
              {last ? new Date(last.synced_at).toLocaleString("en-PK") : "—"}
            </span>
          </p>
          {last ? (
            <>
              <p>
                Updated <span className="text-foreground">{last.updated_count}</span> · Inserted{" "}
                <span className="text-foreground">{last.inserted_count}</span> · Skipped{" "}
                <span className="text-foreground">{last.skipped_count}</span>
              </p>
              <p>
                Status: <span className="text-foreground">{last.status}</span> · Errors:{" "}
                <span className={last.error_count ? "text-destructive" : "text-foreground"}>
                  {last.error_count}
                </span>
              </p>
            </>
          ) : (
            <p>Abhi tak koi sync nahi hua.</p>
          )}
        </div>
      )}
    </div>
  );
}

type UploadResult = {
  ok: boolean;
  message: string;
  total_rows?: number;
  updated_count?: number;
  inserted_count?: number;
  skipped_count?: number;
  error_count?: number;
  errors?: string[];
};

export function VyaparUploadCard() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const upload = useMutation({
    mutationFn: async (f: File) => {
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) {
        bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      }
      return syncProductsFromSheet({ data: { fileName: f.name, fileBase64: btoa(bin) } });
    },
    onSuccess: (res) => {
      setResult(res as UploadResult);
      if (res.ok) {
        toast.success("Rates update ho gaye");
        void qc.invalidateQueries({ queryKey: ["products"] });
        void qc.invalidateQueries({ queryKey: ["sync-status"] });
        setFile(null);
      } else {
        toast.error(res.message);
      }
    },
    onError: () => {
      setResult({ ok: false, message: "Upload nahi ho saka. Dobara koshish karein." });
      toast.error("Upload nahi ho saka");
    },
  });

  return (
    <section className="glass-panel mb-3 rounded-2xl px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Upload className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold leading-tight">Vyapar rates update</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Vyapar se items ki Excel export karein aur yahan upload karein — rates foran update ho
            jayenge.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2/60 px-3 text-sm text-muted-foreground hover:border-primary/60">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{file ? file.name : "Excel / CSV file choose karein"}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setResult(null);
              if (f && f.size > 10 * 1024 * 1024) {
                toast.error("File 10MB se bari hai");
                setFile(null);
                return;
              }
              setFile(f);
            }}
          />
        </label>
        <Button
          disabled={!file || upload.isPending}
          onClick={() => file && upload.mutate(file)}
          className="gap-2 sm:min-w-44"
        >
          {upload.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {upload.isPending ? "Update ho raha hai..." : "Rates update karein"}
        </Button>
      </div>

      {result ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-2.5 text-xs ${
            result.ok ? "border-border bg-surface-2/60" : "border-destructive/40 bg-destructive/10"
          }`}
        >
          <p className="font-semibold">{result.message}</p>
          {result.ok ? (
            <p className="mt-1 text-muted-foreground">
              {result.total_rows} rows • {result.inserted_count} naye • {result.updated_count}{" "}
              update
              {result.error_count ? ` • ${result.error_count} rows me masla` : ""}
            </p>
          ) : null}
          {result.errors?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
