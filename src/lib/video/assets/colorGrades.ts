/* ─── stitaP Video Editor — Color Grading Presets ─── */

import type { Effect } from "../types";
import { generateId } from "../types";

export type GradingCategory = "cinematic" | "vintage" | "artistic" | "natural" | "dramatic" | "mono";

export interface ColorGrade {
  id: string;
  name: string;
  category: GradingCategory;
  description: string;
  /** Preview gradient */
  preview: [string, string];
  /** Effects stack to apply */
  effects: Omit<Effect, "id">[];
  icon: string;
}

const createEffect = (overrides: Omit<Effect, "id">): Omit<Effect, "id"> => overrides;

/* ─── Cinematic ─── */

const cinematicGrades: ColorGrade[] = [
  {
    id: "grade_hollywood",
    name: "Hollywood",
    category: "cinematic",
    description: "Warm highlights, teal shadows — blockbuster look",
    preview: ["#2c5364", "#203a43"],
    icon: "🎬",
    effects: [
      createEffect({ type: "contrast", value: 1.15, enabled: true }),
      createEffect({ type: "saturation", value: 0.9, enabled: true }),
      createEffect({ type: "brightness", value: 1.05, enabled: true }),
      createEffect({ type: "sepia", value: 0.15, enabled: true }),
    ],
  },
  {
    id: "grade_teal_orange",
    name: "Teal & Orange",
    category: "cinematic",
    description: "Classic teal shadows + orange skin tones",
    preview: ["#0f4c75", "#f4845f"],
    icon: "🎭",
    effects: [
      createEffect({ type: "contrast", value: 1.2, enabled: true }),
      createEffect({ type: "saturation", value: 1.15, enabled: true }),
      createEffect({ type: "hue-rotate", value: 10, enabled: true }),
      createEffect({ type: "brightness", value: 1.02, enabled: true }),
    ],
  },
  {
    id: "grade_blockbuster",
    name: "Blockbuster",
    category: "cinematic",
    description: "High contrast, desaturated, gritty action look",
    preview: ["#1a1a2e", "#16213e"],
    icon: "💥",
    effects: [
      createEffect({ type: "contrast", value: 1.35, enabled: true }),
      createEffect({ type: "saturation", value: 0.75, enabled: true }),
      createEffect({ type: "brightness", value: 0.95, enabled: true }),
    ],
  },
  {
    id: "grade_indie",
    name: "Indie Film",
    category: "cinematic",
    description: "Soft, warm, slightly washed out indie look",
    preview: ["#d4a574", "#c9956b"],
    icon: "🎞️",
    effects: [
      createEffect({ type: "contrast", value: 0.9, enabled: true }),
      createEffect({ type: "saturation", value: 0.8, enabled: true }),
      createEffect({ type: "brightness", value: 1.1, enabled: true }),
      createEffect({ type: "sepia", value: 0.2, enabled: true }),
    ],
  },
  {
    id: "grade_scifi",
    name: "Sci-Fi",
    category: "cinematic",
    description: "Cold blue tones with high contrast",
    preview: ["#0f0c29", "#302b63"],
    icon: "🚀",
    effects: [
      createEffect({ type: "contrast", value: 1.25, enabled: true }),
      createEffect({ type: "saturation", value: 0.7, enabled: true }),
      createEffect({ type: "hue-rotate", value: -20, enabled: true }),
      createEffect({ type: "brightness", value: 0.95, enabled: true }),
    ],
  },
  {
    id: "grade_action",
    name: "Action",
    category: "cinematic",
    description: "High contrast, boosted clarity, warm highlights",
    preview: ["#f12711", "#f5af19"],
    icon: "🔥",
    effects: [
      createEffect({ type: "contrast", value: 1.4, enabled: true }),
      createEffect({ type: "saturation", value: 1.1, enabled: true }),
      createEffect({ type: "brightness", value: 1.05, enabled: true }),
    ],
  },
];

/* ─── Vintage ─── */

