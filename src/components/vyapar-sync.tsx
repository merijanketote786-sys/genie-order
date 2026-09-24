import { Button } from "@/components/ui/button";
import {
  applyProductRows,
  getSyncStatus,
  previewProductsFromDocument,
  syncProductsFromSheet,
  syncProductsFromText,
} from "@/lib/products.functions";
import { getAutoSyncSetup, getMyAccess, getSyncConnectInfo } from "@/lib/admin.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileScan,
  FileSpreadsheet,
  Loader2,
  Plug,
  Upload,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const SHEET_EXT = ["xlsx", "xls", "csv"];
const DOC_TYPES = ["application/pdf"];

function extOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

function isSheetFile(f: File) {
  return SHEET_EXT.includes(extOf(f.name));
}

function isDocFile(f: File) {
  return DOC_TYPES.includes(f.type) || f.type.startsWith("image/") || extOf(f.name) === "pdf";
}

async function toBase64(f: File) {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  return btoa(bin);
}

function toDataUrl(f: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(f);
  });
}

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
            <p>No sync has happened yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

type SyncResult = {
  ok: boolean;
  message: string;
  total_rows?: number;
  updated_count?: number;
  inserted_count?: number;
  skipped_count?: number;
  error_count?: number;
  errors?: string[];
};

