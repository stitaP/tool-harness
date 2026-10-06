/**
 * OpenAI-compatible Chat Completions provider. Works with Ollama, llama.cpp
 * server, LM Studio, vLLM, LiteLLM, OpenRouter, Azure/enterprise gateways.
 */
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import type { Msg, ToolCall } from "../state/db.js";
import { newId } from "../util/misc.js";
import {
  type ChatRequest, type ChatResponse, type Provider, ProviderError,
  classifyHttpError, sseEvents, splitThinking, extractInlineToolCalls,
} from "./types.js";

export interface OpenAIOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  temperature?: number;
  headers?: Record<string, string>;
  extraBody?: Record<string, any>;
  timeoutMs?: number;
}

/**
 * Tool-call arguments as sent back in history. Servers that render chat templates (llama.cpp --jinja) parse them
 * as JSON and reject the whole request otherwise, so one cut-off call in history would fail every later turn.
 * Invalid arguments are replaced by a small valid stand-in (the tool result already explains the failure).
 */
export function wireArgs(raw: string | undefined): string {
  if (!raw) return "{}";
  try { JSON.parse(raw); return raw; } catch { /* replace */ }
  const path = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1];
  return JSON.stringify({ ...(path ? { path } : {}), _invalid_arguments: `not valid JSON (${raw.length} characters, cut off or malformed); this call was not executed` });
}