const vintageGrades: ColorGrade[] = [
  {
    id: "grade_film_70s",
    name: "70s Film",
    category: "vintage",
    description: "Warm, faded, grainy 1970s film stock look",
    preview: ["#c9a96e", "#8b6914"],
    icon: "📼",
    effects: [
      createEffect({ type: "sepia", value: 0.35, enabled: true }),
      createEffect({ type: "contrast", value: 0.85, enabled: true }),
      createEffect({ type: "saturation", value: 0.75, enabled: true }),
      createEffect({ type: "brightness", value: 1.1, enabled: true }),
      createEffect({ type: "hue-rotate", value: 5, enabled: true }),
    ],
  },
  {
    id: "grade_polaroid",
    name: "Polaroid",
    category: "vintage",
    description: "Classic instant camera look with warm tones",
    preview: ["#f5e6d3", "#e8c4a0"],
    icon: "📸",
    effects: [
      createEffect({ type: "contrast", value: 0.85, enabled: true }),
      createEffect({ type: "saturation", value: 0.7, enabled: true }),
      createEffect({ type: "brightness", value: 1.15, enabled: true }),
      createEffect({ type: "sepia", value: 0.25, enabled: true }),
    ],
  },
  {
    id: "grade_kodachrome",
    name: "Kodachrome",
    category: "vintage",
    description: "Rich, saturated Kodachrome slide film look",
    preview: ["#c0392b", "#e74c3c"],
    icon: "🎞️",
    effects: [
      createEffect({ type: "saturation", value: 1.35, enabled: true }),
      createEffect({ type: "contrast", value: 1.15, enabled: true }),
      createEffect({ type: "brightness", value: 1.05, enabled: true }),
      createEffect({ type: "hue-rotate", value: -5, enabled: true }),
    ],
  },
  {
    id: "grade_vhs",
    name: "VHS",
    category: "vintage",
    description: "Retro VHS tape aesthetic with color bleeding",
    preview: ["#533a71", "#6c4492"],
    icon: "📼",
    effects: [
      createEffect({ type: "contrast", value: 0.8, enabled: true }),
      createEffect({ type: "saturation", value: 0.9, enabled: true }),
      createEffect({ type: "brightness", value: 1.1, enabled: true }),
      createEffect({ type: "hue-rotate", value: 15, enabled: true }),
      createEffect({ type: "blur", value: 0.3, enabled: true }),
    ],
  },
  {
    id: "grade_faded",
    name: "Faded",
    category: "vintage",
    description: "Washed out, lifted blacks, nostalgic feel",
    preview: ["#bdc3c7", "#95a5a6"],
    icon: "🌫️",
    effects: [
      createEffect({ type: "contrast", value: 0.7, enabled: true }),
      createEffect({ type: "saturation", value: 0.6, enabled: true }),
      createEffect({ type: "brightness", value: 1.2, enabled: true }),
    ],
  },
  {
    id: "grade_noir",
    name: "Film Noir",
    category: "vintage",
    description: "Deep blacks, high contrast, classic noir",
    preview: ["#0a0a0a", "#2c2c2c"],
    icon: "🎩",
    effects: [
      createEffect({ type: "grayscale", value: 1, enabled: true }),
      createEffect({ type: "contrast", value: 1.5, enabled: true }),
      createEffect({ type: "brightness", value: 0.9, enabled: true }),
    ],
  },
];

/* ─── Artistic ─── */

const artisticGrades: ColorGrade[] = [
  {
    id: "grade_pastel",
    name: "Pastel Dream",
    category: "artistic",
    description: "Soft pastel tones, dreamy and light",
    preview: ["#ffecd2", "#fcb69f"],
    icon: "🌸",
    effects: [
      createEffect({ type: "saturation", value: 0.6, enabled: true }),
      createEffect({ type: "brightness", value: 1.2, enabled: true }),
      createEffect({ type: "contrast", value: 0.8, enabled: true }),
      createEffect({ type: "hue-rotate", value: 10, enabled: true }),
    ],
  },
  {
    id: "grade_pop_art",
    name: "Pop Art",
    category: "artistic",
    description: "Super saturated, Warhol-inspired bold colors",
    preview: ["#ff0080", "#ff8c00"],
    icon: "🎨",
    effects: [
      createEffect({ type: "saturation", value: 1.8, enabled: true }),
      createEffect({ type: "contrast", value: 1.3, enabled: true }),
      createEffect({ type: "brightness", value: 1.1, enabled: true }),
    ],
  },
  {
    id: "grade_psychedelic",
    name: "Psychedelic",
    category: "artistic",
    description: "Wild color shifts and high saturation",
    preview: ["#a855f7", "#06b6d4"],
    icon: "🌈",
    effects: [
      createEffect({ type: "saturation", value: 1.6, enabled: true }),
      createEffect({ type: "hue-rotate", value: 45, enabled: true }),
      createEffect({ type: "contrast", value: 1.2, enabled: true }),
    ],
  },
  {
    id: "grade_watercolor",
    name: "Watercolor",
    category: "artistic",
    description: "Soft, diffused watercolor painting look",
    preview: ["#a1c4fd", "#c2e9fb"],
    icon: "🖌️",
    effects: [
      createEffect({ type: "blur", value: 0.5, enabled: true }),
      createEffect({ type: "saturation", value: 0.7, enabled: true }),
      createEffect({ type: "brightness", value: 1.15, enabled: true }),
      createEffect({ type: "contrast", value: 0.85, enabled: true }),
    ],
  },
  {
    id: "grade漫画",
    name: "Comic Book",
    category: "artistic",
    description: "Bold, graphic comic book style",
    preview: ["#e74c3c", "#2c3e50"],
    icon: "💥",
    effects: [
      createEffect({ type: "saturation", value: 1.4, enabled: true }),
      createEffect({ type: "contrast", value: 1.5, enabled: true }),
      createEffect({ type: "brightness", value: 1.05, enabled: true }),
    ],
  },
];

