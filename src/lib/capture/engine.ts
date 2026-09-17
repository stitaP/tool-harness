/**
 * Client-side capture engine (blueprint §3, §6–§13).
 *
 * A CaptureJob is an explicit state machine. Each stage produces structured
 * progress, diagnostics and warnings. Two source pipelines are supported:
 *
 *  - "demo" — the built-in documentation page, rendered into a scrollable
 *    stage in the workspace and captured with html-to-image (real browser
 *    rendering, tiled into multiple <image> elements for tall pages).
 *  - "url" — a render by the self-hosted capture service, proxied through the Convex action.
 *
 * After the raster pipeline both paths share: generate SVG → sanitize →
 * validate → done.
 */

import { toCanvas } from "html-to-image";
import { buildPortableSvg, sanitizeSvg } from "./svg";
import { snapshotDom, summarizeSnapshot } from "./hybrid";
import { validateSvg } from "./validate";
import { defaultMetadataFor } from "./metadata";
import { validateCaptureUrl } from "./urlSecurity";
import { scanUrlForSensitive } from "./security";
import {
  CaptureDocument,
  CaptureJobResult,
  CaptureJobState,
  CaptureOcrState,
  CaptureRequest,
  CaptureMode,
  DomSnapshot,
  JOB_STATUSES,
  JobStage,
  JobStatus,
  JobTerminalStatus,
  MAX_TILE_HEIGHT,
  RasterTile,
  RasterFormat,
} from "./types";
import { uid } from "./download";

const FREEZE_CSS = `#stitap-stage *,
#stitap-stage *::before,
#stitap-stage *::after {
  animation-play-state: paused !important;
  caret-color: transparent !important;
  transition-property: none !important;
  scroll-behavior: auto !important;
}`;

const CAPTURE_HEIGHT_LIMIT = 14_000; // CSS px * scale (canvas raster limits)

export interface CaptureStageRefs {
  container?: HTMLElement;
  content?: HTMLElement;
}

export interface EngineDeps {
  stageRefs: () => CaptureStageRefs;
  captureUrlAction?: (args: {
    url: string;
    format: "png" | "webp";
    fullPage: boolean;
    width: number;
    height: number;
    scale: number;
  }) => Promise<
    | { ok: true; base64: string; format: "png" | "webp" }
    | { ok: false; reason: string; message?: string }
  >;
  /**
   * Desktop-shell local engine (Tauri). When provided, URL captures go to the
   * embedded engine on 127.0.0.1 instead of the remote capture service — the
   * same contract, same result shape (see `src/lib/capture/desktop.ts`).
   */
  localCaptureUrl?: (args: {
    url: string;
    format: "png" | "webp";
    fullPage: boolean;
    width: number;
    height: number;
    scale: number;
  }) => Promise<
    | { ok: true; base64: string; format: "png" | "webp" }
    | { ok: false; reason: string; message?: string }
  >;
  /**
   * OCR-at-capture strategy (workspace-provided, browser-only — see
   * `src/lib/capture/ocr.ts`). Runs inside the processing stage when the
   * request has `intelligence.ocrAtCapture`; the result is persisted on the
   * capture document as `ocrLayers`. Never blocks the job — failures degrade
   * to `status: "failed"` + a warning.
   */
  ocrAtCapture?: (ctx: {
    tiles: RasterTile[];
    /** Live-DOM hybrid snapshot — demo captures extract text instantly from it. */
    demoSnapshot?: DomSnapshot;
  }) => Promise<CaptureOcrState>;
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Hard cap on the lazy-content stage. Lazy loading is best-effort: the scroll
 * walk must never keep the preview hostage (worst case before this cap was
 * maximumPasses × (delayMs + image wait) ≈ 2+ minutes — effectively a hang on
 * slower mobile browsers). 15s covers even tall demo pages with several
 * scroll-triggered sections; anything still loading degrades with a warning.
 */
const LAZY_LOAD_DEADLINE_MS = 15_000;

/** Per-pass image-decode cap — images load eagerly now, so 1s is generous. */
const IMAGE_WAIT_CAP_MS = 1_000;

async function waitImagesDecoded(root: HTMLElement, capMs = 3_000) {
  const imgs = Array.from(root.querySelectorAll("img")).filter((i) => !i.complete);
  if (imgs.length === 0) return;
  // The capture stage is rendered offscreen (CaptureStage: left:-12000px), so
  // Chromium's viewport-based lazy loading never starts these images and
  // img.decode() would hang forever — the whole job would stall in the
  // loading-lazy-content stage. Capture semantics want every image loaded, so
  // force eager loading first, and cap the wait so a pathological image
  // (unreachable remote URL, display:none, …) degrades instead of hanging.
  for (const img of imgs) img.loading = "eager";
  await Promise.race([
    Promise.all(imgs.map((i) => i.decode().catch(() => undefined))),
    delay(capMs),
  ]);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the captured image"));
    img.src = src;
  });
}

