/**
 * Design-to-Code Converter — Google Stitch-style
 *
 * Converts prompt inputs and layout requests into production-ready UI code
 * aligned with established design tokens. Supports multiple targets:
 * - React + Tailwind CSS
 * - Web Components
 * - Flutter
 * - Vue + Tailwind
 * - HTML/CSS
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CodeTarget = "react-tailwind" | "vue-tailwind" | "web-components" | "flutter" | "html-css";

export interface DesignToken {
  /** Token category */
  category: "color" | "spacing" | "typography" | "radius" | "shadow" | "breakpoint";
  /** Token name (e.g., "primary-500") */
  name: string;
  /** Token value */
  value: string;
  /** CSS variable name (e.g., "--color-primary-500") */
  cssVariable?: string;
}

export interface LayoutRequest {
  /** Natural language description of the UI component */
  prompt: string;
  /** Target framework */
  target: CodeTarget;
  /** Available design tokens to use */
  tokens?: DesignToken[];
  /** Component name */
  componentName?: string;
  /** Whether to include responsive breakpoints */
  responsive?: boolean;
  /** Whether to include dark mode */
  darkMode?: boolean;
}

export interface GeneratedCode {
  /** The generated source code */
  code: string;
  /** The target framework */
  target: CodeTarget;
  /** Component name */
  componentName: string;
  /** Design tokens used */
  tokensUsed: string[];
  /** CSS dependencies */
  cssDependencies: string[];
  /** npm packages needed */
  packages: string[];
  /** Preview HTML (for HTML/CSS target) */
  previewHtml?: string;
}

// ─── Token Presets ──────────────────────────────────────────────────────────

export const DEFAULT_TOKENS: DesignToken[] = [
  // Colors
  { category: "color", name: "primary-50", value: "#eff6ff", cssVariable: "--color-primary-50" },
  { category: "color", name: "primary-100", value: "#dbeafe", cssVariable: "--color-primary-100" },
  { category: "color", name: "primary-500", value: "#3b82f6", cssVariable: "--color-primary-500" },
  { category: "color", name: "primary-600", value: "#2563eb", cssVariable: "--color-primary-600" },
  { category: "color", name: "primary-700", value: "#1d4ed8", cssVariable: "--color-primary-700" },
  { category: "color", name: "gray-50", value: "#f9fafb", cssVariable: "--color-gray-50" },
  { category: "color", name: "gray-100", value: "#f3f4f6", cssVariable: "--color-gray-100" },
  { category: "color", name: "gray-200", value: "#e5e7eb", cssVariable: "--color-gray-200" },
  { category: "color", name: "gray-500", value: "#6b7280", cssVariable: "--color-gray-500" },
  { category: "color", name: "gray-900", value: "#111827", cssVariable: "--color-gray-900" },
  { category: "color", name: "white", value: "#ffffff" },
  { category: "color", name: "black", value: "#000000" },
  // Spacing
  { category: "spacing", name: "1", value: "0.25rem", cssVariable: "--spacing-1" },
  { category: "spacing", name: "2", value: "0.5rem", cssVariable: "--spacing-2" },
  { category: "spacing", name: "3", value: "0.75rem", cssVariable: "--spacing-3" },
  { category: "spacing", name: "4", value: "1rem", cssVariable: "--spacing-4" },
  { category: "spacing", name: "6", value: "1.5rem", cssVariable: "--spacing-6" },
  { category: "spacing", name: "8", value: "2rem", cssVariable: "--spacing-8" },
  // Typography
  { category: "typography", name: "heading", value: "font-bold text-2xl tracking-tight" },
  { category: "typography", name: "subheading", value: "font-semibold text-lg" },
  { category: "typography", name: "body", value: "text-base leading-relaxed" },
  { category: "typography", name: "caption", value: "text-sm text-gray-500" },
  // Radius
  { category: "radius", name: "sm", value: "0.25rem" },
  { category: "radius", name: "md", value: "0.375rem" },
  { category: "radius", name: "lg", value: "0.5rem" },
  { category: "radius", name: "xl", value: "0.75rem" },
  { category: "radius", name: "full", value: "9999px" },
];

// ─── Design-to-Code Engine ──────────────────────────────────────────────────

