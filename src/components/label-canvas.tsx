/**
 * LabelCanvas — actual label ka WYSIWYG preview.
 * Element pe click kar ke select karein, drag kar ke move karein,
 * corner handle se width aur font size resize karein — sab kuch preview ke upar hi.
 */
import { Barcode } from "@/components/barcode";
import { renderTemplate, type LabelConfig, type LabelValues, type PrinterProfile } from "@/lib/label-settings";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const PT_TO_MM = 0.352_777_8;

export type CanvasSelection = { kind: "field"; id: string } | { kind: "barcode" } | null;

type DragState = {
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
};

export function LabelCanvas({
  config,
  printer,
  values,
  scale,
  selection,
  onSelect,
  onPatchField,
  onPatchBarcode,
  onEditText,
}: {
  config: LabelConfig;
  printer: PrinterProfile;
  values: LabelValues;
  scale: number; // px per mm
  selection: CanvasSelection;
  onSelect: (s: CanvasSelection) => void;
  onPatchField: (id: string, patch: Record<string, number>) => void;
  onPatchBarcode: (patch: Record<string, number>) => void;
  /** Preview ke upar double-click kar ke text edit — template text wapas bhejta hai. */
  onEditText?: (id: string, template: string) => void;
}) {
  const drag = useRef<DragState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId) requestAnimationFrame(() => editRef.current?.select());
  }, [editingId]);

  const commitEdit = () => {
    if (editingId && onEditText) onEditText(editingId, editDraft);
    setEditingId(null);
  };

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const startDrag = (
    e: ReactPointerEvent,
    mode: DragState["mode"],
    origin: DragState["origin"],
    apply: (patch: Record<string, number>) => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, origin };

    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = (ev.clientX - d.startX) / scale;
      const dy = (ev.clientY - d.startY) / scale;
      if (d.mode === "move") {
        apply({
          x: Number(clamp(d.origin.x + dx, -5, printer.widthMm).toFixed(2)),
          y: Number(clamp(d.origin.y + dy, -5, printer.heightMm).toFixed(2)),
        });
      } else {
        apply({
          w: Number(clamp(d.origin.w + dx, 3, printer.widthMm + 10).toFixed(2)),
          h: Number(clamp(d.origin.h + dy, 2, printer.heightMm + 10).toFixed(2)),
        });
      }
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const b = config.barcode;

  return (
    <div
      className="relative select-none overflow-hidden bg-white text-black shadow-sm ring-1 ring-border"
      style={{ width: printer.widthMm * scale, height: printer.heightMm * scale, touchAction: "none" }}
      onPointerDown={() => onSelect(null)}
    >
      {config.fields
        .filter((f) => f.enabled)
        .map((f) => {
          // Print jaisa hi text — koi fallback nahi, warna canvas aur asli label alag lagte hain.
          const text = renderTemplate(f.template, values);
          const active = selection?.kind === "field" && selection.id === f.id;
          return (
            <div
              key={f.id}
              onPointerDown={(e) => {
                if (editingId === f.id) return;
                onSelect({ kind: "field", id: f.id });
                startDrag(e, "move", { x: f.xMm, y: f.yMm, w: f.widthMm, h: 0 }, (p) => {
                  const xMm = p["x"];
                  const yMm = p["y"];
                  if (xMm !== undefined && yMm !== undefined) onPatchField(f.id, { xMm, yMm });
                });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!onEditText) return;
                onSelect({ kind: "field", id: f.id });
                setEditDraft(f.template);
                setEditingId(f.id);
              }}
              title="Double-click karke seedha yahin text edit karein"
              className={`absolute cursor-move ${active ? "outline outline-1 outline-primary" : ""}`}
              style={{
                left: f.xMm * scale,
                top: f.yMm * scale,
                width: f.widthMm * scale,
                fontSize: f.fontPt * PT_TO_MM * scale,
                fontFamily: f.fontFamily,
                fontWeight: f.bold ? 700 : 400,
                fontStyle: f.italic ? "italic" : "normal",
                textTransform: f.uppercase ? "uppercase" : "none",
                textDecoration: f.underline ? "underline" : "none",
                textAlign: f.align,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {editingId === f.id ? (
                <input
                  ref={editRef}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  aria-label="Label text edit karein"
                  className="w-full bg-white/90 text-inherit outline outline-1 outline-primary"
                  style={{
                    font: "inherit",
                    textAlign: f.align,
                    textTransform: "none",
                    padding: 0,
                    margin: 0,
                    border: 0,
                  }}
                />
              ) : text ? (
                text
              ) : (
                <span className="text-muted-foreground/70 italic">{f.label} (khali)</span>
              )}
              {active && editingId !== f.id ? (
                <span
                  onPointerDown={(e) =>
                    startDrag(e, "resize", { x: f.xMm, y: f.yMm, w: f.widthMm, h: f.fontPt }, (p) => {
                      const widthMm = p["w"];
                      const draggedHeight = p["h"];
                      if (widthMm !== undefined && draggedHeight !== undefined) {
                        const fontPt = Number(clamp(draggedHeight, 3, 72).toFixed(1));
                        onPatchField(f.id, { widthMm, fontPt });
                      }
                    })
                  }
                  className="absolute -bottom-1.5 -right-1.5 size-4 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow-sm"
                  title="Drag karke font aur width chhota bara karein"
                  aria-label="Font aur width resize karein"
                />
              ) : null}
            </div>
          );
        })}

      {b.enabled && values.code.trim() ? (
        <div
          onPointerDown={(e) => {
            onSelect({ kind: "barcode" });
            startDrag(e, "move", { x: b.xMm, y: b.yMm, w: b.widthMm, h: b.heightMm }, (p) => {
              const xMm = p["x"];
              const yMm = p["y"];
              if (xMm !== undefined && yMm !== undefined) onPatchBarcode({ xMm, yMm });
            });
          }}
          className={`absolute cursor-move ${
            selection?.kind === "barcode" ? "outline outline-1 outline-primary" : ""
          }`}
          style={{
            left: b.xMm * scale,
            top: b.yMm * scale,
            width: b.widthMm * scale,
            height: b.heightMm * scale,
          }}
        >
          <div className="pointer-events-none h-full w-full">
            <Barcode
              value={values.code}
              format={b.format}
              height={Math.max(10, b.heightMm * 3.78)}
              moduleWidth={b.moduleWidth}
              displayValue={b.showText}
              fontSize={Math.round(b.textPt * 1.6)}
            />
          </div>
          {selection?.kind === "barcode" ? (
            <span
              onPointerDown={(e) =>
                startDrag(e, "resize", { x: b.xMm, y: b.yMm, w: b.widthMm, h: b.heightMm }, (p) => {
                  const widthMm = p["w"];
                  const heightMm = p["h"];
                  if (widthMm !== undefined && heightMm !== undefined) onPatchBarcode({ widthMm, heightMm });
                })
              }
              className="absolute -bottom-1 -right-1 size-3 cursor-nwse-resize rounded-full bg-primary"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
