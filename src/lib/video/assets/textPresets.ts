/* ─── stitaP Video Editor — Animated Text Presets ─── */

import type { TextOverlay } from "../types";
import { generateId } from "../types";

export type AnimationStyle =
  | "none"
  | "typewriter"
  | "fade-in-up"
  | "fade-in-down"
  | "scale-pop"
  | "bounce-in"
  | "glitch"
  | "glow-pulse"
  | "slide-left"
  | "slide-right"
  | "rotate-in"
  | "blur-in"
  | "stagger-words"
  | "handwritten"
  | "neon-flicker";

export interface TextPreset {
  id: string;
  name: string;
  style: AnimationStyle;
  description: string;
  /** Base text overlay properties */
  defaults: Partial<TextOverlay>;
  /** CSS animation keyframe description (used by compositor) */
  keyframes: string;
  icon: string;
}

export const TEXT_PRESETS: TextPreset[] = [
  /* ─── No Animation ─── */
  {
    id: "preset_plain",
    name: "Plain Text",
    style: "none",
    description: "Static text with no animation",
    defaults: {
      fontSize: 48,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: false,
      italic: false,
      shadow: false,
      alignment: "center",
    },
    keyframes: "none",
    icon: "Aa",
  },

  /* ─── Typewriter ─── */
  {
    id: "preset_typewriter",
    name: "Typewriter",
    style: "typewriter",
    description: "Letters appear one by one like a typewriter",
    defaults: {
      fontSize: 36,
      fontFamily: "'Courier New', monospace",
      color: "#00ff41",
      backgroundColor: "transparent",
      bold: false,
      italic: false,
      shadow: false,
      alignment: "center",
    },
    keyframes: "clip-path: inset(0 100% 0 0) → inset(0 0 0 0) over duration",
    icon: "⌨️",
  },

  /* ─── Fade In Up ─── */
  {
    id: "preset_fade_up",
    name: "Fade In Up",
    style: "fade-in-up",
    description: "Text fades in while sliding up from below",
    defaults: {
      fontSize: 48,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: true,
      alignment: "center",
    },
    keyframes: "opacity: 0→1, transform: translateY(30px)→0",
    icon: "⬆️",
  },

  /* ─── Fade In Down ─── */
  {
    id: "preset_fade_down",
    name: "Fade In Down",
    style: "fade-in-down",
    description: "Text fades in while dropping from above",
    defaults: {
      fontSize: 48,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: true,
      alignment: "center",
    },
    keyframes: "opacity: 0→1, transform: translateY(-30px)→0",
    icon: "⬇️",
  },

  /* ─── Scale Pop ─── */
  {
    id: "preset_scale_pop",
    name: "Scale Pop",
    style: "scale-pop",
    description: "Text pops in with a scale overshoot effect",
    defaults: {
      fontSize: 64,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: true,
      alignment: "center",
    },
    keyframes: "transform: scale(0)→scale(1.15)→scale(1)",
    icon: "💥",
  },

  /* ─── Bounce In ─── */
  {
    id: "preset_bounce",
    name: "Bounce In",
    style: "bounce-in",
    description: "Text bounces in with elastic effect",
    defaults: {
      fontSize: 48,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: false,
      alignment: "center",
    },
    keyframes: "transform: scale(0)→scale(1.3)→scale(0.9)→scale(1.05)→scale(1)",
    icon: "🏀",
  },

  /* ─── Glitch ─── */
  {
    id: "preset_glitch",
    name: "Glitch",
    style: "glitch",
    description: "Text flickers and glitches with color offsets",
    defaults: {
      fontSize: 56,
      fontFamily: "monospace",
      color: "#ff0040",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: false,
      alignment: "center",
    },
    keyframes: "clip-path + translateXY oscillation + color channel split",
    icon: "👾",
  },

  /* ─── Glow Pulse ─── */
  {
    id: "preset_glow",
    name: "Glow Pulse",
    style: "glow-pulse",
    description: "Text appears with a pulsing neon glow effect",
    defaults: {
      fontSize: 48,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#00ffff",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: true,
      alignment: "center",
    },
    keyframes: "text-shadow pulse: 0→20px→0 glow, opacity: 0.3→1",
    icon: "💫",
  },

  /* ─── Slide Left ─── */
  {
    id: "preset_slide_left",
    name: "Slide In from Right",
    style: "slide-left",
    description: "Text slides in from the right edge",
    defaults: {
      fontSize: 40,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: false,
      italic: false,
      shadow: false,
      alignment: "left",
    },
    keyframes: "transform: translateX(100%)→0",
    icon: "👈",
  },

  /* ─── Slide Right ─── */
  {
    id: "preset_slide_right",
    name: "Slide In from Left",
    style: "slide-right",
    description: "Text slides in from the left edge",
    defaults: {
      fontSize: 40,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: false,
      italic: false,
      shadow: false,
      alignment: "right",
    },
    keyframes: "transform: translateX(-100%)→0",
    icon: "👉",
  },

  /* ─── Rotate In ─── */
  {
    id: "preset_rotate",
    name: "Rotate In",
    style: "rotate-in",
    description: "Text rotates in from a skewed angle",
    defaults: {
      fontSize: 52,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: true,
      alignment: "center",
    },
    keyframes: "transform: rotate(-10deg) scale(0.8)→rotate(0) scale(1), opacity: 0→1",
    icon: "🔄",
  },

  /* ─── Blur In ─── */
  {
    id: "preset_blur",
    name: "Blur In",
    style: "blur-in",
    description: "Text starts blurry and sharpens into focus",
    defaults: {
      fontSize: 48,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: false,
      italic: false,
      shadow: false,
      alignment: "center",
    },
    keyframes: "filter: blur(20px)→blur(0), opacity: 0→1",
    icon: "🔍",
  },

  /* ─── Stagger Words ─── */
  {
    id: "preset_stagger",
    name: "Stagger Words",
    style: "stagger-words",
    description: "Words appear one at a time with slight delay",
    defaults: {
      fontSize: 40,
      fontFamily: "Helvetica, Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: false,
      alignment: "center",
    },
    keyframes: "each word: opacity 0→1, translateY 20px→0, staggered by 150ms",
    icon: "📝",
  },

  /* ─── Handwritten ─── */
  {
    id: "preset_handwritten",
    name: "Handwritten",
    style: "handwritten",
    description: "Text appears as if being written by hand",
    defaults: {
      fontSize: 36,
      fontFamily: "'Segoe Script', 'Comic Sans MS', cursive",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: false,
      italic: false,
      shadow: false,
      alignment: "center",
    },
    keyframes: "stroke-dashoffset animation on path",
    icon: "✍️",
  },

  /* ─── Neon Flicker ─── */
  {
    id: "preset_neon",
    name: "Neon Flicker",
    style: "neon-flicker",
    description: "Text flickers like a neon sign turning on",
    defaults: {
      fontSize: 52,
      fontFamily: "'Courier New', monospace",
      color: "#ff006e",
      backgroundColor: "transparent",
      bold: true,
      italic: false,
      shadow: true,
      alignment: "center",
    },
    keyframes: "opacity flicker: 0→1→0.4→1→0.6→1 with text-shadow pulse",
    icon: "💡",
  },
];

