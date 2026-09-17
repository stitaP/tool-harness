/**
 * Current-tab extension — wire protocol shared by the workspace UI and the
 * browser extension (scaffolded in a later phase). The extension mirrors these
 * message shapes in plain JS; the constants live here so the workspace side of
 * the contract is single-sourced and smoke-testable.
 *
 * Channel: `window.postMessage(message, "*")`. Messages are tagged with a
 * `source` field so foreign messages are ignored.
 */

export const EXT_MSG_SOURCE = "stitap-extension" as const;
export const EXT_MSG_WORKSPACE = "stitap-workspace" as const;

export const EXT_EVENT_PING = "STITAP_EXT_PING" as const;
export const EXT_EVENT_STATUS = "STITAP_EXT_STATUS" as const;
export const EXT_EVENT_CAPTURE_SAVED = "STITAP_EXT_CAPTURE_SAVED" as const;
export const EXT_EVENT_UPLOAD_REQUEST = "STITAP_EXT_UPLOAD_REQUEST" as const;
export const EXT_EVENT_UPLOAD_RESULT = "STITAP_EXT_UPLOAD_RESULT" as const;

export interface ExtensionStatusPayload {
  installed: true;
  version: string;
}

export interface ExtensionCaptureSavedPayload {
  captureId?: string;
  title?: string;
  width?: number;
  height?: number;
}

/**
 * Phase D — a stitched capture handed from the extension to the signed-in
 * workspace page, which performs the actual Convex upload (no credentials
 * ever leave the app). `dataUrl` is the PNG; `width`/`height` are device px.
 */
export interface ExtensionUploadRequestPayload {
  /** Correlates the request with the result — echoed back by the workspace. */
  requestId: string;
  title: string;
  url?: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mode: "viewport" | "full-page";
  capturedAt: string;
  dataUrl: string;
  description?: string;
  tags?: string[];
}

export interface ExtensionUploadResultPayload {
  requestId: string;
  ok: boolean;
  captureId?: string;
  error?: string;
}

export type ExtensionMessage =
  | {
      source: typeof EXT_MSG_SOURCE;
      type: typeof EXT_EVENT_STATUS;
      payload: ExtensionStatusPayload;
    }
  | {
      source: typeof EXT_MSG_SOURCE;
      type: typeof EXT_EVENT_CAPTURE_SAVED;
      payload: ExtensionCaptureSavedPayload;
    }
  | {
      source: typeof EXT_MSG_SOURCE;
      type: typeof EXT_EVENT_UPLOAD_REQUEST;
      payload: ExtensionUploadRequestPayload;
    };

/** Workspace → extension: "are you there? announce yourself." */
export interface ExtensionPing {
  source: typeof EXT_MSG_WORKSPACE;
  type: typeof EXT_EVENT_PING;
}

export function extensionPing(): ExtensionPing {
  return { source: EXT_MSG_WORKSPACE, type: EXT_EVENT_PING };
}

/** Workspace → extension: the upload outcome for a `requestId`. */
export interface ExtensionUploadResultMessage {
  source: typeof EXT_MSG_WORKSPACE;
  type: typeof EXT_EVENT_UPLOAD_RESULT;
  payload: ExtensionUploadResultPayload;
}

export function extensionUploadResult(
  requestId: string,
  result: Omit<ExtensionUploadResultPayload, "requestId">,
): ExtensionUploadResultMessage {
  return {
    source: EXT_MSG_WORKSPACE,
    type: EXT_EVENT_UPLOAD_RESULT,
    payload: { requestId, ...result },
  };
}