function SyncResultReport({ result }: { result: SyncResult }) {
  return (
    <div
      className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${
        result.ok ? "border-border bg-surface-2/60" : "border-destructive/40 bg-destructive/10"
      }`}
      role={result.ok ? undefined : "alert"}
    >
      <p className={`font-semibold ${result.ok ? "" : "text-destructive"}`}>
        {result.ok ? result.message : `Nothing was added — ${result.message}`}
      </p>
      {result.ok ? (
        <p className="mt-1 text-muted-foreground">
          {result.total_rows} rows • {result.inserted_count} new • {result.updated_count} updated
          {result.skipped_count ? ` • ${result.skipped_count} skipped` : ""}
          {result.error_count ? ` • ${result.error_count} rows had an issue` : ""}
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
  );
}

function useSyncInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["sync-status"] });
  };
}

export function VyaparUploadCard() {
  const invalidate = useSyncInvalidate();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const accept = (f: File | null | undefined) => {
    setResult(null);
    if (!f) return;
    if (!isSheetFile(f)) {
      setResult({
        ok: false,
        message: `".${extOf(f.name)}" files are not supported.`,
        errors: [
          "Only Excel (.xlsx, .xls) or CSV works here.",
          "For PDF or image, use the 'PDF / image to rate list' card below.",
        ],
      });
      setFile(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setResult({ ok: false, message: "File is larger than 10MB." });
      setFile(null);
      return;
    }
    setFile(f);
  };

  const upload = useMutation({
    mutationFn: async (f: File) =>
      syncProductsFromSheet({ data: { fileName: f.name, fileBase64: await toBase64(f) } }),
    onSuccess: (res) => {
      setResult(res as SyncResult);
      if (res.ok) {
        toast.success("Rates updated");
        invalidate();
        setFile(null);
      } else {
        toast.error(res.message);
      }
    },
    onError: () => {
      setResult({ ok: false, message: "Upload failed. Please try again." });
      toast.error("Upload failed");
    },
  });

  return (
    <section
      className="glass-panel mb-3 rounded-2xl px-3 py-3 sm:px-4 sm:py-4"
      onPaste={(e) => {
        const f = e.clipboardData?.files?.[0];
        if (f) {
          e.preventDefault();
          accept(f);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Upload className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold leading-tight">Excel / CSV upload</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Drag a file here, paste with Ctrl+V, or choose one — rates will update
            instantly.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-14 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 text-sm transition-colors ${
            dragging
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-surface-2/60 text-muted-foreground hover:border-primary/60"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">
            {file ? file.name : "Drop or choose an Excel / CSV file"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => accept(e.target.files?.[0])}
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
          {upload.isPending ? "Updating..." : "Update rates"}
        </Button>
      </div>

      {result ? <SyncResultReport result={result} /> : null}
    </section>
  );
}

export function PasteRatesCard() {
  const invalidate = useSyncInvalidate();
  const [text, setText] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);

  const run = useMutation({
    mutationFn: () => syncProductsFromText({ data: { text } }),
    onSuccess: (res) => {
      setResult(res as SyncResult);
      if (res.ok) {
        toast.success("Rates updated");
        invalidate();
        setText("");
      } else {
        toast.error(res.message);
      }
    },
    onError: () => {
      setResult({ ok: false, message: "Data could not be processed. Please try again." });
      toast.error("Data could not be processed");
    },
  });

  return (
    <section className="glass-panel mb-3 rounded-2xl px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <ClipboardPaste className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold leading-tight">
            Paste rate list
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Copy rows from any software (Vyapar, Excel, Google Sheets) and paste them here.
            The first line should be column names: Item Name, Sale Price, Unit, Stock.
          </p>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        spellCheck={false}
        aria-label="Paste rate list"
        placeholder={"Item Name\tSale Price\tUnit\tStock\nGlycerine Soap Base\t1450\tkg\t20"}
        className="mt-3 min-h-32 w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="mt-2 flex justify-end">
        <Button
          disabled={text.trim().length < 10 || run.isPending}
          onClick={() => run.mutate()}
          className="gap-2 sm:min-w-44"
        >
          {run.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ClipboardPaste className="h-4 w-4" />
          )}
          {run.isPending ? "Checking..." : "Check and update"}
        </Button>
      </div>

      {result ? <SyncResultReport result={result} /> : null}
    </section>
  );
}

type PreviewRow = { name: string; unit: string; sale_price: number; stock: number };

export function DocumentImportCard() {
  const invalidate = useSyncInvalidate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  const accept = (f: File | null | undefined) => {
    setResult(null);
    setRows(null);
    if (!f) return;
    if (!isDocFile(f)) {
      setResult({
        ok: false,
        message: `".${extOf(f.name)}" files are not supported.`,
        errors: ["Only PDF or image (JPG/PNG) works here."],
      });
      setFile(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setResult({ ok: false, message: "File is larger than 10MB." });
      setFile(null);
      return;
    }
    setFile(f);
  };

  const preview = useMutation({
    mutationFn: async (f: File) =>
      previewProductsFromDocument({
        data: { fileName: f.name, fileType: f.type || "application/pdf", dataUrl: await toDataUrl(f) },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        setResult({ ok: false, message: res.message });
        toast.error(res.message);
        return;
      }
      setRows(res.rows as PreviewRow[]);
      toast.success(`${res.rows.length} items found — review and confirm`);
    },
    onError: () => {
      setResult({ ok: false, message: "File could not be read. Please try again." });
      toast.error("File could not be read");
    },
  });

  const apply = useMutation({
    mutationFn: () => applyProductRows({ data: { rows: rows ?? [] } }),
    onSuccess: (res) => {
      setResult(res as SyncResult);
      if (res.ok) {
        toast.success("Rates updated");
        invalidate();
        setRows(null);
        setFile(null);
      } else {
        toast.error(res.message);
      }
    },
    onError: () => {
      setResult({ ok: false, message: "Save failed. Please try again." });
      toast.error("Save failed");
    },
  });

  return (
    <section
      className="glass-panel mb-3 rounded-2xl px-3 py-3 sm:px-4 sm:py-4"
      onPaste={(e) => {
        const f = e.clipboardData?.files?.[0];
        if (f) {
          e.preventDefault();
          accept(f);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <FileScan className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold leading-tight">
            PDF / image to rate list
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Upload a PDF or screenshot — the app will read and show the rate list, and it will
            only save once you confirm.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-14 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 text-sm transition-colors ${
            dragging
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-surface-2/60 text-muted-foreground hover:border-primary/60"
          }`}
        >
          <FileScan className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{file ? file.name : "Drop or choose a PDF or image"}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            className="sr-only"
            onChange={(e) => accept(e.target.files?.[0])}
          />
        </label>
        <Button
          disabled={!file || preview.isPending}
          onClick={() => file && preview.mutate(file)}
          variant="outline"
          className="gap-2 sm:min-w-44"
        >
          {preview.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileScan className="h-4 w-4" />
          )}
          {preview.isPending ? "Reading..." : "Extract rate list"}
        </Button>
      </div>

      {rows?.length ? (
        <div className="mt-3 rounded-xl border border-border bg-surface-2/40 p-2">
          <p className="px-1 pb-2 text-xs font-semibold">
            {rows.length} items found — will only save once confirmed
          </p>
          <div className="max-h-64 overflow-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Item</th>
                  <th className="px-2 py-1.5 font-semibold">Unit</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-t border-border">
                    <td className="px-2 py-1.5">{r.name}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.unit}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.sale_price.toLocaleString("en-PK")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r.stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRows(null)}>
              Cancel
            </Button>
            <Button size="sm" className="gap-2" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Confirm and update
            </Button>
          </div>
        </div>
      ) : null}

      {result ? <SyncResultReport result={result} /> : null}
    </section>
  );
}

