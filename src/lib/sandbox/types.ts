/**
 * Sandbox Environment Types
 *
 * Defines the core types for isolated execution sandboxes.
 * Each sandbox provides: isolated global scope, virtual file system,
 * network policy, resource limits, and lifecycle management.
 */

// ─── Isolation Levels ────────────────────────────────────────────────────────

export type IsolationLevel =
  | "none"      // Shared scope (testing only)
  | "basic"     // Web Worker isolation (separate globalThis)
  | "full"      // Web Worker + network policy + virtual FS + resource limits
  | "paranoid"; // Full + time-limited + memory-limited + no shared storage

// ─── Sandbox Policy ──────────────────────────────────────────────────────────

export interface SandboxNetworkPolicy {
  /** Allow all outbound requests */
  allowAll: boolean;
  /** Allowed URL patterns (glob-style) */
  allowPatterns: string[];
  /** Blocked URL patterns (glob-style, checked after allow) */
  blockPatterns: string[];
  /** Allow WebSocket connections */
  allowWebSockets: boolean;
  /** Allow fetch/XMLHttpRequest */
  allowFetch: boolean;
  /** Max concurrent outbound requests */
  maxConcurrentRequests: number;
  /** Request timeout in ms */
  requestTimeoutMs: number;
}

export interface SandboxResourceLimits {
  /** Max memory in MB */
  maxMemoryMB: number;
  /** Max execution time in seconds per run */
  maxTimeSecs: number;
  /** Max file count in virtual FS */
  maxFileCount: number;
  /** Max total file size in MB */
  maxFileSizeMB: number;
  /** Max CPU time in seconds (worker processing time) */
  maxCpuTimeSecs: number;
}

export interface SandboxPolicy {
  /** Network access rules */
  network: SandboxNetworkPolicy;
  /** Resource limits */
  resources: SandboxResourceLimits;
  /** Allow access to parent window (postMessage) */
  allowParentAccess: boolean;
  /** Allow access to localStorage */
  allowLocalStorage: boolean;
  /** Allow access to sessionStorage */
  allowSessionStorage: boolean;
  /** Allow access to IndexedDB */
  allowIndexedDB: boolean;
  /** Allow access to cookies */
  allowCookies: boolean;
  /** Allow eval() and Function constructor */
  allowEval: boolean;
  /** Custom environment variables */
  envVars: Record<string, string>;
}

// ─── Sandbox Configuration ───────────────────────────────────────────────────

export interface SandboxConfig {
  /** Unique sandbox ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this sandbox is for */
  description: string;
  /** Isolation level */
  isolationLevel: IsolationLevel;
  /** Sandbox policy */
  policy: SandboxPolicy;
  /** Pre-built scenario this sandbox was created from (if any) */
  scenarioId?: string;
  /** Tags for search/filtering */
  tags: string[];
  /** Parent sandbox ID (for nested sandboxes) */
  parentId?: string;
}

// ─── Sandbox State ───────────────────────────────────────────────────────────

export type SandboxStatus =
  | "creating"
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "error"
  | "destroyed";

export interface SandboxState {
  /** Sandbox configuration */
  config: SandboxConfig;
  /** Current status */
  status: SandboxStatus;
  /** When the sandbox was created */
  createdAt: string;
  /** When the sandbox was last active */
  lastActiveAt: string;
  /** Web Worker reference (internal) */
  workerId?: string;
  /** Virtual file system snapshot */
  vfsSnapshotId?: string;
  /** Network request log */
  networkLog: NetworkLogEntry[];
  /** Execution history */
  executions: SandboxExecution[];
  /** Resource usage */
  resourceUsage: ResourceUsage;
  /** Error message if status is "error" */
  error?: string;
}

// ─── Network Logging ─────────────────────────────────────────────────────────

