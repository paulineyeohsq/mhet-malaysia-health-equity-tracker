import { useCallback, useEffect, useState } from "react";

/**
 * True once the element has come within `marginPx` of the visible part of the page (and stays true). Lets a page hold
 * back the data for a section far below the fold until the visitor is about to reach it. Where IntersectionObserver
 * does not exist the answer is true straight away, so nothing is ever withheld for good.
 */
export function useNearViewport<T extends Element>(marginPx = 800): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (near || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${marginPx}px 0px` }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, near, marginPx]);

  return [ref, near];
}
