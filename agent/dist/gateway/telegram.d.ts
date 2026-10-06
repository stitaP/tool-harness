/** Telegram Bot API adapter (long polling; no public URL needed). */
import type { Adapter, Inbound } from "./manager.js";
export declare class TelegramAdapter implements Adapter {
    private token;
    readonly platform = "telegram";
    readonly maxLen = 4000;
    private running;
    private offset;
    private ctrl;
    constructor(token: string);
    private api;
    start(onMessage: (m: Inbound) => void): Promise<void>;
    send(chatId: string, text: string): Promise<void>;
    typing(chatId: string): Promise<void>;
    stop(): Promise<void>;
}
