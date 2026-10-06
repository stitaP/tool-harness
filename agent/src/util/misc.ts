import { randomBytes, createHash } from "node:crypto";

export const newId = (prefix = ""): string =>
  prefix + Date.now().toString(36) + randomBytes(5).toString("hex");

/** Short random id (no timestamp prefix, so ids made in the same millisecond never collide). */
export const shortId = (prefix = "", bytes = 5): string => prefix + randomBytes(bytes).toString("hex");

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(abortError()); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export function abortError(msg = "interrupted"): Error {
  const e = new Error(msg);
  e.name = "AbortError";
  return e;
}

export const isAbort = (e: any): boolean => e?.name === "AbortError" || e?.code === "ABORT_ERR";

/** Rough token estimate (chars/4) — good enough for budgeting and compression triggers. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Keep head and tail of a long string, marking the omitted middle. */
export function truncateMiddle(s: string, max: number, note = ""): string {
  if (s.length <= max) return s;
  const head = Math.floor(max * 0.6), tail = max - head;
  const omitted = s.length - head - tail;
  return `${s.slice(0, head)}\n\n… [${omitted} chars omitted${note ? `; ${note}` : ""}] …\n\n${s.slice(-tail)}`;
}

export const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex");

export function nowIso(): string { return new Date().toISOString(); }

/** Parse "90s", "10m", "2h", "1d" → milliseconds. */
export function parseDuration(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|m|min|mins|h|hr|hrs|hour|hours|d|day|days)?\s*$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const u = (m[2] ?? "s").toLowerCase();
  if (u === "ms") return n;
  if (u.startsWith("s")) return n * 1000;
  if (u.startsWith("m")) return n * 60_000;
  if (u.startsWith("h")) return n * 3_600_000;
  return n * 86_400_000;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1).replace(/\.0$/, "")}h`;
  return `${(ms / 86_400_000).toFixed(1).replace(/\.0$/, "")}d`;
}

/** Split a command line respecting quotes (for slash command args). */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = "", q: string | null = null, has = false;
  for (const c of s) {
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ""; has = false; continue; }
    cur += c;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** Levenshtein distance for fuzzy tool-name repair. */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function safeJson(v: any): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function errMsg(e: any): string {
  return e?.message ? String(e.message) : String(e);
}

export function deepMerge<T>(base: T, over: any): T {
  if (!over || typeof over !== "object" || Array.isArray(over)) return (over ?? base) as T;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as any)?.[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v)
      ? deepMerge(b, v) : v;
  }
  return out;
}

export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}
