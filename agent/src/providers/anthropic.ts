/** Native Anthropic Messages API provider (streaming, tool use). */
import type { Msg } from "../state/db.js";
import { newId } from "../util/misc.js";
import { type ChatRequest, type ChatResponse, type Provider, ProviderError, classifyHttpError, sseEvents } from "./types.js";

export interface AnthropicOptions {
  baseUrl?: string;
  model: string;
  apiKey?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  temperature?: number;
  headers?: Record<string, string>;
}

export function toAnthropic(messages: Msg[]): { system: string; messages: any[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content ?? "").join("\n\n");
  const out: any[] = [];
  const push = (role: "user" | "assistant", block: any) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      if (m.content) push("user", { type: "text", text: m.content });
      for (const url of m.meta?.images ?? []) {
        const mm = /^data:([^;]+);base64,(.*)$/.exec(url);
        if (mm) push("user", { type: "image", source: { type: "base64", media_type: mm[1], data: mm[2] } });
      }
    } else if (m.role === "assistant") {
      if (m.content) push("assistant", { type: "text", text: m.content });
      for (const c of m.tool_calls ?? []) {
        let input: any = {};
        try { input = JSON.parse(c.arguments || "{}"); } catch { input = { _raw: c.arguments }; }
        push("assistant", { type: "tool_use", id: c.id, name: c.name, input });
      }
      if (!m.content && !m.tool_calls?.length) push("assistant", { type: "text", text: "(no content)" });
    } else if (m.role === "tool") {
      push("user", { type: "tool_result", tool_use_id: m.tool_call_id, content: m.content ?? "" });
    }
  }
  if (out.length && out[0].role !== "user") out.unshift({ role: "user", content: [{ type: "text", text: "(continue)" }] });
  return { system, messages: out };
}

export class AnthropicProvider implements Provider {
  readonly id: string;
  readonly model: string;
  readonly contextWindow: number;
  constructor(private o: AnthropicOptions) {
    this.model = o.model;
    this.contextWindow = o.contextWindow ?? 200_000;
    this.id = `anthropic:${o.model}`;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { system, messages } = toAnthropic(req.messages);
    const body: any = {
      model: this.o.model, max_tokens: req.maxTokens || this.o.maxOutputTokens || 4096,
      temperature: req.temperature ?? this.o.temperature ?? 0.3, messages, stream: true,
    };
    if (system) body.system = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
    if (req.tools?.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    if (req.stop?.length) body.stop_sequences = req.stop;
    const url = (this.o.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "") + "/v1/messages";
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST", signal: req.signal,
        headers: { "content-type": "application/json", "x-api-key": this.o.apiKey ?? "", "anthropic-version": "2023-06-01", ...this.o.headers },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      if (req.signal?.aborted) throw Object.assign(new Error("interrupted"), { name: "AbortError" });
      throw new ProviderError(`cannot reach ${url}: ${e?.message ?? e}`, "network");
    }
    if (!res.ok) throw classifyHttpError(res.status, await res.text().catch(() => ""), res.headers.get("retry-after"));

    let content = "", reasoning = "", finishReason = "stop", model = this.model;
    const usage = { input: 0, output: 0 };
    const blocks: Record<number, { type: string; id?: string; name?: string; json: string }> = {};
    for await (const ev of sseEvents(res, req.signal)) {
      let j: any;
      try { j = JSON.parse(ev.data); } catch { continue; }
      switch (j.type) {
        case "message_start":
          model = j.message?.model ?? model;
          usage.input = (j.message?.usage?.input_tokens ?? 0) + (j.message?.usage?.cache_read_input_tokens ?? 0) + (j.message?.usage?.cache_creation_input_tokens ?? 0);
          break;
        case "content_block_start":
          blocks[j.index] = { type: j.content_block.type, id: j.content_block.id, name: j.content_block.name, json: "" };
          break;
        case "content_block_delta":
          if (j.delta.type === "text_delta") { content += j.delta.text; req.onToken?.(j.delta.text); }
          else if (j.delta.type === "input_json_delta") blocks[j.index].json += j.delta.partial_json;
          else if (j.delta.type === "thinking_delta") { reasoning += j.delta.thinking; req.onReasoning?.(j.delta.thinking); }
          break;
        case "message_delta":
          if (j.delta?.stop_reason) finishReason = j.delta.stop_reason === "tool_use" ? "tool_calls" : j.delta.stop_reason;
          if (j.usage?.output_tokens) usage.output = j.usage.output_tokens;
          break;
        case "error":
          throw new ProviderError(`anthropic error: ${JSON.stringify(j.error).slice(0, 400)}`, j.error?.type === "overloaded_error" ? "server" : "bad_request");
      }
    }
    const toolCalls = Object.values(blocks).filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id ?? newId("toolu_"), name: b.name ?? "", arguments: b.json || "{}" }));
    return { content, toolCalls, usage, finishReason, model, reasoning: reasoning || undefined };
  }
}
