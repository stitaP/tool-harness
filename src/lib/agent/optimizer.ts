/**
 * stitaP Agent Optimization Engine
 *
 * Maps directly to Microsoft Foundry's four optimization levers:
 *
 * 1. MODELS AND OFFERS → Model Router
 *    - Task-complexity-based model selection
 *    - Cost-aware routing (frontier vs local vs cached)
 *    - Latency-aware routing
 *
 * 2. CACHING → Prompt Cache
 *    - Exact-match prompt caching
 *    - Semantic similarity caching
 *    - KV-cache reuse tracking
 *
 * 3. PROMPT AND AGENT OPTIMIZATION → Agent Optimizer
 *    - Instruction compression
 *    - Tool description optimization
 *    - Skill extraction and reuse
 *    - Model selection per task type
 *
 * 4. OBSERVABILITY AND EVALUATION → Cost Observatory
 *    - Per-outcome cost tracking
 *    - Token usage attribution
 *    - Budget enforcement
 *    - Quality-cost tradeoff analysis
 *
 * Core insight: The business cares about cost per successful outcome,
 * not price per token. An agent loop multiplies every waste factor.
 * When optimization decisions are right, savings repeat on every turn.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "frontier";
export type ModelTier = "local-slm" | "local-llm" | "cloud-fast" | "cloud-balanced" | "cloud-frontier";
export type CacheStrategy = "exact" | "semantic" | "none";

export interface ModelRoute {
  modelId: string;
  tier: ModelTier;
  provider: string;
  costPer1KInput: number;
  costPer1KOutput: number;
  avgLatencyMs: number;
  maxTokens: number;
  capabilities: string[];
}

export interface TaskProfile {
  id: string;
  type: string;
  complexity: TaskComplexity;
  inputTokens: number;
  expectedOutputTokens: number;
  requiresReasoning: boolean;
  requiresTools: boolean;
  requiresCodeExecution: boolean;
  qualityThreshold: number; // 0-1
  latencyBudgetMs: number;
  costBudgetUSD: number;
}

export interface RoutingDecision {
  selectedModel: ModelRoute;
  reason: string;
  alternatives: ModelRoute[];
  estimatedCostUSD: number;
  estimatedLatencyMs: number;
  cacheHit: boolean;
  cacheStrategy: CacheStrategy;
}

export interface CacheEntry {
  id: string;
  promptHash: string;
  promptEmbedding?: number[];
  response: string;
  modelId: string;
  tokensUsed: number;
  costSaved: number;
  hitCount: number;
  createdAt: string;
  lastHitAt: string;
  ttlMs: number;
}

export interface OptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  tokensSaved: number;
  percentReduction: number;
  qualityImpact: number; // estimated 0-1
  techniques: string[];
}

export interface CostRecord {
  id: string;
  outcomeId: string;
  agentId: string;
  stepIndex: number;
  modelId: string;
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  latencyMs: number;
  cacheHit: boolean;
  success: boolean;
  timestamp: string;
}

export interface BudgetConfig {
  dailyLimitUSD: number;
  perOutcomeLimitUSD: number;
  perModelLimits: Record<string, number>;
  alertThresholds: number[]; // e.g., [0.5, 0.8, 1.0] for 50%, 80%, 100%
}

export interface CostAnalytics {
  totalCostUSD: number;
  costByModel: Record<string, number>;
  costByTier: Record<ModelTier, number>;
  costByTask: Record<string, number>;
  avgCostPerOutcome: number;
  cacheSavingsUSD: number;
  tokenEfficiency: number; // output tokens / input tokens
  successRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  budgetUtilization: number;
}

// ─── Model Registry ─────────────────────────────────────────────────────────

export const MODEL_REGISTRY: ModelRoute[] = [
  // Local SLMs (on-premise, zero marginal cost)
  {
    modelId: "qwen2.5-0.5b",
    tier: "local-slm",
    provider: "llama.cpp",
    costPer1KInput: 0,
    costPer1KOutput: 0,
    avgLatencyMs: 50,
    maxTokens: 2048,
    capabilities: ["classification", "extraction", "formatting", "simple-qa"],
  },
  {
    modelId: "qwen2.5-1.5b",
    tier: "local-slm",
    provider: "llama.cpp",
    costPer1KInput: 0,
    costPer1KOutput: 0,
    avgLatencyMs: 100,
    maxTokens: 4096,
    capabilities: ["classification", "extraction", "formatting", "summarization", "simple-qa", "tool-calling"],
  },
  {
    modelId: "qwen2.5-3b",
    tier: "local-slm",
    provider: "llama.cpp",
    costPer1KInput: 0,
    costPer1KOutput: 0,
    avgLatencyMs: 200,
    maxTokens: 8192,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling", "code-generation"],
  },

  // Local LLMs (on-premise, zero marginal cost)
  {
    modelId: "qwen2.5-7b",
    tier: "local-llm",
    provider: "llama.cpp",
    costPer1KInput: 0,
    costPer1KOutput: 0,
    avgLatencyMs: 500,
    maxTokens: 16384,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling", "code-generation", "reasoning"],
  },
  {
    modelId: "llama-3.2-3b",
    tier: "local-llm",
    provider: "llama.cpp",
    costPer1KInput: 0,
    costPer1KOutput: 0,
    avgLatencyMs: 300,
    maxTokens: 8192,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling"],
  },

  // Cloud Fast (cheap, low latency)
  {
    modelId: "gpt-4o-mini",
    tier: "cloud-fast",
    provider: "openai",
    costPer1KInput: 0.00015,
    costPer1KOutput: 0.0006,
    avgLatencyMs: 300,
    maxTokens: 16384,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling", "code-generation"],
  },
  {
    modelId: "claude-3-haiku",
    tier: "cloud-fast",
    provider: "anthropic",
    costPer1KInput: 0.00025,
    costPer1KOutput: 0.00125,
    avgLatencyMs: 400,
    maxTokens: 8192,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling"],
  },

  // Cloud Balanced (moderate cost, good quality)
  {
    modelId: "gpt-4o",
    tier: "cloud-balanced",
    provider: "openai",
    costPer1KInput: 0.0025,
    costPer1KOutput: 0.01,
    avgLatencyMs: 800,
    maxTokens: 128000,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling", "code-generation", "reasoning", "multi-step"],
  },
  {
    modelId: "claude-3.5-sonnet",
    tier: "cloud-balanced",
    provider: "anthropic",
    costPer1KInput: 0.003,
    costPer1KOutput: 0.015,
    avgLatencyMs: 900,
    maxTokens: 200000,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling", "code-generation", "reasoning", "multi-step"],
  },

  // Cloud Frontier (expensive, highest quality)
  {
    modelId: "gpt-4.5",
    tier: "cloud-frontier",
    provider: "openai",
    costPer1KInput: 0.075,
    costPer1KOutput: 0.15,
    avgLatencyMs: 2000,
    maxTokens: 128000,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling", "code-generation", "reasoning", "multi-step", "frontier-reasoning"],
  },
  {
    modelId: "claude-opus-4",
    tier: "cloud-frontier",
    provider: "anthropic",
    costPer1KInput: 0.015,
    costPer1KOutput: 0.075,
    avgLatencyMs: 3000,
    maxTokens: 200000,
    capabilities: ["classification", "extraction", "formatting", "summarization", "complex-qa", "tool-calling", "code-generation", "reasoning", "multi-step", "frontier-reasoning"],
  },
  {
    modelId: "o3",
    tier: "cloud-frontier",
    provider: "openai",
    costPer1KInput: 0.10,
    costPer1KOutput: 0.40,
    avgLatencyMs: 10000,
    maxTokens: 200000,
    capabilities: ["reasoning", "multi-step", "frontier-reasoning", "math", "code-generation"],
  },
];

// ─── 1. MODEL ROUTER ────────────────────────────────────────────────────────

/**
 * Route a task to the optimal model based on complexity, cost, and latency.
 *
 * Key insight: 80% of agent turns are trivial (classification, extraction,
 * formatting). Routing those to a local SLM saves 100% of cloud costs.
 * The remaining 20% need the right cloud model, not necessarily the frontier.
 */
