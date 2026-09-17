/**
 * stitaP Inference Router — Legacy Server Support
 *
 * Handles the specific failure modes of running modern GGUF inference
 * on 15+ year old server hardware:
 * - Missing SIMD instruction sets (silent performance cliff)
 * - Multi-socket NUMA topology (cross-socket contention)
 * - Ancient glibc/GCC (static linking or musl needed)
 * - Old GGUF format (need recent build even on old OS)
 */

import type { LegacyServerProfile, SystemInfo } from "./types";

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Detect legacy server characteristics and recommend a build strategy.
 * This is the entry point for the legacy support system.
 */
export function detectLegacyProfile(sysInfo: SystemInfo): LegacyServerProfile {
  const hasAVX2 = probeInstructionSet(sysInfo, "avx2");
  const hasAVX512 = probeInstructionSet(sysInfo, "avx512");
  const hasSSE42 = probeInstructionSet(sysInfo, "sse4.2");

  let detectedInstructionSet = "sse2";
  if (hasAVX512) detectedInstructionSet = "avx512";
  else if (hasAVX2) detectedInstructionSet = "avx2";
  else if (hasSSE42) detectedInstructionSet = "sse4.2";

  const numaTopology = buildNumaTopology(sysInfo);
  const oldOS = isOldOS(sysInfo);
  const needsStaticLink = oldOS || hasOldGlibc(sysInfo);

  return {
    needsStaticLink,
    detectedInstructionSet,
    hasAVX2,
    hasAVX512,
    numaTopology,
    kernelVersion: sysInfo.osVersion,
    glibcVersion: undefined, // detected at native layer
    recommendedFlags: buildCompileFlags(hasAVX2, hasAVX512, sysInfo.arch),
    containerizationRecommended: oldOS && !hasModernKernelFeatures(sysInfo),
    fallbackStrategy: determineFallback(sysInfo, hasAVX2, oldOS),
  };
}

/**
 * Given a legacy profile, provide actionable guidance for getting GGUF
 * inference running on the hardware.
 */
