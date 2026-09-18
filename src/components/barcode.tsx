/** Code 128 barcode SVG — sirf browser me render hota hai. */
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

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
    if (!ref.current) return;
    const text = value.trim();
    if (!text) {
      ref.current.innerHTML = "";
      return;
    }
    try {
      JsBarcode(ref.current, text, {
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
  }, [value, height]);

  return <svg ref={ref} className={className} />;
}