export function ConnectApiCard() {
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: () => getMyAccess() });
  const [show, setShow] = useState(false);
  const info = useQuery({
    queryKey: ["sync-connect-info"],
    queryFn: () => getSyncConnectInfo(),
    enabled: Boolean(access?.isAdmin),
    staleTime: 10 * 60 * 1000,
  });

  if (!access?.isAdmin) return null;

  const endpoint = info.data?.ok ? info.data.endpoint : "";
  const apiKey = info.data?.ok ? info.data.apiKey : "";

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const downloadTemplate = () => {
    const csv =
      "Item Name,Sale Price,Unit,Stock\nGlycerine Soap Base,1450,kg,20\nCocobetain,950,litre,10\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "OrderBot-Rate-Template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="glass-panel mb-3 rounded-2xl px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Plug className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold leading-tight">
            Connect from any software
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Any software or script can send rates directly. This information is only visible
            to you (admin).
          </p>
        </div>
      </div>

      {info.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : info.data?.ok ? (
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 py-2">
            <span className="shrink-0 font-semibold">Address</span>
            <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{endpoint}</span>
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => copy(endpoint, "Address")}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 py-2">
            <span className="shrink-0 font-semibold">Key</span>
            <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
              {show ? apiKey : "••••••••••••••••••••"}
            </span>
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setShow((v) => !v)}>
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {show ? "Hide" : "Show"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => copy(apiKey, "Key")}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-border bg-card p-3 font-mono text-[11px] leading-5 text-muted-foreground">
{`POST ${endpoint}
x-api-key: <key>
Content-Type: application/json

{ "products": [
  { "name": "Glycerine Soap Base", "unit": "kg", "sale_price": 1450, "stock": 20 }
] }`}
          </pre>
          <p className="text-[11px] text-muted-foreground">
            Unit can only be: kg, litre, grammes, pcs, piece, bottles, bundles. If the rate is 0
            or blank, that row is not added.
          </p>
          <Button size="sm" variant="outline" className="gap-2" onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5" /> Rate list template (CSV)
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-destructive">
          {info.data?.message ?? "Could not load information."}
        </p>
      )}
    </section>
  );
}

export function AutoSyncCard() {
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: () => getMyAccess() });
  const [folder, setFolder] = useState("C:\\VyaparExport");

  const download = useMutation({
    mutationFn: () => getAutoSyncSetup({ data: { folder } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const blob = new Blob([res.content], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Setup file downloaded");
    },
    onError: () => toast.error("Could not create file"),
  });

  if (!access?.isAdmin) return null;

  return (
    <section className="glass-panel mb-3 rounded-2xl px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold leading-tight">
            Auto sync (single click)
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Run this file once on your computer. After that, just export from Vyapar into
            this folder — rates will update here automatically.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          spellCheck={false}
          aria-label="Export folder"
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface-2/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          onClick={() => download.mutate()}
          disabled={download.isPending}
          className="gap-2 sm:min-w-44"
        >
          {download.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Setup file download
        </Button>
      </div>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Download the file and double-click it on your computer (only once).</li>
        <li>
          Vyapar → Reports → Item / Stock Summary → Export to Excel, aur file{" "}
          in the <span className="text-foreground">{folder}</span> folder.
        </li>
        <li>That's it — rates update automatically within 10 seconds, every time.</li>
      </ol>
      <p className="mt-2 text-[11px] text-muted-foreground">
        This file contains your private sync key — do not send it to anyone. Excel must be
        installed on Windows.
      </p>
    </section>
  );
}
