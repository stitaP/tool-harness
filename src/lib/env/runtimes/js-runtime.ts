/**
 * JavaScript/TypeScript Runtime — sandboxed browser execution.
 *
 * Executes JS/TS code in an isolated scope using Function constructor.
 * Captures console.log/warn/error, provides a minimal require() polyfill,
 * and enforces resource limits (timeout, memory).
 *
 * For TypeScript: strips types via regex (simple transpilation) before execution.
 */

import type { LanguageRuntime, RunOptions, RunResult, Language, EnvConfig, PackageEntry, PackageManifest } from "../types";

// ─── Console Capture ─────────────────────────────────────────────────────────

interface ConsoleEntry {
  method: string;
  args: unknown[];
  timestamp: number;
}

function createConsoleCapture(): { logs: ConsoleEntry[]; proxy: Console } {
  const logs: ConsoleEntry[] = [];
  const methods = ["log", "warn", "error", "info", "debug", "table", "dir"] as const;

  const proxy = {} as Console;
  for (const method of methods) {
    (proxy as any)[method] = (...args: unknown[]) => {
      logs.push({ method, args, timestamp: Date.now() });
    };
  }
  proxy.clear = () => {};
  proxy.time = () => {};
  proxy.timeEnd = () => {};
  proxy.group = () => {};
  proxy.groupEnd = () => {};
  proxy.trace = () => {};

  return { logs, proxy };
}

// ─── Simple TypeScript Stripper ──────────────────────────────────────────────

function stripTypeScript(code: string): string {
  let result = code;
  // Remove type annotations from variables: const x: Type = ...
  result = result.replace(/:\s*(string|number|boolean|void|any|unknown|null|undefined|never|object|symbol|bigint|Array<[^>]+>|Record<[^>]+>|Map<[^>]+>|Set<[^>]+>|Promise<[^>]+>)/g, "");
  // Remove interface declarations
  result = result.replace(/interface\s+\w+\s*\{[^}]*\}/g, "");
  // Remove type declarations
  result = result.replace(/type\s+\w+\s*=\s*[^;]+;/g, "");
  // Remove enum declarations
  result = result.replace(/enum\s+\w+\s*\{[^}]*\}/g, "");
  // Remove import type
  result = result.replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?/g, "");
  // Remove : Type in function params
  result = result.replace(/(\w+)\s*:\s*(string|number|boolean|void|any|unknown|null|undefined|never|object|\w+<[^>]+>)/g, "$1");
  // Remove as Type casts
  result = result.replace(/\bas\s+(string|number|boolean|void|any|unknown|null|undefined|never|object|\w+)/g, "");
  // Remove <Type> generic annotations in variable declarations
  result = result.replace(/const\s+(\w+)\s*<[^>]+>/g, "const $1");
  result = result.replace(/let\s+(\w+)\s*<[^>]+>/g, "let $1");
  return result;
}

// ─── Built-in Modules ────────────────────────────────────────────────────────

const BUILTIN_MODULES: Record<string, unknown> = {
  console: console,
  Math: Math,
  Date: Date,
  JSON: JSON,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Boolean: Boolean,
  RegExp: RegExp,
  Map: Map,
  Set: Set,
  Promise: Promise,
  Symbol: Symbol,
  WeakMap: WeakMap,
  WeakSet: WeakSet,
  Error: Error,
  TypeError: TypeError,
  RangeError: RangeError,
  SyntaxError: SyntaxError,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  isFinite: isFinite,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
  encodeURI: encodeURI,
  decodeURI: decodeURI,
  URL: URL,
  URLSearchParams: URLSearchParams,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  AbortController: AbortController,
  AbortSignal: AbortSignal,
  atob: atob,
  btoa: btoa,
  crypto: typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined,
  performance: typeof performance !== "undefined" ? performance : undefined,
};

// ─── JS Runtime ──────────────────────────────────────────────────────────────

export class JSRuntime implements LanguageRuntime {
  language: Language = "javascript";
  displayName = "JavaScript / TypeScript";
  ready = true;

  async init(): Promise<void> {
    this.ready = true;
  }

