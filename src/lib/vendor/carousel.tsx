/* ─── stitaP — Custom Carousel (replaces embla-carousel-react) ─── */

import React, { useRef, useState, useCallback, useEffect, createContext, useContext } from "react";

interface CarouselContextValue {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  scrollPrev: () => void;
  scrollNext: () => void;
  scrollTo: (index: number) => void;
  currentIndex: number;
  totalSlides: number;
}

const Ctx = createContext<CarouselContextValue | null>(null);

export function useCarousel() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCarousel must be used within <Carousel>");
  return ctx;
}

export const Carousel: React.FC<{
  children: React.ReactNode;
  className?: string;
  opts?: { loop?: boolean; align?: "start" | "center" | "end"; slidesToScroll?: number };
  orientation?: "horizontal" | "vertical";
}> = ({ children, className, opts, orientation = "horizontal" }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);

  const updateState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const children = el.children;
    setTotalSlides(children.length);

    const scrollLeft = el.scrollLeft;
    const scrollWidth = el.scrollWidth;
    const clientWidth = el.clientWidth;

    setCanScrollPrev(scrollLeft > 1);
    setCanScrollNext(scrollLeft < scrollWidth - clientWidth - 1);

    // Calculate current index based on scroll position
    if (children.length > 0) {
      const slideWidth = scrollWidth / children.length;
      setCurrentIndex(Math.round(scrollLeft / slideWidth));
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateState, { passive: true });
    updateState();
    const ro = new ResizeObserver(updateState);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", updateState); ro.disconnect(); };
  }, [updateState]);

  const scrollTo = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const children = el.children;
    if (index >= 0 && index < children.length) {
      (children[index] as HTMLElement).scrollIntoView({
        behavior: "smooth",
        block: orientation === "vertical" ? "start" : "nearest",
        inline: orientation === "vertical" ? "nearest" : "start",
      });
    }
  }, [orientation]);

  const scrollPrev = useCallback(() => {
    scrollTo(Math.max(0, currentIndex - (opts?.slidesToScroll || 1)));
  }, [currentIndex, scrollTo, opts?.slidesToScroll]);

  const scrollNext = useCallback(() => {
    scrollTo(Math.min(totalSlides - 1, currentIndex + (opts?.slidesToScroll || 1)));
  }, [currentIndex, totalSlides, scrollTo, opts?.slidesToScroll]);

  return React.createElement(
    Ctx.Provider,
    { value: { scrollRef, canScrollPrev, canScrollNext, scrollPrev, scrollNext, scrollTo, currentIndex, totalSlides } },
    React.createElement(
      "div",
      { className, role: "region", "aria-roledescription": "carousel" },
      React.createElement(
        "div",
        {
          ref: scrollRef,
          style: {
            display: "flex",
            flexDirection: orientation === "vertical" ? "column" : "row",
            overflow: "auto",
            scrollSnapType: "x mandatory",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            gap: "1rem",
          } as React.CSSProperties,
        },
        children,
      ),
    ),
  );
};

export const CarouselContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  return React.createElement("div", { className, style: { display: "contents" } }, children);
};

export const CarouselItem: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  return React.createElement(
    "div",
    {
      className,
      style: { flex: "0 0 auto", scrollSnapAlign: "start" },
      role: "group",
      "aria-roledescription": "slide",
    },
    children,
  );
};

export const CarouselPrevious: React.FC<{ className?: string; variant?: string }> = ({ className }) => {
  const { scrollPrev, canScrollPrev } = useCarousel();
  return React.createElement(
    "button",
    {
      onClick: scrollPrev,
      disabled: !canScrollPrev,
      className,
      "aria-label": "Previous slide",
    },
    "←",
  );
};

export const CarouselNext: React.FC<{ className?: string; variant?: string }> = ({ className }) => {
  const { scrollNext, canScrollNext } = useCarousel();
  return React.createElement(
    "button",
    {
      onClick: scrollNext,
      disabled: !canScrollNext,
      className,
      "aria-label": "Next slide",
    },
    "→",
  );
};
