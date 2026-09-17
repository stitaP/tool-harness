/* ─── stitaP Video Editor — Core Data Model ─── */

/** Unique ID type for editor entities */
export type ClipId = string;
export type TrackId = string;
export type EffectId = string;
export type TransitionId = string;
export type TextOverlayId = string;
export type ProjectId = string;

/** Supported media types */
export type MediaType = "video" | "audio" | "image";
export type TrackKind = "video" | "audio" | "text" | "sticker";

/** Time in seconds (float) */
export type TimeSec = number;

/** Duration in seconds (float) */
export type DurationSec = number;

/** Frame number (integer) */
export type FrameNumber = number;

/* ─── Media Source ─── */

/** Editor media source — renamed to avoid DOM MediaSource collision */
export type EditorMediaSource = {
  id: string;
  name: string;
  type: MediaType;
  /** Blob URL or data URL for local files */
  url: string;
  /** Duration in seconds (populated after decode) */
  duration: DurationSec;
  /** Width in pixels (for video/image) */
  width?: number;
  /** Height in pixels (for video/image) */
  height?: number;
  /** Frame rate (for video) */
  fps?: number;
  /** Audio sample rate */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Original file name */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** Raw file size in bytes */
  size: number;
};

/* ─── Effects ─── */

export type EffectType =
  | "brightness"
  | "contrast"
  | "saturation"
  | "blur"
  | "grayscale"
  | "sepia"
  | "hue-rotate"
  | "speed"
  | "reverse"
  | "crop";

export interface Effect {
  id: EffectId;
  type: EffectType;
  /** 0..2 for brightness, contrast, saturation; 0..20 for blur; 0..360 for hue; 0.1..10 for speed */
  value: number;
  enabled: boolean;
  /** For crop: { x, y, width, height } as percentages 0..100 */
  cropRect?: { x: number; y: number; w: number; h: number };
}

/* ─── Text Overlays ─── */

export interface TextOverlay {
  id: TextOverlayId;
  text: string;
  /** Start time relative to clip start */
  startOffset: DurationSec;
  /** Duration of the text overlay */
  duration: DurationSec;
  /** Position as percentage 0..100 */
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  shadow: boolean;
  alignment: "left" | "center" | "right";
}

/* ─── Sticker Overlay ─── */

export type StickerOverlayId = string;

export interface StickerOverlay {
  id: StickerOverlayId;
  /** Sticker definition ID from the asset library */
  stickerId: string;
  /** SVG markup for rendering */
  svg: string;
  /** Start time relative to clip start */
  startOffset: DurationSec;
  /** Duration of the overlay */
  duration: DurationSec;
  /** Position as percentage 0..100 */
  x: number;
  y: number;
  /** Size in pixels */
  size: number;
  /** Rotation in degrees */
  rotation: number;
  /** Opacity 0..1 */
  opacity: number;
  /** Color tint (hex) */
  color: string;
}

/* ─── Audio Overlay ─── */

export type AudioOverlayId = string;

export interface AudioOverlay {
  id: AudioOverlayId;
  /** Audio asset ID from the library */
  audioAssetId: string;
  /** Start time relative to project */
  startOffset: DurationSec;
  /** Volume 0..1 */
  volume: number;
  /** Is muted? */
  muted: boolean;
  /** Fade in duration */
  fadeIn: DurationSec;
  /** Fade out duration */
  fadeOut: DurationSec;
}

/* ─── Clip ─── */

export interface Clip {
  id: ClipId;
  /** Reference to a media source */
  sourceId: string;
  type: MediaType;
  /** Start position on the timeline (in seconds from project start) */
  timelineStart: TimeSec;
  /** Duration on timeline */
  duration: DurationSec;
  /** Trim start: offset into the source media (in seconds) */
  sourceStart: TimeSec;
  /** Effective duration (may differ from source duration due to trim/speed) */
  sourceDuration: DurationSec;
  /** Volume 0..1 */
  volume: number;
  /** Effects applied to this clip */
  effects: Effect[];
  /** Text overlays on this clip */
  textOverlays: TextOverlay[];
  /** Sticker overlays on this clip */
  stickerOverlays: StickerOverlay[];
  /** Opacity 0..1 */
  opacity: number;
  /** Clip display color in timeline */
  color: string;
  /** Is clip muted? */
  muted: boolean;
  /** Is clip locked? */
  locked: boolean;
}

/* ─── Transition ─── */

export type TransitionType =
  | "crossfade"
  | "dissolve"
  | "wipe-left"
  | "wipe-right"
  | "wipe-up"
  | "wipe-down"
  | "slide-left"
  | "slide-right"
  | "fade-to-black"
  | "fade-to-white";

export interface Transition {
  id: TransitionId;
  type: TransitionType;
  /** Duration of the transition in seconds */
  duration: DurationSec;
  /** The clip ID that this transition is attached to */
  clipId: ClipId;
}

/* ─── Track ─── */

export interface Track {
  id: TrackId;
  name: string;
  kind: TrackKind;
  clips: Clip[];
  transitions: Transition[];
  muted: boolean;
  volume: number;
  visible: boolean;
  locked: boolean;
  color: string;
}

/* ─── Project ─── */

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  sampleRate: number;
}

export interface VideoProject {
  id: ProjectId;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  mediaSources: EditorMediaSource[];
  tracks: Track[];
  playheadPosition: TimeSec;
  duration: DurationSec;
  undoStack: VideoProject[];
  redoStack: VideoProject[];
}

