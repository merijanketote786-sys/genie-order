"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

const KEY = "app-font-size";
const MIN = 15;
const MAX = 19;
const BASE = 16;

function applySize(px: number | null) {
  if (px == null) {
    document.documentElement.style.fontSize = "";
    localStorage.removeItem(KEY);
  } else {
    document.documentElement.style.fontSize = `${px}px`;
    localStorage.setItem(KEY, String(px));
  }
}

/**
 * Poori workspace ka text/layout chhota-bara karne ka control.
 * Browser zoom (Ctrl+scroll) ki jagah ye use karein — is se layout nahi tootta
 * aur cheezen chhup nahi jaati. Setting is browser me save rehti hai.
 */
function defaultSize() {
  return BASE;
}

export function FontSizeControl() {
  const [size, setSize] = useState<number>(BASE);

  useEffect(() => {
    const saved = Number(localStorage.getItem(KEY));
    const initial =
      Number.isFinite(saved) && saved >= MIN && saved <= MAX ? saved : defaultSize();
    applySize(initial === BASE ? null : initial);
    setSize(initial);
  }, []);

  const change = (delta: number) => {
    const current = size;
    const next = Math.min(MAX, Math.max(MIN, current + delta));
    applySize(next === BASE ? null : next);
    setSize(next);
  };

  const percent = Math.round((size / BASE) * 100);

  return (
    <div
      className="hidden shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 sm:flex"
      title="Text size chhota/bara karein"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => change(-1)}
        disabled={size <= MIN}
        className="size-8"
        aria-label="Text chhota karein"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-11 text-center text-[11px] font-semibold text-muted-foreground tabular-nums">
        {percent}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => change(1)}
        disabled={size >= MAX}
        className="size-8"
        aria-label="Text bara karein"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