/* ─── Natural ─── */

const naturalGrades: ColorGrade[] = [
  {
    id: "grade_golden_hour",
    name: "Golden Hour",
    category: "natural",
    description: "Warm golden light of sunset",
    preview: ["#f9a825", "#ff8f00"],
    icon: "🌅",
    effects: [
      createEffect({ type: "saturation", value: 1.1, enabled: true }),
      createEffect({ type: "brightness", value: 1.1, enabled: true }),
      createEffect({ type: "hue-rotate", value: 10, enabled: true }),
      createEffect({ type: "contrast", value: 1.05, enabled: true }),
    ],
  },
  {
    id: "grade_blue_hour",
    name: "Blue Hour",
    category: "natural",
    description: "Cool twilight tones before sunrise",
    preview: ["#1a237e", "#283593"],
    icon: "🌙",
    effects: [
      createEffect({ type: "hue-rotate", value: -20, enabled: true }),
      createEffect({ type: "saturation", value: 0.8, enabled: true }),
      createEffect({ type: "brightness", value: 0.9, enabled: true }),
      createEffect({ type: "contrast", value: 1.1, enabled: true }),
    ],
  },
  {
    id: "grade_overcast",
    name: "Overcast",
    category: "natural",
    description: "Muted, diffused light of a cloudy day",
    preview: ["#90a4ae", "#78909c"],
    icon: "☁️",
    effects: [
      createEffect({ type: "contrast", value: 0.85, enabled: true }),
      createEffect({ type: "saturation", value: 0.7, enabled: true }),
      createEffect({ type: "brightness", value: 1.05, enabled: true }),
    ],
  },
  {
    id: "grade_forest",
    name: "Forest",
    category: "natural",
    description: "Lush green tones of a deep forest",
    preview: ["#1b5e20", "#2e7d32"],
    icon: "🌲",
    effects: [
      createEffect({ type: "hue-rotate", value: 15, enabled: true }),
      createEffect({ type: "saturation", value: 1.2, enabled: true }),
      createEffect({ type: "brightness", value: 0.95, enabled: true }),
      createEffect({ type: "contrast", value: 1.1, enabled: true }),
    ],
  },
  {
    id: "grade_autumn",
    name: "Autumn",
    category: "natural",
    description: "Warm autumn colors with rich oranges",
    preview: ["#e65100", "#f57c00"],
    icon: "🍂",
    effects: [
      createEffect({ type: "hue-rotate", value: 15, enabled: true }),
      createEffect({ type: "saturation", value: 1.3, enabled: true }),
      createEffect({ type: "brightness", value: 1.05, enabled: true }),
      createEffect({ type: "contrast", value: 1.1, enabled: true }),
    ],
  },
];

/* ─── Dramatic ─── */

const dramaticGrades: ColorGrade[] = [
  {
    id: "grade_high_contrast",
    name: "High Contrast",
    category: "dramatic",
    description: "Deep blacks and bright whites",
    preview: ["#000000", "#ffffff"],
    icon: "⚡",
    effects: [
      createEffect({ type: "contrast", value: 1.6, enabled: true }),
      createEffect({ type: "brightness", value: 1.0, enabled: true }),
    ],
  },
  {
    id: "grade_bleach_bypass",
    name: "Bleach Bypass",
    category: "dramatic",
    description: "Desaturated, high-contrast film processing",
    preview: ["#37474f", "#546e7a"],
    icon: "🧪",
    effects: [
      createEffect({ type: "saturation", value: 0.4, enabled: true }),
      createEffect({ type: "contrast", value: 1.5, enabled: true }),
      createEffect({ type: "brightness", value: 0.9, enabled: true }),
    ],
  },
  {
    id: "grade_cinematic_dark",
    name: "Dark Cinematic",
    category: "dramatic",
    description: "Crushed blacks, moody atmosphere",
    preview: ["#0d1117", "#161b22"],
    icon: "🌑",
    effects: [
      createEffect({ type: "contrast", value: 1.3, enabled: true }),
      createEffect({ type: "saturation", value: 0.8, enabled: true }),
      createEffect({ type: "brightness", value: 0.8, enabled: true }),
    ],
  },
  {
    id: "grade_cross_process",
    name: "Cross Process",
    category: "dramatic",
    description: "Color shift from processing film in wrong chemicals",
    preview: ["#1b5e20", "#f57c00"],
    icon: "⚗️",
    effects: [
      createEffect({ type: "saturation", value: 1.2, enabled: true }),
      createEffect({ type: "contrast", value: 1.3, enabled: true }),
      createEffect({ type: "hue-rotate", value: 30, enabled: true }),
      createEffect({ type: "brightness", value: 1.05, enabled: true }),
    ],
  },
];

