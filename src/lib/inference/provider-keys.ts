/**
 * stitaP Inference — API Provider Key Analyzer
 *
 * Answers the question every swarm builder hits: "Can ONE API key run
 * my N agents, or do I need multiple keys?"
 *
 * The mechanism: every provider enforces per-key rate limits — requests
 * per minute (RPM), tokens per minute (TPM), and sometimes concurrent
 * requests. Agents share whatever key they are given, so a single key
 * works until the SUM of agent demand crosses the provider's per-key
 * ceiling. This engine computes that crossover point from measured or
 * estimated agent demand and says plainly: one key is enough, or you
 * need K keys, or you should run some agents locally instead.
 *
 * Zero dependencies. Deterministic. No network calls.
 */

// ─── Provider registry ─────────────────────────────────────────────────────────

export interface ProviderProfile {
  id: string;
  name: string;
  /** Per-key limits as published; tier "standard" unless noted */
  requestsPerMinute: number;
  tokensPerMinute: number;
  /** Max concurrent in-flight requests per key (Infinity = not limited) */
  maxConcurrentPerKey: number;
  /** Whether the provider sells higher tiers that raise limits */
  hasTiers: boolean;
  keyUrl: string;
  notes: string;
}

export const PROVIDERS: ProviderProfile[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    requestsPerMinute: 60,
    tokensPerMinute: 200_000,
    maxConcurrentPerKey: 20,
    hasTiers: true,
    keyUrl: "https://openrouter.ai/keys",
    notes: "One key reaches hundreds of models, including open-weight GGUF-equivalent endpoints. The usual first choice for agent swarms.",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    requestsPerMinute: 50,
    tokensPerMinute: 40_000,
    maxConcurrentPerKey: 5,
    hasTiers: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    notes: "Standard tier is conservative; usage-based tiers raise limits after spend history. Strong for reviewer/verifier roles.",
  },
  {
    id: "openai",
    name: "OpenAI",
    requestsPerMinute: 500,
    tokensPerMinute: 200_000,
    maxConcurrentPerKey: 20,
    hasTiers: true,
    keyUrl: "https://platform.openai.com/api-keys",
    notes: "Limits scale with spend tier. Widely supported tool-calling format.",
  },
  {
    id: "google",
    name: "Google AI (Gemini)",
    requestsPerMinute: 15,
    tokensPerMinute: 1_000_000,
    maxConcurrentPerKey: 10,
    hasTiers: true,
    keyUrl: "https://aistudio.google.com/app/apikey",
    notes: "Low RPM but very high TPM: good for few agents with long prompts, poor for many small rapid calls.",
  },
  {
    id: "groq",
    name: "Groq",
    requestsPerMinute: 30,
    tokensPerMinute: 60_000,
    maxConcurrentPerKey: 10,
    hasTiers: true,
    keyUrl: "https://console.groq.com/keys",
    notes: "Very fast tokens/sec on open models. Excellent single-agent latency; per-key concurrency is the binding limit for swarms.",
  },
  {
    id: "mistral",
    name: "Mistral",
    requestsPerMinute: 60,
    tokensPerMinute: 150_000,
    maxConcurrentPerKey: 15,
    hasTiers: true,
    keyUrl: "https://console.mistral.ai/api-keys",
    notes: "Balanced limits; open-weight options allow hybrid local+API swarms.",
  },
];

// ─── Demand model ──────────────────────────────────────────────────────────────

export interface AgentDemand {
  /** Requests each agent makes per minute while active */
  requestsPerMinutePerAgent: number;
  /** Tokens (prompt + completion) each agent consumes per minute */
  tokensPerMinutePerAgent: number;
  /** Agents that run concurrently (a pipeline runs fewer than a mesh) */
  concurrentAgents: number;
}

/** Default demand profile for a typical agent loop: one decision every ~6 s, ~1.5K tokens/min. */
export const DEFAULT_AGENT_DEMAND: AgentDemand = {
  requestsPerMinutePerAgent: 10,
  tokensPerMinutePerAgent: 1_500,
  concurrentAgents: 4,
};

// ─── Analysis ──────────────────────────────────────────────────────────────────

export interface KeyAnalysis {
  provider: string;
  singleKeySufficient: boolean;
  /** How many agents ONE key can serve before hitting the tightest limit */
  maxAgentsPerKey: number;
  /** Keys needed for the requested concurrent agents */
  keysNeeded: number;
  /** Which limit binds first, with the numbers that decided it */
  bindingLimit: string;
  recommendations: string[];
}

/**
 * The core mechanism: compute how many agents one key serves under each
 * limit (RPM, TPM, concurrency), take the MINIMUM — the tightest limit
 * binds — then divide the requested agent count by it.
 */
export function analyzeKeyRequirement(
  provider: ProviderProfile,
  demand: AgentDemand,
): KeyAnalysis {
  const byRpm = Math.floor(provider.requestsPerMinute / Math.max(1, demand.requestsPerMinutePerAgent));
  const byTpm = Math.floor(provider.tokensPerMinute / Math.max(1, demand.tokensPerMinutePerAgent));
  const byConc = provider.maxConcurrentPerKey;

  const maxAgentsPerKey = Math.max(1, Math.min(byRpm, byTpm, byConc));
  const keysNeeded = Math.max(1, Math.ceil(demand.concurrentAgents / maxAgentsPerKey));

  let bindingLimit: string;
  if (maxAgentsPerKey === byConc && byConc <= byRpm && byConc <= byTpm) {
    bindingLimit = `Concurrent-request limit: ${provider.maxConcurrentPerKey} simultaneous calls per key (agents idle-wait above this)`;
  } else if (maxAgentsPerKey === byTpm) {
    bindingLimit = `Token limit: ${demand.tokensPerMinutePerAgent.toLocaleString()} tokens/agent/min vs ${provider.tokensPerMinute.toLocaleString()} TPM per key`;
  } else {
    bindingLimit = `Request limit: ${demand.requestsPerMinutePerAgent} requests/agent/min vs ${provider.requestsPerMinute} RPM per key`;
  }

  const recommendations: string[] = [];
  if (singleKeySufficientFor(demand.concurrentAgents, maxAgentsPerKey)) {
    recommendations.push(
      `One ${provider.name} key is sufficient: your ${demand.concurrentAgents} concurrent agents fit within ${maxAgentsPerKey}.`,
    );
    recommendations.push(
      "Add a second key only when you raise concurrency or a burst exhausts the per-minute budget.",
    );
  } else {
    recommendations.push(
      `One key serves ${maxAgentsPerKey} concurrent agents on ${provider.name}; you need ${keysNeeded} keys for ${demand.concurrentAgents}. Rotate keys across agents rather than assigning per-agent.`,
    );
    if (provider.hasTiers) {
      recommendations.push(
        "Alternatively, a higher provider tier raises the per-key ceiling without more keys.",
      );
    }
    recommendations.push(
      "Hybrid option: run the planner/reviewer roles locally on GGUF and spend API calls only on coder/tester roles.",
    );
  }
  return {
    provider: provider.name,
    singleKeySufficient: keysNeeded === 1,
    maxAgentsPerKey,
    keysNeeded,
    bindingLimit,
    recommendations,
  };
}

function singleKeySufficientFor(concurrent: number, perKey: number): boolean {
  return concurrent <= perKey;
}

/** Analyze every provider at once so the UI can rank options. */
export function analyzeAllProviders(demand: AgentDemand): KeyAnalysis[] {
  return PROVIDERS.map((p) => analyzeKeyRequirement(p, demand))
    .sort((a, b) => b.maxAgentsPerKey - a.maxAgentsPerKey);
}
