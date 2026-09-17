/**
 * Agent Self-Improvement Loop
 *
 * Tracks agent performance across tasks, detects patterns in successes
 * and failures, and generates improvement suggestions. Works with SLMs
 * by producing compact, actionable insights.
 *
 * The loop:
 * 1. Record task execution (tool used, duration, success, errors)
 * 2. Detect patterns (common failures, slow tools, frequent retries)
 * 3. Generate improvement suggestions (skill refinements, tool alternatives)
 * 4. Auto-apply safe improvements (update skill fallbacks, adjust timeouts)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string;
  /** What the task was trying to achieve */
  goal: string;
  /** Tools used in this task */
  toolsUsed: string[];
  /** Steps executed */
  steps: Array<{
    toolId: string;
    input: Record<string, unknown>;
    success: boolean;
    durationMs: number;
    error?: string;
  }>;
  /** Overall success */
  success: boolean;
  /** Total duration */
  durationMs: number;
  /** Timestamp */
  timestamp: string;
  /** Skill used (if any) */
  skillId?: string;
  /** Error categories */
  errors: Array<{
    type: "timeout" | "network" | "permission" | "validation" | "logic" | "unknown";
    message: string;
    toolId?: string;
  }>;
}

export interface PerformancePattern {
  id: string;
  type: "frequent-error" | "slow-tool" | "retry-loop" | "unused-tool" | "common-sequence" | "time-of-day";
  description: string;
  affectedTools: string[];
  frequency: number;
  severity: "low" | "medium" | "high";
  suggestion: string;
  autoFixable: boolean;
}

export interface ImprovementSuggestion {
  id: string;
  category: "tool-config" | "skill-refinement" | "workflow-optimization" | "error-prevention";
  title: string;
  description: string;
  /** What to change */
  change: {
    type: "update-skill" | "adjust-timeout" | "add-fallback" | "reorder-steps" | "remove-step" | "add-prerequisite";
    target: string; // skill ID, tool ID, or workflow ID
    details: Record<string, unknown>;
  };
  confidence: number;
  impact: "low" | "medium" | "high";
  autoApplied: boolean;
}

export interface PerformanceStats {
  totalTasks: number;
  successRate: number;
  avgDurationMs: number;
  toolUsage: Record<string, { count: number; successRate: number; avgDurationMs: number }>;
  errorDistribution: Record<string, number>;
  mostFailedTools: Array<{ toolId: string; failureRate: number }>;
  fastestTools: Array<{ toolId: string; avgMs: number }>;
  slowestTools: Array<{ toolId: string; avgMs: number }>;
}

// ─── Self-Improvement Engine ──────────────────────────────────────────────────

export class SelfImprover {
  private tasks: TaskRecord[] = [];
  private patterns: PerformancePattern[] = [];
  private suggestions: ImprovementSuggestion[] = [];
  private maxTasks = 1000;

  /** Record a completed task */
  recordTask(task: TaskRecord): void {
    this.tasks.push(task);

    // Trim old tasks
    if (this.tasks.length > this.maxTasks) {
      this.tasks = this.tasks.slice(-this.maxTasks);
    }

    // Run pattern detection after each task
    this.detectPatterns();

    // Generate suggestions based on new patterns
    this.generateSuggestions();
  }

  /** Detect performance patterns from task history */
  detectPatterns(): PerformancePattern[] {
    this.patterns = [];

    // ── Frequent errors on a specific tool ──
    const toolErrors = new Map<string, number>();
    const toolTotal = new Map<string, number>();
    for (const task of this.tasks) {
      for (const step of task.steps) {
        toolTotal.set(step.toolId, (toolTotal.get(step.toolId) || 0) + 1);
        if (!step.success) {
          toolErrors.set(step.toolId, (toolErrors.get(step.toolId) || 0) + 1);
        }
      }
    }

    for (const [toolId, errors] of toolErrors) {
      const total = toolTotal.get(toolId) || 1;
      const rate = errors / total;
      if (rate > 0.3 && errors >= 3) {
        this.patterns.push({
          id: `pat-error-${toolId}`,
          type: "frequent-error",
          description: `Tool "${toolId}" fails ${(rate * 100).toFixed(0)}% of the time (${errors}/${total})`,
          affectedTools: [toolId],
          frequency: errors,
          severity: rate > 0.6 ? "high" : "medium",
          suggestion: `Consider adding fallback for ${toolId} or adjusting input parameters`,
          autoFixable: true,
        });
      }
    }

    // ── Slow tools ──
    const toolDurations = new Map<string, number[]>();
    for (const task of this.tasks) {
      for (const step of task.steps) {
        if (!toolDurations.has(step.toolId)) toolDurations.set(step.toolId, []);
        toolDurations.get(step.toolId)!.push(step.durationMs);
      }
    }

    for (const [toolId, durations] of toolDurations) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      if (avg > 5000 && durations.length >= 3) {
        this.patterns.push({
          id: `pat-slow-${toolId}`,
          type: "slow-tool",
          description: `Tool "${toolId}" averages ${(avg / 1000).toFixed(1)}s per call`,
          affectedTools: [toolId],
          frequency: durations.length,
          severity: avg > 15000 ? "high" : "medium",
          suggestion: `Consider caching results or adding timeout for ${toolId}`,
          autoFixable: false,
        });
      }
    }

