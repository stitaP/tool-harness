/* ─── stitaP — Custom Animation Engine (replaces framer-motion) ─── */

import React, { useRef, useEffect, useState, useCallback } from "react";

/* ─── Types ─── */

export type EasingFn = (t: number) => number;

export interface MotionProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Initial state */
  initial?: Record<string, number | string>;
  /** Animated state */
  animate?: Record<string, number | string>;
  /** Exit state */
  exit?: Record<string, number | string>;
  /** Transition config */
  transition?: {
    duration?: number;
    delay?: number;
    ease?: EasingFn | string;
    type?: "spring" | "tween";
    stiffness?: number;
    damping?: number;
  };
  /** While hover */
  whileHover?: Record<string, number | string>;
  /** While tap */
  whileTap?: Record<string, number | string>;
  /** Viewport animation trigger */
  viewport?: { once?: boolean; margin?: string };
  /** Animation key to re-trigger */
  key?: string | number;
  onClick?: () => void;
}

/* ─── Easings ─── */

export const easings = {
  linear: (t: number) => t,
  ease: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeIn: (t: number) => t * t * t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  spring: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

/* ─── CSS Property Mapping ─── */

const PROP_MAP: Record<string, string> = {
  x: "translateX",
  y: "translateY",
  scale: "scale",
  scaleX: "scaleX",
  scaleY: "scaleY",
  rotate: "rotate",
  rotateX: "rotateX",
  rotateY: "rotateY",
  opacity: "opacity",
  skew: "skew",
  skewX: "skewX",
  skewY: "skewY",
};

function buildTransform(props: Record<string, number | string>): string {
  const transforms: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    const cssProp = PROP_MAP[key];
    if (cssProp) {
      if (key === "opacity") continue;
      const unit = typeof value === "number" && !["scale", "scaleX", "scaleY", "opacity"].includes(key) ? "px" : "";
      transforms.push(`${cssProp}(${value}${unit})`);
    }
  }
  return transforms.join(" ");
}

function buildStyle(props: Record<string, number | string>): React.CSSProperties {
  const style: Record<string, string | number> = {};
  const transform = buildTransform(props);
  if (transform) style.transform = transform;
  if (props.opacity !== undefined) style.opacity = props.opacity;
  return style as React.CSSProperties;
}

/* ─── Spring Physics ─── */

function springValue(
  from: number,
  to: number,
  progress: number,
  stiffness = 100,
  damping = 10,
): number {
  const mass = 1;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const A = 1;
  const phi = Math.acos(zeta);
  const t = progress;
  const envelope = Math.exp(-zeta * w0 * t);
  const osc = Math.cos(wd * t - phi);
  const value = to - (to - from) * envelope * osc;
  return value;
}

/* ─── Motion Component ─── */

export const Motion: React.FC<MotionProps> = ({
  children,
  className,
  style: styleProp,
  initial,
  animate,
  exit: _exit,
  transition,
  whileHover,
  whileTap,
  viewport,
  onClick,
  ...rest
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(!viewport);
  const [isHovered, setIsHovered] = useState(false);
  const [isTapped, setIsTapped] = useState(false);

  // Viewport intersection
  useEffect(() => {
    if (!viewport || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (viewport.once) observer.disconnect();
        } else if (!viewport.once) {
          setIsInView(false);
        }
      },
      { rootMargin: viewport.margin || "0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [viewport]);

  const targetProps = isTapped && whileTap
    ? { ...animate, ...whileTap }
    : isHovered && whileHover
    ? { ...animate, ...whileHover }
    : animate || {};

  const currentStyle = isInView ? buildStyle(targetProps) : (initial ? buildStyle(initial) : {});

  const duration = transition?.duration ?? 0.3;
  const delay = transition?.delay ?? 0;
  const easing = transition?.ease || easings.ease;

  const transitionCSS = `all ${duration}s ${typeof easing === "string" ? easing : "cubic-bezier(0.4, 0, 0.2, 1)"} ${delay}s`;

  return React.createElement(
    "div",
    {
      ref,
      className,
      style: { ...styleProp, ...currentStyle, transition: transitionCSS },
      onMouseEnter: () => whileHover && setIsHovered(true),
      onMouseLeave: () => { setIsHovered(false); setIsTapped(false); },
      onMouseDown: () => whileTap && setIsTapped(true),
      onMouseUp: () => setIsTapped(false),
      onClick,
      ...rest,
    },
    children,
  );
};

/* ─── AnimatePresence (simplified — wraps exit animations) ─── */

export const AnimatePresence: React.FC<{
  children: React.ReactNode;
  mode?: "wait" | "sync" | "popLayout";
}> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

/* ─── useInView hook ─── */

export function useInView(
  ref: React.RefObject<HTMLElement | null>,
  opts?: { threshold?: number; rootMargin?: string; once?: boolean },
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (opts?.once) observer.disconnect();
        } else if (!opts?.once) {
          setInView(false);
        }
      },
      { threshold: opts?.threshold, rootMargin: opts?.rootMargin },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, opts?.threshold, opts?.rootMargin, opts?.once]);
  return inView;
}

/* ─── useAnimation ─── */

export function useAnimation() {
  const [state, setState] = useState<Record<string, number | string>>({});

  const start = useCallback(
    async (target: Record<string, number | string>, _opts?: { duration?: number }) => {
      setState(target);
    },
    [],
  );

  return { state, start };
}

/* ─── Re-export key utilities ─── */

export default Motion;
