// Desktop (Tauri) integration.
//
// When the app runs inside the native shell, the from-scratch capture engine
// is embedded in the same process and answers on 127.0.0.1. The webview
// discovers it through the Tauri IPC bridge (`window.__TAURI__`) and routes
// URL captures to it directly — no remote capture service required, so URL
// capture works fully offline on the desktop.

export interface DesktopEngine {
  engineUrl: string;
}

export interface DesktopCaptureArgs {
  url: string;
  format: "png" | "webp";
  fullPage: boolean;
  width: number;
  height: number;
  scale: number;
  timeoutMs?: number;
}

export type DesktopCaptureResult =
  | { ok: true; base64: string; format: "png" | "webp" }
  | { ok: false; format: "png" | "webp"; reason: string; message?: string };

/** Bounds of the primary display, returned by the Tauri engine. */
export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Result of a native screen capture (full or region). */
export interface ScreenCaptureResult {
  ok: boolean;
  width: number;
  height: number;
  /** Base64-encoded PNG. */
  base64: string;
  error?: string;
}

/** Sandbox isolation level for capture operations. */
export type SandboxIsolationLevel = "none" | "basic" | "full";

/** Resource limits for a sandboxed capture operation. */
export interface SandboxResourceLimits {
  maxTimeSecs: number;
  maxMemoryBytes: number;
  maxOpenFiles: number;
  maxFileSizeBytes: number;
  maxProcesses: number;
  maxCpuSecs: number;
}

/** Sandbox configuration for a capture type. */
export interface SandboxConfigInfo {
  isolationLevel: SandboxIsolationLevel;
  resources: SandboxResourceLimits;
  label: string;
}

/** Sandbox violation record. */
export interface SandboxViolation {
  kind: string;
  message: string;
}

/** Sandbox status snapshot. */
export interface SandboxStatusInfo {
  active: boolean;
  isolationLevel: SandboxIsolationLevel;
  label: string;
  elapsedSecs: number;
  violations: SandboxViolation[];
}

/** Policy configuration from the engine. */
export interface PolicyConfigInfo {
  globalDomainRules: Array<{ pattern: string; reason: string; action: "allow" | "block" }>;
  capturePolicies: Record<string, unknown>;
  retentionPolicies: Record<string, unknown>;
  activePreset: string;
}

/** Audit log summary statistics. */
export interface AuditSummary {
  totalCount: number;
  bufferLen: number;
  byKind: Record<string, number>;
  bySeverity: Record<string, number>;
  bySource: Record<string, number>;
}

/** A single audit log entry. */
export interface AuditEntry {
  id: number;
  timestampMs: number;
  kind: string;
  severity: string;
  message: string;
  source: string;
  identity: string;
  documentId: string;
  url: string;
  details: Record<string, string>;
}

/** Audit log page response. */
export interface AuditLogResponse {
  entries: AuditEntry[];
  count: number;
}

/** Get the sandbox configuration for a capture type via Tauri IPC. */
export async function getSandboxConfig(
  captureType: "url" | "screen" | "trusted",
): Promise<SandboxConfigInfo | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<SandboxConfigInfo>("sandbox_config", { captureType });
  } catch {
    return null;
  }
}

/** Get the current sandbox status via Tauri IPC. */
export async function getSandboxStatus(): Promise<SandboxStatusInfo | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<SandboxStatusInfo>("sandbox_status");
  } catch {
    return null;
  }
}

/** Get the policy configuration via Tauri IPC. */
export async function getPolicyConfig(): Promise<PolicyConfigInfo | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<PolicyConfigInfo>("policy_config");
  } catch {
    return null;
  }
}

/** Check whether a URL is allowed by domain policy via Tauri IPC. */
export async function policyCheckUrl(
  url: string,
): Promise<{ allowed: boolean; url: string; reason?: string } | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<{ allowed: boolean; url: string; reason?: string }>("policy_check_url", { url });
  } catch {
    return null;
  }
}

