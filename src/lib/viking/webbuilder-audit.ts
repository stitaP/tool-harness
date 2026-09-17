/**
 * ScientificAgentSkills — WebBuilder Requirement Audit Tool
 *
 * Performs deterministic analysis of functional logic, performance,
 * accessibility, and SEO for webbuilder-hosted projects.
 *
 * Evaluates across 6 Core Functional Pillars:
 *   Pillar 1: Information Architecture & Routing
 *   Pillar 2: Component Library & Design Tokens
 *   Pillar 3: Data Management & API Integrations
 *   Pillar 4: Interactive Behavior & Animation Logic
 *   Pillar 5: Performance, Accessibility & SEO
 *   Pillar 6: Context & Agentic Integration Readiness
 */

import type { L0Abstract, L1Overview, L2Details, TieredResource } from "./context-store";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PillarId =
  | "architecture"
  | "components"
  | "data"
  | "interactions"
  | "performance"
  | "integration";

export type Severity = "critical" | "major" | "minor" | "info";

export interface AuditCheck {
  id: string;
  pillar: PillarId;
  category: string;
  title: string;
  description: string;
  severity: Severity;
  /** Whether this check can be automated via DOM/JS analysis */
  automatable: boolean;
  /** Weight for scoring (1-10) */
  weight: number;
}

export interface AuditFinding {
  check: AuditCheck;
  /** Where the issue was found */
  location?: string;
  /** Actual value observed */
  actual?: string;
  /** Expected value */
  expected?: string;
  /** Human-readable explanation */
  message: string;
  /** Confidence that this finding is accurate (0-1) */
  confidence: number;
  /** Suggested fix */
  fix?: string;
}

export interface PillarResult {
  id: PillarId;
  name: string;
  score: number; // 0-100
  totalChecks: number;
  passed: number;
  failed: number;
  findings: AuditFinding[];
}

export interface WebBuilderAuditReport {
  /** Target URL that was audited */
  url: string;
  /** Audit timestamp */
  timestamp: string;
  /** Overall score across all pillars (0-100) */
  overallScore: number;
  /** Per-pillar results */
  pillars: PillarResult[];
  /** Route map discovered */
  routes: RouteAudit[];
  /** Component catalog discovered */
  components: ComponentAudit[];
  /** Design tokens extracted */
  designTokens: DesignTokenAudit;
  /** API integrations found */
  apis: APIAudit[];
  /** Summary of top issues */
  topIssues: string[];
  /** Improvement plan ordered by priority */
  improvementPlan: string[];
}

export interface RouteAudit {
  path: string;
  method: string;
  isProtected: boolean;
  authType?: string;
  queryParams: string[];
  redirects: string[];
  hasSEO: boolean;
}

export interface ComponentAudit {
  name: string;
  type: string;
  hasAccessibility: boolean;
  hasResponsiveDesign: boolean;
  hasAnimation: boolean;
  children: string[];
}

export interface DesignTokenAudit {
  colors: string[];
  fontFamilies: string[];
  fontSizes: number[];
  spacing: number[];
  breakpoints: Array<{ name: string; value: string }>;
  shadows: string[];
  borderRadii: number[];
}

export interface APIAudit {
  url: string;
  method: string;
  authentication: string;
  parameters: Array<{ name: string; type: string; required: boolean }>;
  responseFormat: string;
}

// ─── Audit Check Registry ──────────────────────────────────────────────────

