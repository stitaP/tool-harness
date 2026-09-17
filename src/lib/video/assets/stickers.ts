/* ─── stitaP Video Editor — Sticker Library ─── */

export type StickerCategory = "emoji" | "shapes" | "icons" | "arrows" | "callouts" | "decorative";

export interface StickerDef {
  id: string;
  name: string;
  category: StickerCategory;
  /** SVG path data or full SVG markup */
  svg: string;
  /** Default size in pixels */
  defaultSize: number;
  /** Can be recolored */
  tintable: boolean;
  tags: string[];
}

/* ─── Emoji Stickers (rendered as SVG outlines for clean scaling) ─── */

const emojiStickers: StickerDef[] = [
  {
    id: "emoji_star",
    name: "Star",
    category: "emoji",
    svg: `<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="#FFD700" stroke="#E6B800" stroke-width="1"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["star", "favorite", "rating"],
  },
  {
    id: "emoji_heart",
    name: "Heart",
    category: "emoji",
    svg: `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#FF4444" stroke="#CC0000" stroke-width="0.5"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["heart", "love", "like"],
  },
  {
    id: "emoji_fire",
    name: "Fire",
    category: "emoji",
    svg: `<path d="M12 23c-3.87 0-7-2.91-7-6.5 0-2.31 1.09-4.32 2.8-5.67.17-.13.53-.03.58.22.36 1.58 1.17 2.8 2.27 3.5C12.54 11.46 14 8 14 4.5c0-.3.36-.45.58-.23C18.77 6.23 19 7.5 19 9c0 1-.5 2-1 2.5.23-.01.46-.01.69-.01C19.45 11.49 21 13.62 21 16.5 21 20.09 17.87 23 14 23h-2z" fill="#FF6B00" stroke="#CC4400" stroke-width="0.5"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["fire", "hot", "trending"],
  },
  {
    id: "emoji_lightning",
    name: "Lightning",
    category: "emoji",
    svg: `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#FFD700" stroke="#CC9900" stroke-width="0.5"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["lightning", "bolt", "power", "fast"],
  },
  {
    id: "emoji_check",
    name: "Check Mark",
    category: "emoji",
    svg: `<circle cx="12" cy="12" r="10" fill="#22C55E" stroke="#16A34A" stroke-width="1"/><path d="M8 12l3 3 5-5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["check", "done", "complete", "success"],
  },
  {
    id: "emoji_cross",
    name: "Cross Mark",
    category: "emoji",
    svg: `<circle cx="12" cy="12" r="10" fill="#EF4444" stroke="#DC2626" stroke-width="1"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["cross", "no", "error", "delete"],
  },
  {
    id: "emoji_warning",
    name: "Warning",
    category: "emoji",
    svg: `<path d="M12 2L1 21h22L12 2z" fill="#F59E0B" stroke="#D97706" stroke-width="1"/><text x="12" y="18" text-anchor="middle" fill="#78350F" font-size="14" font-weight="bold">!</text>`,
    defaultSize: 64,
    tintable: true,
    tags: ["warning", "caution", "alert"],
  },
  {
    id: "emoji_info",
    name: "Info",
    category: "emoji",
    svg: `<circle cx="12" cy="12" r="10" fill="#3B82F6" stroke="#2563EB" stroke-width="1"/><text x="12" y="17" text-anchor="middle" fill="white" font-size="14" font-weight="bold">i</text>`,
    defaultSize: 64,
    tintable: true,
    tags: ["info", "information", "help"],
  },
  {
    id: "emoji_sparkle",
    name: "Sparkle",
    category: "emoji",
    svg: `<path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" fill="#A855F7" stroke="#9333EA" stroke-width="0.5"/><circle cx="6" cy="4" r="1.5" fill="#FBBF24"/><circle cx="19" cy="6" r="1" fill="#FBBF24"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["sparkle", "magic", "special", "new"],
  },
  {
    id: "emoji_thumbsup",
    name: "Thumbs Up",
    category: "emoji",
    svg: `<path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3m7-4V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" fill="#FFD700" stroke="#CC9900" stroke-width="1"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["thumbsup", "like", "good"],
  },
];

/* ─── Shape Stickers ─── */

