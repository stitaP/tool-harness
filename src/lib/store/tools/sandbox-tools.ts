/**
 * Sandbox Environment Tools
 *
 * Tools for managing isolated execution sandboxes.
 * Each tool provides a different aspect of sandbox management.
 */

import type { ToolManifest, ToolCapability } from "../tool-types";

// ─── Shared Capabilities ──────────────────────────────────────────────────────

const SANDBOX_CAPABILITIES: ToolCapability[] = [
  {
    name: "sandbox-management",
    description: "Creates, destroys, and manages isolated execution sandboxes with resource limits",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
  {
    name: "code-execution",
    description: "Executes code in isolated sandboxes with network policy enforcement",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
];

// ─── 1. sandbox.create ───────────────────────────────────────────────────────

export const SANDBOX_CREATE_TOOL: ToolManifest = {
  id: "sandbox.create",
  name: "Create Sandbox",
  description:
    "Create a new isolated execution sandbox from a scenario template or custom configuration",
  longDescription:
    "Creates a new sandbox with the specified isolation level, network policy, resource limits, and virtual file system. Can be created from pre-built scenarios (unit testing, integration testing, security audit, development, demo, etc.) or from a fully custom configuration. Each sandbox gets its own Web Worker for code execution isolation, network policy enforcement, and virtual file system.",
  version: "1.0.0",
  category: "browser",
  subcategory: "sandbox",
  author: "stitaP",
  license: "MIT",
  icon: "Plus",
  color: "#10b981",
  tags: ["sandbox", "create", "isolation", "environment", "worker"],
  parameters: [
    {
      name: "scenarioId",
      type: "string",
      description: "Pre-built scenario ID (e.g., 'test-unit', 'dev-sandbox', 'security-audit')",
      required: false,
    },
    {
      name: "name",
      type: "string",
      description: "Human-readable name for the sandbox",
      required: false,
    },
    {
      name: "description",
      type: "string",
      description: "Description of what this sandbox is for",
      required: false,
    },
    {
      name: "isolationLevel",
      type: "enum",
      description: "Isolation level: none (shared), basic (Worker), full (Worker+policy+VFS), paranoid (full+limits)",
      required: false,
      enum: ["none", "basic", "full", "paranoid"],
      default: "full",
    },
    {
      name: "tags",
      type: "string",
      description: "Comma-separated tags for search/filtering",
      required: false,
    },
  ],
  capabilities: SANDBOX_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 2. sandbox.exec ─────────────────────────────────────────────────────────

export const SANDBOX_EXEC_TOOL: ToolManifest = {
  id: "sandbox.exec",
  name: "Execute in Sandbox",
  description:
    "Execute JavaScript/TypeScript code inside an isolated sandbox with network policy enforcement and timeout",
  longDescription:
    "Runs code in the sandbox's isolated Web Worker. The code executes with its own globalThis, isolated from other sandboxes and the main page. Network requests are intercepted and checked against the sandbox's network policy. Console output is captured and returned. Execution is time-limited by the sandbox's resource limits. All file system access goes through the sandbox's virtual FS.",
  version: "1.0.0",
  category: "browser",
  subcategory: "sandbox",
  author: "stitaP",
  license: "MIT",
  icon: "Play",
  color: "#3b82f6",
  tags: ["sandbox", "execute", "run", "code", "isolate"],
  parameters: [
    {
      name: "sandboxId",
      type: "string",
      description: "ID of the sandbox to execute in",
      required: true,
    },
    {
      name: "code",
      type: "string",
      description: "JavaScript/TypeScript code to execute",
      required: true,
    },
    {
      name: "language",
      type: "enum",
      description: "Programming language (auto-detected if omitted)",
      required: false,
      enum: ["javascript", "typescript"],
    },
    {
      name: "timeoutMs",
      type: "number",
      description: "Execution timeout in milliseconds (overrides sandbox default)",
      required: false,
    },
  ],
  capabilities: SANDBOX_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 3. sandbox.list ─────────────────────────────────────────────────────────

export const SANDBOX_LIST_TOOL: ToolManifest = {
  id: "sandbox.list",
  name: "List Sandboxes",
  description:
    "List all active sandboxes with their status, resource usage, and configuration",
  longDescription:
    "Returns a list of all sandboxes managed by the SandboxManager. Each entry includes: ID, name, status, isolation level, resource usage (memory, CPU time, file count), network request count, and creation time. Useful for monitoring active environments and deciding which sandbox to target for execution.",
  version: "1.0.0",
  category: "browser",
  subcategory: "sandbox",
  author: "stitaP",
  license: "MIT",
  icon: "List",
  color: "#8b5cf6",
  tags: ["sandbox", "list", "status", "monitor"],
  parameters: [
    {
      name: "filter",
      type: "enum",
      description: "Filter by status",
      required: false,
      enum: ["all", "idle", "running", "error", "destroyed"],
      default: "all",
    },
    {
      name: "scenarioId",
      type: "string",
      description: "Filter by scenario ID",
      required: false,
    },
    {
      name: "tag",
      type: "string",
      description: "Filter by tag",
      required: false,
    },
  ],
  capabilities: SANDBOX_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 4. sandbox.destroy ──────────────────────────────────────────────────────

export const SANDBOX_DESTROY_TOOL: ToolManifest = {
  id: "sandbox.destroy",
  name: "Destroy Sandbox",
  description:
    "Terminate and clean up an isolated sandbox, freeing its worker, file system, and network logs",
  longDescription:
    "Permanently destroys a sandbox and all its resources: terminates the Web Worker, clears the virtual file system, discards network logs, and removes the sandbox from the manager. This is irreversible — use sandbox.snapshot before destroying if you need to preserve state.",
  version: "1.0.0",
  category: "browser",
  subcategory: "sandbox",
  author: "stitaP",
  license: "MIT",
  icon: "Trash2",
  color: "#ef4444",
  tags: ["sandbox", "destroy", "cleanup", "terminate"],
  parameters: [
    {
      name: "sandboxId",
      type: "string",
      description: "ID of the sandbox to destroy",
      required: true,
    },
  ],
  capabilities: SANDBOX_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 5. sandbox.scenarios ────────────────────────────────────────────────────

export const SANDBOX_SCENARIOS_TOOL: ToolManifest = {
  id: "sandbox.scenarios",
  name: "Browse Sandbox Scenarios",
  description:
    "List all available sandbox scenarios: unit testing, integration, security audit, development, demo, performance",
  longDescription:
    "Returns all pre-built sandbox scenarios with their descriptions, isolation levels, network policies, and initial files. Scenarios include: Unit Test Runner, Integration Test Sandbox, E2E Test Sandbox, Development Sandbox, Preview Sandbox, Production Simulator, Security Audit, Untrusted Code Runner, Stress Test, Demo Showcase, Tutorial Sandbox. Each scenario defines the isolation level, allowed network access, storage permissions, and resource limits.",
  version: "1.0.0",
  category: "browser",
  subcategory: "sandbox",
  author: "stitaP",
  license: "MIT",
  icon: "LayoutTemplate",
  color: "#f59e0b",
  tags: ["sandbox", "scenarios", "templates", "browse"],
  parameters: [
    {
      name: "category",
      type: "enum",
      description: "Filter by category",
      required: false,
      enum: ["all", "testing", "development", "production", "security", "performance", "demo"],
      default: "all",
    },
    {
      name: "search",
      type: "string",
      description: "Search query to filter scenarios",
      required: false,
    },
  ],
  capabilities: SANDBOX_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 6. sandbox.snapshot ─────────────────────────────────────────────────────

export const SANDBOX_SNAPSHOT_TOOL: ToolManifest = {
  id: "sandbox.snapshot",
  name: "Snapshot Sandbox State",
  description:
    "Capture a snapshot of a sandbox's virtual file system and state for later restore or cloning",
  longDescription:
    "Creates a point-in-time snapshot of the sandbox's virtual file system, capturing all files, directories, and their contents. The snapshot can be used to: restore the sandbox to a previous state, clone the sandbox, or persist state across browser sessions. Each snapshot has a unique ID and timestamp.",
  version: "1.0.0",
  category: "browser",
  subcategory: "sandbox",
  author: "stitaP",
  license: "MIT",
  icon: "Camera",
  color: "#06b6d4",
  tags: ["sandbox", "snapshot", "backup", "restore", "state"],
  parameters: [
    {
      name: "sandboxId",
      type: "string",
      description: "ID of the sandbox to snapshot",
      required: true,
    },
  ],
  capabilities: SANDBOX_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 7. sandbox.files ────────────────────────────────────────────────────────

export const SANDBOX_FILES_TOOL: ToolManifest = {
  id: "sandbox.files",
  name: "Manage Sandbox Files",
  description:
    "List, read, or write files in a sandbox's virtual file system",
  longDescription:
    "Manages the virtual file system of a sandbox. Actions: list (show files in a directory), read (get file content), write (create or update a file). The virtual FS is isolated per sandbox — files created in one sandbox are not visible to others. Supports nested directories, file metadata (MIME type, size, timestamps), and size limit enforcement.",
  version: "1.0.0",
  category: "browser",
  subcategory: "sandbox",
  author: "stitaP",
  license: "MIT",
  icon: "FolderOpen",
  color: "#14b8a6",
  tags: ["sandbox", "files", "virtual-fs", "read", "write"],
  parameters: [
    {
      name: "sandboxId",
      type: "string",
      description: "ID of the sandbox",
      required: true,
    },
    {
      name: "action",
      type: "enum",
      description: "File operation",
      required: true,
      enum: ["list", "read", "write", "delete"],
    },
    {
      name: "path",
      type: "string",
      description: "File path (e.g., '/workspace/index.ts')",
      required: false,
    },
    {
      name: "content",
      type: "string",
      description: "Content to write (for write action)",
      required: false,
    },
  ],
  capabilities: SANDBOX_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 8. sandbox.network ──────────────────────────────────────────────────────

export const SANDBOX_NETWORK_TOOL: ToolManifest = {
  id: "sandbox.network",
  name: "Sandbox Network Monitor",
  description:
    "View network traffic log and policy status for a sandbox",
  longDescription:
    "Shows the network request log for a sandbox: all fetch/XHR requests made during execution, which were allowed/blocked by the network policy, response times, payload sizes, and domain breakdown. Also shows the current network policy configuration. Useful for debugging network-dependent code and verifying policy enforcement.",
  version: "1.0.0",
  category: "browser",
  subcategory: "sandbox",
  author: "stitaP",
  license: "MIT",
  icon: "Network",
  color: "#f43f5e",
  tags: ["sandbox", "network", "monitor", "traffic", "policy"],
  parameters: [
    {
      name: "sandboxId",
      type: "string",
      description: "ID of the sandbox to inspect",
      required: true,
    },
    {
      name: "action",
      type: "enum",
      description: "What to show",
      required: true,
      enum: ["log", "summary", "policy"],
    },
    {
      name: "limit",
      type: "number",
      description: "Max log entries to return (default 50)",
      required: false,
      default: 50,
    },
  ],
  capabilities: SANDBOX_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── Export all sandbox tools ─────────────────────────────────────────────────

export const SANDBOX_TOOLS: ToolManifest[] = [
  SANDBOX_CREATE_TOOL,
  SANDBOX_EXEC_TOOL,
  SANDBOX_LIST_TOOL,
  SANDBOX_DESTROY_TOOL,
  SANDBOX_SCENARIOS_TOOL,
  SANDBOX_SNAPSHOT_TOOL,
  SANDBOX_FILES_TOOL,
  SANDBOX_NETWORK_TOOL,
];
