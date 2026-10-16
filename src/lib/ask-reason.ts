/**
 * In-app replacement for window.prompt (not supported in the desktop app / some embedded views).
 * Resolves with the typed text, or null when the user cancels.
 */
export function askReason(message: string, okLabel = "Confirm"): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "fixed inset-0 z-[90] grid place-items-center bg-foreground/40 p-4";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    const card = document.createElement("div");
    card.className = "w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-4 shadow-xl";
    const p = document.createElement("p");
    p.className = "text-sm font-semibold text-foreground";
    p.textContent = message;
    const input = document.createElement("input");
    input.className = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary";
    input.placeholder = "Reason (optional)";
    input.maxLength = 300;
    const row = document.createElement("div");
    row.className = "flex justify-end gap-2";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "h-9 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent";
    cancel.textContent = "Back";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "h-9 rounded-md bg-destructive px-3 text-sm font-semibold text-destructive-foreground";
    ok.textContent = okLabel;
    row.append(cancel, ok);
    card.append(p, input, row);
    wrap.append(card);
    const done = (v: string | null) => { wrap.remove(); resolve(v); };
    cancel.onclick = () => done(null);
    ok.onclick = () => done(input.value.trim());
    wrap.onclick = (e) => { if (e.target === wrap) done(null); };
    input.onkeydown = (e) => { if (e.key === "Enter") done(input.value.trim()); if (e.key === "Escape") done(null); };
    document.body.append(wrap);
    setTimeout(() => input.focus(), 0);
  });
}
