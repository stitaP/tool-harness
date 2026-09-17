/**
 * Wiki Generator
 *
 * Inspired by Andrej Karpathy's approach to documentation:
 * auto-generate structured, maintainable wiki pages from codebase
 * and git history. Produces documentation that stays in sync with code.
 *
 * Pages generated:
 * - README (auto-maintained)
 * - Architecture Overview (from file structure analysis)
 * - API Reference (from code exports)
 * - Changelog (from git commits)
 * - Contributing Guide
 * - Module Documentation (per-directory)
 * - Dependency Map
 * - Decision Log (from commit messages with ADR-style patterns)
 */

import type { GitProvider, GitCommit, GitFile } from "./git-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WikiPage {
  id: string;
  title: string;
  /** Markdown content */
  content: string;
  /** Page category */
  category: "overview" | "api" | "architecture" | "changelog" | "guide" | "module" | "decision" | "dependency";
  /** Source files this page was generated from */
  sourceFiles: string[];
  /** When generated */
  generatedAt: string;
  /** Last code commit that affected source files */
  lastCommitSha: string;
  /** Token count (for SLM context budgeting) */
  tokenEstimate: number;
}

export interface WikiConfig {
  /** Repository name */
  repoName: string;
  /** Repository description */
  repoDescription: string;
  /** Root directory to scan */
  rootDir: string;
  /** Directories to exclude */
  excludeDirs: string[];
  /** File patterns to include */
  includePatterns: string[];
  /** Max tokens per page */
  maxTokensPerPage: number;
  /** Include git blame info */
  includeBlame: boolean;
  /** Language focus (for API docs) */
  languages: string[];
}

export interface WikiStructure {
  pages: WikiPage[];
  /** Table of contents */
  toc: Array<{ title: string; pageId: string; children?: Array<{ title: string; pageId: string }> }>;
  /** Stats */
  stats: {
    totalPages: number;
    totalTokens: number;
    generatedAt: string;
    commitRange: { from: string; to: string };
  };
}

// ─── Wiki Generator ──────────────────────────────────────────────────────────

export class WikiGenerator {
  private provider: GitProvider | null;
  private config: WikiConfig;
  private pages: Map<string, WikiPage> = new Map();

  constructor(provider: GitProvider | null, config?: Partial<WikiConfig>) {
    this.provider = provider;
    this.config = {
      repoName: config?.repoName || "project",
      repoDescription: config?.repoDescription || "",
      rootDir: config?.rootDir || ".",
      excludeDirs: config?.excludeDirs || ["node_modules", ".git", "dist", "build", "__pycache__", ".next", ".cache"],
      includePatterns: config?.includePatterns || ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.rs", "*.go", "*.md", "*.json"],
      maxTokensPerPage: config?.maxTokensPerPage || 4000,
      includeBlame: config?.includeBlame || false,
      languages: config?.languages || ["typescript", "javascript"],
    };
  }

  /** Generate the full wiki from codebase */
  async generate(): Promise<WikiStructure> {
    this.pages.clear();

    // 1. README
    this.generateReadme();

    // 2. Architecture Overview
    if (this.provider) {
      await this.generateArchitecture();
    }

    // 3. Changelog from git history
    if (this.provider) {
      await this.generateChangelog();
    }

    // 4. Decision Log from commits
    if (this.provider) {
      await this.generateDecisionLog();
    }

    // 5. API Reference (from file structure)
    if (this.provider) {
      await this.generateAPIReference();
    }

    // 6. Contributing Guide
    this.generateContributingGuide();

    const pages = Array.from(this.pages.values());
    const toc = this.buildTOC(pages);

    return {
      pages,
      toc,
      stats: {
        totalPages: pages.length,
        totalTokens: pages.reduce((s, p) => s + p.tokenEstimate, 0),
        generatedAt: new Date().toISOString(),
        commitRange: { from: "", to: "" },
      },
    };
  }

  /** Generate a single page by type */
  async generatePage(type: WikiPage["category"], options?: { path?: string; ref?: string }): Promise<WikiPage | null> {
    switch (type) {
      case "overview": return this.generateReadme();
      case "architecture": return this.provider ? await this.generateArchitecture() : null;
      case "changelog": return this.provider ? await this.generateChangelog() : null;
      case "decision": return this.provider ? await this.generateDecisionLog() : null;
      case "api": return this.provider ? await this.generateAPIReference() : null;
      case "guide": return this.generateContributingGuide();
      case "module": return options?.path && this.provider ? await this.generateModuleDoc(options.path, options.ref) : null;
      default: return null;
    }
  }

  /** Get a specific page */
  getPage(id: string): WikiPage | undefined {
    return this.pages.get(id);
  }

  /** Get all pages */
  getPages(): WikiPage[] {
    return Array.from(this.pages.values());
  }

