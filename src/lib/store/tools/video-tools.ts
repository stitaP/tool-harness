/**
 * Video Helper Tools — Record, annotate, capture frames, add overlays, export
 *
 * These tools help LLMs and SLMs create video tutorials by providing
 * programmatic access to video editing operations.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";

// ─── Tool Manifests ───────────────────────────────────────────────────────────

export const RECORD_MANIFEST: ToolManifest = {
  id: "video.record",
  name: "Record Screen",
  description: "Start or stop screen recording",
  longDescription:
    "Controls screen recording via the browser's MediaRecorder API. Supports recording with audio, webcam overlay, and custom frame rates. Output as WebM.",
  category: "video",
  subcategory: "recording",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["record", "screen", "video", "webm", "mediarecorder"],
  icon: "Video",
  color: "#ef4444",
  parameters: [
    {
      name: "action",
      type: "enum",
      description: "Start or stop recording",
      required: true,
      enum: ["start", "stop"],
    },
    {
      name: "includeAudio",
      type: "boolean",
      description: "Include system audio",
      required: false,
      default: true,
    },
    {
      name: "includeWebcam",
      type: "boolean",
      description: "Include webcam overlay",
      required: false,
      default: false,
    },
    {
      name: "frameRate",
      type: "number",
      description: "Target frame rate",
      required: false,
      default: 30,
      min: 15,
      max: 60,
    },
    {
      name: "maxDuration",
      type: "number",
      description: "Max recording duration in seconds",
      required: false,
      default: 600,
    },
  ],
  capabilities: [
    {
      name: "record",
      description: "Record screen with audio and webcam",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 8900,
  rating: 4.7,
  ratingCount: 198,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const ANNOTATE_MANIFEST: ToolManifest = {
  id: "video.annotate",
  name: "Annotate Frame",
  description: "Add annotations to the current video frame",
  longDescription:
    "Adds text, shapes, arrows, highlights, and blur regions to the current video frame. Annotations are rendered as SVG overlays and composited into the final output.",
  category: "video",
  subcategory: "editing",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["annotate", "overlay", "text", "arrow", "highlight", "blur"],
  icon: "PenTool",
  color: "#f59e0b",
  parameters: [
    {
      name: "type",
      type: "enum",
      description: "Annotation type",
      required: true,
      enum: ["text", "arrow", "rect", "circle", "highlight", "blur", "number"],
    },
    {
      name: "x",
      type: "number",
      description: "X position",
      required: true,
    },
    {
      name: "y",
      type: "number",
      description: "Y position",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "Text content (for text/number types)",
      required: false,
    },
    {
      name: "width",
      type: "number",
      description: "Width (for rect/highlight/blur)",
      required: false,
    },
    {
      name: "height",
      type: "number",
      description: "Height (for rect/highlight/blur)",
      required: false,
    },
    {
      name: "color",
      type: "string",
      description: "Annotation color (hex)",
      required: false,
      default: "#ef4444",
    },
    {
      name: "endX",
      type: "number",
      description: "End X (for arrow type)",
      required: false,
    },
    {
      name: "endY",
      type: "number",
      description: "End Y (for arrow type)",
      required: false,
    },
    {
      name: "fontSize",
      type: "number",
      description: "Font size in pixels",
      required: false,
      default: 16,
    },
    {
      name: "startTime",
      type: "number",
      description: "Start time in seconds",
      required: false,
      default: 0,
    },
    {
      name: "endTime",
      type: "number",
      description: "End time in seconds (-1 for forever)",
      required: false,
      default: -1,
    },
  ],
  capabilities: [
    {
      name: "annotate",
      description: "Add visual annotations to video frames",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 7200,
  rating: 4.5,
  ratingCount: 156,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const CAPTURE_FRAME_MANIFEST: ToolManifest = {
  id: "video.captureFrame",
  name: "Capture Frame",
  description: "Capture a single frame from the video as an image",
  longDescription:
    "Extracts a single frame from a video at a specific timestamp. Returns the frame as a PNG Blob. Useful for creating thumbnails, preview images, or step-by-step documentation.",
  category: "video",
  subcategory: "extraction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["frame", "capture", "thumbnail", "preview", "extract"],
  icon: "Frame",
  color: "#06b6d4",
  parameters: [
    {
      name: "timestamp",
      type: "number",
      description: "Time in seconds to capture the frame",
      required: false,
      default: 0,
    },
    {
      name: "format",
      type: "enum",
      description: "Output format",
      required: false,
      default: "png",
      enum: ["png", "jpeg", "webp"],
    },
    {
      name: "quality",
      type: "number",
      description: "Quality (1-100, for jpeg/webp)",
      required: false,
      default: 95,
    },
    {
      name: "scale",
      type: "number",
      description: "Scale factor (1 = original, 0.5 = half)",
      required: false,
      default: 1,
      min: 0.1,
      max: 2,
    },
  ],
  capabilities: [
    {
      name: "captureFrame",
      description: "Extract individual frames from video",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 6800,
  rating: 4.6,
  ratingCount: 134,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const ADD_OVERLAY_MANIFEST: ToolManifest = {
  id: "video.addOverlay",
  name: "Add Overlay",
  description: "Add an image, text, or sticker overlay to the video",
  longDescription:
    "Places a visual overlay on the video canvas. Supports images, text, stickers (from the stitaP sticker library), watermarks, and logo overlays with configurable position, opacity, and animation.",
  category: "video",
  subcategory: "editing",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["overlay", "sticker", "logo", "watermark", "text", "image"],
  icon: "Layers",
  color: "#8b5cf6",
  parameters: [
    {
      name: "type",
      type: "enum",
      description: "Overlay type",
      required: true,
      enum: ["text", "image", "sticker", "watermark", "logo"],
    },
    {
      name: "content",
      type: "string",
      description: "Text content or sticker ID",
      required: false,
    },
    {
      name: "imageUrl",
      type: "string",
      description: "Image URL (for image/watermark/logo types)",
      required: false,
    },
    {
      name: "x",
      type: "number",
      description: "X position (0-1 normalized)",
      required: false,
      default: 0.5,
    },
    {
      name: "y",
      type: "number",
      description: "Y position (0-1 normalized)",
      required: false,
      default: 0.5,
    },
    {
      name: "scale",
      type: "number",
      description: "Scale factor",
      required: false,
      default: 1,
    },
    {
      name: "opacity",
      type: "number",
      description: "Opacity (0-1)",
      required: false,
      default: 1,
    },
    {
      name: "startTime",
      type: "number",
      description: "Start time in seconds",
      required: false,
      default: 0,
    },
    {
      name: "endTime",
      type: "number",
      description: "End time in seconds (-1 for forever)",
      required: false,
      default: -1,
    },
    {
      name: "animation",
      type: "enum",
      description: "Entrance animation",
      required: false,
      default: "none",
      enum: ["none", "fadeIn", "scaleUp", "slideLeft", "slideUp"],
    },
  ],
  capabilities: [
    {
      name: "overlay",
      description: "Add visual overlays to video",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 6100,
  rating: 4.4,
  ratingCount: 123,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const EXPORT_VIDEO_MANIFEST: ToolManifest = {
  id: "video.export",
  name: "Export Video",
  description: "Export the edited video to a file",
  longDescription:
    "Renders the timeline and exports the final video. Supports WebM (default, no dependencies), MP4 (via browser codec), and GIF export. Includes all overlays, annotations, and audio tracks.",
  category: "export",
  subcategory: "video",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["export", "video", "webm", "mp4", "gif", "render"],
  icon: "Download",
  color: "#10b981",
  parameters: [
    {
      name: "format",
      type: "enum",
      description: "Export format",
      required: false,
      default: "webm",
      enum: ["webm", "mp4", "gif"],
    },
    {
      name: "quality",
      type: "number",
      description: "Export quality (1-100)",
      required: false,
      default: 90,
    },
    {
      name: "startFrame",
      type: "number",
      description: "Start frame number",
      required: false,
      default: 0,
    },
    {
      name: "endFrame",
      type: "number",
      description: "End frame number (-1 for all)",
      required: false,
      default: -1,
    },
    {
      name: "fps",
      type: "number",
      description: "Output frame rate",
      required: false,
      default: 30,
    },
    {
      name: "width",
      type: "number",
      description: "Output width in pixels",
      required: false,
      default: 1920,
    },
    {
      name: "height",
      type: "number",
      description: "Output height in pixels",
      required: false,
      default: 1080,
    },
  ],
  capabilities: [
    {
      name: "export",
      description: "Export video in multiple formats",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 9500,
  rating: 4.8,
  ratingCount: 234,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const ADD_CAPTION_MANIFEST: ToolManifest = {
  id: "video.addCaption",
  name: "Add Caption",
  description: "Add subtitles or captions to the video",
  longDescription:
    "Adds time-synced captions/subtitles to the video. Supports word-level and sentence-level timing, custom styling, and auto-positioning to avoid obscuring content.",
  category: "video",
  subcategory: "editing",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["caption", "subtitle", "text", "timed", "accessibility"],
  icon: "Subtitles",
  color: "#f97316",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "Caption text",
      required: true,
    },
    {
      name: "startTime",
      type: "number",
      description: "Start time in seconds",
      required: true,
    },
    {
      name: "endTime",
      type: "number",
      description: "End time in seconds",
      required: true,
    },
    {
      name: "position",
      type: "enum",
      description: "Caption position",
      required: false,
      default: "bottom",
      enum: ["top", "center", "bottom"],
    },
    {
      name: "fontSize",
      type: "number",
      description: "Font size in pixels",
      required: false,
      default: 24,
    },
    {
      name: "bgColor",
      type: "string",
      description: "Background color (hex, empty for transparent)",
      required: false,
      default: "#00000080",
    },
    {
      name: "textColor",
      type: "string",
      description: "Text color (hex)",
      required: false,
      default: "#ffffff",
    },
    {
      name: "style",
      type: "enum",
      description: "Caption style",
      required: false,
      default: "default",
      enum: ["default", "karaoke", "box", "outline"],
    },
  ],
  capabilities: [
    {
      name: "caption",
      description: "Add time-synced captions to video",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 7800,
  rating: 4.6,
  ratingCount: 178,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const ADD_TRANSITION_MANIFEST: ToolManifest = {
  id: "video.addTransition",
  name: "Add Transition",
  description: "Add a transition between two clips or scenes",
  longDescription:
    "Inserts a visual transition effect between video segments. Supports fade, dissolve, wipe, slide, zoom, and custom transitions. Transitions are rendered as SVG animations composited during export.",
  category: "video",
  subcategory: "editing",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["transition", "fade", "dissolve", "wipe", "slide", "zoom"],
  icon: "Sparkles",
  color: "#a855f7",
  parameters: [
    {
      name: "type",
      type: "enum",
      description: "Transition type",
      required: true,
      enum: [
        "fade",
        "dissolve",
        "wipeLeft",
        "wipeRight",
        "slideUp",
        "slideDown",
        "zoomIn",
        "zoomOut",
      ],
    },
    {
      name: "duration",
      type: "number",
      description: "Transition duration in seconds",
      required: false,
      default: 0.5,
      min: 0.1,
      max: 3,
    },
    {
      name: "atTime",
      type: "number",
      description: "Time position for the transition (seconds)",
      required: true,
    },
  ],
  capabilities: [
    {
      name: "transition",
      description: "Add visual transitions between clips",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 5600,
  rating: 4.3,
  ratingCount: 98,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

// ─── All Video Tool Manifests ─────────────────────────────────────────────────

export const VIDEO_TOOLS: ToolManifest[] = [
  RECORD_MANIFEST,
  ANNOTATE_MANIFEST,
  CAPTURE_FRAME_MANIFEST,
  ADD_OVERLAY_MANIFEST,
  ADD_CAPTION_MANIFEST,
  ADD_TRANSITION_MANIFEST,
  EXPORT_VIDEO_MANIFEST,
];

// ─── CDP-like Command Generators ──────────────────────────────────────────────

/** Generate commands for screen recording */
export function generateRecordCommands(input: ToolInput): unknown[] {
  const action = input.action as string;
  const includeAudio = (input.includeAudio as boolean) !== false;
  const includeWebcam = (input.includeWebcam as boolean) || false;
  const frameRate = (input.frameRate as number) || 30;
  const maxDuration = (input.maxDuration as number) || 600;

  if (action === "start") {
    return [
      {
        method: "stitaP.startRecording",
        params: {
          audio: includeAudio,
          webcam: includeWebcam,
          frameRate,
          maxDuration,
          mimeType: "video/webm;codecs=vp9",
        },
      },
    ];
  }

  return [
    {
      method: "stitaP.stopRecording",
      params: {},
    },
  ];
}