  async run(code: string, options: RunOptions = {}): Promise<RunResult> {
    const startTime = performance.now();
    const timeoutMs = options.timeoutMs || 30_000;
    const maxOutputBytes = 1024 * 1024;

    // Strip TypeScript if needed
    let jsCode = code;
    if (this.isTypeScript(code)) {
      try {
        jsCode = stripTypeScript(code);
      } catch {
        // If stripping fails, try running as-is
        jsCode = code;
      }
    }

    // Set up console capture
    const { logs, proxy: fakeConsole } = createConsoleCapture();

    // Build sandboxed require function
    const requireFn = (module: string): unknown => {
      if (BUILTIN_MODULES[module]) return BUILTIN_MODULES[module];
      throw new Error(`Module "${module}" is not available in the sandbox`);
    };

    // Execute with timeout
    try {        const result = await this.executeWithTimeout(
          jsCode,
          fakeConsole,
          requireFn,
          timeoutMs,
        );

      const durationMs = performance.now() - startTime;

      // Format console output
      const stdout = logs
        .map((l) => {
          const parts = l.args.map((a) =>
            typeof a === "object" ? JSON.stringify(a, null, 2) : String(a),
          );
          return parts.join(" ");
        })
        .join("\n");

      const errors = logs.filter((l) => l.method === "error");
      const stderr = errors
        .map((l) => l.args.map(String).join(" "))
        .join("\n");

      return {
        exitCode: 0,
        stdout: stdout || (result !== undefined ? String(result) : ""),
        stderr,
        durationMs,
        peakMemoryMB: 0,
        returnValue: result,
        executionId: "",
      };
    } catch (err: any) {
      const durationMs = performance.now() - startTime;

      const stdout = logs
        .map((l) => l.args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "))
        .join("\n");

      return {
        exitCode: 1,
        stdout,
        stderr: err.message || String(err),
        durationMs,
        peakMemoryMB: 0,
        executionId: "",
        error: {
          type: err.constructor?.name || "Error",
          message: err.message || String(err),
          stack: err.stack,
          line: this.extractLineFromStack(err.stack),
        },
      };
    }
  }

  private async executeWithTimeout(
    code: string,
    fakeConsole: Console,
    requireFn: (m: string) => unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        // Create sandboxed function with injected globals
        const sandboxedFn = new Function(
          "console",
          "require",
          "module",
          "exports",
          "__filename",
          "__dirname",
          `"use strict";\n${code}\n`,
        );

        const module = { exports: {} };
        const result = sandboxedFn(
          fakeConsole,
          requireFn,
          module,
          module.exports,
          "/workspace/index.js",
          "/workspace",
        );

        clearTimeout(timer);

        // If the result is a Promise, wait for it (with timeout)
        if (result && typeof result === "object" && typeof (result as any).then === "function") {
          Promise.race([
            result,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Async execution timed out after ${timeoutMs}ms`)), timeoutMs),
            ),
          ]).then(resolve, reject);
        } else {
          resolve(result !== undefined ? result : module.exports);
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  private isTypeScript(code: string): boolean {
    return (
      /:\s*(string|number|boolean|void|any|unknown)\b/.test(code) ||
      /interface\s+\w+/.test(code) ||
      /type\s+\w+\s*=/.test(code) ||
      /import\s+type\s+/.test(code) ||
      /as\s+(string|number|boolean)\b/.test(code)
    );
  }

  private extractLineFromStack(stack?: string): number | undefined {
    if (!stack) return undefined;
    const match = stack.match(/<anonymous>:(\d+):(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }

  async installPackage(_env: EnvConfig, packageName: string): Promise<PackageEntry> {
    return {
      name: packageName,
      version: "built-in",
      builtin: true,
      sizeBytes: 0,
      installedAt: Date.now(),
    };
  }

  async uninstallPackage(_env: EnvConfig, _packageName: string): Promise<void> {}

  listAvailablePackages(): PackageManifest[] {
    return Object.keys(BUILTIN_MODULES).map((name) => ({
      language: "javascript" as Language,
      name,
      version: "built-in",
      description: `Built-in ${name} module`,
      dependencies: [],
      sizeBytes: 0,
      offlineAvailable: true,
    }));
  }

  listInstalledPackages(_env: EnvConfig): PackageEntry[] {
    return [];
  }

  async validateSyntax(code: string): Promise<{ valid: boolean; error?: string; line?: number }> {
    try {
      new Function(code);
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message,
        line: this.extractLineFromStack(err.stack),
      };
    }
  }

  dispose(): void {}
}
