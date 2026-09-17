/**
 * Agent Tools — Memory, Skills, Self-Improvement, Terminal, Kanban
 *
 * These tools give agents persistent learning, real terminal access,
 * and multi-agent orchestration. All designed for SLM consumption
 * with compact JSON output and minimal context requirements.
 */

import type { ToolManifest, ToolCapability } from "../tool-types";

const AGENT_CAPABILITIES: ToolCapability[] = [
  {
    name: "agent-memory",
    description: "Persistent cross-session memory for storing user preferences, project context, and learned facts",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
  {
    name: "agent-skills",
    description: "Autonomous skill creation and management from completed tasks",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
  {
    name: "agent-terminal",
    description: "Real shell command execution with process management",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
  {
    name: "agent-kanban",
    description: "Multi-agent task orchestration with kanban board",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
];

// ─── 1. agent.memory ─────────────────────────────────────────────────────────

export const MEMORY_TOOL: ToolManifest = {
  id: "agent.memory",
  name: "Agent Memory",
  description:
    "Store and retrieve persistent memories across sessions: user preferences, project facts, workflow patterns",
  longDescription:
    "Cross-session memory system. Save important information that persists between conversations. Query by type (user, project, workflow, fact, skill), by tags, or by content search. Memories are ranked by importance and confidence, with automatic decay for old/unused entries. SLM-friendly: returns compact JSON or formatted prompt text.",
  version: "1.0.0",
  category: "browser",
  subcategory: "agent",
  author: "stitaP",
  license: "MIT",
  icon: "Brain",
  color: "#8b5cf6",
  tags: ["memory", "persistent", "cross-session", "knowledge", "agent"],
  parameters: [
    {
      name: "action",
      type: "enum",
      description: "What to do",
      required: true,
      enum: ["add", "query", "remove", "stats", "summarise", "to-prompt"],
    },
    {
      name: "type",
      type: "enum",
      description: "Memory type (for add/query)",
      required: false,
      enum: ["user", "project", "workflow", "fact", "skill"],
    },
    {
      name: "key",
      type: "string",
      description: "Memory key (for add/remove, e.g., 'user.name')",
      required: false,
    },
    {
      name: "content",
      type: "string",
      description: "Memory content (for add)",
      required: false,
    },
    {
      name: "importance",
      type: "number",
      description: "Importance 1-10 (for add, default 5)",
      required: false,
      default: 5,
    },
    {
      name: "tags",
      type: "string",
      description: "Comma-separated tags (for add/query)",
      required: false,
    },
    {
      name: "search",
      type: "string",
      description: "Search query (for query)",
      required: false,
    },
    {
      name: "limit",
      type: "number",
      description: "Max results (for query, default 20)",
      required: false,
      default: 20,
    },
    {
      name: "format",
      type: "enum",
      description: "Output format (for query/to-prompt)",
      required: false,
      enum: ["json", "compact", "prompt"],
      default: "json",
    },
  ],
  capabilities: AGENT_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 2. agent.skills ─────────────────────────────────────────────────────────

export const SKILLS_TOOL: ToolManifest = {
  id: "agent.skills",
  name: "Agent Skills",
  description:
    "Create, list, search, refine, and execute reusable skills extracted from completed tasks",
  longDescription:
    "Skills are reusable procedures extracted from successful task completions. Each skill has a name, description, step-by-step procedure, success criteria, and usage stats. Skills improve over time through usage tracking and automatic refinement. SLM prompt format: each skill generates a compact text prompt that an SLM can follow step-by-step.",
  version: "1.0.0",
  category: "browser",
  subcategory: "agent",
  author: "stitaP",
  license: "MIT",
  icon: "Wrench",
  color: "#10b981",
  tags: ["skills", "procedures", "reuse", "learning", "agent"],
  parameters: [
    {
      name: "action",
      type: "enum",
      description: "What to do",
      required: true,
      enum: ["create", "list", "get", "search", "refine", "delete", "extract", "stats"],
    },
    {
      name: "skillId",
      type: "string",
      description: "Skill ID (for get/refine/delete)",
      required: false,
    },
    {
      name: "name",
      type: "string",
      description: "Skill name (for create/extract)",
      required: false,
    },
    {
      name: "description",
      type: "string",
      description: "Skill description",
      required: false,
    },
    {
      name: "category",
      type: "enum",
      description: "Skill category",
      required: false,
      enum: ["browser", "testing", "design", "capture", "document", "code", "data", "custom"],
    },
    {
      name: "steps",
      type: "string",
      description: "JSON array of steps [{action, toolId}] (for create/extract)",
      required: false,
    },
    {
      name: "tags",
      type: "string",
      description: "Comma-separated tags",
      required: false,
    },
    {
      name: "search",
      type: "string",
      description: "Search query (for search)",
      required: false,
    },
    {
      name: "format",
      type: "enum",
      description: "Output format",
      required: false,
      enum: ["json", "slm-prompt"],
      default: "json",
    },
  ],
  capabilities: AGENT_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 3. agent.self-improve ───────────────────────────────────────────────────

export const SELF_IMPROVE_TOOL: ToolManifest = {
  id: "agent.self-improve",
  name: "Self-Improvement",
  description:
    "Track performance, detect patterns, and get improvement suggestions based on task history",
  longDescription:
    "Monitors agent performance across all tool executions. Detects patterns like frequent errors, slow tools, retry loops, and common tool sequences. Generates actionable improvement suggestions with confidence scores. Auto-applies safe fixes. SLM output: compact performance summary with top issues and suggestions.",
  version: "1.0.0",
  category: "browser",
  subcategory: "agent",
  author: "stitaP",
  license: "MIT",
  icon: "TrendingUp",
  color: "#f59e0b",
  tags: ["self-improve", "performance", "patterns", "optimization", "agent"],
  parameters: [
    {
      name: "action",
      type: "enum",
      description: "What to do",
      required: true,
      enum: ["record", "patterns", "suggestions", "stats", "auto-apply", "summary"],
    },
    {
      name: "taskData",
      type: "string",
      description: "JSON TaskRecord (for record action)",
      required: false,
    },
    {
      name: "format",
      type: "enum",
      description: "Output format",
      required: false,
      enum: ["json", "compact"],
      default: "json",
    },
  ],
  capabilities: AGENT_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 4. agent.terminal ───────────────────────────────────────────────────────

export const TERMINAL_TOOL: ToolManifest = {
  id: "agent.terminal",
  name: "Real Terminal",
  description:
    "Execute shell commands with process management: background jobs, output capture, timeout enforcement",
  longDescription:
    "Real shell command execution. Supports built-in commands (echo, ls, cat, git, npm, etc.), JavaScript expressions, and piped commands. Background process management: start long-running processes, poll for output, wait for completion, kill processes. Timeout enforcement. Command history. Unlike env.run (virtual environments), this executes actual commands in a terminal-like environment.",
  version: "1.0.0",
  category: "browser",
  subcategory: "agent",
  author: "stitaP",
  license: "MIT",
  icon: "Terminal",
  color: "#06b6d4",
  tags: ["terminal", "shell", "command", "process", "background", "agent"],
  parameters: [
    {
      name: "command",
      type: "string",
      description: "Shell command to execute",
      required: false,
    },
    {
      name: "action",
      type: "enum",
      description: "For process management",
      required: false,
      enum: ["list", "poll", "wait", "kill", "log", "write"],
    },
    {
      name: "processId",
      type: "string",
      description: "Background process ID (for poll/wait/kill/log/write)",
      required: false,
    },
    {
      name: "background",
      type: "boolean",
      description: "Run command in background",
      required: false,
      default: false,
    },
    {
      name: "timeoutSecs",
      type: "number",
      description: "Command timeout in seconds (default 30)",
      required: false,
      default: 30,
    },
    {
      name: "cwd",
      type: "string",
      description: "Working directory",
      required: false,
    },
  ],
  capabilities: AGENT_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 5. agent.kanban ─────────────────────────────────────────────────────────

export const KANBAN_TOOL: ToolManifest = {
  id: "agent.kanban",
  name: "Kanban Board",
  description:
    "Multi-agent task orchestration: create boards, add tasks with dependencies, assign workers, track progress",
  longDescription:
    "Kanban-style task board for multi-agent workflows. Create boards, add tasks with dependencies and priorities, assign workers (human or sub-agent), fan out parallel subtasks, track heartbeats, add comments. Auto-unblocks tasks when dependencies complete. SLM output: compact board snapshot showing active/blocked/ready tasks with minimal tokens.",
  version: "1.0.0",
  category: "browser",
  subcategory: "agent",
  author: "stitaP",
  license: "MIT",
  icon: "LayoutGrid",
  color: "#ec4899",
  tags: ["kanban", "board", "tasks", "multi-agent", "orchestration", "parallel"],
  parameters: [
    {
      name: "action",
      type: "enum",
      description: "What to do",
      required: true,
      enum: [
        "create-board", "list-boards", "snapshot",
        "add-task", "move-task", "assign-task", "delete-task",
        "fan-out", "add-comment",
        "register-worker", "heartbeat",
        "get-ready", "get-stale",
      ],
    },
    {
      name: "boardId",
      type: "string",
      description: "Board ID",
      required: false,
    },
    {
      name: "taskId",
      type: "string",
      description: "Task ID (for move/assign/delete/comment)",
      required: false,
    },
    {
      name: "status",
      type: "enum",
      description: "New status (for move-task)",
      required: false,
      enum: ["todo", "in-progress", "review", "done", "blocked", "cancelled"],
    },
    {
      name: "title",
      type: "string",
      description: "Task title (for add-task)",
      required: false,
    },
    {
      name: "description",
      type: "string",
      description: "Task description",
      required: false,
    },
    {
      name: "priority",
      type: "enum",
      description: "Task priority",
      required: false,
      enum: ["critical", "high", "medium", "low"],
    },
    {
      name: "dependsOn",
      type: "string",
      description: "Comma-separated task IDs this depends on",
      required: false,
    },
    {
      name: "assignee",
      type: "string",
      description: "Worker ID to assign",
      required: false,
    },
    {
      name: "workerName",
      type: "string",
      description: "Worker name (for register-worker)",
      required: false,
    },
    {
      name: "workerType",
      type: "enum",
      description: "Worker type",
      required: false,
      enum: ["human", "agent", "sub-agent"],
    },
    {
      name: "workerId",
      type: "string",
      description: "Worker ID (for heartbeat)",
      required: false,
    },
    {
      name: "author",
      type: "string",
      description: "Comment author (for add-comment)",
      required: false,
    },
    {
      name: "comment",
      type: "string",
      description: "Comment content",
      required: false,
    },
    {
      name: "subtasks",
      type: "string",
      description: "JSON array [{title, description?, priority?}] (for fan-out)",
      required: false,
    },
    {
      name: "boardName",
      type: "string",
      description: "Board name (for create-board)",
      required: false,
    },
  ],
  capabilities: AGENT_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── Export all agent tools ──────────────────────────────────────────────────

export const AGENT_TOOLS: ToolManifest[] = [
  MEMORY_TOOL,
  SKILLS_TOOL,
  SELF_IMPROVE_TOOL,
  TERMINAL_TOOL,
  KANBAN_TOOL,
];
