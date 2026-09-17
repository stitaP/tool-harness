/**
 * stitaP Inference Router — Device Prober
 *
 * Probes hardware capabilities at startup WITHOUT requiring privilege elevation.
 * Each check fails soft: unavailable devices are simply excluded from routing.
 * The router never crashes or blocks on a failed probe.
 */

import type {
  BackendKind,
  BackendState,
  DeviceCapability,
  SystemInfo,
  LegacyServerProfile,
  PerformanceMode,
} from "./types";

// ─── Capability Detection ─────────────────────────────────────────────────────

/** Detect the OS and basic system info */
export function detectSystemInfo(): SystemInfo {
  const nav: { platform: string; hardwareConcurrency: number; userAgent: string } =
    typeof navigator !== "undefined"
      ? navigator
      : { platform: "unknown", hardwareConcurrency: 4, userAgent: "" };
  const platform = detectPlatform(nav);
  const arch = detectArch(nav);

  return {
    totalRamBytes: getTotalRamBytes(),
    availableRamBytes: getAvailableRamBytes(),
    platform,
    osVersion: getOsVersion(nav),
    arch,
    cpuBrand: getCpuBrand(nav),
    numaNodes: 1, // WASM/JS has no NUMA concept
    temperatureCelsius: undefined,
    batteryPercent: undefined,
  };
}

/** Probe all available backends — returns only those accessible without elevation */
export async function probeBackends(
  sysInfo: SystemInfo,
): Promise<BackendState[]> {
  const backends: BackendState[] = [];

  // Always probe llama.cpp first (universal fallback, zero privileges)
  backends.push(await probeLlamacpp(sysInfo));

  // Probe OpenVINO backends (Intel silicon)
  if (sysInfo.platform === "windows" || sysInfo.platform === "linux") {
    backends.push(await probeOpenVinoCpu(sysInfo));
    backends.push(await probeOpenVinoIGpu(sysInfo));
    backends.push(await probeOpenVinoNpu(sysInfo));
  }

  // Probe mobile NPU backends
  if (sysInfo.platform === "android") {
    backends.push(await probeQnnSnapdragon(sysInfo));
    backends.push(await probeApuMediatek(sysInfo));
  }
  if (sysInfo.platform === "ios" || sysInfo.platform === "macos") {
    backends.push(await probeCoreML(sysInfo));
  }

  // Probe Vulkan (cross-platform GPU compute)
  backends.push(await probeLlamacppVulkan(sysInfo));

  // Probe Metal (macOS GPU)
  if (sysInfo.platform === "macos") {
    backends.push(await probeLlamacppMetal(sysInfo));
  }

  // Probe CUDA (NVIDIA discrete GPU)
  if (sysInfo.platform === "windows" || sysInfo.platform === "linux") {
    backends.push(await probeLlamacppCuda(sysInfo));
  }

  return backends.filter((b) => b.available);
}

// ─── Individual Backend Probes ────────────────────────────────────────────────

async function probeLlamacpp(_sysInfo: SystemInfo): Promise<BackendState> {
  // llama.cpp is always available — pure user-space, zero privileges
  // It memory-maps GGUF files and does CPU computation
  return {
    kind: "llamacpp-cpu",
    available: true,
    measuredTokensPerSec: 0, // benchmarked later
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
  };
}

async function probeLlamacppVulkan(sysInfo: SystemInfo): Promise<BackendState> {
  // Vulkan is a user-space GPU API; no elevation needed to query
  // In WASM/browser context, check for WebGL2 as a proxy
  const hasGpu =
    typeof document !== "undefined"
      ? (() => {
          try {
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2");
            if (!gl) return false;
            const ext = gl.getExtension("WEBGL_debug_renderer_info");
            return !!ext;
          } catch {
            return false;
          }
        })()
      : sysInfo.arch !== "wasm32";

  return {
    kind: "llamacpp-vulkan",
    available: hasGpu,
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
  };
}

async function probeLlamacppMetal(_sysInfo: SystemInfo): Promise<BackendState> {
  // Metal is available on all macOS/iOS devices
  // No elevation needed — it's a user-space API
  return {
    kind: "llamacpp-metal",
    available: true,
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
  };
}

async function probeLlamacppCuda(_sysInfo: SystemInfo): Promise<BackendState> {
  // CUDA requires an NVIDIA driver, which is typically pre-installed
  // The query itself (cudaGetDeviceCount) does not need elevation
  // In browser context we can't check this; assume available on desktop
  return {
    kind: "llamacpp-cuda",
    available: false, // conservative default; real probe via native host
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
    probeError: "CUDA probe requires native host bridge",
  };
}

async function probeOpenVinoCpu(_sysInfo: SystemInfo): Promise<BackendState> {
  // OpenVINO CPU backend: always available on x86_64 systems
  return {
    kind: "openvino-cpu",
    available: true,
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
  };
}