export interface NetworkLogEntry {
  /** Timestamp */
  timestamp: string;
  /** Request method */
  method: string;
  /** Request URL */
  url: string;
  /** Response status (null if blocked/failed) */
  status: number | null;
  /** Response time in ms */
  durationMs: number;
  /** Was this request blocked by policy? */
  blocked: boolean;
  /** Block reason (if blocked) */
  blockReason?: string;
  /** Request size in bytes */
  requestSize: number;
  /** Response size in bytes */
  responseSize: number;
}

// ─── Execution ───────────────────────────────────────────────────────────────

export interface SandboxExecution {
  /** Execution ID */
  id: string;
  /** Start time */
  startedAt: string;
  /** End time */
  completedAt?: string;
  /** Execution status */
  status: "running" | "completed" | "failed" | "timeout" | "killed";
  /** Input code or command */
  input: string;
  /** Output */
  output?: string;
  /** Error output */
  error?: string;
  /** Exit code */
  exitCode?: number;
  /** Duration in ms */
  durationMs?: number;
  /** Memory used in MB */
  memoryMB?: number;
}

// ─── Resource Usage ──────────────────────────────────────────────────────────

export interface ResourceUsage {
  /** Current memory usage in MB */
  memoryMB: number;
  /** Peak memory in MB */
  peakMemoryMB: number;
  /** Total CPU time in seconds */
  cpuTimeSecs: number;
  /** Total execution count */
  executionCount: number;
  /** Total network requests made */
  networkRequestCount: number;
  /** Total files in VFS */
  fileCount: number;
  /** Total VFS size in bytes */
  vfsSizeBytes: number;
}

// ─── Virtual File System ─────────────────────────────────────────────────────

export interface VFSFile {
  /** File path (e.g., "/workspace/index.ts") */
  path: string;
  /** File content */
  content: string | Uint8Array;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Created at */
  createdAt: string;
  /** Last modified at */
  modifiedAt: string;
  /** Is this file read-only? */
  readOnly: boolean;
}

export interface VFSDirectory {
  path: string;
  children: string[];
  createdAt: string;
}

export interface VFSSnapshot {
  id: string;
  sandboxId: string;
  createdAt: string;
  files: VFSFile[];
  directories: VFSDirectory[];
}

// ─── Sandbox Scenario ────────────────────────────────────────────────────────

export interface SandboxScenario {
  id: string;
  name: string;
  description: string;
  /** Category */
  category: "testing" | "development" | "production" | "demo" | "security" | "performance";
  /** Isolation level for this scenario */
  isolationLevel: IsolationLevel;
  /** Policy overrides for this scenario */
  policyOverrides: Partial<SandboxPolicy>;
  /** Pre-loaded files for this scenario */
  initialFiles: Array<{ path: string; content: string }>;
  /** Pre-loaded scripts to run on creation */
  setupScripts: string[];
  /** Environment variables */
  envVars: Record<string, string>;
  /** Tags */
  tags: string[];
  /** Icon name */
  icon: string;
  /** Color */
  color: string;
}

// ─── Sandbox Events ──────────────────────────────────────────────────────────

export type SandboxEvent =
  | { type: "created"; sandboxId: string; config: SandboxConfig }
  | { type: "started"; sandboxId: string }
  | { type: "output"; sandboxId: string; executionId: string; data: string }
  | { type: "error"; sandboxId: string; executionId: string; error: string }
  | { type: "completed"; sandboxId: string; executionId: string; exitCode: number; durationMs: number }
  | { type: "network-blocked"; sandboxId: string; url: string; reason: string }
  | { type: "resource-warning"; sandboxId: string; resource: string; current: number; limit: number }
  | { type: "destroyed"; sandboxId: string }
  | { type: "snapshot"; sandboxId: string; snapshotId: string };

// ─── Sandbox Message Protocol ────────────────────────────────────────────────

export interface SandboxWorkerMessage {
  type: string;
  id: string;
  payload: unknown;
}

export interface SandboxWorkerResponse {
  type: string;
  id: string;
  payload: unknown;
  error?: string;
}