  /** Search pages */
  searchPages(query: string): WikiPage[] {
    const q = query.toLowerCase();
    return this.getPages().filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.category.includes(q)
    );
  }

  /** Export as SLM-friendly compact format */
  toSLMFormat(): string {
    const pages = this.getPages();
    const lines = [`WIKI: ${this.config.repoName}`, `${pages.length} pages`, ""];

    for (const page of pages) {
      lines.push(`## ${page.title} [${page.category}]`);
      // Truncate content for SLM
      const truncated = page.content.length > 500
        ? page.content.slice(0, 500) + "..."
        : page.content;
      lines.push(truncated);
      lines.push("");
    }

    return lines.join("\n");
  }

  // ─── Page Generators ──────────────────────────────────────────────────────

  private generateReadme(): WikiPage {
    const content = [
      `# ${this.config.repoName}`,
      "",
      this.config.repoDescription ? `${this.config.repoDescription}` : "",
      "",
      "## Quick Start",
      "",
      "```bash",
      "# Clone the repository",
      `git clone <repo-url>`,
      "",
      "# Install dependencies",
      "npm install",
      "",
      "# Start development",
      "npm run dev",
      "```",
      "",
      "## Architecture",
      "",
      "See [Architecture Overview](./architecture.md)",
      "",
      "## API Reference",
      "",
      "See [API Documentation](./api.md)",
      "",
      "## Changelog",
      "",
      "See [Changelog](./changelog.md)",
      "",
      "## Contributing",
      "",
      "See [Contributing Guide](./contributing.md)",
    ].join("\n");

    const page: WikiPage = {
      id: "readme",
      title: "README",
      content,
      category: "overview",
      sourceFiles: [],
      generatedAt: new Date().toISOString(),
      lastCommitSha: "",
      tokenEstimate: this.estimateTokens(content),
    };

    this.pages.set("readme", page);
    return page;
  }

  private async generateArchitecture(): Promise<WikiPage> {
    if (!this.provider) return this.emptyPage("architecture", "Architecture");

    const content = [
      `# Architecture: ${this.config.repoName}`,
      "",
      "## Project Structure",
      "",
    ];

    // Get file tree
    try {
      const files = await this.recursivelyListFiles("");
      const tree = this.buildFileTree(files);
      content.push(this.renderFileTree(tree, 0));
    } catch {
      content.push("*Unable to fetch file tree*");
    }

    content.push("");
    content.push("## Key Patterns");
    content.push("");
    content.push("- **Module Organization**: Features are organized by domain in top-level directories");
    content.push("- **Shared Components**: Reusable UI and utility components in `src/lib/`");
    content.push("- **Type Safety**: TypeScript strict mode with shared type definitions");
    content.push("");

    const sha = await this.getLatestCommitSha();
    const page: WikiPage = {
      id: "architecture",
      title: "Architecture Overview",
      content: content.join("\n"),
      category: "architecture",
      sourceFiles: [],
      generatedAt: new Date().toISOString(),
      lastCommitSha: sha,
      tokenEstimate: this.estimateTokens(content.join("\n")),
    };

    this.pages.set("architecture", page);
    return page;
  }

  private async generateChangelog(): Promise<WikiPage> {
    if (!this.provider) return this.emptyPage("changelog", "Changelog");

    const content = [
      `# Changelog: ${this.config.repoName}`,
      "",
      "Auto-generated from git commit history.",
      "",
    ];

    try {
      const commits = await this.provider.listCommits({ limit: 50 });

      // Group by date
      const byDate = new Map<string, GitCommit[]>();
      for (const commit of commits) {
        const date = commit.date.split("T")[0];
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(commit);
      }

      for (const [date, dayCommits] of byDate) {
        content.push(`## ${date}`);
        content.push("");
        for (const commit of dayCommits) {
          const shortSha = commit.sha.slice(0, 7);
          const files = commit.filesChanged.length > 0
            ? ` (${commit.filesChanged.length} files, +${commit.additions} -${commit.deletions})`
            : "";
          content.push(`- \`${shortSha}\` ${commit.message.split("\n")[0]}${files}`);
        }
        content.push("");
      }

      const sha = commits[0]?.sha || "";
      const page: WikiPage = {
        id: "changelog",
        title: "Changelog",
        content: content.join("\n"),
        category: "changelog",
        sourceFiles: [],
        generatedAt: new Date().toISOString(),
        lastCommitSha: sha,
        tokenEstimate: this.estimateTokens(content.join("\n")),
      };

      this.pages.set("changelog", page);
      return page;
    } catch (err) {
      content.push("*Error fetching git history*");
      return this.emptyPage("changelog", "Changelog");
    }
  }

  private async generateDecisionLog(): Promise<WikiPage> {
    if (!this.provider) return this.emptyPage("decision", "Decision Log");

    const content = [
      `# Decision Log: ${this.config.repoName}`,
      "",
      "Architecture Decision Records extracted from commit messages.",
      "",
    ];

    try {
      const commits = await this.provider.listCommits({ limit: 200 });

      // Find ADR-style commits
      const adrPatterns = [
        /(?:add|implement|introduce|switch|migrate|upgrade|replace|remove)\s+(.+)/i,
        /(?:decision|adr)[\s:]+(.+)/i,
        /(?:why|because|rationale)[\s:]+(.+)/i,
        /(?:refactor|restructure|reorganize)[\s:]+(.+)/i,
      ];

      const decisions: Array<{ sha: string; date: string; message: string; category: string }> = [];

      for (const commit of commits) {
        const msg = commit.message.split("\n")[0];
        for (const pattern of adrPatterns) {
          if (pattern.test(msg)) {
            let category = "General";
            if (/migrat|switch|replac/i.test(msg)) category = "Technology";
            else if (/refactor|restructur|reorganiz/i.test(msg)) category = "Structure";
            else if (/add|implement|introduc/i.test(msg)) category = "Feature";
            else if (/remov|deprecat/i.test(msg)) category = "Cleanup";

            decisions.push({ sha: commit.sha.slice(0, 7), date: commit.date.split("T")[0], message: msg, category });
            break;
          }
        }
      }

      if (decisions.length > 0) {
        content.push(`Found ${decisions.length} decisions:`);
        content.push("");
        for (const d of decisions.slice(0, 30)) {
          content.push(`### [${d.category}] ${d.message}`);
          content.push(`- Date: ${d.date}`);
          content.push(`- Commit: \`${d.sha}\``);
          content.push("");
        }
      } else {
        content.push("No architecture decision records found in commit history.");
      }

      const page: WikiPage = {
        id: "decisions",
        title: "Decision Log",
        content: content.join("\n"),
        category: "decision",
        sourceFiles: [],
        generatedAt: new Date().toISOString(),
        lastCommitSha: "",
        tokenEstimate: this.estimateTokens(content.join("\n")),
      };

      this.pages.set("decisions", page);
      return page;
    } catch {
      return this.emptyPage("decisions", "Decision Log");
    }
  }

  private async generateAPIReference(): Promise<WikiPage> {
    if (!this.provider) return this.emptyPage("api", "API Reference");

    const content = [
      `# API Reference: ${this.config.repoName}`,
      "",
      "Exported functions, classes, and types.",
      "",
    ];

    try {
      const files = await this.recursivelyListFiles("src");
      const codeFiles = files.filter(f =>
        f.type === "file" &&
        (f.path.endsWith(".ts") || f.path.endsWith(".tsx")) &&
        !f.path.includes(".d.ts") &&
        !f.path.includes("_generated")
      );

      for (const file of codeFiles.slice(0, 50)) {
        try {
          const fileData = await this.provider.getFile(file.path);
          const exports = this.extractExports(fileData.content);
          if (exports.length > 0) {
            content.push(`### ${file.path}`);
            content.push("");
            for (const exp of exports) {
              content.push(`- \`${exp}\``);
            }
            content.push("");
          }
        } catch {
          // Skip files that can't be read
        }
      }

      const sha = await this.getLatestCommitSha();
      const page: WikiPage = {
        id: "api",
        title: "API Reference",
        content: content.join("\n"),
        category: "api",
        sourceFiles: codeFiles.map(f => f.path),
        generatedAt: new Date().toISOString(),
        lastCommitSha: sha,
        tokenEstimate: this.estimateTokens(content.join("\n")),
      };

      this.pages.set("api", page);
      return page;
    } catch {
      return this.emptyPage("api", "API Reference");
    }
  }

  private generateContributingGuide(): WikiPage {
    const content = [
      `# Contributing to ${this.config.repoName}`,
      "",
      "## Development Setup",
      "",
      "1. Fork the repository",
      "2. Clone your fork",
      "3. Install dependencies: `npm install`",
      "4. Create a feature branch: `git checkout -b feature/my-change`",
      "5. Make your changes",
      "6. Run tests: `npm test`",
      "7. Commit with a clear message",
      "8. Push and create a PR",
      "",
      "## Code Style",
      "",
      "- TypeScript strict mode",
      "- ESLint + Prettier for formatting",
      "- Conventional Commits for messages",
      "",
      "## PR Guidelines",
      "",
      "- Keep PRs focused (one feature/fix per PR)",
      "- Include tests for new functionality",
      "- Update documentation if needed",
      "- Describe what changed and why",
    ].join("\n");

    const page: WikiPage = {
      id: "contributing",
      title: "Contributing Guide",
      content,
      category: "guide",
      sourceFiles: [],
      generatedAt: new Date().toISOString(),
      lastCommitSha: "",
      tokenEstimate: this.estimateTokens(content),
    };

    this.pages.set("contributing", page);
    return page;
  }

  private async generateModuleDoc(path: string, ref?: string): Promise<WikiPage> {
    if (!this.provider) return this.emptyPage("module", path);

    const content = [
      `# Module: ${path}`,
      "",
    ];

    try {
      const files = await this.recursivelyListFiles(path);
      content.push(`## Files (${files.length})`);
      content.push("");
      for (const f of files) {
        content.push(`- \`${f.path}\` (${f.type})`);
      }
      content.push("");

      // Read key files
      for (const file of files.filter(f => f.type === "file").slice(0, 5)) {
        try {
          const fileData = await this.provider.getFile(file.path, ref);
          const firstLines = fileData.content.split("\n").slice(0, 20).join("\n");
          content.push(`### ${file.path}`);
          content.push("```");
          content.push(firstLines);
          content.push("```");
          content.push("");
        } catch { /* skip */ }
      }
    } catch {
      content.push("*Unable to read module contents*");
    }

    const page: WikiPage = {
      id: `module-${path.replace(/\//g, "-")}`,
      title: `Module: ${path}`,
      content: content.join("\n"),
      category: "module",
      sourceFiles: [],
      generatedAt: new Date().toISOString(),
      lastCommitSha: "",
      tokenEstimate: this.estimateTokens(content.join("\n")),
    };

    this.pages.set(page.id, page);
    return page;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async recursivelyListFiles(path: string): Promise<GitFile[]> {
    if (!this.provider) return [];
    const results: GitFile[] = [];

    try {
      const items = await this.provider.listDirectory(path);
      for (const item of items) {
        if (item.type === "dir") {
          const dirName = item.path.split("/").pop() || "";
          if (this.config.excludeDirs.includes(dirName)) continue;
          const children = await this.recursivelyListFiles(item.path);
          results.push(...children);
        } else {
          const ext = item.path.split(".").pop() || "";
          const matches = this.config.includePatterns.some(p => p.replace("*.", "") === ext);
          if (matches) {
            results.push(item);
          }
        }
      }
    } catch { /* directory not accessible */ }

    return results;
  }

  private buildFileTree(files: GitFile[]): Record<string, unknown> {
    const tree: Record<string, unknown> = {};
    for (const file of files) {
      const parts = file.path.split("/");
      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = file.type;
    }
    return tree;
  }

  private renderFileTree(tree: Record<string, unknown>, depth: number): string {
    const lines: string[] = [];
    const indent = "  ".repeat(depth);
    for (const [name, value] of Object.entries(tree)) {
      if (typeof value === "string") {
        lines.push(`${indent}- \`${name}\``);
      } else {
        lines.push(`${indent}- **${name}/**`);
        lines.push(this.renderFileTree(value as Record<string, unknown>, depth + 1));
      }
    }
    return lines.join("\n");
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      // export function/class/const/type/interface
      const match = trimmed.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface)\s+(\w+)/);
      if (match) {
        exports.push(match[1]);
      }
      // export { name1, name2 }
      const reExport = trimmed.match(/^export\s+\{([^}]+)\}/);
      if (reExport) {
        for (const name of reExport[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim())) {
          if (name) exports.push(name);
        }
      }
    }
    return exports;
  }

  private async getLatestCommitSha(): Promise<string> {
    try {
      const commits = await this.provider!.listCommits({ limit: 1 });
      return commits[0]?.sha || "";
    } catch {
      return "";
    }
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // rough estimate
  }

  private emptyPage(id: string, title: string): WikiPage {
    return {
      id,
      title,
      content: `# ${title}\n\n*Unable to generate — no provider configured*`,
      category: "overview",
      sourceFiles: [],
      generatedAt: new Date().toISOString(),
      lastCommitSha: "",
      tokenEstimate: 10,
    };
  }

  private buildTOC(pages: WikiPage[]): WikiStructure["toc"] {
    const categories = ["overview", "architecture", "api", "changelog", "guide", "module", "decision"];
    const toc: WikiStructure["toc"] = [];

    for (const cat of categories) {
      const catPages = pages.filter(p => p.category === cat);
      if (catPages.length === 0) continue;

      const item: WikiStructure["toc"][0] = {
        title: cat.charAt(0).toUpperCase() + cat.slice(1),
        pageId: catPages[0].id,
        children: catPages.length > 1
          ? catPages.slice(1).map(p => ({ title: p.title, pageId: p.id }))
          : undefined,
      };
      toc.push(item);
    }

    return toc;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _wiki: WikiGenerator | null = null;

export function getWikiGenerator(provider?: GitProvider, config?: Partial<WikiConfig>): WikiGenerator {
  if (!_wiki || provider) {
    _wiki = new WikiGenerator(provider || null, config);
  }
  return _wiki;
}
