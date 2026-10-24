/** Native Anthropic Messages API provider (streaming, tool use). */
import type { Msg } from "../state/db.js";
import { type ChatRequest, type ChatResponse, type Provider } from "./types.js";
export interface AnthropicOptions {
    baseUrl?: string;
    model: string;
    apiKey?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    temperature?: number;
    headers?: Record<string, string>;
}
export declare function toAnthropic(messages: Msg[]): {
    system: string;
    messages: any[];
};
export declare class AnthropicProvider implements Provider {
    private o;
    readonly id: string;
    readonly model: string;
    readonly contextWindow: number;
    constructor(o: AnthropicOptions);
    chat(req: ChatRequest): Promise<ChatResponse>;
}
/** Claude models before the 4.6 generation: thinking is set with a token budget instead of adaptive thinking + effort. */
export declare const legacyThinking: (model: string) => boolean;
/**
 * /effort for Claude. Current models: adaptive thinking with `output_config.effort` ("off" = no thinking param and the
 * lowest effort, since newer models cannot turn thinking off). Older models: `thinking.budget_tokens`, which must stay
 * below max_tokens. Thinking does not allow a custom temperature, so it is dropped.
 */
export declare function applyClaudeEffort(body: any, model: string, effort: string): void;
