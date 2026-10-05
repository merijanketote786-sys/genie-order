import { useBlocker } from "@tanstack/react-router";

/** Warns before leaving a POS screen (in-app navigation or tab close) while entries are unsaved. */
export function useUnsavedGuard(dirty: boolean) {
  useBlocker({
    shouldBlockFn: () => (dirty ? !window.confirm("You have unsaved entries. Leave this page without saving?") : false),
    enableBeforeUnload: () => dirty,
  });
}