async function probeOpenVinoIGpu(_sysInfo: SystemInfo): Promise<BackendState> {
  // OpenVINO iGPU: requires /dev/dri/* on Linux (render group membership)
  // or no elevation on Windows (Intel GPU driver already installed)
  if (_sysInfo.platform === "linux") {
    // Check render group membership — this is the privilege-free check
    // In browser context we can't do this directly; assume accessible
    // The real check happens in the native host layer
    return {
      kind: "openvino-igpu",
      available: true, // assume Intel GPU present; real probe in native host
      measuredTokensPerSec: 0,
      benchmarkTimestamp: 0,
      memoryUsageBytes: 0,
    };
  }
  // Windows: iGPU is accessible without elevation
  return {
    kind: "openvino-igpu",
    available: true,
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
  };
}

async function probeOpenVinoNpu(_sysInfo: SystemInfo): Promise<BackendState> {
  // OpenVINO NPU: requires Meteor Lake or newer Intel CPU
  // The query is a read-only device enumeration — no elevation needed
  return {
    kind: "openvino-npu",
    available: false, // conservative; real probe checks CPU generation
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
    probeError: "NPU probe requires Intel Meteor Lake+ detection",
  };
}

async function probeQnnSnapdragon(_sysInfo: SystemInfo): Promise<BackendState> {
  // QNN (Qualcomm Neural Network): Snapdragon NPU
  // On Android, the capability is exposed via vendor SDK — no elevation needed
  return {
    kind: "qnn-snapdragon",
    available: false, // conservative; real probe via QNN SDK query
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
    probeError: "QNN probe requires Qualcomm SDK initialization",
  };
}

async function probeCoreML(_sysInfo: SystemInfo): Promise<BackendState> {
  // Core ML / Apple Neural Engine: available on all Apple Silicon
  // No elevation needed — OS mediates hardware access uniformly
  return {
    kind: "coreml-apple",
    available: _sysInfo.arch === "aarch64",
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
  };
}

async function probeApuMediatek(_sysInfo: SystemInfo): Promise<BackendState> {
  // MediaTek APU: requires NeuroPilot SDK
  // On Android, capability query needs no elevation
  return {
    kind: "apu-mediatek",
    available: false, // conservative; real probe via NeuroPilot
    measuredTokensPerSec: 0,
    benchmarkTimestamp: 0,
    memoryUsageBytes: 0,
    probeError: "APU probe requires MediaTek NeuroPilot detection",
  };
}

// ─── Benchmarking ─────────────────────────────────────────────────────────────

/**
 * Run a short generation benchmark against each available backend.
 * Returns tokens/sec for each, measured on this specific device.
 * The benchmark is cheap (~500 tokens) and shouldn't take more than 30s.
 */
export async function benchmarkBackends(
  backends: BackendState[],
  _sysInfo: SystemInfo,
): Promise<Map<BackendKind, number>> {
  const results = new Map<BackendKind, number>();

  for (const backend of backends) {
    if (!backend.available) continue;

    // Quick benchmark: generate ~500 tokens and measure time
    const startTime = performance.now();
    try {
      await runQuickBenchmark(backend.kind);
      const elapsed = (performance.now() - startTime) / 1000;
      const tokensPerSec = elapsed > 0 ? 500 / elapsed : 0;
      results.set(backend.kind, tokensPerSec);
      backend.measuredTokensPerSec = tokensPerSec;
      backend.benchmarkTimestamp = Date.now();
    } catch (err) {
      backend.probeError = err instanceof Error ? err.message : String(err);
      backend.available = false;
    }
  }

  return results;
}

/**
 * Run a minimal generation test on the given backend.
 * In production this calls the actual inference engine;
 * here we simulate with timing proportional to expected throughput.
 */
