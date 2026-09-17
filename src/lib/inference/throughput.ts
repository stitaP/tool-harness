/**
 * stitaP Inference Router — Throughput Optimizer
 *
 * Backend-level tuning that applies automatically once a model and backend
 * are selected. These are not user choices — they're engine-level levers
 * the system pulls because they don't trade off against quality.
 */

import type {
  BackendKind,
  PerformanceMode,
  ThroughputConfig,
  SystemInfo,
} from "./types";

// ─── Optimizer ────────────────────────────────────────────────────────────────

export interface OptimizationPlan {
  backend: BackendKind;
  config: ThroughputConfig;
  expectedSpeedup: number; // multiplier over unoptimized
  optimizations: AppliedOptimization[];
}

export interface AppliedOptimization {
  name: string;
  description: string;
  estimatedSpeedup: number;
  riskLevel: "none" | "low" | "medium";
}

/** Generate a complete optimization plan for the selected backend */
export function buildOptimizationPlan(
  backend: BackendKind,
  mode: PerformanceMode,
  sysInfo: SystemInfo,
): OptimizationPlan {
  const optimizations: AppliedOptimization[] = [];
  let totalSpeedup = 1.0;

  // ── Universal optimizations ───────────────────────────────────────────────

  // Thread count: always match physical cores, not logical
  const physicalCores = getPhysicalCores(sysInfo);
  optimizations.push({
    name: "thread-count",
    description: `Thread count set to ${physicalCores} (physical cores, not ${physicalCores * 2} logical)`,
    estimatedSpeedup: 1.15,
    riskLevel: "none",
  });
  totalSpeedup *= 1.15;

  // KV-cache persistence for multi-turn agents
  optimizations.push({
    name: "kv-cache-persistence",
    description: "KV-cache retained between turns — only new tokens processed each turn",
    estimatedSpeedup: 2.0,
    riskLevel: "none",
  });
  totalSpeedup *= 2.0;

  // ── Backend-specific optimizations ────────────────────────────────────────

  if (backend.startsWith("openvino-")) {
    applyOpenVINOOpts(optimizations, backend, mode);
    totalSpeedup *= getOpenVINOExpectedSpeedup(mode);
  } else if (backend.startsWith("llamacpp-")) {
    applyLlamacppOpts(optimizations, backend, mode, sysInfo);
    totalSpeedup *= getLlamacppExpectedSpeedup(backend, mode);
  } else if (backend === "qnn-snapdragon") {
    applySnapdragonOpts(optimizations, mode);
    totalSpeedup *= 1.3;
  } else if (backend === "coreml-apple") {
    applyAppleOpts(optimizations, mode);
    totalSpeedup *= 1.25;
  } else if (backend === "apu-mediatek") {
    applyMediaTekOpts(optimizations, mode);
    totalSpeedup *= 1.2;
  }

  const config = buildThroughputConfig(backend, mode, sysInfo);

  return {
    backend,
    config,
    expectedSpeedup: totalSpeedup,
    optimizations,
  };
}

// ─── OpenVINO Optimizations ──────────────────────────────────────────────────

function applyOpenVINOOpts(
  opts: AppliedOptimization[],
  backend: BackendKind,
  mode: PerformanceMode,
): void {
  // INT8 quantization for CPU/iGPU; INT4 for NPU (memory bandwidth bound)
  const runtimeQuant = backend === "openvino-npu" ? "int4" : "int8";
  opts.push({
    name: "openvino-quant",
    description: `${runtimeQuant.toUpperCase()} quantization via NNCF — single biggest throughput lever`,
    estimatedSpeedup: backend === "openvino-npu" ? 2.0 : 1.6,
    riskLevel: "low",
  });

  // Performance mode hint
  const perfMode =
    mode === "throughput"
      ? "throughput (max parallel streams)"
      : "latency (single-stream, lowest first-token delay)";
  opts.push({
    name: "openvino-perf-mode",
    description: `Performance mode: ${perfMode}`,
    estimatedSpeedup: mode === "throughput" ? 1.3 : 1.1,
    riskLevel: "none",
  });

  // Device choice rationale
  if (backend === "openvino-npu") {
    opts.push({
      name: "device-choice",
      description:
        "NPU selected for best tokens-per-watt — ideal for background/continuous agents",
      estimatedSpeedup: 1.0,
      riskLevel: "none",
    });
  } else if (backend === "openvino-igpu") {
    opts.push({
      name: "device-choice",
      description:
        "iGPU selected for best raw tokens/sec — ideal for interactive bursts",
      estimatedSpeedup: 1.0,
      riskLevel: "none",
    });
  }
}

function getOpenVINOExpectedSpeedup(mode: PerformanceMode): number {
  if (mode === "throughput") return 1.5;
  if (mode === "latency") return 1.2;
  return 1.35;
}

// ─── llama.cpp Optimizations ─────────────────────────────────────────────────