export class DesignToCodeEngine {
  /**
   * Generate UI code from a natural language prompt.
   */
  generate(request: LayoutRequest): GeneratedCode {
    const tokens = request.tokens ?? DEFAULT_TOKENS;
    const componentName = request.componentName ?? "GeneratedComponent";

    switch (request.target) {
      case "react-tailwind":
        return this.generateReactTailwind(request.prompt, componentName, tokens, request);
      case "vue-tailwind":
        return this.generateVueTailwind(request.prompt, componentName, tokens, request);
      case "html-css":
        return this.generateHtmlCss(request.prompt, componentName, tokens, request);
      case "web-components":
        return this.generateWebComponents(request.prompt, componentName, tokens, request);
      case "flutter":
        return this.generateFlutter(request.prompt, componentName, tokens, request);
      default:
        return this.generateReactTailwind(request.prompt, componentName, tokens, request);
    }
  }

  /**
   * Parse a prompt into layout hints.
   */
  parsePrompt(prompt: string): {
    components: string[];
    layout: string;
    style: string;
    hasForm: boolean;
    hasTable: boolean;
    hasNavigation: boolean;
    hasHero: boolean;
    hasCards: boolean;
  } {
    const lower = prompt.toLowerCase();
    return {
      components: this.extractComponents(lower),
      layout: lower.includes("sidebar") ? "sidebar" : lower.includes("grid") ? "grid" : lower.includes("center") ? "centered" : "stack",
      style: lower.includes("minimal") ? "minimal" : lower.includes("bold") ? "bold" : lower.includes("dark") ? "dark" : "clean",
      hasForm: /form|input|submit|field|email|password/i.test(prompt),
      hasTable: /table|data|row|column|list/i.test(prompt),
      hasNavigation: /nav|menu|header|sidebar/i.test(prompt),
      hasHero: /hero|banner|landing|headline/i.test(prompt),
      hasCards: /card|grid|tiles|items/i.test(prompt),
    };
  }

  private extractComponents(prompt: string): string[] {
    const components: string[] = [];
    if (/button|btn|cta|action/i.test(prompt)) components.push("button");
    if (/input|field|text.?area/i.test(prompt)) components.push("input");
    if (/card|tile/i.test(prompt)) components.push("card");
    if (/modal|dialog|popup/i.test(prompt)) components.push("modal");
    if (/badge|tag|chip/i.test(prompt)) components.push("badge");
    if (/avatar|profile|image/i.test(prompt)) components.push("avatar");
    if (/toggle|switch/i.test(prompt)) components.push("toggle");
    if (/slider|range/i.test(prompt)) components.push("slider");
    if (/dropdown|select/i.test(prompt)) components.push("select");
    if (/tab/i.test(prompt)) components.push("tabs");
    if (/alert|notification|toast/i.test(prompt)) components.push("alert");
    return components;
  }

  // ─── React + Tailwind Generator ───────────────────────────────────────