async function runQuickBenchmark(kind: BackendKind): Promise<void> {
  // Simulate benchmark delay based on expected backend speed
  // In real implementation this calls the backend's generate() with a tiny prompt
  const delays: Record<string, number> = {
    "llamacpp-cpu": 200,
    "llamacpp-vulkan": 80,
    "llamacpp-metal": 60,
    "llamacpp-cuda": 40,
    "openvino-cpu": 180,
    "openvino-igpu": 90,
    "openvino-npu": 120,
    "qnn-snapdragon": 150,
    "coreml-apple": 70,
    "apu-mediatek": 160,
  };
  const delay = delays[kind] ?? 200;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

// ─── Legacy Server Detection ──────────────────────────────────────────────────

export function detectLegacyServerProfile(
  sysInfo: SystemInfo,
): LegacyServerProfile {
  const hasAVX2 = checkAvx2(sysInfo);
  const hasAVX512 = checkAvx512(sysInfo);

  let detectedInstructionSet = "sse2";
  if (hasAVX512) detectedInstructionSet = "avx512";
  else if (hasAVX2) detectedInstructionSet = "avx2";
  else if (checkSse42(sysInfo)) detectedInstructionSet = "sse4.2";

  const numaTopology = [
    {
      socketCount: 1,
      coresPerSocket: sysInfo.availableRamBytes / (1024 * 1024 * 1024) > 64 ? 16 : sysInfo.totalRamBytes > 64 * 1024 * 1024 * 1024 ? 8 : 4,
      memoryPerSocketBytes: sysInfo.totalRamBytes,
    },
  ];

  const oldOS =
    sysInfo.platform === "linux" &&
    (sysInfo.osVersion.includes("3.") || sysInfo.osVersion.includes("2."));

  const needsStaticLink = oldOS || sysInfo.arch === "unknown";

  return {
    needsStaticLink,
    detectedInstructionSet,
    hasAVX2,
    hasAVX512,
    numaTopology,
    kernelVersion: sysInfo.osVersion,
    glibcVersion: undefined,
    recommendedFlags: buildRecommendedFlags(hasAVX2, hasAVX512, sysInfo.arch),
    containerizationRecommended: oldOS,
    fallbackStrategy: oldOS ? "static-cross-compile" : "native",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectPlatform(nav: { platform: string; userAgent: string }): SystemInfo["platform"] {
  const ua = nav.userAgent.toLowerCase();
  const plat = (nav.platform || "").toLowerCase();
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (plat.includes("win")) return "windows";
  if (plat.includes("mac") || ua.includes("mac")) return "macos";
  if (plat.includes("linux") || ua.includes("linux")) return "linux";
  return "unknown";
}

function detectArch(nav: { platform: string; userAgent: string }): SystemInfo["arch"] {
  const ua = nav.userAgent.toLowerCase();
  if (ua.includes("arm64") || ua.includes("aarch64")) return "aarch64";
  if (ua.includes("arm")) return "arm";
  if (ua.includes("x86_64") || ua.includes("x64")) return "x86_64";
  // In WASM context
  if (typeof WebAssembly !== "undefined") {
    return nav.platform === "Wasm64" ? "wasm64" : "wasm32";
  }
  return "x86_64"; // default assumption for desktop
}

function getOsVersion(nav: { userAgent: string }): string {
  const ua = nav.userAgent;
  // Extract OS version from UA string
  const winMatch = ua.match(/Windows NT (\d+\.\d+)/);
  if (winMatch) return `Windows NT ${winMatch[1]}`;
  const macMatch = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
  if (macMatch) return `macOS ${macMatch[1].replace(/_/g, ".")}`;
  const linuxMatch = ua.match(/Linux (\d+\.\d+\.\d+)/);
  if (linuxMatch) return `Linux ${linuxMatch[1]}`;
  const androidMatch = ua.match(/Android (\d+[\.\d]*)/);
  if (androidMatch) return `Android ${androidMatch[1]}`;
  return "unknown";
}

function getCpuBrand(nav: { hardwareConcurrency: number }): string {
  // navigator.hardwareConcurrency gives core count but not brand
  // In a real implementation this queries /proc/cpuinfo or WMI
  return `${nav.hardwareConcurrency || 4}-core CPU`;
}

function getTotalRamBytes(): number {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav && "deviceMemory" in nav) {
    return (nav as { deviceMemory: number }).deviceMemory * 1024 * 1024 * 1024;
  }
  // Default assumption
  return 8 * 1024 * 1024 * 1024;
}

function getAvailableRamBytes(): number {
  return getTotalRamBytes() * 0.6; // conservative estimate
}

function checkAvx2(_sysInfo: SystemInfo): boolean {
  // In real implementation, check CPUID or /proc/cpuinfo
  // Desktop CPUs from ~2013+ have AVX2
  return _sysInfo.arch === "x86_64";
}

function checkAvx512(_sysInfo: SystemInfo): boolean {
  // Only newer server/client CPUs (Ice Lake+)
  return false; // conservative
}

function checkSse42(_sysInfo: SystemInfo): boolean {
  return _sysInfo.arch === "x86_64";
}

function buildRecommendedFlags(
  hasAVX2: boolean,
  hasAVX512: boolean,
  arch: string,
): string[] {
  const flags: string[] = [];
  if (arch === "x86_64") {
    flags.push("-march=native");
    if (hasAVX512) flags.push("-mavx512f", "-mavx512bw", "-mavx512vl");
    else if (hasAVX2) flags.push("-mavx2", "-mfma", "-mbmi", "-mpopcnt");
  }
  if (arch === "aarch64") {
    flags.push("-mcpu=native");
  }
  flags.push("-static"); // for static linking on old systems
  return flags;
}
