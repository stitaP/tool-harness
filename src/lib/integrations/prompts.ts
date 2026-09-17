/**
 * Reusable Prompt Library & Slash Commands
 *
 * Cursor-inspired system for composable, reusable prompts:
 * - Pre-built prompt templates for common tasks
 * - Slash commands that expand to full prompts
 * - Integration presets (configurations for common workflows)
 * - Context injection (inject project state, file contents, etc.)
 *
 * All prompts are SLM-optimized: compact, structured, minimal context.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  /** Slash command trigger (e.g., "/audit") */
  command?: string;
  /** Category */
  category: "code" | "review" | "test" | "design" | "docs" | "debug" | "refactor" | "security" | "performance" | "custom";
  /** The prompt template with {{variables}} */
  template: string;
  /** Variables the user must provide */
  variables: Array<{ name: string; description: string; required: boolean; default?: string }>;
  /** What tools this prompt expects to use */
  expectedTools: string[];
  /** Tags for search */
  tags: string[];
  /** Whether this works with SLMs (compact enough) */
  slmCompatible: boolean;
  /** Example usage */
  examples?: Array<{ input: string; output: string }>;
}

export interface SlashCommand {
  command: string;
  description: string;
  promptId: string;
  /** Quick shortcut (e.g., "!test" instead of "/test") */
  shortcut?: string;
  /** Platform support */
  platforms: string[];
}

export interface IntegrationPreset {
  id: string;
  name: string;
  description: string;
  /** Tools to enable */
  tools: string[];
  /** Sandbox scenario to use */
  scenarioId?: string;
  /** Memory entries to preload */
  preloadMemory?: Array<{ key: string; content: string }>;
  /** Skills to load */
  preloadSkills?: string[];
  /** Default settings */
  settings: Record<string, unknown>;
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // ── Code Review ──
  {
    id: "review-code",
    name: "Code Review",
    description: "Review code for quality, bugs, and improvements",
    command: "/review",
    category: "review",
    template: `Review the following code for:
1. Bugs and logic errors
2. Security vulnerabilities
3. Performance issues
4. Code style and readability
5. Missing error handling

{{#if file}}File: {{file}}{{/if}}
{{#if code}}
\`\`\`
{{code}}
\`\`\`
{{/if}}
{{#if context}}Context: {{context}}{{/if}}

Provide specific, actionable feedback with line references.`,
    variables: [
      { name: "file", description: "File path being reviewed", required: false },
      { name: "code", description: "Code to review", required: false },
      { name: "context", description: "Additional context about the code", required: false },
    ],
    expectedTools: ["browser.inspect", "browser.console"],
    tags: ["review", "code", "quality", "bugs"],
    slmCompatible: true,
  },
  {
    id: "review-pr",
    name: "PR Review",
    description: "Review a pull/merge request with diff analysis",
    command: "/review-pr",
    category: "review",
    template: `Review this PR/merge request.

Title: {{title}}
{{#if description}}Description: {{description}}{{/if}}
{{#if diff}}
Changes:
\`\`\`diff
{{diff}}
\`\`\`
{{/if}}

Check for:
1. Breaking changes
2. Missing tests
3. Security issues
4. Performance regressions
5. Documentation updates needed`,
    variables: [
      { name: "title", description: "PR title", required: true },
      { name: "description", description: "PR description", required: false },
      { name: "diff", description: "Code diff", required: false },
    ],
    expectedTools: ["browser.network"],
    tags: ["review", "pr", "merge-request", "diff"],
    slmCompatible: true,
  },

