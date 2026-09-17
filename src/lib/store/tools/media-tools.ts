/**
 * Media Generation Tools — Render video, synthesize speech, compose audio, generate stickers
 *
 * All tools are self-contained with no external dependencies.
 * Audio/video generation uses Canvas and Web Audio APIs.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";

// ─── Tool Manifests ───────────────────────────────────────────────────────────

export const RENDER_VIDEO_MANIFEST: ToolManifest = {
  id: "media.renderVideo",
  name: "Render Video",
  description: "Render a sequence of scenes into a video",
  longDescription:
    "Takes an array of scene definitions (text, images, overlays) and renders them into a video using Canvas compositing and MediaRecorder. Supports transitions, captions, and background music.",
  category: "export",
  subcategory: "video",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["render", "video", "canvas", "composite", "export"],
  icon: "Film",
  color: "#ef4444",
  parameters: [
    {
      name: "scenes",
      type: "array",
      description: "Array of scene objects {text, background, duration, overlays}",
      required: true,
    },
    {
      name: "width",
      type: "number",
      description: "Video width in pixels",
      required: false,
      default: 1920,
    },
    {
      name: "height",
      type: "number",
      description: "Video height in pixels",
      required: false,
      default: 1080,
    },
    {
      name: "fps",
      type: "number",
      description: "Frame rate",
      required: false,
      default: 30,
    },
    {
      name: "format",
      type: "enum",
      description: "Output format",
      required: false,
      default: "webm",
      enum: ["webm", "gif"],
    },
  ],
  capabilities: [
    {
      name: "renderVideo",
      description: "Render scenes into a video file",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 6200,
  rating: 4.6,
  ratingCount: 134,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const SYNTHESIZE_SPEECH_MANIFEST: ToolManifest = {
  id: "media.synthesizeSpeech",
  name: "Synthesize Speech",
  description: "Generate speech audio from text using formant synthesis",
  longDescription:
    "Converts text to speech using a pure-Web-Audio formant synthesizer. No external models or APIs needed. Supports multiple voice presets (narrator, female, male, child), adjustable speed, pitch, and volume.",
  category: "audio",
  subcategory: "synthesis",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["tts", "speech", "synthesis", "voice", "audio", "formant"],
  icon: "Mic",
  color: "#8b5cf6",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "Text to synthesize",
      required: true,
    },
    {
      name: "voice",
      type: "enum",
      description: "Voice preset",
      required: false,
      default: "narrator",
      enum: ["narrator", "female", "male", "child"],
    },
    {
      name: "speed",
      type: "number",
      description: "Speech speed (0.5 = half speed, 2 = double)",
      required: false,
      default: 1,
      min: 0.3,
      max: 3,
    },
    {
      name: "pitch",
      type: "number",
      description: "Pitch shift (0.5 = lower, 2 = higher)",
      required: false,
      default: 1,
      min: 0.3,
      max: 3,
    },
    {
      name: "volume",
      type: "number",
      description: "Volume (0-1)",
      required: false,
      default: 0.8,
      min: 0,
      max: 1,
    },
  ],
  capabilities: [
    {
      name: "synthesizeSpeech",
      description: "Generate speech from text (no API needed)",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 8900,
  rating: 4.7,
  ratingCount: 213,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const COMPOSE_AUDIO_MANIFEST: ToolManifest = {
  id: "media.composeAudio",
  name: "Compose Audio Track",
  description: "Compose a multi-layer audio track with music, SFX, and narration",
  longDescription:
    "Mixes multiple audio layers into a single track. Supports background music (corporate, upbeat, calm, dramatic, minimal), sound effects (whoosh, click, pop, success, error), and narration overlay with volume control and fade in/out.",
  category: "audio",
  subcategory: "mixing",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["compose", "mix", "audio", "music", "sfx", "narration"],
  icon: "Music",
  color: "#06b6d4",
  parameters: [
    {
      name: "layers",
      type: "array",
      description: "Audio layers [{type, startTime, duration, volume}]",
      required: true,
    },
    {
      name: "duration",
      type: "number",
      description: "Total track duration in seconds",
      required: false,
      default: 60,
    },
    {
      name: "sampleRate",
      type: "number",
      description: "Output sample rate",
      required: false,
      default: 44100,
    },
    {
      name: "fadeIn",
      type: "number",
      description: "Fade in duration in seconds",
      required: false,
      default: 0,
    },
    {
      name: "fadeOut",
      type: "number",
      description: "Fade out duration in seconds",
      required: false,
      default: 0,
    },
  ],
  capabilities: [
    {
      name: "composeAudio",
      description: "Mix multiple audio layers into one track",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 5400,
  rating: 4.5,
  ratingCount: 98,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const GENERATE_STICKER_MANIFEST: ToolManifest = {
  id: "media.generateSticker",
  name: "Generate Sticker",
  description: "Generate an SVG sticker for video overlays",
  longDescription:
    "Creates SVG sticker graphics programmatically. Supports emoji, shapes, arrows, callouts, decorative elements, and custom patterns. All output is vector SVG that can be scaled without quality loss.",
  category: "video",
  subcategory: "assets",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["sticker", "svg", "emoji", "shape", "arrow", "overlay"],
  icon: "Smile",
  color: "#f59e0b",
  parameters: [
    {
      name: "type",
      type: "enum",
      description: "Sticker type",
      required: true,
      enum: [
        "emoji",
        "shape",
        "arrow",
        "callout",
        "decoration",
        "number",
        "highlight",
      ],
    },
    {
      name: "variant",
      type: "string",
      description: "Specific variant (e.g., 'star', 'heart', 'circle', 'right-arrow')",
      required: false,
      default: "default",
    },
    {
      name: "size",
      type: "number",
      description: "Size in pixels",
      required: false,
      default: 64,
    },
    {
      name: "color",
      type: "string",
      description: "Primary color (hex)",
      required: false,
      default: "#ef4444",
    },
    {
      name: "backgroundColor",
      type: "string",
      description: "Background color (hex, empty for transparent)",
      required: false,
      default: "",
    },
    {
      name: "label",
      type: "string",
      description: "Text label for number/highlight types",
      required: false,
    },
  ],
  capabilities: [
    {
      name: "generateSticker",
      description: "Create SVG stickers programmatically",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 4800,
  rating: 4.4,
  ratingCount: 87,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const GENERATE_THUMBNAIL_MANIFEST: ToolManifest = {
  id: "media.generateThumbnail",
  name: "Generate Thumbnail",
  description: "Generate a video thumbnail with text and styling",
  longDescription:
    "Creates a styled thumbnail image from a video frame or custom background. Supports text overlays, gradient backgrounds, border effects, and multiple aspect ratios (16:9, 4:3, 1:1).",
  category: "video",
  subcategory: "assets",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["thumbnail", "preview", "image", "cover", "poster"],
  icon: "ImageIcon",
  color: "#10b981",
  parameters: [
    {
      name: "title",
      type: "string",
      description: "Thumbnail title text",
      required: true,
    },
    {
      name: "width",
      type: "number",
      description: "Thumbnail width",
      required: false,
      default: 1280,
    },
    {
      name: "height",
      type: "number",
      description: "Thumbnail height",
      required: false,
      default: 720,
    },
    {
      name: "background",
      type: "enum",
      description: "Background style",
      required: false,
      default: "gradient",
      enum: ["gradient", "solid", "blur", "image"],
    },
    {
      name: "backgroundImage",
      type: "string",
      description: "Background image URL/imageData (for 'image' background)",
      required: false,
    },
    {
      name: "titleColor",
      type: "string",
      description: "Title text color",
      required: false,
      default: "#ffffff",
    },
    {
      name: "titleSize",
      type: "number",
      description: "Title font size in pixels",
      required: false,
      default: 64,
    },
    {
      name: "gradientColors",
      type: "array",
      description: "Gradient colors for gradient background",
      required: false,
      default: ["#667eea", "#764ba2"],
    },
  ],
  capabilities: [
    {
      name: "generateThumbnail",
      description: "Create styled video thumbnails",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 4200,
  rating: 4.5,
  ratingCount: 76,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const GENERATE_WAVEFORM_MANIFEST: ToolManifest = {
  id: "media.generateWaveform",
  name: "Generate Waveform",
  description: "Generate a visual waveform visualization for audio",
  longDescription:
    "Creates an SVG waveform visualization from audio sample data. Useful for audio editing UIs and video overlays showing audio levels.",
  category: "audio",
  subcategory: "visualization",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["waveform", "audio", "visualization", "svg", "bars"],
  icon: "AudioLines",
  color: "#a855f7",
  parameters: [
    {
      name: "samples",
      type: "array",
      description: "Audio sample data (array of numbers 0-1)",
      required: true,
    },
    {
      name: "width",
      type: "number",
      description: "SVG width in pixels",
      required: false,
      default: 800,
    },
    {
      name: "height",
      type: "number",
      description: "SVG height in pixels",
      required: false,
      default: 128,
    },
    {
      name: "color",
      type: "string",
      description: "Waveform color",
      required: false,
      default: "#8b5cf6",
    },
    {
      name: "style",
      type: "enum",
      description: "Waveform style",
      required: false,
      default: "bars",
      enum: ["bars", "line", "mirror"],
    },
  ],
  capabilities: [
    {
      name: "generateWaveform",
      description: "Create SVG waveform visualizations",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 3100,
  rating: 4.3,
  ratingCount: 56,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

// ─── All Media Tool Manifests ─────────────────────────────────────────────────

export const MEDIA_TOOLS: ToolManifest[] = [
  RENDER_VIDEO_MANIFEST,
  SYNTHESIZE_SPEECH_MANIFEST,
  COMPOSE_AUDIO_MANIFEST,
  GENERATE_STICKER_MANIFEST,
  GENERATE_THUMBNAIL_MANIFEST,
  GENERATE_WAVEFORM_MANIFEST,
];

// ─── Implementation Functions ─────────────────────────────────────────────────

/**
 * Generate SVG sticker content
 */
