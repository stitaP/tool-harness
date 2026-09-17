/**
 * stitaP Inference — Free-Provider Failover Router
 *
 * Plays with agents on FREE API tiers and never lets one vendor's
 * cutoff interrupt the session. When a provider rate-limits, exhausts
 * its daily quota, or goes down, the router shifts to the next healthy
 * provider IN THE BACKGROUND: chat APIs are stateless, so the whole
 * conversation is simply resent to the next endpoint mid-session.
 *
 * Design rules (from the platform's zero-interruption requirement):
 * - Circuit breaker per provider: failures open the circuit with an
 *   exponential cooldown; a half-open probe closes it on success.
 * - Key-level vs provider-level failures are distinguished: an invalid
 *   key (401) disables that KEY, not the whole provider.
 * - Daily quotas (RPD) are tracked locally so exhausted tiers are
 *   skipped proactively instead of burning a failed request.
 * - Every shift is recorded and surfaced, never hidden: the user sees
 *   "shifted Groq → Cerebras" after it happened, not a prompt for it.
 *
 * Zero dependencies. Transport is injectable for testing.
 */

// ─── Free-tier registry (verified June 2026, OpenRouter comparison) ───────────

export interface FreeProviderProfile {
  id: string;
  name: string;
  /** OpenAI-compatible chat completions endpoint */
  baseUrl: string;
  /** Default free model id to request */
  defaultModel: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  contextWindow: number;
  /** Where the user creates the free key */
  keyUrl: string;
  /** Honest trade-off of the free tier */
  tradeoff: string;
  /** Free tier may train on prompts */
  trainsOnData: boolean;
}

export const FREE_PROVIDERS: FreeProviderProfile[] = [
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    contextWindow: 128_000,
    keyUrl: "https://console.groq.com/keys",
    tradeoff: "Fastest free tier (LPU hardware); 1,000 requests/day.",
    trainsOnData: false,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    defaultModel: "llama-3.3-70b",
    requestsPerMinute: 30,
    requestsPerDay: 14_400, // ~1M tokens/day at typical sizes
    contextWindow: 128_000,
    keyUrl: "https://cloud.cerebras.ai",
    tradeoff: "~1M tokens/day at high throughput; great batch tier.",
    trainsOnData: false,
  },
  {
    id: "openrouter",
    name: "OpenRouter (free models)",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    requestsPerMinute: 20,
    requestsPerDay: 50,
    contextWindow: 1_000_000,
    keyUrl: "https://openrouter.ai/keys",
    tradeoff: "20+ free models behind one key; only 50 requests/day (1,000 with a $10 top-up).",
    trainsOnData: false,
  },
  {
    id: "google",
    name: "Google AI Studio",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-2.0-flash",
    requestsPerMinute: 15,
    requestsPerDay: 1500,
    contextWindow: 1_000_000,
    keyUrl: "https://aistudio.google.com/app/apikey",
    tradeoff: "1M context; prompts may train Google models outside EU/UK.",
    trainsOnData: true,
  },
  {
    id: "mistral",
    name: "Mistral (Experiment tier)",
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "mistral-small-latest",
    requestsPerMinute: 20,
    requestsPerDay: 7200,
    contextWindow: 32_768,
    keyUrl: "https://console.mistral.ai/api-keys",
    tradeoff: "~1B tokens/month — the largest free volume; requires opting into data training.",
    trainsOnData: true,
  },
  {
    id: "github-models",
    name: "GitHub Models",
    baseUrl: "https://models.inference.ai.azure.com/chat/completions",
    defaultModel: "gpt-4o",
    requestsPerMinute: 15,
    requestsPerDay: 150,
    contextWindow: 128_000,
    keyUrl: "https://github.com/settings/personal-access-tokens",
    tradeoff: "Frontier models (GPT-4o) free with a GitHub account; low daily caps.",
    trainsOnData: false,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    defaultModel: "llama-3.3-70b-instruct-fp8-fast",
    requestsPerMinute: 60,
    requestsPerDay: 10_000, // ~10K neurons/day
    contextWindow: 8_192,
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    tradeoff: "Edge-fast with generous request budgets; small context windows.",
    trainsOnData: false,
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    defaultModel: "meta/llama-3.3-70b-instruct",
    requestsPerMinute: 40,
    requestsPerDay: 1000,
    contextWindow: 128_000,
    keyUrl: "https://build.nvidia.com",
    tradeoff: "Nemotron and Llama variants; ~1,000 requests/day.",
    trainsOnData: false,
  },
  {
    id: "cohere",
    name: "Cohere (trial key)",
    baseUrl: "https://api.cohere.ai/v1/chat",
    defaultModel: "command-r-plus",
    requestsPerMinute: 20,
    requestsPerDay: 100,
    contextWindow: 128_000,
    keyUrl: "https://dashboard.cohere.com/api-keys",
    tradeoff: "Strong RAG model; ~100 requests/day and non-commercial only.",
    trainsOnData: false,
  },
];