/* ─── Editor State (UI) ─── */

export interface EditorState {
  project: VideoProject;
  selectedClipIds: ClipId[];
  selectedTrackId: TrackId | null;
  timelineZoom: number;
  timelineScroll: TimeSec;
  isPlaying: boolean;
  previewScale: number;
  activeTool: EditorTool;
  dragState: DragState | null;
  exportProgress: number | null;
}

export type EditorTool =
  | "select"
  | "trim-start"
  | "trim-end"
  | "split"
  | "hand";

export interface DragState {
  type: "move-clip" | "trim-start" | "trim-end" | "resize-transition" | "scrub-playhead";
  clipId?: ClipId;
  transitionId?: TransitionId;
  startX: number;
  startValue: number;
  currentValue: number;
}

/* ─── Export ─── */

export type ExportFormat = "webm" | "mp4";
export type ExportQuality = "low" | "medium" | "high" | "ultra";

export interface ExportSettings {
  format: ExportFormat;
  quality: ExportQuality;
  width: number;
  height: number;
  fps: number;
  audio: boolean;
}

export interface ExportProgress {
  stage: "preparing" | "encoding" | "muxing" | "finalizing" | "done" | "error";
  percent: number;
  currentFrame: number;
  totalFrames: number;
  error?: string;
  outputUrl?: string;
  outputSize?: number;
}

/* ─── Utility Functions ─── */

let _nextId = 1;
export function generateId(prefix = "v"): string {
  return `${prefix}_${Date.now().toString(36)}_${(_nextId++).toString(36)}`;
}

export function createDefaultProject(name = "Untitled Project"): VideoProject {
  const now = Date.now();
  return {
    id: generateId("proj"),
    name,
    createdAt: now,
    updatedAt: now,
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      backgroundColor: "#000000",
      sampleRate: 48000,
    },
    mediaSources: [],
    tracks: [
      {
        id: "track_video_1",
        name: "Video 1",
        kind: "video",
        clips: [],
        transitions: [],
        muted: false,
        volume: 1,
        visible: true,
        locked: false,
        color: "#6366f1",
      },
      {
        id: "track_audio_1",
        name: "Audio 1",
        kind: "audio",
        clips: [],
        transitions: [],
        muted: false,
        volume: 1,
        visible: true,
        locked: false,
        color: "#22c55e",
      },
      {
        id: "track_text_1",
        name: "Titles",
        kind: "text",
        clips: [],
        transitions: [],
        muted: false,
        volume: 1,
        visible: true,
        locked: false,
        color: "#f59e0b",
      },
      {
        id: "track_sticker_1",
        name: "Stickers",
        kind: "sticker",
        clips: [],
        transitions: [],
        muted: false,
        volume: 1,
        visible: true,
        locked: false,
        color: "#f43f5e",
      },
    ],
    playheadPosition: 0,
    duration: 0,
    undoStack: [],
    redoStack: [],
  };
}

export function computeProjectDuration(tracks: Track[]): DurationSec {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.timelineStart + clip.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

export function formatTime(sec: TimeSec): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const QUALITY_PRESETS: Record<ExportQuality, { videoBitrate: number; audioBitrate: number }> = {
  low: { videoBitrate: 1_000_000, audioBitrate: 64_000 },
  medium: { videoBitrate: 4_000_000, audioBitrate: 128_000 },
  high: { videoBitrate: 8_000_000, audioBitrate: 192_000 },
  ultra: { videoBitrate: 20_000_000, audioBitrate: 320_000 },
};

export const TRANSITION_PRESETS: { type: TransitionType; label: string; icon: string }[] = [
  { type: "crossfade", label: "Cross Fade", icon: "🔄" },
  { type: "dissolve", label: "Dissolve", icon: "✨" },
  { type: "wipe-left", label: "Wipe Left", icon: "◀" },
  { type: "wipe-right", label: "Wipe Right", icon: "▶" },
  { type: "wipe-up", label: "Wipe Up", icon: "🔼" },
  { type: "wipe-down", label: "Wipe Down", icon: "🔽" },
  { type: "slide-left", label: "Slide Left", icon: "⬅" },
  { type: "slide-right", label: "Slide Right", icon: "➡" },
  { type: "fade-to-black", label: "Fade to Black", icon: "⬛" },
  { type: "fade-to-white", label: "Fade to White", icon: "⬜" },
];

export const EFFECT_PRESETS: { type: EffectType; label: string; icon: string; defaultValue: number }[] = [
  { type: "brightness", label: "Brightness", icon: "☀️", defaultValue: 1 },
  { type: "contrast", label: "Contrast", icon: "◐", defaultValue: 1 },
  { type: "saturation", label: "Saturation", icon: "🎨", defaultValue: 1 },
  { type: "blur", label: "Blur", icon: "💧", defaultValue: 0 },
  { type: "grayscale", label: "Grayscale", icon: "⬛", defaultValue: 1 },
  { type: "sepia", label: "Sepia", icon: "🟤", defaultValue: 1 },
  { type: "hue-rotate", label: "Hue Rotate", icon: "🌈", defaultValue: 0 },
  { type: "speed", label: "Speed", icon: "⚡", defaultValue: 1 },
];

export const CLIP_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1",
];
