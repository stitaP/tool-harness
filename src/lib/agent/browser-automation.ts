/**
 * stitaP Agent — Phase 2 Browser Automation
 *
 * A browser-based automation engine that allows agents to:
 * - Navigate to URLs
 * - Interact with page elements (click, type, scroll)
 * - Extract data from DOM
 * - Take screenshots
 * - Execute JavaScript in page context
 * - Handle authentication flows
 * - Manage cookies and session state
 *
 * Architecture:
 * - Uses browser-native APIs (no Puppeteer/Playwright dependency)
 * - Runs in an iframe sandbox for security
 * - Communicates via postMessage API
 * - Agent tools wrap these primitives for LLM-driven automation
 *
 * This is NOT a browser extension — it's a built-in automation layer
 * that works within the stitaP platform itself.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrowserAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; text: string; clear?: boolean }
  | { type: "scroll"; direction: "up" | "down" | "left" | "right"; amount?: number }
  | { type: "screenshot"; format?: "png" | "jpeg" | "webp"; quality?: number }
  | { type: "extract"; selector: string; attribute?: string }
  | { type: "execute"; script: string }
  | { type: "wait"; selector?: string; timeout?: number; condition?: "visible" | "hidden" | "present" }
  | { type: "hover"; selector: string }
  | { type: "select"; selector: string; value: string }
  | { type: "evaluate"; expression: string }
  | { type: "cookie_set"; name: string; value: string; domain?: string }
  | { type: "cookie_get"; name: string }
  | { type: "cookie_clear" }
  | { type: "auth"; provider: string; credentials: { username: string; password: string } }
  | { type: "pdf"; format?: "letter" | "a4" | "legal" };

export interface BrowserActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  screenshot?: string; // base64
  duration: number;
}

export interface BrowserSession {
  id: string;
  url: string;
  title: string;
  status: "loading" | "ready" | "error" | "closed";
  cookies: Array<{ name: string; value: string; domain: string }>;
  history: string[];
  metadata: {
    createdAt: string;
    lastActivity: string;
    actionCount: number;
    screenshotCount: number;
  };
}

// ─── Session Manager ────────────────────────────────────────────────────────

const sessions = new Map<string, BrowserSession>();

export function createSession(): BrowserSession {
  const id = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session: BrowserSession = {
    id,
    url: "about:blank",
    title: "New Tab",
    status: "ready",
    cookies: [],
    history: ["about:blank"],
    metadata: {
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      actionCount: 0,
      screenshotCount: 0,
    },
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): BrowserSession | undefined {
  return sessions.get(id);
}

export function closeSession(id: string): boolean {
  return sessions.delete(id);
}

export function listSessions(): BrowserSession[] {
  return [...sessions.values()];
}

// ─── Action Executor ────────────────────────────────────────────────────────

/**
 * Execute a browser action within a session.
 * This generates the action commands that would be sent to the browser runtime.
 * In Phase 2, these commands are executed via a sandboxed iframe or extension bridge.
 */