// ─── Health tracking ───────────────────────────────────────────────────────────

export type ProviderStatus = "idle" | "healthy" | "cooling" | "exhausted" | "key-invalid" | "down";

export interface ProviderHealth {
  providerId: string;
  status: ProviderStatus;
  /** Consecutive failures without a success */
  consecutiveFailures: number;
  /** Epoch ms until which the circuit is open */
  coolingUntil: number;
  /** Requests served successfully, this session */
  served: number;
  /** Requests sent today (local quota estimate) */
  sentToday: number;
  /** Day stamp (local date) for quota reset */
  quotaDay: string;
  lastError?: string;
  lastLatencyMs?: number;
}

export interface ShiftEvent {
  at: number;
  from: string | null;
  to: string;
  reason: string;
}

// ─── Error classification ──────────────────────────────────────────────────────

export type FailureKind = "rate-limit" | "quota" | "invalid-key" | "server" | "network";

export function classifyFailure(status: number | undefined, body?: string): FailureKind {
  if (status === 401 || status === 403) return "invalid-key";
  if (status === 402) return "quota";
  if (status === 429) return "rate-limit";
  if (status !== undefined && status >= 500) return "server";
  if (status === undefined) return "network";
  if (body && /quota|exceeded|billing/i.test(body)) return "quota";
  return "server";
}

const COOLDOWN_MS: Record<FailureKind, number> = {
  "rate-limit": 60_000,
  quota: 6 * 60 * 60 * 1000, // daily quotas: cool for hours
  "invalid-key": Number.MAX_SAFE_INTEGER, // needs a new key, never auto-retry
  server: 30_000,
  network: 15_000,
};

// ─── The router ────────────────────────────────────────────────────────────────

export type Transport = (
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
) => Promise<{ ok: boolean; status?: number; text: string }>;

/** Default transport: OpenAI-compatible chat completions over fetch. */
export const defaultTransport: Transport = async (url, apiKey, body) => {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  return { ok: resp.ok, status: resp.status, text: await resp.text() };
};

export interface CompletionRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  /** Provider that actually served the request */
  servedBy: string;
  model: string;
  latencyMs: number;
  /** Providers tried before success (empty when first try worked) */
  shiftedFrom: Array<{ provider: string; reason: string }>;
}

export class FailoverRouter {
  private keys = new Map<string, string>(); // providerId -> key
  private health = new Map<string, ProviderHealth>();
  private shifts: ShiftEvent[] = [];
  private transport: Transport;
  /** Consecutive failures before the circuit opens */
  private threshold: number;

  constructor(opts?: { transport?: Transport; failureThreshold?: number }) {
    this.transport = opts?.transport ?? defaultTransport;
    this.threshold = opts?.failureThreshold ?? 2;
  }

  /** Register (or replace) a free-tier key. */
  setKey(providerId: string, key: string): void {
    this.keys.set(providerId, key);
    const h = this.healthFor(providerId);
    if (h.status === "key-invalid") {
      h.status = "idle";
      h.consecutiveFailures = 0;
      h.lastError = undefined;
    }
  }

  removeKey(providerId: string): void {
    this.keys.delete(providerId);
    this.health.delete(providerId);
  }

  getKey(providerId: string): string | undefined {
    return this.keys.get(providerId);
  }

  registeredProviders(): string[] {
    return [...this.keys.keys()];
  }

  getHealth(): ProviderHealth[] {
    return [...this.health.values()].map((h) => ({ ...h }));
  }

  getShifts(): ShiftEvent[] {
    return [...this.shifts];
  }

  /**
   * Complete a chat request, failing over transparently. Order: healthy
   * providers by fewest-failures first, then idle, then cooling circuits
   * whose cooldown expired (half-open probe). Exhausted and key-invalid
   * providers are skipped entirely.
   */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const candidates = this.candidateOrder();
    if (candidates.length === 0) {
      throw new Error(
        "No API keys registered. Add at least one free-tier key (Groq, Cerebras, Google AI Studio, Mistral, GitHub Models…) in the notebook's Configure panel — they all have permanent free tiers.",
      );
    }

    const shiftedFrom: Array<{ provider: string; reason: string }> = [];
    let lastError: Error | null = null;

