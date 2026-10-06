/** Slack adapter via Socket Mode (no public URL needed). Needs a bot token (xoxb-) and app token (xapp-). */
import type { Adapter, Inbound } from "./manager.js";
export declare class SlackAdapter implements Adapter {
    private botToken;
    private appToken;
    readonly platform = "slack";
    readonly maxLen = 3500;
    private ws;
    private stopped;
    private botUser;
    constructor(botToken: string, appToken: string);
    private api;
    start(onMessage: (m: Inbound) => void): Promise<void>;
    private connect;
    send(chatId: string, text: string): Promise<void>;
    stop(): Promise<void>;
}
