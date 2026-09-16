"use client";

import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

/**
 * Jumps the conversation to the latest message once history is loaded
 * (e.g. restored from localStorage after a refresh / app open).
 *
 * Sirf conversation container ko scroll karta hai — document ko nahi.
 * (window.scrollTo/scrollIntoView mobile par address-bar resize loop bana kar
 * screen blink aur hang karta tha.)
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
    // Content (cards, fonts) thoda baad me bhi grow kar sakta hai.
    const timer = window.setTimeout(jump, 300);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [count, scrollRef, scrollToBottom]);

  return null;
}