const shapeStickers: StickerDef[] = [
  {
    id: "shape_circle_outline",
    name: "Circle Outline",
    category: "shapes",
    svg: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["circle", "outline", "ring"],
  },
  {
    id: "shape_circle_filled",
    name: "Circle Filled",
    category: "shapes",
    svg: `<circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.8"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["circle", "filled", "dot"],
  },
  {
    id: "shape_rect_outline",
    name: "Rectangle Outline",
    category: "shapes",
    svg: `<rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["rectangle", "outline", "box"],
  },
  {
    id: "shape_rect_filled",
    name: "Rectangle Filled",
    category: "shapes",
    svg: `<rect x="2" y="4" width="20" height="16" rx="2" fill="currentColor" opacity="0.8"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["rectangle", "filled"],
  },
  {
    id: "shape_rounded_rect",
    name: "Rounded Rectangle",
    category: "shapes",
    svg: `<rect x="2" y="4" width="20" height="16" rx="6" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["rounded", "rectangle", "pill"],
  },
  {
    id: "shape_diamond",
    name: "Diamond",
    category: "shapes",
    svg: `<polygon points="12,1 23,12 12,23 1,12" fill="currentColor" opacity="0.8"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["diamond", "rhombus"],
  },
  {
    id: "shape_triangle",
    name: "Triangle",
    category: "shapes",
    svg: `<polygon points="12,2 22,20 2,20" fill="currentColor" opacity="0.8"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["triangle", "play"],
  },
  {
    id: "shape_hexagon",
    name: "Hexagon",
    category: "shapes",
    svg: `<polygon points="12,1 21.5,6.5 21.5,17.5 12,23 2.5,17.5 2.5,6.5" fill="currentColor" opacity="0.8"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["hexagon"],
  },
  {
    id: "shape_star_5",
    name: "5-Point Star",
    category: "shapes",
    svg: `<polygon points="12,1 15,9 23,9 17,14 19,22 12,17 5,22 7,14 1,9 9,9" fill="currentColor" opacity="0.8"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["star", "5-point"],
  },
  {
    id: "shape_cross",
    name: "Cross",
    category: "shapes",
    svg: `<path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z" fill="currentColor" opacity="0.8"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["cross", "plus"],
  },
];

/* ─── Arrow Stickers ─── */

const arrowStickers: StickerDef[] = [
  {
    id: "arrow_right",
    name: "Right Arrow",
    category: "arrows",
    svg: `<path d="M5 12h14m-7-7l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["arrow", "right", "next"],
  },
  {
    id: "arrow_left",
    name: "Left Arrow",
    category: "arrows",
    svg: `<path d="M19 12H5m7-7l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["arrow", "left", "back"],
  },
  {
    id: "arrow_up",
    name: "Up Arrow",
    category: "arrows",
    svg: `<path d="M12 19V5m-7 7l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["arrow", "up"],
  },
  {
    id: "arrow_down",
    name: "Down Arrow",
    category: "arrows",
    svg: `<path d="M12 5v14m7-7l-7 7-7-7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["arrow", "down"],
  },
  {
    id: "arrow_curved",
    name: "Curved Arrow",
    category: "arrows",
    svg: `<path d="M4 12c0-4.42 3.58-8 8-8s8 3.58 8 8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M16 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["arrow", "curved", "return"],
  },
  {
    id: "arrow_dashed",
    name: "Dashed Arrow",
    category: "arrows",
    svg: `<path d="M5 12h14m-7-7l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["arrow", "dashed", "flow"],
  },
  {
    id: "arrow_double",
    name: "Double Arrow",
    category: "arrows",
    svg: `<path d="M5 12h14m-10-5l5 5-5 5M13 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    defaultSize: 80,
    tintable: true,
    tags: ["arrow", "double", "fast-forward"],
  },
  {
    id: "arrow_pointer",
    name: "Pointer",
    category: "arrows",
    svg: `<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["pointer", "cursor", "click"],
  },
];

/* ─── Callout Stickers ─── */

const calloutStickers: StickerDef[] = [
  {
    id: "callout_speech",
    name: "Speech Bubble",
    category: "callouts",
    svg: `<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/>`,
    defaultSize: 100,
    tintable: true,
    tags: ["speech", "bubble", "dialog", "chat"],
  },
  {
    id: "callout_thought",
    name: "Thought Bubble",
    category: "callouts",
    svg: `<ellipse cx="12" cy="8" rx="10" ry="7" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="18" r="2" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1"/><circle cx="5" cy="21" r="1.2" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="0.8"/>`,
    defaultSize: 100,
    tintable: true,
    tags: ["thought", "bubble", "thinking"],
  },
  {
    id: "callout_rect_speech",
    name: "Rectangular Callout",
    category: "callouts",
    svg: `<path d="M2 5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H7l-5 4V17H4a2 2 0 01-2-2V5z" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/>`,
    defaultSize: 100,
    tintable: true,
    tags: ["callout", "rectangular", "box"],
  },
  {
    id: "callout_tooltip",
    name: "Tooltip",
    category: "callouts",
    svg: `<rect x="1" y="1" width="22" height="12" rx="3" fill="currentColor" opacity="0.85"/><polygon points="8,13 12,18 16,13" fill="currentColor" opacity="0.85"/>`,
    defaultSize: 120,
    tintable: true,
    tags: ["tooltip", "hint", "label"],
  },
  {
    id: "callout_banner",
    name: "Banner",
    category: "callouts",
    svg: `<path d="M4 2l4 4H2l2-4zm16 0l-4 4h6l-2-4zM2 6h20v12H2z" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1"/>`,
    defaultSize: 120,
    tintable: true,
    tags: ["banner", "ribbon", "flag"],
  },
];