/* ─── Font Presets ─── */

export interface FontPreset {
  name: string;
  family: string;
  category: "sans-serif" | "serif" | "monospace" | "display" | "handwriting";
}

export const FONT_PRESETS: FontPreset[] = [
  { name: "Helvetica", family: "Helvetica, Arial, sans-serif", category: "sans-serif" },
  { name: "Arial", family: "Arial, Helvetica, sans-serif", category: "sans-serif" },
  { name: "Georgia", family: "Georgia, 'Times New Roman', serif", category: "serif" },
  { name: "Times New Roman", family: "'Times New Roman', Times, serif", category: "serif" },
  { name: "Courier New", family: "'Courier New', Courier, monospace", category: "monospace" },
  { name: "Monospace", family: "'Courier New', monospace", category: "monospace" },
  { name: "Impact", family: "Impact, 'Arial Black', sans-serif", category: "display" },
  { name: "Trebuchet MS", family: "'Trebuchet MS', sans-serif", category: "sans-serif" },
  { name: "Verdana", family: "Verdana, Geneva, sans-serif", category: "sans-serif" },
  { name: "Comic Sans MS", family: "'Comic Sans MS', cursive", category: "handwriting" },
  { name: "Palatino", family: "'Palatino Linotype', 'Book Antiqua', Palatino, serif", category: "serif" },
  { name: "Lucida Console", family: "'Lucida Console', Monaco, monospace", category: "monospace" },
  { name: "Tahoma", family: "Tahoma, Geneva, sans-serif", category: "sans-serif" },
  { name: "Garamond", family: "Garamond, serif", category: "serif" },
  { name: "Franklin Gothic", family: "'Franklin Gothic Medium', sans-serif", category: "sans-serif" },
];

/* ─── Color Palettes ─── */

export interface TextColorPalette {
  name: string;
  colors: string[];
  description: string;
}

