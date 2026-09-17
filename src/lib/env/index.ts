/**
 * Virtual Environment Module — barrel exports.
 *
 * Self-contained code execution in isolated language environments.
 */

// Types
export type {
  Language,
  EnvConfig,
  RunOptions,
  RunResult,
  ExecutionRecord,
  LanguageRuntime,
  PackageEntry,
  PackageManifest,
  VirtualFile,
  VirtualFileSystem,
} from "./types";

export { DEFAULT_ENV_CONFIG } from "./types";

// Environment Manager
export {
  EnvironmentManager,
  getEnvironmentManager,
  type ManagedEnvironment,
} from "./manager";

// Runtime Registry
export {
  getRuntime,
  getAllRuntimes,
  initAllRuntimes,
  getSupportedLanguages,
  isLanguageSupported,
} from "./runtime-registry";

// Individual Runtimes (for direct use)
export { JSRuntime } from "./runtimes/js-runtime";
export { PythonRuntime } from "./runtimes/python-runtime";
export { RustRuntime } from "./runtimes/rust-runtime";
export { ShellRuntime } from "./runtimes/shell-runtime";
