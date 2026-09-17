/**
 * Code Generation & Validation Engine for SLM-Driven Programming
 *
 * This module ties together the language reference library, syntax validation,
 * and code generation into a single workflow that SLMs can call:
 *
 * 1. SLM decides: "I need to read a CSV and compute average age in Python"
 * 2. SLM calls: codegen.generate({ language: "python", task: "read CSV compute average" })
 * 3. Engine: retrieves references → validates syntax → returns working code
 * 4. SLM passes code to sandbox.execute() for execution
 *
 * This bridges the gap between SLM capability and programming language mastery.
 */

import {
  type ProgrammingLanguage,
  type ApiEntry,
  searchReferences,
  getReferenceCard,
  getLanguageProfile,
  generateStarter,
  LANGUAGE_PROFILES,
  LANGUAGE_REFERENCES,
} from "./langref";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CodeGenRequest {
  /** Target language */
  language: ProgrammingLanguage;
  /** Natural language description of what to build */
  task: string;
  /** Input data format (csv, json, text, etc.) */
  inputFormat?: string;
  /** Output data format */
  outputFormat?: string;
  /** Dependencies to include */
  dependencies?: string[];
  /** Whether to include error handling */
  errorHandling?: boolean;
  /** Whether to include comments explaining the code */
  comments?: boolean;
}

export interface CodeGenResult {
  /** Generated source code */
  code: string;
  /** Language used */
  language: ProgrammingLanguage;
  /** APIs used with reference cards */
  apisUsed: Array<{ id: string; card: string }>;
  /** Import/include statements */
  imports: string[];
  /** Command to run the code */
  runCommand: string;
  /** Command to install dependencies */
  installCommand?: string;
  /** Syntax validation result */
  validation: ValidationResult;
  /** Quick explanation of what the code does */
  explanation: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Common mistakes the SLM should fix */
  suggestions: string[];
}

export interface SyntaxCheckRequest {
  language: ProgrammingLanguage;
  code: string;
}

export interface SyntaxCheckResult {
  valid: boolean;
  issues: Array<{
    line: number;
    column: number;
    severity: "error" | "warning" | "info";
    message: string;
    fix?: string;
  }>;
}

// ─── Syntax Validation Rules ──────────────────────────────────────────────────

