import type { Runtime, GatewayLike } from "../runtime/runtime.js";
import type { ServerHandle } from "../server/http.js";
export interface Inbound {
    platform: string;
    chatId: string;
    userId: string;
    userName: string;
    text: string;
    images?: string[];
    threadId?: string;
    isDM: boolean;
}
export interface Adapter {
    readonly platform: string;
    start(onMessage: (m: Inbound) => void): Promise<void>;
    send(chatId: string, text: string): Promise<void>;
    typing?(chatId: string): Promise<void>;
    stop(): Promise<void>;
    maxLen: number;
}
export declare function chunkText(text: string, max: number): string[];
export declare class GatewayManager implements GatewayLike {
    private rt;
    adapters: Map<string, Adapter>;
    private typingTimers;
    private watched;
    constructor(rt: Runtime);
    platforms(): string[];
    start(server?: ServerHandle): Promise<string[]>;
    stop(): Promise<void>;
    send(platform: string, target: string, text: string): Promise<void>;
    private allowed;
    private sessionFor;
    private inbound;
    private target;
    private onEvent;
    private webhook;
}
export declare function approvePairing(rt: Runtime, code: string): string;
