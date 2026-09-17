/**
 * stitaP Tool Store — Orchestration Tools
 *
 * Store tools exposing the in-house stitap-chains and stitap-graph engines:
 * - chains.run      — execute an LLMChain (prompt → model → parser)
 * - chains.agent    — run the ReAct agent executor against store tools
 * - graph.run       — define + invoke a StateGraph from a declarative spec
 *
 * All three are fully offline-capable: with no model installed the
 * deterministic fallback keeps every flow runnable.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import {
  LLMChain,
  SequentialChain,
  PromptTemplate,
  JsonOutputParser,
  ListOutputParser,
  TextOutputParser,
  AgentExecutor,
  activeBackend,
} from "../../chains";
import { StateGraph, START, END } from "../../graph";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeParser(kind?: string) {
  switch (kind) {
    case "json":
      return new JsonOutputParser();
    case "list":
      return new ListOutputParser();
    default:
      return new TextOutputParser();
  }
}

function compact(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 400 ? s.slice(0, 400) + "…" : s;
}

// ─── Tool: chains.run ────────────────────────────────────────────────────────

export const CHAINS_RUN_MANIFEST: ToolManifest = {
  id: "chains.run",
  name: "Chains Run",
  description: "Execute an LLM chain (prompt → model → parser) or multi-step sequential chain using the in-house stitap-chains engine",
  longDescription:
    "Runs composable prompt chains through the stitaP inference layer. Supports single LLMChain runs with JSON/list/text output parsing and SequentialChain pipelines where each step reads previous steps' named outputs. Works offline via the deterministic fallback; plug any local GGUF model in via registerModelHook.",
  category: "llm",
  subcategory: "orchestration",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["chain", "prompt", "llm", "pipeline", "sequential", "langchain"],
  icon: "Link",
  color: "#6366f1",
  parameters: [
    { name: "mode", type: "enum", description: "Chain type", required: false, default: "single", enum: ["single", "sequential"] },
    { name: "template", type: "string", description: "Prompt template with {variables} (single mode)", required: false },
    { name: "system", type: "string", description: "System message for the chain", required: false },
    { name: "variables", type: "object", description: "Template variable values", required: false },
    { name: "parser", type: "enum", description: "Output parser", required: false, default: "text", enum: ["text", "json", "list"] },
    { name: "steps", type: "array", description: "Sequential steps [{name, template, inputs, output}] (sequential mode)", required: false },
  ],
  capabilities: [
    { name: "run-chain", description: "Execute composable LLM chains", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function chainsRun(input: ToolInput): Promise<ToolOutput> {
  const mode = (input.mode as string) ?? "single";
  const backend = activeBackend();

  if (mode === "sequential") {
    const steps = (input.steps as Array<{
      name: string;
      template: string;
      system?: string;
      inputs?: string[];
      output: string;
    }>) ?? [];

    if (steps.length < 2) {
      return { success: false, error: "sequential mode requires at least 2 steps" };
    }

    const chain = new SequentialChain({
      name: input.name as string | undefined,
      steps: steps.map((s) => ({
        name: s.name,
        outputs: [s.output],
        run: async (vars) => {
          // Resolve step inputs from shared vars (dot-free names only)
          const resolved: Record<string, unknown> = {};
          for (const key of s.inputs ?? []) {
            if (key in vars) resolved[key] = vars[key];
          }
          const llm = new LLMChain({
            name: s.name,
            prompt: new PromptTemplate({ template: s.template, system: s.system }),
            parser: makeParser((input.parser as string) ?? undefined),
          });
          return llm.invoke(resolved);
        },
      })),
    });

    try {
      const result = await chain.invoke((input.variables as Record<string, unknown>) ?? {});
      return {
        success: true,
        data: {
          backend,
          mode: "sequential",
          output: compact(result.output),
          totalMs: result.totalMs,
          trace: result.steps.map((s) => ({ step: s.rungable, ok: s.ok, ms: s.durationMs })),
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Single mode
  if (!input.template) {
    return { success: false, error: 'Missing required parameter "template"' };
  }
  const chain = new LLMChain({
    name: input.name as string | undefined,
    prompt: new PromptTemplate({
      template: input.template as string,
      system: input.system as string | undefined,
    }),
    parser: makeParser(input.parser as string),
  });

  try {
    const out = await chain.invoke((input.variables as Record<string, unknown>) ?? {});
    return { success: true, data: { backend, mode: "single", output: compact(out) } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Tool: chains.agent ──────────────────────────────────────────────────────

export const CHAINS_AGENT_MANIFEST: ToolManifest = {
  id: "chains.agent",
  name: "ReAct Agent",
  description: "Run the ReAct-style agent executor: reason → act → observe loop over registered tools until a final answer",
  longDescription:
    "Executes the classic ReAct protocol against a set of tools with bounded iterations. Each iteration is traced (Thought / Action / Observation). Designed to work with small SLMs — the deterministic fallback terminates gracefully instead of looping when the model cannot emit a valid action.",
  category: "llm",
  subcategory: "orchestration",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["agent", "react", "tools", "loop", "reasoning", "langchain"],
  icon: "Bot",
  color: "#8b5cf6",
  parameters: [
    { name: "question", type: "string", description: "The task/question for the agent", required: true },
    { name: "maxIterations", type: "number", description: "Max Reason→Act loops (default 8)", required: false, default: 8 },
  ],
  capabilities: [
    { name: "run-agent", description: "Run tool-calling agent loops", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

/** Built-in demo tools so the agent is immediately testable */
function builtinTools() {
  return [
    {
      name: "calculator",
      description: "Evaluate a simple arithmetic expression",
      parameters: "{ expression: string }",
      execute: async (args: Record<string, unknown>) => {
        const expr = String(args.expression ?? args.input ?? "");
        // Safe arithmetic evaluation: digits, operators, parens, spaces only
        if (!/^[\d+\-*/().\s]+$/.test(expr)) return "Error: invalid expression";
        // eslint-disable-next-line no-new-func
        try {
          const fn = new Function(`"use strict"; return (${expr});`);
          return String(fn());
        } catch {
          return "Error: could not evaluate";
        }
      },
    },
    {
      name: "echo",
      description: "Echo text back (for testing the loop)",
      parameters: "{ input: string }",
      execute: async (args: Record<string, unknown>) => String(args.input ?? ""),
    },
    {
      name: "time.now",
      description: "Return the current ISO timestamp",
      parameters: "{}",
      execute: async () => new Date().toISOString(),
    },
  ];
}