    for (const provider of candidates) {
      const profile = FREE_PROVIDERS.find((p) => p.id === provider)!;
      const key = this.keys.get(provider)!;
      const h = this.healthFor(provider);
      if (h.sentToday >= profile.requestsPerDay) {
        this.markExhausted(provider, "daily quota reached (tracked locally)");
        continue;
      }

      const started = Date.now();
      try {
        const res = await this.transport(profile.baseUrl, key, {
          model: req.model ?? profile.defaultModel,
          messages: req.messages,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        });
        h.sentToday++;
        if (res.ok) {
          const parsed = JSON.parse(res.text);
          const text =
            parsed?.choices?.[0]?.message?.content ??
            parsed?.content?.[0]?.text ?? // cohere shape
            "";
          this.markSuccess(provider, Date.now() - started);
          if (shiftedFrom.length > 0) {
            this.shifts.push({
              at: Date.now(),
              from: shiftedFrom[shiftedFrom.length - 1]?.provider ?? null,
              to: provider,
              reason: shiftedFrom.map((s) => `${s.provider}: ${s.reason}`).join("; "),
            });
          }
          return {
            text,
            servedBy: profile.name,
            model: req.model ?? profile.defaultModel,
            latencyMs: Date.now() - started,
            shiftedFrom,
          };
        }
        const kind = classifyFailure(res.status, res.text);
        this.markFailure(provider, kind, `HTTP ${res.status}`);
        shiftedFrom.push({
          provider: profile.name,
          reason:
            kind === "rate-limit"
              ? "rate-limited"
              : kind === "quota"
                ? "quota exhausted"
                : kind === "invalid-key"
                  ? "key rejected"
                  : "server error",
        });
        lastError = new Error(`${profile.name}: HTTP ${res.status}`);
      } catch (err) {
        const kind = classifyFailure(undefined);
        this.markFailure(provider, kind, err instanceof Error ? err.message : String(err));
        shiftedFrom.push({ provider: profile.name, reason: "unreachable" });
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error("All providers failed");
  }

  /** Ordered candidate provider ids for the next request. */
  private candidateOrder(): string[] {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const entries = [...this.keys.keys()];
    return entries
      .filter((id) => {
        const h = this.health.get(id);
        if (!h) return true;
        if (h.status === "key-invalid" || h.status === "exhausted") return false;
        if (h.status === "cooling" && h.coolingUntil > now) return false;
        // Half-open: an expired cooldown gets one probe chance.
        return true;
      })
      .sort((a, b) => this.score(b, today) - this.score(a, today));
  }

  /** Higher score = tried earlier. Healthy and fresh beats cooling and tired. */
  private score(id: string, today: string): number {
    const h = this.health.get(id);
    if (!h) return 100;
    let s = 100;
    if (h.status === "healthy") s += 50;
    if (h.quotaDay !== today) s += 20; // quota likely reset
    s -= h.consecutiveFailures * 10;
    s -= Math.floor((h.sentToday / 10_000) * 10); // prefer less-used
    return s;
  }

  private healthFor(id: string): ProviderHealth {
    let h = this.health.get(id);
    if (!h) {
      h = {
        providerId: id,
        status: "idle",
        consecutiveFailures: 0,
        coolingUntil: 0,
        served: 0,
        sentToday: 0,
        quotaDay: new Date().toISOString().slice(0, 10),
      };
      this.health.set(id, h);
    }
    const today = new Date().toISOString().slice(0, 10);
    if (h.quotaDay !== today) {
      h.quotaDay = today;
      h.sentToday = 0;
      if (h.status === "exhausted") h.status = "idle";
    }
    return h;
  }

  private markSuccess(id: string, latencyMs: number): void {
    const h = this.healthFor(id);
    h.status = "healthy";
    h.consecutiveFailures = 0;
    h.coolingUntil = 0;
    h.served++;
    h.lastLatencyMs = latencyMs;
    h.lastError = undefined;
  }

  private markFailure(id: string, kind: FailureKind, detail: string): void {
    const h = this.healthFor(id);
    h.consecutiveFailures++;
    h.lastError = `${kind}: ${detail}`;
    if (kind === "invalid-key") {
      h.status = "key-invalid";
      return;
    }
    if (kind === "quota") {
      h.status = "exhausted";
      return;
    }
    if (h.consecutiveFailures >= this.threshold) {
      h.status = "cooling";
      const base = COOLDOWN_MS[kind];
      h.coolingUntil = Date.now() + base * Math.pow(2, h.consecutiveFailures - this.threshold);
    }
  }

  private markExhausted(id: string, detail: string): void {
    const h = this.healthFor(id);
    h.status = "exhausted";
    h.lastError = detail;
  }
}