/* ─── Decorative Stickers ─── */

const decorativeStickers: StickerDef[] = [
  {
    id: "deco_confetti",
    name: "Confetti",
    category: "decorative",
    svg: `<rect x="3" y="2" width="3" height="8" rx="1" fill="#EF4444" transform="rotate(15 4.5 6)"/><rect x="8" y="4" width="2" height="6" rx="1" fill="#3B82F6" transform="rotate(-10 9 7)"/><rect x="13" y="1" width="3" height="7" rx="1" fill="#F59E0B" transform="rotate(25 14.5 4.5)"/><rect x="18" y="3" width="2" height="8" rx="1" fill="#22C55E" transform="rotate(-20 19 7)"/><circle cx="6" cy="16" r="2" fill="#A855F7"/><circle cx="16" cy="14" r="1.5" fill="#EC4899"/><rect x="10" y="12" width="4" height="2" rx="1" fill="#06B6D4" transform="rotate(35 12 13)"/>`,
    defaultSize: 80,
    tintable: false,
    tags: ["confetti", "celebrate", "party"],
  },
  {
    id: "deco_sparkles",
    name: "Sparkles",
    category: "decorative",
    svg: `<path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" fill="#FBBF24"/><path d="M4 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#FBBF24" opacity="0.6"/><path d="M18 16l0.75 2.25L21 19l-2.25 0.75L18 22l-0.75-2.25L15 19l2.25-0.75z" fill="#FBBF24" opacity="0.4"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["sparkles", "shine", "glitter"],
  },
  {
    id: "deco_underline",
    name: "Wavy Underline",
    category: "decorative",
    svg: `<path d="M2 8c2-2 4 2 6 0s4-2 6 0 4 2 6 0 4-2 6 0" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
    defaultSize: 120,
    tintable: true,
    tags: ["underline", "wavy", "highlight"],
  },
  {
    id: "deco_circle_frame",
    name: "Circle Frame",
    category: "decorative",
    svg: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="0.5"/>`,
    defaultSize: 100,
    tintable: true,
    tags: ["frame", "circle", "border"],
  },
  {
    id: "deco_gradient_bar",
    name: "Gradient Bar",
    category: "decorative",
    svg: `<defs><linearGradient id="grad_deco" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#6366f1"/><stop offset="50%" stop-color="#a855f7"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect x="1" y="6" width="22" height="12" rx="6" fill="url(#grad_deco)"/>`,
    defaultSize: 160,
    tintable: false,
    tags: ["gradient", "bar", "divider"],
  },
  {
    id: "deco_bracket_left",
    name: "Left Bracket",
    category: "decorative",
    svg: `<path d="M8 2v4c-3 0-5 2-5 6s2 6 5 6v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    defaultSize: 60,
    tintable: true,
    tags: ["bracket", "decorative"],
  },
  {
    id: "deco_bracket_right",
    name: "Right Bracket",
    category: "decorative",
    svg: `<path d="M16 2v4c3 0 5 2 5 6s-2 6-5 6v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    defaultSize: 60,
    tintable: true,
    tags: ["bracket", "decorative"],
  },
  {
    id: "deco_dot_pattern",
    name: "Dot Pattern",
    category: "decorative",
    svg: `<circle cx="4" cy="4" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="12" cy="4" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="20" cy="4" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="4" cy="12" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="20" cy="12" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="4" cy="20" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="12" cy="20" r="1.5" fill="currentColor" opacity="0.4"/><circle cx="20" cy="20" r="1.5" fill="currentColor" opacity="0.4"/>`,
    defaultSize: 64,
    tintable: true,
    tags: ["dots", "pattern", "grid"],
  },
];

