/**
 * OpenViking — Agent Context Database (viking://)
 *
 * A 3-tier hierarchical context store that organizes extracted assets,
 * DOM trees, routes, and specs to prevent LLM context window overflow.
 *
 * Tiers:
 *   L0 (Abstract):  ~100-token summaries per route/component
 *   L1 (Overview):  ~2,000-token component trees, data models, interaction maps
 *   L2 (Details):   Full raw HTML/CSS/JS payloads and network traces
 *
 * Agents always read L0 first, then L1 for context, and only load L2
 * when deep editing or code migration is required.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ContextTier = "L0" | "L1" | "L2";

export interface TieredResource {
  id: string;
  path: string;
  /** Virtual URI: viking://resources/{project}/{path} */
  vikingUri: string;
  tier: ContextTier;
  /** Approximate token count for this resource at this tier */
  tokenCount: number;
  /** MIME type of the resource */
  mimeType: string;
  /** When this resource was indexed */
  indexedAt: string;
  /** Tags for filtering and search */
  tags: string[];
  /** Source of the resource (crawl, manual, generated) */
  source: "crawl" | "manual" | "generated" | "imported";
  /** Parent resource ID (for hierarchical nesting) */
  parentId?: string;
  /** Children resource IDs */
  childIds: string[];
}

export interface L0Abstract {
  /** Short summary (~100 tokens) */
  summary: string;
  /** Resource type classification */
  resourceType: "page" | "component" | "api" | "asset" | "config" | "documentation";
  /** Complexity score 1-10 */
  complexity: number;
  /** Key entities mentioned */
  entities: string[];
}

export interface L1Overview {
  /** Component/element tree (~2,000 tokens) */
  componentTree: string;
  /** Data models found */
  dataModels: DataModel[];
  /** Interaction maps (click flows, state transitions) */
  interactions: Interaction[];
  /** External dependencies */
  dependencies: string[];
  /** Design tokens extracted */
  designTokens: DesignTokens;
  /** Route information */
  route?: RouteInfo;
}

export interface L2Details {
  /** Full raw content (HTML/CSS/JS) */
  rawContent: string;
  /** DOM snapshot (if available) */
  domSnapshot?: unknown;
  /** Network traces */
  networkTraces: NetworkTrace[];
  /** CSS rules extracted */
  cssRules: string[];
  /** JavaScript behaviors */
  jsBehaviors: string[];
  /** Full file hash for change detection */
  contentHash: string;
}

export interface DataModel {
  name: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
  relationships: Array<{ target: string; type: string }>;
}

export interface Interaction {
  trigger: string;
  action: string;
  target: string;
  description: string;
}

export interface DesignTokens {
  colors: string[];
  typography: Array<{ fontFamily: string; sizes: number[] }>;
  spacing: number[];
  breakpoints: Array<{ name: string; minWidth: number }>;
  shadows: string[];
  borderRadii: number[];
}

export interface RouteInfo {
  path: string;
  method: string;
  params: string[];
  isProtected: boolean;
  authProvider?: string;
}

export interface NetworkTrace {
  url: string;
  method: string;
  status: number;
  duration: number;
  requestSize: number;
  responseSize: number;
  timestamp: string;
}

export interface VikingProject {
  id: string;
  name: string;
  baseUrl: string;
  createdAt: string;
  lastCrawledAt: string;
  resourceCount: number;
  totalTokens: number;
  /** L0 summary of the entire project */
  projectSummary: string;
}

export interface ContextQuery {
  /** Search term */
  search?: string;
  /** Filter by tier */
  tier?: ContextTier;
  /** Filter by resource type */
  resourceType?: L0Abstract["resourceType"];
  /** Filter by tags */
  tags?: string[];
  /** Maximum tokens to return (budget) */
  tokenBudget?: number;
  /** Maximum results */
  limit?: number;
}

// ─── Context Store ─────────────────────────────────────────────────────────

export class VikingContextStore {
  private projects = new Map<string, VikingProject>();
  private resources = new Map<string, TieredResource>();
  private l0Data = new Map<string, L0Abstract>();
  private l1Data = new Map<string, L1Overview>();
  private l2Data = new Map<string, L2Details>();

  // ─── Project Management ──────────────────────────────────────────────────

