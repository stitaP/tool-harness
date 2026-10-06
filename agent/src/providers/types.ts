import type { Msg, ToolCall } from "../state/db.js";

export interface ToolSchema { name: string; description: string; parameters: any }

export interface ChatRequest {
  messages: Msg[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken?: (t: string) => void;
  onReasoning?: (t: string) => void;
  stop?: string[];
  /** ask for a JSON object reply (judge/curator); providers do best effort */
  json?: boolean;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
  finishReason: string;
  model: string;
  reasoning?: string;
  /** generation speed: llama.cpp `timings` when the server sends them, otherwise measured from the stream */
  /** cacheTokens: prompt tokens reused from the server's cache; promptTokens: prompt tokens actually computed (llama.cpp) */
  timings?: { genTps: number; promptTps?: number; genTokens: number; genMs: number; cacheTokens?: number; promptTokens?: number };
}

export interface Provider {
  readonly id: string;
  readonly model: string;
  readonly contextWindow: number;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export type ErrorKind = "rate_limit" | "context_length" | "auth" | "server" | "network" | "bad_request" | "tools_unsupported" | "aborted" | "bad_tool_call";

export class ProviderError extends Error {
  constructor(message: string, readonly kind: ErrorKind, readonly status?: number, readonly retryAfterMs?: number) {
    super(message);
    this.name = "ProviderError";
  }
  get retryable(): boolean { return this.kind === "rate_limit" || this.kind === "server" || this.kind === "network"; }
}

export function classifyHttpError(status: number, body: string, retryAfter?: string | null): ProviderError {
  const b = body.slice(0, 600);
  const ra = retryAfter ? Number(retryAfter) * 1000 : undefined;
  if (status === 429) return new ProviderError(`rate limited: ${b}`, "rate_limit", status, ra);
  if (status === 401 || status === 403) return new ProviderError(`authentication failed (${status}): ${b}`, "auth", status);
  if (/context.{0,20}(length|window|size)|too many tokens|maximum context|prompt is too long|exceeds the (available )?context|exceed_context_size/i.test(b))
    return new ProviderError(`context length exceeded: ${b}`, "context_length", status);
  if (status === 400 && /tool|function/i.test(b) && /(not support|unsupported|unknown|invalid|does not)/i.test(b))
    return new ProviderError(`model/server does not support tool calling: ${b}`, "tools_unsupported", status);
  // llama.cpp (--jinja) rejects a tool call whose arguments are not valid JSON with a 500; the model can fix it
  if (/failed to parse tool call|parse tool call arguments|invalid tool call/i.test(b))
    return new ProviderError(`model produced an invalid tool call: ${b}`, "bad_tool_call", status);
  // llama.cpp / Ollama / LM Studio answer 503 while (re)loading weights: wait it out instead of failing the turn
  if (status === 503 && /loading model|model is loading|currently loading|still loading/i.test(b))
    return new ProviderError(`model server is still loading the model: ${b}`, "server", status, ra ?? 5000);
  if (status >= 500) return new ProviderError(`server error ${status}: ${b}`, "server", status);
  return new ProviderError(`request failed ${status}: ${b}`, "bad_request", status);
}

/** Async iterator over SSE `data:` payloads from a fetch Response. */
export async function* sseEvents(res: Response, signal?: AbortSignal): AsyncGenerator<{ event?: string; data: string }> {
  if (!res.body) return;
  const reader = (res.body as any).getReader();
  const dec = new TextDecoder();
  let buf = "";
  let event: string | undefined;
  let data: string[] = [];
  try {
    for (;;) {
      if (signal?.aborted) throw Object.assign(new Error("interrupted"), { name: "AbortError" });
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        if (line === "") {
          if (data.length) yield { event, data: data.join("\n") };
          event = undefined; data = [];
        } else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        else if (line.startsWith("event:")) event = line.slice(6).trim();
      }
    }
    if (data.length) yield { event, data: data.join("\n") };
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

/** Strip <think>…</think> blocks some local reasoning models emit inline. */
export function splitThinking(text: string): { content: string; reasoning: string } {
  let reasoning = "";
  const content = text.replace(/<think>([\s\S]*?)(<\/think>|$)/g, (_m, r) => { reasoning += r; return ""; });
  return { content: content.trim(), reasoning: reasoning.trim() };
}

/**
 * Many local models (Qwen, Hermes, Llama) emit tool calls as text when the
 * server doesn't parse them. Recover `<tool_call>{json}</tool_call>` and
 * bare `{"name":…, "arguments":…}` objects.
 */
export function extractInlineToolCalls(text: string, toolNames: string[]): { calls: { name: string; arguments: string }[]; rest: string } {
  const calls: { name: string; arguments: string }[] = [];
  let rest = text.replace(/<tool_call>\s*([\s\S]*?)\s*(<\/tool_call>|$)/g, (_m, body) => {
    try {
      const j = JSON.parse(body.trim());
      if (j && typeof j.name === "string") calls.push({ name: j.name, arguments: typeof j.arguments === "string" ? j.arguments : JSON.stringify(j.arguments ?? j.parameters ?? {}) });
    } catch { /* leave as text */ }
    return "";
  });
  if (!calls.length) {
    const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    if (t.startsWith("{") && t.endsWith("}")) {
      try {
        const j = JSON.parse(t);
        if (j && typeof j.name === "string" && toolNames.includes(j.name) && (j.arguments || j.parameters)) {
          calls.push({ name: j.name, arguments: JSON.stringify(j.arguments ?? j.parameters) });
          rest = "";
        }
      } catch { /* not a call */ }
    }
  }
  return { calls, rest: rest.trim() };
}