/* ─── Icon Stickers ─── */

const iconStickers: StickerDef[] = [
  {
    id: "icon_play",
    name: "Play",
    category: "icons",
    svg: `<polygon points="5,3 19,12 5,21" fill="currentColor"/>`,
    defaultSize: 48,
    tintable: true,
    tags: ["play", "start", "video"],
  },
  {
    id: "icon_pause",
    name: "Pause",
    category: "icons",
    svg: `<rect x="5" y="3" width="4" height="18" rx="1" fill="currentColor"/><rect x="15" y="3" width="4" height="18" rx="1" fill="currentColor"/>`,
    defaultSize: 48,
    tintable: true,
    tags: ["pause", "stop"],
  },
  {
    id: "icon_volume",
    name: "Volume",
    category: "icons",
    svg: `<path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
    defaultSize: 48,
    tintable: true,
    tags: ["volume", "audio", "sound"],
  },
  {
    id: "icon_camera",
    name: "Camera",
    category: "icons",
    svg: `<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    defaultSize: 48,
    tintable: true,
    tags: ["camera", "photo", "capture", "screenshot"],
  },
  {
    id: "icon_scissors",
    name: "Scissors",
    category: "icons",
    svg: `<circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    defaultSize: 48,
    tintable: true,
    tags: ["scissors", "cut", "split", "trim"],
  },
  {
    id: "icon_crop",
    name: "Crop",
    category: "icons",
    svg: `<path d="M6 2v14a2 2 0 002 2h14M2 6h4M16 22v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    defaultSize: 48,
    tintable: true,
    tags: ["crop", "resize"],
  },
  {
    id: "icon_layers",
    name: "Layers",
    category: "icons",
    svg: `<polygon points="12,2 2,7 12,12 22,7" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="2,12 12,17 22,12" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="2,17 12,22 22,17" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    defaultSize: 48,
    tintable: true,
    tags: ["layers", "stack", "overlap"],
  },
  {
    id: "icon_magic",
    name: "Magic Wand",
    category: "icons",
    svg: `<path d="M15 4l-1 7-7 1 7 1 1 7 1-7 7-1-7-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M19 19l2 2M15 19l2 2M17 17l2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
    defaultSize: 48,
    tintable: true,
    tags: ["magic", "effect", "filter", "wand"],
  },
];

/* ─── All stickers combined ─── */

export const ALL_STICKERS: StickerDef[] = [
  ...emojiStickers,
  ...shapeStickers,
  ...arrowStickers,
  ...calloutStickers,
  ...decorativeStickers,
  ...iconStickers,
];

export const STICKER_CATEGORIES: { id: StickerCategory; label: string; icon: string }[] = [
  { id: "emoji", label: "Emoji", icon: "⭐" },
  { id: "shapes", label: "Shapes", icon: "🔷" },
  { id: "arrows", label: "Arrows", icon: "➡️" },
  { id: "callouts", label: "Callouts", icon: "💬" },
  { id: "icons", label: "Icons", icon: "🎬" },
  { id: "decorative", label: "Decorative", icon: "✨" },
];

/** Get a sticker SVG with optional color replacement */
export function renderStickerSVG(sticker: StickerDef, color = "#ffffff", size?: number): string {
  const s = size ?? sticker.defaultSize;
  const svgContent = sticker.tintable
    ? sticker.svg.replace(/currentColor/g, color)
    : sticker.svg;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${s}" height="${s}">${svgContent}</svg>`;
}

/** Search stickers by tag or name */
export function searchStickers(query: string): StickerDef[] {
  const q = query.toLowerCase();
  return ALL_STICKERS.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.tags.some((t) => t.includes(q))
  );
}

/** Get stickers by category */
export function getStickersByCategory(category: StickerCategory): StickerDef[] {
  return ALL_STICKERS.filter((s) => s.category === category);
}
