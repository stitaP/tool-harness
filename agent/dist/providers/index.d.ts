import type { ConfigStore, ModelConfig } from "../config.js";
import { type ChatRequest, type ChatResponse, type Provider } from "./types.js";
export * from "./types.js";
export { OpenAIProvider } from "./openai.js";
export { AnthropicProvider } from "./anthropic.js";
export { ReactAdapter, FunctionProvider } from "./react.js";
/** Native tool calling first; permanently switch to ReAct if the server rejects tools. */
export declare class AutoToolProvider implements Provider {
    private inner;
    private react;
    private useReact;
    constructor(inner: Provider);
    get id(): string;
    get model(): string;
    get contextWindow(): number;
    get mode(): "native" | "react";
    chat(req: ChatRequest): Promise<ChatResponse>;
}
/** Retries with backoff, then walks the fallback chain. */
export declare class ResilientProvider implements Provider {
    private chain;
    private retries;
    private onEvent?;
    active: number;
    constructor(chain: Provider[], retries?: number, onEvent?: ((msg: string) => void) | undefined);
    get id(): string;
    get model(): string;
    get contextWindow(): number;
    chat(req: ChatRequest): Promise<ChatResponse>;
}
export declare function buildProvider(mc: ModelConfig, cfg: ConfigStore): Provider;
export declare function buildMainProvider(cfg: ConfigStore, onEvent?: (m: string) => void, override?: Partial<ModelConfig>): ResilientProvider;
/** Auxiliary model for judge / compression / curator / titles — defaults to the main model. */
export declare function buildAuxProvider(cfg: ConfigStore): Provider;
