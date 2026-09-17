/**
 * Agent Skills System
 *
 * Autonomous skill creation and management. When the agent completes
 * a complex task, it can extract the procedure as a reusable skill.
 * Skills are versioned, searchable, and improve through use.
 *
 * Each skill contains:
 * - Name and description
 * - Step-by-step procedure (compact for SLM)
 * - Prerequisites and inputs
 * - Expected outputs
 * - Success criteria
 * - Usage count and success rate
 * - Optimised prompts for SLM execution
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillStep {
  /** Step number (1-based) */
  order: number;
  /** What this step does (SLM-friendly instruction) */
  action: string;
  /** Tool to use for this step (if any) */
  toolId?: string;
  /** Expected input for the tool */
  inputTemplate?: Record<string, string>;
  /** How to verify this step succeeded */
  verify?: string;
  /** What to do if this step fails */
  fallback?: string;
}

export interface Skill {
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description (one line) */
  description: string;
  /** Category */
  category: "browser" | "testing" | "design" | "capture" | "document" | "code" | "data" | "custom";
  /** Version (semver) */
  version: string;
  /** Step-by-step procedure */
  steps: SkillStep[];
  /** What's needed before running this skill */
  prerequisites: string[];
  /** Input parameters the skill expects */
  inputs: Array<{ name: string; type: string; description: string; required: boolean }>;
  /** What the skill produces */
  outputs: string[];
  /** Success criteria */
  successCriteria: string[];
  /** Usage statistics */
  stats: {
    timesUsed: number;
    timesSucceeded: number;
    avgDurationMs: number;
    lastUsedAt: string;
  };
  /** Tags for search */
  tags: string[];
  /** When created */
  createdAt: string;
  /** When last updated */
  updatedAt: string;
  /** Source: where this skill was extracted from */
  source?: {
    type: "auto-extracted" | "user-created" | "imported";
    conversationId?: string;
    taskId?: string;
  };
  /** Compact SLM prompt for executing this skill */
  slmPrompt: string;
  /** Confidence in this skill's effectiveness */
  confidence: number;
}

export interface SkillRun {
  id: string;
  skillId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed" | "partial";
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  stepsCompleted: number;
  totalSteps: number;
  errors: Array<{ stepOrder: number; error: string }>;
  durationMs?: number;
}