export function generateStickerSVG(
  type: string,
  variant: string = "default",
  size: number = 64,
  color: string = "#ef4444",
  bgColor: string = "",
  label?: string,
): string {
  const half = size / 2;

  const bgRect = bgColor
    ? `<rect width="${size}" height="${size}" rx="${size * 0.15}" fill="${bgColor}"/>`
    : "";

  switch (type) {
    case "emoji":
      return variant === "star"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<polygon points="${half},${size * 0.1} ${half * 1.3},${size * 0.4} ${size * 0.9},${size * 0.45} ${half * 1.5},${size * 0.7} ${size * 0.6},${size * 0.95} ${half},${size * 0.75} ${size * 0.4},${size * 0.95} ${size * 0.15},${size * 0.7} ${half * 0.7},${size * 0.45} ${half * 0.7},${size * 0.4}" fill="${color}"/></svg>`
        : variant === "heart"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<path d="M${half},${size * 0.85} C${size * 0.25},${size * 0.6} ${size * 0.05},${size * 0.35} ${half * 0.5},${size * 0.25} ${half * 0.7},${size * 0.15} ${half},${size * 0.3} ${half},${size * 0.3} ${half},${size * 0.3} ${half * 1.3},${size * 0.15} ${size * 0.95},${size * 0.35} ${size * 0.75},${size * 0.6} Z" fill="${color}"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<circle cx="${half}" cy="${half}" r="${half * 0.7}" fill="${color}"/></svg>`;

    case "shape":
      return variant === "circle"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<circle cx="${half}" cy="${half}" r="${half * 0.75}" fill="none" stroke="${color}" stroke-width="${size * 0.04}"/></svg>`
        : variant === "diamond"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<polygon points="${half},${size * 0.15} ${size * 0.85},${half} ${half},${size * 0.85} ${size * 0.15},${half}" fill="none" stroke="${color}" stroke-width="${size * 0.04}"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<rect x="${size * 0.15}" y="${size * 0.15}" width="${size * 0.7}" height="${size * 0.7}" rx="${size * 0.05}" fill="none" stroke="${color}" stroke-width="${size * 0.04}"/></svg>`;

    case "arrow":
      return variant === "down"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<path d="M${half},${size * 0.15} L${half},${size * 0.7} M${size * 0.3},${size * 0.55} L${half},${size * 0.8} L${size * 0.7},${size * 0.55}" fill="none" stroke="${color}" stroke-width="${size * 0.06}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<path d="M${size * 0.15},${half} L${size * 0.7},${half} M${size * 0.55},${size * 0.3} L${size * 0.8},${half} L${size * 0.55},${size * 0.7}" fill="none" stroke="${color}" stroke-width="${size * 0.06}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    case "callout":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size * 2} ${size * 1.2}"><rect x="0" y="0" width="${size * 2}" height="${size * 0.9}" rx="${size * 0.1}" fill="${color}"/><polygon points="${half * 0.8},${size * 0.9} ${half * 1.2},${size * 0.9} ${half * 0.9},${size * 1.15}" fill="${color}"/></svg>`;

    case "number":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><circle cx="${half}" cy="${half}" r="${half * 0.8}" fill="${color}"/><text x="${half}" y="${half * 1.15}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${half * 0.9}" font-weight="bold" fill="white">${label || "1"}</text></svg>`;

    case "highlight":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size * 3} ${size}"><rect x="0" y="0" width="${size * 3}" height="${size}" rx="${size * 0.1}" fill="${color}" opacity="0.3"/><text x="${half * 1.5}" y="${half * 1.2}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${half * 0.6}" font-weight="bold" fill="${color}">${label || "Highlight"}</text></svg>`;

    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${bgRect}<circle cx="${half}" cy="${half}" r="${half * 0.6}" fill="${color}"/></svg>`;
  }
}

/**
 * Generate waveform SVG from sample data
 */
export function generateWaveformSVG(
  samples: number[],
  width: number = 800,
  height: number = 128,
  color: string = "#8b5cf6",
  style: string = "bars",
): string {
  const barCount = Math.min(samples.length, 200);
  const step = Math.floor(samples.length / barCount);
  const barWidth = width / barCount;
  const gap = barWidth * 0.2;

  if (style === "line") {
    const points = samples
      .filter((_, i) => i % step === 0)
      .map((v, i) => `${(i / barCount) * width},${height - v * height * 0.9}`)
      .join(" ");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }

  if (style === "mirror") {
    const bars = samples
      .filter((_, i) => i % step === 0)
      .map((v, i) => {
        const x = i * barWidth + gap / 2;
        const h = v * height * 0.8;
        const bw = barWidth - gap;
        return `<rect x="${x}" y="${height / 2 - h / 2}" width="${bw}" height="${h}" rx="1" fill="${color}" opacity="0.8"/>`;
      })
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="${color}" stroke-width="1" opacity="0.3"/>${bars}</svg>`;
  }

  // Default: bars
  const bars = samples
    .filter((_, i) => i % step === 0)
    .map((v, i) => {
      const x = i * barWidth + gap / 2;
      const h = v * height * 0.9;
      const bw = barWidth - gap;
      return `<rect x="${x}" y="${height - h}" width="${bw}" height="${h}" rx="1" fill="${color}" opacity="0.8"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${bars}</svg>`;
}

/**
 * Generate thumbnail SVG
 */
export function generateThumbnailSVG(
  title: string,
  width: number = 1280,
  height: number = 720,
  bgColor: string = "#667eea",
  bgColor2: string = "#764ba2",
  titleColor: string = "#ffffff",
  titleSize: number = 64,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgColor}"/>
      <stop offset="100%" stop-color="${bgColor2}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <text x="${width / 2}" y="${height / 2 + titleSize * 0.35}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${titleSize}" font-weight="bold" fill="${titleColor}">${escapeXml(title)}</text>
</svg>`;
}

/** Escape XML special characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
