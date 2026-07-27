"use client";

import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

/**
 * Jumps the conversation to the latest message once history is loaded
 * (e.g. restored from localStorage after a refresh / app open).
 */
export function ScrollToEnd({ count }: { count: number }) {
  const { scrollToBottom } = useStickToBottomContext();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || count === 0) return;
    done.current = true;

    const jump = () => scrollToBottom({ animation: "instant" });
    jump();
    // Content (markdown, cards, fonts) can grow after first paint.
    const timers = [0, 60, 200, 500, 1000].map((ms) => window.setTimeout(jump, ms));
    return () => timers.forEach(window.clearTimeout);
  }, [count, scrollToBottom]);

  return null;
}