function applyLlamacppOpts(
  opts: AppliedOptimization[],
  backend: BackendKind,
  mode: PerformanceMode,
  sysInfo: SystemInfo,
): void {
  // Memory-mapped loading (always)
  opts.push({
    name: "mmap-loading",
    description: "GGUF loaded via memory-mapping — zero-copy, OS page cache handles repeats",
    estimatedSpeedup: 1.1,
    riskLevel: "none",
  });

  // Speculative decoding for latency mode
  if (mode === "latency" && backend !== "llamacpp-cpu") {
    opts.push({
      name: "speculative-decoding",
      description:
        "Draft model proposes candidate tokens; main model verifies in parallel — 1.5–2.5x for structured output",
      estimatedSpeedup: 1.8,
      riskLevel: "none",
    });
  }

  // Flash attention
  if (backend === "llamacpp-cuda" || backend === "llamacpp-metal" || backend === "llamacpp-vulkan") {
    opts.push({
      name: "flash-attention",
      description:
        "Flash attention reduces KV-cache memory and speeds up long-context generation",
      estimatedSpeedup: 1.3,
      riskLevel: "none",
    });
  }

  // Batch size tuning
  if (mode === "throughput") {
    opts.push({
      name: "batch-tuning",
      description:
        "Large prompt batch (512) + micro-batch (8) for maximum throughput on prompt-heavy workloads",
      estimatedSpeedup: 1.2,
      riskLevel: "none",
    });
  } else if (mode === "latency") {
    opts.push({
      name: "batch-tuning",
      description:
        "Small batches (128/1) for minimum first-token latency on interactive queries",
      estimatedSpeedup: 1.1,
      riskLevel: "none",
    });
  }

  // Quantization level
  const ramGB = sysInfo.availableRamBytes / (1024 * 1024 * 1024);
  if (ramGB >= 16) {
    opts.push({
      name: "quant-level",
      description: "Q4_K_M quantization — sweet spot for throughput and quality",
      estimatedSpeedup: 1.0,
      riskLevel: "none",
    });
  } else {
    opts.push({
      name: "quant-level",
      description:
        "Q4_0 quantization — tight memory constraint, slightly faster but lower quality",
      estimatedSpeedup: 1.05,
      riskLevel: "low",
    });
  }

  // NUMA pinning for multi-socket
  if (sysInfo.numaNodes > 1) {
    opts.push({
      name: "numa-pinning",
      description:
        "NUMA thread pinning — threads bound to same socket as their memory, avoiding cross-socket contention",
      estimatedSpeedup: 1.4,
      riskLevel: "none",
    });
  }
}

function getLlamacppExpectedSpeedup(
  backend: BackendKind,
  mode: PerformanceMode,
): number {
  let base = 1.0;
  if (backend === "llamacpp-cuda") base = 1.8;
  else if (backend === "llamacpp-metal") base = 1.6;
  else if (backend === "llamacpp-vulkan") base = 1.4;
  else base = 1.0; // CPU

  if (mode === "latency") base *= 1.3; // speculative decoding benefit
  return base;
}

// ─── Mobile Optimizations ────────────────────────────────────────────────────

function applySnapdragonOpts(
  opts: AppliedOptimization[],
  _mode: PerformanceMode,
): void {
  opts.push({
    name: "full-graph-npu",
    description:
      "Validate full graph runs on Hexagon NPU — any CPU fallback mid-graph erases NPU speed advantage",
    estimatedSpeedup: 1.5,
    riskLevel: "medium",
  });
  opts.push({
    name: "thermal-monitoring",
    description:
      "Periodic re-benchmarking: sustained throughput on warm device can be 2–3x lower than cold-start",
    estimatedSpeedup: 1.0,
    riskLevel: "none",
  });
}

function applyAppleOpts(
  opts: AppliedOptimization[],
  _mode: PerformanceMode,
): void {
  opts.push({
    name: "ane-placement-verify",
    description:
      "Verify actual Neural Engine placement post-export — Core ML silently falls back to GPU/CPU without warning when model exceeds ANE limits",
    estimatedSpeedup: 1.3,
    riskLevel: "medium",
  });
  opts.push({
    name: "thermal-monitoring",
    description:
      "Periodic re-benchmarking: ANE throughput drops significantly under thermal load",
    estimatedSpeedup: 1.0,
    riskLevel: "none",
  });
}

function applyMediaTekOpts(
  opts: AppliedOptimization[],
  _mode: PerformanceMode,
): void {
  opts.push({
    name: "generation-validation",
    description:
      "MediaTek APU instruction set varies between chipset generations — validate on target silicon specifically",
    estimatedSpeedup: 1.2,
    riskLevel: "medium",
  });
}

// ─── Config Builder ──────────────────────────────────────────────────────────

function buildThroughputConfig(
  backend: BackendKind,
  mode: PerformanceMode,
  sysInfo: SystemInfo,
): ThroughputConfig {
  const physicalCores = getPhysicalCores(sysInfo);
  const isLatency = mode === "latency";
  const isThroughput = mode === "throughput";

  return {
    backend,
    performanceMode: mode,
    kvCachePersistence: true,
    speculativeDecoding: isLatency && backend.startsWith("llamacpp-"),
    promptBatchSize: isThroughput ? 512 : isLatency ? 128 : 256,
    microBatchSize: isLatency ? 1 : isThroughput ? 8 : 4,
    threadCount: physicalCores,
    flashAttention: backend === "llamacpp-cuda" || backend === "llamacpp-metal" || backend === "llamacpp-vulkan",
    runtimeQuant: sysInfo.availableRamBytes / (1024 * 1024 * 1024) >= 16 ? "int8" : "q4_k_m",
    numaThreadPinning: sysInfo.numaNodes > 1,
  };
}

function getPhysicalCores(sysInfo: SystemInfo): number {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const logical = nav?.hardwareConcurrency ?? 4;
  if (sysInfo.arch === "x86_64") {
    return Math.max(2, Math.floor(logical * 0.5));
  }
  return logical;
}
