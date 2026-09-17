/* ─── stitaP — Automated Capture Orchestrator ─── */

/**
 * Orchestrates automated browser actions (via CDP) to capture
 * screenshots at each step of a tutorial.
 *
 * Each step: perform action → wait → capture → annotate → save.
 */

/* ═══════════════════════════════════════════════════════════
   SECTION 1: Types
   ═══════════════════════════════════════════════════════════ */

export interface CaptureStep {
  stepNumber: number;
  action: CaptureAction;
  /** What to capture after the action */
  capture: CaptureTarget;
  /** Narration text */
  narration: string;
  /** Annotations to overlay */
  annotations: CaptureAnnotation[];
  /** Wait before capture (ms) */
  waitBefore?: number;
  /** Screenshot description */
  description?: string;
}

export type CaptureActionType =
  | "navigate"
  | "click"
  | "type"
  | "scroll"
  | "hover"
  | "wait"
  | "resize"
  | "screenshot-only";

export interface CaptureAction {
  type: CaptureActionType;
  selector?: string;
  text?: string;
  url?: string;
  scrollPixels?: number;
  waitMs?: number;
  viewport?: { width: number; height: number };
}

export interface CaptureTarget {
  /** What to screenshot */
  type: "viewport" | "element" | "region";
  selector?: string;
  region?: { x: number; y: number; width: number; height: number };
  /** Output filename */
  filename?: string;
}

export interface CaptureAnnotation {
  type: "arrow" | "rectangle" | "circle" | "text" | "number-badge" | "highlight";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  number?: number;
  color?: string;
}

export interface CaptureResult {
  stepNumber: number;
  filename: string;
  /** Base64-encoded screenshot */
  dataUrl: string;
  /** Captured element info */
  elementInfo?: { tag: string; text: string; bounds: DOMRect };
  /** Timing */
  capturedAt: number;
  durationMs: number;
}

export interface OrchestratorConfig {
  /** Base URL */
  baseUrl: string;
  /** Credentials */
  credentials?: {
    loginUrl?: string;
    username: string;
    password: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successSelector?: string;
  };
  /** Viewport */
  viewport?: { width: number; height: number };
  /** Wait between steps (ms) */
  stepDelay?: number;
  /** Max retry attempts per step */
  maxRetries?: number;
  /** Callback for progress */
  onProgress?: (step: number, total: number, result?: CaptureResult) => void;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: CDP Command Generator
   ═══════════════════════════════════════════════════════════ */

/** Generate CDP protocol commands for a capture step */
export function generateCDPCommands(step: CaptureStep): Array<{
  method: string;
  params: Record<string, unknown>;
  description: string;
}> {
  const commands: Array<{ method: string; params: Record<string, unknown>; description: string }> = [];

  // 1. Execute the action
  switch (step.action.type) {
    case "navigate":
      commands.push({
        method: "Page.navigate",
        params: { url: step.action.url || "" },
        description: `Navigate to ${step.action.url}`,
      });
      commands.push({
        method: "Page.enable",
        params: {},
        description: "Enable page events",
      });
      break;

    case "click":
      if (step.action.selector) {
        commands.push({
          method: "Runtime.evaluate",
          params: {
            expression: `
              (function() {
                const el = document.querySelector('${step.action.selector}');
                if (el) {
                  el.scrollIntoView({ block: 'center' });
                  el.click();
                  return true;
                }
                return false;
              })()
            `,
            returnByValue: true,
          },
          description: `Click ${step.action.selector}`,
        });
      }
      break;

    case "type":
      if (step.action.selector && step.action.text) {
        // Focus the element first, then type
        commands.push({
          method: "Runtime.evaluate",
          params: {
            expression: `
              (function() {
                const el = document.querySelector('${step.action.selector}');
                if (el) {
                  el.focus();
                  el.value = '';
                  return true;
                }
                return false;
              })()
            `,
            returnByValue: true,
          },
          description: `Focus ${step.action.selector}`,
        });
        // Type each character
        for (const char of step.action.text) {
          commands.push({
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyDown",
              text: char,
              key: char,
              code: `Key${char.toUpperCase()}`,
            },
            description: `Type "${char}"`,
          });
        }
      }
      break;

    case "scroll":
      const scrollPx = step.action.scrollPixels || 500;
      commands.push({
        method: "Runtime.evaluate",
        params: {
          expression: `window.scrollBy(0, ${scrollPx})`,
          returnByValue: true,
        },
        description: `Scroll ${scrollPx}px`,
      });
      break;

    case "hover":
      if (step.action.selector) {
        commands.push({
          method: "Runtime.evaluate",
          params: {
            expression: `
              (function() {
                const el = document.querySelector('${step.action.selector}');
                if (el) {
                  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                  return true;
                }
                return false;
              })()
            `,
            returnByValue: true,
          },
          description: `Hover over ${step.action.selector}`,
        });
      }
      break;

    case "wait":
      // Handled by delay in the orchestrator
      break;

    case "resize":
      if (step.action.viewport) {
        commands.push({
          method: "Emulation.setDeviceMetricsOverride",
          params: {
            width: step.action.viewport.width,
            height: step.action.viewport.height,
            deviceScaleFactor: 1,
            mobile: false,
          },
          description: `Resize viewport to ${step.action.viewport.width}x${step.action.viewport.height}`,
        });
      }
      break;

    case "screenshot-only":
      // Just capture, no action needed
      break;
  }