  // ── Testing ──
  {
    id: "generate-tests",
    name: "Generate Tests",
    description: "Generate unit/integration tests for a function or module",
    command: "/test",
    category: "test",
    template: `Generate comprehensive tests for:

{{#if file}}File: {{file}}{{/if}}
{{#if code}}
\`\`\`
{{code}}
\`\`\`
{{/if}}
{{#if testType}}{{testType}} tests only{{/if}}

Requirements:
- Cover happy path, edge cases, and error cases
- Use {{#if framework}}{{framework}}{{else}}vitest{{/if}} test framework
- Include descriptive test names
- Mock external dependencies
- Test both success and failure paths`,
    variables: [
      { name: "file", description: "File to test", required: false },
      { name: "code", description: "Code to test", required: false },
      { name: "testType", description: "Test type: unit, integration, e2e", required: false, default: "unit" },
      { name: "framework", description: "Test framework", required: false, default: "vitest" },
    ],
    expectedTools: ["env.run", "sandbox.exec"],
    tags: ["test", "unit", "integration", "vitest"],
    slmCompatible: true,
  },
  {
    id: "fix-failing-test",
    name: "Fix Failing Test",
    description: "Diagnose and fix a failing test",
    command: "/fix-test",
    category: "test",
    template: `This test is failing:

Test: {{testName}}
Error: {{error}}
{{#if code}}
Code:
\`\`\`
{{code}}
\`\`\`
{{/if}}

Diagnose the root cause and provide a fix. Explain why it was failing.`,
    variables: [
      { name: "testName", description: "Name of the failing test", required: true },
      { name: "error", description: "Error message", required: true },
      { name: "code", description: "Relevant code", required: false },
    ],
    expectedTools: ["browser.console", "env.run"],
    tags: ["test", "fix", "debug", "error"],
    slmCompatible: true,
  },

  // ── Security ──
  {
    id: "security-audit",
    name: "Security Audit",
    description: "Run a security audit on a page or codebase",
    command: "/security",
    category: "security",
    template: `Security audit for {{target}}:

{{#if scope}}Scope: {{scope}}{{/if}}

Check for:
1. XSS vulnerabilities
2. CSRF protection
3. SQL injection
4. Authentication/authorization flaws
5. Sensitive data exposure
6. Insecure dependencies
7. Missing security headers
8. Input validation gaps

Use browser.security-headers, browser.a11y-audit, and browser.inspect tools.
Provide a severity rating (Critical/High/Medium/Low) for each finding.`,
    variables: [
      { name: "target", description: "URL or file to audit", required: true },
      { name: "scope", description: "Audit scope", required: false },
    ],
    expectedTools: ["browser.security-headers", "browser.a11y-audit", "browser.inspect"],
    tags: ["security", "audit", "vulnerability", "xss"],
    slmCompatible: true,
  },

  // ── Design ──
  {
    id: "design-audit",
    name: "Design Audit",
    description: "Audit a page against Vercel + Fluent + TasteSkill guidelines",
    command: "/design",
    category: "design",
    template: `Audit this page's design against industry guidelines.

URL: {{url}}
{{#if focus}}Focus: {{focus}}{{/if}}

Run browser.design-audit, browser.typography-check, browser.spacing-check, and browser.color-palette.
Provide a score (0-100) and top 5 improvement suggestions with code examples.`,
    variables: [
      { name: "url", description: "Page URL to audit", required: true },
      { name: "focus", description: "Focus area: typography, spacing, color, all", required: false, default: "all" },
    ],
    expectedTools: ["browser.design-audit", "browser.typography-check", "browser.spacing-check", "browser.color-palette"],
    tags: ["design", "audit", "ui", "ux"],
    slmCompatible: true,
  },

  // ── Docs ──
  {
    id: "write-docs",
    name: "Write Documentation",
    description: "Generate documentation for a file or module",
    command: "/docs",
    category: "docs",
    template: `Generate documentation for:

{{#if file}}File: {{file}}{{/if}}
{{#if code}}
\`\`\`
{{code}}
\`\`\`
{{/if}}

Include:
1. Overview (what it does)
2. API reference (exports, parameters, return types)
3. Usage examples
4. Edge cases and error handling
5. Dependencies`,
    variables: [
      { name: "file", description: "File to document", required: false },
      { name: "code", description: "Code to document", required: false },
    ],
    expectedTools: ["browser.inspect"],
    tags: ["docs", "documentation", "api", "readme"],
    slmCompatible: true,
  },

