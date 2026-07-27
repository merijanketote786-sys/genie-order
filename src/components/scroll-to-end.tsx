"use client";

import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

/**
 * Jumps the conversation to the latest message once history is loaded
 * (e.g. restored from localStorage after a refresh / app open).
 */
export function ScrollToEnd({ count }: { count: number }) {
  const { contentRef, scrollRef, scrollToBottom } = useStickToBottomContext();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || count === 0) return;
    done.current = true;

    const jump = () => {
      const scroller = scrollRef.current;
      const content = contentRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      if (content) content.lastElementChild?.scrollIntoView({ block: "end" });
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      void scrollToBottom({ animation: "instant", ignoreEscapes: true });
    };

    window.requestAnimationFrame(jump);
    // Content (markdown, cards, fonts) can grow after first paint.
    const timers = [0, 50, 150, 350, 700, 1200, 1800].map((ms) =>
      window.setTimeout(jump, ms)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [contentRef, count, scrollRef, scrollToBottom]);

  return null;
}