export function routeModel(
  task: TaskProfile,
  options: {
    preferLocal?: boolean;
    maxCostUSD?: number;
    maxLatencyMs?: number;
    excludeModels?: string[];
  } = {},
): RoutingDecision {
  const { preferLocal = true, maxCostUSD = 0.10, maxLatencyMs = 5000, excludeModels = [] } = options;

  // Classify task complexity
  const complexity = classifyComplexity(task);

  // Filter eligible models
  let candidates = MODEL_REGISTRY.filter((m) => !excludeModels.includes(m.modelId));

  // Apply cost constraint
  if (maxCostUSD !== undefined) {
    candidates = candidates.filter((m) => {
      const estimatedCost = estimateCost(m, task.inputTokens, task.expectedOutputTokens);
      return estimatedCost <= maxCostUSD;
    });
  }

  // Apply latency constraint
  if (maxLatencyMs !== undefined) {
    candidates = candidates.filter((m) => m.avgLatencyMs <= maxLatencyMs);
  }

  // Apply capability requirements
  if (task.requiresReasoning) {
    candidates = candidates.filter((m) => m.capabilities.includes("reasoning"));
  }
  if (task.requiresTools) {
    candidates = candidates.filter((m) => m.capabilities.includes("tool-calling"));
  }
  if (task.requiresCodeExecution) {
    candidates = candidates.filter((m) => m.capabilities.includes("code-generation"));
  }

  // Prefer local models if enabled
  if (preferLocal) {
    const localCandidates = candidates.filter((m) => m.tier.startsWith("local"));
    if (localCandidates.length > 0 && complexity !== "frontier") {
      candidates = localCandidates;
    }
  }

  // Sort by cost-efficiency (quality-adjusted)
  candidates.sort((a, b) => {
    const costA = estimateCost(a, task.inputTokens, task.expectedOutputTokens);
    const costB = estimateCost(b, task.inputTokens, task.expectedOutputTokens);

    // For frontier tasks, prioritize quality over cost
    if (complexity === "frontier") {
      const qualityA = getQualityScore(a, complexity);
      const qualityB = getQualityScore(b, complexity);
      return qualityB - qualityA;
    }

    // For other tasks, balance cost and quality
    const efficiencyA = getQualityScore(a, complexity) / Math.max(costA, 0.0001);
    const efficiencyB = getQualityScore(b, complexity) / Math.max(costB, 0.0001);
    return efficiencyB - efficiencyA;
  });

  const selected = candidates[0] ?? MODEL_REGISTRY[0];
  const estimatedCost = estimateCost(selected, task.inputTokens, task.expectedOutputTokens);

  return {
    selectedModel: selected,
    reason: `Task complexity: ${complexity}. ${selected.tier === "local-slm" || selected.tier === "local-llm" ? "Using local model (zero cost)." : `Selected ${selected.provider}/${selected.modelId} for optimal cost/quality.`}`,
    alternatives: candidates.slice(1, 4),
    estimatedCostUSD: estimatedCost,
    estimatedLatencyMs: selected.avgLatencyMs,
    cacheHit: false,
    cacheStrategy: complexity === "trivial" ? "exact" : complexity === "simple" ? "semantic" : "none",
  };
}

