/**
 * Sandbox Manager
 *
 * Coordinates all sandbox lifecycle operations:
 * - Create sandboxes from scenarios or custom configs
 * - Execute code in isolated workers
 * - Manage virtual file systems per sandbox
 * - Enforce network policies
 * - Snapshot and restore state
 * - Track resource usage and limits
 */

import type {
  SandboxConfig,
  SandboxState,
  SandboxStatus,
  SandboxExecution,
  SandboxScenario,
  ResourceUsage,
  SandboxEvent,
  IsolationLevel,
} from "./types";
import { NetworkPolicyChecker, generateNetworkInterceptor } from "./network-policy";
import { VirtualFS } from "./virtual-fs";
import { SCENARIOS, buildPolicyFromScenario, getScenario } from "./scenarios";

// ─── Sandbox Instance ────────────────────────────────────────────────────────

interface SandboxInstance {
  config: SandboxConfig;
  state: SandboxState;
  networkChecker: NetworkPolicyChecker;
  virtualFs: VirtualFS;
  worker: Worker | null;
  executionCounter: number;
}

// ─── Sandbox Manager ─────────────────────────────────────────────────────────

export class SandboxManager {
  private sandboxes: Map<string, SandboxInstance> = new Map();
  private eventListeners: Array<(event: SandboxEvent) => void> = [];
  private executionCounter = 0;