/** Generate commands for annotation */
export function generateAnnotateCommands(input: ToolInput): unknown[] {
  const type = input.type as string;
  const x = (input.x as number) || 0;
  const y = (input.y as number) || 0;
  const color = (input.color as string) || "#ef4444";
  const fontSize = (input.fontSize as number) || 16;
  const startTime = (input.startTime as number) || 0;
  const endTime = (input.endTime as number) || -1;

  const base = {
    annotationType: type,
    position: { x, y },
    color,
    startTime,
    endTime,
  };

  switch (type) {
    case "text":
    case "number":
      return [
        {
          method: "stitaP.addAnnotation",
          params: {
            ...base,
            text: input.content as string,
            fontSize,
          },
        },
      ];
    case "arrow":
      return [
        {
          method: "stitaP.addAnnotation",
          params: {
            ...base,
            endX: (input.endX as number) || 0,
            endY: (input.endY as number) || 0,
          },
        },
      ];
    case "rect":
    case "highlight":
    case "blur":
      return [
        {
          method: "stitaP.addAnnotation",
          params: {
            ...base,
            width: (input.width as number) || 100,
            height: (input.height as number) || 50,
          },
        },
      ];
    default:
      return [{ method: "stitaP.addAnnotation", params: base }];
  }
}

/** Generate commands for frame capture */
export function generateCaptureFrameCommands(input: ToolInput): unknown[] {
  return [
    {
      method: "stitaP.captureFrame",
      params: {
        timestamp: (input.timestamp as number) || 0,
        format: (input.format as string) || "png",
        quality: (input.quality as number) || 95,
        scale: (input.scale as number) || 1,
      },
    },
  ];
}

