import type { ToolManifest } from "../tool-types";

/**
 * Code Generation & Language Reference Tools
 *
 * These tools give SLMs access to a structured database of API signatures,
 * function prototypes, and working examples for Python, Java, C++, C,
 * JavaScript/TypeScript, and Rust. The SLM queries this database to produce
 * correct code without needing to memorize every API.
 */
export const CODEGEN_TOOLS: ToolManifest[] = [
  {
    id: "codegen.generate",
    name: "Generate Code",
    description:
      "Generate working code in Python, Java, C++, C, JavaScript, TypeScript, or Rust for a given task. Uses the language reference library to ensure correct API usage, imports, and syntax. Returns code + validation + run instructions.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "Code",
    color: "emerald",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [
      { name: "language", type: "enum", required: true, description: "Target language: python, java, cpp, c, javascript, typescript, rust" },
      { name: "task", type: "string", required: true, description: "Natural language description of what to build (e.g. 'read CSV compute average age')" },
      { name: "inputFormat", type: "string", required: false, description: "Input data format: csv, json, text, binary" },
      { name: "outputFormat", type: "string", required: false, description: "Expected output format: csv, json, text, file" },
      { name: "dependencies", type: "array", required: false, description: "Extra packages to include (e.g. ['pandas', 'numpy'])" },
      { name: "errorHandling", type: "boolean", required: false, description: "Include try/catch error handling" },
      { name: "comments", type: "boolean", required: false, description: "Add explanatory comments to the code" },
    ],
    capabilities: [
      { name: "generate", description: "Generate working code in any supported language", requiresBrowser: false, requiresNetwork: false, offline: true },
      { name: "reference", description: "Look up API signatures from built-in reference library", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["codegen", "generate", "code", "programming", "language", "slm", "reference", "python", "java", "cpp", "rust"],

  },
  {
    id: "codegen.validate",
    name: "Validate Syntax",
    description:
      "Check code for common syntax errors, missing imports, incorrect API usage, and language-specific pitfalls. Returns line-by-line issues with fixes. Use before executing code in sandbox.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "CheckCircle",
    color: "blue",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [
      { name: "language", type: "enum", required: true, description: "Programming language of the code" },
      { name: "code", type: "string", required: true, description: "Source code to validate" },
    ],
    capabilities: [
      { name: "validate", description: "Check code for syntax errors, missing imports, and common pitfalls", requiresBrowser: false, requiresNetwork: false, offline: true },
      { name: "fix", description: "Suggest specific fixes for detected issues", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["validate", "syntax", "check", "lint", "debug", "error", "fix"],

  },
  {
    id: "codegen.reference",
    name: "Language Reference Lookup",
    description:
      "Query the language reference database to find API signatures, import statements, and working examples. SLMs use this to get the exact API they need before generating code.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "BookOpen",
    color: "violet",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [
      { name: "language", type: "enum", required: false, description: "Filter by language (python, java, cpp, c, javascript, typescript, rust)" },
      { name: "search", type: "string", required: false, description: "Search query (e.g. 'read csv', 'http request', 'sort array')" },
      { name: "id", type: "string", required: false, description: "Exact API ID (e.g. 'python.pandas.read_csv')" },
    ],
    capabilities: [
      { name: "search", description: "Search API reference database by function name, purpose, or use case", requiresBrowser: false, requiresNetwork: false, offline: true },
      { name: "lookup", description: "Get full reference card for a specific API entry", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["reference", "lookup", "api", "signature", "documentation", "help"],

  },
  {
    id: "codegen.profile",
    name: "Language Profile",
    description:
      "Get the complete language profile: version, file extension, compile/run commands, package manager, and common pitfalls that trip up SLMs. Essential for setting up the correct execution environment.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "Info",
    color: "cyan",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [
      { name: "language", type: "enum", required: true, description: "Programming language to profile" },
    ],
    capabilities: [
      { name: "profile", description: "Get language version, commands, pitfalls, and setup instructions", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["profile", "language", "setup", "config", "environment", "pitfalls"],

  },
  {
    id: "codegen.starter",
    name: "Generate Starter File",
    description:
      "Generate a complete starter file for a language and task, with all necessary imports, boilerplate, and TODO placeholders. The SLM fills in the logic based on the reference library.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "FilePlus",
    color: "amber",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [
      { name: "language", type: "enum", required: true, description: "Target language" },
      { name: "task", type: "string", required: true, description: "What the file should do" },
    ],
    capabilities: [
      { name: "scaffold", description: "Generate complete starter file with imports and boilerplate", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["starter", "template", "boilerplate", "scaffold", "init"],

  },
  {
    id: "codegen.overview",
    name: "Language API Overview",
    description:
      "Get a complete overview of all available APIs for a language in a compact table format. Useful for SLMs to quickly scan what's available before selecting specific APIs.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "List",
    color: "teal",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [
      { name: "language", type: "enum", required: false, description: "Language to list APIs for (omit for all languages)" },
    ],
    capabilities: [
      { name: "overview", description: "Get compact table of all available APIs for a language", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["overview", "list", "browse", "catalog", "all-apis"],

  },
  {
    id: "codegen.check",
    name: "Detailed Syntax Check",
    description:
      "Run a detailed syntax check on code, returning line-by-line issues with severity levels (error/warning/info) and specific fix suggestions. More detailed than validate — includes column positions.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "Bug",
    color: "red",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [
      { name: "language", type: "enum", required: true, description: "Programming language" },
      { name: "code", type: "string", required: true, description: "Source code to check" },
    ],
    capabilities: [
      { name: "check", description: "Run detailed line-by-line syntax check with severity levels and fixes", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["check", "lint", "detailed", "line-by-line", "fix"],

  },
  {
    id: "codegen.pattern",
    name: "Code Pattern Library",
    description:
      "Get a complete code pattern for common programming tasks (HTTP server, file processing, database CRUD, async/concurrent, CLI tool, API client). These are cross-language templates the SLM can adapt.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "Workflow",
    color: "orange",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [
      { name: "pattern", type: "string", required: false, description: "Pattern name: http_server, file_processor, database_crud, async_concurrent, cli_tool, json_api_client" },
      { name: "language", type: "enum", required: false, description: "Get pattern in specific language (omit for Python default)" },
    ],
    capabilities: [
      { name: "patterns", description: "Get cross-language code patterns for HTTP, CRUD, CLI, async, API client", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["pattern", "template", "boilerplate", "common", "http", "crud", "cli"],

  },
  {
    id: "codegen.stats",
    name: "Reference Statistics",
    description:
      "Get statistics about the language reference library: total APIs, count per language, available patterns, and languages supported. Useful for understanding capabilities.",
    category: "codegen",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    icon: "BarChart3",
    color: "pink",
    installs: 0,
    rating: 5,
    ratingCount: 0,
    updatedAt: "2026-09-02",
    slmFriendly: true,
    parameters: [],
    capabilities: [
      { name: "stats", description: "Get statistics about the language reference library", requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    tags: ["stats", "info", "count", "capability"],

  },
];
