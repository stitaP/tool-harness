/**
 * stitaP Agent Profile Module
 *
 * Implements the BCG AI Agent "Profile Module" - defines the agent's
 * attributes, such as its role, goals, and behavioral patterns.
 *
 * Key components:
 * - Role definition (responsibilities, scope, authority)
 * - Goal hierarchy (primary, secondary, constraints)
 * - Behavioral patterns (communication style, decision-making, risk tolerance)
 * - Identity (name, description, personality)
 * - Boundaries (what the agent can and cannot do)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentAuthority = "read-only" | "execute" | "full-control" | "supervised";
export type RiskTolerance = "conservative" | "moderate" | "aggressive";
export type CommunicationStyle = "formal" | "casual" | "technical" | "concise" | "verbose";
export type DecisionStrategy = "single-pass" | "deliberative" | "reactive" | "collaborative";

export interface AgentGoal {
  id: string;
  name: string;
  description: string;
  priority: number; // 1 = highest
  measurable: boolean;
  successCriteria: string[];
  constraints: string[];
}

export interface AgentBoundary {
  id: string;
  type: "permission" | "resource" | "scope" | "time" | "cost";
  description: string;
  allowed: boolean;
  limit?: number;
  unit?: string;
}

export interface BehavioralPattern {
  communicationStyle: CommunicationStyle;
  decisionStrategy: DecisionStrategy;
  riskTolerance: RiskTolerance;
  autonomyLevel: number; // 0-100 (0 = fully supervised, 100 = fully autonomous)
  preferredTools: string[];
  avoidTools: string[];
  escalationPolicy: "never" | "on-error" | "on-risk" | "always";
  humanCheckpoints: string[]; // steps requiring human approval
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: string;
  updatedAt: string;

  // Identity
  identity: {
    role: string;
    title: string;
    department?: string;
    team?: string;
    avatar?: string;
  };

  // Goals
  goals: AgentGoal[];

  // Behavioral patterns
  behavior: BehavioralPattern;

  // Boundaries
  boundaries: AgentBoundary[];

  // Authority
  authority: AgentAuthority;

  // Scope
  scope: {
    domains: string[]; // e.g., ["marketing", "analytics"]
    excludedDomains: string[];
    dataAccess: string[]; // e.g., ["customer-data", "analytics-reports"]
    systemAccess: string[]; // e.g., ["crm", "email", "slack"]
  };

  // Performance targets
  targets: {
    maxTokensPerTask: number;
    maxCostPerTask: number; // USD
    maxTimePerTask: number; // seconds
    qualityThreshold: number; // 0-1
    successRateTarget: number; // 0-1
  };

  // Learning preferences
  learning: {
    rememberPreferences: boolean;
    learnFromMistakes: boolean;
    adaptToUserStyle: boolean;
    feedbackLoop: boolean;
  };

  // Metadata
  metadata: Record<string, unknown>;
}

// ─── Profile Manager ────────────────────────────────────────────────────────

export class AgentProfileManager {
  private profiles = new Map<string, AgentProfile>();

  /** Create a new agent profile */
  create(profile: Omit<AgentProfile, "id" | "createdAt" | "updatedAt">): AgentProfile {
    const id = `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const fullProfile: AgentProfile = {
      ...profile,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.profiles.set(id, fullProfile);
    return fullProfile;
  }

  /** Update an existing profile */
  update(id: string, updates: Partial<AgentProfile>): AgentProfile | null {
    const profile = this.profiles.get(id);
    if (!profile) return null;

    const updated = {
      ...profile,
      ...updates,
      id, // prevent id override
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(id, updated);
    return updated;
  }

  /** Get a profile */
  get(id: string): AgentProfile | null {
    return this.profiles.get(id) ?? null;
  }

  /** List all profiles */
  list(filter?: { role?: string; domain?: string }): AgentProfile[] {
    let profiles = Array.from(this.profiles.values());
    if (filter?.role) profiles = profiles.filter((p) => p.identity.role === filter.role);
    if (filter?.domain) {
      profiles = profiles.filter((p) => p.scope.domains.includes(filter.domain!));
    }
    return profiles;
  }

  /** Validate a profile */
  validate(profile: AgentProfile): string[] {
    const errors: string[] = [];

    if (!profile.name) errors.push("Name is required");
    if (!profile.identity.role) errors.push("Role is required");
    if (profile.goals.length === 0) errors.push("At least one goal is required");
    if (profile.authority === "full-control" && profile.behavior.autonomyLevel < 80) {
      errors.push("Full-control authority requires high autonomy level");
    }
    if (profile.targets.maxCostPerTask > 10) {
      errors.push("Max cost per task exceeds $10 limit");
    }

    return errors;
  }

  /** Export profile for cross-system use */
  exportProfile(id: string): string | null {
    const profile = this.profiles.get(id);
    if (!profile) return null;
    return JSON.stringify(profile, null, 2);
  }

  /** Import profile from JSON */
  importProfile(json: string): AgentProfile | null {
    try {
      const profile = JSON.parse(json) as AgentProfile;
      const errors = this.validate(profile);
      if (errors.length > 0) {
        throw new Error(`Invalid profile: ${errors.join(", ")}`);
      }
      this.profiles.set(profile.id, profile);
      return profile;
    } catch {
      return null;
    }
  }
}

// ─── Pre-built Profiles ─────────────────────────────────────────────────────

export const PRESET_PROFILES: Omit<AgentProfile, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Data Analyst",
    description: "Analyzes data, generates insights, and creates reports",
    version: "1.0.0",
    identity: {
      role: "analyst",
      title: "Data Analyst Agent",
      department: "Analytics",
    },
    goals: [
      {
        id: "g1",
        name: "Generate insights",
        description: "Analyze data and identify patterns, trends, and anomalies",
        priority: 1,
        measurable: true,
        successCriteria: ["Report generated", "Insights documented", "Charts created"],
        constraints: ["Use only provided data", "No external API calls without approval"],
      },
      {
        id: "g2",
        name: "Create reports",
        description: "Produce clear, actionable reports for stakeholders",
        priority: 2,
        measurable: true,
        successCriteria: ["Report follows template", "All sections complete", "Executive summary included"],
        constraints: ["Max 10 pages", "Include methodology"],
      },
    ],
    behavior: {
      communicationStyle: "technical",
      decisionStrategy: "deliberative",
      riskTolerance: "conservative",
      autonomyLevel: 70,
      preferredTools: ["analytics.sql", "analytics.export_excel", "browser.screenshot"],
      avoidTools: ["browser.click", "browser.type"],
      escalationPolicy: "on-risk",
      humanCheckpoints: ["data-access", "external-sharing"],
    },
    boundaries: [
      { id: "b1", type: "scope", description: "Only analyze provided datasets", allowed: true },
      { id: "b2", type: "permission", description: "Cannot modify source data", allowed: false },
      { id: "b3", type: "cost", description: "Max $5 per analysis task", allowed: true, limit: 5, unit: "USD" },
    ],
    authority: "execute",
    scope: {
      domains: ["analytics", "reporting"],
      excludedDomains: ["marketing", "sales"],
      dataAccess: ["analytics-warehouse", "user-events"],
      systemAccess: ["slack", "email"],
    },
    targets: {
      maxTokensPerTask: 10000,
      maxCostPerTask: 5.0,
      maxTimePerTask: 300,
      qualityThreshold: 0.85,
      successRateTarget: 0.95,
    },
    learning: {
      rememberPreferences: true,
      learnFromMistakes: true,
      adaptToUserStyle: true,
      feedbackLoop: true,
    },
    metadata: {},
  },
  {
    name: "Code Reviewer",
    description: "Reviews code for quality, security, and best practices",
    version: "1.0.0",
    identity: {
      role: "reviewer",
      title: "Code Review Agent",
      department: "Engineering",
    },
    goals: [
      {
        id: "g1",
        name: "Review code quality",
        description: "Identify bugs, security issues, and code smells",
        priority: 1,
        measurable: true,
        successCriteria: ["Issues documented", "Severity classified", "Fix suggestions provided"],
        constraints: ["Focus on critical issues", "Provide actionable feedback"],
      },
    ],
    behavior: {
      communicationStyle: "technical",
      decisionStrategy: "single-pass",
      riskTolerance: "conservative",
      autonomyLevel: 60,
      preferredTools: ["browser.inspect", "code-execution"],
      avoidTools: ["browser.click"],
      escalationPolicy: "on-error",
      humanCheckpoints: ["security-critical", "production-deploy"],
    },
    boundaries: [
      { id: "b1", type: "permission", description: "Cannot modify code directly", allowed: false },
      { id: "b2", type: "scope", description: "Only review provided files", allowed: true },
    ],
    authority: "read-only",
    scope: {
      domains: ["engineering", "security"],
      excludedDomains: ["marketing"],
      dataAccess: ["source-code", "security-scans"],
      systemAccess: ["github", "jira"],
    },
    targets: {
      maxTokensPerTask: 5000,
      maxCostPerTask: 2.0,
      maxTimePerTask: 120,
      qualityThreshold: 0.9,
      successRateTarget: 0.98,
    },
    learning: {
      rememberPreferences: true,
      learnFromMistakes: true,
      adaptToUserStyle: false,
      feedbackLoop: true,
    },
    metadata: {},
  },
  {
    name: "Customer Support Agent",
    description: "Handles customer inquiries and resolves issues",
    version: "1.0.0",
    identity: {
      role: "support",
      title: "Customer Support Agent",
      department: "Customer Success",
    },
    goals: [
      {
        id: "g1",
        name: "Resolve customer issues",
        description: "Answer questions and resolve problems efficiently",
        priority: 1,
        measurable: true,
        successCriteria: ["Issue resolved", "Customer satisfied", "Ticket closed"],
        constraints: ["Escalate complex issues", "Follow brand voice"],
      },
      {
        id: "g2",
        name: "Learn from interactions",
        description: "Improve responses based on feedback",
        priority: 2,
        measurable: true,
        successCriteria: ["Feedback collected", "Patterns identified", "Responses updated"],
        constraints: ["Respect privacy", "No unauthorized changes"],
      },
    ],
    behavior: {
      communicationStyle: "casual",
      decisionStrategy: "reactive",
      riskTolerance: "moderate",
      autonomyLevel: 50,
      preferredTools: ["knowledge.search", "browser.extract"],
      avoidTools: ["code-execution"],
      escalationPolicy: "on-error",
      humanCheckpoints: ["refund", "account-change", "complaint"],
    },
    boundaries: [
      { id: "b1", type: "scope", description: "Only access customer data with consent", allowed: true },
      { id: "b2", type: "cost", description: "Max $1 per interaction", allowed: true, limit: 1, unit: "USD" },
      { id: "b3", type: "time", description: "Max 5 minutes per interaction", allowed: true, limit: 5, unit: "minutes" },
    ],
    authority: "execute",
    scope: {
      domains: ["support", "customer-success"],
      excludedDomains: ["engineering", "finance"],
      dataAccess: ["customer-data", "order-history", "knowledge-base"],
      systemAccess: ["zendesk", "slack", "email"],
    },
    targets: {
      maxTokensPerTask: 3000,
      maxCostPerTask: 1.0,
      maxTimePerTask: 300,
      qualityThreshold: 0.8,
      successRateTarget: 0.9,
    },
    learning: {
      rememberPreferences: true,
      learnFromMistakes: true,
      adaptToUserStyle: true,
      feedbackLoop: true,
    },
    metadata: {},
  },
];
