import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export type UnsavedGuardState = { dirty: boolean; onSave?: () => Promise<unknown> | void } | null;

/**
 * When a POS page is embedded inside a dashboard quick-action popup (no router
 * navigation happens on close), the page registers its dirty/save state here so
 * the popup's close button can show the same unsaved-entries warning.
 */
export const EmbeddedUnsavedCtx = createContext<{ setGuard: (g: UnsavedGuardState) => void } | null>(null);

/** Shared warning dialog: Cancel / Leave without saving / Save & leave. */
export function UnsavedCloseDialog({ open, saving, onCancel, onLeave, onSave }: {
  open: boolean; saving: boolean;
  onCancel: () => void; onLeave: () => void; onSave: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-xl border bg-card p-5 shadow-xl">
        <h2 className="text-base font-semibold">Unsaved entries</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You have unsaved entries on this page. Save them before leaving, or leave without saving.
        </p>
        <div className="mt-5 flex flex-col-reverse flex-wrap gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button variant="ghost" className="w-full text-destructive hover:text-destructive sm:w-auto" onClick={onLeave} disabled={saving}>
            Leave without saving
          </Button>
          <Button className="w-full sm:w-auto" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save & leave"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Warns before leaving a POS screen (in-app navigation or tab close) while entries are unsaved.
 * Shows a dialog with Cancel / Leave / Save. `onSave` should save the current entries;
 * after it resolves the navigation continues. When embedded in a quick-action popup,
 * the dirty state is handed to the popup instead of blocking router navigation.
 */
export function useUnsavedGuard(dirty: boolean, onSave?: () => Promise<unknown> | void) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const embedded = useContext(EmbeddedUnsavedCtx);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const hasSave = !!onSave;

  /** Runs the page's save and rejects if entries are still unsaved afterwards (validation/API failure). */
  const runSave = useCallback(async () => {
    await onSaveRef.current?.();
    await new Promise((r) => setTimeout(r, 60));
    if (dirtyRef.current) throw new Error("Entries were not saved");
  }, []);

  useEffect(() => {
    if (!embedded) return;
    embedded.setGuard(dirty ? { dirty: true, onSave: hasSave ? runSave : undefined } : null);
  }, [embedded, dirty, hasSave, runSave]);
  useEffect(() => {
    if (!embedded) return;
    return () => embedded.setGuard(null);
  }, [embedded]);

  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (embedded || !dirty) return false;
      setOpen(true);
      return true;
    },
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  const close = () => {
    setOpen(false);
    if (blocker.status === "blocked") blocker.reset();
  };
  const leave = () => {
    setOpen(false);
    if (blocker.status === "blocked") blocker.proceed();
  };
  const save = async () => {
    if (!onSaveRef.current) return leave();
    setSaving(true);
    try {
      await runSave();
      leave();
    } catch {
      // save failed (already toasted by the page); stay on the page
      setOpen(false);
      if (blocker.status === "blocked") blocker.reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <UnsavedCloseDialog open={open && !embedded} saving={saving} onCancel={close} onLeave={leave} onSave={save} />
  ) as ReactNode;
}