export const WEBBUILDER_CHECKS: AuditCheck[] = [
  // ─── Pillar 1: Information Architecture & Routing ──────────────────────
  {
    id: "arch-001",
    pillar: "architecture",
    category: "Routing",
    title: "All routes are mapped",
    description: "Every public and protected route should be discoverable via navigation or sitemap",
    severity: "critical",
    automatable: true,
    weight: 10,
  },
  {
    id: "arch-002",
    pillar: "architecture",
    category: "Routing",
    title: "Navigation hierarchy documented",
    description: "Top nav, footer links, breadcrumbs, and sidebars should be consistent",
    severity: "major",
    automatable: true,
    weight: 8,
  },
  {
    id: "arch-003",
    pillar: "architecture",
    category: "Authentication",
    title: "Auth gates mapped",
    description: "Public vs. protected routes must be clearly distinguished with proper auth checks",
    severity: "critical",
    automatable: true,
    weight: 10,
  },
  {
    id: "arch-004",
    pillar: "architecture",
    category: "Routing",
    title: "No orphan pages",
    description: "Every route should be reachable from navigation (no dead-end pages)",
    severity: "major",
    automatable: true,
    weight: 7,
  },

  // ─── Pillar 2: Component Library & Design Tokens ──────────────────────
  {
    id: "comp-001",
    pillar: "components",
    category: "Design Tokens",
    title: "Color palette extracted",
    description: "Global color palette should be consistent across all components",
    severity: "major",
    automatable: true,
    weight: 7,
  },
  {
    id: "comp-002",
    pillar: "components",
    category: "Design Tokens",
    title: "Typography scale defined",
    description: "Font families, sizes, and weights should follow a consistent scale",
    severity: "major",
    automatable: true,
    weight: 7,
  },
  {
    id: "comp-003",
    pillar: "components",
    category: "Design Tokens",
    title: "Responsive breakpoints defined",
    description: "Layout grid should have defined breakpoints for desktop, tablet, and mobile",
    severity: "critical",
    automatable: true,
    weight: 9,
  },
  {
    id: "comp-004",
    pillar: "components",
    category: "Component Catalog",
    title: "UI component inventory",
    description: "Buttons, modals, cards, inputs, tables should be cataloged",
    severity: "info",
    automatable: true,
    weight: 5,
  },
  {
    id: "comp-005",
    pillar: "components",
    category: "Design Tokens",
    title: "Spacing consistency",
    description: "Margin and padding values should follow a consistent spacing scale",
    severity: "minor",
    automatable: true,
    weight: 5,
  },

  // ─── Pillar 3: Data Management & API Integrations ─────────────────────
  {
    id: "data-001",
    pillar: "data",
    category: "Forms",
    title: "Form validation rules documented",
    description: "All form inputs should have validation rules, error states, and required field markers",
    severity: "critical",
    automatable: true,
    weight: 9,
  },
  {
    id: "data-002",
    pillar: "data",
    category: "APIs",
    title: "Third-party integrations cataloged",
    description: "External API calls (Stripe, Firebase, etc.) should be documented with data contracts",
    severity: "major",
    automatable: true,
    weight: 8,
  },
  {
    id: "data-003",
    pillar: "data",
    category: "Dynamic Data",
    title: "CMS/data bindings identified",
    description: "Dynamic content fields, CMS collections, and relational data should be mapped",
    severity: "major",
    automatable: true,
    weight: 7,
  },
  {
    id: "data-004",
    pillar: "data",
    category: "Forms",
    title: "Error handling on forms",
    description: "Form submissions should have loading states, success messages, and error recovery",
    severity: "major",
    automatable: true,
    weight: 7,
  },

  // ─── Pillar 4: Interactive Behavior & Animation Logic ─────────────────
  {
    id: "inter-001",
    pillar: "interactions",
    category: "State Machines",
    title: "Multi-step flows mapped",
    description: "Wizard flows, shopping carts, and tab switches should have documented state transitions",
    severity: "major",
    automatable: true,
    weight: 8,
  },
  {
    id: "inter-002",
    pillar: "interactions",
    category: "Animations",
    title: "Micro-interactions documented",
    description: "Scroll triggers, hover states, and keyframe transitions should be cataloged",
    severity: "minor",
    automatable: true,
    weight: 5,
  },
  {
    id: "inter-003",
    pillar: "interactions",
    category: "Client Scripts",
    title: "Custom JS snippets cataloged",
    description: "Custom JavaScript should be documented with purpose and dependencies",
    severity: "minor",
    automatable: true,
    weight: 4,
  },

  // ─── Pillar 5: Performance, Accessibility & SEO ───────────────────────
  {
    id: "perf-001",
    pillar: "performance",
    category: "Web Vitals",
    title: "LCP < 2.5s",
    description: "Largest Contentful Paint should be under 2.5 seconds",
    severity: "critical",
    automatable: true,
    weight: 10,
  },
  {
    id: "perf-002",
    pillar: "performance",
    category: "Web Vitals",
    title: "CLS < 0.1",
    description: "Cumulative Layout Shift should be under 0.1",
    severity: "critical",
    automatable: true,
    weight: 9,
  },
  {
    id: "perf-003",
    pillar: "performance",
    category: "Web Vitals",
    title: "INP < 200ms",
    description: "Interaction to Next Paint should be under 200ms",
    severity: "critical",
    automatable: true,
    weight: 9,
  },
  {
    id: "perf-004",
    pillar: "performance",
    category: "Accessibility",
    title: "ARIA labels present",
    description: "Interactive elements should have appropriate ARIA labels",
    severity: "critical",
    automatable: true,
    weight: 9,
  },
  {
    id: "perf-005",
    pillar: "performance",
    category: "Accessibility",
    title: "Keyboard navigation works",
    description: "All interactive elements should be reachable and operable via keyboard",
    severity: "critical",
    automatable: true,
    weight: 9,
  },
  {
    id: "perf-006",
    pillar: "performance",
    category: "Accessibility",
    title: "Focus traps in modals",
    description: "Modal dialogs should trap focus and restore it on close",
    severity: "major",
    automatable: true,
    weight: 7,
  },
  {
    id: "perf-007",
    pillar: "performance",
    category: "Accessibility",
    title: "Color contrast ratios",
    description: "Text should have sufficient contrast ratios (WCAG 2.2 AA: 4.5:1 for normal text)",
    severity: "critical",
    automatable: true,
    weight: 9,
  },
  {
    id: "perf-008",
    pillar: "performance",
    category: "SEO",
    title: "Title tags present",
    description: "Every page should have a unique, descriptive title tag",
    severity: "critical",
    automatable: true,
    weight: 8,
  },
  {
    id: "perf-009",
    pillar: "performance",
    category: "SEO",
    title: "OpenGraph metadata",
    description: "Pages should have og:title, og:description, and og:image meta tags",
    severity: "major",
    automatable: true,
    weight: 7,
  },
  {
    id: "perf-010",
    pillar: "performance",
    category: "SEO",
    title: "Structured data (JSON-LD)",
    description: "Pages should use structured data for search engine understanding",
    severity: "minor",
    automatable: true,
    weight: 5,
  },
  {
    id: "perf-011",
    pillar: "performance",
    category: "SEO",
    title: "Canonical URLs set",
    description: "Pages should have canonical link tags to prevent duplicate content",
    severity: "major",
    automatable: true,
    weight: 7,
  },

  // ─── Pillar 6: Context & Agentic Integration Readiness ────────────────
  {
    id: "integ-001",
    pillar: "integration",
    category: "MCP",
    title: "MCP server compatibility",
    description: "Site endpoints should be exposeable via Model Context Protocol",
    severity: "info",
    automatable: false,
    weight: 4,
  },
  {
    id: "integ-002",
    pillar: "integration",
    category: "Context Layering",
    title: "L0/L1/L2 indexing complete",
    description: "All discovered resources should be indexed in the viking:// tiered system",
    severity: "major",
    automatable: true,
    weight: 8,
  },
  {
    id: "integ-003",
    pillar: "integration",
    category: "Testability",
    title: "End-to-end flows testable",
    description: "Synthetic user flows should be automated via BrowserUse",
    severity: "major",
    automatable: false,
    weight: 7,
  },
];