    // ── Retry loops (same tool called 3+ times in one task) ──
    for (const task of this.tasks) {
      const callCounts = new Map<string, number>();
      for (const step of task.steps) {
        callCounts.set(step.toolId, (callCounts.get(step.toolId) || 0) + 1);
      }
      for (const [toolId, count] of callCounts) {
        if (count >= 3) {
          this.patterns.push({
            id: `pat-retry-${toolId}-${task.id}`,
            type: "retry-loop",
            description: `Tool "${toolId}" called ${count} times in task "${task.goal.slice(0, 50)}"`,
            affectedTools: [toolId],
            frequency: count,
            severity: "medium",
            suggestion: `Investigate why ${toolId} needs repeated calls — may need different input strategy`,
            autoFixable: false,
          });
        }
      }
    }

    // ── Common tool sequences ──
    const sequences = new Map<string, number>();
    for (const task of this.tasks) {
      if (task.steps.length >= 2) {
        for (let i = 0; i < task.steps.length - 1; i++) {
          const seq = `${task.steps[i].toolId}→${task.steps[i + 1].toolId}`;
          sequences.set(seq, (sequences.get(seq) || 0) + 1);
        }
      }
    }

    for (const [seq, count] of sequences) {
      if (count >= 5) {
        const [from, to] = seq.split("→");
        this.patterns.push({
          id: `pat-seq-${seq}`,
          type: "common-sequence",
          description: `Common sequence: ${from} then ${to} (${count} times)`,
          affectedTools: [from, to],
          frequency: count,
          severity: "low",
          suggestion: `Consider creating a combined skill for "${from} → ${to}"`,
          autoFixable: false,
        });
      }
    }

