/**
 * Runtime Registry — maps languages to their runtime implementations.
 *
 * Lazy-initialises runtimes on first use. Each runtime is a singleton
 * shared across all environments of that language.
 */

import type { Language, LanguageRuntime } from "./types";
import { JSRuntime } from "./runtimes/js-runtime";
import { PythonRuntime } from "./runtimes/python-runtime";
import { RustRuntime } from "./runtimes/rust-runtime";
import { ShellRuntime } from "./runtimes/shell-runtime";

// ─── Runtime Instances ───────────────────────────────────────────────────────

const runtimes: Partial<Record<Language, LanguageRuntime>> = {};

function getOrCreateRuntime(language: Language): LanguageRuntime | null {
  if (runtimes[language]) return runtimes[language]!;

  let runtime: LanguageRuntime;
  switch (language) {
    case "javascript":
    case "typescript":
      runtime = new JSRuntime();
      break;
    case "python":
      runtime = new PythonRuntime();
      break;
    case "rust":
      runtime = new RustRuntime();
      break;
    case "shell":
      runtime = new ShellRuntime();
      break;
    default:
      return null;
  }

  runtimes[language] = runtime;
  return runtime;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the runtime for a language. Returns null if unsupported.
 */
export function getRuntime(language: Language): LanguageRuntime | null {
  return getOrCreateRuntime(language);
}

/**
 * Get all available runtimes.
 */
export function getAllRuntimes(): LanguageRuntime[] {
  const languages: Language[] = ["javascript", "typescript", "python", "rust", "shell"];
  return languages
    .map((l) => getOrCreateRuntime(l))
    .filter((r): r is LanguageRuntime => r !== null);
}

/**
 * Initialise all runtimes (pre-load WASM modules, etc.).
 */
export async function initAllRuntimes(): Promise<void> {
  const runtimes = getAllRuntimes();
  await Promise.all(runtimes.map((r) => r.init()));
}

/**
 * Get supported languages.
 */
export function getSupportedLanguages(): Language[] {
  return ["javascript", "typescript", "python", "rust", "shell"];
}

/**
 * Check if a language is supported.
 */
export function isLanguageSupported(language: string): boolean {
  return getSupportedLanguages().includes(language as Language);
}
