/**
 * harnessd HTTP server: web chat UI, JSON API + Server-Sent Events, an
 * OpenAI-compatible endpoint, and inbound webhooks. Zero dependencies.
 * Binds to 127.0.0.1 by default; every API call needs the local token.
 */
import { type IncomingMessage } from "node:http";
import type { Runtime } from "../runtime/runtime.js";
export declare function serverToken(home: string): string;
export interface ServerHandle {
    url: string;
    token: string;
    close(): Promise<void>;
    webhooks: Map<string, (payload: any, req: IncomingMessage) => Promise<any>>;
}
export declare function startServer(rt: Runtime, opts?: {
    host?: string;
    port?: number;
}): Promise<ServerHandle>;