export function getLegacyGuidance(
  profile: LegacyServerProfile,
  sysInfo: SystemInfo,
): LegacyGuidance {
  const steps: GuidanceStep[] = [];
  const warnings: string[] = [];

  // Step 1: Binary compatibility
  if (profile.needsStaticLink) {
    steps.push({
      phase: "binary",
      title: "Use a statically linked or cross-compiled binary",
      detail: `This server's OS is old enough that a modern llama.cpp build may not run. Cross-compile on a modern machine with --static or build against musl libc, targeting ${sysInfo.arch}.`,
      command: profile.recommendedFlags.join(" "),
      risk: "low",
    });
  }

  // Step 2: Instruction set validation
  if (!profile.hasAVX2) {
    warnings.push(
      `No AVX2 detected — K-quant and IQ-quant matmul kernels will fall back to scalar code, reducing throughput significantly. Compile with -march=${profile.detectedInstructionSet} for the actual CPU.`,
    );
    steps.push({
      phase: "simd",
      title: "Match compilation target to actual CPU instruction set",
      detail: `The CPU supports ${profile.detectedInstructionSet}. Compiling with a generic x86_64 target may produce a binary that runs but silently uses slow scalar fallback paths for quantized matmul.`,
      command: `-march=${profile.detectedInstructionSet}`,
      risk: "medium",
    });
  }

  // Step 3: NUMA awareness
  if (profile.numaTopology.length > 1) {
    warnings.push(
      "Multi-socket NUMA detected. Without thread pinning, memory accesses cross inter-socket interconnect — dramatically slower than local access.",
    );
    steps.push({
      phase: "numa",
      title: "Enable NUMA-aware memory allocation and thread pinning",
      detail: `Server has ${profile.numaTopology.length} sockets. Use numactl to bind the process to a single socket's memory and cores, or enable llama.cpp's NUMA-awareness options.`,
      command: "numactl --cpunodebind=0 --membind=0 ./llama-server -m model.gguf",
      risk: "none",
    });
  }

  // Step 4: Container fallback
  if (profile.containerizationRecommended) {
    steps.push({
      phase: "container",
      title: "Consider containerization as a fallback",
      detail: "If static linking fails, run a modern Linux container. The container shares the host kernel but brings its own userspace (glibc, libstdc++).",
      command: "docker run --cpuset-cpus=0-7 --memory=32g -v ./models:/models llama-cpp:latest",
      risk: "low",
    });
  }

  // Step 5: Thread count optimization
  const totalCores = profile.numaTopology.reduce(
    (sum, socket) => sum + socket.coresPerSocket,
    0,
  );
  const recommendedThreads = profile.numaTopology.length > 1
    ? profile.numaTopology[0].coresPerSocket // one socket only
    : Math.floor(totalCores * 0.75); // leave headroom for OS
  steps.push({
    phase: "threads",
    title: "Set thread count to physical cores, not OS-reported total",
    detail: `OS reports ${totalCores} total cores${profile.numaTopology.length > 1 ? ` across ${profile.numaTopology.length} sockets` : ""}. Set threads to ${recommendedThreads} to avoid oversubscription.`,
    command: `-t ${recommendedThreads}`,
    risk: "none",
  });

  return {
    steps,
    warnings,
    profile,
    estimatedThroughputFactor: estimateLegacyThroughputFactor(profile),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuidanceStep {
  phase: "binary" | "simd" | "numa" | "container" | "threads";
  title: string;
  detail: string;
  command?: string;
  risk: "none" | "low" | "medium" | "high";
}

export interface LegacyGuidance {
  steps: GuidanceStep[];
  warnings: string[];
  profile: LegacyServerProfile;
  /** Estimated throughput as fraction of modern hardware */
  estimatedThroughputFactor: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function probeInstructionSet(
  _sysInfo: SystemInfo,
  _set: string,
): boolean {
  // In real implementation: check CPUID or /proc/cpuinfo
  // Desktop: assume AVX2; Server: may lack it depending on age
  return _sysInfo.arch === "x86_64";
}

function buildNumaTopology(
  sysInfo: SystemInfo,
): { socketCount: number; coresPerSocket: number; memoryPerSocketBytes: number }[] {
  // Default: single socket
  // Real implementation reads /sys/devices/system/node/node*/cpulist and meminfo
  const cores = Math.floor(
    (sysInfo.availableRamBytes / (1024 * 1024 * 1024)) * 0.5,
  );
  return [
    {
      socketCount: 1,
      coresPerSocket: Math.max(2, Math.min(cores, 32)),
      memoryPerSocketBytes: sysInfo.totalRamBytes,
    },
  ];
}

function isOldOS(sysInfo: SystemInfo): boolean {
  // Heuristic: Linux kernel < 4.x or very old Windows
  const v = sysInfo.osVersion;
  if (v.includes("Linux 2.") || v.includes("Linux 3.")) return true;
  if (v.includes("Windows NT 5.") || v.includes("Windows NT 6.0")) return true;
  return false;
}

function hasOldGlibc(_sysInfo: SystemInfo): boolean {
  // Detection requires native layer; approximate by OS age
  return isOldOS(_sysInfo);
}

function hasModernKernelFeatures(_sysInfo: SystemInfo): boolean {
  // Containers need: namespaces (3.8+), cgroups (2.6+)
  // Most kernels from 2012+ have these
  return !isOldOS(_sysInfo);
}

function buildCompileFlags(
  hasAVX2: boolean,
  hasAVX512: boolean,
  arch: string,
): string[] {
  const flags: string[] = ["-O3"];
  if (arch === "x86_64") {
    flags.push("-march=native");
    if (hasAVX512) {
      flags.push("-mavx512f", "-mavx512bw", "-mavx512vl", "-mavx512dq");
    } else if (hasAVX2) {
      flags.push("-mavx2", "-mfma", "-mbmi", "-mpopcnt");
    } else {
      flags.push("-msse4.2");
    }
  }
  if (arch === "aarch64") {
    flags.push("-mcpu=native");
  }
  flags.push("-static");
  return flags;
}

function determineFallback(
  sysInfo: SystemInfo,
  hasAVX2: boolean,
  oldOS: boolean,
): LegacyServerProfile["fallbackStrategy"] {
  if (oldOS && !hasAVX2) return "musl-static";
  if (oldOS) return "static-cross-compile";
  if (!hasAVX2) return "native"; // still runs, just slower
  return "native";
}

function estimateLegacyThroughputFactor(profile: LegacyServerProfile): number {
  let factor = 1.0;

  // AVX2 absence = major slowdown for quantized matmul
  if (!profile.hasAVX2) factor *= 0.3;

  // NUMA without pinning = cross-socket penalty
  if (profile.numaTopology.length > 1) factor *= 0.5;

  // Old OS with old glibc = some overhead from static linking
  if (profile.needsStaticLink) factor *= 0.95;

  return factor;
}