const SYNTAX_RULES: Record<ProgrammingLanguage, Array<(code: string) => Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }>>> = {
  python: [
    // Check for common Python mistakes
    (code) => {
      const issues: Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }> = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Tabs check
        if (line.includes("\t")) {
          issues.push({ line: i + 1, message: "Mixed tabs and spaces — Python requires consistent indentation", severity: "error", fix: "Replace tabs with 4 spaces" });
        }
        // Semicolon warning
        if (line.trimEnd().endsWith(";")) {
          issues.push({ line: i + 1, message: "Semicolons are not idiomatic in Python", severity: "info" });
        }
        // Missing import for common functions
        if (code.includes("pd.") && !code.includes("import pandas")) {
          issues.push({ line: i + 1, message: "Using pd.* without importing pandas", severity: "error", fix: "Add: import pandas as pd" });
        }
        if (code.includes("np.") && !code.includes("import numpy")) {
          issues.push({ line: i + 1, message: "Using np.* without importing numpy", severity: "error", fix: "Add: import numpy as np" });
        }
      }
      return issues;
    },
  ],
  java: [
    (code) => {
      const issues: Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }> = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Missing semicolons
        if (line.trim().startsWith("import ") && !line.trim().endsWith(";")) {
          issues.push({ line: i + 1, message: "Import statement missing semicolon", severity: "error", fix: "Add ; at end of line" });
        }
        // Var usage in older Java
        if (line.includes("var ") && !line.includes("final var ")) {
          issues.push({ line: i + 1, message: "Using 'var' — ensure Java 10+ target", severity: "info" });
        }
      }
      // Check for main method
      if (!code.includes("public static void main")) {
        issues.push({ line: 1, message: "Missing main method — class won't be executable", severity: "warning", fix: "Add: public static void main(String[] args) { ... }" });
      }
      return issues;
    },
  ],
  cpp: [
    (code) => {
      const issues: Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }> = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Missing includes
        if (line.includes("std::vector") && !code.includes("#include <vector>")) {
          issues.push({ line: i + 1, message: "Using std::vector without #include <vector>", severity: "error", fix: "Add: #include <vector>" });
        }
        if (line.includes("std::string") && !code.includes("#include <string>")) {
          issues.push({ line: i + 1, message: "Using std::string without #include <string>", severity: "error", fix: "Add: #include <string>" });
        }
        if (line.includes("std::cout") && !code.includes("#include <iostream>")) {
          issues.push({ line: i + 1, message: "Using std::cout without #include <iostream>", severity: "error", fix: "Add: #include <iostream>" });
        }
        // Old-style headers
        if (line.includes("<iostream.h>") || line.includes("<stdio.h>")) {
          issues.push({ line: i + 1, message: "Using pre-standard header", severity: "warning", fix: "Use <iostream> instead of <iostream.h>" });
        }
      }
      // Check for main function
      if (!code.includes("int main")) {
        issues.push({ line: 1, message: "Missing main function", severity: "error" });
      }
      return issues;
    },
  ],
  c: [
    (code) => {
      const issues: Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }> = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // malloc without stdlib
        if ((line.includes("malloc(") || line.includes("free(")) && !code.includes("#include <stdlib.h>")) {
          issues.push({ line: i + 1, message: "Using malloc/free without #include <stdlib.h>", severity: "error", fix: "Add: #include <stdlib.h>" });
        }
        // printf without stdio
        if (line.includes("printf(") && !code.includes("#include <stdio.h>")) {
          issues.push({ line: i + 1, message: "Using printf without #include <stdio.h>", severity: "error", fix: "Add: #include <stdio.h>" });
        }
        // strlen without string
        if (line.includes("strlen(") && !code.includes("#include <string.h>")) {
          issues.push({ line: i + 1, message: "Using strlen without #include <string.h>", severity: "error", fix: "Add: #include <string.h>" });
        }
        // sqrt without math
        if ((line.includes("sqrt(") || line.includes("pow(") || line.includes("sin(")) && !code.includes("#include <math.h>")) {
          issues.push({ line: i + 1, message: "Using math functions without #include <math.h>", severity: "error", fix: "Add: #include <math.h> (link with -lm)" });
        }
        // Missing NULL check after malloc
        if (line.includes("malloc(")) {
          const nextLines = lines.slice(i + 1, i + 4).join("\n");
          if (!nextLines.includes("NULL")) {
            issues.push({ line: i + 1, message: "No NULL check after malloc", severity: "warning", fix: "Add: if (ptr == NULL) { ... }" });
          }
        }
        // Missing free
        if (code.includes("malloc(") && !code.includes("free(")) {
          issues.push({ line: 1, message: "Memory allocated with malloc but never freed", severity: "warning", fix: "Add free() before program exit" });
        }
      }
      return issues;
    },
  ],
  javascript: [
    (code) => {
      const issues: Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }> = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // var usage
        if (line.match(/\bvar\s/)) {
          issues.push({ line: i + 1, message: "Use 'const' or 'let' instead of 'var'", severity: "warning", fix: "Replace 'var' with 'const' or 'let'" });
        }
        // Missing await
        if (line.includes(".then(") && line.includes("async")) {
          issues.push({ line: i + 1, message: "Using .then() in async function — prefer await", severity: "info" });
        }
        // Console.log in production
        if (line.includes("console.log(")) {
          issues.push({ line: i + 1, message: "console.log in code — remove for production", severity: "info" });
        }
      }
      return issues;
    },
  ],
  typescript: [
    (code) => {
      const issues: Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }> = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // any type
        if (line.includes(": any") || line.includes("<any>")) {
          issues.push({ line: i + 1, message: "Using 'any' type — use specific types for safety", severity: "warning", fix: "Replace 'any' with a specific type" });
        }
        // @ts-ignore
        if (line.includes("@ts-ignore") || line.includes("@ts-expect-error")) {
          issues.push({ line: i + 1, message: "TypeScript error suppressed with directive", severity: "info" });
        }
      }
      return issues;
    },
  ],
  rust: [
    (code) => {
      const issues: Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }> = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // unwrap without context
        if (line.includes(".unwrap()") && !line.includes("expect(")) {
          issues.push({ line: i + 1, message: ".unwrap() without context — use .expect(\"message\") for better errors", severity: "warning" });
        }
        // println! without use
        if (line.includes("println!") && !code.includes("fn main")) {
          issues.push({ line: i + 1, message: "println! outside main — ensure it's in a function", severity: "info" });
        }
      }
      if (!code.includes("fn main")) {
        issues.push({ line: 1, message: "Missing fn main()", severity: "error" });
      }
      return issues;
    },
  ],
};

