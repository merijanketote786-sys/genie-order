/** Code 128 barcode SVG — jsbarcode sirf browser me dynamically load hota hai. */
import { useEffect, useRef } from "react";

export function Barcode({
  value,
  height = 34,
  className,
}: {
  value: string;
  height?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const node = ref.current;
    if (!node) return;
    const text = value.trim();
    if (!text) {
      node.innerHTML = "";
      return;
    }
    void (async () => {
      try {
        const mod = await import("jsbarcode");
        const JsBarcode = (mod as unknown as { default: unknown }).default ?? mod;
        if (cancelled || !ref.current) return;
        (JsBarcode as (el: unknown, v: string, o: Record<string, unknown>) => void)(ref.current, text, {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          height,
          width: 1.4,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch {
        if (ref.current) ref.current.innerHTML = "";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, height]);

  return <svg ref={ref} className={className} />;
}