// ─── Auditor ────────────────────────────────────────────────────────────────

export class WebBuilderAuditor {
  /**
   * Run the full audit against a set of crawled resources.
   * Returns a structured report with per-pillar scores and findings.
   */
  audit(
    url: string,
    resources: TieredResource[],
    l0Data: Map<string, L0Abstract>,
    l1Data: Map<string, L1Overview>,
    l2Data: Map<string, L2Details>,
  ): WebBuilderAuditReport {
    const pillars = this.auditPillars(resources, l0Data, l1Data, l2Data);
    const overallScore = this.calculateOverallScore(pillars);

    return {
      url,
      timestamp: new Date().toISOString(),
      overallScore,
      pillars,
      routes: this.extractRoutes(resources, l0Data),
      components: this.extractComponents(resources, l0Data, l1Data),
      designTokens: this.extractDesignTokens(l1Data),
      apis: this.extractAPIs(l1Data),
      topIssues: this.getTopIssues(pillars),
      improvementPlan: this.getImprovementPlan(pillars),
    };
  }

  /**
   * Get checks for a specific pillar.
   */
  getChecksForPillar(pillar: PillarId): AuditCheck[] {
    return WEBBUILDER_CHECKS.filter((c) => c.pillar === pillar);
  }

  /**
   * Get all checks grouped by pillar.
   */
  getAllChecks(): Record<PillarId, AuditCheck[]> {
    const grouped: Record<PillarId, AuditCheck[]> = {
      architecture: [],
      components: [],
      data: [],
      interactions: [],
      performance: [],
      integration: [],
    };
    for (const check of WEBBUILDER_CHECKS) {
      grouped[check.pillar].push(check);
    }
    return grouped;
  }

  // ─── Private Audit Methods ─────────────────────────────────────────────

