/**
 * stitaP Chains — Chains & Composition
 *
 * LLMChain (prompt → model → parser), SequentialChain (multi-step with
 * variable passing), and functional composition helpers. All follow the
 * Runnable pipe pattern so any unit composes with any other.
 */

import type {
  ChainResult,
  ChatMessage,
  ChatModel,
  ParsedOutput,
  Runnable,
  RunConfig,
  StepTrace,
} from "./types";
import { BaseRunnable, PromptTemplate, JsonOutputParser } from "./prompts";
import { defaultModel } from "./llm";

// ─── LLMChain ─────────────────────────────────────────────────────────────────

export interface LLMChainConfig {
  name?: string;
  prompt: PromptTemplate;
  model?: ChatModel;
  /** Optional output parser; defaults to raw text */
  parser?: { invoke(text: string): Promise<ParsedOutput> };
}

/**
 * The workhorse chain: format prompt → generate → parse.
 * Returns the parsed value (or raw string when no parser is set).
 */
export class LLMChain extends BaseRunnable<Record<string, unknown>, unknown> {
  private prompt: PromptTemplate;
  private model: ChatModel;
  private parser?: { invoke(text: string): Promise<ParsedOutput> };

  constructor(config: LLMChainConfig) {
    super(config.name ?? "LLMChain");
    this.prompt = config.prompt;
    this.model = config.model ?? defaultModel();
    this.parser = config.parser;
  }

  async invoke(input: Record<string, unknown>, config?: RunConfig): Promise<unknown> {
    const messages = this.prompt.toMessages(input);
    const response = await this.model.generate(messages);
    const text = response.content;
    if (!this.parser) return text;
    const parsed = await this.parser.invoke(text);
    return parsed.value;
  }

  /** Raw access to generated text without parsing */
  async generateText(input: Record<string, unknown>): Promise<string> {
    const messages = this.prompt.toMessages(input);
    const response = await this.model.generate(messages);
    return response.content;
  }
}

// ─── SequentialChain ──────────────────────────────────────────────────────────

export interface SequentialChainConfig {
  name?: string;
  /** Ordered steps. Each step reads from the shared variable map. */
  steps: Array<{
    name: string;
    run: (vars: Record<string, unknown>) => Promise<unknown>;
    /** Key(s) under which the step's output is stored for later steps */
    outputs: string[];
  }>;
}

/**
 * Multi-step pipeline with a shared variable map — the classic
 * SimpleSequentialChain / SequentialChain pattern, generalized:
 * each step can read every previous step's named outputs.
 */
export class SequentialChain extends BaseRunnable<Record<string, unknown>, ChainResult> {
  private steps: SequentialChainConfig["steps"];

  constructor(config: SequentialChainConfig) {
    super(config.name ?? "SequentialChain");
    this.steps = config.steps;
  }

  async invoke(
    input: Record<string, unknown>,
    config?: RunConfig,
  ): Promise<ChainResult> {
    const vars: Record<string, unknown> = { ...input };
    const traces: StepTrace[] = [];
    const start = Date.now();

    for (const step of this.steps) {
      const stepStart = Date.now();
      try {
        if (config?.timeoutMs && Date.now() - start > config.timeoutMs) {
          throw new Error(`SequentialChain exceeded timeout of ${config.timeoutMs}ms at step "${step.name}"`);
        }
        const out = await step.run(vars);
        // Single output → store directly; multiple outputs → expect object
        if (step.outputs.length === 1) {
          vars[step.outputs[0]] = out;
        } else if (out !== null && typeof out === "object") {
          for (const key of step.outputs) {
            vars[key] = (out as Record<string, unknown>)[key];
          }
        }
        traces.push({
          rungable: step.name,
          startedAt: stepStart,
          durationMs: Date.now() - stepStart,
          ok: true,
        });
        config?.onStep?.(traces[traces.length - 1]);
      } catch (err) {
        const trace: StepTrace = {
          rungable: step.name,
          startedAt: stepStart,
          durationMs: Date.now() - stepStart,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        traces.push(trace);
        throw new Error(`Step "${step.name}" failed: ${trace.error}`);
      }
    }

    // Final output = last step's first output
    const lastOutputs = this.steps[this.steps.length - 1]?.outputs ?? [];
    const output = lastOutputs.length ? vars[lastOutputs[0]] : undefined;
    return { output, steps: traces, totalMs: Date.now() - start };
  }
}

// ─── Functional Helpers ───────────────────────────────────────────────────────

/** Wrap any sync/async function as a Runnable (LangChain RunnableLambda) */
export function runFn<I, O>(
  fn: (input: I) => Promise<O> | O,
  name = "runFn",
): Runnable<I, O> {
  return new (class extends BaseRunnable<I, O> {
    constructor() {
      super(name);
    }
    async invoke(input: I): Promise<O> {
      return fn(input);
    }
  })();
}

/** Extract a field from an object input (Runnable passthrough helper) */
export function pickField(field: string): Runnable<Record<string, unknown>, unknown> {
  return runFn((input) => input[field], `pick:${field}`);
}

/**
 * Convenience factory: prompt → LLM → JSON parser in one call.
 * This mirrors LangChain's most common usage pattern.
 */
export function simpleJsonChain(config: {
  system?: string;
  template: string;
  name?: string;
}): LLMChain {
  const prompt = new PromptTemplate({
    name: `${config.name ?? "chain"}-prompt`,
    template: config.template,
    system:
      config.system ??
      "You are a precise assistant. Always respond with valid JSON only.",
  });
  return new LLMChain({
    name: config.name,
    prompt,
    parser: new JsonOutputParser(),
  });
}
