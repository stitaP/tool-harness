/**
 * Environment Tools — for the stitaP Tool Store.
 *
 * Tools that let the LLM create, manage, and execute code in
 * isolated virtual environments for multiple programming languages.
 */

import type { ToolManifest, ToolParameter, ToolCapability } from "../tool-types";

// ─── Shared capabilities ─────────────────────────────────────────────────────

const ENV_CAPABILITIES: ToolCapability[] = [
  {
    name: "code-execution",
    description: "Execute code in sandboxed language runtimes (JS, Python, Rust, Shell)",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
  {
    name: "environment-isolation",
    description: "Each environment has its own scope, packages, and virtual file system",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
];

// ─── env.create ──────────────────────────────────────────────────────────────

export const ENV_CREATE_TOOL: ToolManifest = {
  id: "env.create",
  name: "Create Environment",
  description: "Create an isolated virtual environment for a specific programming language with resource limits",
  longDescription: "Creates a new sandboxed environment with its own global scope, virtual file system, installed packages, and resource limits. Each environment is fully isolated — code in one environment cannot affect another. Supported languages: JavaScript, TypeScript, Python, Rust, Shell.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "Terminal",
  color: "#22c55e",
  tags: ["environment", "sandbox", "code", "execution", "runtime", "isolated"],
  parameters: [
    { name: "name", type: "string", description: "Human-readable name for the environment", required: true },
    { name: "language", type: "enum", description: "Programming language for this environment", required: true, enum: ["javascript", "typescript", "python", "rust", "shell"] },
    { name: "memoryLimitMB", type: "number", description: "Maximum memory in MB (default 128)", required: false },
    { name: "timeoutMs", type: "number", description: "Maximum execution time in ms (default 30000)", required: false },
    { name: "envVars", type: "string", description: "JSON object of environment variables", required: false },
  ],
  capabilities: ENV_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── env.run ─────────────────────────────────────────────────────────────────

export const ENV_RUN_TOOL: ToolManifest = {
  id: "env.run",
  name: "Run Code",
  description: "Execute code in an existing environment, capturing stdout, stderr, return value, and execution time",
  longDescription: "Runs code in the specified environment's language runtime. Captures all output (stdout, stderr), measures execution time and memory usage, handles timeouts gracefully, and returns structured results with error details (line numbers, stack traces). Supports async code, Promise resolution, and module imports.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "Play",
  color: "#3b82f6",
  tags: ["run", "execute", "code", "output", "result", "sandbox"],
  parameters: [
    { name: "environmentId", type: "string", description: "ID of the environment to run in (from env.create)", required: true },
    { name: "code", type: "string", description: "Code to execute", required: true },
    { name: "stdin", type: "string", description: "Standard input data", required: false },
    { name: "timeoutMs", type: "number", description: "Override timeout in ms", required: false },
    { name: "workDir", type: "string", description: "Override working directory", required: false },
  ],
  capabilities: ENV_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── env.list ────────────────────────────────────────────────────────────────

export const ENV_LIST_TOOL: ToolManifest = {
  id: "env.list",
  name: "List Environments",
  description: "List all active environments with their language, status, package count, and execution history",
  longDescription: "Returns a summary of all active virtual environments including: ID, name, language, memory limits, installed packages, execution count, and last-used timestamp. Useful for managing multiple concurrent code execution contexts.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "LayoutList",
  color: "#8b5cf6",
  tags: ["list", "environments", "status", "management"],
  parameters: [
    { name: "language", type: "enum", description: "Filter by language (omit for all)", required: false, enum: ["javascript", "typescript", "python", "rust", "shell"] },
  ],
  capabilities: ENV_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── env.destroy ─────────────────────────────────────────────────────────────

export const ENV_DESTROY_TOOL: ToolManifest = {
  id: "env.destroy",
  name: "Destroy Environment",
  description: "Destroy an environment and free its resources (memory, file system, packages)",
  longDescription: "Permanently destroys a virtual environment, freeing all associated resources including memory, virtual file system contents, and installed packages. The environment ID becomes invalid after destruction.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "Trash2",
  color: "#ef4444",
  tags: ["destroy", "cleanup", "environment", "resource"],
  parameters: [
    { name: "environmentId", type: "string", description: "ID of the environment to destroy", required: true },
  ],
  capabilities: ENV_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const ENV_TOOLS: ToolManifest[] = [
  ENV_CREATE_TOOL,
  ENV_RUN_TOOL,
  ENV_LIST_TOOL,
  ENV_DESTROY_TOOL,
];