/* ------------------------------------------------------------------ */
/* Job                                                                  */
/* ------------------------------------------------------------------ */

export class CaptureJob {
  state: CaptureJobState;
  private cancelled = false;
  private readonly onUpdate: () => void;

  constructor(onUpdate: () => void) {
    this.onUpdate = onUpdate;
    this.state = {
      id: uid("job"),
      phase: "created",
      startedAt: Date.now(),
      stages: JOB_STATUSES.map(
        (name): JobStage => ({
          name,
          state: "pending",
          durationMs: 0,
          diagnostics: [],
          warnings: [],
        }),
      ),
    };
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.finishTerminal("cancelled", "Capture cancelled by the user.");
  }

  private emit() {
    this.onUpdate();
  }

  private stage(name: JobStatus): JobStage {
    return this.state.stages.find((s) => s.name === name)!;
  }

  private setActive(name: JobStatus) {
    const s = this.stage(name);
    s.state = "active";
    s.durationMs = 0;
    s._startedAt = performance.now();
    this.state.phase = name;
    this.emit();
  }

  private done(name: JobStatus, warnings: string[] = [], diagnostics: string[] = []) {
    const s = this.stage(name);
    s.state = "done";
    s.durationMs = Math.round(performance.now() - (s._startedAt ?? performance.now()));
    s.warnings.push(...warnings);
    s.diagnostics.push(...diagnostics);
    this.emit();
  }

  private skip(name: JobStatus, diagnostics: string[] = []) {
    const s = this.stage(name);
    if (s.state !== "pending") return;
    s.state = "skipped";
    s.durationMs = 0;
    s.diagnostics.push(...diagnostics);
    this.emit();
  }

  private log(name: JobStatus, message: string) {
    this.stage(name).diagnostics.push(message);
    this.emit();
  }

  private warn(name: JobStatus, message: string) {
    this.stage(name).warnings.push(message);
    this.emit();
  }

  private finishTerminal(status: JobTerminalStatus, error?: string, errorCode?: string) {
    this.state.phase = status;
    this.state.endedAt = Date.now();
    if (error) this.state.error = error;
    if (errorCode) this.state.errorCode = errorCode;
    for (const s of this.state.stages) {
      if (s.state === "pending") s.state = "skipped";
    }
    this.emit();
  }

  private complete() {
    this.state.phase = "completed";
    this.state.endedAt = Date.now();
    for (const s of this.state.stages) {
      if (s.state === "pending") s.state = "skipped";
    }
    this.emit();
  }

  private fail(message: string, code?: string) {
    this.finishTerminal("failed", message, code);
  }

  /**
   * OCR-at-capture (blueprint §14): runs the injected strategy when the
   * request opts in, and records the outcome on the job. Never throws —
   * failures become `status: "failed"` so the capture still completes.
   */
  private async maybeRunOcr(
    deps: EngineDeps,
    tiles: RasterTile[],
    demoSnapshot?: DomSnapshot,
  ): Promise<CaptureOcrState | undefined> {
    if (this.cancelled || !deps.ocrAtCapture) return undefined;
    try {
      const ocr = await deps.ocrAtCapture({ tiles, demoSnapshot });
      if (!ocr || ocr.status === "none") return undefined;
      this.log(
        "processing",
        `OCR-at-capture: ${ocr.layers.length} block(s) via ${ocr.engine}${ocr.truncated ? " (capped)" : ""}`,
      );
      if (ocr.status === "failed") {
        this.warn("processing", "OCR-at-capture failed — the Intelligence tab can re-run it");
      }
      return ocr;
    } catch (e) {
      this.warn(
        "processing",
        `OCR-at-capture unavailable: ${e instanceof Error ? e.message : "unknown error"}`,
      );
      return undefined;
    }
  }