  // ── Debug ──
  {
    id: "debug-error",
    name: "Debug Error",
    description: "Diagnose and fix a runtime error",
    command: "/debug",
    category: "debug",
    template: `Debug this error:

Error: {{error}}
{{#if stack}}Stack trace:
\`\`\`
{{stack}}
\`\`\`
{{/if}}
{{#if code}}
Code context:
\`\`\`
{{code}}
\`\`\`
{{/if}}
{{#if url}}Page URL: {{url}}{{/if}}

Steps:
1. Identify the root cause
2. Check browser.console for related errors
3. Inspect the DOM state if relevant
4. Provide a specific fix with code`,
    variables: [
      { name: "error", description: "Error message", required: true },
      { name: "stack", description: "Stack trace", required: false },
      { name: "code", description: "Relevant code", required: false },
      { name: "url", description: "Page URL", required: false },
    ],
    expectedTools: ["browser.console", "browser.inspect"],
    tags: ["debug", "error", "fix", "runtime"],
    slmCompatible: true,
  },

  // ── Performance ──
  {
    id: "perf-audit",
    name: "Performance Audit",
    description: "Audit page performance and suggest optimizations",
    command: "/perf",
    category: "performance",
    template: `Performance audit for {{url}}:

Run browser.performance and browser.interact-test tools.
Analyze:
1. Core Web Vitals (LCP, CLS, FID/INP)
2. Resource loading (render-blocking, large bundles)
3. Image optimization
4. Caching strategy
5. Third-party impact

Provide specific fixes with expected impact.`,
    variables: [
      { name: "url", description: "URL to audit", required: true },
    ],
    expectedTools: ["browser.performance", "browser.interact-test", "browser.responsive-test"],
    tags: ["performance", "lighthouse", "web-vitals", "speed"],
    slmCompatible: true,
  },

  // ── Refactor ──
  {
    id: "refactor-code",
    name: "Refactor Code",
    description: "Suggest refactoring improvements for code",
    command: "/refactor",
    category: "refactor",
    template: `Refactor this code for better {{#if goal}}{{goal}}{{else}}readability and maintainability{{/if}}:

{{#if file}}File: {{file}}{{/if}}
{{#if code}}
\`\`\`
{{code}}
\`\`\`
{{/if}}

Constraints:
{{#if constraints}}{{constraints}}{{else}}- Keep the same public API
- Don't break existing tests{{/if}}

Provide before/after with explanations.`,
    variables: [
      { name: "file", description: "File to refactor", required: false },
      { name: "code", description: "Code to refactor", required: false },
      { name: "goal", description: "Refactoring goal", required: false },
      { name: "constraints", description: "Constraints", required: false },
    ],
    expectedTools: ["browser.inspect"],
    tags: ["refactor", "clean", "improve", "code-quality"],
    slmCompatible: true,
  },

  // ── Wiki Generation ──
  {
    id: "generate-wiki",
    name: "Generate Wiki",
    description: "Generate wiki documentation from codebase",
    command: "/wiki",
    category: "docs",
    template: `Generate wiki documentation for this repository.

{{#if repoUrl}}Repository: {{repoUrl}}{{/if}}
{{#if scope}}Scope: {{scope}}{{/if}}

Generate the following pages:
1. README (overview, quick start)
2. Architecture (project structure, key patterns)
3. API Reference (exported functions, classes, types)
4. Changelog (from git history)
5. Contributing Guide

Use the wiki generator tools to produce structured markdown pages.`,
    variables: [
      { name: "repoUrl", description: "Repository URL", required: false },
      { name: "scope", description: "What to document", required: false, default: "full" },
    ],
    expectedTools: ["agent.terminal"],
    tags: ["wiki", "docs", "documentation", "readme"],
    slmCompatible: true,
  },

  // ── Jira Integration ──
  {
    id: "sprint-planning",
    name: "Sprint Planning",
    description: "Analyze Jira tickets and suggest sprint scope",
    command: "/sprint",
    category: "custom",
    template: `Help plan the next sprint.

{{#if boardId}}Board: {{boardId}}{{/if}}
{{#if velocity}}Team velocity: {{velocity}} points{{/if}}

1. List open issues sorted by priority
2. Identify dependencies between issues
3. Suggest a sprint scope based on velocity
4. Flag any blockers or risks
5. Estimate story points if missing

Use Jira tools to fetch current backlog.`,
    variables: [
      { name: "boardId", description: "Jira board ID", required: false },
      { name: "velocity", description: "Team velocity in story points", required: false },
    ],
    expectedTools: ["agent.terminal"],
    tags: ["jira", "sprint", "planning", "agile"],
    slmCompatible: true,
  },

