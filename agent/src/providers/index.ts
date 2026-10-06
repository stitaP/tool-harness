import type { ConfigStore, ModelConfig } from "../config.js";
import { log } from "../util/log.js";
import { sleep, isAbort } from "../util/misc.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { ReactAdapter } from "./react.js";
import { type ChatRequest, type ChatResponse, type Provider, ProviderError } from "./types.js";

export * from "./types.js";
export { OpenAIProvider } from "./openai.js";
export { AnthropicProvider } from "./anthropic.js";
export { ReactAdapter, FunctionProvider } from "./react.js";

/** Native tool calling first; permanently switch to ReAct if the server rejects tools. */
export class AutoToolProvider implements Provider {
  private react: ReactAdapter;
  private useReact = false;
  constructor(private inner: Provider) { this.react = new ReactAdapter(inner); }
  get id() { return `auto:${this.inner.id}`; }
  get model() { return this.inner.model; }
  get contextWindow() { return this.inner.contextWindow; }
  get mode() { return this.useReact ? "react" : "native"; }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (this.useReact || !req.tools?.length) return (this.useReact ? this.react : this.inner).chat(req);
    try {
      return await this.inner.chat(req);
    } catch (e) {
      if (e instanceof ProviderError && e.kind === "tools_unsupported") {
        log.warn(`model ${this.inner.model} rejected native tools; switching to ReAct text protocol`);
        this.useReact = true;
        return this.react.chat(req);
      }
      throw e;
    }
  }
}

/** Retries with backoff, then walks the fallback chain. */
export class ResilientProvider implements Provider {
  active = 0;
  constructor(private chain: Provider[], private retries = 3, private onEvent?: (msg: string) => void) {
    if (!chain.length) throw new Error("no model configured");
  }
  get id() { return this.chain[this.active].id; }
  get model() { return this.chain[this.active].model; }
  get contextWindow() { return this.chain[this.active].contextWindow; }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    let lastErr: any;
    for (let p = this.active; p < this.chain.length; p++) {
      const prov = this.chain[p];
      let waited = 0;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          const r = await prov.chat(req);
          if (p !== this.active) { this.onEvent?.(`switched to fallback model ${prov.model}`); }
          return r;
        } catch (e: any) {
          if (isAbort(e) || req.signal?.aborted) throw e;
          lastErr = e;
          const pe = e instanceof ProviderError ? e : new ProviderError(String(e?.message ?? e), "network");
          if (pe.kind === "context_length" || pe.kind === "bad_request" || pe.kind === "bad_tool_call") throw pe;
          // a model that is (re)loading, or a local server that is restarting (a 30B GGUF takes 1–3 min), gets 5 minutes before we give up
          const loading = (pe.status === 503 && /still loading/.test(pe.message)) || (pe.kind === "network" && /ECONNREFUSED/.test(pe.message));
          if (loading && waited < 300_000) { const w = pe.retryAfterMs ?? 5000; waited += w; attempt--; this.onEvent?.("model server is loading; waiting"); await sleep(w, req.signal); continue; }
          if (!pe.retryable || attempt === this.retries) break;
          const wait = Math.min(pe.retryAfterMs ?? 1000 * 2 ** attempt, 30_000);
          log.warn(`model call failed (${pe.kind}), retry ${attempt + 1}/${this.retries} in ${wait}ms: ${pe.message.slice(0, 200)}`);
          this.onEvent?.(`model error (${pe.kind}); retrying in ${Math.round(wait / 1000)}s`);
          await sleep(wait, req.signal);
        }
      }
      if (p + 1 < this.chain.length) {
        log.warn(`falling back from ${prov.model} to ${this.chain[p + 1].model}`);
        this.onEvent?.(`falling back to ${this.chain[p + 1].model}`);
      }
    }
    throw lastErr;
  }
}

export function buildProvider(mc: ModelConfig, cfg: ConfigStore): Provider {
  const apiKey = mc.api_key ?? cfg.secret(mc.api_key_env);
  let base: Provider;
  switch (mc.provider) {
    case "anthropic":
      base = new AnthropicProvider({ baseUrl: mc.base_url || undefined, model: mc.name, apiKey, contextWindow: mc.context_window, maxOutputTokens: mc.max_output_tokens, temperature: mc.temperature, headers: mc.headers });
      break;
    case "openai":
    case "openai-compatible":
    case "ollama":
    case "llamacpp":
    case "lmstudio":
    case "vllm":
    case "openrouter":
    case "azure":
      base = new OpenAIProvider({ baseUrl: mc.base_url, model: mc.name, apiKey, contextWindow: mc.context_window, maxOutputTokens: mc.max_output_tokens, temperature: mc.temperature, headers: mc.headers, extraBody: mc.extra_body, timeoutMs: mc.request_timeout ? mc.request_timeout * 1000 : undefined });
      break;
    default:
      throw new Error(`unknown model provider "${mc.provider}" (use openai or anthropic)`);
  }
  if (mc.tool_mode === "react") return new ReactAdapter(base);
  if (mc.tool_mode === "native") return base;
  return new AutoToolProvider(base);
}

export function buildMainProvider(cfg: ConfigStore, onEvent?: (m: string) => void, override?: Partial<ModelConfig>): ResilientProvider {
  const main = { ...cfg.data.model, ...override } as ModelConfig;
  const chain = [main, ...(cfg.data.fallback_models ?? [])].map((m) => buildProvider({ ...cfg.data.model, ...m } as ModelConfig, cfg));
  return new ResilientProvider(chain, cfg.data.agent.retries, onEvent);
}

/** Auxiliary model for judge / compression / curator / titles — defaults to the main model. */
export function buildAuxProvider(cfg: ConfigStore): Provider {
  const aux = cfg.data.aux ?? {};
  const mc = { ...cfg.data.model, ...aux, tool_mode: "native" } as ModelConfig;
  return new ResilientProvider([buildProvider(mc, cfg)], cfg.data.agent.retries);
}