  private generateReactTailwind(
    prompt: string,
    name: string,
    tokens: DesignToken[],
    request: LayoutRequest,
  ): GeneratedCode {
    const hints = this.parsePrompt(prompt);
    const responsiveClasses = request.responsive ? "sm: md: lg:" : "";
    const darkClasses = request.darkMode ? "dark:" : "";

    let code = `import React from "react";\n\n`;
    code += `interface ${name}Props {\n`;
    code += `  className?: string;\n`;
    code += `}\n\n`;
    code += `export function ${name}({ className }: ${name}Props) {\n`;
    code += `  return (\n`;
    code += `    <div className={\`flex flex-col gap-6 p-6 max-w-4xl mx-auto \${className ?? ""}\`}>\n`;

    if (hints.hasHero) {
      code += `      {/* Hero Section */}\n`;
      code += `      <section className="text-center py-12">\n`;
      code += `        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">\n`;
      code += `          ${this.extractTitle(prompt)}\n`;
      code += `        </h1>\n`;
      code += `        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">\n`;
      code += `          ${this.extractDescription(prompt)}\n`;
      code += `        </p>\n`;
      code += `        <div className="mt-8 flex gap-4 justify-center">\n`;
      code += `          <button className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors">\n`;
      code += `            Get Started\n`;
      code += `          </button>\n`;
      code += `          <button className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">\n`;
      code += `            Learn More\n`;
      code += `          </button>\n`;
      code += `        </div>\n`;
      code += `      </section>\n\n`;
    }

    if (hints.hasCards) {
      code += `      {/* Card Grid */}\n`;
      code += `      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">\n`;
      code += `        {[1, 2, 3].map((i) => (\n`;
      code += `          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">\n`;
      code += `            <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg mb-4" />\n`;
      code += `            <h3 className="font-semibold text-gray-900 dark:text-white">Feature {i}</h3>\n`;
      code += `            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Description of feature {i}</p>\n`;
      code += `          </div>\n`;
      code += `        ))}\n`;
      code += `      </div>\n\n`;
    }

    if (hints.hasForm) {
      code += `      {/* Form */}\n`;
      code += `      <form className="space-y-4 max-w-md">\n`;
      code += `        <div>\n`;
      code += `          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>\n`;
      code += `          <input type="email" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="you@example.com" />\n`;
      code += `        </div>\n`;
      code += `        <button type="submit" className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors">\n`;
      code += `          Submit\n`;
      code += `        </button>\n`;
      code += `      </form>\n\n`;
    }

    if (hints.hasTable) {
      code += `      {/* Data Table */}\n`;
      code += `      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">\n`;
      code += `        <table className="w-full text-sm">\n`;
      code += `          <thead className="bg-gray-50 dark:bg-gray-900">\n`;
      code += `            <tr>\n`;
      code += `              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>\n`;
      code += `              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>\n`;
      code += `              <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>\n`;
      code += `            </tr>\n`;
      code += `          </thead>\n`;
      code += `          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">\n`;
      code += `            <tr>\n`;
      code += `              <td className="px-4 py-3 text-gray-900 dark:text-white">Item 1</td>\n`;
      code += `              <td className="px-4 py-3"><span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">Active</span></td>\n`;
      code += `              <td className="px-4 py-3"><button className="text-primary-600 hover:underline">Edit</button></td>\n`;
      code += `            </tr>\n`;
      code += `          </tbody>\n`;
      code += `        </table>\n`;
      code += `      </div>\n\n`;
    }

    code += `    </div>\n`;
    code += `  );\n`;
    code += `}\n`;

    const tokensUsed = tokens.filter((t) =>
      code.includes(t.cssVariable ?? "") || code.includes(t.name)
    ).map((t) => t.name);

    return {
      code,
      target: "react-tailwind",
      componentName: name,
      tokensUsed,
      cssDependencies: ["tailwindcss"],
      packages: ["react"],
    };
  }

  // ─── Vue + Tailwind Generator ─────────────────────────────────────────

  private generateVueTailwind(
    prompt: string,
    name: string,
    tokens: DesignToken[],
    request: LayoutRequest,
  ): GeneratedCode {
    const hints = this.parsePrompt(prompt);
    let code = `<script setup lang="ts">\n`;
    code += `// ${name} — Generated from: "${prompt}"\n`;
    code += `</script>\n\n`;
    code += `<template>\n`;
    code += `  <div class="flex flex-col gap-6 p-6 max-w-4xl mx-auto">\n`;

    if (hints.hasHero) {
      code += `    <section class="text-center py-12">\n`;
      code += `      <h1 class="text-4xl font-bold tracking-tight text-gray-900">${this.extractTitle(prompt)}</h1>\n`;
      code += `      <p class="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">${this.extractDescription(prompt)}</p>\n`;
      code += `      <div class="mt-8 flex gap-4 justify-center">\n`;
      code += `        <button class="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">Get Started</button>\n`;
      code += `      </div>\n`;
      code += `    </section>\n`;
    }

    code += `  </div>\n`;
    code += `</template>\n`;

    return {
      code,
      target: "vue-tailwind",
      componentName: name,
      tokensUsed: [],
      cssDependencies: ["tailwindcss"],
      packages: ["vue"],
    };
  }

  // ─── HTML/CSS Generator ──────────────────────────────────────────────

