import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseWeightBarcode, weightBarcodeError } from "@/lib/weight-barcode";
import { resolveCfg, type PosConfig } from "@/lib/pos-config";
import { ScanBarcode } from "lucide-react";

export function WeightBarcodeEditor({ draft }: { draft: PosConfig; upd: (path: string, value: unknown) => void; disabled: boolean }) {
  const c = resolveCfg(draft).pos.weightBarcode;
  const [sample, setSample] = useState("");
  const [result, setResult] = useState("");
  const error = weightBarcodeError(c);
  return <section className="space-y-3 border-t border-border pt-4">
    <h3 className="text-sm font-semibold">Scale barcode check</h3>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex gap-2">
      <Input aria-label="Test scale barcode" inputMode="numeric" value={sample} onChange={(e) => { setSample(e.target.value); setResult(""); }} />
      <Button variant="outline" disabled={!sample.trim() || !!error} onClick={() => {
        try { const hit = parseWeightBarcode(sample, c); setResult(hit ? `Product code: ${hit.productCode} · Weight: ${hit.weight} ${hit.unit}` : "No enabled scale profile matches this barcode"); }
        catch (e) { setResult(e instanceof Error ? e.message : "Invalid barcode"); }
      }}><ScanBarcode /> Check</Button>
    </div>
    {result ? <p role="status" className="break-words text-sm text-foreground">{result}</p> : null}
  </section>;
}