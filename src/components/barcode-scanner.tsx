import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector;
  }
}

const FORMATS = [
  "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39",
  "code_93", "codabar", "itf", "qr_code", "data_matrix",
];

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCode: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    let zxingControls: { stop: () => void } | null = null;

    const startZxing = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" }, audio: false },
          video,
          (result) => {
            if (result && !stopped) {
              stopped = true;
              zxingControls?.stop();
              onCode(result.getText().trim());
            }
          },
        );
        if (stopped) { zxingControls.stop(); return; }
        setActive(true);
      } catch {
        setError("Camera permission was not given. Allow camera access (Settings → Safari → Camera) and try again.");
      }
    };

    const start = async () => {
      setError(null);
      if (!window.BarcodeDetector) {
        await startZxing();
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        setError("Camera permission was not given. Allow camera access and try again.");
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setActive(true);

      const detector = new window.BarcodeDetector({ formats: FORMATS });
      const tick = async () => {
        if (stopped || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length && codes[0].rawValue) {
            onCode(codes[0].rawValue.trim());
            return; // parent closes the dialog
          }
        } catch {
          // keep trying
        }
        raf = window.setTimeout(() => void tick(), 250) as unknown as number;
      };
      void tick();
    };

    void start();
    return () => {
      stopped = true;
      setActive(false);
      if (raf) clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
      zxingControls?.stop();
    };
  }, [open, onCode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4" /> Scan barcode with camera
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CameraOff className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-lg border border-border bg-black">
              <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80 shadow-[0_0_12px_2px_hsl(var(--primary))]" />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {active ? "Point the camera at the barcode — it will be added automatically." : "Starting camera…"}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