/** Generate a correlation id for an upload request (no uuid dependency). */
export function extensionRequestId(): string {
  return `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parse a postMessage payload. Returns null for foreign or malformed messages. */
export function parseExtensionMessage(data: unknown): ExtensionMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.source !== EXT_MSG_SOURCE || typeof d.type !== "string") return null;
  const payload =
    typeof d.payload === "object" && d.payload !== null
      ? (d.payload as Record<string, unknown>)
      : {};

  switch (d.type) {
    case EXT_EVENT_STATUS: {
      if (payload.installed !== true || typeof payload.version !== "string") {
        return null;
      }
      return {
        source: EXT_MSG_SOURCE,
        type: EXT_EVENT_STATUS,
        payload: { installed: true, version: payload.version },
      };
    }
    case EXT_EVENT_CAPTURE_SAVED: {
      const out: ExtensionCaptureSavedPayload = {};
      if (typeof payload.captureId === "string") out.captureId = payload.captureId;
      if (typeof payload.title === "string") out.title = payload.title;
      if (typeof payload.width === "number") out.width = payload.width;
      if (typeof payload.height === "number") out.height = payload.height;
      return { source: EXT_MSG_SOURCE, type: EXT_EVENT_CAPTURE_SAVED, payload: out };
    }
    case EXT_EVENT_UPLOAD_REQUEST: {
      if (
        typeof payload.requestId !== "string" ||
        typeof payload.title !== "string" ||
        typeof payload.dataUrl !== "string" ||
        typeof payload.width !== "number" ||
        typeof payload.height !== "number" ||
        typeof payload.deviceScaleFactor !== "number" ||
        (payload.mode !== "viewport" && payload.mode !== "full-page") ||
        typeof payload.capturedAt !== "string"
      ) {
        return null;
      }
      const out: ExtensionUploadRequestPayload = {
        requestId: payload.requestId,
        title: payload.title,
        width: payload.width,
        height: payload.height,
        deviceScaleFactor: payload.deviceScaleFactor,
        mode: payload.mode,
        capturedAt: payload.capturedAt,
        dataUrl: payload.dataUrl,
      };
      if (typeof payload.url === "string") out.url = payload.url;
      if (typeof payload.description === "string") out.description = payload.description;
      if (Array.isArray(payload.tags)) {
        out.tags = payload.tags.filter((t): t is string => typeof t === "string");
      }
      return { source: EXT_MSG_SOURCE, type: EXT_EVENT_UPLOAD_REQUEST, payload: out };
    }
    default:
      return null;
  }
}

export function isExtensionMessage(data: unknown): data is ExtensionMessage {
  return parseExtensionMessage(data) !== null;
}

/* ------------------------------------------------------------------ */
/* Backend guards for saveExtensionCapture (pure → smoke-testable)      */
/* ------------------------------------------------------------------ */

export const EXT_MAX_WIDTH = 200_000; // CSS px
export const EXT_MAX_HEIGHT = 500_000; // CSS px
export const EXT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // PNG cap, enforced by the extension client
export const EXT_UPLOAD_TTL_MS = 5 * 60_000; // upload URL lifetime
export const EXT_UPLOAD_GRANT_TIMEOUT_MS = 35_000; // popup wait for the workspace to save

export interface ExtensionPayload {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mode: string;
  title: string;
}

/** Validate geometry/mode/title before a capture row is persisted. */
export function validateExtensionPayload(
  p: ExtensionPayload,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const isDim = (n: number) => Number.isFinite(n) && n >= 1;
  if (!isDim(p.width)) {
    errors.push("width must be a positive number");
  } else if (p.width > EXT_MAX_WIDTH) {
    errors.push(`width exceeds the ${EXT_MAX_WIDTH} px limit`);
  }
  if (!isDim(p.height)) {
    errors.push("height must be a positive number");
  } else if (p.height > EXT_MAX_HEIGHT) {
    errors.push(`height exceeds the ${EXT_MAX_HEIGHT} px limit`);
  }
  if (!(Number.isInteger(p.deviceScaleFactor) && p.deviceScaleFactor >= 1 && p.deviceScaleFactor <= 3)) {
    errors.push("deviceScaleFactor must be 1, 2 or 3");
  }
  if (p.mode !== "viewport" && p.mode !== "full-page") {
    errors.push("mode must be viewport or full-page");
  }
  if (typeof p.title !== "string") {
    errors.push("title must be a string");
  } else if (p.title.length > 300) {
    errors.push("title exceeds 300 characters");
  }
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Phase C — full-page capture constants + tile planning (pure)         */
/* The extension mirrors these in extension/src/shared.js; keep in sync. */
/* ------------------------------------------------------------------ */

export const EXT_LAZY_STEP_RATIO = 0.8; // fraction of the viewport per lazy pass
export const EXT_LAZY_DELAY_MS = 180; // settle between lazy passes
export const EXT_MAX_PASSES = 40; // hard cap on lazy-load passes
export const EXT_MAX_CAPTURE_HEIGHT = 100_000; // CSS px (§26 default)
export const EXT_TILE_SETTLE_MS = 80; // post-scroll settle before a tile
export const EXT_STITCH_MAX_DEVICE_HEIGHT = 16_000; // device px cap for the popup bitmap
export const EXT_STITCH_MAX_PIXELS = 40_000_000; // device px area cap (width × height)

export interface TilePlan {
  ys: number[]; // scroll offsets (CSS px), bottom-aligned
  maxScroll: number;
  height: number;
  tiles: number;
}

/**
 * Plan contiguous viewport tiles for a full-page capture.
 *
 * Tiles start at 0 and step by the viewport height; the final tile is pinned
 * to `docHeight - viewportHeight` so the page tail is always captured.
 * Consecutive tiles never leave a gap (they may overlap by up to a viewport
 * minus one step — the stitch draws in order, and since the page is frozen
 * and fixed elements are hidden, overlapped rows are identical).
 */
export function planFullPageTiles(
  docHeight: number,
  viewportHeight: number,
): TilePlan {
  const vh = Math.max(1, Math.floor(viewportHeight));
  const h = Math.max(1, Math.floor(docHeight));
  const maxScroll = Math.max(0, h - vh);
  const ys: number[] = [];
  for (let y = 0; y <= maxScroll; y += vh) ys.push(y);
  if (ys[ys.length - 1] !== maxScroll) ys.push(maxScroll);
  return { ys, maxScroll, height: h, tiles: ys.length };
}
