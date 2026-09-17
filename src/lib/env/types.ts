/**
 * Virtual Environment — Core Types
 *
 * Every language runtime is isolated in its own environment with:
 * - Separate global scope (no cross-contamination)
 * - Resource limits (memory, CPU time, output size)
 * - Package namespace (install/uninstall per environment)
 * - Execution history (for debugging and replay)
 */

// ─── Supported Languages ─────────────────────────────────────────────────────

export type Language =
  | "javascript"
  | "typescript"
  | "python"
  | "rust"
  | "shell"
  | "sql"
  | "wasm";

// ─── Environment Configuration ───────────────────────────────────────────────

export interface EnvConfig {
  /** Unique environment ID. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Language runtime. */
  language: Language;
  /** Maximum memory in MB (default 128). */
  memoryLimitMB: number;
  /** Maximum execution time in ms (default 30000). */
  timeoutMs: number;
  /** Maximum output size in bytes (default 1MB). */
  maxOutputBytes: number;
  /** Working directory path (virtual). */
  workDir: string;
  /** Environment variables. */
  envVars: Record<string, string>;
  /** Installed packages. */
  packages: PackageEntry[];
  /** Creation timestamp. */
  createdAt: number;
  /** Last execution timestamp. */
  lastUsedAt: number;
}

export const DEFAULT_ENV_CONFIG: Omit<EnvConfig, "id" | "name" | "language" | "createdAt" | "lastUsedAt"> = {
  memoryLimitMB: 128,
  timeoutMs: 30_000,
  maxOutputBytes: 1024 * 1024,
  workDir: "/workspace",
  envVars: {},
  packages: [],
};

// ─── Package Management ──────────────────────────────────────────────────────

export interface PackageEntry {
  name: string;
  version: string;
  /** Whether this is a built-in (ships with the runtime) or user-installed. */
  builtin: boolean;
  /** Package size in bytes. */
  sizeBytes: number;
  /** Install timestamp. */
  installedAt: number;
}

export interface PackageManifest {
  language: Language;
  name: string;
  version: string;
  description: string;
  /** Dependencies (other packages this requires). */
  dependencies: string[];
  /** Size in bytes. */
  sizeBytes: number;
  /** Whether this is available offline (bundled). */
  offlineAvailable: boolean;
  /** WASM binary URL (for language runtimes). */
  wasmUrl?: string;
}

// ─── Execution ───────────────────────────────────────────────────────────────

export interface RunOptions {
  /** Code to execute. */
  code?: string;
  /** Language (defaults to environment's language). */
  language?: Language;
  /** Input data (stdin). */
  stdin?: string;
  /** Timeout override in ms. */
  timeoutMs?: number;
  /** Working directory override. */
  workDir?: string;
  /** Whether to capture stdout/stderr separately. */
  captureSeparately?: boolean;
}

export interface RunResult {
  /** Exit code (0 = success). */
  exitCode: number;
  /** Standard output. */
  stdout: string;
  /** Standard error. */
  stderr: string;
  /** Execution time in milliseconds. */
  durationMs: number;
  /** Peak memory usage in MB. */
  peakMemoryMB: number;
  /** Any return value (for expression evaluation). */
  returnValue?: unknown;
  /** Execution ID for history lookup. */
  executionId: string;
  /** Error details if execution failed. */
  error?: {
    type: string;
    message: string;
    stack?: string;
    line?: number;
    column?: number;
  };
}

export interface ExecutionRecord {
  id: string;
  environmentId: string;
  language: Language;
  code: string;
  result: RunResult;
  timestamp: number;
}

// ─── Runtime Interface ───────────────────────────────────────────────────────

export interface LanguageRuntime {
  /** Language this runtime handles. */
  language: Language;
  /** Human-readable name. */
  displayName: string;
  /** Whether the runtime is ready (WASM loaded, etc.). */
  ready: boolean;
  /** Initialise the runtime (load WASM, set up worker). */
  init(): Promise<void>;
  /** Execute code in this runtime. */
  run(code: string, options?: RunOptions): Promise<RunResult>;
  /** Install a package into an environment. */
  installPackage(env: EnvConfig, packageName: string, version?: string): Promise<PackageEntry>;
  /** Uninstall a package. */
  uninstallPackage(env: EnvConfig, packageName: string): Promise<void>;
  /** List available packages (built-in + installable). */
  listAvailablePackages(): PackageManifest[];
  /** List installed packages in an environment. */
  listInstalledPackages(env: EnvConfig): PackageEntry[];
  /** Validate code syntax without executing. */
  validateSyntax(code: string): Promise<{ valid: boolean; error?: string; line?: number }>;
  /** Dispose the runtime and free resources. */
  dispose(): void;
}

// ─── Virtual File System ─────────────────────────────────────────────────────

export interface VirtualFile {
  path: string;
  content: string | Uint8Array;
  size: number;
  createdAt: number;
  modifiedAt: number;
  isDirectory: boolean;
}

export interface VirtualFileSystem {
  /** Read a file. */
  readFile(path: string): string | Uint8Array | null;
  /** Write a file. */
  writeFile(path: string, content: string | Uint8Array): void;
  /** List directory contents. */
  listDir(path: string): VirtualFile[];
  /** Create directory. */
  mkdir(path: string): void;
  /** Delete file or directory. */
  rm(path: string): void;
  /** Check if path exists. */
  exists(path: string): boolean;
}