// ─── Skill Manager ────────────────────────────────────────────────────────────

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private runs: SkillRun[] = [];

  /** Create a skill manually */
  create(skill: Omit<Skill, "id" | "createdAt" | "updatedAt" | "stats" | "confidence" | "slmPrompt">): Skill {
    const id = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const fullSkill: Skill = {
      ...skill,
      id,
      version: skill.version || "1.0.0",
      createdAt: now,
      updatedAt: now,
      stats: { timesUsed: 0, timesSucceeded: 0, avgDurationMs: 0, lastUsedAt: "" },
      confidence: 0.5,
      slmPrompt: this.buildSLMPrompt(skill),
    };

    this.skills.set(id, fullSkill);
    return fullSkill;
  }

  /** Auto-extract a skill from a completed task */
  extractFromTask(task: {
    name: string;
    description: string;
    category: Skill["category"];
    steps: Array<{ action: string; toolId?: string; input?: Record<string, string> }>;
    tags: string[];
    sourceId?: string;
  }): Skill {
    const skillSteps: SkillStep[] = task.steps.map((s, i) => ({
      order: i + 1,
      action: s.action,
      toolId: s.toolId,
      inputTemplate: s.input,
      verify: "Check output is non-empty and no errors",
    }));

    return this.create({
      name: task.name,
      description: task.description,
      category: task.category,
      version: "1.0.0",
      steps: skillSteps,
      prerequisites: [],
      inputs: [],
      outputs: ["result"],
      successCriteria: ["All steps completed without errors"],
      tags: task.tags,
      source: { type: "auto-extracted", taskId: task.sourceId },
    });
  }

  /** Get a skill by ID */
  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /** List all skills */
  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /** Search skills */
  search(query: string): Skill[] {
    const q = query.toLowerCase();
    return this.list().filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q)) ||
      s.category.includes(q)
    );
  }

  /** Get skills by category */
  getByCategory(category: Skill["category"]): Skill[] {
    return this.list().filter(s => s.category === category);
  }

  /** Get most-used skills */
  getMostUsed(limit = 10): Skill[] {
    return this.list()
      .sort((a, b) => b.stats.timesUsed - a.stats.timesUsed)
      .slice(0, limit);
  }

  /** Get most-successful skills */
  getMostSuccessful(limit = 10): Skill[] {
    return this.list()
      .filter(s => s.stats.timesUsed > 0)
      .sort((a, b) => {
        const rateA = a.stats.timesSucceeded / a.stats.timesUsed;
        const rateB = b.stats.timesSucceeded / b.stats.timesUsed;
        return rateB - rateA;
      })
      .slice(0, limit);
  }

  /** Record a skill run */
  recordRun(run: Omit<SkillRun, "id">): SkillRun {
    const fullRun: SkillRun = {
      ...run,
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.runs.push(fullRun);

    // Update skill stats
    const skill = this.skills.get(run.skillId);
    if (skill) {
      skill.stats.timesUsed++;
      if (run.status === "completed") skill.stats.timesSucceeded++;
      skill.stats.lastUsedAt = run.completedAt || new Date().toISOString();

      // Update average duration
      const totalDuration = skill.stats.avgDurationMs * (skill.stats.timesUsed - 1) + (run.durationMs || 0);
      skill.stats.avgDurationMs = totalDuration / skill.stats.timesUsed;

      // Update confidence based on success rate
      const successRate = skill.stats.timesSucceeded / skill.stats.timesUsed;
      skill.confidence = Math.min(1.0, successRate * 0.8 + 0.2);

      skill.updatedAt = new Date().toISOString();
    }

    return fullRun;
  }

  /** Get run history for a skill */
  getRuns(skillId: string, limit = 20): SkillRun[] {
    return this.runs
      .filter(r => r.skillId === skillId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  /** Refine a skill based on usage patterns */
  refine(skillId: string): { refined: boolean; changes: string[] } {
    const skill = this.skills.get(skillId);
    if (!skill) return { refined: false, changes: [] };

    const changes: string[] = [];
    const runs = this.getRuns(skillId, 50);

    if (runs.length < 3) return { refined: false, changes: ["Not enough usage data (need 3+ runs)"] };

    // Find failing steps
    const stepFailures = new Map<number, number>();
    for (const run of runs) {
      for (const err of run.errors) {
        stepFailures.set(err.stepOrder, (stepFailures.get(err.stepOrder) || 0) + 1);
      }
    }

    // Flag steps that fail >30% of the time
    for (const [stepOrder, failCount] of stepFailures) {
      const failRate = failCount / runs.length;
      if (failRate > 0.3) {
        const step = skill.steps.find(s => s.order === stepOrder);
        if (step) {
          changes.push(`Step ${stepOrder} fails ${(failRate * 100).toFixed(0)}% of the time — add fallback`);
          if (!step.fallback) {
            step.fallback = "Retry once, then skip with warning";
          }
        }
      }
    }

    // Update average duration
    const durations = runs.filter(r => r.durationMs).map(r => r.durationMs!);
    if (durations.length > 0) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      if (Math.abs(avg - skill.stats.avgDurationMs) > skill.stats.avgDurationMs * 0.3) {
        skill.stats.avgDurationMs = avg;
        changes.push(`Updated avg duration to ${Math.round(avg)}ms`);
      }
    }

    // Bump version if changes were made
    if (changes.length > 0) {
      const parts = skill.version.split(".").map(Number);
      parts[1]++;
      skill.version = parts.join(".");
      skill.updatedAt = new Date().toISOString();
      skill.slmPrompt = this.buildSLMPrompt(skill);
    }

    return { refined: changes.length > 0, changes };
  }

  /** Delete a skill */
  delete(id: string): boolean {
    return this.skills.delete(id);
  }

  /** Get stats */
  stats() {
    const skills = this.list();
    return {
      totalSkills: skills.length,
      byCategory: skills.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc; }, {} as Record<string, number>),
      totalRuns: this.runs.length,
      avgConfidence: skills.length > 0 ? skills.reduce((s, sk) => s + sk.confidence, 0) / skills.length : 0,
    };
  }

  /** Export all skills as JSON */
  toJSON(): Skill[] {
    return this.list().map(s => ({ ...s }));
  }

  /** Import skills from JSON */
  importSkills(skills: Skill[]): number {
    let imported = 0;
    for (const skill of skills) {
      this.skills.set(skill.id, { ...skill });
      imported++;
    }
    return imported;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /** Build a compact SLM prompt for executing this skill */
  private buildSLMPrompt(skill: Omit<Skill, "id" | "createdAt" | "updatedAt" | "stats" | "confidence" | "slmPrompt">): string {
    const lines = [
      `SKILL: ${skill.name}`,
      `DESC: ${skill.description}`,
      `STEPS:`,
    ];

    for (const step of skill.steps) {
      let line = `  ${step.order}. ${step.action}`;
      if (step.toolId) line += ` [tool: ${step.toolId}]`;
      if (step.verify) line += ` (verify: ${step.verify})`;
      if (step.fallback) line += ` (if fail: ${step.fallback})`;
      lines.push(line);
    }

    if (skill.prerequisites.length > 0) {
      lines.push(`PREREQS: ${skill.prerequisites.join(", ")}`);
    }
    if (skill.successCriteria.length > 0) {
      lines.push(`SUCCESS: ${skill.successCriteria.join("; ")}`);
    }

    return lines.join("\n");
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _skills: SkillManager | null = null;

export function getSkillManager(): SkillManager {
  if (!_skills) {
    _skills = new SkillManager();
  }
  return _skills;
}