/** Generate commands for overlay */
export function generateOverlayCommands(input: ToolInput): unknown[] {
  return [
    {
      method: "stitaP.addOverlay",
      params: {
        type: input.type,
        content: input.content,
        imageUrl: input.imageUrl,
        position: {
          x: (input.x as number) || 0.5,
          y: (input.y as number) || 0.5,
        },
        scale: (input.scale as number) || 1,
        opacity: (input.opacity as number) || 1,
        startTime: (input.startTime as number) || 0,
        endTime: (input.endTime as number) || -1,
        animation: (input.animation as string) || "none",
      },
    },
  ];
}

/** Generate commands for caption */
export function generateCaptionCommands(input: ToolInput): unknown[] {
  return [
    {
      method: "stitaP.addCaption",
      params: {
        text: input.text,
        startTime: input.startTime,
        endTime: input.endTime,
        position: (input.position as string) || "bottom",
        fontSize: (input.fontSize as number) || 24,
        bgColor: (input.bgColor as string) || "#00000080",
        textColor: (input.textColor as string) || "#ffffff",
        style: (input.style as string) || "default",
      },
    },
  ];
}

/** Generate commands for transition */
export function generateTransitionCommands(input: ToolInput): unknown[] {
  return [
    {
      method: "stitaP.addTransition",
      params: {
        type: input.type,
        duration: (input.duration as number) || 0.5,
        atTime: input.atTime,
      },
    },
  ];
}

/** Generate commands for export */
export function generateExportCommands(input: ToolInput): unknown[] {
  return [
    {
      method: "stitaP.exportVideo",
      params: {
        format: (input.format as string) || "webm",
        quality: (input.quality as number) || 90,
        startFrame: (input.startFrame as number) || 0,
        endFrame: (input.endFrame as number) || -1,
        fps: (input.fps as number) || 30,
        width: (input.width as number) || 1920,
        height: (input.height as number) || 1080,
      },
    },
  ];
}
