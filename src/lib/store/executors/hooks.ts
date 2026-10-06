/**
 * Host hooks for store executors.
 *
 * - `callLlm` — text/vision completion. The agent runtime installs its own
 *   provider with `setLlmCaller`, so store tools use the model the user
 *   configured. Standalone fallback: Anthropic, OpenAI-compatible
 *   (OPENAI_BASE_URL), OpenRouter, or a local Ollama server.
 * - `agentHost` — named capabilities (memory, skills, kanban, …) the agent
 *   runtime exposes so `agent.*` store tools act on the real agent state.
 */
import { secret } from "./util";

export interface LlmRequest {
  system?: string;
  prompt?: string;
  messages?: { role: "user" | "assistant" | "system"; content: string }[];
  /** PNG/JPEG images as data URLs or raw base64 (attached to the last user turn). */
  images?: string[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask for a JSON-only reply. */
  json?: boolean;
}
export interface LlmResponse { text: string; model?: string; provider?: string; usage?: { input?: number; output?: number } }
export type LlmCaller = (req: LlmRequest) => Promise<LlmResponse>;

let caller: LlmCaller | null = null;
export function setLlmCaller(fn: LlmCaller | null): void { caller = fn; }
export function hasLlm(): boolean {
  return !!caller || !!secret("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "OLLAMA_HOST");
}

const splitImage = (img: string) => {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(img);
  return m ? { mime: m[1], data: m[2] } : { mime: "image/png", data: img };
};

function turns(req: LlmRequest) {
  const msgs = (req.messages?.length ? req.messages : [{ role: "user" as const, content: req.prompt ?? "" }]).filter((m) => m.role !== "system");
  const system = [req.system, ...(req.messages ?? []).filter((m) => m.role === "system").map((m) => m.content), req.json ? "Reply with JSON only." : ""].filter(Boolean).join("\n\n");
  return { msgs, system };
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function directLlm(req: LlmRequest): Promise<LlmResponse> {
  const { msgs, system } = turns(req);
  const last = msgs.length - 1;
  const anthropic = secret("ANTHROPIC_API_KEY");
  if (anthropic) {
    const model = req.model ?? secret("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5";
    const r = await post("https://api.anthropic.com/v1/messages", { "x-api-key": anthropic, "anthropic-version": "2023-06-01" }, {
      model, max_tokens: req.maxTokens ?? 2048, temperature: req.temperature, system: system || undefined,
      messages: msgs.map((m, k) => ({ role: m.role, content: k === last && req.images?.length ? [...req.images.map((im) => { const { mime, data } = splitImage(im); return { type: "image", source: { type: "base64", media_type: mime, data } }; }), { type: "text", text: m.content }] : m.content })),
    });
    return { text: (r.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""), model, provider: "anthropic", usage: { input: r.usage?.input_tokens, output: r.usage?.output_tokens } };
  }
  const openai = secret("OPENAI_API_KEY"), router = secret("OPENROUTER_API_KEY");
  const ollama = secret("OLLAMA_HOST");
  const base = openai ? (secret("OPENAI_BASE_URL") ?? "https://api.openai.com/v1") : router ? "https://openrouter.ai/api/v1" : ollama ? `${ollama.replace(/\/+$/, "")}/v1` : null;
  if (!base) throw new Error("no language model configured: set ANTHROPIC_API_KEY, OPENAI_API_KEY (+OPENAI_BASE_URL), OPENROUTER_API_KEY or OLLAMA_HOST — inside the agent runtime the configured model is used automatically");
  const model = req.model ?? secret("OPENAI_MODEL", "LLM_MODEL") ?? (openai ? "gpt-4o-mini" : router ? "openrouter/auto" : "llama3.2");
  const r = await post(`${base.replace(/\/+$/, "")}/chat/completions`, openai || router ? { authorization: `Bearer ${openai ?? router}` } : {}, {
    model, max_tokens: req.maxTokens ?? 2048, temperature: req.temperature,
    ...(req.json ? { response_format: { type: "json_object" } } : {}),
    messages: [...(system ? [{ role: "system", content: system }] : []), ...msgs.map((m, k) => ({ role: m.role, content: k === last && req.images?.length ? [{ type: "text", text: m.content }, ...req.images.map((im) => ({ type: "image_url", image_url: { url: im.startsWith("data:") ? im : `data:image/png;base64,${im}` } }))] : m.content }))],
  });
  return { text: r.choices?.[0]?.message?.content ?? "", model, provider: openai ? "openai" : router ? "openrouter" : "ollama", usage: { input: r.usage?.prompt_tokens, output: r.usage?.completion_tokens } };
}

export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  return caller ? caller(req) : directLlm(req);
}

/** Parse the first JSON object/array in a model reply. */
export function llmJson<T = any>(text: string): T {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (m ? m[1] : text).trim();
  const start = body.search(/[[{]/);
  return JSON.parse(start > 0 ? body.slice(start) : body);
}

// ─── agent host capabilities ─────────────────────────────────────────────────

export type HostFn = (input: Record<string, unknown>) => Promise<unknown>;
let host: Record<string, HostFn> = {};
/** Installed by the agent runtime: e.g. { memory, skills, kanban, selfImprove, terminal }. */
export function setAgentHost(h: Record<string, HostFn>): void { host = { ...host, ...h }; }
export function agentHost(name: string): HostFn | undefined { return host[name]; }
