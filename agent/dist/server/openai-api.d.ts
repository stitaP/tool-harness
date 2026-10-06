/**
 * OpenAI-compatible Chat Completions endpoint backed by the full agent loop,
 * so Open WebUI / LibreChat / any OpenAI client can talk to the harness.
 * Pass `X-Session-Id` (or `user`) to keep a persistent agent session; otherwise
 * the prior messages in the request seed an ephemeral session.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Runtime } from "../runtime/runtime.js";
export declare function handleModels(rt: Runtime, res: ServerResponse): void;
export declare function handleChatCompletions(rt: Runtime, req: IncomingMessage, res: ServerResponse, b: any): Promise<void>;
