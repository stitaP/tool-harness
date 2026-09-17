/* ─── stitaP — Custom Intersection Observer (replaces react-intersection-observer) ─── */

import { useRef, useState, useEffect, useCallback } from "react";

export interface UseInViewOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
  root?: Element | null;
  skip?: boolean;
}

export interface UseInViewResult {
  ref: (node: Element | null) => void;
  inView: boolean;
  entry: IntersectionObserverEntry | null;
}

export function useInView(options: UseInViewOptions = {}): UseInViewResult {
  const { threshold = 0, rootMargin = "0px", triggerOnce = false, root = null, skip = false } = options;
  const [inView, setInView] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const refCallback = useRef<((node: Element | null) => void) | null>(null);
  const nodeRef = useRef<Element | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: Element | null) => {
      if (skip) return;
      if (observerRef.current) {
        if (nodeRef.current) observerRef.current.unobserve(nodeRef.current);
        observerRef.current.disconnect();
      }
      nodeRef.current = node;
      if (!node) return;

      const observer = new IntersectionObserver(
        ([e]) => {
          const isVisible = e.isIntersecting;
          setInView(isVisible);
          setEntry(e);
          if (isVisible && triggerOnce) {
            observer.unobserve(node);
            observer.disconnect();
          }
        },
        { threshold, rootMargin, root },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [threshold, rootMargin, triggerOnce, root, skip],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return { ref, inView, entry };
}

export default useInView;
