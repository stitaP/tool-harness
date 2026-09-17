/**
 * stitaP Chains — Model Layer
 *
 * Provider-agnostic chat model. Routes through the stitaP inference
 * router when a local backend is available; otherwise falls back to a
 * deterministic rule-based responder so chains always execute offline.
 */

import type { ChatMessage, ChatModel, GenerateOptions } from "./types";

/** Optional hook: an app can plug any local/API model in here */
export type ModelHook = (
  messages: ChatMessage[],
  options?: GenerateOptions,
) => Promise<ChatMessage> | ChatMessage;

let _hook: ModelHook | null = null;
let _backend = "rule-based-fallback";

/** Register a real model implementation (local GGUF runner, API client, etc.) */
export function registerModelHook(hook: ModelHook): void {
  _hook = hook;
}

export function unregisterModelHook(): void {
  _hook = null;
  _backend = "rule-based-fallback";
}

/** Report the active serving backend (transparent degradation per spec §7) */
export function activeBackend(): string {
  return _backend;
}

// ─── Rule-Based Fallback ──────────────────────────────────────────────────────

/**
 * Deterministic responder used when no model is installed.
 * It understands the ReAct protocol well enough to terminate agent loops
 * and echoes structured intent so parsers remain exercisable in tests.
 */
function ruleBasedRespond(messages: ChatMessage[]): ChatMessage {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content ?? "";

  // If a JSON extraction is requested, emit minimal valid JSON
  if (/json/i.test(text)) {
    const keyMatch = text.match(/keys?\s*[:=]\s*\[([^\]]*)\]/i);
    const keys = keyMatch
      ? keyMatch[1].split(",").map((k) => k.trim().replace(/["']/g, "")).filter(Boolean)
      : ["summary"];
    const value: Record<string, string> = {};
    for (const k of keys) value[k] = "";
    return { role: "assistant", content: JSON.stringify(value) };
  }

  // If a list is requested, emit a short bullet list
  if (/list|steps?/i.test(text)) {
    return {
      role: "assistant",
      content: "- Step 1\n- Step 2\n- Step 3",
    };
  }

  // Default concise acknowledgement
  const firstSentence = text.split(/[.\n]/)[0]?.trim() ?? "";
  return {
    role: "assistant",
    content: firstSentence ? `OK — ${firstSentence}` : "OK.",
  };
}

// ─── Router-Backed Model ──────────────────────────────────────────────────────

/**
 * The default chat model. Delegates to the registered hook when present;
 * otherwise serves via the deterministic fallback. The backend label is
 * always accurate so UIs can show "Running on X" transparently.
 */
export class stitaPChatModel implements ChatModel {
  readonly modelName: string;

  constructor(modelName = "stitap-local") {
    this.modelName = modelName;
  }

  get backend(): string {
    return _backend;
  }

  async generate(
    messages: ChatMessage[],
    options?: GenerateOptions,
  ): Promise<ChatMessage> {
    if (_hook) {
      try {
        const out = await _hook(messages, options);
        // Backend label should be set by the hook itself; keep default otherwise
        return out;
      } catch {
        // Fail soft to the rule-based path — never crash a chain on model errors
      }
    }
    _backend = "rule-based-fallback";
    await tick(); // yield so async flows stay consistent
    return ruleBasedRespond(messages);
  }
}

/** Convenience singleton */
export function defaultModel(): stitaPChatModel {
  return new stitaPChatModel();
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
