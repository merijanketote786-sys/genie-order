import { useState } from "react";
import { createPortal } from "react-dom";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/**
 * Warns before leaving a POS screen (in-app navigation or tab close) while entries are unsaved.
 * Shows a dialog with Cancel / Leave / Save. `onSave` should save the current entries;
 * after it resolves the navigation continues.
 */
export function useUnsavedGuard(dirty: boolean, onSave?: () => Promise<unknown> | void) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;
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
    if (!onSave) return leave();
    setSaving(true);
    try {
      await onSave();
      leave();
    } catch {
      // save failed (already toasted by the page); stay on the page
      setOpen(false);
      if (blocker.status === "blocked") blocker.reset();
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === "undefined") return;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl">
        <h2 className="text-base font-semibold">Unsaved entries</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You have unsaved entries on this page. Save them before leaving, or leave without saving.
        </p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={leave} disabled={saving}>
            Leave without saving
          </Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & leave"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
