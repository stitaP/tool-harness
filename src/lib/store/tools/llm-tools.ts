/**
 * LLM Integration Tools — Prompt builders, response parsers, model routing, context management
 *
 * These tools let agents orchestrate any LLM for tutorial generation,
 * content analysis, and script creation.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";

// ─── Tool Manifests ───────────────────────────────────────────────────────────

export const BUILD_PROMPT_MANIFEST: ToolManifest = {
  id: "llm.buildPrompt",
  name: "Build Prompt",
  description: "Build a structured prompt for an LLM from templates and context",
  longDescription:
    "Constructs prompts from templates, context variables, and conversation history. Supports few-shot examples, system prompts, and role-based prompt engineering patterns.",
  category: "llm",
  subcategory: "prompting",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["prompt", "template", "llm", "few-shot", "system"],
  icon: "MessageSquare",
  color: "#8b5cf6",
  parameters: [
    { name: "template", type: "string", description: "Prompt template with {{variables}}", required: true },
    { name: "variables", type: "object", description: "Template variables to substitute", required: false },
    { name: "systemPrompt", type: "string", description: "System/instruction prompt", required: false },
    { name: "fewShot", type: "array", description: "Few-shot examples [{input, output}]", required: false },
    { name: "maxTokens", type: "number", description: "Max tokens hint for the LLM", required: false, default: 2048 },
    { name: "temperature", type: "number", description: "Temperature hint (0-2)", required: false, default: 0.7 },
  ],
  capabilities: [
    { name: "buildPrompt", description: "Construct structured LLM prompts", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 7800,
  rating: 4.7,
  ratingCount: 189,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const PARSE_RESPONSE_MANIFEST: ToolManifest = {
  id: "llm.parseResponse",
  name: "Parse Response",
  description: "Parse LLM response into structured data",
  longDescription:
    "Extracts structured data from LLM responses. Handles JSON extraction from text, markdown table parsing, list extraction, code block extraction, and YAML parsing.",
  category: "llm",
  subcategory: "parsing",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["parse", "response", "json", "extract", "structured"],
  icon: "Braces",
  color: "#06b6d4",
  parameters: [
    { name: "response", type: "string", description: "Raw LLM response text", required: true },
    { name: "format", type: "enum", description: "Expected output format", required: false, default: "auto", enum: ["auto", "json", "list", "table", "code", "yaml"] },
    { name: "schema", type: "object", description: "JSON schema for validation", required: false },
  ],
  capabilities: [
    { name: "parseResponse", description: "Parse LLM output into structured data", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 6500,
  rating: 4.6,
  ratingCount: 145,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const ROUTE_MODEL_MANIFEST: ToolManifest = {
  id: "llm.routeModel",
  name: "Route to Model",
  description: "Route a request to the best available LLM based on task type",
  longDescription:
    "Selects the best available LLM for a given task based on task type, complexity, latency requirements, and available providers. Supports local SLMs, cloud APIs, and hybrid routing.",
  category: "llm",
  subcategory: "routing",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["route", "model", "select", "provider", "fallback"],
  icon: "Route",
  color: "#f59e0b",
  parameters: [
    { name: "taskType", type: "enum", description: "Type of task", required: true, enum: ["script", "narration", "annotation", "summary", "translation", "code", "analysis"] },
    { name: "complexity", type: "enum", description: "Task complexity", required: false, default: "medium", enum: ["simple", "medium", "complex"] },
    { name: "preferredProvider", type: "string", description: "Preferred provider name", required: false },
    { name: "maxLatencyMs", type: "number", description: "Max acceptable latency in ms", required: false, default: 5000 },
    { name: "offlineOnly", type: "boolean", description: "Only use offline/local models", required: false, default: false },
  ],
  capabilities: [
    { name: "routeModel", description: "Select the best LLM for a task", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 5200,
  rating: 4.5,
  ratingCount: 112,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const MANAGE_CONTEXT_MANIFEST: ToolManifest = {
  id: "llm.manageContext",
  name: "Manage Context",
  description: "Manage conversation context window for LLM interactions",
  longDescription:
    "Manages the context window for ongoing LLM conversations. Handles token counting, context truncation, history summarization, and sliding window management to stay within model limits.",
  category: "llm",
  subcategory: "context",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["context", "window", "token", "history", "truncation"],
  icon: "LayoutList",
  color: "#ec4899",
  parameters: [
    { name: "action", type: "enum", description: "Context management action", required: true, enum: ["add", "trim", "summarize", "clear", "export"] },
    { name: "messages", type: "array", description: "Messages to add [{role, content}]", required: false },
    { name: "maxTokens", type: "number", description: "Max context window size (tokens)", required: false, default: 4096 },
    { name: "strategy", type: "enum", description: "Truncation strategy", required: false, default: "sliding", enum: ["sliding", "summary", "priority", "recent"] },
  ],
  capabilities: [
    { name: "manageContext", description: "Manage LLM context windows", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 4800,
  rating: 4.4,
  ratingCount: 89,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const CALL_LLM_MANIFEST: ToolManifest = {
  id: "llm.call",
  name: "Call LLM",
  description: "Make a direct API call to any configured LLM provider",
  longDescription:
    "Unified interface for calling any LLM. Supports OpenAI-compatible APIs, local Ollama, HuggingFace Inference, and custom endpoints. Handles retries, streaming, and error recovery.",
  category: "llm",
  subcategory: "execution",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["call", "api", "inference", "openai", "ollama", "stream"],
  icon: "Send",
  color: "#10b981",
  parameters: [
    { name: "provider", type: "string", description: "Provider name (openai, ollama, huggingface, custom)", required: true },
    { name: "model", type: "string", description: "Model identifier", required: true },
    { name: "messages", type: "array", description: "Messages [{role, content}]", required: true },
    { name: "endpoint", type: "string", description: "Custom endpoint URL", required: false },
    { name: "maxTokens", type: "number", description: "Max tokens to generate", required: false, default: 2048 },
    { name: "temperature", type: "number", description: "Temperature", required: false, default: 0.7 },
    { name: "stream", type: "boolean", description: "Enable streaming", required: false, default: false },
    { name: "timeout", type: "number", description: "Request timeout in ms", required: false, default: 30000 },
  ],
  capabilities: [
    { name: "callLLM", description: "Call any LLM via unified API", requiresBrowser: true, requiresNetwork: true, offline: false },
  ],
  installs: 9200,
  rating: 4.8,
  ratingCount: 234,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const GENERATE_SCRIPT_MANIFEST: ToolManifest = {
  id: "llm.generateScript",
  name: "Generate Tutorial Script",
  description: "Generate a complete video tutorial script using an LLM",
  longDescription:
    "End-to-end script generation: takes documentation content and uses an LLM to produce a structured tutorial script with scenes, narration, visual cues, and timing. Works with any OpenAI-compatible LLM.",
  category: "llm",
  subcategory: "generation",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["script", "generate", "tutorial", "video", "scenes"],
  icon: "Clapperboard",
  color: "#ef4444",
  parameters: [
    { name: "content", type: "string", description: "Documentation content to generate from", required: true },
    { name: "title", type: "string", description: "Tutorial title", required: true },
    { name: "provider", type: "string", description: "LLM provider", required: false, default: "openai" },
    { name: "model", type: "string", description: "Model to use", required: false, default: "gpt-4" },
    { name: "audienceLevel", type: "enum", description: "Target audience", required: false, default: "beginner", enum: ["beginner", "intermediate", "advanced"] },
    { name: "maxScenes", type: "number", description: "Max scenes to generate", required: false, default: 20 },
    { name: "style", type: "enum", description: "Narration style", required: false, default: "concise", enum: ["concise", "detailed", "casual", "formal"] },
  ],
  capabilities: [
    { name: "generateScript", description: "LLM-powered tutorial script generation", requiresBrowser: true, requiresNetwork: true, offline: false },
  ],
  dependencies: ["llm.buildPrompt", "llm.parseResponse", "llm.routeModel"],
  installs: 6800,
  rating: 4.7,
  ratingCount: 156,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

// ─── All LLM Tool Manifests ───────────────────────────────────────────────────

export const LLM_TOOLS: ToolManifest[] = [
  BUILD_PROMPT_MANIFEST,
  PARSE_RESPONSE_MANIFEST,
  ROUTE_MODEL_MANIFEST,
  MANAGE_CONTEXT_MANIFEST,
  CALL_LLM_MANIFEST,
  GENERATE_SCRIPT_MANIFEST,
];

// ─── Implementation Functions ─────────────────────────────────────────────────

/** Build a prompt from template and variables */
export function buildPrompt(
  template: string,
  variables?: Record<string, string>,
  systemPrompt?: string,
  fewShot?: Array<{ input: string; output: string }>,
  maxTokens: number = 2048,
  temperature: number = 0.7,
): { system: string; user: string; settings: { maxTokens: number; temperature: number } } {
  let user = template;

  // Substitute {{variables}}
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      user = user.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
  }

  // Add few-shot examples
  if (fewShot && fewShot.length > 0) {
    const examples = fewShot
      .map((ex) => `Input: ${ex.input}\nOutput: ${ex.output}`)
      .join("\n\n");
    user = `Here are some examples:\n\n${examples}\n\nNow, ${user}`;
  }

  return {
    system: systemPrompt || "You are a helpful assistant.",
    user,
    settings: { maxTokens, temperature },
  };
}

