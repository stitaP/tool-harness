/** Discord adapter: Gateway WebSocket (Node's built-in WebSocket) + REST. */
import type { Adapter, Inbound } from "./manager.js";
export declare class DiscordAdapter implements Adapter {
    private token;
    private channels;
    readonly platform = "discord";
    readonly maxLen = 1900;
    private ws;
    private hb;
    private seq;
    private botId;
    private stopped;
    constructor(token: string, channels: string[]);
    private rest;
    start(onMessage: (m: Inbound) => void): Promise<void>;
    private connect;
    send(chatId: string, text: string): Promise<void>;
    typing(chatId: string): Promise<void>;
    stop(): Promise<void>;
}