    return this.patterns;
  }

  /** Generate improvement suggestions from patterns */
  generateSuggestions(): ImprovementSuggestion[] {
    this.suggestions = [];

    for (const pattern of this.patterns) {
      switch (pattern.type) {
        case "frequent-error":
          this.suggestions.push({
            id: `sug-${pattern.id}`,
            category: "error-prevention",
            title: `Add fallback for ${pattern.affectedTools[0]}`,
            description: pattern.description,
            change: {
              type: "add-fallback",
              target: pattern.affectedTools[0],
              details: { fallback: "Retry once with simplified input, then skip with warning" },
            },
            confidence: 0.7,
            impact: "medium",
            autoApplied: false,
          });
          break;

        case "slow-tool":
          this.suggestions.push({
            id: `sug-${pattern.id}`,
            category: "tool-config",
            title: `Optimize ${pattern.affectedTools[0]} usage`,
            description: pattern.description,
            change: {
              type: "adjust-timeout",
              target: pattern.affectedTools[0],
              details: { timeoutMs: 10000 },
            },
            confidence: 0.6,
            impact: "low",
            autoApplied: false,
          });
          break;

        case "retry-loop":
          this.suggestions.push({
            id: `sug-${pattern.id}`,
            category: "workflow-optimization",
            title: `Investigate retry pattern for ${pattern.affectedTools[0]}`,
            description: pattern.description,
            change: {
              type: "add-prerequisite",
              target: pattern.affectedTools[0],
              details: { prerequisite: "Validate input before calling this tool" },
            },
            confidence: 0.5,
            impact: "medium",
            autoApplied: false,
          });
          break;

        case "common-sequence":
          this.suggestions.push({
            id: `sug-${pattern.id}`,
            category: "workflow-optimization",
            title: `Create skill for "${pattern.affectedTools.join(" → ")}"`,
            description: pattern.description,
            change: {
              type: "reorder-steps",
              target: pattern.affectedTools.join(","),
              details: { sequence: pattern.affectedTools },
            },
            confidence: 0.8,
            impact: "low",
            autoApplied: false,
          });
          break;
      }
    }

    return this.suggestions;
  }

  /** Auto-apply safe improvements */
  autoApply(): ImprovementSuggestion[] {
    const applied: ImprovementSuggestion[] = [];

    for (const suggestion of this.suggestions) {
      if (suggestion.autoApplied) continue;
      if (suggestion.confidence >= 0.7 && suggestion.change.type === "add-fallback") {
        suggestion.autoApplied = true;
        applied.push(suggestion);
      }
    }

    return applied;
  }

  /** Get performance stats */
  getStats(): PerformanceStats {
    const total = this.tasks.length;
    const successes = this.tasks.filter(t => t.success).length;

    const toolUsage: Record<string, { count: number; successRate: number; avgDurationMs: number }> = {};
    const toolCounts = new Map<string, number>();
    const toolSuccesses = new Map<string, number>();
    const toolDurations = new Map<string, number[]>();
    const errorDist: Record<string, number> = {};

    for (const task of this.tasks) {
      for (const step of task.steps) {
        toolCounts.set(step.toolId, (toolCounts.get(step.toolId) || 0) + 1);
        if (step.success) toolSuccesses.set(step.toolId, (toolSuccesses.get(step.toolId) || 0) + 1);
        if (!toolDurations.has(step.toolId)) toolDurations.set(step.toolId, []);
        toolDurations.get(step.toolId)!.push(step.durationMs);
      }
      for (const err of task.errors) {
        errorDist[err.type] = (errorDist[err.type] || 0) + 1;
      }
    }

    for (const [toolId, count] of toolCounts) {
      const successes = toolSuccesses.get(toolId) || 0;
      const durations = toolDurations.get(toolId) || [];
      toolUsage[toolId] = {
        count,
        successRate: count > 0 ? successes / count : 0,
        avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      };
    }

    const mostFailed = Object.entries(toolUsage)
      .map(([id, u]) => ({ toolId: id, failureRate: 1 - u.successRate }))
      .filter(e => e.failureRate > 0 && toolUsage[e.toolId].count >= 3)
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 10);

    const sortedByDuration = Object.entries(toolUsage)
      .map(([id, u]) => ({ toolId: id, avgMs: u.avgDurationMs }))
      .filter(e => e.avgMs > 0)
      .sort((a, b) => a.avgMs - b.avgMs);

    return {
      totalTasks: total,
      successRate: total > 0 ? successes / total : 0,
      avgDurationMs: total > 0 ? this.tasks.reduce((s, t) => s + t.durationMs, 0) / total : 0,
      toolUsage,
      errorDistribution: errorDist,
      mostFailedTools: mostFailed,
      fastestTools: sortedByDuration.slice(0, 5),
      slowestTools: sortedByDuration.slice(-5).reverse(),
    };
  }

  /** Get all detected patterns */
  getPatterns(): PerformancePattern[] {
    return [...this.patterns];
  }

  /** Get all suggestions */
  getSuggestions(): ImprovementSuggestion[] {
    return [...this.suggestions];
  }

  /** Generate SLM-friendly summary */
  toSLMSummary(): string {
    const stats = this.getStats();
    const lines = [
      `AGENT PERFORMANCE`,
      `Tasks: ${stats.totalTasks}, Success: ${(stats.successRate * 100).toFixed(0)}%, Avg: ${(stats.avgDurationMs / 1000).toFixed(1)}s`,
    ];

    if (stats.mostFailedTools.length > 0) {
      lines.push(`PROBLEM TOOLS: ${stats.mostFailedTools.map(t => `${t.toolId} (${(t.failureRate * 100).toFixed(0)}% fail)`).join(", ")}`);
    }

    if (this.patterns.length > 0) {
      lines.push(`PATTERNS: ${this.patterns.length} detected`);
      for (const p of this.patterns.slice(0, 5)) {
        lines.push(`  - ${p.description}`);
      }
    }

    if (this.suggestions.length > 0) {
      lines.push(`SUGGESTIONS: ${this.suggestions.filter(s => !s.autoApplied).length} pending`);
    }

    return lines.join("\n");
  }

  /** Clear all records */
  clear(): void {
    this.tasks = [];
    this.patterns = [];
    this.suggestions = [];
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _improver: SelfImprover | null = null;

export function getSelfImprover(): SelfImprover {
  if (!_improver) {
    _improver = new SelfImprover();
  }
  return _improver;
}