export const TEXT_COLOR_PALETTES: TextColorPalette[] = [
  { name: "Classic White", colors: ["#ffffff", "#f0f0f0", "#e0e0e0"], description: "Clean white text" },
  { name: "Neon", colors: ["#ff006e", "#00ffff", "#facc15", "#00ff41", "#ff6600"], description: "Vibrant neon colors" },
  { name: "Pastel", colors: ["#fecdd3", "#c7d2fe", "#a7f3d0", "#fef08a", "#ddd6fe"], description: "Soft pastel tones" },
  { name: "Bold Primary", colors: ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6"], description: "Strong primary colors" },
  { name: "Monochrome", colors: ["#ffffff", "#d4d4d4", "#a3a3a3", "#737373", "#404040"], description: "Grayscale range" },
  { name: "Sunset", colors: ["#ff6b35", "#f7c59f", "#efefd0", "#004e89", "#1a659e"], description: "Warm sunset tones" },
  { name: "Ocean", colors: ["#0077b6", "#00b4d8", "#90e0ef", "#caf0f8", "#023e8a"], description: "Cool ocean blues" },
  { name: "Fire", colors: ["#ff0000", "#ff4500", "#ff8c00", "#ffd700", "#ffff00"], description: "Hot fire gradient" },
];

/* ─── Utility: Create text overlay from preset ─── */

export function applyTextPreset(
  preset: TextPreset,
  text: string,
  startTime: number,
  duration: number
): TextOverlay {
  return {
    id: generateId("txt"),
    text,
    startOffset: startTime,
    duration,
    x: 50,
    y: 50,
    fontSize: preset.defaults.fontSize ?? 48,
    fontFamily: preset.defaults.fontFamily ?? "Helvetica, Arial, sans-serif",
    color: preset.defaults.color ?? "#ffffff",
    backgroundColor: preset.defaults.backgroundColor ?? "transparent",
    bold: preset.defaults.bold ?? false,
    italic: preset.defaults.italic ?? false,
    shadow: preset.defaults.shadow ?? false,
    alignment: preset.defaults.alignment ?? "center",
  };
}

/** Get animation progress (0..1) for a given style at time t */
export function getAnimationProgress(
  style: AnimationStyle,
  t: number,
  duration: number,
  entranceRatio = 0.3
): {
  opacity: number;
  transform: string;
  filter: string;
  clipPath: string;
  textShadow: string;
} {
  const entranceEnd = duration * entranceRatio;
  const exitStart = duration * 0.85;
  const p = Math.max(0, Math.min(1, t / entranceEnd));
  const exitP = t > exitStart ? Math.max(0, 1 - (t - exitStart) / (duration - exitStart)) : 1;
  const fadeOut = Math.min(p, exitP);

  const base: ReturnType<typeof getAnimationProgress> = {
    opacity: 1,
    transform: "",
    filter: "",
    clipPath: "",
    textShadow: "",
  };

  switch (style) {
    case "none":
      base.opacity = t < 0.1 ? 0 : fadeOut;
      break;

    case "typewriter":
      base.opacity = fadeOut;
      base.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
      break;

    case "fade-in-up":
      base.opacity = p * exitP;
      base.transform = `translateY(${(1 - p) * 30}px)`;
      break;

    case "fade-in-down":
      base.opacity = p * exitP;
      base.transform = `translateY(${(1 - p) * -30}px)`;
      break;

    case "scale-pop": {
      const scale = p < 0.7 ? p / 0.7 * 1.15 : 1.15 - (p - 0.7) / 0.3 * 0.15;
      base.opacity = fadeOut;
      base.transform = `scale(${Math.max(0, scale)})`;
      break;
    }

    case "bounce-in": {
      let bounce = 1;
      if (p < 0.3) bounce = p / 0.3 * 1.3;
      else if (p < 0.5) bounce = 1.3 - (p - 0.3) / 0.2 * 0.4;
      else if (p < 0.7) bounce = 0.9 + (p - 0.5) / 0.2 * 0.15;
      else bounce = 1.05 - (p - 0.7) / 0.3 * 0.05;
      base.opacity = fadeOut;
      base.transform = `scale(${Math.max(0, bounce)})`;
      break;
    }

    case "glitch": {
      base.opacity = fadeOut;
      const flicker = Math.random() > 0.3 ? 1 : 0;
      const offsetX = (Math.random() - 0.5) * (1 - p) * 20;
      const offsetY = (Math.random() - 0.5) * (1 - p) * 10;
      base.transform = `translate(${offsetX}px, ${offsetY}px)`;
      base.opacity = p < 0.2 ? flicker : fadeOut;
      break;
    }

    case "glow-pulse": {
      base.opacity = fadeOut;
      const glow = Math.sin(t * 6) * 0.5 + 0.5;
      const blur = 5 + glow * 15;
      base.textShadow = `0 0 ${blur}px currentColor, 0 0 ${blur * 2}px currentColor`;
      break;
    }

    case "slide-left":
      base.opacity = fadeOut;
      base.transform = `translateX(${(1 - p) * 100}%)`;
      break;

    case "slide-right":
      base.opacity = fadeOut;
      base.transform = `translateX(${(1 - p) * -100}%)`;
      break;

    case "rotate-in":
      base.opacity = p * exitP;
      base.transform = `rotate(${(1 - p) * -10}deg) scale(${0.8 + p * 0.2})`;
      break;

    case "blur-in":
      base.opacity = fadeOut;
      base.filter = `blur(${(1 - p) * 20}px)`;
      break;

    case "stagger-words":
      base.opacity = fadeOut;
      break;

    case "handwritten":
      base.opacity = fadeOut;
      base.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
      break;

    case "neon-flicker": {
      base.opacity = fadeOut;
      const flickerOn = p > 0.1;
      const flickerVal = flickerOn ? (Math.random() > 0.05 ? 1 : 0.4) : 0;
      base.opacity = flickerVal * exitP;
      const g = 10 + Math.sin(t * 8) * 5;
      base.textShadow = `0 0 ${g}px currentColor, 0 0 ${g * 2}px currentColor, 0 0 ${g * 3}px currentColor`;
      break;
    }
  }

  return base;
}