function classifyComplexity(task: TaskProfile): TaskComplexity {
  if (task.type === "classification" || task.type === "formatting") return "trivial";
  if (task.type === "extraction" || task.type === "simple-qa") return "simple";
  if (task.type === "summarization" || task.type === "tool-calling") return "moderate";
  if (task.type === "complex-qa" || task.type === "code-generation") return "complex";
  return "frontier";
}

function getQualityScore(model: ModelRoute, complexity: TaskComplexity): number {
  const tierScores: Record<ModelTier, number> = {
    "local-slm": 0.5,
    "local-llm": 0.7,
    "cloud-fast": 0.75,
    "cloud-balanced": 0.9,
    "cloud-frontier": 1.0,
  };
  return tierScores[model.tier] ?? 0.5;
}

function estimateCost(model: ModelRoute, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * model.costPer1KInput + (outputTokens / 1000) * model.costPer1KOutput;
}

// ─── 2. PROMPT CACHE ────────────────────────────────────────────────────────

/**
 * Prompt caching system.
 *
 * Key insight: In agent loops, the same prompts repeat across turns
 * (system prompts, tool descriptions, context). Caching saves both
 * tokens and latency on every repeat.
 */
export class PromptCache {
  private exactCache = new Map<string, CacheEntry>();
  private semanticCache: CacheEntry[] = [];
  private maxEntries: number;
  private defaultTtlMs: number;

