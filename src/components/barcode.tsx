/** Barcode SVG — jsbarcode is dynamically loaded only in the browser (CODE128, EAN, UPC, ITF14…). */
import { useEffect, useRef, useState } from "react";

export function Barcode({
  value,
  format = "CODE128",
  height = 34,
  moduleWidth = 1.4,
  displayValue = false,
  fontSize = 10,
  className,
}: {
  value: string;
  format?: string;
  height?: number;
  moduleWidth?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const node = ref.current;
    if (!node) return;
    const text = value.trim();
    if (!text) {
      node.innerHTML = "";
      setError("");
      return;
    }
    void (async () => {
      try {
        const mod = await import("jsbarcode");
        const JsBarcode = (mod as unknown as { default: unknown }).default ?? mod;
        if (cancelled || !ref.current) return;
        let failed = false;
        (JsBarcode as (el: unknown, v: string, o: Record<string, unknown>) => void)(ref.current, text, {
          format,
          displayValue,
          fontSize,
          textMargin: 0,
          margin: 0,
          height,
          width: moduleWidth,
          background: "#ffffff",
          lineColor: "#000000",
          valid: (ok: boolean) => {
            failed = !ok;
          },
        } as Record<string, unknown>);
        if (cancelled) return;
        if (failed) {
          if (ref.current) ref.current.innerHTML = "";
          setError(`Invalid code for ${format}`);
        } else {
          setError("");
          ref.current?.setAttribute("preserveAspectRatio", "none");
          ref.current?.setAttribute("width", "100%");
          ref.current?.setAttribute("height", "100%");
        }
      } catch {
        if (ref.current) ref.current.innerHTML = "";
        setError("Barcode failed to render");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, format, height, moduleWidth, displayValue, fontSize]);

  if (error) {
    return (
      <span className="flex h-full w-full items-center justify-center text-[5pt] leading-none text-black">
        {error}
      </span>
    );
  }
  return <svg ref={ref} className={className} style={{ width: "100%", height: "100%" }} />;
}