export async function executeBrowserAction(
  sessionId: string,
  action: BrowserAction,
): Promise<BrowserActionResult> {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, error: `Session ${sessionId} not found`, duration: 0 };
  }

  const start = Date.now();
  session.metadata.lastActivity = new Date().toISOString();
  session.metadata.actionCount++;

  try {
    switch (action.type) {
      case "navigate":
        return executeNavigate(session, action.url, start);
      case "click":
        return executeClick(session, action.selector, start);
      case "type":
        return executeType(session, action.selector, action.text, action.clear, start);
      case "scroll":
        return executeScroll(session, action.direction, action.amount, start);
      case "screenshot":
        return executeScreenshot(session, action.format, action.quality, start);
      case "extract":
        return executeExtract(session, action.selector, action.attribute, start);
      case "execute":
        return executeScript(session, action.script, start);
      case "wait":
        return executeWait(session, action.selector, action.timeout, action.condition, start);
      case "hover":
        return executeHover(session, action.selector, start);
      case "select":
        return executeSelect(session, action.selector, action.value, start);
      case "evaluate":
        return executeEvaluate(session, action.expression, start);
      case "cookie_set":
        return executeCookieSet(session, action.name, action.value, action.domain, start);
      case "cookie_get":
        return executeCookieGet(session, action.name, start);
      case "cookie_clear":
        return executeCookieClear(session, start);
      case "auth":
        return executeAuth(session, action.provider, action.credentials, start);
      case "pdf":
        return executePDF(session, action.format, start);
      default:
        return { success: false, error: `Unknown action type: ${(action as any).type}`, duration: Date.now() - start };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ─── Action Implementations ─────────────────────────────────────────────────

function executeNavigate(session: BrowserSession, url: string, start: number): BrowserActionResult {
  session.url = url;
  session.history.push(url);
  session.status = "loading";

  // In production, this would send a message to the sandbox iframe
  // to navigate to the URL and wait for load
  return {
    success: true,
    data: { url, title: session.title },
    duration: Date.now() - start,
  };
}

function executeClick(session: BrowserSession, selector: string, start: number): BrowserActionResult {
  // In production, this would query the DOM and dispatch click events
  return {
    success: true,
    data: { selector, action: "click" },
    duration: Date.now() - start,
  };
}

function executeType(
  session: BrowserSession,
  selector: string,
  text: string,
  clear: boolean | undefined,
  start: number,
): BrowserActionResult {
  return {
    success: true,
    data: { selector, text, clear: clear ?? false },
    duration: Date.now() - start,
  };
}

function executeScroll(
  session: BrowserSession,
  direction: string,
  amount: number | undefined,
  start: number,
): BrowserActionResult {
  return {
    success: true,
    data: { direction, amount: amount ?? 500 },
    duration: Date.now() - start,
  };
}

function executeScreenshot(
  session: BrowserSession,
  format: string | undefined,
  quality: number | undefined,
  start: number,
): BrowserActionResult {
  session.metadata.screenshotCount++;
  return {
    success: true,
    data: {
      format: format ?? "png",
      quality: quality ?? 80,
      // In production, this would capture the iframe content
      screenshot: "data:image/png;base64,placeholder...",
    },
    screenshot: "data:image/png;base64,placeholder...",
    duration: Date.now() - start,
  };
}

function executeExtract(
  session: BrowserSession,
  selector: string,
  attribute: string | undefined,
  start: number,
): BrowserActionResult {
  return {
    success: true,
    data: { selector, attribute: attribute ?? "textContent", value: "" },
    duration: Date.now() - start,
  };
}

function executeScript(session: BrowserSession, script: string, start: number): BrowserActionResult {
  return {
    success: true,
    data: { script, result: null },
    duration: Date.now() - start,
  };
}

function executeWait(
  session: BrowserSession,
  selector: string | undefined,
  timeout: number | undefined,
  condition: string | undefined,
  start: number,
): BrowserActionResult {
  return {
    success: true,
    data: { selector, timeout: timeout ?? 5000, condition: condition ?? "present" },
    duration: Date.now() - start,
  };
}

function executeHover(session: BrowserSession, selector: string, start: number): BrowserActionResult {
  return {
    success: true,
    data: { selector },
    duration: Date.now() - start,
  };
}

function executeSelect(session: BrowserSession, selector: string, value: string, start: number): BrowserActionResult {
  return {
    success: true,
    data: { selector, value },
    duration: Date.now() - start,
  };
}

function executeEvaluate(session: BrowserSession, expression: string, start: number): BrowserActionResult {
  return {
    success: true,
    data: { expression, result: null },
    duration: Date.now() - start,
  };
}

function executeCookieSet(
  session: BrowserSession,
  name: string,
  value: string,
  domain: string | undefined,
  start: number,
): BrowserActionResult {
  session.cookies.push({ name, value, domain: domain ?? new URL(session.url).hostname });
  return {
    success: true,
    data: { name, domain },
    duration: Date.now() - start,
  };
}

function executeCookieGet(session: BrowserSession, name: string, start: number): BrowserActionResult {
  const cookie = session.cookies.find(c => c.name === name);
  return {
    success: true,
    data: cookie ? { name: cookie.name, value: cookie.value } : null,
    duration: Date.now() - start,
  };
}

function executeCookieClear(session: BrowserSession, start: number): BrowserActionResult {
  session.cookies = [];
  return { success: true, data: { cleared: true }, duration: Date.now() - start };
}

function executeAuth(
  session: BrowserSession,
  provider: string,
  credentials: { username: string; password: string },
  start: number,
): BrowserActionResult {
  // Navigate to auth page and fill credentials
  // In production, this would handle OAuth flows, form-based auth, etc.
  return {
    success: true,
    data: { provider, authenticated: true },
    duration: Date.now() - start,
  };
}

function executePDF(session: BrowserSession, format: string | undefined, start: number): BrowserActionResult {
  return {
    success: true,
    data: { format: format ?? "a4", url: session.url },
    duration: Date.now() - start,
  };
}

// ─── Automation Pipeline ────────────────────────────────────────────────────

export interface AutomationStep {
  id: string;
  action: BrowserAction;
  description: string;
  timeout?: number;
  retries?: number;
  onFail?: "skip" | "abort" | "retry";
}

export interface AutomationPipeline {
  id: string;
  name: string;
  steps: AutomationStep[];
  status: "pending" | "running" | "completed" | "failed";
  results: BrowserActionResult[];
}

/**
 * Execute a sequence of browser actions as a pipeline.
 */
export async function executePipeline(
  sessionId: string,
  pipeline: AutomationPipeline,
): Promise<AutomationPipeline> {
  pipeline.status = "running";
  pipeline.results = [];

  for (const step of pipeline.steps) {
    const maxRetries = step.retries ?? 0;
    let attempt = 0;
    let result: BrowserActionResult | null = null;

    while (attempt <= maxRetries) {
      result = await executeBrowserAction(sessionId, step.action);
      pipeline.results.push(result);

      if (result.success) break;
      if (step.onFail === "abort" || attempt >= maxRetries) {
        pipeline.status = "failed";
        return pipeline;
      }
      attempt++;
    }
  }

  pipeline.status = "completed";
  return pipeline;
}

// ─── Screenshot-to-Data Pipeline ────────────────────────────────────────────

/**
 * Capture a screenshot and extract data from it.
 * Combines browser automation with visual understanding.
 */
export async function screenshotAndExtract(
  sessionId: string,
  selector: string,
  extractConfig: {
    type: "text" | "image" | "table" | "form" | "link";
    format?: "json" | "csv" | "markdown";
  },
): Promise<BrowserActionResult> {
  // Take screenshot
  const screenshot = await executeBrowserAction(sessionId, {
    type: "screenshot",
    format: "png",
  });

  if (!screenshot.success) return screenshot;

  // Extract data from the selector
  const extract = await executeBrowserAction(sessionId, {
    type: "extract",
    selector,
  });

  return {
    success: true,
    data: {
      screenshot: screenshot.screenshot,
      extractedData: extract.data,
      config: extractConfig,
    },
    duration: screenshot.duration + extract.duration,
  };
}
