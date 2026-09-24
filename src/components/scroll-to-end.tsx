"use client";

import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

/**
 * Jumps the conversation to the latest message once history is loaded
 * (e.g. restored from localStorage after a refresh / app open).
 *
 * Scrolls only the conversation container — not the document.
 * (window.scrollTo/scrollIntoView caused an address-bar resize loop on mobile,
 * making the screen blink and hang.)
 */
export function ScrollToEnd({ count }: { count: number }) {
  const { scrollRef, scrollToBottom } = useStickToBottomContext();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || count === 0) return;
    done.current = true;

    const jump = () => {
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      void scrollToBottom({ animation: "instant", ignoreEscapes: true });
    };

    const frame = window.requestAnimationFrame(jump);
    // Content (cards, fonts) may still grow a bit later.
    const timer = window.setTimeout(jump, 300);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [count, scrollRef, scrollToBottom]);

  return null;
}
