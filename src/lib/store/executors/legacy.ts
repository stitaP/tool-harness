/**
 * Executors that already lived next to their manifests: explicit *_EXECUTORS maps
 * and FOO_BAR_MANIFEST ↔ fooBar() function pairs in src/lib/store/tools/*.
 */
import type { ToolExecutor } from "../tool-types";
import * as m0 from "../tools/agent-tools";
import * as m1 from "../tools/analytics-tools";
import * as m2 from "../tools/browser-design-tools";
import * as m3 from "../tools/browser-inspect-tools";
import * as m4 from "../tools/browser-test-tools";
import * as m5 from "../tools/browser-tools";
import * as m6 from "../tools/browser-visual-tools";
import * as m7 from "../tools/business-tools";
import * as m8 from "../tools/cfd-tools";
import * as m9 from "../tools/codegen-tools";
import * as m10 from "../tools/design-engine-tools";
import * as m11 from "../tools/diagram-tools";
import * as m12 from "../tools/doc-tools";
import * as m13 from "../tools/ecommerce-tools";
import * as m14 from "../tools/env-tools";
import * as m15 from "../tools/fractal-tools";
import * as m16 from "../tools/graph-tools";
import * as m17 from "../tools/harness-tools";
import * as m18 from "../tools/hermes-tools";
import * as m19 from "../tools/huggingface-tools";
import * as m20 from "../tools/indic-ocr-tools";
import * as m21 from "../tools/indic-typography-tools";
import * as m22 from "../tools/inference-tools";
import * as m23 from "../tools/integration-tools";
import * as m24 from "../tools/llm-tools";
import * as m25 from "../tools/math-tools";
import * as m26 from "../tools/media-tools";
import * as m27 from "../tools/microfinance-tools";
import * as m28 from "../tools/ml-tools";
import * as m29 from "../tools/office-tools";
import * as m30 from "../tools/orchestration-tools";
import * as m31 from "../tools/sandbox-tools";
import * as m32 from "../tools/server-tools";
import * as m33 from "../tools/session-tools";
import * as m34 from "../tools/south-indian-tools";
import * as m35 from "../tools/standards-tools";
import * as m36 from "../tools/symbolic-tools";
import * as m37 from "../tools/video-tools";
import * as m38 from "../tools/viking-tools";

const MODULES: Record<string, any>[] = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27, m28, m29, m30, m31, m32, m33, m34, m35, m36, m37, m38];
const camel = (s: string) => s.toLowerCase().replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

/** Coerce LLM-supplied values to the manifest's declared parameter types. */
function coerce(manifest: any, input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const p of manifest?.parameters ?? []) {
    const v = out[p.name];
    if (v === undefined || v === null) { if (p.default !== undefined) out[p.name] = p.default; continue; }
    if ((p.type === "array" || p.type === "object") && typeof v === "string" && /^\s*[[{]/.test(v)) { try { out[p.name] = JSON.parse(v); } catch { /* keep */ } }
    else if (p.type === "array" && typeof v === "string") out[p.name] = v.split(",").map((x) => x.trim()).filter(Boolean).map((x) => (x !== "" && !Number.isNaN(Number(x)) ? Number(x) : x));
    else if (p.type === "number" && typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) out[p.name] = Number(v);
    else if (p.type === "boolean" && typeof v === "string") out[p.name] = v === "true" || v === "1" || v === "yes";
    else if (p.type === "string" && typeof v !== "string") out[p.name] = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return out;
}

/** Parameter names of a plain function (for positional signatures like f(step, context, style)). */
function paramNames(fn: Function): string[] | null {
  const src = Function.prototype.toString.call(fn);
  const m = /^(?:async\s*)?(?:function\s*[\w$]*\s*)?\(([^)]*)\)/.exec(src) ?? /^(?:async\s*)?([\w$]+)\s*=>/.exec(src);
  if (!m) return null;
  if (m[1].trim().startsWith("{")) return null; // destructured object → takes the input object
  return m[1].split(",").map((x) => x.replace(/=.*$/s, "").replace(/\/\*.*?\*\//g, "").trim()).filter(Boolean);
}

const OBJECT_PARAM = /^(input|params?|opts|options|args|config|cfg|request|req|data|payload|spec|_input|_)$/;

function isToolOutput(r: unknown): boolean {
  if (!r || typeof r !== "object" || typeof (r as any).success !== "boolean") return false;
  return Object.keys(r as object).every((k) => ["success", "data", "error", "meta"].includes(k));
}

/** Adapt a legacy function (object or positional signature) to a ToolExecutor. */
function adapt(fn: Function, manifest: any): ToolExecutor {
  const names = paramNames(fn);
  const positional = !!names && names.length > 0 && !OBJECT_PARAM.test(names[0]) && (manifest?.parameters ?? []).some((p: any) => p.name === names[0]);
  return async (input: any) => {
    try {
      const a = coerce(manifest, input ?? {});
      const r = await (positional ? fn(...names!.map((n) => a[n])) : fn(a));
      if (isToolOutput(r)) { const o = r as any; return o.success || o.error ? o : { success: false, error: typeof o.data === "string" ? o.data.replace(/^Error: /, "") : "tool reported failure without a message" }; }
      return { success: true, data: r };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };
}

export function legacyExecutors(): Record<string, ToolExecutor> {
  const out: Record<string, any> = {};
  const manifests = new Map<string, any>();
  for (const mod of MODULES) for (const v of Object.values(mod)) {
    if (v && typeof v === "object" && !Array.isArray(v) && (v as any).id && (v as any).parameters) manifests.set((v as any).id, v);
    if (Array.isArray(v)) for (const t of v) if (t && typeof t === "object" && t.id && t.parameters) manifests.set(t.id, t);
  }
  for (const mod of MODULES) for (const [k, v] of Object.entries(mod)) if (k.endsWith("_EXECUTORS") && v && typeof v === "object") for (const [id, ex] of Object.entries(v as Record<string, Function>)) out[id] = adapt(ex, manifests.get(id));
  for (const mod of MODULES) for (const [k, v] of Object.entries(mod)) {
    if (!k.endsWith("_MANIFEST") || !v || typeof v !== "object" || !(v as any).id || out[(v as any).id]) continue;
    const fn = mod[camel(k.slice(0, -"_MANIFEST".length))];
    if (typeof fn === "function") out[(v as any).id] = adapt(fn, v);
  }
  return out;
}
