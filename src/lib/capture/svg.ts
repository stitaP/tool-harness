/**
 * SVG serializer (blueprint §17, §18, §21).
 *
 * - buildPortableSvg: raster tiles embedded as native <image> elements, one
 *   per tile, positioned in a single SVG coordinate system (tiled SVG output).
 * - Annotation serialization to native SVG elements (arrows, rects, text,
 *   callouts, step markers, highlights, masks) with data attributes that let
 *   us parse them back into the editable model.
 * - A positive-allowlist sanitizer for the Safe Image profile.
 */

import {
  Annotation,
  CaptureDocument,
  CaptureMetadataModel,
  CaptureOcrState,
  MAX_TILE_HEIGHT,
  SVG_NS,
  VC_NS,
} from "./types";
import { buildMetadataXml, escapeXml } from "./metadata";

export const TILE_HEIGHT = MAX_TILE_HEIGHT;

/* ------------------------------------------------------------------ */
/* Annotation → SVG                                                     */
/* ------------------------------------------------------------------ */

function hexToCssSafe(hex: string): string {
  return (hex || "#111111").replace(/^#/, "");
}

function markerId(stroke: string): string {
  return `arrowhead-${hexToCssSafe(stroke)}`;
}

/**
 * Inner content of the annotation <defs> (arrow markers + blur filters),
 * without the <defs> wrapper — so callers can compose a single <defs> block
 * together with gradient/shadow/clip defs.
 */
export function buildDefsInner(annotations: Annotation[]): string {
  const arrows = annotations.filter(
    (a): a is Extract<Annotation, { kind: "arrow" }> => a.kind === "arrow" && a.visible,
  );
  const strokes = [...new Set(arrows.map((a) => a.stroke))];
  const markers = strokes
    .map((stroke) => {
      const id = markerId(stroke);
      return `  <marker id="${id}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="${escapeXml(stroke)}"/></marker>`;
    })
    .join("\n");
  const blurs = annotations.filter(
    (a): a is Extract<Annotation, { kind: "blur" }> => a.kind === "blur" && a.visible,
  );
  const blurDefs = blurs
    .map((a) => {
      const pad = Math.ceil(a.radius * 2) + 2;
      const clip = `  <clipPath id="blur-clip-${a.id}"><rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}"/></clipPath>`;
      const filter = `  <filter id="blur-filter-${a.id}" filterUnits="userSpaceOnUse" x="${a.x - pad}" y="${a.y - pad}" width="${a.width + pad * 2}" height="${a.height + pad * 2}"><feGaussianBlur stdDeviation="${a.radius}"/></filter>`;
      return `${clip}\n${filter}`;
    })
    .join("\n");
  const magnifiers = annotations.filter(
    (a): a is Extract<Annotation, { kind: "magnifier" }> => a.kind === "magnifier" && a.visible,
  );
  const magnifierDefs = magnifiers
    .map((a) => `  <clipPath id="mag-clip-${a.id}"><circle cx="${a.x}" cy="${a.y}" r="${a.radius}"/></clipPath>`)
    .join("\n");
  return [markers, blurDefs, magnifierDefs].filter(Boolean).join("\n");
}

/** <defs> needed by the current annotation set (arrow markers + blur filters). */
export function buildDefs(annotations: Annotation[]): string {
  const inner = buildDefsInner(annotations);
  if (!inner) return "";
  return `\n  <defs>\n${inner}\n  </defs>`;
}

function textXml(
  x: number,
  y: number,
  text: string,
  attrs: Record<string, string | number>,
  extraAttrs?: string,
): string {
  const lines = text.split("\n");
  const base = Object.entries(attrs)
    .map(([k, val]) => `${k}="${escapeXml(String(val))}"`)
    .join(" ");
  if (lines.length === 1) {
    return `  <text x="${x}" y="${y}" ${base} ${extraAttrs ?? ""}>${escapeXml(text)}</text>`;
  }
  const tspans = lines
    .map(
      (line, i) =>
        `    <tspan x="${x}" dy="${i === 0 ? 0 : "1.2em"}">${escapeXml(line)}</tspan>`,
    )
    .join("\n");
  return `  <text x="${x}" y="${y}" ${base} ${extraAttrs ?? ""}>\n${tspans}\n  </text>`;
}

export function annotationToXml(a: Annotation): string {
  const groupAttr = a.group ? ` data-group="${escapeXml(a.group)}"` : "";
  switch (a.kind) {
    case "arrow":
      return `  <g data-annotation="arrow" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
    <line x1="${a.start.x}" y1="${a.start.y}" x2="${a.end.x}" y2="${a.end.y}" stroke="${escapeXml(a.stroke)}" stroke-width="${a.strokeWidth}" marker-end="url(#${markerId(a.stroke)})"/>
  </g>`;
    case "rect":
      return `  <g data-annotation="rect" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
    <rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" rx="${a.rx}" stroke="${escapeXml(a.stroke)}" stroke-width="${a.strokeWidth}" fill="${a.fill}"/>
  </g>`;
    case "text":
      return `  <g data-annotation="text" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
${textXml(a.x, a.y, a.text, {
        "font-family": "Inter, system-ui, sans-serif",
        "font-size": a.fontSize,
        "font-weight": a.fontWeight,
        fill: a.fill,
        "text-anchor": a.align,
      })}
  </g>`;
    case "callout":
      return `  <g data-annotation="callout" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
    <circle cx="${a.anchor.x}" cy="${a.anchor.y}" r="4" fill="${escapeXml(a.stroke)}"/>
    <line x1="${a.anchor.x}" y1="${a.anchor.y}" x2="${a.end.x}" y2="${a.end.y}" stroke="${escapeXml(a.stroke)}" stroke-width="1.5"/>
${textXml(a.end.x + 8, a.end.y + a.fontSize * 0.35, a.text, {
        "font-family": "Inter, system-ui, sans-serif",
        "font-size": a.fontSize,
        fill: a.fill,
      })}
  </g>`;
    case "step":
      return `  <g data-annotation="step" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
    <circle cx="${a.x}" cy="${a.y}" r="14" fill="${escapeXml(a.fill)}"/>
    <text x="${a.x}" y="${a.y}" text-anchor="middle" dominant-baseline="central" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" fill="#ffffff">${a.number}</text>
  </g>`;
    case "highlight":
      return `  <g data-annotation="highlight" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
    <rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" rx="3" fill="${escapeXml(a.fill)}" opacity="${a.opacity}"/>
  </g>`;
    case "mask":
      return `  <g data-annotation="mask" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
    <rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" fill="${escapeXml(a.fill)}" opacity="${a.opacity}"/>
    ${
      a.label
        ? `<text x="${a.x + 6}" y="${a.y + a.height - 6}" font-family="Inter, system-ui, sans-serif" font-size="10" letter-spacing="1.5" fill="#ffffff" opacity="0.85">MASK</text>`
        : ""
    }
  </g>`;
    case "blur":
      return `  <g data-annotation="blur" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
    <g clip-path="url(#blur-clip-${a.id})">
      <use href="#base-capture" filter="url(#blur-filter-${a.id})"/>
    </g>
  </g>`;
    case "magnifier":
      return `  <g data-annotation="magnifier" data-id="${a.id}" data-visible="${a.visible}"${groupAttr}>
    <g clip-path="url(#mag-clip-${a.id})">
      <use href="#base-capture" transform="translate(${a.x * (1 - a.zoom)} ${a.y * (1 - a.zoom)}) scale(${a.zoom})"/>
    </g>
    <circle cx="${a.x}" cy="${a.y}" r="${a.radius}" fill="none" stroke="${escapeXml(a.stroke)}" stroke-width="2"/>
    <line x1="${a.x - a.radius}" y1="${a.y}" x2="${a.x + a.radius}" y2="${a.y}" stroke="${escapeXml(a.stroke)}" stroke-width="1" opacity="0.4"/>
    <line x1="${a.x}" y1="${a.y - a.radius}" x2="${a.x}" y2="${a.y + a.radius}" stroke="${escapeXml(a.stroke)}" stroke-width="1" opacity="0.4"/>
    <text x="${a.x + a.radius - 4}" y="${a.y + a.radius - 6}" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" fill="${escapeXml(a.stroke)}">${a.zoom}×</text>
  </g>`;
  }
}

export function annotationsToXml(annotations: Annotation[]): string {
  const visible = annotations.filter((a) => a.visible);
  if (visible.length === 0) return "";
  return visible.map(annotationToXml).join("\n");
}

/* ------------------------------------------------------------------ */
/* Document → SVG string                                                */
/* ------------------------------------------------------------------ */

export interface BuildSvgOptions {
  model: CaptureMetadataModel;
  annotations: Annotation[];
  outputMode: string;
}

export function buildPortableSvg(
  doc: CaptureDocument,
  opts: BuildSvgOptions,
): string {
  const { model, annotations, outputMode } = opts;
  const meta = buildMetadataXml({ doc, model, outputMode });
  const tiles = doc.baseLayers
    .map(
      (t) =>
        `    <image x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" href="${t.dataUrl}" preserveAspectRatio="none"/>`,
    )
    .join("\n");
  const defs = buildDefs(annotations);
  const annotationsXml = annotationsToXml(annotations);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${doc.canvas.width}" height="${doc.canvas.height}" viewBox="0 0 ${doc.canvas.width} ${doc.canvas.height}" role="img" aria-labelledby="capture-title capture-description">
  <title id="capture-title">${escapeXml(model.title)}</title>
  <desc id="capture-description">${escapeXml(model.description)}</desc>
${meta ? meta + "\n" : ""}  <g id="base-capture">
${tiles}
  </g>
${defs ? defs + "\n" : ""}  <g id="annotations">
${annotationsXml || "    <!-- Annotate your capture in the editor -->"}
  </g>
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* SVG string → live DOM + annotation model                             */
/* ------------------------------------------------------------------ */

export function parseSvgString(svg: string): XMLDocument {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const error = doc.querySelector("parsererror");
  if (error) throw new Error("SVG could not be parsed: " + error.textContent);
  return doc;
}

function num(el: Element, attr: string, fallback = 0): number {
  const raw = el.getAttribute(attr);
  const n = raw === null ? NaN : Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse a single <g data-annotation="…"> group back into the model. */
export function annotationFromElement(g: Element): Annotation | null {
  const kind = g.getAttribute("data-annotation");
  const id = g.getAttribute("data-id") ?? `a-${Math.random().toString(36).slice(2, 8)}`;
  const visible = g.getAttribute("data-visible") !== "false";
  if (!kind) return null;
  const shapes = Array.from(g.children);
  const line = shapes.find((s) => s.tagName === "line");
  const circle = shapes.find((s) => s.tagName === "circle");
  const rect = shapes.find((s) => s.tagName === "rect");
  const textEl = shapes.find((s) => s.tagName === "text");
  const textContent = (el?: Element) =>
    el ? Array.from(el.childNodes).map((n) => n.textContent ?? "").join("") : "";
  switch (kind) {
    case "arrow":
      if (line)
        return {
          id,
          kind: "arrow" as const,
          visible,
          start: { x: num(line, "x1"), y: num(line, "y1") },
          end: { x: num(line, "x2"), y: num(line, "y2") },
          stroke: line.getAttribute("stroke") ?? "#111111",
          strokeWidth: num(line, "stroke-width", 3),
        };
      break;
    case "rect":
      if (rect)
        return {
          id,
          kind: "rect" as const,
          visible,
          x: num(rect, "x"),
          y: num(rect, "y"),
          width: num(rect, "width"),
          height: num(rect, "height"),
          rx: num(rect, "rx"),
          stroke: rect.getAttribute("stroke") ?? "transparent",
          strokeWidth: num(rect, "stroke-width", 0),
          fill: rect.getAttribute("fill") ?? "transparent",
        };
      break;
    case "text":
      if (textEl)
        return {
          id,
          kind: "text" as const,
          visible,
          x: num(textEl, "x"),
          y: num(textEl, "y"),
          text: textContent(textEl),
          fontSize: num(textEl, "font-size", 16),
          fill: textEl.getAttribute("fill") ?? "#111111",
          fontWeight: num(textEl, "font-weight", 500),
          align: (textEl.getAttribute("text-anchor") as "start" | "middle" | "end") ?? "start",
        };
      break;
    case "callout":
      if (line && textEl)
        return {
          id,
          kind: "callout" as const,
          visible,
          anchor: { x: num(line, "x1"), y: num(line, "y1") },
          end: { x: num(line, "x2"), y: num(line, "y2") },
          text: textContent(textEl),
          stroke: line.getAttribute("stroke") ?? "#111111",
          fontSize: num(textEl, "font-size", 14),
          fill: textEl.getAttribute("fill") ?? "#111111",
        };
      break;
    case "step":
      if (circle && textEl)
        return {
          id,
          kind: "step" as const,
          visible,
          x: num(circle, "cx"),
          y: num(circle, "cy"),
          number: Number.parseInt(textContent(textEl), 10) || 1,
          fill: circle.getAttribute("fill") ?? "#111111",
        };
      break;
    case "highlight":
      if (rect)
        return {
          id,
          kind: "highlight" as const,
          visible,
          x: num(rect, "x"),
          y: num(rect, "y"),
          width: num(rect, "width"),
          height: num(rect, "height"),
          fill: rect.getAttribute("fill") ?? "#facc15",
          opacity: num(rect, "opacity", 0.35),
        };
      break;
    case "mask":
      if (rect)
        return {
          id,
          kind: "mask" as const,
          visible,
          x: num(rect, "x"),
          y: num(rect, "y"),
          width: num(rect, "width"),
          height: num(rect, "height"),
          fill: rect.getAttribute("fill") ?? "#111111",
          opacity: num(rect, "opacity", 0.92),
          label: g.textContent?.includes("MASK") ?? false,
        };
      break;
    case "blur": {
      const clipRect = g.querySelector("clipPath rect");
      const blurEl = g.querySelector("feGaussianBlur");
      if (clipRect)
        return {
          id,
          kind: "blur" as const,
          visible,
          x: num(clipRect, "x"),
          y: num(clipRect, "y"),
          width: num(clipRect, "width"),
          height: num(clipRect, "height"),
          radius: blurEl ? num(blurEl, "stdDeviation", 6) : 6,
        };
      break;
    }
    case "magnifier": {
      const clipCircle = g.querySelector("clipPath circle");
      const ringCircle = Array.from(g.children).find((s) => s.tagName === "circle");
      const useEl = g.querySelector("use");
      if (clipCircle) {
        const t = useEl?.getAttribute("transform") ?? "";
        const scale = t.match(/scale\(([\d.]+)\)/);
        return {
          id,
          kind: "magnifier" as const,
          visible,
          x: num(clipCircle, "cx"),
          y: num(clipCircle, "cy"),
          radius: num(clipCircle, "r", 40),
          zoom: scale ? Number.parseFloat(scale[1]) || 2.5 : 2.5,
          stroke: ringCircle?.getAttribute("stroke") ?? "#111111",
        };
      }
      break;
    }
  }
  return null;
}

/** Reconstruct the editable annotation model from a serialized SVG. */
export function annotationsFromSvg(svgDoc: XMLDocument): Annotation[] {
  const group = svgDoc.getElementById("annotations");
  if (!group) return [];
  const out: Annotation[] = [];
  for (const g of Array.from(group.children)) {
    const ann = annotationFromElement(g);
    if (ann) {
      const grp = g.getAttribute("data-group") || undefined;
      out.push(grp ? { ...ann, group: grp } : ann);
    }
  }
  return out;
}

/** Rebuild a working CaptureDocument from a saved SVG (for re-editing). */
export function documentFromSvg(
  svgDoc: XMLDocument,
  info: {
    url?: string;
    captureMode?: string;
    capturedAt?: string;
    title?: string;
  },
): CaptureDocument {
  const root = svgDoc.documentElement;
  const width = Number.parseFloat(root.getAttribute("width") ?? "0") || 0;
  const height = Number.parseFloat(root.getAttribute("height") ?? "0") || 0;
  const tiles: CaptureDocument["baseLayers"] = [];
  const base = svgDoc.getElementById("base-capture");
  if (base) {
    Array.from(base.children).forEach((img, i) => {
      if (img.tagName !== "image") return;
      tiles.push({
        id: img.getAttribute("id") ?? `tile-${i}`,
        x: Number.parseFloat(img.getAttribute("x") ?? "0") || 0,
        y: Number.parseFloat(img.getAttribute("y") ?? "0") || 0,
        width: Number.parseFloat(img.getAttribute("width") ?? "0") || 0,
        height: Number.parseFloat(img.getAttribute("height") ?? "0") || 0,
        dataUrl: img.getAttribute("href") ?? img.getAttribute("xlink:href") ?? "",
      });
    });
  }
  const nsText = (tag: string) =>
    svgDoc.getElementsByTagNameNS(VC_NS, tag)[0]?.textContent ?? "";
  const viewportW = Number.parseFloat(nsText("viewportWidth"));
  // OCR-at-capture state (blueprint §14) — restored from the SVG metadata
  // (text + counts; full per-block layers travel in the sidecar JSON).
  const ocrStatus = nsText("ocrStatus");
  const ocrText = nsText("ocrText");
  const ocr: CaptureOcrState | undefined = ocrStatus
    ? {
        status: ocrStatus === "failed" ? "failed" : "ok",
        engine: nsText("ocrEngine") || "tesseract",
        layers: [],
        text: ocrText,
        truncated: false,
      }
    : undefined;
  return {
    documentId: nsText("documentId") || `cap-reopened-${Math.random().toString(36).slice(2, 8)}`,
    canvas: { width, height, background: "#ffffff" },
    source: {
      title: info.title ?? titlesFromSvg(svgDoc).title ?? "Untitled capture",
      url: info.url,
      capturedAt: info.capturedAt ?? new Date().toISOString(),
      mode: (info.captureMode === "viewport" ||
        info.captureMode === "region" ||
        info.captureMode === "element"
        ? info.captureMode
        : "full-page") as CaptureDocument["source"]["mode"],
      target: nsText("captureTarget") || undefined,
      viewport: {
        width: viewportW || Math.min(width, 1440),
        height: Math.min(height, 900),
        deviceScaleFactor: 1,
      },
    },
    baseLayers: tiles,
    ocr,
    warnings: [],
  };
}

/** Read <title>/<desc> back out of a serialized SVG. */
export function titlesFromSvg(svgDoc: XMLDocument): {
  title: string;
  description: string;
} {
  return {
    title: svgDoc.getElementById("capture-title")?.textContent ?? "",
    description: svgDoc.getElementById("capture-description")?.textContent ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* Sanitizer (blueprint §21: Safe Image allowlist)                      */
/* ------------------------------------------------------------------ */

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "title",
  "desc",
  "metadata",
  "g",
  "defs",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "tspan",
  "image",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "marker",
  "use",
  "symbol",
  "style",
  "filter",
  "feGaussianBlur",
  "feDropShadow",
]);

const FORBIDDEN_ELEMENTS = new Set([
  "script",
  "foreignObject",
  "iframe",
  "audio",
  "video",
  "canvas",
  "animate",
  "animateMotion",
  "animateTransform",
  "set",
  "a",
]);

const FORBIDDEN_ATTR_PREFIXES = ["on", "xlink:href"];

export interface SanitizeResult {
  svg: string;
  warnings: string[];
}

/**
 * Find XML security hazards in a serialized SVG: DTD / entity / element
 * declarations (XXE vector) and external processing instructions. Pure
 * string scan — safe to run anywhere, including before the DOM parse.
 */
export function xmlSecurityIssues(svg: string): string[] {
  const issues: string[] = [];
  const decl = /<!\s*(DOCTYPE|ENTITY|ELEMENT|ATTLIST|NOTATION)\b/i;
  const match = decl.exec(svg);
  if (match) {
    issues.push(`DTD declaration <!${match[1]}> is not allowed (XXE / entity-expansion risk)`);
  }
  const pi = /<\?\s*xml-stylesheet\b[^>]*\?>/i.exec(svg);
  if (pi) {
    issues.push("External stylesheet processing instruction is not allowed");
  }
  return issues;
}

/** Positive-allowlist sanitizer producing a Safe Image profile SVG. */
export function sanitizeSvg(svg: string): SanitizeResult {
  const warnings: string[] = [];
  const security = xmlSecurityIssues(svg);
  if (security.length > 0) {
    throw new Error("Sanitizer: " + security.join("; "));
  }
  const parsed = parseSvgString(svg);
  const root = parsed.documentElement;
  if (root.tagName.toLowerCase() !== "svg") {
    throw new Error("Sanitizer: root element is not <svg>");
  }

  // Strip comments and processing instructions.
  for (const node of Array.from(parsed.childNodes)) {
    if (node.nodeType === 8 || node.nodeType === 7) {
      node.parentNode?.removeChild(node);
    }
  }

  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (FORBIDDEN_ELEMENTS.has(tag) || !ALLOWED_ELEMENTS.has(tag)) {
      warnings.push(`Removed forbidden element <${tag}>`);
      el.remove();
      return;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (
        FORBIDDEN_ATTR_PREFIXES.some((p) => name.startsWith(p)) ||
        name.startsWith("on")
      ) {
        el.removeAttribute(attr.name);
        warnings.push(`Removed unsafe attribute "${attr.name}"`);
        continue;
      }
      const value = attr.value.trim().toLowerCase();
      if (
        (name === "href" || name === "src") &&
        !value.startsWith("data:image/") &&
        !value.startsWith("#")
      ) {
        el.removeAttribute(attr.name);
        warnings.push(`Removed external reference on "${attr.name}"`);
        continue;
      }
      if (
        (name === "href" || name === "src") &&
        value.startsWith("data:") &&
        !/^data:image\/(png|webp|jpeg|jpg|svg\+xml);/.test(value)
      ) {
        el.removeAttribute(attr.name);
        warnings.push(`Removed unsupported data: MIME type on "${attr.name}"`);
        continue;
      }
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);

  // Limit checks.
  const count = parsed.getElementsByTagName("*").length;
  if (count > 25_000) {
    throw new Error("Sanitizer: SVG exceeds 25,000 element limit");
  }
  const xml = new XMLSerializer().serializeToString(parsed);
  const declaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
  return { svg: declaration + xml, warnings };
}