  // ── Capture ──
  {
    id: "capture-page",
    name: "Capture Full Page",
    description: "Capture a full-page screenshot with annotations",
    command: "/capture",
    category: "custom",
    template: `Capture a full-page screenshot of {{url}}.

Options:
{{#if annotations}}Annotations: {{annotations}}{{/if}}
{{#if format}}Format: {{format}}{{/if}}

Steps:
1. Navigate to the URL
2. Wait for full page load
3. Scroll to trigger lazy content
4. Capture full-page screenshot
5. Generate SVG with metadata
6. Add requested annotations`,
    variables: [
      { name: "url", description: "URL to capture", required: true },
      { name: "annotations", description: "Annotations to add", required: false },
      { name: "format", description: "Output format: png, svg, hybrid", required: false, default: "svg" },
    ],
    expectedTools: ["browser.navigate", "browser.screenshot"],
    tags: ["capture", "screenshot", "fullpage", "annotation"],
    slmCompatible: true,
  },

  // ── Video Tutorial ──
  {
    id: "create-tutorial",
    name: "Create Tutorial",
    description: "Generate a step-by-step video tutorial from documentation",
    command: "/tutorial",
    category: "docs",
    template: `Create a video tutorial for: {{topic}}

Source material:
{{#if url}}URL: {{url}}{{/if}}
{{#if docContent}}
Documentation:
{{docContent}}
{{/if}}

Steps:
1. Extract key steps from documentation
2. Capture screenshots for each step
3. Generate narration script
4. Create video with transitions and captions
5. Export as MP4`,
    variables: [
      { name: "topic", description: "Tutorial topic", required: true },
      { name: "url", description: "Source URL", required: false },
      { name: "docContent", description: "Documentation content", required: false },
    ],
    expectedTools: ["browser.navigate", "browser.screenshot", "video.captureFrame", "video.addCaption", "media.synthesizeSpeech"],
    tags: ["tutorial", "video", "guide", "documentation"],
    slmCompatible: true,
  },
];

// ─── Slash Commands ──────────────────────────────────────────────────────────

export const SLASH_COMMANDS: SlashCommand[] = PROMPT_TEMPLATES
  .filter(t => t.command)
  .map(t => ({
    command: t.command!,
    description: t.description,
    promptId: t.id,
    shortcut: undefined,
    platforms: ["cli", "messaging", "desktop"],
  }));

// ─── Integration Presets ─────────────────────────────────────────────────────

