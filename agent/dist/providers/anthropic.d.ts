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