  /** Run the pipeline. Resolves with the capture result or null on failure. */
  async run(request: CaptureRequest, deps: EngineDeps): Promise<CaptureJobResult | null> {
    try {
      const result =
        request.source.type === "url"
          ? await this.captureFromUrl(request, deps)
          : await this.captureFromDemo(request, deps);
      return result;
    } catch (e) {
      if (!this.cancelled) {
        this.fail(
          e instanceof Error ? e.message : "The capture failed unexpectedly.",
        );
      }
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Shared tail: generate SVG → sanitize → validate                     */
  /* ------------------------------------------------------------------ */

  private async finalize(
    doc: CaptureDocument,
  ): Promise<{ svg: string; report: CaptureJobResult["report"] } | null> {
    if (this.cancelled) return null;
    this.setActive("generating-svg");
    const model = defaultMetadataFor(doc);
    const raw = buildPortableSvg(doc, {
      model,
      annotations: [],
      outputMode: "portable",
    });
    this.log("generating-svg", `${raw.length.toLocaleString()} bytes before sanitization`);
    this.done("generating-svg");

    this.setActive("sanitizing");
    let svg = raw;
    let warnings: string[] = [];
    try {
      const result = sanitizeSvg(raw);
      svg = result.svg;
      warnings = result.warnings;
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "Sanitization failed");
      return null;
    }
    if (warnings.length > 0) this.warn("sanitizing", `${warnings.length} sanitization warnings`);
    this.done("sanitizing");

    this.setActive("validating");
    this.log("validating", `Offline <img> render against ${doc.canvas.width} × ${doc.canvas.height}`);
    const report = await validateSvg(svg, doc.canvas.width, doc.canvas.height);
    if (!report.ok) {
      const failed = report.checks.filter((c) => !c.passed).map((c) => c.label);
      this.warn("validating", `Validation warnings: ${failed.join(", ")}`);
    }
    this.done("validating");

    this.setActive("saving");
    this.log("saving", "Capture ready in the editor");
    this.done("saving");
    this.complete();
    return { svg, report };
  }

  /* ------------------------------------------------------------------ */
  /* URL pipeline (self-hosted capture service via the Convex action)     */
  /* ------------------------------------------------------------------ */

  private async captureFromUrl(
    request: CaptureRequest,
    deps: EngineDeps,
  ): Promise<CaptureJobResult | null> {
    const url = request.source.url ?? "";
    this.setActive("validating-request");
    if (request.mode === "element") {
      this.log(
        "validating-request",
        "Element capture requires DOM access, which remote URL captures do not have",
      );
      this.fail(
        "Element capture works with the built-in demo page — a URL capture can't reach into a remote page's DOM. Use Viewport, Full page, or Region for URLs.",
        "element-unsupported",
      );
      return null;
    }
    const check = validateCaptureUrl(url);
    if (!check.ok) {
      this.log("validating-request", `Rejected: ${check.reason}`);
      this.done("validating-request");
      this.finishTerminal("blocked-by-policy", check.reason, "url-blocked");
      return null;
    }
    this.log("validating-request", "URL normalized and authorized");
    const sensitive = scanUrlForSensitive(check.url);
    if (sensitive.length > 0) {
      this.warn(
        "validating-request",
        `The source URL contains credential-like values (${sensitive.map((m) => m.label).join(", ")}) — consider redacting before publishing`,
      );
    }
    this.done("validating-request");

    this.skip("waiting-for-permission", ["Single-user policy — no permission prompt required"]);

    const action = deps.captureUrlAction;
    const local = deps.localCaptureUrl;
    if (!action && !local) {
      this.fail("Capture engine is not configured.");
      return null;
    }

    this.setActive("allocating-browser");
    this.log(
      "allocating-browser",
      local
        ? "Using the embedded capture engine on this machine…"
        : "Connecting to the capture service…",
    );
    this.done("allocating-browser");

    this.setActive("navigating");
    this.log("navigating", `Requesting ${request.mode} render of ${check.url}`);
    this.done("navigating");

    this.setActive("waiting-for-page");
    let res: Awaited<ReturnType<NonNullable<EngineDeps["captureUrlAction"]>>>;
    try {
      const args = {
        url: check.url,
        format: request.output.rasterFormat,
        fullPage: request.mode === "full-page" || request.mode === "region",
        width: request.viewport.width,
        height: request.viewport.height,
        scale: request.viewport.deviceScaleFactor,
      };
      res = local ? await local(args) : await action!(args);
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "Capture service call failed", "network");
      return null;
    }
    if (this.cancelled) return null;
    if (!res.ok) {
      if (res.reason === "missing-service") {
        this.fail(
          "URL capture needs the self-hosted capture service. Add CAPTURE_SERVICE_URL (and CAPTURE_SERVICE_API_KEY) in the project Keys tab — see /api for the docker one-liner.",
          "missing-service",
        );
      } else if (res.reason === "invalid-key") {
        this.fail(
          "The capture service rejected the API key. Check CAPTURE_SERVICE_API_KEY against the service's CAPTURE_API_KEYS.",
          "invalid-key",
        );
      } else if (res.reason === "unauthorized") {
        this.fail("You must be signed in to capture.", "unauthorized");
      } else {
        this.fail(res.message ?? res.reason, res.reason);
      }
      return null;
    }
    this.done("waiting-for-page", [], [`Received ${res.format.toUpperCase()} response`]);

    this.skip("discovering-page", ["Remote capture — inspection performed by the capture service"]);
    this.skip("preparing-page", ["Remote capture — page prepared by the capture service"]);
    this.skip("loading-lazy-content", ["Remote capture — lazy content handled by the capture service"]);
    this.skip("freezing-page", ["Remote capture — motion freeze handled by the capture service"]);

    this.setActive("capturing");
    const dataUrl = `data:image/${res.format};base64,${res.base64}`;
    const img = await loadImage(dataUrl);
    const scale = request.viewport.deviceScaleFactor;
    const cssW = img.naturalWidth / scale;
    const cssH = img.naturalHeight / scale;
    this.log("capturing", `Image ${img.naturalWidth} × ${img.naturalHeight}px (${scale}× scale)`);
    this.done("capturing");

    this.setActive("processing");
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    let source = canvas;
    let outW = cssW;
    let outH = cssH;
    if (request.mode === "region" && request.region) {
      const r = request.region;
      const x = Math.max(0, Math.round(r.x * scale));
      const y = Math.max(0, Math.round(r.y * scale));
      const w = Math.min(canvas.width - x, Math.max(1, Math.round(r.width * scale)));
      const h = Math.min(canvas.height - y, Math.max(1, Math.round(r.height * scale)));
      source = this.cropCanvas(canvas, x, y, w, h);
      outW = w / scale;
      outH = h / scale;
      this.log("processing", `Cropped remote render to ${Math.round(outW)}×${Math.round(outH)} CSS px`);
    }
    const tiles = this.sliceTiles(source, {
      mode: request.mode,
      cssW: outW,
      cssH: outH,
      scale,
      format: request.output.rasterFormat,
      quality: request.output.quality,
    });
    this.done("processing", [], [`Split into ${tiles.length} tile(s)`]);

    const ocr = request.intelligence.ocrAtCapture
      ? await this.maybeRunOcr(deps, tiles)
      : undefined;
    const doc: CaptureDocument = this.buildDocument(request, tiles, outW, outH, check.url, ocr);
    return this.finishDocument(doc);
  }

