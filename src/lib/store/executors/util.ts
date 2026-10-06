/**
 * Shared helpers for Tool Store executors. Executors receive loosely-typed input
 * from small models, so every reader coerces and validates defensively.
 */
import type { ToolExecutor, ToolInput, ToolOutput } from "../tool-types";

export type ExecMap = Record<string, ToolExecutor>;

export const ok = (data: unknown): ToolOutput => ({ success: true, data });
export const fail = (error: string): ToolOutput => ({ success: false, error });

/** Parse JSON strings; pass objects/arrays through. */
export function json<T = any>(v: unknown, fallback?: T): T {
  if (v === undefined || v === null || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error("missing required JSON value");
  }
  if (typeof v !== "string") return v as T;
  try { return JSON.parse(v) as T; } catch {
    // plain (non-JSON-looking) text with a fallback → let the caller handle it as text
    if (fallback !== undefined && !/^\s*[[{"]/.test(v)) return fallback;
    throw new Error(`expected JSON, got: ${v.slice(0, 120)}`);
  }
}

export function num(v: unknown, fallback?: number): number {
  if (v === undefined || v === null || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error("missing required number");
  }
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,_₹$€£\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`not a number: ${String(v)}`);
  return n;
}

export const str = (v: unknown, fallback = ""): string => (v === undefined || v === null ? fallback : String(v));
export const bool = (v: unknown, fallback = false): boolean =>
  v === undefined || v === null || v === "" ? fallback : v === true || v === "true" || v === 1 || v === "1" || v === "yes";

/** Accept arrays given as JSON, comma-separated text, or real arrays. */
export function list(v: unknown): string[] {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map(String);
  const s = String(v).trim();
  if (s.startsWith("[")) { try { return (JSON.parse(s) as unknown[]).map(String); } catch { /* fall through */ } }
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export function numList(v: unknown): number[] {
  const a = Array.isArray(v) ? v : json<unknown[]>(v);
  return a.map((x) => num(x));
}

/** A handler may return a ready ToolOutput ({ success, data?|error?, meta? }) — anything else is wrapped with ok(). */
function isToolOutput(r: unknown): r is ToolOutput {
  if (!r || typeof r !== "object" || typeof (r as any).success !== "boolean") return false;
  const keys = Object.keys(r as object);
  return keys.every((k) => ["success", "data", "error", "meta"].includes(k)) && ("data" in (r as object) || "error" in (r as object));
}

/** Wrap a handler so thrown errors become `{ success: false }`. */
export function wrap(fn: (input: ToolInput) => unknown | Promise<unknown>): ToolExecutor {
  return async (input: ToolInput) => {
    try {
      const r = await fn(input ?? {});
      if (isToolOutput(r)) return r;
      return ok(r);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}

/** Build an ExecMap from plain handlers. */
export function execs(handlers: Record<string, (input: ToolInput) => unknown | Promise<unknown>>): ExecMap {
  const out: ExecMap = {};
  for (const [id, fn] of Object.entries(handlers)) out[id] = wrap(fn);
  return out;
}

export const isBrowser = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";
export const isNode = (): boolean => typeof process !== "undefined" && !!(process as any).versions?.node && !isBrowser();

/** Round floats for readable tool output. */
export const r2 = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;

// ─── persistence ────────────────────────────────────────────────────────────
// Stateful business tools (ledgers, chit groups, projects, store data, design
// canvases) keep their records here: a JSON file per namespace under
// $STITAP_DATA_DIR (default ~/.stitap/store-data) in Node, localStorage in the browser.

const memoryStore = new Map<string, unknown>();

function nodeBuiltin(name: string): any {
  const p: any = typeof process !== "undefined" ? process : undefined;
  return p?.getBuiltinModule ? p.getBuiltinModule(name) : undefined;
}

export function dataDir(): string | null {
  if (!isNode()) return null;
  const path = nodeBuiltin("node:path"), os = nodeBuiltin("node:os");
  if (!path || !os) return null;
  const env = (process as any).env;
  return env.STITAP_DATA_DIR || path.join(env.STITAP_HOME || path.join(os.homedir(), ".stitap"), "store-data");
}

export function persisted<T>(ns: string, init: () => T): { get(): T; save(): void; reset(): void } {
  let cache: T | undefined;
  const fs = isNode() ? nodeBuiltin("node:fs") : undefined;
  const dir = dataDir();
  const file = fs && dir ? `${dir}/${ns}.json` : null;
  const load = (): T => {
    if (cache !== undefined) return cache;
    try {
      if (file && fs.existsSync(file)) cache = JSON.parse(fs.readFileSync(file, "utf8"));
      else if (!file && typeof localStorage !== "undefined") { const s = localStorage.getItem(`stitap.store.${ns}`); if (s) cache = JSON.parse(s); }
      else if (memoryStore.has(ns)) cache = memoryStore.get(ns) as T;
    } catch { /* corrupt → re-init */ }
    if (cache === undefined) cache = init();
    return cache;
  };
  return {
    get: load,
    save() {
      const v = load();
      try {
        if (file) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(v)); fs.renameSync(file + ".tmp", file); }
        else if (typeof localStorage !== "undefined") localStorage.setItem(`stitap.store.${ns}`, JSON.stringify(v));
        else memoryStore.set(ns, v);
      } catch { memoryStore.set(ns, v); }
    },
    reset() { cache = init(); this.save(); },
  };
}

export const today = (): string => new Date().toISOString().slice(0, 10);
export const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// ─── secrets ────────────────────────────────────────────────────────────────
// Provider credentials (Stripe, Twilio, Resend, S3 …) are looked up by env-var
// name. The agent runtime installs a resolver backed by ~/.stitap/.env; the
// browser app can set them in localStorage ("stitap.secret.NAME").

let secretResolver: ((name: string) => string | undefined) | null = null;
export function setSecretResolver(fn: (name: string) => string | undefined): void { secretResolver = fn; }
export function secret(...names: string[]): string | undefined {
  for (const n of names) {
    const v = secretResolver?.(n) ?? (typeof process !== "undefined" ? (process as any).env?.[n] : undefined)
      ?? (typeof localStorage !== "undefined" ? localStorage.getItem(`stitap.secret.${n}`) ?? undefined : undefined);
    if (v) return v;
  }
  return undefined;
}
export function needSecret(label: string, ...names: string[]): string {
  const v = secret(...names);
  if (!v) throw new Error(`${label} is not configured: set ${names.join(" or ")} (agent: \`harness secret set ${names[0]} …\`)`);
  return v;
}

export function nodeModule<T = any>(name: string): T | undefined { return nodeBuiltin(name); }