/** Get audit log summary statistics via Tauri IPC. */
export async function getAuditSummary(): Promise<AuditSummary | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<AuditSummary>("audit_summary");
  } catch {
    return null;
  }
}

/** Get recent audit log entries via Tauri IPC. */
export async function getAuditEntries(limit: number = 50): Promise<AuditLogResponse | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<AuditLogResponse>("audit_entries", { limit });
  } catch {
    return null;
  }
}

/** Detect whether the app is running inside the Tauri desktop shell. */
export function isDesktopShell(): boolean {
  return typeof window.__TAURI__?.core?.invoke === "function";
}

/** Get the primary display bounds via the Tauri IPC bridge. */
export async function getScreenBounds(): Promise<ScreenBounds | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<ScreenBounds>("screen_bounds");
  } catch {
    return null;
  }
}

/** Capture the full screen via the native engine. */
export async function captureScreenNative(): Promise<ScreenCaptureResult> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return { ok: false, width: 0, height: 0, base64: "", error: "Not running in desktop shell" };
  try {
    return await invoke<ScreenCaptureResult>("capture_screen");
  } catch (err) {
    return {
      ok: false,
      width: 0,
      height: 0,
      base64: "",
      error: (err instanceof Error && err.message) || "Screen capture failed",
    };
  }
}

/** Capture a rectangular region of the screen via the native engine. */
export async function captureScreenRegionNative(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<ScreenCaptureResult> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return { ok: false, width: 0, height: 0, base64: "", error: "Not running in desktop shell" };
  try {
    return await invoke<ScreenCaptureResult>("capture_screen_region", { x, y, width, height });
  } catch (err) {
    return {
      ok: false,
      width: 0,
      height: 0,
      base64: "",
      error: (err instanceof Error && err.message) || "Region capture failed",
    };
  }
}

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T = unknown>(
          cmd: string,
          args?: Record<string, unknown>,
        ) => Promise<T>;
      };
    };
  }
}

/** Detect the desktop shell and return the embedded engine's base URL. */
export async function getDesktopEngine(): Promise<DesktopEngine | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  try {
    const url = await invoke<string>("engine_url");
    if (url) return { engineUrl: url };
  } catch {
    /* not running in the desktop shell (or the engine failed to start) */
  }
  return null;
}

/**
 * Capture a URL through the embedded engine. Mirrors the query contract of
 * the engine's `/v1/capture` endpoint (see engines/src/server.rs) and the
 * return shape of the Convex `captureUrl` action, so the engine's URL path in
 * `src/lib/capture/engine.ts` can swap between the two transparently.
 */
export async function captureViaDesktopEngine(
  engine: DesktopEngine,
  args: DesktopCaptureArgs,
): Promise<DesktopCaptureResult> {
  const params = new URLSearchParams({
    url: args.url,
    format: args.format,
    full_page: String(args.fullPage),
    viewport_width: String(Math.max(1, Math.round(args.width))),
    viewport_height: String(Math.max(1, Math.round(args.height))),
    device_scale_factor: String(Math.max(1, Math.min(4, Math.round(args.scale)))),
  });
  if (args.timeoutMs && args.timeoutMs > 0) {
    params.set("timeout", String(args.timeoutMs));
  }

  try {
    const res = await fetch(`${engine.engineUrl}/v1/capture?${params.toString()}`, {
      headers: { Accept: "image/png, image/webp" },
    });
    if (!res.ok) {
      let message = `Capture service returned HTTP ${res.status}.`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body && typeof body.message === "string") message = body.message;
      } catch {
        /* non-JSON error body */
      }
      return {
        ok: false,
        format: args.format,
        reason: res.status === 401 ? "invalid-key" : "capture-failed",
        message,
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { ok: true, format: args.format, base64: btoa(binary) };
  } catch (err) {
    return {
      ok: false,
      format: args.format,
      reason: "network",
      message:
        (err instanceof Error && err.message) ||
        "The local capture service is unreachable.",
    };
  }
}