export const INTEGRATION_PRESETS: IntegrationPreset[] = [
  {
    id: "web-audit",
    name: "Full Web Audit",
    description: "Comprehensive website audit: design, performance, security, accessibility",
    tools: [
      "browser.navigate", "browser.design-audit", "browser.performance",
      "browser.a11y-audit", "browser.security-headers", "browser.seo-audit",
      "browser.typography-check", "browser.spacing-check",
    ],
    preloadMemory: [
      { key: "audit.standard", content: "WCAG 2.1 AA, Fluent 2, Vercel Guidelines" },
    ],
    settings: { scope: "full" },
  },
  {
    id: "ci-pipeline",
    name: "CI Pipeline",
    description: "Run tests, security scan, and performance check",
    tools: [
      "browser.navigate", "browser.interact-test", "browser.form-test",
      "browser.api-test", "browser.security-headers", "browser.performance",
    ],
    settings: { timeout: 300, parallel: true },
  },
  {
    id: "design-system",
    name: "Design System Check",
    description: "Validate design consistency across pages",
    tools: [
      "browser.navigate", "browser.design-audit", "browser.color-palette",
      "browser.typography-check", "browser.spacing-check", "browser.component-qa",
    ],
    settings: { guidelines: ["vercel", "fluent", "tasteskill"] },
  },
  {
    id: "code-review",
    name: "Code Review Pipeline",
    description: "Review code changes with security and performance checks",
    tools: [
      "browser.navigate", "browser.design-audit", "browser.security-headers",
      "browser.performance", "agent.memory",
    ],
    settings: { autoFix: false },
  },
  {
    id: "tutorial-maker",
    name: "Tutorial Creator",
    description: "Capture screenshots, generate narration, create video tutorial",
    tools: [
      "browser.navigate", "browser.screenshot", "browser.scroll",
      "video.captureFrame", "video.addCaption", "media.synthesizeSpeech",
      "doc.extractSteps", "media.renderVideo",
    ],
    settings: { outputFormat: "mp4" },
  },
  {
    id: "ticket-to-code",
    name: "Ticket to Code",
    description: "Read Jira ticket, generate implementation plan, write code",
    tools: [
      "agent.memory", "agent.skills", "browser.navigate",
      "browser.inspect", "env.run",
    ],
    preloadMemory: [
      { key: "workflow.ticket-to-code", content: "1. Read ticket 2. Plan approach 3. Implement 4. Test 5. Update ticket" },
    ],
    settings: { autoTest: true },
  },
  {
    id: "multi-agent",
    name: "Multi-Agent Sprint",
    description: "Parallel task execution with kanban orchestration",
    tools: [
      "agent.kanban", "agent.terminal", "agent.memory",
      "agent.skills", "agent.self-improve",
    ],
    settings: { maxWorkers: 4, parallel: true },
  },
];

// ─── Prompt Engine ────────────────────────────────────────────────────────────

export class PromptEngine {
  /** Get a prompt template by ID */
  getTemplate(id: string): PromptTemplate | undefined {
    return PROMPT_TEMPLATES.find(t => t.id === id);
  }

  /** Get a prompt template by slash command */
  getByCommand(command: string): PromptTemplate | undefined {
    return PROMPT_TEMPLATES.find(t => t.command === command);
  }

  /** Search templates */
  search(query: string): PromptTemplate[] {
    const q = query.toLowerCase();
    return PROMPT_TEMPLATES.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q))
    );
  }

  /** List all templates */
  list(): PromptTemplate[] {
    return [...PROMPT_TEMPLATES];
  }

  /** List templates by category */
  listByCategory(category: string): PromptTemplate[] {
    return PROMPT_TEMPLATES.filter(t => t.category === category);
  }

  /** List slash commands */
  listCommands(): SlashCommand[] {
    return [...SLASH_COMMANDS];
  }

  /** List integration presets */
  listPresets(): IntegrationPreset[] {
    return [...INTEGRATION_PRESETS];
  }

  /** Get a preset by ID */
  getPreset(id: string): IntegrationPreset | undefined {
    return INTEGRATION_PRESETS.find(p => p.id === id);
  }

  /** Render a prompt template with variables */
  render(templateId: string, variables: Record<string, string>): string {
    const template = this.getTemplate(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);

    let rendered = template.template;

    // Handle conditional blocks {{#if var}}...{{/if}}
    rendered = rendered.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
      return variables[varName] ? content.replace(new RegExp(`\\{\\{${varName}\\}\\}`, "g"), variables[varName]) : "";
    });

    // Replace remaining {{variable}} with values or empty string
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }

    // Clean up remaining empty {{}} blocks
    rendered = rendered.replace(/\{\{[^}]*\}\}/g, "");

    return rendered.trim();
  }

  /** Get SLM-compact version of a prompt */
  renderCompact(templateId: string, variables: Record<string, string>): string {
    const rendered = this.render(templateId, variables);
    // Remove markdown formatting, extra whitespace, reduce to essentials
    return rendered
      .replace(/```[\s\S]*?```/g, "[code]")
      .replace(/#{1,6}\s/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /** Get all available categories */
  getCategories(): string[] {
    return [...new Set(PROMPT_TEMPLATES.map(t => t.category))];
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _engine: PromptEngine | null = null;

export function getPromptEngine(): PromptEngine {
  if (!_engine) {
    _engine = new PromptEngine();
  }
  return _engine;
}