  /** Subscribe to sandbox events */
  onEvent(listener: (event: SandboxEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== listener);
    };
  }

  private emit(event: SandboxEvent): void {
    for (const listener of this.eventListeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }

  /** Create a new sandbox from a scenario */
  createFromScenario(scenarioId: string, overrides?: Partial<SandboxConfig>): SandboxInstance {
    const scenario = getScenario(scenarioId);
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
    return this.create({
      id: overrides?.id || `sbx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: overrides?.name || scenario.name,
      description: overrides?.description || scenario.description,
      isolationLevel: overrides?.isolationLevel || scenario.isolationLevel,
      policy: buildPolicyFromScenario(scenario),
      scenarioId: scenario.id,
      tags: overrides?.tags || [...scenario.tags],
      ...overrides,
    });
  }

  /** Create a new sandbox with custom config */
  create(config: SandboxConfig): SandboxInstance {
    if (this.sandboxes.has(config.id)) {
      throw new Error(`Sandbox already exists: ${config.id}`);
    }

    const networkChecker = new NetworkPolicyChecker(config.policy.network);
    const virtualFs = new VirtualFS(
      config.policy.resources.maxFileCount,
      config.policy.resources.maxFileSizeMB,
    );

    // Load initial files from scenario
    if (config.scenarioId) {
      const scenario = getScenario(config.scenarioId);
      if (scenario) {
        for (const file of scenario.initialFiles) {
          virtualFs.writeFile(file.path, file.content);
        }
      }
    }

    const now = new Date().toISOString();
    const state: SandboxState = {
      config,
      status: "idle",
      createdAt: now,
      lastActiveAt: now,
      networkLog: [],
      executions: [],
      resourceUsage: {
        memoryMB: 0,
        peakMemoryMB: 0,
        cpuTimeSecs: 0,
        executionCount: 0,
        networkRequestCount: 0,
        fileCount: virtualFs.getFileCount(),
        vfsSizeBytes: virtualFs.getTotalSizeBytes(),
      },
    };

    const instance: SandboxInstance = {
      config,
      state,
      networkChecker,
      virtualFs,
      worker: null,
      executionCounter: 0,
    };

    this.sandboxes.set(config.id, instance);
    this.emit({ type: "created", sandboxId: config.id, config });

    return instance;
  }

  /** Get a sandbox by ID */
  get(id: string): SandboxInstance | undefined {
    return this.sandboxes.get(id);
  }

  /** List all sandboxes */
  list(): SandboxConfig[] {
    return Array.from(this.sandboxes.values()).map(i => i.config);
  }

  /** List sandboxes with state info */
  listWithState(): SandboxState[] {
    return Array.from(this.sandboxes.values()).map(i => ({ ...i.state }));
  }

  /** Get sandbox state */
  getState(id: string): SandboxState | undefined {
    return this.sandboxes.get(id)?.state;
  }

  /** Destroy a sandbox */
  destroy(id: string): boolean {
    const instance = this.sandboxes.get(id);
    if (!instance) return false;

    // Terminate worker if running
    if (instance.worker) {
      instance.worker.terminate();
      instance.worker = null;
    }

    instance.state.status = "destroyed";
    this.sandboxes.delete(id);
    this.emit({ type: "destroyed", sandboxId: id });
    return true;
  }

  /** Execute code in a sandbox */
  async execute(sandboxId: string, code: string, options?: {
    language?: string;
    timeoutMs?: number;
  }): Promise<SandboxExecution> {
    const instance = this.sandboxes.get(sandboxId);
    if (!instance) throw new Error(`Sandbox not found: ${sandboxId}`);
    if (instance.state.status === "destroyed") throw new Error("Sandbox is destroyed");

    const executionId = `exec-${++this.executionCounter}-${Date.now()}`;
    const timeoutMs = options?.timeoutMs || instance.config.policy.resources.maxTimeSecs * 1000;

    const execution: SandboxExecution = {
      id: executionId,
      startedAt: new Date().toISOString(),
      status: "running",
      input: code,
    };

    instance.state.executions.push(execution);
    instance.state.status = "running";
    instance.state.lastActiveAt = new Date().toISOString();
    this.emit({ type: "started", sandboxId });

    const startTime = performance.now();

    try {
      // Create isolated execution via Web Worker (or inline for basic isolation)
      const result = await this.runInWorker(instance, code, timeoutMs);

      const durationMs = performance.now() - startTime;
      execution.status = "completed";
      execution.output = result.output;
      execution.error = result.error;
      execution.exitCode = result.error ? 1 : 0;
      execution.durationMs = Math.round(durationMs);
      execution.completedAt = new Date().toISOString();

      instance.state.status = "idle";
      instance.state.resourceUsage.executionCount++;
      instance.state.resourceUsage.cpuTimeSecs += durationMs / 1000;
      instance.state.resourceUsage.fileCount = instance.virtualFs.getFileCount();
      instance.state.resourceUsage.vfsSizeBytes = instance.virtualFs.getTotalSizeBytes();

      this.emit({ type: "completed", sandboxId, executionId, exitCode: execution.exitCode!, durationMs: Math.round(durationMs) });
    } catch (err) {
      const durationMs = performance.now() - startTime;
      execution.status = "failed";
      execution.error = err instanceof Error ? err.message : String(err);
      execution.exitCode = 1;
      execution.durationMs = Math.round(durationMs);
      execution.completedAt = new Date().toISOString();

      instance.state.status = "error";
      instance.state.error = execution.error;

      this.emit({ type: "error", sandboxId, executionId, error: execution.error });
    }

    return execution;
  }

  /** Run code in an isolated worker */
  private async runInWorker(
    instance: SandboxInstance,
    code: string,
    timeoutMs: number,
  ): Promise<{ output: string; error?: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (worker) worker.terminate();
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Create inline worker from script
      const networkInterceptor = generateNetworkInterceptor(instance.config.policy.network);

      const workerScript = `
        ${networkInterceptor}

        // Capture console output
        const outputs = [];
        const errors = [];
        const origConsole = { ...console };
        console.log = (...args) => outputs.push(args.map(String).join(' '));
        console.warn = (...args) => outputs.push('[WARN] ' + args.map(String).join(' '));
        console.error = (...args) => errors.push(args.map(String).join(' '));
        console.info = (...args) => outputs.push('[INFO] ' + args.map(String).join(' '));
        console.debug = (...args) => outputs.push('[DEBUG] ' + args.map(String).join(' '));

        // Provide sandboxed APIs
        globalThis.__SANDBOX_ID = ${JSON.stringify(instance.config.id)};
        globalThis.__SANDBOX_VFS = {};

        self.onmessage = async function(e) {
          try {
            const fn = new Function(e.data.code);
            const result = fn();
            if (result instanceof Promise) {
              await result;
            }
            self.postMessage({
              type: 'done',
              output: outputs.join('\\n'),
              error: errors.length > 0 ? errors.join('\\n') : undefined,
            });
          } catch (err) {
            self.postMessage({
              type: 'error',
              output: outputs.join('\\n'),
              error: err instanceof Error ? err.message + '\\n' + err.stack : String(err),
            });
          }
        };
      `;

      const blob = new Blob([workerScript], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      instance.worker = worker;

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        worker.terminate();
        instance.worker = null;

        if (e.data.type === "error") {
          resolve({ output: e.data.output || "", error: e.data.error });
        } else {
          resolve({ output: e.data.output || "", error: e.data.error });
        }
      };

      worker.onerror = (e) => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        worker.terminate();
        instance.worker = null;
        reject(new Error(e.message || "Worker error"));
      };

      worker.postMessage({ code });
    });
  }

  /** Create a snapshot of a sandbox's virtual FS */
  snapshot(sandboxId: string): string | undefined {
    const instance = this.sandboxes.get(sandboxId);
    if (!instance) return undefined;

    const snapshot = instance.virtualFs.createSnapshot(sandboxId);
    instance.state.vfsSnapshotId = snapshot.id;
    this.emit({ type: "snapshot", sandboxId, snapshotId: snapshot.id });
    return snapshot.id;
  }

  /** List available scenarios */
  getScenarios(): SandboxScenario[] {
    return SCENARIOS;
  }

  /** Get scenarios by category */
  getScenariosByCategory(category: string): SandboxScenario[] {
    return SCENARIOS.filter(s => s.category === category);
  }

  /** Search scenarios */
  searchScenarios(query: string): SandboxScenario[] {
    const q = query.toLowerCase();
    return SCENARIOS.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.includes(q))
    );
  }

  /** Get network log for a sandbox */
  getNetworkLog(sandboxId: string) {
    const instance = this.sandboxes.get(sandboxId);
    return instance ? instance.networkChecker.getLog() : [];
  }

  /** Get network summary for a sandbox */
  getNetworkSummary(sandboxId: string) {
    const instance = this.sandboxes.get(sandboxId);
    return instance ? instance.networkChecker.getSummary() : null;
  }

  /** Write a file to a sandbox's VFS */
  writeFile(sandboxId: string, path: string, content: string): void {
    const instance = this.sandboxes.get(sandboxId);
    if (!instance) throw new Error(`Sandbox not found: ${sandboxId}`);
    instance.virtualFs.writeFile(path, content);
    instance.state.resourceUsage.fileCount = instance.virtualFs.getFileCount();
    instance.state.resourceUsage.vfsSizeBytes = instance.virtualFs.getTotalSizeBytes();
  }

  /** Read a file from a sandbox's VFS */
  readFile(sandboxId: string, path: string): string | undefined {
    const instance = this.sandboxes.get(sandboxId);
    if (!instance) return undefined;
    return instance.virtualFs.readText(path);
  }

  /** List files in a sandbox's VFS */
  listFiles(sandboxId: string, path = "/"): string[] {
    const instance = this.sandboxes.get(sandboxId);
    if (!instance) return [];
    return instance.virtualFs.listDir(path);
  }

  /** Get count of active sandboxes */
  getActiveCount(): number {
    let count = 0;
    for (const instance of this.sandboxes.values()) {
      if (instance.state.status === "running" || instance.state.status === "idle") {
        count++;
      }
    }
    return count;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _manager: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!_manager) {
    _manager = new SandboxManager();
  }
  return _manager;
}