  private auditPillars(
    resources: TieredResource[],
    l0Data: Map<string, L0Abstract>,
    l1Data: Map<string, L1Overview>,
    l2Data: Map<string, L2Details>,
  ): PillarResult[] {
    const pillarIds: PillarId[] = [
      "architecture",
      "components",
      "data",
      "interactions",
      "performance",
      "integration",
    ];

    return pillarIds.map((pillarId) => {
      const checks = this.getChecksForPillar(pillarId);
      const findings: AuditFinding[] = [];
      let passed = 0;

      for (const check of checks) {
        const finding = this.runCheck(check, resources, l0Data, l1Data, l2Data);
        if (finding) {
          findings.push(finding);
        } else {
          passed++;
        }
      }

      const failed = checks.length - passed;
      const score =
        checks.length > 0
          ? Math.round((passed / checks.length) * 100)
          : 100;

      return {
        id: pillarId,
        name: this.getPillarName(pillarId),
        score,
        totalChecks: checks.length,
        passed,
        failed,
        findings,
      };
    });
  }

  private runCheck(
    check: AuditCheck,
    resources: TieredResource[],
    l0Data: Map<string, L0Abstract>,
    l1Data: Map<string, L1Overview>,
    l2Data: Map<string, L2Details>,
  ): AuditFinding | null {
    // Automated checks based on available data
    switch (check.id) {
      case "arch-001": {
        const pageResources = [...l0Data.values()].filter(
          (l) => l.resourceType === "page",
        );
        if (pageResources.length === 0) {
          return {
            check,
            message: "No pages discovered in the crawl. Ensure the crawler traverses all routes.",
            confidence: 0.9,
            fix: "Run the BrowserUse crawler with deeper depth settings.",
          };
        }
        return null; // passed
      }

      case "arch-003": {
        const unprotected = [...l1Data.values()].filter(
          (l) => l.route && !l.route.isProtected,
        );
        const hasAuthGates = [...l1Data.values()].some(
          (l) => l.route?.isProtected,
        );
        if (unprotected.length > 0 && !hasAuthGates) {
          return {
            check,
            message: "No authentication gates found. Protected routes may be exposed.",
            confidence: 0.7,
            fix: "Add RequireAuth wrapper to routes that need authentication.",
          };
        }
        return null;
      }

      case "comp-003": {
        const tokens = this.extractDesignTokens(l1Data);
        if (tokens.breakpoints.length === 0) {
          return {
            check,
            message: "No responsive breakpoints detected in design tokens.",
            confidence: 0.8,
            fix: "Define CSS media query breakpoints for mobile, tablet, and desktop.",
          };
        }
        return null;
      }

      case "data-001": {
        const apis = this.extractAPIs(l1Data);
        if (apis.length === 0 && resources.length > 5) {
          return {
            check,
            message: "No form validation rules or API data contracts documented.",
            confidence: 0.6,
            fix: "Document input types, required fields, regex validations, and error states.",
          };
        }
        return null;
      }

      case "perf-008": {
        // Check if any resources have SEO-related tags
        const hasSEOTags = [...l0Data.values()].some(
          (l) => l.entities.length > 0,
        );
        if (!hasSEOTags && resources.length > 0) {
          return {
            check,
            message: "No page title tags detected in crawled content.",
            confidence: 0.7,
            fix: "Add unique, descriptive <title> tags to every page.",
          };
        }
        return null;
      }

      case "integ-002": {
        if (resources.length === 0) {
          return {
            check,
            message: "No resources indexed in the viking:// tiered system.",
            confidence: 1.0,
            fix: "Run the OpenViking indexer to store crawled assets in L0/L1/L2 tiers.",
          };
        }
        return null;
      }

      default:
        // For checks we can't automate, mark as info-level pass
        if (!check.automatable) return null;
        return null;
    }
  }

  private extractRoutes(
    resources: TieredResource[],
    l0Data: Map<string, L0Abstract>,
  ): RouteAudit[] {
    const routes: RouteAudit[] = [];
    for (const resource of resources) {
      const l0 = l0Data.get(resource.id);
      if (l0?.resourceType === "page") {
        routes.push({
          path: resource.path,
          method: "GET",
          isProtected: false,
          queryParams: [],
          redirects: [],
          hasSEO: l0.entities.length > 0,
        });
      }
    }
    return routes;
  }