/* ─── Mono ─── */

const monoGrades: ColorGrade[] = [
  {
    id: "grade_bw_classic",
    name: "B&W Classic",
    category: "mono",
    description: "Standard black and white",
    preview: ["#000000", "#808080"],
    icon: "⬛",
    effects: [
      createEffect({ type: "grayscale", value: 1, enabled: true }),
    ],
  },
  {
    id: "grade_bw_high_key",
    name: "B&W High Key",
    category: "mono",
    description: "Bright, airy black and white",
    preview: ["#808080", "#ffffff"],
    icon: "⬜",
    effects: [
      createEffect({ type: "grayscale", value: 1, enabled: true }),
      createEffect({ type: "brightness", value: 1.2, enabled: true }),
      createEffect({ type: "contrast", value: 0.85, enabled: true }),
    ],
  },
  {
    id: "grade_bw_low_key",
    name: "B&W Low Key",
    category: "mono",
    description: "Dark, moody black and white",
    preview: ["#000000", "#404040"],
    icon: "◼️",
    effects: [
      createEffect({ type: "grayscale", value: 1, enabled: true }),
      createEffect({ type: "brightness", value: 0.8, enabled: true }),
      createEffect({ type: "contrast", value: 1.4, enabled: true }),
    ],
  },
  {
    id: "grade_sepia_tone",
    name: "Sepia Tone",
    category: "mono",
    description: "Warm brownish monochrome",
    preview: ["#704214", "#a67c52"],
    icon: "📜",
    effects: [
      createEffect({ type: "sepia", value: 0.8, enabled: true }),
      createEffect({ type: "brightness", value: 1.05, enabled: true }),
    ],
  },
  {
    id: "grade_duotone_blue",
    name: "Duotone Blue",
    category: "mono",
    description: "Two-tone blue monochrome",
    preview: ["#0d1b2a", "#1b4965"],
    icon: "🔵",
    effects: [
      createEffect({ type: "grayscale", value: 1, enabled: true }),
      createEffect({ type: "hue-rotate", value: -20, enabled: true }),
      createEffect({ type: "saturation", value: 0.8, enabled: true }),
      createEffect({ type: "contrast", value: 1.2, enabled: true }),
    ],
  },
  {
    id: "grade_duotone_red",
    name: "Duotone Red",
    category: "mono",
    description: "Two-tone red monochrome",
    preview: ["#2c0b0e", "#9b1b30"],
    icon: "🔴",
    effects: [
      createEffect({ type: "grayscale", value: 1, enabled: true }),
      createEffect({ type: "hue-rotate", value: -340, enabled: true }),
      createEffect({ type: "saturation", value: 0.8, enabled: true }),
      createEffect({ type: "contrast", value: 1.2, enabled: true }),
    ],
  },
];

/* ─── All Grading Presets ─── */

export const ALL_COLOR_GRADES: ColorGrade[] = [
  ...cinematicGrades,
  ...vintageGrades,
  ...artisticGrades,
  ...naturalGrades,
  ...dramaticGrades,
  ...monoGrades,
];

export const GRADING_CATEGORIES: { id: GradingCategory; label: string; icon: string }[] = [
  { id: "cinematic", label: "Cinematic", icon: "🎬" },
  { id: "vintage", label: "Vintage", icon: "📼" },
  { id: "artistic", label: "Artistic", icon: "🎨" },
  { id: "natural", label: "Natural", icon: "🌿" },
  { id: "dramatic", label: "Dramatic", icon: "⚡" },
  { id: "mono", label: "Monochrome", icon: "⬛" },
];

/** Convert a color grade to full Effect[] (with IDs) */
export function applyColorGrade(grade: ColorGrade): Effect[] {
  return grade.effects.map((e) => ({
    ...e,
    id: generateId("fx"),
  }));
}

/** Get grades by category */
export function getGradesByCategory(category: GradingCategory): ColorGrade[] {
  return ALL_COLOR_GRADES.filter((g) => g.category === category);
}

/** Total number of grading presets */
export const GRADE_COUNT = ALL_COLOR_GRADES.length;