// ─── Code Generator ────────────────────────────────────────────────────────────

/**
 * Generate code for a given language and task, using reference library
 * to ensure correct API usage.
 */
export function generateCode(request: CodeGenRequest): CodeGenResult {
  const { language, task } = request;
  const profile = getLanguageProfile(language);

  // 1. Find relevant APIs for the task
  const relevantApis = searchReferences({ language, search: task });

  // 2. Generate starter code
  const starter = generateStarter(language, task);

  // 3. Build enhanced code with error handling if requested
  let code = starter.code;
  if (request.errorHandling) {
    code = addErrorHandling(code, language);
  }
  if (request.comments) {
    code = addComments(code, task, language);
  }

  // 4. Add dependencies
  if (request.dependencies && request.dependencies.length > 0) {
    const depImports = request.dependencies.map((dep) => getImportForDependency(dep, language)).filter(Boolean);
    if (depImports.length > 0) {
      const lines = code.split("\n");
      const firstNonImport = lines.findIndex((l) => !l.startsWith("import ") && !l.startsWith("from ") && !l.startsWith("#include ") && !l.startsWith("use ") && !l.startsWith("//") && !l.startsWith("/*") && l.trim().length > 0);
      if (firstNonImport > 0) {
        lines.splice(firstNonImport, 0, ...depImports);
        code = lines.join("\n");
      }
    }
  }

  // 5. Validate syntax
  const validation = validateSyntax({ language, code });

  // 6. Build reference cards
  const apisUsed = relevantApis.slice(0, 5).map((api) => ({
    id: api.id,
    card: getReferenceCard(api.id) || "",
  }));

  // 7. Build install command
  const installCmd = request.dependencies
    ? request.dependencies.map((d) => profile.installCommand?.replace("{package}", d)).filter(Boolean).join(" && ")
    : undefined;

  return {
    code,
    language,
    apisUsed,
    imports: starter.imports,
    runCommand: profile.runCommand,
    installCommand: installCmd || profile.installCommand,
    validation,
    explanation: `Generated ${profile.displayName} code for: ${task}. Uses ${relevantApis.length} reference APIs.`,
  };
}

/**
 * Validate code syntax for common mistakes.
 */