export function toOpenAIMessages(messages: Msg[]): any[] {
  return messages.map((m) => {
    if (m.role === "assistant") {
      const o: any = { role: "assistant", content: m.content ?? "" };
      if (m.tool_calls?.length) {
        o.tool_calls = m.tool_calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: wireArgs(c.arguments) } }));
        if (!m.content) o.content = null;
      }
      return o;
    }
    if (m.role === "tool") return { role: "tool", tool_call_id: m.tool_call_id, content: m.content ?? "" };
    const images: string[] = m.meta?.images ?? [];
    if (m.role === "user" && images.length) {
      return { role: "user", content: [{ type: "text", text: m.content ?? "" }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}
/** llama.cpp's per-request `timings` object (predicted_* = generation, prompt_* = prefill). */
function serverTimings(t: any): ChatResponse["timings"] {
  if (!t || !(t.predicted_n > 0) || !(t.predicted_per_second > 0)) return undefined;
  return {
    genTps: t.predicted_per_second, promptTps: t.prompt_per_second > 0 ? t.prompt_per_second : undefined, genTokens: t.predicted_n, genMs: t.predicted_ms ?? 0,
    cacheTokens: typeof t.cache_n === "number" ? t.cache_n : undefined, promptTokens: typeof t.prompt_n === "number" ? t.prompt_n : undefined,
  };
}

/** Plain http:// to loopback, private-LAN or .local hosts (no proxy, no TLS). */
export function isLocalHttp(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:") return false;
  const h = u.hostname.replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || h.endsWith(".local") || h.endsWith(".localhost") ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "host.docker.internal";
}

function postLocal(url: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    // agent: false = a fresh connection per request. Node's default agent keeps sockets alive, but llama.cpp's server closes
    // idle connections after ~5 s, so the next request (e.g. the goal judge right after a reply) hit a dead socket: "socket hang up".
    const req = httpRequest(url, { method: "POST", agent: false, headers: { ...headers, connection: "close", "content-length": String(Buffer.byteLength(body)) }, signal }, (res) => {
      const h = new Headers();
      for (const [k, v] of Object.entries(res.headers)) if (v != null) h.set(k, Array.isArray(v) ? v.join(", ") : String(v));
      const status = res.statusCode ?? 500;
      const stream = status === 204 || status === 304 ? null : (Readable.toWeb(res) as any);
      resolve(new Response(stream, { status, statusText: res.statusMessage, headers: h }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

export class OpenAIProvider implements Provider {
  readonly id: string;
  readonly model: string;
  contextWindow: number;
  private noStreamOptions = false;
  private ctxChecked = 0;

  constructor(private o: OpenAIOptions) {
    this.model = o.model;
    this.contextWindow = o.contextWindow ?? 32768;
    this.id = `openai:${o.model}@${o.baseUrl}`;
    void this.detectContext();
  }

  /** A local llama.cpp server decides its context size at start (e.g. `--fit`); use what it actually runs with,
   * not the config value, so the stats and autocompaction match. Re-checked at most once a minute. */
  async detectContext(): Promise<number> {
    if (!isLocalHttp(this.o.baseUrl) || Date.now() - this.ctxChecked < 60_000) return this.contextWindow;
    this.ctxChecked = Date.now();
    try {
      const r = await fetch(this.o.baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "") + "/props", { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const j: any = await r.json();
        const n = Number(j?.default_generation_settings?.n_ctx ?? j?.n_ctx);
        if (n > 0) this.contextWindow = n;
      }
    } catch { /* not llama.cpp, or not up yet: keep the configured value */ }
    return this.contextWindow;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    void this.detectContext();   // the server may have restarted with another size
    const stream = req.stream !== false;
    const body: any = {
      model: this.o.model,
      messages: toOpenAIMessages(req.messages),
      temperature: req.temperature ?? this.o.temperature ?? 0.3,
      stream,
      ...this.o.extraBody,
    };
    const maxT = req.maxTokens ?? this.o.maxOutputTokens;
    if (maxT) body.max_tokens = maxT;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
      body.tool_choice = "auto";
    }
    if (req.stop?.length) body.stop = req.stop;
    if (req.json) body.response_format = { type: "json_object" };
    if (stream && !this.noStreamOptions) body.stream_options = { include_usage: true };

    const res = await this.post(body, req.signal);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 400 && body.stream_options && /stream_options/i.test(text)) {
        this.noStreamOptions = true;
        return this.chat(req);
      }
      if (res.status === 400 && body.response_format && /response_format/i.test(text)) {
        return this.chat({ ...req, json: false });
      }
      throw classifyHttpError(res.status, text, res.headers.get("retry-after"));
    }
    const out = stream ? await this.readStream(res, req) : await this.readJson(res);
    return this.finish(out, req);
  }

  private async post(body: any, signal?: AbortSignal): Promise<Response> {
    const url = this.o.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    const headers: Record<string, string> = { "content-type": "application/json", ...this.o.headers };
    if (this.o.apiKey) headers.authorization = `Bearer ${this.o.apiKey}`;
    const timeoutMs = this.o.timeoutMs ?? 600_000;
    const timeout = AbortSignal.timeout(timeoutMs);
    const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      // Node's fetch (undici) aborts any response whose headers take longer than 300 s, regardless of
      // our own timeout. A local model on CPU can spend longer than that on prompt prefill, so plain-HTTP
      // model servers on this machine or the LAN go through node:http, bounded only by `timeoutMs`.
      if (isLocalHttp(url)) return await postLocal(url, headers, JSON.stringify(body), sig);
      return await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: sig });
    } catch (e: any) {
      if (signal?.aborted) throw Object.assign(new Error("interrupted"), { name: "AbortError" });
      if (timeout.aborted) throw new ProviderError(`model server at ${url} did not answer within ${Math.round(timeoutMs / 1000)} s (raise model.request_timeout for slow local models)`, "server");
      throw new ProviderError(`cannot reach model server at ${url}: ${e?.cause?.code ?? e?.message ?? e}`, "network");
    }
  }

  private async readJson(res: Response) {
    const j: any = await res.json();
    const choice = j.choices?.[0] ?? {};
    const msg = choice.message ?? {};
    return {
      content: msg.content ?? "",
      reasoning: msg.reasoning_content ?? msg.reasoning ?? "",
      toolCalls: (msg.tool_calls ?? []).map((c: any) => ({ id: c.id || newId("call_"), name: c.function?.name ?? "", arguments: typeof c.function?.arguments === "string" ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}) })),
      usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 },
      finishReason: choice.finish_reason ?? "stop",
      model: j.model ?? this.model,
      timings: serverTimings(j.timings),
    };
  }

  private async readStream(res: Response, req: ChatRequest) {
    let content = "", reasoning = "", finishReason = "stop", model = this.model;
    const usage = { input: 0, output: 0 };
    const calls: { id: string; name: string; arguments: string }[] = [];
    let inThink = false;
    let timings: ChatResponse["timings"], firstAt = 0, lastAt = 0;
    for await (const ev of sseEvents(res, req.signal)) {
      if (ev.data === "[DONE]") break;
      let j: any;
      try { j = JSON.parse(ev.data); } catch { continue; }
      if (j.error) throw new ProviderError(`model error: ${JSON.stringify(j.error).slice(0, 400)}`, "server");
      if (j.model) model = j.model;
      if (j.usage) { usage.input = j.usage.prompt_tokens ?? usage.input; usage.output = j.usage.completion_tokens ?? usage.output; }
      if (j.timings) timings = serverTimings(j.timings) ?? timings;
      const ch = j.choices?.[0];
      if (!ch) continue;
      if (ch.delta && Object.keys(ch.delta).length) { lastAt = Date.now(); firstAt ||= lastAt; }
      const d = ch.delta ?? {};
      const r = d.reasoning_content ?? d.reasoning;
      if (r) { reasoning += r; req.onReasoning?.(r); }
      if (d.content) {
        content += d.content;
        // don't stream <think> blocks or inline tool-call markup to the user
        let piece: string = d.content;
        if (piece.includes("<think>")) inThink = true;
        if (!inThink && !content.includes("<tool_call>")) req.onToken?.(piece);
        if (piece.includes("</think>")) inThink = false;
      }
      for (const tc of d.tool_calls ?? []) {
        const i = tc.index ?? calls.length;
        calls[i] ??= { id: "", name: "", arguments: "" };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].arguments += typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments);
      }
      if (ch.finish_reason) finishReason = ch.finish_reason;
    }
    // servers without llama.cpp timings: tokens over the time between the first and last streamed delta
    if (!timings && usage.output > 1 && lastAt > firstAt) timings = { genTps: (usage.output - 1) / ((lastAt - firstAt) / 1000), genTokens: usage.output, genMs: lastAt - firstAt };
    return { content, reasoning, toolCalls: calls.filter(Boolean).map((c) => ({ ...c, id: c.id || newId("call_") })), usage, finishReason, model, timings };
  }

  private finish(o: { content: string; reasoning: string; toolCalls: ToolCall[]; usage: any; finishReason: string; model: string; timings?: ChatResponse["timings"] }, req: ChatRequest): ChatResponse {
    const { content, reasoning } = splitThinking(o.content ?? "");
    let toolCalls = o.toolCalls;
    let text = content;
    if (!toolCalls.length && req.tools?.length) {
      const inline = extractInlineToolCalls(content, req.tools.map((t) => t.name));
      if (inline.calls.length) {
        toolCalls = inline.calls.map((c) => ({ id: newId("call_"), ...c }));
        text = inline.rest;
      }
    }
    return { content: text, toolCalls, usage: o.usage, finishReason: o.finishReason, model: o.model, reasoning: [o.reasoning, reasoning].filter(Boolean).join("\n") || undefined, timings: o.timings };
  }
}
