/**
 * stitaP Chains — Core Types
 *
 * An in-house orchestration library following the best patterns of
 * LangChain: composable runnables, prompt templates, output parsers,
 * and a provider-agnostic model interface.
 *
 * Zero external dependencies. The model layer routes through the
 * stitaP inference router; a deterministic rule-based fallback keeps
 * every chain runnable offline without any model installed.
 */

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  /** Tool name when role === "tool" or a tool_call is referenced */
  name?: string;
  /** Structured tool invocation requested by the model */
  toolCall?: { name: string; args: Record<string, unknown> };
}

// ─── Model Interface ──────────────────────────────────────────────────────────

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

/** Provider-agnostic chat-model interface (LangChain BaseChatModel pattern) */
export interface ChatModel {
  readonly modelName: string;
  /** Which backend serves this model (from the inference router) */
  backend: string;
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<ChatMessage>;
}

// ─── Runnable Pattern ─────────────────────────────────────────────────────────

/**
 * The core composable unit (LangChain Runnable pattern).
 * Every chain, prompt, parser and model implements Runnable so they
 * compose with `.pipe()` into declarative pipelines.
 */
export interface Runnable<I = unknown, O = unknown> {
  readonly name: string;
  invoke(input: I, config?: RunConfig): Promise<O>;
  /** Compose: this.pipe(next) returns a Runnable that feeds our output into next */
  pipe<N>(next: Runnable<O, N>): Runnable<I, N>;
}

export interface RunConfig {
  /** Tags for tracing */
  tags?: string[];
  /** Callback on each step completion */
  onStep?: (step: StepTrace) => void;
  /** Wall-clock budget for the whole run (ms) */
  timeoutMs?: number;
}

export interface StepTrace {
  rungable: string;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  error?: string;
  inputPreview?: string;
  outputPreview?: string;
}

export interface ChainResult<O = unknown> {
  output: O;
  steps: StepTrace[];
  totalMs: number;
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

export interface FewShotExample {
  input: string;
  output: string;
}

export interface PromptTemplateConfig {
  name?: string;
  /** Template with {variable} placeholders */
  template: string;
  /** System message prepended before the user template */
  system?: string;
  variables?: string[];
  fewShot?: FewShotExample[];
}

// ─── Output Parsers ───────────────────────────────────────────────────────────

export type ParsedOutput =
  | { kind: "json"; value: unknown }
  | { kind: "list"; value: string[] }
  | { kind: "code"; value: string; language?: string }
  | { kind: "text"; value: string };

// ─── Tools & Agent Executor ───────────────────────────────────────────────────

export interface AgentTool {
  name: string;
  description: string;
  /** JSON-ish parameter schema description for the prompt */
  parameters: string;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface AgentStep {
  iteration: number;
  thought?: string;
  toolCall?: { name: string; args: Record<string, unknown> };
  observation?: string;
  finalAnswer?: string;
}

export interface AgentResult {
  answer: string;
  steps: AgentStep[];
  iterations: number;
}