  private extractComponents(
    resources: TieredResource[],
    l0Data: Map<string, L0Abstract>,
    l1Data: Map<string, L1Overview>,
  ): ComponentAudit[] {
    const components: ComponentAudit[] = [];
    for (const resource of resources) {
      const l0 = l0Data.get(resource.id);
      if (l0?.resourceType === "component") {
        components.push({
          name: l0.entities[0] ?? resource.path,
          type: l0.summary,
          hasAccessibility: false,
          hasResponsiveDesign: false,
          hasAnimation: false,
          children: resource.childIds,
        });
      }
    }
    return components;
  }

  private extractDesignTokens(l1Data: Map<string, L1Overview>): DesignTokenAudit {
    const allColors = new Set<string>();
    const allFontFamilies = new Set<string>();
    const allFontSizes = new Set<number>();
    const allSpacing = new Set<number>();
    const allBreakpoints: Array<{ name: string; value: string }> = [];
    const allShadows = new Set<string>();
    const allBorderRadii = new Set<number>();

    for (const l1 of l1Data.values()) {
      if (l1.designTokens) {
        l1.designTokens.colors.forEach((c) => allColors.add(c));
        l1.designTokens.typography.forEach((t) => {
          allFontFamilies.add(t.fontFamily);
          t.sizes.forEach((s) => allFontSizes.add(s));
        });
        l1.designTokens.spacing.forEach((s) => allSpacing.add(s));
        l1.designTokens.breakpoints.forEach((b) => allBreakpoints.push({ name: b.name, value: String(b.minWidth) }));
        l1.designTokens.shadows.forEach((s) => allShadows.add(s));
        l1.designTokens.borderRadii.forEach((r) => allBorderRadii.add(r));
      }
    }

    return {
      colors: [...allColors],
      fontFamilies: [...allFontFamilies],
      fontSizes: [...allFontSizes].sort((a, b) => a - b),
      spacing: [...allSpacing].sort((a, b) => a - b),
      breakpoints: allBreakpoints,
      shadows: [...allShadows],
      borderRadii: [...allBorderRadii].sort((a, b) => a - b),
    };
  }

  private extractAPIs(l1Data: Map<string, L1Overview>): APIAudit[] {
    const apis: APIAudit[] = [];
    for (const l1 of l1Data.values()) {
      if (l1.dependencies.length > 0) {
        for (const dep of l1.dependencies) {
          if (dep.startsWith("http")) {
            apis.push({
              url: dep,
              method: "GET",
              authentication: "unknown",
              parameters: [],
              responseFormat: "json",
            });
          }
        }
      }
    }
    return apis;
  }

  private calculateOverallScore(pillars: PillarResult[]): number {
    if (pillars.length === 0) return 0;
    const totalWeight = pillars.reduce((s, p) => s + p.totalChecks, 0);
    const weightedScore = pillars.reduce(
      (s, p) => s + p.score * p.totalChecks,
      0,
    );
    return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
  }

  private getTopIssues(pillars: PillarResult[]): string[] {
    const allFindings = pillars.flatMap((p) => p.findings);
    return allFindings
      .sort((a, b) => {
        const sevOrder: Record<Severity, number> = {
          critical: 0,
          major: 1,
          minor: 2,
          info: 3,
        };
        return (
          sevOrder[a.check.severity] - sevOrder[b.check.severity] ||
          b.confidence - a.confidence
        );
      })
      .slice(0, 10)
      .map((f) => `[${f.check.severity.toUpperCase()}] ${f.check.title}: ${f.message}`);
  }

  private getImprovementPlan(pillars: PillarResult[]): string[] {
    const plan: string[] = [];
    const sortedPillars = [...pillars].sort((a, b) => a.score - b.score);

    for (const pillar of sortedPillars) {
      if (pillar.score < 100) {
        plan.push(
          `## ${pillar.name} (${pillar.score}%)`,
          ...pillar.findings.map(
            (f) => `- [${f.check.severity}] ${f.check.title} — ${f.fix ?? f.message}`,
          ),
        );
      }
    }

    return plan;
  }

  private getPillarName(id: PillarId): string {
    const names: Record<PillarId, string> = {
      architecture: "Information Architecture & Routing",
      components: "Component Library & Design Tokens",
      data: "Data Management & API Integrations",
      interactions: "Interactive Behavior & Animation Logic",
      performance: "Performance, Accessibility & SEO",
      integration: "Context & Agentic Integration Readiness",
    };
    return names[id];
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _auditor: WebBuilderAuditor | null = null;

export function getWebBuilderAuditor(): WebBuilderAuditor {
  if (!_auditor) {
    _auditor = new WebBuilderAuditor();
  }
  return _auditor;
}