  /* ------------------------------------------------------------------ */
  /* Demo pipeline (real in-app browser rendering)                        */
  /* ------------------------------------------------------------------ */

  private async captureFromDemo(
    request: CaptureRequest,
    deps: EngineDeps,
  ): Promise<CaptureJobResult | null> {
    const { viewport } = request;
    this.setActive("validating-request");
    this.log("validating-request", "Request normalized; viewport clamped and limits applied");
    this.done("validating-request");

    this.skip("waiting-for-permission", ["Single-user policy — no permission prompt required"]);

    // --- allocating-browser: wait for the stage element to mount ---------
    // The stage can briefly unmount/remount under StrictMode, so require the
    // refs to exist AND be attached to the document before proceeding.
    this.setActive("allocating-browser");
    let refs: CaptureStageRefs = {};
    for (let i = 0; i < 60; i++) {
      refs = deps.stageRefs();
      if (refs.container?.isConnected && refs.content?.isConnected) break;
      await delay(150);
    }
    if (!refs.container?.isConnected || !refs.content?.isConnected) {
      this.fail("The capture stage did not mount.");
      return null;
    }
    const container = refs.container;
    const content = refs.content;
    container.id = "stitap-stage";
    this.log("allocating-browser", `Isolated viewport ${viewport.width} × ${viewport.height}`);
    this.done("allocating-browser");

    // --- navigating ------------------------------------------------------
    this.setActive("navigating");
    container.scrollTop = 0;
    this.log("navigating", "Navigated to the demo documentation page");
    this.done("navigating");

    // --- waiting-for-page: readiness + layout stability -------------------
    this.setActive("waiting-for-page");
    try {
      await document.fonts.ready;
    } catch {
      /* fonts.ready always resolves; defensive */
    }
    await waitImagesDecoded(content);
    const readiness = request.readiness;
    if (readiness.strategy === "selector" && readiness.selector) {
      const deadline = Date.now() + readiness.timeoutMs;
      let found = false;
      while (Date.now() < deadline) {
        try {
          if (content.querySelector(readiness.selector)) {
            found = true;
            break;
          }
        } catch {
          break; // invalid selector — proceed (recorded in the log)
        }
        await delay(100);
      }
      this.log(
        "waiting-for-page",
        found
          ? `Selector "${readiness.selector}" appeared`
          : `Selector "${readiness.selector}" not found before timeout — proceeding`,
      );
    } else if (readiness.strategy === "network-idle") {
      const deadline = Date.now() + readiness.timeoutMs;
      let last = -1;
      let quiet = 0;
      while (Date.now() < deadline) {
        const n = performance.getEntriesByType("resource").length;
        if (n === last) quiet += 1;
        else {
          quiet = 0;
          last = n;
        }
        if (quiet >= 8) break; // ~800ms without new resources
        await delay(100);
      }
      this.log("waiting-for-page", "Network idle (best-effort) — no new resources for ~800ms");
    }
    await delay(readiness.additionalDelayMs);
    let stable = false;
    let last = -1;
    let same = 0;
    // The layout-stability check only applies to the "load" strategy — the
    // other strategies define their own readiness signal above.
    if (readiness.strategy === "load") {
      for (let i = 0; i < 5; i++) {
        const h = content.scrollHeight;
        if (h === last) same += 1;
        else {
          same = 0;
          last = h;
        }
        if (same >= 3) {
          stable = true;
          break;
        }
        await delay(220);
      }
    } else {
      stable = true; // strategy defined its own wait above
    }
    this.log(
      "waiting-for-page",
      stable ? "Layout stable across 3+ geometry checks" : "Layout kept shifting — proceeding on timeout",
    );
    this.done("waiting-for-page");

    // --- discovering-page -------------------------------------------------
    this.setActive("discovering-page");
    const sw = content.scrollWidth;
    const sh = content.scrollHeight;
    const fixedCount = Array.from(content.querySelectorAll("*")).filter((el) => {
      const pos = window.getComputedStyle(el).position;
      return pos === "fixed" || pos === "sticky";
    }).length;
    const canvasCount = content.querySelectorAll("canvas").length;
    const videoCount = content.querySelectorAll("video").length;
    const imgCount = content.querySelectorAll("img").length;
    this.log("discovering-page", `Page ${sw} × ${sh}px`);
    this.log("discovering-page", `${fixedCount} fixed/sticky element(s), ${canvasCount} canvas, ${videoCount} video, ${imgCount} images`);
    const warnings: string[] = [];
    if (sh > viewport.height * 8) {
      warnings.push("Page is much taller than the viewport — possible infinite scroll detected");
    }
    if (sh > request.scrolling.maximumHeight) {
      warnings.push(`Page height exceeds the configured maximum (${request.scrolling.maximumHeight}px)`);
    }
    if (canvasCount > 0) warnings.push("Canvas regions will be embedded as raster content");
    if (warnings.length) this.warn("discovering-page", warnings[0]);
    this.done("discovering-page");

    // --- preparing-page: freeze -------------------------------------------
    this.setActive("preparing-page");
    const style = document.createElement("style");
    style.id = "stitap-freeze-style";
    style.textContent = FREEZE_CSS;
    document.head.appendChild(style);
    this.log("preparing-page", "Injected capture-only stylesheet (paused animations, hidden caret)");
    this.done("preparing-page");

    // --- loading-lazy-content: incremental scroll -------------------------
    this.setActive("loading-lazy-content");
    const stepPx = Math.max(120, Math.round(viewport.height * request.scrolling.stepRatio));
    const lazyDeadline = Date.now() + LAZY_LOAD_DEADLINE_MS;
    let passes = 0;
    let bottomStablePasses = 0;
    let reachedBottom = false;
    let prevHeight = content.scrollHeight;
    let deadlineHit = false;
    while (!this.cancelled) {
      if (Date.now() >= lazyDeadline) {
        deadlineHit = true;
        break;
      }
      const maxScroll = Math.max(0, content.scrollHeight - container.clientHeight);
      const next = Math.min(container.scrollTop + stepPx, maxScroll);
      container.scrollTop = next;
      await delay(request.scrolling.delayMs);
      await waitImagesDecoded(content, IMAGE_WAIT_CAP_MS);
      const h = content.scrollHeight;
      passes += 1;
      const grew = h > prevHeight + 2;
      prevHeight = h;
      const atBottom = container.scrollTop >= maxScroll - 2;
      if (atBottom) {
        if (!grew) bottomStablePasses += 1;
        else bottomStablePasses = 0;
      }
      if (h > request.scrolling.maximumHeight) {
        this.warn("loading-lazy-content", `Height limit reached at ${h}px — stopping`);
        break;
      }
      if (passes >= request.scrolling.maximumPasses) {
        this.warn("loading-lazy-content", `Pass limit reached (${passes}) — stopping`);
        break;
      }
      if (atBottom && !reachedBottom) {
        reachedBottom = true;
        bottomStablePasses = 0;
      }
      if (atBottom && bottomStablePasses >= 2) break;
    }
    if (deadlineHit) {
      this.warn(
        "loading-lazy-content",
        `Lazy-load deadline (${LAZY_LOAD_DEADLINE_MS / 1000}s) reached after ${passes} pass(es) — proceeding with content loaded so far`,
      );
    }
    this.log("loading-lazy-content", `${passes} scroll pass(es); final height ${content.scrollHeight}px`);
    container.scrollTop = 0;
    // Let reveal animations settle before the freeze + capture pass.
    await delay(650);
    this.done("loading-lazy-content");

    // --- freezing-page -----------------------------------------------------
    this.setActive("freezing-page");
    content.querySelectorAll("video").forEach((v) => v.pause());
    this.log("freezing-page", "Video elements paused; page returned to top");
    this.done("freezing-page");

    // --- capturing ----------------------------------------------------------
    this.setActive("capturing");
    const scale = viewport.deviceScaleFactor;
    const fullW = content.scrollWidth;
    const fullH = content.scrollHeight;

    // Resolve the capture rectangle (CSS px, content-relative).
    let rect: { x: number; y: number; width: number; height: number };
    if (request.mode === "element") {
      const selector = (request.source.selector ?? "").trim();
      if (!selector) {
        this.fail("Element capture requires a CSS selector.", "no-selector");
        return null;
      }
      const el = content.querySelector(selector);
      if (!el || !(el instanceof HTMLElement)) {
        this.fail(`Element not found: “${selector}”.`, "element-not-found");
        return null;
      }
      const cb = content.getBoundingClientRect();
      const eb = el.getBoundingClientRect();
      rect = { x: eb.left - cb.left, y: eb.top - cb.top, width: eb.width, height: eb.height };
      if (rect.width < 1 || rect.height < 1) {
        this.fail(`Element “${selector}” is not visible (zero size).`, "element-hidden");
        return null;
      }
      this.log(
        "capturing",
        `Element “${selector}” at ${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}×${Math.round(rect.height)}px`,
      );
    } else if (request.mode === "region") {
      const r = request.region;
      if (!r || r.width < 1 || r.height < 1) {
        this.fail("Region capture requires x, y, width and height.", "bad-region");
        return null;
      }
      const x = Math.min(Math.max(0, Math.round(r.x)), Math.max(0, fullW - 1));
      const y = Math.min(Math.max(0, Math.round(r.y)), Math.max(0, fullH - 1));
      rect = {
        x,
        y,
        width: Math.min(Math.max(1, Math.round(r.width)), Math.max(1, fullW - x)),
        height: Math.min(Math.max(1, Math.round(r.height)), Math.max(1, fullH - y)),
      };
      this.log("capturing", `Region ${rect.x},${rect.y} ${rect.width}×${rect.height}px`);
    } else if (request.mode === "viewport") {
      rect = {
        x: 0,
        y: 0,
        width: Math.min(viewport.width, fullW),
        height: Math.min(viewport.height, fullH),
      };
    } else {
      rect = { x: 0, y: 0, width: fullW, height: fullH };
    }

    // Raster only the resolved region (translate-crop) so tall pages can be
    // captured regionally without rendering the full height into one bitmap.
    if (Math.round(rect.height * scale) > CAPTURE_HEIGHT_LIMIT) {
      this.fail(
        `The capture region is ${rect.height}px tall — beyond the ${CAPTURE_HEIGHT_LIMIT}px in-browser raster limit. Use a smaller region or reduce the device scale factor.`,
        "too-tall",
      );
      return null;
    }
    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(content, {
        pixelRatio: scale,
        backgroundColor: "#ffffff",
        width: rect.width,
        height: rect.height,
        canvasWidth: Math.max(1, Math.round(rect.width * scale)),
        canvasHeight: Math.max(1, Math.round(rect.height * scale)),
        style: { transform: `translate(${-rect.x}px, ${-rect.y}px)` },
      });
    } catch (e) {
      this.fail(
        e instanceof Error ? `Raster capture failed: ${e.message}` : "Raster capture failed.",
        "raster",
      );
      return null;
    } finally {
      document.getElementById("stitap-freeze-style")?.remove();
    }
    if (this.cancelled) return null;
    this.log("capturing", `Rendered ${canvas.width} × ${canvas.height}px raster`);
    this.done("capturing");

