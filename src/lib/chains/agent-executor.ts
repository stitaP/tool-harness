/**
 * stitaP Chains — Agent Executor
 *
 * A ReAct-style tool-calling loop (Reason → Act → Observe), following the
 * best pattern from LangChain's AgentExecutor: bounded iterations, explicit
 * Thought/Action/Observation protocol, and graceful termination.
 *
 * Works with ANY model — including tiny SLMs — because when no model hook is
 * registered, the rule-based fallback terminates deterministically instead of
 * looping forever.
 */

import type {
  AgentResult,
  AgentStep,
  AgentTool,
  ChatMessage,
  ChatModel,
  GenerateOptions,
} from "./types";
import { defaultModel } from "./llm";

// ─── Protocol Prompt ──────────────────────────────────────────────────────────

export const REACT_SYSTEM = `You are an agent that answers questions using tools.

Use this exact format:

Thought: reason about what to do next
Action: {tool name, must be one of [{tool_names}]}
Action Input: {{argument for the tool}}

The tool returns:
Observation: <result>

Repeat Thought/Action/Action Input until you know the answer, then respond with:

Thought: I know the answer now
Final Answer: <answer>

Rules:
- One Action per message.
- Never invent Observations — wait for the tool result.`;

function buildReactUserMessage(
  question: string,
  tools: AgentTool[],
  history: AgentStep[],
): string {
  let msg = `Question: ${question}\n\nAvailable tools:\n`;
  for (const t of tools) {
    msg += `- ${t.name}: ${t.description} (args: ${t.parameters})\n`;
  }
  if (history.length) {
    msg += "\nPrevious steps:\n";
    for (const s of history) {
      if (s.thought) msg += `Thought: ${s.thought}\n`;
      if (s.toolCall) msg += `Action: ${s.toolCall.name}\nAction Input: ${JSON.stringify(s.toolCall.args)}\n`;
      if (s.observation) msg += `Observation: ${s.observation}\n`;
    }
    msg += "\nContinue from here.";
  }
  return msg;
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

export interface ParsedAgentResponse {
  thought?: string;
  action?: string;
  actionInput?: Record<string, unknown>;
  finalAnswer?: string;
}

/** Parse a ReAct-formatted model response */
export function parseReactResponse(text: string): ParsedAgentResponse {
  const out: ParsedAgentResponse = {};

  const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=\nAction:|\nFinal Answer:|$)/i);
  if (thoughtMatch) out.thought = thoughtMatch[1].trim();

  const finalMatch = text.match(/Final Answer:\s*([\s\S]*)/i);
  if (finalMatch) out.finalAnswer = finalMatch[1].trim();

  const actionMatch = text.match(/Action:\s*(.+)/i);
  if (actionMatch) out.action = actionMatch[1].trim().replace(/[{}]/g, "").trim();

  const inputMatch = text.match(/Action Input:\s*([\s\S]*?)(?=\nThought:|\nAction:|\nFinal Answer:|$)/i);
  if (inputMatch) {
    const raw = inputMatch[1].trim();
    try {
      out.actionInput = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Treat raw text as {input: "..."} — common SLM behaviour
      out.actionInput = { input: raw.replace(/^["']|["']$/g, "") };
    }
  }

  return out;
}

// ─── Agent Executor ───────────────────────────────────────────────────────────

export interface AgentExecutorConfig {
  name?: string;
  tools: AgentTool[];
  model?: ChatModel;
  /** Max Reason→Act loops (default 8) */
  maxIterations?: number;
  generateOptions?: GenerateOptions;
}

/**
 * Executes the ReAct loop against the configured tools until a Final Answer
 * or maxIterations. Every iteration is traced in the result for observability.
 */
export class AgentExecutor {
  private tools: Map<string, AgentTool>;
  private model: ChatModel;
  private maxIterations: number;
  private generateOptions: GenerateOptions | undefined;

  constructor(config: AgentExecutorConfig) {
    this.tools = new Map(config.tools.map((t) => [t.name.toLowerCase(), t]));
    this.model = config.model ?? defaultModel();
    this.maxIterations = config.maxIterations ?? 8;
    this.generateOptions = config.generateOptions;
  }

  async run(question: string): Promise<AgentResult> {
    const steps: AgentStep[] = [];

    for (let i = 1; i <= this.maxIterations; i++) {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: REACT_SYSTEM.replace(
            "{tool_names}",
            Array.from(this.tools.keys()).join(", "),
          ),
        },
        { role: "user", content: buildReactUserMessage(question, Array.from(this.tools.values()), steps) },
      ];

      const response = await this.model.generate(messages, this.generateOptions);
      const parsed = parseReactResponse(response.content);

      // Termination: final answer present
      if (parsed.finalAnswer) {
        steps.push({ iteration: i, thought: parsed.thought, finalAnswer: parsed.finalAnswer });
        return { answer: parsed.finalAnswer, steps, iterations: i };
      }

      // Tool call requested?
      const toolName = parsed.action?.toLowerCase();
      const tool = toolName ? this.tools.get(toolName) : undefined;

      if (tool && parsed.actionInput !== undefined) {
        let observation: string;
        try {
          const result = await tool.execute(parsed.actionInput);
          observation =
            typeof result === "string" ? result : JSON.stringify(result);
        } catch (err) {
          observation = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        }
        steps.push({
          iteration: i,
          thought: parsed.thought,
          toolCall: { name: parsed.action!, args: parsed.actionInput },
          observation,
        });
        continue;
      }

      // No parseable action and no answer — stop gracefully with what we have
      steps.push({
        iteration: i,
        thought: parsed.thought ?? response.content.slice(0, 200),
        finalAnswer: response.content.trim() || "Unable to determine an answer.",
      });
      return {
        answer: steps[steps.length - 1].finalAnswer!,
        steps,
        iterations: i,
      };
    }

    // Exhausted iterations without a final answer
    const lastObs = [...steps].reverse().find((s) => s.observation)?.observation;
    const fallback = lastObs
      ? `Reached max iterations (${this.maxIterations}). Last observation: ${lastObs}`
      : `Reached max iterations (${this.maxIterations}) without a final answer.`;
    return { answer: fallback, steps, iterations: this.maxIterations };
  }
}