  createProject(name: string, baseUrl: string): VikingProject {
    const id = `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const project: VikingProject = {
      id,
      name,
      baseUrl,
      createdAt: new Date().toISOString(),
      lastCrawledAt: new Date().toISOString(),
      resourceCount: 0,
      totalTokens: 0,
      projectSummary: "",
    };
    this.projects.set(id, project);

    // Create root directory resource
    this.addResource(id, `viking://resources/${name}/`, "L0", "documentation", {
      summary: `Project: ${name} — ${baseUrl}`,
      resourceType: "page",
      complexity: 1,
      entities: [name],
    });

    return project;
  }

  getProject(id: string): VikingProject | undefined {
    return this.projects.get(id);
  }

  listProjects(): VikingProject[] {
    return [...this.projects.values()];
  }

  // ─── Resource Management ─────────────────────────────────────────────────

  addResource(
    projectId: string,
    path: string,
    tier: ContextTier,
    resourceType: L0Abstract["resourceType"],
    l0: L0Abstract,
    l1?: L1Overview,
    l2?: L2Details,
  ): TieredResource {
    const id = `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const project = this.projects.get(projectId);

    const resource: TieredResource = {
      id,
      path,
      vikingUri: `viking://resources/${project?.name ?? projectId}/${path}`,
      tier,
      tokenCount: this.estimateTokens(tier, l0, l1, l2),
      mimeType: "text/html",
      indexedAt: new Date().toISOString(),
      tags: l0.entities.map((e) => e.toLowerCase()),
      source: "crawl",
      childIds: [],
    };

    this.resources.set(id, resource);
    this.l0Data.set(id, l0);
    if (l1) this.l1Data.set(id, l1);
    if (l2) this.l2Data.set(id, l2);

    // Update project stats
    if (project) {
      project.resourceCount++;
      project.totalTokens += resource.tokenCount;
      project.lastCrawledAt = new Date().toISOString();
    }

    return resource;
  }

  getResource(id: string): TieredResource | undefined {
    return this.resources.get(id);
  }

  getL0(id: string): L0Abstract | undefined {
    return this.l0Data.get(id);
  }

  getL1(id: string): L1Overview | undefined {
    return this.l1Data.get(id);
  }

  getL2(id: string): L2Details | undefined {
    return this.l2Data.get(id);
  }

  /**
   * Smart tier loading: given a resource ID, load only the tier needed.
   * Returns the data at the requested tier or the highest available.
   */
  loadTier(id: string, requestedTier: ContextTier): {
    tier: ContextTier;
    l0: L0Abstract;
    l1?: L1Overview;
    l2?: L2Details;
  } | undefined {
    const l0 = this.l0Data.get(id);
    if (!l0) return undefined;

    const result: { tier: ContextTier; l0: L0Abstract; l1?: L1Overview; l2?: L2Details } = {
      tier: "L0",
      l0,
    };

    if (requestedTier === "L1" || requestedTier === "L2") {
      const l1 = this.l1Data.get(id);
      if (l1) {
        result.tier = "L1";
        result.l1 = l1;
      }
    }

    if (requestedTier === "L2") {
      const l2 = this.l2Data.get(id);
      if (l2) {
        result.tier = "L2";
        result.l2 = l2;
      }
    }

    return result;
  }

  // ─── Query & Search ──────────────────────────────────────────────────────

  /**
   * Query resources with budget-aware loading.
   * Always starts at L0, upgrades to L1 if budget allows, L2 only if explicitly requested.
   */
  query(q: ContextQuery): Array<{
    resource: TieredResource;
    l0: L0Abstract;
    l1?: L1Overview;
    l2?: L2Details;
  }> {
    let results = [...this.resources.values()];

    // Apply filters
    if (q.tier) {
      results = results.filter((r) => r.tier === q.tier);
    }
    if (q.resourceType) {
      results = results.filter((r) => {
        const l0 = this.l0Data.get(r.id);
        return l0?.resourceType === q.resourceType;
      });
    }
    if (q.tags && q.tags.length > 0) {
      results = results.filter((r) => q.tags!.some((t) => r.tags.includes(t)));
    }
    if (q.search) {
      const searchLower = q.search.toLowerCase();
      results = results.filter((r) => {
        const l0 = this.l0Data.get(r.id);
        return (
          r.path.toLowerCase().includes(searchLower) ||
          r.tags.some((t) => t.includes(searchLower)) ||
          (l0?.summary.toLowerCase().includes(searchLower) ?? false)
        );
      });
    }

    // Budget-aware tier loading
    const budget = q.tokenBudget ?? 4000;
    const limit = q.limit ?? 20;
    const output: Array<{
      resource: TieredResource;
      l0: L0Abstract;
      l1?: L1Overview;
      l2?: L2Details;
    }> = [];

    let usedTokens = 0;

    for (const resource of results) {
      if (output.length >= limit) break;

      const l0 = this.l0Data.get(resource.id);
      if (!l0) continue;

      const l0Cost = resource.tokenCount * 0.1; // L0 is ~10% of total
      if (usedTokens + l0Cost > budget) break;

      const entry: { resource: TieredResource; l0: L0Abstract; l1?: L1Overview; l2?: L2Details } = {
        resource,
        l0,
      };
      usedTokens += l0Cost;

      // Try to add L1 if budget allows
      const l1 = this.l1Data.get(resource.id);
      if (l1) {
        const l1Cost = resource.tokenCount * 0.3; // L1 is ~30% of total
        if (usedTokens + l1Cost <= budget) {
          entry.l1 = l1;
          usedTokens += l1Cost;
        }
      }

      output.push(entry);
    }

    return output;
  }

  // ─── Context Building ────────────────────────────────────────────────────

  /**
   * Build an SLM-friendly context block from queried resources.
   * Respects the token budget strictly.
   */
  buildContext(query: string, tokenBudget = 4000): string {
    const results = this.query({ search: query, tokenBudget });
    if (results.length === 0) return "";

    const lines: string[] = [];
    let charCount = 0;
    const charBudget = tokenBudget * 4; // rough chars-per-token

    for (const { resource, l0, l1 } of results) {
      // L0 summary
      const l0Line = `[${resource.vikingUri}] ${l0.summary}`;
      if (charCount + l0Line.length > charBudget) break;
      lines.push(l0Line);
      charCount += l0Line.length;

      // L1 overview (if loaded)
      if (l1) {
        const l1Line = `  Components: ${l1.componentTree.slice(0, 200)}`;
        if (charCount + l1Line.length <= charBudget) {
          lines.push(l1Line);
          charCount += l1Line.length;
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate the L0 abstract summary of the entire project.
   */
  summarizeProject(projectId: string): string {
    const project = this.projects.get(projectId);
    if (!project) return "";

    const resources = [...this.resources.values()].filter((r) =>
      [...this.l0Data.entries()].some(([id]) => id === r.id),
    );

    const resourceTypes = new Map<string, number>();
    let totalTokens = 0;

    for (const r of resources) {
      const l0 = this.l0Data.get(r.id);
      if (l0) {
        resourceTypes.set(l0.resourceType, (resourceTypes.get(l0.resourceType) ?? 0) + 1);
        totalTokens += r.tokenCount;
      }
    }

    const breakdown = [...resourceTypes.entries()]
      .map(([type, count]) => `${count} ${type}`)
      .join(", ");

    return (
      `Project: ${project.name} (${project.baseUrl})\n` +
      `${resources.length} resources indexed (${totalTokens} tokens)\n` +
      `Breakdown: ${breakdown}`
    );
  }

  // ─── Import/Export ────────────────────────────────────────────────────────

  exportProject(projectId: string): {
    project: VikingProject;
    resources: TieredResource[];
    l0: Array<{ id: string; data: L0Abstract }>;
    l1: Array<{ id: string; data: L1Overview }>;
    l2: Array<{ id: string; data: L2Details }>;
  } {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const resourceIds = [...this.resources.values()]
      .filter((r) => r.vikingUri.includes(project.name))
      .map((r) => r.id);

    return {
      project,
      resources: resourceIds.map((id) => this.resources.get(id)!).filter(Boolean),
      l0: resourceIds
        .map((id) => ({ id, data: this.l0Data.get(id)! }))
        .filter((e) => e.data),
      l1: resourceIds
        .map((id) => ({ id, data: this.l1Data.get(id)! }))
        .filter((e) => e.data),
      l2: resourceIds
        .map((id) => ({ id, data: this.l2Data.get(id)! }))
        .filter((e) => e.data),
    };
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  stats(): {
    projects: number;
    totalResources: number;
    totalTokens: number;
    byTier: Record<ContextTier, number>;
    byType: Record<string, number>;
  } {
    let totalTokens = 0;
    const byTier: Record<ContextTier, number> = { L0: 0, L1: 0, L2: 0 };
    const byType: Record<string, number> = {};

    for (const resource of this.resources.values()) {
      totalTokens += resource.tokenCount;
      byTier[resource.tier]++;
      const l0 = this.l0Data.get(resource.id);
      if (l0) {
        byType[l0.resourceType] = (byType[l0.resourceType] ?? 0) + 1;
      }
    }

    return {
      projects: this.projects.size,
      totalResources: this.resources.size,
      totalTokens,
      byTier,
      byType,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private estimateTokens(
    tier: ContextTier,
    l0: L0Abstract,
    l1?: L1Overview,
    l2?: L2Details,
  ): number {
    // Rough token estimation: 1 token ≈ 4 chars
    const l0Tokens = Math.ceil(l0.summary.length / 4) + 20;

    if (tier === "L0") return l0Tokens;

    const l1Tokens = l1
      ? Math.ceil(l1.componentTree.length / 4) +
        l1.dataModels.length * 50 +
        l1.interactions.length * 30 +
        100
      : 0;

    if (tier === "L1") return l0Tokens + l1Tokens;

    const l2Tokens = l2 ? Math.ceil(l2.rawContent.length / 4) + l2.networkTraces.length * 20 : 0;
    return l0Tokens + l1Tokens + l2Tokens;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _store: VikingContextStore | null = null;

export function getVikingStore(): VikingContextStore {
  if (!_store) {
    _store = new VikingContextStore();
  }
  return _store;
}