  private generateHtmlCss(
    prompt: string,
    name: string,
    tokens: DesignToken[],
    request: LayoutRequest,
  ): GeneratedCode {
    const hints = this.parsePrompt(prompt);
    const cssVars = tokens
      .filter((t) => t.cssVariable)
      .map((t) => `  ${t.cssVariable}: ${t.value};`)
      .join("\n");

    let code = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n  <style>\n    :root {\n${cssVars}\n    }\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body { font-family: system-ui, sans-serif; color: var(--color-gray-900); background: var(--color-white); }\n  </style>\n</head>\n<body>\n`;

    if (hints.hasHero) {
      code += `  <section style="text-align: center; padding: 3rem 1rem;">\n`;
      code += `    <h1 style="font-size: 2.25rem; font-weight: bold;">${this.extractTitle(prompt)}</h1>\n`;
      code += `    <p style="margin-top: 1rem; color: var(--color-gray-500);">${this.extractDescription(prompt)}</p>\n`;
      code += `  </section>\n`;
    }

    code += `</body>\n</html>`;

    return {
      code,
      target: "html-css",
      componentName: name,
      tokensUsed: tokens.map((t) => t.name),
      cssDependencies: [],
      packages: [],
      previewHtml: code,
    };
  }

  // ─── Web Components Generator ─────────────────────────────────────────

  private generateWebComponents(
    prompt: string,
    name: string,
    tokens: DesignToken[],
    request: LayoutRequest,
  ): GeneratedCode {
    const tag = name.toLowerCase().replace(/([A-Z])/g, "-$1").replace(/^-/, "");

    let code = `class ${name} extends HTMLElement {\n`;
    code += `  constructor() {\n`;
    code += `    super();\n`;
    code += `    this.attachShadow({ mode: "open" });\n`;
    code += `  }\n\n`;
    code += `  connectedCallback() {\n`;
    code += `    this.shadowRoot.innerHTML = \`\n`;
    code += `      <style>:host { display: block; }</style>\n`;
    code += `      <div class="container">\n`;
    code += `        <h1>${this.extractTitle(prompt)}</h1>\n`;
    code += `        <p>${this.extractDescription(prompt)}</p>\n`;
    code += `      </div>\n`;
    code += `    \`;\n`;
    code += `  }\n`;
    code += `}\n\n`;
    code += `customElements.define("${tag}", ${name});\n`;

    return {
      code,
      target: "web-components",
      componentName: name,
      tokensUsed: [],
      cssDependencies: [],
      packages: [],
    };
  }

  // ─── Flutter Generator ────────────────────────────────────────────────

  private generateFlutter(
    prompt: string,
    name: string,
    tokens: DesignToken[],
    request: LayoutRequest,
  ): GeneratedCode {
    let code = `import 'package:flutter/material.dart';\n\n`;
    code += `class ${name} extends StatelessWidget {\n`;
    code += `  const ${name}({super.key});\n\n`;
    code += `  @override\n`;
    code += `  Widget build(BuildContext context) {\n`;
    code += `    return Scaffold(\n`;
    code += `      body: Center(\n`;
    code += `        child: Column(\n`;
    code += `          mainAxisAlignment: MainAxisAlignment.center,\n`;
    code += `          children: [\n`;
    code += `            Text(\n`;
    code += `              '${this.extractTitle(prompt)}',\n`;
    code += `              style: Theme.of(context).textTheme.headlineMedium,\n`;
    code += `            ),\n`;
    code += `            const SizedBox(height: 16),\n`;
    code += `            Text('${this.extractDescription(prompt)}'),\n`;
    code += `            const SizedBox(height: 32),\n`;
    code += `            ElevatedButton(\n`;
    code += `              onPressed: () {},\n`;
    code += `              child: const Text('Get Started'),\n`;
    code += `            ),\n`;
    code += `          ],\n`;
    code += `        ),\n`;
    code += `      ),\n`;
    code += `    );\n`;
    code += `  }\n`;
    code += `}\n`;

    return {
      code,
      target: "flutter",
      componentName: name,
      tokensUsed: [],
      cssDependencies: [],
      packages: ["flutter"],
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private extractTitle(prompt: string): string {
    // Extract a title-like phrase from the prompt
    const words = prompt.split(" ").slice(0, 6);
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  private extractDescription(prompt: string): string {
    const words = prompt.split(" ").slice(6, 20);
    return words.join(" ") || "A generated component based on your prompt.";
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _engine: DesignToCodeEngine | null = null;

export function getDesignToCode(): DesignToCodeEngine {
  if (!_engine) _engine = new DesignToCodeEngine();
  return _engine;
}