/** Parse an LLM response into structured data */
export function parseResponse(
  response: string,
  format: string = "auto",
): { format: string; data: unknown } {
  const trimmed = response.trim();

  // Try JSON extraction
  if (format === "json" || format === "auto") {
    // Look for JSON blocks in markdown
    const jsonMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : trimmed;
    try {
      const parsed = JSON.parse(jsonStr);
      return { format: "json", data: parsed };
    } catch {
      // Not valid JSON, try next format
    }
  }

  // Try list extraction
  if (format === "list" || format === "auto") {
    const listItems = trimmed.match(/^[-*]\s+(.+)$/gm);
    if (listItems && listItems.length > 0) {
      return { format: "list", data: listItems.map((item) => item.replace(/^[-*]\s+/, "")) };
    }
    // Also try numbered lists
    const numItems = trimmed.match(/^\d+[.)]\s+(.+)$/gm);
    if (numItems && numItems.length > 0) {
      return { format: "list", data: numItems.map((item) => item.replace(/^\d+[.)]\s+/, "")) };
    }
  }

  // Try table extraction
  if (format === "table" || format === "auto") {
    const lines = trimmed.split("\n").filter((l) => l.includes("|") && !l.match(/^\|[-|:]+\|$/));
    if (lines.length >= 2) {
      const headers = lines[0].split("|").filter((c) => c.trim()).map((c) => c.trim());
      const rows = lines.slice(1).map((line) =>
        line.split("|").filter((c) => c.trim()).map((c) => c.trim()),
      );
      return { format: "table", data: { headers, rows } };
    }
  }

  // Try code block extraction
  if (format === "code" || format === "auto") {
    const codeMatch = trimmed.match(/```(\w+)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) {
      return { format: "code", data: { language: codeMatch[1] || "text", code: codeMatch[2] } };
    }
  }

  // Fallback: return as plain text
  return { format: "text", data: trimmed };
}

/** Route a task to the best available model */
export function routeModel(
  taskType: string,
  complexity: string = "medium",
  offlineOnly: boolean = false,
): { provider: string; model: string; reasoning: string } {
  const modelMap: Record<string, Record<string, { provider: string; model: string; offline: boolean }>> = {
    script: {
      simple: { provider: "ollama", model: "smollm-135m", offline: true },
      medium: { provider: "ollama", model: "qwen2.5-0.5b", offline: true },
      complex: { provider: "openai", model: "gpt-4", offline: false },
    },
    narration: {
      simple: { provider: "local", model: "formant-synth", offline: true },
      medium: { provider: "local", model: "formant-synth", offline: true },
      complex: { provider: "local", model: "formant-synth", offline: true },
    },
    annotation: {
      simple: { provider: "local", model: "rule-based", offline: true },
      medium: { provider: "ollama", model: "smollm-135m", offline: true },
      complex: { provider: "ollama", model: "qwen2.5-0.5b", offline: true },
    },
    summary: {
      simple: { provider: "ollama", model: "smollm-135m", offline: true },
      medium: { provider: "ollama", model: "qwen2.5-0.5b", offline: true },
      complex: { provider: "openai", model: "gpt-4", offline: false },
    },
    code: {
      simple: { provider: "ollama", model: "qwen2.5-0.5b", offline: true },
      medium: { provider: "ollama", model: "qwen2.5-0.5b", offline: true },
      complex: { provider: "openai", model: "gpt-4", offline: false },
    },
    analysis: {
      simple: { provider: "ollama", model: "smollm-135m", offline: true },
      medium: { provider: "ollama", model: "qwen2.5-0.5b", offline: true },
      complex: { provider: "openai", model: "gpt-4", offline: false },
    },
    translation: {
      simple: { provider: "ollama", model: "smollm-135m", offline: true },
      medium: { provider: "ollama", model: "qwen2.5-0.5b", offline: true },
      complex: { provider: "openai", model: "gpt-4", offline: false },
    },
  };

  const taskModels = modelMap[taskType] || modelMap.summary;
  let selection = taskModels[complexity] || taskModels.medium;

  if (offlineOnly && !selection.offline) {
    selection = taskModels.medium;
  }

  const reasoning = offlineOnly
    ? `Offline mode: using ${selection.model} (${selection.provider}) for ${taskType} task`
    : `Task "${taskType}" at ${complexity} complexity: routing to ${selection.model} (${selection.provider})`;

  return { provider: selection.provider, model: selection.model, reasoning };
}

/** Estimate token count (rough: 1 token ≈ 4 characters) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Truncate context to fit within a token limit */
export function truncateContext(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  strategy: string = "sliding",
): Array<{ role: string; content: string }> {
  const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);

  if (totalTokens <= maxTokens) return messages;

  if (strategy === "sliding") {
    // Keep the most recent messages that fit
    const result: Array<{ role: string; content: string }> = [];
    let tokens = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(messages[i].content);
      if (tokens + msgTokens > maxTokens) break;
      result.unshift(messages[i]);
      tokens += msgTokens;
    }
    return result;
  }

  if (strategy === "priority") {
    // Keep system messages + most recent user messages
    const systemMsgs = messages.filter((m) => m.role === "system");
    const otherMsgs = messages.filter((m) => m.role !== "system");
    const systemTokens = systemMsgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const remaining = maxTokens - systemTokens;

    const result = [...systemMsgs];
    let tokens = 0;
    for (let i = otherMsgs.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(otherMsgs[i].content);
      if (tokens + msgTokens > remaining) break;
      result.unshift(otherMsgs[i]);
      tokens += msgTokens;
    }
    return result;
  }

  // Default: sliding window from the end
  return truncateContext(messages, maxTokens, "sliding");
}