  constructor(maxEntries = 10000, defaultTtlMs = 3600_000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /** Generate a hash for exact-match caching */
  private hashPrompt(prompt: string): string {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `h_${hash.toString(36)}`;
  }

  /** Check for exact cache hit */
  getExact(prompt: string): CacheEntry | null {
    const hash = this.hashPrompt(prompt);
    const entry = this.exactCache.get(hash);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - new Date(entry.createdAt).getTime() > entry.ttlMs) {
      this.exactCache.delete(hash);
      return null;
    }

    // Update hit stats
    entry.hitCount++;
    entry.lastHitAt = new Date().toISOString();
    return entry;
  }

  /** Check for semantic cache hit (similar prompts) */
  getSemantic(prompt: string, threshold = 0.95): CacheEntry | null {
    // Simple keyword-based similarity (production would use embeddings)
    const promptWords = new Set(prompt.toLowerCase().split(/\s+/));

    for (const entry of this.semanticCache) {
      const entryWords = new Set(entry.promptHash.split(" "));
      const intersection = [...promptWords].filter((w) => entryWords.has(w));
      const union = new Set([...promptWords, ...entryWords]);
      const similarity = intersection.length / union.size;

      if (similarity >= threshold) {
        entry.hitCount++;
        entry.lastHitAt = new Date().toISOString();
        return entry;
      }
    }
    return null;
  }

