/**
 * Pure sanitization for capture library rows.
 *
 * Extracted from the inline truncation logic in `src/convex/captures.ts`
 * (`saveCapture` / `saveExtensionCapture`) so the field caps are unit-testable
 * without a live Convex deployment. Both mutations converge on exactly these
 * rules — keep them in sync when changing caps here.
 *
 * Node-safe (no DOM), importable from Convex functions and test scripts.
 */

export const LIBRARY_TITLE_MAX = 300;
export const LIBRARY_DESCRIPTION_MAX = 4000;
export const LIBRARY_TAG_MAX_COUNT = 50;
export const LIBRARY_TAG_MAX_LEN = 80;
export const LIBRARY_URL_MAX = 2048;
export const LIBRARY_CAPTURE_MODE_MAX = 60;
export const LIBRARY_WIDTH_MAX = 200_000; // CSS px, matches EXT_MAX_WIDTH
export const LIBRARY_HEIGHT_MAX = 500_000; // CSS px, matches EXT_MAX_HEIGHT

export interface LibraryFieldInput {
  title: string;
  description: string;
  tags: string[];
  url?: string;
  captureMode: string;
  width: number;
  height: number;
  thumbnail?: string;
}

export interface SanitizedLibraryFields {
  title: string;
  description: string;
  tags: string[];
  url?: string;
  captureMode: string;
  width: number;
  height: number;
  thumbnail: string;
}

/** Clamp a rounded integer into [lo, hi]; NaN/negative/infinity cannot slip through. */
function clampInt(value: number, lo: number, hi: number): number {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Apply the shared storage caps: title 300, description 4000, tags 50×80,
 * url 2048, captureMode 60, width/height clamped to [1, 200k]/[1, 500k],
 * thumbnail defaulting to "". An empty title becomes "Untitled capture".
 */
export function sanitizeLibraryFields(
  input: LibraryFieldInput,
): SanitizedLibraryFields {
  const title =
    input.title.trim().slice(0, LIBRARY_TITLE_MAX) || "Untitled capture";
  const description = input.description.slice(0, LIBRARY_DESCRIPTION_MAX);
  const tags = input.tags
    .slice(0, LIBRARY_TAG_MAX_COUNT)
    .map((t) => t.slice(0, LIBRARY_TAG_MAX_LEN));
  const url = input.url ? input.url.slice(0, LIBRARY_URL_MAX) : undefined;
  const captureMode = input.captureMode.slice(0, LIBRARY_CAPTURE_MODE_MAX);
  const width = clampInt(input.width, 1, LIBRARY_WIDTH_MAX);
  const height = clampInt(input.height, 1, LIBRARY_HEIGHT_MAX);
  const thumbnail = input.thumbnail ?? "";
  return { title, description, tags, url, captureMode, width, height, thumbnail };
}