  // 2. Wait if specified
  if (step.waitBefore && step.waitBefore > 0) {
    commands.push({
      method: "Runtime.evaluate",
      params: {
        expression: `await new Promise(r => setTimeout(r, ${step.waitBefore}))`,
        awaitPromise: true,
      },
      description: `Wait ${step.waitBefore}ms`,
    });
  }

  // 3. Capture screenshot
  switch (step.capture.type) {
    case "viewport":
      commands.push({
        method: "Page.captureScreenshot",
        params: {
          format: "png",
          quality: 100,
        },
        description: "Capture viewport screenshot",
      });
      break;

    case "element":
      if (step.capture.selector) {
        commands.push({
          method: "Runtime.evaluate",
          params: {
            expression: `
              (function() {
                const el = document.querySelector('${step.capture.selector}');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
              })()
            `,
            returnByValue: true,
          },
          description: `Get bounds of ${step.capture.selector}`,
        });
        commands.push({
          method: "Page.captureScreenshot",
          params: {
            format: "png",
            clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
          },
          description: "Capture element region",
        });
      }
      break;

    case "region":
      if (step.capture.region) {
        commands.push({
          method: "Page.captureScreenshot",
          params: {
            format: "png",
            clip: {
              x: step.capture.region.x,
              y: step.capture.region.y,
              width: step.capture.region.width,
              height: step.capture.region.height,
              scale: 1,
            },
          },
          description: "Capture region",
        });
      }
      break;
  }

  return commands;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: Step Builder (from parsed docs)
   ═══════════════════════════════════════════════════════════ */

import type { TutorialStep } from "./doc-parser";

/** Convert TutorialSteps to CaptureSteps */
export function buildCaptureSteps(steps: TutorialStep[]): CaptureStep[] {
  return steps.map((step, i) => ({
    stepNumber: step.stepNumber,
    action: {
      type: step.action.type as CaptureActionType,
      selector: step.action.selector,
      text: step.action.text,
      url: step.action.url,
      scrollPixels: step.action.scrollDirection === "down" ? 500 : step.action.scrollDirection === "up" ? -500 : undefined,
      waitMs: step.action.waitMs,
    },
    capture: {
      type: step.captureSelector ? "element" : "viewport",
      selector: step.captureSelector,
    },
    narration: step.narration,
    annotations: step.annotations.map(a => ({
      type: a.type as CaptureAnnotation["type"],
      x: a.x || 50,
      y: a.y || 50,
      width: a.width,
      height: a.height,
      text: a.text,
      number: a.number,
      color: a.color,
    })),
    waitBefore: step.action.type === "navigate" ? 3000 : step.action.type === "click" ? 500 : 200,
    description: step.screenshotDescription,
  }));
}

/** Generate login sequence as CaptureSteps */
export function buildLoginSteps(config: OrchestratorConfig): CaptureStep[] {
  if (!config.credentials) return [];

  const c = config.credentials;
  return [
    {
      stepNumber: 0,
      action: { type: "navigate", url: c.loginUrl || `${config.baseUrl}/login` },
      capture: { type: "viewport" },
      narration: "Navigate to the login page",
      annotations: [],
      waitBefore: 3000,
    },
    {
      stepNumber: 0,
      action: { type: "type", selector: c.usernameSelector, text: c.username },
      capture: { type: "viewport" },
      narration: "Enter username",
      annotations: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 100, color: "#3b82f6" }],
      waitBefore: 500,
    },
    {
      stepNumber: 0,
      action: { type: "type", selector: c.passwordSelector, text: c.password },
      capture: { type: "viewport" },
      narration: "Enter password",
      annotations: [],
      waitBefore: 500,
    },
    {
      stepNumber: 0,
      action: { type: "click", selector: c.submitSelector },
      capture: { type: "viewport" },
      narration: "Click the login button",
      annotations: [{ type: "arrow", x: 50, y: 80, text: "Click here" }],
      waitBefore: 3000,
    },
  ];
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: Simulated Orchestrator (for testing)
   ═══════════════════════════════════════════════════════════ */

/** Simulate capture results (for testing without a real browser) */
export function simulateCaptures(steps: CaptureStep[]): CaptureResult[] {
  return steps.map((step, i) => ({
    stepNumber: step.stepNumber,
    filename: `step-${String(step.stepNumber).padStart(3, "0")}.png`,
    dataUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" fill="#1e293b"><rect width="1920" height="1080"/><text x="960" y="500" text-anchor="middle" fill="white" font-size="48">Step ${step.stepNumber}</text><text x="960" y="560" text-anchor="middle" fill="#94a3b8" font-size="24">${step.narration.slice(0, 60)}</text></svg>`)}`,
    capturedAt: Date.now(),
    durationMs: 50 + Math.random() * 100,
  }));
}

/* ═══════════════════════════════════════════════════════════
   SECTION 5: Batch Export
   ═══════════════════════════════════════════════════════════ */

/** Export capture results as a ZIP-compatible structure */
export function prepareExport(results: CaptureResult[]): Array<{
  name: string;
  data: string;
  type: string;
}> {
  return results.map(r => ({
    name: r.filename,
    data: r.dataUrl,
    type: "image/png",
  }));
}

/** Generate a manifest file for the captures */
export function generateManifest(
  results: CaptureResult[],
  narration: string[],
): string {
  const manifest = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    totalSteps: results.length,
    steps: results.map((r, i) => ({
      step: r.stepNumber,
      filename: r.filename,
      narration: narration[i] || "",
      durationMs: r.durationMs,
      capturedAt: new Date(r.capturedAt).toISOString(),
    })),
  };
  return JSON.stringify(manifest, null, 2);
}
