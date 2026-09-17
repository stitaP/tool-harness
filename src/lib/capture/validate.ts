/**
 * SVG validation (blueprint §22). Static checks on the XML structure plus an
 * offline <img> render test with dimension comparison. Runs entirely on the
 * client against the serialized (sanitized) document.
 */

import { parseSvgString, xmlSecurityIssues } from "./svg";
import { SVG_NS, ValidationCheck, ValidationReport } from "./types";

const FORBIDDEN = [
  "script",
  "foreignObject",
  "iframe",
  "audio",
  "video",
  "canvas",
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
];

export async function validateSvg(
  svg: string,
  expectWidth?: number,
  expectHeight?: number,
): Promise<ValidationReport> {
  const checks: ValidationCheck[] = [];
  const warnings: string[] = [];

  const push = (
    id: string,
    label: string,
    passed: boolean,
    detail?: string,
  ) => checks.push({ id, label, passed, detail });

  const security = xmlSecurityIssues(svg);
  push(
    "no-dtd",
    "No DTD / entity declarations (XXE guard)",
    security.length === 0,
    security.length ? security.join("; ") : undefined,
  );

  let parsed: XMLDocument | null = null;
  try {
    parsed = parseSvgString(svg);
    push("wellformed", "Well-formed XML", true);
  } catch (e) {
    push("wellformed", "Well-formed XML", false, String(e));
    return Promise.resolve({
      ok: false,
      checks,
      rendered: null,
      warnings,
    });
  }

  const root = parsed!.documentElement;
  push(
    "root",
    "Root <svg> with SVG namespace",
    root.tagName.toLowerCase() === "svg" && root.namespaceURI === SVG_NS,
    root.tagName.toLowerCase() === "svg" ? undefined : `root is <${root.tagName}>`,
  );

  const width = Number.parseFloat(root.getAttribute("width") ?? "0");
  const height = Number.parseFloat(root.getAttribute("height") ?? "0");
  push(
    "dims",
    "Positive width and height",
    width > 0 && height > 0,
    `${width} × ${height}`,
  );

  const viewBox = root.getAttribute("viewBox");
  const vbOk =
    !!viewBox &&
    viewBox.split(/[\s,]+/).length === 4 &&
    viewBox.split(/[\s,]+/).every((n) => Number.isFinite(Number(n)));
  push("viewbox", "Valid viewBox", vbOk, viewBox ?? "missing");

  const forbiddenFound: string[] = [];
  for (const tag of FORBIDDEN) {
    if (parsed!.getElementsByTagName(tag).length > 0) forbiddenFound.push(tag);
  }
  push(
    "forbidden",
    "No forbidden elements",
    forbiddenFound.length === 0,
    forbiddenFound.length ? forbiddenFound.join(", ") : undefined,
  );

  let unsafeAttrs = 0;
  let externalRefs = 0;
  const all = Array.from(parsed!.getElementsByTagName("*"));
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name.startsWith("xlink:href")) unsafeAttrs++;
      const value = attr.value.trim().toLowerCase();
      if (
        (name === "href" || name === "src") &&
        !value.startsWith("data:image/") &&
        !value.startsWith("#")
      ) {
        externalRefs++;
      }
    }
  }
  push(
    "attrs",
    "No event handlers or unsafe attributes",
    unsafeAttrs === 0,
    unsafeAttrs ? `${unsafeAttrs} found` : undefined,
  );
  push(
    "external",
    "Self-contained (no external references)",
    externalRefs === 0,
    externalRefs ? `${externalRefs} found` : undefined,
  );

  const ids = new Map<string, number>();
  for (const el of all) {
    const id = el.getAttribute("id");
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const dupes = [...ids.entries()].filter(([, n]) => n > 1);
  push(
    "ids",
    "Unique internal IDs",
    dupes.length === 0,
    dupes.length ? dupes.map(([id]) => id).join(", ") : undefined,
  );

  push(
    "size",
    "Within size limits",
    width <= 200_000 && height <= 500_000,
    `${width} × ${height}`,
  );

  const images = Array.from(parsed!.getElementsByTagName("image"));
  const embeddedBytes = images.reduce((n, img) => {
    const href = img.getAttribute("href") ?? "";
    return n + (href.startsWith("data:") ? Math.floor(href.length * 0.75) : 0);
  }, 0);
  const resourcesOk = images.length <= 5000 && embeddedBytes <= 30_000_000;
  push(
    "resources",
    "Embedded resources within limits",
    resourcesOk,
    `${images.length} image(s), ~${Math.round(embeddedBytes / 1024)} KB embedded`,
  );

  let integrity = "unavailable in this context";
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(svg),
    );
    integrity = `${[...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16)}…`;
    push("integrity", "Integrity SHA-256", true, integrity);
  } catch {
    push("integrity", "Integrity SHA-256", true, integrity);
  }

  // Offline <img> render test.
  return new Promise((resolve) => {
    const img = new Image();
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const timer = window.setTimeout(() => {
      push("render", "Offline <img> render", false, "timeout");
      resolve({
        ok: checks.every((c) => c.passed),
        checks,
        rendered: null,
        warnings,
      });
    }, 12_000);
    img.onload = () => {
      window.clearTimeout(timer);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const dimsOk =
        (expectWidth === undefined || Math.abs(nw - expectWidth) <= 2) &&
        (expectHeight === undefined || Math.abs(nh - expectHeight) <= 2);
      push(
        "render",
        "Offline <img> render",
        true,
        `${nw} × ${nh} rendered`,
      );
      push(
        "match",
        "Rendered dimensions match capture",
        dimsOk,
        `expected ${expectWidth ?? "—"} × ${expectHeight ?? "—"}`,
      );
      if (!dimsOk) warnings.push("Rendered SVG dimensions differ from the source capture.");
      resolve({
        ok: checks.every((c) => c.passed),
        checks,
        rendered: { width: nw, height: nh },
        warnings,
      });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      push("render", "Offline <img> render", false, "image failed to decode");
      resolve({
        ok: false,
        checks,
        rendered: null,
        warnings,
      });
    };
    img.src = url;
  });
}

/** Async bitmap extraction from an SVG string (used for PNG export + thumbs). */
export async function svgToBitmap(
  svg: string,
  opts: { maxWidth?: number; maxHeight?: number } = {},
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number } | null> {
  try {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("SVG image failed to load"));
      i.src = url;
    });
    URL.revokeObjectURL(url);
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const maxW = opts.maxWidth ?? nw;
    const maxH = opts.maxHeight ?? nh;
    const scale = Math.min(1, maxW / nw, maxH / nh);
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, width: w, height: h };
  } catch {
    return null;
  }
}

export async function svgToDataUrl(
  svg: string,
  format: "image/png" | "image/webp",
  quality: number,
  maxWidth = 2000,
  maxHeight = 16_384,
): Promise<string | null> {
  const bitmap = await svgToBitmap(svg, { maxWidth, maxHeight });
  if (!bitmap) return null;
  return bitmap.canvas.toDataURL(format, quality);
}