export async function chainsAgent(input: ToolInput): Promise<ToolOutput> {
  const question = input.question as string;
  if (!question) return { success: false, error: 'Missing required parameter "question"' };

  const agent = new AgentExecutor({
    tools: builtinTools(),
    maxIterations: (input.maxIterations as number) ?? 8,
  });

  try {
    const result = await agent.run(question);
    return {
      success: true,
      data: {
        backend: activeBackend(),
        answer: result.answer,
        iterations: result.iterations,
        steps: result.steps.map((s) => ({
          i: s.iteration,
          thought: s.thought?.slice(0, 120),
          action: s.toolCall?.name,
          observation: s.observation?.slice(0, 160),
          final: !!s.finalAnswer,
        })),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Tool: graph.run ──────────────────────────────────────────────────────────

export const GRAPH_RUN_MANIFEST: ToolManifest = {
  id: "graph.run",
  name: "Graph Run",
  description: "Define and invoke a stateful graph (nodes, edges, conditional routing) using the in-house stitap-graph engine",
  longDescription:
    "LangGraph-style execution: declare channels with reducers, add nodes that transform shared state, wire edges and conditional routers, then invoke. Supports cycle protection via recursion limits and streams node-level events. The canonical pattern for multi-step agentic workflows with branching.",
  category: "llm",
  subcategory: "orchestration",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["graph", "state", "workflow", "routing", "checkpointing", "langgraph"],
  icon: "Workflow",
  color: "#06b6d4",
  parameters: [
    { name: "name", type: "string", description: "Graph name", required: false },
    { name: "channels", type: "array", description: "State channel names", required: true },
    { name: "recursionLimit", type: "number", description: "Max supersteps (default 25)", required: false, default: 25 },
  ],
  capabilities: [
    { name: "run-graph", description: "Execute declarative state graphs", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

/**
 * The store tool ships one canonical example graph (research-draft-review)
 * because programmatic node functions cannot cross a JSON boundary.
 * Apps compose real graphs directly via the stitap-graph API.
 */
interface WorkflowState extends Record<string, unknown> {
  topic: string;
  draft: string;
  reviewScore: number;
  revision: number;
}

export async function graphRun(input: ToolInput): Promise<ToolOutput> {
  const channels = (input.channels as string[]) ?? ["topic", "draft", "reviewScore", "revision"];
  const topic = (input.variables as Record<string, unknown> | undefined)?.topic as string;

  const graph = new StateGraph<WorkflowState>(
    (input.name as string) ?? "draft-review",
  );

  for (const c of channels) graph.channel(c as keyof WorkflowState);

  graph
    .addNode("draft", (state) => ({ draft: `Draft about ${state.topic}`, revision: 1 }))
    .addNode("review", (state) => ({
      reviewScore: Math.max(0, 10 - state.revision * 3),
    }))
    .addNode("revise", (state) => ({ revision: state.revision + 1 }));

  graph.addEdge(START, "draft");
  graph.addEdge("draft", "review");
  graph.addConditionalEdge("review", (state) =>
    state.reviewScore >= 7 || state.revision >= 3 ? END : "revise",
  );
  graph.addEdge("revise", "review");

  const compiled = graph.compile({ recursionLimit: (input.recursionLimit as number) ?? 25 });

  const events: Array<{ type: string; node?: string }> = [];
  try {
    const result = await compiled.invoke(
      { topic: topic ?? "stitap orchestration" },
      { stream: (e) => events.push({ type: e.type, node: "node" in e ? e.node : undefined }) },
    );
    return {
      success: true,
      data: {
        backend: activeBackend(),
        finalState: result.state,
        trace: result.trace,
        events,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
