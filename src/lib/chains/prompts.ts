/**
 * stitaP Chains — Prompt Templates & Output Parsers
 *
 * LangChain-style {variable} templates with few-shot support, plus
 * robust output parsers (JSON / list / code) with format-repair hints.
 */

import type {
  ChatMessage,
  FewShotExample,
  ParsedOutput,
  PromptTemplateConfig,
  Runnable,
  RunConfig,
} from "./types";

// ─── Runnable Base ────────────────────────────────────────────────────────────

export abstract class BaseRunnable<I, O> implements Runnable<I, O> {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  abstract invoke(input: I, config?: RunConfig): Promise<O>;

  pipe<N>(next: Runnable<O, N>): Runnable<I, N> {
    const self = this;
    return new (class extends BaseRunnable<I, N> {
      constructor() {
        super(`${self.name} -> ${next.name}`);
      }
      async invoke(input: I, config?: RunConfig): Promise<N> {
        const mid = await self.invoke(input, config);
        return next.invoke(mid, config);
      }
    })();
  }
}

// ─── Prompt Template ──────────────────────────────────────────────────────────

export class PromptTemplate extends BaseRunnable<Record<string, unknown>, ChatMessage[]> {
  private template: string;
  private system?: string;
  private variables: string[];
  private fewShot: FewShotExample[];

  constructor(config: PromptTemplateConfig) {
    super(config.name ?? "PromptTemplate");
    this.template = config.template;
    this.system = config.system;
    this.variables = config.variables ?? extractVariables(config.template + " " + (config.system ?? ""));
    this.fewShot = config.fewShot ?? [];
  }

  /** Render the user template with variable substitution */
  format(values: Record<string, unknown>): string {
    let out = this.template;
    for (const v of this.variables) {
      const val = values[v] !== undefined ? String(values[v]) : `{${v}}`;
      out = out.split(`{${v}}`).join(val);
    }
    return out;
  }

  /** Build the full chat message array (system → few-shot → user) */
  toMessages(values: Record<string, unknown>): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (this.system) messages.push({ role: "system", content: this.system });
    for (const shot of this.fewShot) {
      messages.push({ role: "user", content: shot.input });
      messages.push({ role: "assistant", content: shot.output });
    }
    messages.push({ role: "user", content: this.format(values) });
    return messages;
  }

  async invoke(input: Record<string, unknown>): Promise<ChatMessage[]> {
    return this.toMessages(input);
  }
}

/** Extract {variable} placeholders from a template string */
export function extractVariables(template: string): string[] {
  const vars = new Set<string>();
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) vars.add(m[1]);
  return Array.from(vars);
}

// ─── Output Parsers ───────────────────────────────────────────────────────────

export class JsonOutputParser extends BaseRunnable<string, ParsedOutput> {
  constructor() {
    super("JsonOutputParser");
  }

  async invoke(input: string): Promise<ParsedOutput> {
    const parsed = parseLooseJson(input);
    if (parsed === undefined) {
      throw new Error(
        `JSON parse failed. Response must contain a valid JSON object. Received: ${input.slice(0, 200)}`,
      );
    }
    return { kind: "json", value: parsed };
  }
}

export class ListOutputParser extends BaseRunnable<string, ParsedOutput> {
  constructor() {
    super("ListOutputParser");
  }

  async invoke(input: string): Promise<ParsedOutput> {
    const lines = input
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter((l) => l.length > 0);
    return { kind: "list", value: lines };
  }
}

export class TextOutputParser extends BaseRunnable<string, ParsedOutput> {
  constructor() {
    super("TextOutputParser");
  }

  async invoke(input: string): Promise<ParsedOutput> {
    return { kind: "text", value: input.trim() };
  }
}

/**
 * Parse JSON that may be wrapped in markdown fences or surrounded by prose.
 * Finds the first balanced {...} or [...] block and parses that.
 */
export function parseLooseJson(text: string): unknown | undefined {
  // Direct attempt
  try {
    return JSON.parse(text.trim());
  } catch {
    /* fall through */
  }

  // Strip markdown code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }

  // First balanced object/array
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = text.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }
  return undefined;
}
