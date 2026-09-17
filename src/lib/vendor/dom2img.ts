/* ─── stitaP — Custom DOM-to-Image (replaces html-to-image + snapdom) ─── */

export interface DomToImageOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
  backgroundColor?: string;
  style?: Partial<CSSStyleDeclaration>;
  /** Inline all computed styles (slower but more accurate) */
  inlineStyles?: boolean;
  /** Filter out certain elements */
  filter?: (el: HTMLElement) => boolean;
  /** Quality for JPEG (0-1) */
  quality?: number;
  format?: "png" | "jpeg" | "webp";
}

/** Serialize an SVG from an HTML element */
async function serializeElement(
  el: HTMLElement,
  options: DomToImageOptions,
): Promise<string> {
  const width = options.width || el.offsetWidth;
  const height = options.height || el.offsetHeight;
  const px = options.pixelRatio || 1;

  // Clone the element
  const clone = el.cloneNode(true) as HTMLElement;

  // Inline computed styles if requested
  if (options.inlineStyles) {
    inlineAllStyles(el, clone);
  }

  // Serialize to XHTML
  const serializer = new XMLSerializer();
  let svgContent = serializer.serializeToString(clone);

  // Fix namespace
  if (!svgContent.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    svgContent = svgContent.replace(/^<([a-zA-Z]+)/, '<$1 xmlns="http://www.w3.org/2000/svg"');
  }
  if (!svgContent.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/)) {
    svgContent = svgContent.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  // Collect all stylesheets as inline <style>
  const styles = collectStyles(el);
  const foreignObject = `<foreignObject width="${width * px}" height="${height * px}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;">
      <style>${styles}</style>
      ${svgContent}
    </div>
  </foreignObject>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * px}" height="${height * px}">
    <rect width="100%" height="100%" fill="${options.backgroundColor || "transparent"}"/>
    ${foreignObject}
  </svg>`;

  return svg;
}

/** Collect all computed styles */
function collectStyles(el: HTMLElement): string {
  const styles: string[] = [];
  const sheets = document.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    try {
      const rules = sheets[i].cssRules;
      for (let j = 0; j < rules.length; j++) {
        styles.push(rules[j].cssText);
      }
    } catch {
      // Cross-origin stylesheet
    }
  }
  return styles.join("\n");
}

/** Inline computed styles on a cloned tree */
function inlineAllStyles(source: HTMLElement, clone: HTMLElement) {
  const computed = window.getComputedStyle(source);
  const cloneComputed = window.getComputedStyle(clone);
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    const val = computed.getPropertyValue(prop);
    if (val && val !== cloneComputed.getPropertyValue(prop)) {
      clone.style.setProperty(prop, val);
    }
  }
  const sourceChildren = source.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < sourceChildren.length && i < cloneChildren.length; i++) {
    if (
      sourceChildren[i] instanceof HTMLElement &&
      cloneChildren[i] instanceof HTMLElement
    ) {
      inlineAllStyles(sourceChildren[i] as HTMLElement, cloneChildren[i] as HTMLElement);
    }
  }
}

/** Convert SVG string to data URL */
function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Render SVG to Canvas, then to Blob */
async function renderToCanvas(
  svgStr: string,
  width: number,
  height: number,
  px: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width * px;
  canvas.height = height * px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available");

  const img = new Image();
  const dataUrl = svgToDataUrl(svgStr);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Failed to render SVG to image"));
    img.src = dataUrl;
  });
}

/** Convert DOM to PNG data URL */
export async function toPng(
  el: HTMLElement,
  options: DomToImageOptions = {},
): Promise<string> {
  const px = options.pixelRatio || 1;
  const width = options.width || el.offsetWidth;
  const height = options.height || el.offsetHeight;
  const svg = await serializeElement(el, options);
  const canvas = await renderToCanvas(svg, width, height, px);
  return canvas.toDataURL("image/png");
}

/** Convert DOM to JPEG data URL */
export async function toJpeg(
  el: HTMLElement,
  options: DomToImageOptions = {},
): Promise<string> {
  const px = options.pixelRatio || 1;
  const width = options.width || el.offsetWidth;
  const height = options.height || el.offsetHeight;
  const svg = await serializeElement(el, options);
  const canvas = await renderToCanvas(svg, width, height, px);
  return canvas.toDataURL("image/jpeg", options.quality || 0.92);
}

/** Convert DOM to Blob */
export async function toBlob(
  el: HTMLElement,
  options: DomToImageOptions = {},
): Promise<Blob> {
  const px = options.pixelRatio || 1;
  const width = options.width || el.offsetWidth;
  const height = options.height || el.offsetHeight;
  const format = options.format || "png";
  const mime = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
  const svg = await serializeElement(el, options);
  const canvas = await renderToCanvas(svg, width, height, px);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      mime,
      options.quality || 0.92,
    );
  });
}

/** Convert DOM to Canvas */
export async function toCanvas(
  el: HTMLElement,
  options: DomToImageOptions = {},
): Promise<HTMLCanvasElement> {
  const px = options.pixelRatio || 1;
  const width = options.width || el.offsetWidth;
  const height = options.height || el.offsetHeight;
  const svg = await serializeElement(el, options);
  return renderToCanvas(svg, width, height, px);
}

export default { toPng, toJpeg, toBlob, toCanvas };