    // --- processing: tiles --------------------------------------------------
    this.setActive("processing");
    const tiles = this.sliceTiles(canvas, {
      mode: request.mode,
      cssW: rect.width,
      cssH: rect.height,
      scale,
      format: request.output.rasterFormat,
      quality: request.output.quality,
    });
    this.done("processing", [], [`Split into ${tiles.length} tile(s)`]);

    // --- hybrid snapshot: live DOM → self-contained vector/raster model ------
    // The demo DOM is fully accessible in-process, so capture-time is the only
    // time we can snapshot it. Unsupported regions are cropped straight from
    // the raster canvas we just captured (blueprint §15, §28).
    let hybrid: CaptureJobResult["hybrid"];
    try {
      const snapshot = snapshotDom(content, rect, scale, canvas);
      const report = summarizeSnapshot(snapshot);
      hybrid = { snapshot, report };
      this.log(
        "processing",
        `Hybrid snapshot: ${report.totalNodes} nodes — ${report.counts.vectorRects} vector, ${report.counts.vectorTexts} text, ${report.counts.embeddedImages} image, ${report.counts.rasterFallbacks} raster fallback`,
      );
      if (report.truncated || report.warnings.length > 0) {
        this.warn("processing", `Hybrid snapshot ${report.truncated ? "truncated; " : ""}${report.warnings[0] ?? ""}`);
      }
    } catch (e) {
      this.warn(
        "processing",
        `Hybrid snapshot unavailable: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    }

    const ocr = request.intelligence.ocrAtCapture
      ? await this.maybeRunOcr(deps, tiles, hybrid?.snapshot)
      : undefined;
    const doc = this.buildDocument(
      request,
      tiles,
      rect.width,
      rect.height,
      `${window.location.origin}/demo`,
      ocr,
    );
    doc.source.title = "stitaP Docs — demonstration page";
    return this.finishDocument(doc, hybrid);
  }

  /* ------------------------------------------------------------------ */
  /* Shared helpers                                                       */
  /* ------------------------------------------------------------------ */

  /** Copy a rectangular region of a canvas into a new canvas (pixels). */
  private cropCanvas(
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ): HTMLCanvasElement {
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(width));
    out.height = Math.max(1, Math.round(height));
    const ctx = out.getContext("2d");
    if (ctx) ctx.drawImage(canvas, x, y, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  private sliceTiles(
    canvas: HTMLCanvasElement,
    opts: {
      mode: CaptureMode;
      cssW: number;
      cssH: number;
      scale: number;
      format: RasterFormat;
      quality: number;
    },
  ): RasterTile[] {
    const { cssW, cssH, scale, format, quality } = opts;
    const mime = format === "png" ? "image/png" : "image/webp";
    const tiles: RasterTile[] = [];
    const yStep = MAX_TILE_HEIGHT;
    let index = 0;
    let y = 0;
    while (y < cssH - 0.5) {
      const th = Math.min(yStep, cssH - y);
      const tile = document.createElement("canvas");
      tile.width = Math.max(1, Math.round(cssW * scale));
      tile.height = Math.max(1, Math.round(th * scale));
      const ctx = tile.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          canvas,
          0,
          Math.round(y * scale),
          tile.width,
          tile.height,
          0,
          0,
          tile.width,
          tile.height,
        );
      }
      tiles.push({
        id: `tile-${index++}`,
        x: 0,
        y: Math.round(y),
        width: Math.round(cssW),
        height: Math.round(th),
        dataUrl: tile.toDataURL(mime, quality),
      });
      y += th;
    }
    return tiles;
  }

  private buildDocument(
    request: CaptureRequest,
    tiles: RasterTile[],
    width: number,
    height: number,
    url: string,
    ocr?: CaptureOcrState,
  ): CaptureDocument {
    const now = new Date();
    return {
      documentId: `cap-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${uid().slice(-6)}`,
      canvas: { width: Math.round(width), height: Math.round(height), background: "#ffffff" },
      source: {
        title: request.source.type === "url" ? url : "stitaP Docs — demonstration page",
        url,
        capturedAt: now.toISOString(),
        mode: request.mode,
        target:
          request.mode === "element"
            ? `element ${request.source.selector ?? ""}`
            : request.mode === "region" && request.region
              ? `region ${request.region.x},${request.region.y} ${request.region.width}×${request.region.height}`
              : undefined,
        viewport: { ...request.viewport },
      },
      baseLayers: tiles,
      ocr,
      warnings: [],
    };
  }

  private async finishDocument(
    doc: CaptureDocument,
    hybrid?: CaptureJobResult["hybrid"],
  ): Promise<CaptureJobResult | null> {
    const final = await this.finalize(doc);
    if (!final) return null;
    return { document: doc, svg: final.svg, report: final.report, hybrid };
  }
}

/* ------------------------------------------------------------------ */
/* PNG → CaptureDocument (Phase D: open extension captures in editor)   */
/*                                                                      */
/* Current-tab captures are stored as a single PNG (device px). This    */
/* rebuilds a CaptureDocument in CSS px (dividing by deviceScaleFactor) */
/* and slices tall images into MAX_TILE_HEIGHT tiles so the portable    */
/* SVG stays within raster limits (blueprint §13).                      */
/* ------------------------------------------------------------------ */

export interface RasterOpenMeta {
  url?: string;
  title?: string;
  capturedAt?: string;
  mode?: CaptureMode;
  deviceScaleFactor?: number;
}

/**
 * Load a raster data URL (PNG/WebP) and build a tiled CaptureDocument.
 * `dataUrl` pixels are device px; the document canvas is CSS px.
 */
export async function rasterDocumentFromDataUrl(
  dataUrl: string,
  meta: RasterOpenMeta = {},
): Promise<CaptureDocument> {
  const img = await loadImage(dataUrl);
  const dpr = Math.max(
    1,
    Math.min(3, Math.round(meta.deviceScaleFactor ?? 1)),
  );
  const cssW = img.naturalWidth / dpr;
  const cssH = img.naturalHeight / dpr;

  const tiles: RasterTile[] = [];
  const mime = dataUrl.startsWith("data:image/webp") ? "image/webp" : "image/png";
  const yStep = MAX_TILE_HEIGHT;
  let index = 0;
  for (let y = 0; y < cssH - 0.5; y += yStep) {
    const th = Math.min(yStep, cssH - y);
    const tile = document.createElement("canvas");
    tile.width = Math.max(1, Math.round(cssW * dpr));
    tile.height = Math.max(1, Math.round(th * dpr));
    const ctx = tile.getContext("2d");
    if (ctx) {
      ctx.drawImage(
        img,
        0,
        Math.round(y * dpr),
        tile.width,
        tile.height,
        0,
        0,
        tile.width,
        tile.height,
      );
    }
    tiles.push({
      id: `tile-${index++}`,
      x: 0,
      y: Math.round(y),
      width: Math.round(cssW),
      height: Math.round(th),
      dataUrl: tile.toDataURL(mime, 0.95),
    });
  }

  const now = new Date();
  return {
    documentId: `cap-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${uid().slice(-6)}`,
    canvas: { width: Math.round(cssW), height: Math.round(cssH), background: "#ffffff" },
    source: {
      title: meta.title || "Current tab capture",
      url: meta.url,
      capturedAt: meta.capturedAt || now.toISOString(),
      mode: meta.mode || "full-page",
      viewport: { width: Math.round(cssW), height: Math.round(cssH), deviceScaleFactor: dpr },
    },
    baseLayers: tiles,
    warnings: [],
  };
}