export function validateSyntax(request: SyntaxCheckRequest): ValidationResult {
  const rules = SYNTAX_RULES[request.language] || [];
  const allIssues: Array<{ line: number; message: string; severity: "error" | "warning" | "info"; fix?: string }> = [];

  for (const rule of rules) {
    allIssues.push(...rule(request.code));
  }

  const errors = allIssues.filter((i) => i.severity === "error").map((i) => `[Line ${i.line}] ${i.message}${i.fix ? ` → ${i.fix}` : ""}`);
  const warnings = allIssues.filter((i) => i.severity === "warning").map((i) => `[Line ${i.line}] ${i.message}`);
  const suggestions = allIssues.filter((i) => i.fix).map((i) => `${i.message}: ${i.fix}`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Check syntax with detailed line-by-line issues.
 */
export function checkSyntax(request: SyntaxCheckRequest): SyntaxCheckResult {
  const rules = SYNTAX_RULES[request.language] || [];
  const issues: Array<{ line: number; column: number; severity: "error" | "warning" | "info"; message: string; fix?: string }> = [];

  for (const rule of rules) {
    const ruleIssues = rule(request.code);
    issues.push(...ruleIssues.map((i) => ({ ...i, column: 0 })));
  }

  return {
    valid: !issues.some((i) => i.severity === "error"),
    issues,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function addErrorHandling(code: string, lang: ProgrammingLanguage): string {
  switch (lang) {
    case "python":
      return code.includes("try:") ? code : code.replace(/(import .+)/, "$1\n\ntry:\n    main()\nexcept Exception as e:\n    print(f'Error: {e}')\n    sys.exit(1)");
    case "javascript":
    case "typescript":
      return code.includes("try {") ? code : code.replace("main().catch(console.error);", "try {\n  await main();\n} catch (error) {\n  console.error('Error:', error.message);\n  process.exit(1);\n}");
    case "java":
      return code.includes("try") ? code : code.replace("public static void main(String[] args) {", "public static void main(String[] args) {\n        try {").concat("\n        } catch (Exception e) {\n            System.err.println(\"Error: \" + e.getMessage());\n            System.exit(1);\n        }");
    case "rust":
      return code.includes("expect(") ? code : code.replace("fn main() {", "fn main() -> Result<(), Box<dyn std::error::Error>> {").replace("}", "\n    Ok(())\n}");
    default:
      return code;
  }
}

function addComments(code: string, task: string, lang: ProgrammingLanguage): string {
  const commentPrefix = lang === "python" ? "#" : lang === "c" ? "/*" : "//";
  const commentSuffix = lang === "c" ? " */" : "";
  return `${commentPrefix} ${task}${commentSuffix}\n${commentPrefix} Generated by stitaP CodeGen Engine${commentSuffix}\n\n${code}`;
}

function getImportForDependency(dep: string, lang: ProgrammingLanguage): string {
  const importMap: Record<string, Record<string, string>> = {
    python: {
      pandas: "import pandas as pd",
      numpy: "import numpy as np",
      scipy: "from scipy import integrate, optimize, interpolate",
      flask: "from flask import Flask, request, jsonify",
      fastapi: "from fastapi import FastAPI",
      requests: "import requests",
      aiohttp: "import aiohttp",
      sqlite3: "import sqlite3",
      "beautifulsoup4": "from bs4 import BeautifulSoup",
      matplotlib: "import matplotlib.pyplot as plt",
      seaborn: "import seaborn as sns",
    },
    javascript: {
      express: "const express = require('express');",
      axios: "const axios = require('axios');",
      lodash: "const _ = require('lodash');",
      moment: "const moment = require('moment');",
      chalk: "const chalk = require('chalk');",
      inquirer: "const inquirer = require('inquirer');",
    },
    java: {
      jackson: "import com.fasterxml.jackson.databind.ObjectMapper;",
      guava: "import com.google.common.collect.*;",
    },
    rust: {
      reqwest: 'use reqwest;',
      serde: 'use serde::{Serialize, Deserialize};',
      tokio: 'use tokio;',
    },
  };

  const langImports = importMap[lang];
  if (langImports && langImports[dep]) {
    return langImports[dep];
  }

  // Default import patterns
  switch (lang) {
    case "python":
      return `import ${dep.replace("-", "_")}`;
    case "javascript":
      return `const ${dep.replace("-", "_")} = require('${dep}');`;
    case "java":
      return `// TODO: Add ${dep} dependency`;
    case "rust":
      return `// TODO: Add ${dep} to Cargo.toml`;
    case "cpp":
      return `// TODO: #include <${dep}>`;
    case "c":
      return `// TODO: #include <${dep}.h>`;
    default:
      return `// Import ${dep}`;
  }
}

/**
 * Get all available APIs for quick SLM lookup.
 * Returns a compact table the model can scan.
 */
export function getApiQuickRef(language?: ProgrammingLanguage): string {
  const apis = language ? searchReferences({ language }) : LANGUAGE_REFERENCES;

  const lines = [
    `| ID | Language | Name | When to Use |`,
    `|----|----------|------|-------------|`,
    ...apis.map((a) => `| ${a.id} | ${a.id.split(".")[0]} | ${a.name} | ${a.whenToUse} |`),
  ];

  return lines.join("\n");
}

/**
 * Get the total count of references and languages.
 */
export function getCodeGenStats(): {
  totalApis: number;
  byLanguage: Record<string, number>;
  patterns: number;
  languages: string[];
} {
  const byLang: Record<string, number> = {};
  let patterns = 0;
  for (const api of LANGUAGE_REFERENCES) {
    const lang = api.id.split(".")[0];
    if (api.id.startsWith("pattern.")) {
      patterns++;
    } else {
      byLang[lang] = (byLang[lang] || 0) + 1;
    }
  }
  return {
    totalApis: LANGUAGE_REFERENCES.length,
    byLanguage: byLang,
    patterns,
    languages: Object.keys(LANGUAGE_PROFILES),
  };
}
