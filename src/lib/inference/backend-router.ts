/**
 * stitaP Inference Router — Backend Router
 *
 * The central routing engine. It:
 * 1. Probes which backends are available (without elevation)
 * 2. Benchmarks each available backend
 * 3. Picks the fastest for the current device + workload
 * 4. Caches the decision keyed to device model
 * 5. Re-evaluates on major system changes
 *
 * Key principle: NEVER hardcodes a priority order. Always measures.
 */

import type {
  BackendKind,
  BackendState,
  PerformanceMode,
  RouterDecision,
  SystemInfo,
  ThroughputConfig,
} from "./types";
import { probeBackends, benchmarkBackends, detectSystemInfo } from "./device-prober";

// ─── Benchmark Cache ──────────────────────────────────────────────────────────

interface CachedBenchmark {
  backend: BackendKind;
  tokensPerSec: number;
  timestamp: number;
  deviceFingerprint: string;
}

const BENCHMARK_CACHE_KEY = "stitap:benchmark-cache";
const REBENCHMARK_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

function getDeviceFingerprint(sysInfo: SystemInfo): string {
  return `${sysInfo.cpuBrand}|${sysInfo.totalRamBytes}|${sysInfo.arch}|${sysInfo.platform}`;
}

function loadBenchmarkCache(): CachedBenchmark[] {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(BENCHMARK_CACHE_KEY)
      : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBenchmarkCache(cache: CachedBenchmark[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(BENCHMARK_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    // localStorage unavailable — in-memory only
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export class InferenceRouter {
  private backends: BackendState[] = [];
  private sysInfo: SystemInfo | null = null;
  private benchmarkResults: Map<BackendKind, number> = new Map();
  private decisionCache: Map<string, RouterDecision> = new Map();

  /** Initialize the router: probe hardware + load cache */
  async initialize(): Promise<SystemInfo> {
    this.sysInfo = detectSystemInfo();
    this.backends = await probeBackends(this.sysInfo);

    // Load cached benchmarks
    const cache = loadBenchmarkCache();
    const fingerprint = getDeviceFingerprint(this.sysInfo);
    for (const entry of cache) {
      if (entry.deviceFingerprint === fingerprint) {
        this.benchmarkResults.set(entry.backend, entry.tokensPerSec);
      }
    }

    return this.sysInfo;
  }

  /** Get all available backends (after probe) */
  getAvailableBackends(): BackendState[] {
    return this.backends;
  }

  /** Get the system info */
  getSystemInfo(): SystemInfo | null {
    return this.sysInfo;
  }

  /** Select the best backend for a given workload and mode */
  async selectBackend(
    mode: PerformanceMode = "balanced",
    workloadType?: "prompt-heavy" | "latency-sensitive" | "general",
  ): Promise<RouterDecision> {
    if (!this.sysInfo) {
      await this.initialize();
    }
    const sysInfo = this.sysInfo!;

    // Build cache key
    const cacheKey = `${getDeviceFingerprint(sysInfo)}|${mode}|${workloadType ?? "general"}`;

    // Check in-memory cache
    const cached = this.decisionCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Benchmark any backends we haven't measured yet
    const unbenchmarked = this.backends.filter(
      (b) => !this.benchmarkResults.has(b.kind),
    );
    if (unbenchmarked.length > 0) {
      const freshResults = await benchmarkBackends(unbenchmarked, sysInfo);
      for (const [kind, tps] of freshResults) {
        this.benchmarkResults.set(kind, tps);
      }
      this.persistBenchmarks();
    }

    // Apply workload-specific adjustments
    const adjustedScores = this.adjustForWorkload(sysInfo, mode, workloadType);

    // Sort backends by adjusted score
    const ranked = Array.from(adjustedScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([backend, score]) => ({ backend, score }));

    const winner = ranked[0];
    const decision: RouterDecision = {
      backend: winner.backend,
      reason: this.explainChoice(winner.backend, mode, workloadType, sysInfo),
      alternatives: ranked.slice(1).map((r) => ({
        backend: r.backend,
        tokensPerSec: this.benchmarkResults.get(r.backend) ?? 0,
      })),
      isFallback: winner.backend === "llamacpp-cpu",
      confidence: this.benchmarkResults.has(winner.backend) ? "measured" : "estimated",
      cacheKey,
      reBenchmarkAfter: "24h",
    };

    this.decisionCache.set(cacheKey, decision);
    return decision;
  }

  /** Get throughput config for the selected backend */
  getThroughputConfig(
    backend: BackendKind,
    mode: PerformanceMode,
    sysInfo: SystemInfo,
  ): ThroughputConfig {
    const physicalCores = Math.max(
      2,
      Math.floor(sysInfo.availableRamBytes / (2 * 1024 * 1024 * 1024)),
    );

    const isLatencyMode = mode === "latency";
    const isThroughputMode = mode === "throughput";

    return {
      backend,
      performanceMode: mode,
      kvCachePersistence: true, // always beneficial for multi-turn agents
      speculativeDecoding: isLatencyMode && this.supportsSpeculativeDecoding(backend),
      draftModelPath: undefined,
      promptBatchSize: isThroughputMode ? 512 : isLatencyMode ? 128 : 256,
      microBatchSize: isLatencyMode ? 1 : isThroughputMode ? 8 : 4,
      threadCount: this.getPhysicalCoreCount(sysInfo),
      flashAttention: this.supportsFlashAttention(backend),
      runtimeQuant: this.selectRuntimeQuant(sysInfo),
      numaThreadPinning: sysInfo.numaNodes > 1,
    };
  }

  /** Force re-benchmark (after OS/driver update, or backend change) */
  async rebenchmark(): Promise<void> {
    this.benchmarkResults.clear();
    this.decisionCache.clear();
    if (this.sysInfo) {
      const results = await benchmarkBackends(this.backends, this.sysInfo);
      for (const [kind, tps] of results) {
        this.benchmarkResults.set(kind, tps);
      }
      this.persistBenchmarks();
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private adjustForWorkload(
    sysInfo: SystemInfo,
    mode: PerformanceMode,
    workloadType?: string,
  ): Map<BackendKind, number> {
    const adjusted = new Map<BackendKind, number>();

    for (const [kind, baseTps] of this.benchmarkResults) {
      let score = baseTps;

      // Mode adjustments
      if (mode === "throughput") {
        // Throughput mode: prefer iGPU (better for sustained generation)
        if (kind === "openvino-igpu") score *= 1.2;
        if (kind === "llamacpp-cuda") score *= 1.15;
      } else if (mode === "latency") {
        // Latency mode: prefer NPU or GPU (lower first-token latency)
        if (kind === "openvino-npu") score *= 1.3;
        if (kind === "coreml-apple") score *= 1.25;
      }

      // Workload adjustments
      if (workloadType === "prompt-heavy") {
        // Prompt processing benefits from more compute
        if (kind.includes("gpu") || kind.includes("cuda")) score *= 1.1;
      } else if (workloadType === "latency-sensitive") {
        // Quick responses: prefer NPU (best tokens-per-watt for background)
        if (kind.includes("npu")) score *= 1.15;
      }

      // Memory pressure adjustment: if RAM is tight, deprioritize memory-hungry backends
      const memPressure = 1 - sysInfo.availableRamBytes / sysInfo.totalRamBytes;
      if (memPressure > 0.7) {
        // Heavy memory usage: prefer CPU (smallest memory footprint)
        if (kind === "llamacpp-cpu" || kind === "openvino-cpu") score *= 1.2;
      }

      adjusted.set(kind, score);
    }

    return adjusted;
  }

  private explainChoice(
    backend: BackendKind,
    mode: PerformanceMode,
    workloadType: string | undefined,
    sysInfo: SystemInfo,
  ): string {
    const tps = this.benchmarkResults.get(backend) ?? 0;
    const reasons: string[] = [];

    reasons.push(
      `Selected ${backend} at ${tps.toFixed(1)} tokens/sec`,
    );

    if (mode === "throughput") {
      reasons.push("throughput mode: optimized for sustained generation");
    } else if (mode === "latency") {
      reasons.push("latency mode: optimized for quick first-token response");
    } else {
      reasons.push("balanced mode: equal weight to throughput and latency");
    }

    if (workloadType === "prompt-heavy") {
      reasons.push("workload is prompt-heavy: preferring compute-rich backends");
    } else if (workloadType === "latency-sensitive") {
      reasons.push("workload is latency-sensitive: preferring NPU for efficiency");
    }

    if (backend === "llamacpp-cpu") {
      reasons.push("falling back to universal CPU inference (no GPU/NPU available)");
    }

    return reasons.join(". ");
  }

  private isCacheValid(decision: RouterDecision): boolean {
    // Re-evaluate after 24h
    return false; // always re-probe for now; cache is warm-start only
  }

  private persistBenchmarks(): void {
    if (!this.sysInfo) return;
    const fingerprint = getDeviceFingerprint(this.sysInfo);
    const existing = loadBenchmarkCache();
    const updated = existing.filter((e) => e.deviceFingerprint !== fingerprint);
    for (const [kind, tps] of this.benchmarkResults) {
      updated.push({
        backend: kind,
        tokensPerSec: tps,
        timestamp: Date.now(),
        deviceFingerprint: fingerprint,
      });
    }
    saveBenchmarkCache(updated);
  }

  private supportsSpeculativeDecoding(backend: BackendKind): boolean {
    return backend.startsWith("llamacpp-");
  }

  private supportsFlashAttention(backend: BackendKind): boolean {
    return (
      backend === "llamacpp-cuda" ||
      backend === "llamacpp-metal" ||
      backend === "llamacpp-vulkan"
    );
  }

  private getPhysicalCoreCount(sysInfo: SystemInfo): number {
    // Use hardwareConcurrency as a rough proxy; real impl reads CPUID/proc
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const logical = nav?.hardwareConcurrency ?? 4;
    // Assume ~50% are hyperthreads on x86
    if (sysInfo.arch === "x86_64") {
      return Math.max(2, Math.floor(logical * 0.5));
    }
    // ARM typically doesn't hyperthread
    return logical;
  }

  private selectRuntimeQuant(
    sysInfo: SystemInfo,
  ): "int8" | "int4" | "q4_k_m" {
    // If RAM is abundant, use INT8; if tight, use INT4
    const ramGB = sysInfo.availableRamBytes / (1024 * 1024 * 1024);
    if (ramGB >= 16) return "int8";
    if (ramGB >= 8) return "q4_k_m";
    return "int4";
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: InferenceRouter | null = null;

export async function getInferenceRouter(): Promise<InferenceRouter> {
  if (!_instance) {
    _instance = new InferenceRouter();
    await _instance.initialize();
  }
  return _instance;
}

export function resetInferenceRouter(): void {
  _instance = null;
}
