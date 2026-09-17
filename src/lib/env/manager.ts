/**
 * Environment Manager — creates and manages isolated language environments.
 *
 * Each environment has:
 * - Its own global scope (no cross-contamination between envs)
 * - Resource limits (memory, CPU time, output size)
 * - Package namespace (install/uninstall per environment)
 * - Virtual file system (per-environment workspace)
 * - Execution history (for debugging and replay)
 */

import {
  type EnvConfig,
  type Language,
  type RunOptions,
  type RunResult,
  type ExecutionRecord,
  type VirtualFile,
  type VirtualFileSystem,
  DEFAULT_ENV_CONFIG,
} from "./types";
import { getRuntime } from "./runtime-registry";

// ─── Virtual File System ─────────────────────────────────────────────────────

class InMemoryFS implements VirtualFileSystem {
  private files: Map<string, VirtualFile> = new Map();

  readFile(path: string): string | Uint8Array | null {
    const f = this.files.get(path);
    if (!f || f.isDirectory) return null;
    return f.content;
  }

  writeFile(path: string, content: string | Uint8Array): void {
    const now = Date.now();
    const existing = this.files.get(path);
    this.files.set(path, {
      path,
      content,
      size: typeof content === "string" ? content.length : content.byteLength,
      createdAt: existing?.createdAt || now,
      modifiedAt: now,
      isDirectory: false,
    });
    // Ensure parent directories exist
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!this.files.has(dir)) {
        this.files.set(dir, {
          path: dir,
          content: "",
          size: 0,
          createdAt: now,
          modifiedAt: now,
          isDirectory: true,
        });
      }
    }
  }

  listDir(path: string): VirtualFile[] {
    const prefix = path.endsWith("/") ? path : path + "/";
    const results: VirtualFile[] = [];
    for (const [key, file] of this.files) {
      if (key.startsWith(prefix) && key !== prefix) {
        // Only direct children
        const remainder = key.slice(prefix.length);
        if (!remainder.includes("/")) {
          results.push(file);
        }
      }
    }
    return results;
  }

  mkdir(path: string): void {
    this.files.set(path, {
      path,
      content: "",
      size: 0,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      isDirectory: true,
    });
  }

  rm(path: string): void {
    const prefix = path.endsWith("/") ? path : path + "/";
    for (const key of this.files.keys()) {
      if (key === path || key.startsWith(prefix)) {
        this.files.delete(key);
      }
    }
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }
}

// ─── Environment Manager ─────────────────────────────────────────────────────

export class EnvironmentManager {
  private environments: Map<string, ManagedEnvironment> = new Map();
  private history: ExecutionRecord[] = [];
  private nextId = 1;

  /**
   * Create a new isolated environment.
   */
  create(config: {
    name: string;
    language: Language;
    memoryLimitMB?: number;
    timeoutMs?: number;
    workDir?: string;
    envVars?: Record<string, string>;
  }): ManagedEnvironment {
    const id = `env_${this.nextId++}`;
    const envConfig: EnvConfig = {
      ...DEFAULT_ENV_CONFIG,
      id,
      name: config.name,
      language: config.language,
      memoryLimitMB: config.memoryLimitMB ?? DEFAULT_ENV_CONFIG.memoryLimitMB,
      timeoutMs: config.timeoutMs ?? DEFAULT_ENV_CONFIG.timeoutMs,
      workDir: config.workDir ?? DEFAULT_ENV_CONFIG.workDir,
      envVars: config.envVars ?? {},
      packages: [],
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    const managed: ManagedEnvironment = {
      config: envConfig,
      fs: new InMemoryFS(),
      executionCount: 0,
    };

    // Create workspace directory
    managed.fs.mkdir(envConfig.workDir);

    this.environments.set(id, managed);
    return managed;
  }

  /**
   * Get an environment by ID.
   */
  get(id: string): ManagedEnvironment | undefined {
    return this.environments.get(id);
  }

  /**
   * List all environments.
   */
  list(): ManagedEnvironment[] {
    return Array.from(this.environments.values());
  }

  /**
   * List environments filtered by language.
   */
  listByLanguage(language: Language): ManagedEnvironment[] {
    return this.list().filter((e) => e.config.language === language);
  }

  /**
   * Destroy an environment and free its resources.
   */
  destroy(id: string): boolean {
    return this.environments.delete(id);
  }

  /**
   * Execute code in an environment.
   */
  async run(
    environmentId: string,
    options: RunOptions,
  ): Promise<RunResult> {
    const env = this.environments.get(environmentId);
    if (!env) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Environment ${environmentId} not found`,
        durationMs: 0,
        peakMemoryMB: 0,
        executionId: "",
      };
    }

    const language = options.language || env.config.language;
    const runtime = getRuntime(language);
    if (!runtime) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `No runtime available for language: ${language}`,
        durationMs: 0,
        peakMemoryMB: 0,
        executionId: "",
      };
    }

    if (!runtime.ready) {
      await runtime.init();
    }

    const mergedOptions: RunOptions = {
      ...options,
      timeoutMs: options.timeoutMs || env.config.timeoutMs,
      workDir: options.workDir || env.config.workDir,
    };

    env.config.lastUsedAt = Date.now();
    env.executionCount++;

    const codeToRun = options.code || "";
    const result = await runtime.run(codeToRun, mergedOptions);

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    result.executionId = executionId;

    this.history.push({
      id: executionId,
      environmentId,
      language,
      code: codeToRun,
      result,
      timestamp: Date.now(),
    });

    // Keep history bounded
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }

    return result;
  }

  /**
   * Get execution history for an environment.
   */
  getHistory(environmentId: string, limit = 50): ExecutionRecord[] {
    return this.history
      .filter((r) => r.environmentId === environmentId)
      .slice(-limit);
  }

  /**
   * Get full execution history.
   */
  getAllHistory(limit = 100): ExecutionRecord[] {
    return this.history.slice(-limit);
  }
}

// ─── Managed Environment ─────────────────────────────────────────────────────

export interface ManagedEnvironment {
  config: EnvConfig;
  fs: VirtualFileSystem;
  executionCount: number;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _manager: EnvironmentManager | null = null;

export function getEnvironmentManager(): EnvironmentManager {
  if (!_manager) {
    _manager = new EnvironmentManager();
  }
  return _manager;
}
