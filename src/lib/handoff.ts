/**
 * Order <-> Invoice forward: aik section ka text doosre section ke composer me le jata hai.
 */
export type HandoffTarget = "order" | "invoice" | "confirmation";

const key = (target: HandoffTarget) => `workspace-handoff:${target}:v1`;

export function setHandoff(target: HandoffTarget, text: string) {
  try {
    localStorage.setItem(key(target), text);
  } catch {
    // ignore
  }
}

/** Ek hi baar milta hai — read karte hi clear ho jata hai. */
export function takeHandoff(target: HandoffTarget): string | null {
  try {
    const value = localStorage.getItem(key(target));
    if (value) localStorage.removeItem(key(target));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}