  /** Store a prompt-response pair */
  set(
    prompt: string,
    response: string,
    modelId: string,
    tokensUsed: number,
    strategy: CacheStrategy = "exact",
  ): void {
    const hash = this.hashPrompt(prompt);
    const costSaved = 0; // Will be calculated when hit

    const entry: CacheEntry = {
      id: `cache_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      promptHash: strategy === "semantic" ? prompt.toLowerCase().split(/\s+/).join(" ") : hash,
      response,
      modelId,
      tokensUsed,
      costSaved,
      hitCount: 0,
      createdAt: new Date().toISOString(),
      lastHitAt: new Date().toISOString(),
      ttlMs: this.defaultTtlMs,
    };

    if (strategy === "exact") {
      this.exactCache.set(hash, entry);
    } else {
      this.semanticCache.push(entry);
    }

    // Evict if over capacity
    this.evict();
  }

  /** Get cache statistics */
  stats(): {
    exactEntries: number;
    semanticEntries: number;
    totalHits: number;
    estimatedSavingsUSD: number;
  } {
    let totalHits = 0;
    let estimatedSavings = 0;

    for (const entry of this.exactCache.values()) {
      totalHits += entry.hitCount;
      estimatedSavings += entry.costSaved;
    }
    for (const entry of this.semanticCache) {
      totalHits += entry.hitCount;
      estimatedSavings += entry.costSaved;
    }

    return {
      exactEntries: this.exactCache.size,
      semanticEntries: this.semanticCache.length,
      totalHits,
      estimatedSavingsUSD: estimatedSavings,
    };
  }

  private evict(): void {
    if (this.exactCache.size > this.maxEntries) {
      // Evict oldest entries
      const entries = Array.from(this.exactCache.entries())
        .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime());
      const toRemove = entries.slice(0, Math.floor(this.maxEntries * 0.1));
      for (const [key] of toRemove) {
        this.exactCache.delete(key);
      }
    }
  }

  clear(): void {
    this.exactCache.clear();
    this.semanticCache = [];
  }
}

// ─── 3. AGENT OPTIMIZER ─────────────────────────────────────────────────────

/**
 * Agent optimization system.
 *
 * Key insight: Prompt waste multiplies across agent turns. A 500-token
 * system prompt wastes 500 tokens on EVERY turn. A 12-turn agent loop
 * wastes 6000 tokens. Optimizing prompts saves on every turn.
 */
export class AgentOptimizer {
  /**
   * Compress a system prompt by removing redundancy while preserving meaning.
   */
  optimizePrompt(prompt: string): OptimizationResult {
    const original = prompt;
    let optimized = prompt;
    const techniques: string[] = [];

    // 1. Remove excessive whitespace
    const beforeWhitespace = optimized.length;
    optimized = optimized.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
    if (optimized.length < beforeWhitespace) techniques.push("whitespace-compression");

    // 2. Remove redundant instructions
    const lines = optimized.split("\n");
    const uniqueLines: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const normalized = line.toLowerCase().trim();
      if (!seen.has(normalized) && normalized.length > 0) {
        seen.add(normalized);
        uniqueLines.push(line);
      }
    }
    if (uniqueLines.length < lines.length) techniques.push("deduplication");
    optimized = uniqueLines.join("\n");

    // 3. Compress common phrases
    const compressions: [RegExp, string][] = [
      [/please\s+/gi, ""],
      [/kindly\s+/gi, ""],
      [/make sure to\s+/gi, ""],
      [/ensure that\s+/gi, ""],
      [/it is important to\s+/gi, ""],
      [/you should\s+/gi, ""],
      [/you must\s+/gi, ""],
      [/do not forget to\s+/gi, ""],
      [/always remember to\s+/gi, ""],
    ];

    for (const [pattern, replacement] of compressions) {
      if (pattern.test(optimized)) {
        optimized = optimized.replace(pattern, replacement);
        techniques.push("phrase-compression");
      }
    }

    const tokensSaved = Math.ceil((original.length - optimized.length) / 4);
    const percentReduction = Math.round((1 - optimized.length / original.length) * 100);

    return {
      originalPrompt: original,
      optimizedPrompt: optimized,
      tokensSaved,
      percentReduction,
      qualityImpact: 0.02, // Minimal quality impact from compression
      techniques: [...new Set(techniques)],
    };
  }

  /**
   * Optimize tool descriptions for agent loops.
   * Shorter descriptions save tokens on every turn where tools are listed.
   */
  optimizeToolDescriptions(tools: Array<{ name: string; description: string }>): Array<{
    name: string;
    original: string;
    optimized: string;
    tokensSaved: number;
  }> {
    return tools.map((tool) => {
      let optimized = tool.description;

      // Remove common filler
      optimized = optimized
        .replace(/This (tool|function|method) (allows?|enables?|provides?|lets you) you to\s+/gi, "")
        .replace(/Use this (tool|function|method) to\s+/gi, "")
        .replace(/Useful for\s+/gi, "")
        .replace(/A (tool|function|method) that\s+/gi, "")
        .replace(/\.$/, ""); // Remove trailing period

      return {
        name: tool.name,
        original: tool.description,
        optimized,
        tokensSaved: Math.ceil((tool.description.length - optimized.length) / 4),
      };
    });
  }

  /**
   * Analyze an agent loop and suggest optimizations.
   */
  analyzeLoop(turns: Array<{
    prompt: string;
    response: string;
    modelId: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
  }>): {
    totalTokensIn: number;
    totalTokensOut: number;
    redundantTurns: number;
    modelDowngradeOpportunities: number;
    cacheHitOpportunities: number;
    estimatedSavings: number;
  } {
    let totalIn = 0;
    let totalOut = 0;
    let redundantTurns = 0;
    let downgradeOpportunities = 0;
    let cacheOpportunities = 0;

    const promptHistory: string[] = [];

    for (const turn of turns) {
      totalIn += turn.tokensIn;
      totalOut += turn.tokensOut;

      // Detect redundant turns (similar prompts)
      const isDuplicate = promptHistory.some((prev) => {
        const similarity = computeSimilarity(prev, turn.prompt);
        return similarity > 0.9;
      });
      if (isDuplicate) redundantTurns++;

      // Detect downgrade opportunities (frontier model for simple tasks)
      const isComplex = turn.tokensIn > 2000 || turn.tokensOut > 1000;
      if (!isComplex && turn.modelId.includes("gpt-4.5")) {
        downgradeOpportunities++;
      }

      // Detect cache opportunities (same prompt prefix)
      const hasCacheHit = promptHistory.some((prev) => {
        return turn.prompt.startsWith(prev.substring(0, 100));
      });
      if (hasCacheHit) cacheOpportunities++;

      promptHistory.push(turn.prompt);
    }

    // Estimate savings
    const avgCostPerToken = 0.00001; // rough estimate
    const estimatedSavings = (redundantTurns * 500 + cacheOpportunities * 300) * avgCostPerToken;

    return {
      totalTokensIn: totalIn,
      totalTokensOut: totalOut,
      redundantTurns,
      modelDowngradeOpportunities: downgradeOpportunities,
      cacheHitOpportunities: cacheOpportunities,
      estimatedSavings,
    };
  }
}

function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size;
}

// ─── 4. COST OBSERVATORY ────────────────────────────────────────────────────

/**
 * Cost observability and budget enforcement.
 *
 * Key insight: In production, you need to know the cost of each
 * successful outcome, not just aggregate spend. An agent that costs
 * $0.50 but succeeds 95% of the time may be cheaper per outcome
 * than one that costs $0.10 but fails 50% of the time.
 */
export class CostObservatory {
  private records: CostRecord[] = [];
  private budget: BudgetConfig;
  private dailySpend = 0;

  constructor(budget: BudgetConfig) {
    this.budget = budget;
  }

  /** Record a model request */
  record(data: Omit<CostRecord, "id" | "costUSD" | "timestamp">): CostRecord {
    const model = MODEL_REGISTRY.find((m) => m.modelId === data.modelId);
    const cost = model
      ? (data.inputTokens / 1000) * model.costPer1KInput + (data.outputTokens / 1000) * model.costPer1KOutput
      : 0;

    const record: CostRecord = {
      ...data,
      id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      costUSD: cost,
      timestamp: new Date().toISOString(),
    };

    this.records.push(record);
    this.dailySpend += cost;

    return record;
  }

  /** Check if a request is within budget */
  checkBudget(modelId: string, estimatedTokens: number): {
    allowed: boolean;
    reason: string;
    dailyRemaining: number;
    outcomeRemaining: number;
  } {
    const model = MODEL_REGISTRY.find((m) => m.modelId === modelId);
    const estimatedCost = model
      ? (estimatedTokens / 1000) * model.costPer1KInput
      : 0;

    const dailyRemaining = this.budget.dailyLimitUSD - this.dailySpend;
    const outcomeRemaining = this.budget.perOutcomeLimitUSD; // Would need tracking per outcome

    if (estimatedCost > dailyRemaining) {
      return {
        allowed: false,
        reason: `Estimated cost $${estimatedCost.toFixed(4)} exceeds daily remaining $${dailyRemaining.toFixed(4)}`,
        dailyRemaining,
        outcomeRemaining,
      };
    }

    if (estimatedCost > outcomeRemaining) {
      return {
        allowed: false,
        reason: `Estimated cost $${estimatedCost.toFixed(4)} exceeds per-outcome limit $${outcomeRemaining.toFixed(4)}`,
        dailyRemaining,
        outcomeRemaining,
      };
    }

    return {
      allowed: true,
      reason: "Within budget",
      dailyRemaining,
      outcomeRemaining,
    };
  }

  /** Get analytics for a time period */
  analytics(filter?: { startTime?: string; endTime?: string; agentId?: string }): CostAnalytics {
    let filtered = this.records;

    if (filter?.startTime) {
      filtered = filtered.filter((r) => r.timestamp >= filter.startTime!);
    }
    if (filter?.endTime) {
      filtered = filtered.filter((r) => r.timestamp <= filter.endTime!);
    }
    if (filter?.agentId) {
      filtered = filtered.filter((r) => r.agentId === filter.agentId);
    }

    const totalCost = filtered.reduce((sum, r) => sum + r.costUSD, 0);
    const cacheSavings = filtered.filter((r) => r.cacheHit).reduce((sum, r) => sum + r.costUSD, 0);

    // Cost by model
    const costByModel: Record<string, number> = {};
    for (const r of filtered) {
      costByModel[r.modelId] = (costByModel[r.modelId] ?? 0) + r.costUSD;
    }

    // Cost by tier
    const costByTier: Record<ModelTier, number> = {
      "local-slm": 0,
      "local-llm": 0,
      "cloud-fast": 0,
      "cloud-balanced": 0,
      "cloud-frontier": 0,
    };
    for (const r of filtered) {
      costByTier[r.tier] = (costByTier[r.tier] ?? 0) + r.costUSD;
    }

    // Cost by task type
    const costByTask: Record<string, number> = {};

    // Latency percentiles
    const latencies = filtered.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

    // Success rate
    const successRate = filtered.length > 0
      ? filtered.filter((r) => r.success).length / filtered.length
      : 0;

    // Token efficiency
    const totalIn = filtered.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOut = filtered.reduce((sum, r) => sum + r.outputTokens, 0);
    const tokenEfficiency = totalIn > 0 ? totalOut / totalIn : 0;

    return {
      totalCostUSD: totalCost,
      costByModel,
      costByTier,
      costByTask,
      avgCostPerOutcome: filtered.length > 0 ? totalCost / filtered.length : 0,
      cacheSavingsUSD: cacheSavings,
      tokenEfficiency,
      successRate,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      budgetUtilization: this.budget.dailyLimitUSD > 0
        ? this.dailySpend / this.budget.dailyLimitUSD
        : 0,
    };
  }

  /** Get cost per outcome (the metric businesses care about) */
  costPerOutcome(agentId?: string): {
    avgCostPerSuccess: number;
    avgCostPerAttempt: number;
    successRate: number;
    totalOutcomes: number;
    totalCost: number;
  } {
    const filtered = agentId
      ? this.records.filter((r) => r.agentId === agentId)
      : this.records;

    // Group by outcomeId
    const outcomes = new Map<string, { cost: number; success: boolean; attempts: number }>();
    for (const r of filtered) {
      const existing = outcomes.get(r.outcomeId) ?? { cost: 0, success: false, attempts: 0 };
      existing.cost += r.costUSD;
      existing.attempts++;
      if (r.success) existing.success = true;
      outcomes.set(r.outcomeId, existing);
    }

    const outcomesArray = Array.from(outcomes.values());
    const successfulOutcomes = outcomesArray.filter((o) => o.success);

    return {
      avgCostPerSuccess: successfulOutcomes.length > 0
        ? successfulOutcomes.reduce((sum, o) => sum + o.cost, 0) / successfulOutcomes.length
        : 0,
      avgCostPerAttempt: outcomesArray.length > 0
        ? outcomesArray.reduce((sum, o) => sum + o.cost, 0) / outcomesArray.length
        : 0,
      successRate: outcomesArray.length > 0
        ? successfulOutcomes.length / outcomesArray.length
        : 0,
      totalOutcomes: outcomesArray.length,
      totalCost: outcomesArray.reduce((sum, o) => sum + o.cost, 0),
    };
  }

  /** Export records for analysis */
  export(): CostRecord[] {
    return [...this.records];
  }

  /** Reset daily spend (call at midnight) */
  resetDaily(): void {
    this.dailySpend = 0;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createOptimizationStack(budget?: BudgetConfig) {
  const cache = new PromptCache();
  const optimizer = new AgentOptimizer();
  const observatory = new CostObservatory(budget ?? {
    dailyLimitUSD: 10.00,
    perOutcomeLimitUSD: 0.50,
    perModelLimits: {},
    alertThresholds: [0.5, 0.8, 1.0],
  });

  return { cache, optimizer, observatory };
}
