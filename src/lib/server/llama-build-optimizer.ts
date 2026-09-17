/**
 * stitaP llama.cpp Fork Build Optimizer
 *
 * Given a hardware profile (detected or from the legacy database), generates
 * the exact cmake/compile flags, quantization settings, and runtime config
 * needed to build a working llama.cpp binary for that specific machine.
 *
 * The critical problem this solves:
 * Stock llama.cpp defaults to -mavx2 -mfma which produces SIGILL (illegal
 * instruction) on any CPU older than Haswell (2013). Pre-2008 servers have
 * SSE/SSE2/SSE3 at best. This tool detects the exact ISA ceiling and builds
 * a binary that actually runs.
 *
 * The secondary optimization:
 * Beyond just "not crashing," we tune thread count, memory-mapped I/O,
 * context length, and quantization format to squeeze maximum throughput
 * from the specific hardware.
 */

import type { DetectedCPU, DetectedMemory, BuildTarget, HardwareProfile } from "./hardware-detect";
import type { ServerModel, CPUModel } from "./legacy-hardware";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BuildConfig {
  /** Human-readable description of this build */
  description: string;
  /** Target architecture */
  targetArch: "x86_64" | "x86" | "aarch64" | "unknown";
  /** CMake preset name */
  cmakePreset: string;
  /** C compiler flags */
  cFlags: string[];
  /** C++ compiler flags */
  cxxFlags: string[];
  /** Linker flags */
  linkerFlags: string[];
  /** cmake definitions */
  cmakeDefs: Record<string, string>;
  /** Quantization type for the recommended model */
  quantType: string;
  /** Model file name pattern */
  modelPattern: string;
  /** Number of threads to use */
  threadCount: number;
  /** Context length */
  contextLength: number;
  /** Batch size for prompt processing */
  batchSize: number;
  /** Whether to use memory-mapped I/O */
  mmap: boolean;
  /** Whether to use memory lock (mlock) */
  mlock: boolean;
  /** KV cache quantization */
  kvCacheQuant: "f32" | "f16" | "q8_0" | "q4_0";
  /** Estimated tokens/second for a 1.5B model */
  estimatedTPS: number;
  /** Estimated tokens/second for a 0.5B model */
  estimatedTPS05B: number;
  /** Estimated tokens/second for a 0.3B model */
  estimatedTPS03B: number;
  /** Warnings about this build */
  warnings: string[];
  /** Shell commands to build */
  buildCommands: string[];
  /** Runtime invocation command */
  runCommand: string;
  /** RAG server command (with embedding) */
  ragServerCommand: string;
}

export interface ModelRecommendation {
  /** Model name */
  name: string;
  /** Model size in parameters */
  paramCount: string;
  /** Quantization to use */
  quant: string;
  /** File size in GB */
  fileSizeGB: number;
  /** Required RAM in GB */
  requiredRAMGB: number;
  /** Estimated quality (1-10) */
  quality: number;
  /** Estimated TPS on this hardware */
  estimatedTPS: number;
  /** Hugging Face download URL pattern */
  downloadPattern: string;
  /** Whether this fits on the hardware */
  fitsOnHardware: boolean;
}

export interface BuildPlan {
  /** The hardware being built for */
  hardware: string;
  /** Detected or known CPU */
  cpu: string;
  /** Build target ISA */
  buildTarget: BuildTarget;
  /** The full build configuration */
  buildConfig: BuildConfig;
  /** Model recommendations ranked by fit */
  models: ModelRecommendation[];
  /** Step-by-step instructions */
  instructions: string[];
}

// ─── Build Target → Compiler Flags ──────────────────────────────────────────

const BUILD_FLAGS: Record<BuildTarget, { cFlags: string[]; cmakeDefs: Record<string, string>; desc: string }> = {
  scalar: {
    cFlags: ["-O3", "-march=i686", "-mtune=generic"],
    cmakeDefs: { GGML_AVX: "OFF", GGML_AVX2: "OFF", GGML_FMA: "OFF", GGML_F16C: "OFF" },
    desc: "Scalar build for Pentium III and older (no SIMD)",
  },
  sse: {
    cFlags: ["-O3", "-msse", "-march=pentium3", "-mtune=pentium3"],
    cmakeDefs: { GGML_AVX: "OFF", GGML_AVX2: "OFF", GGML_FMA: "OFF", GGML_F16C: "OFF" },
    desc: "SSE build for Pentium III / early Xeons (2001)",
  },
  sse2: {
    cFlags: ["-O3", "-msse2", "-march=pentium4", "-mtune=pentium4"],
    cmakeDefs: { GGML_AVX: "OFF", GGML_AVX2: "OFF", GGML_FMA: "OFF", GGML_F16C: "OFF" },
    desc: "SSE2 build for Pentium 4 / Xeon Prestonia (2002-2003)",
  },
  sse3: {
    cFlags: ["-O3", "-msse3", "-march=nocona", "-mtune=nocona"],
    cmakeDefs: { GGML_AVX: "OFF", GGML_AVX2: "OFF", GGML_FMA: "OFF", GGML_F16C: "OFF" },
    desc: "SSE3 build for Pentium 4 Prescott / Xeon Nocona (2004)",
  },
  ssse3: {
    cFlags: ["-O3", "-mssse3", "-msse3", "-msse2", "-msse", "-march=core2", "-mtune=core2"],
    cmakeDefs: { GGML_AVX: "OFF", GGML_AVX2: "OFF", GGML_FMA: "OFF", GGML_F16C: "OFF" },
    desc: "SSSE3 build for Core 2 / Xeon Woodcrest (2006)",
  },
  "sse4.1": {
    cFlags: ["-O3", "-msse4.1", "-mssse3", "-msse3", "-msse2", "-msse", "-march=core2", "-mtune=core2"],
    cmakeDefs: { GGML_AVX: "OFF", GGML_AVX2: "OFF", GGML_FMA: "OFF", GGML_F16C: "OFF" },
    desc: "SSE4.1 build for Penryn / Xeon Harpertown (2007)",
  },
  avx: {
    cFlags: ["-O3", "-mavx", "-msse4.2", "-msse4.1", "-msse3", "-msse2", "-msse", "-march=sandybridge"],
    cmakeDefs: { GGML_AVX: "ON", GGML_AVX2: "OFF", GGML_FMA: "OFF", GGML_F16C: "OFF" },
    desc: "AVX build for Sandy Bridge (2011)",
  },
  avx2: {
    cFlags: ["-O3", "-mavx2", "-mfma", "-mf16c", "-march=haswell"],
    cmakeDefs: { GGML_AVX: "ON", GGML_AVX2: "ON", GGML_FMA: "ON", GGML_F16C: "ON" },
    desc: "AVX2 build for Haswell+ (2013) — llama.cpp default",
  },
  avx512: {
    cFlags: ["-O3", "-mavx512f", "-mavx512vl", "-mavx2", "-mfma", "-mf16c", "-march=skylake-avx512"],
    cmakeDefs: { GGML_AVX: "ON", GGML_AVX2: "ON", GGML_FMA: "ON", GGML_F16C: "ON", GGML_AVX512: "ON" },
    desc: "AVX-512 build for Skylake-SP+ (2017)",
  },
};

// ─── Build Configuration Generator ──────────────────────────────────────────

/** Generate a complete build configuration for a given build target */
export function generateBuildConfig(
  buildTarget: BuildTarget,
  cpu: DetectedCPU | CPUModel,
  memory: DetectedMemory | { totalGB: number },
): BuildConfig {
  const flags = BUILD_FLAGS[buildTarget];

  // Thread count optimization
  // Pre-2008 servers often benefit from fewer threads than physical cores
  // because of slow inter-socket communication on NUMA systems
  const physicalCores = "physicalCores" in cpu ? cpu.physicalCores : cpu.cores;
  const totalGB = "totalGB" in memory ? memory.totalGB : (memory as { totalGB: number }).totalGB;

  // For pre-2008 dual-socket: use cores per socket, not total
  // The FSB bottleneck means cross-socket memory access kills throughput
  const optimalThreads = Math.max(1, Math.min(physicalCores, Math.ceil(physicalCores * 0.75)));

  // Context length: limited by available RAM
  // Rule: context tokens × ~2KB per token (for 1.5B Q4 model) = memory needed
  const modelRAMGB = totalGB * 0.6; // Reserve 40% for OS + KV cache + working memory
  const availableForContext = Math.max(0.5, totalGB - modelRAMGB - 1); // 1 GB for OS
  const contextLength = Math.min(
    8192,
    Math.max(1024, Math.floor((availableForContext * 1024 * 1024 * 1024) / (2 * 1024))),
  );

  // Batch size: larger batches use more memory but improve prompt processing
  const batchSize = totalGB >= 16 ? 512 : totalGB >= 8 ? 256 : 128;

  // KV cache quantization: use lower precision when RAM is tight
  const kvCacheQuant: BuildConfig["kvCacheQuant"] =
    totalGB <= 4 ? "q4_0" : totalGB <= 8 ? "q8_0" : totalGB <= 16 ? "f16" : "f32";

  // Model recommendations
  const maxModelRAM = totalGB - 2; // Leave 2 GB for OS

  // Build commands
  const cmakeFlags = Object.entries(flags.cmakeDefs)
    .map(([k, v]) => `-D${k}=${v}`)
    .join(" ");

  const buildCommands = [
    "# Clone the stitaP fork of llama.cpp with legacy hardware patches",
    "git clone https://github.com/stitap/llama.cpp.git",
    "cd llama.cpp",
    "",
    "# Build with detected hardware-optimized flags",
    `cmake -B build ${cmakeFlags} \\`,
    `  -DCMAKE_BUILD_TYPE=Release \\`,
    `  -DCMAKE_C_FLAGS="${flags.cFlags.join(" ")}" \\`,
    `  -DCMAKE_CXX_FLAGS="${flags.cFlags.join(" ")}"`,
    "",
    "# Compile (use all available cores)",
    `cmake --build build --config Release -j${optimalThreads}`,
    "",
    "# The binary is at: build/bin/llama-server",
  ];

  const runCommand = [
    `build/bin/llama-server \\`,
    `  -m MODEL_FILE.gguf \\`,
    `  --host 0.0.0.0 \\`,
    `  --port 8080 \\`,
    `  -t ${optimalThreads} \\`,
    `  -c ${contextLength} \\`,
    `  -b ${batchSize} \\`,
    `  --ctx-size ${contextLength} \\`,
    `  ${kvCacheQuant !== "f32" ? `--cache-type-k ${kvCacheQuant} --cache-type-v ${kvCacheQuant}` : ""} \\`,
    `  ${totalGB <= 8 ? "--mlock" : ""} \\`,
    `  --parallel 1`,
  ].filter((l) => l.trim()).join("\n");

  const ragServerCommand = [
    "# Start llama.cpp with OpenAI-compatible API for RAG integration",
    `build/bin/llama-server \\`,
    `  -m MODEL_FILE.gguf \\`,
    `  --host 0.0.0.0 \\`,
    `  --port 8080 \\`,
    `  -t ${optimalThreads} \\`,
    `  -c ${contextLength} \\`,
    `  -b ${batchSize} \\`,
    `  --ctx-size ${contextLength} \\`,
    `  ${kvCacheQuant !== "f32" ? `--cache-type-k ${kvCacheQuant} --cache-type-v ${kvCacheQuant}` : ""} \\`,
    `  ${totalGB <= 8 ? "--mlock" : ""} \\`,
    `  --parallel 2 \\`,
    `  --chat-template chatml \\`,
    `  --embedding`,
    "",
    "# The RAG server exposes:",
    "#   POST /v1/chat/completions  — Chat completion",
    "#   POST /v1/embeddings        — Text embeddings (for vector search)",
    "#   GET  /health               — Health check",
  ].filter((l) => l.trim()).join("\n");

  // Warnings for pre-2008 hardware
  const warnings: string[] = [];
  if (buildTarget === "sse" || buildTarget === "sse2") {
    warnings.push("SSE-only build: throughput will be 5-15 tok/s for small models. Usable for RAG but not real-time chat.");
    warnings.push("No F16C: half-precision conversions done in software. Quality slightly reduced at Q4 quantizations.");
  }
  if (buildTarget === "sse3" || buildTarget === "ssse3") {
    warnings.push("SSE3/SSSE3 build: throughput will be 8-20 tok/s for small models. Good for RAG with ~1s response time.");
  }
  if (totalGB <= 4) {
    warnings.push("Very limited RAM. Only 135M-350M parameter models will fit. RAG responses will be short.");
  }
  if (totalGB <= 8) {
    warnings.push("Low RAM: using mlock to prevent swapping. 0.5B-1B models are the maximum.");
  }

  return {
    description: flags.desc,
    targetArch: "x86_64",
    cmakePreset: `legacy-${buildTarget}`,
    cFlags: flags.cFlags,
    cxxFlags: flags.cFlags,
    linkerFlags: [],
    cmakeDefs: flags.cmakeDefs,
    quantType: totalGB <= 4 ? "Q4_0" : totalGB <= 8 ? "Q4_K_S" : "Q4_K_M",
    modelPattern: totalGB <= 4 ? "*-0.5B-*" : totalGB <= 8 ? "*-1.5B-*" : "*-3B-*",
    threadCount: optimalThreads,
    contextLength,
    batchSize,
    mmap: true,
    mlock: totalGB <= 8,
    kvCacheQuant,
    estimatedTPS: estimateTPS(buildTarget, "1.5B", physicalCores, totalGB),
    estimatedTPS05B: estimateTPS(buildTarget, "0.5B", physicalCores, totalGB),
    estimatedTPS03B: estimateTPS(buildTarget, "0.3B", physicalCores, totalGB),
    warnings,
    buildCommands,
    runCommand,
    ragServerCommand,
  };
}

/** Estimate tokens/second based on hardware parameters */
function estimateTPS(
  buildTarget: BuildTarget,
  modelSize: string,
  cores: number,
  ramGB: number,
): number {
  // Baseline: AVX2 Haswell with 4 cores running a 1.5B Q4 model ≈ 25 tok/s
  const baselineTPS: Record<string, number> = {
    "0.3B": 60,
    "0.5B": 40,
    "1.5B": 25,
    "3B": 12,
  };

  const baseline = baselineTPS[modelSize] ?? 25;

  // ISA multiplier (relative to AVX2 = 1.0)
  const isaMultiplier: Record<BuildTarget, number> = {
    scalar: 0.15,
    sse: 0.25,
    sse2: 0.35,
    sse3: 0.45,
    ssse3: 0.6,
    "sse4.1": 0.7,
    avx: 0.85,
    avx2: 1.0,
    avx512: 1.3,
  };

  // Core scaling (diminishing returns past 4 cores)
  const coreScale = Math.min(4, cores) + Math.max(0, cores - 4) * 0.3;

  // Memory bandwidth scaling
  const memScale = Math.min(1.0, ramGB / 16);

  return Math.round(baseline * isaMultiplier[buildTarget] * (coreScale / 4) * (0.5 + memScale * 0.5));
}

// ─── Model Recommendations ──────────────────────────────────────────────────

/** Get model recommendations for a build configuration */
export function getModelRecommendations(
  buildTarget: BuildTarget,
  totalRAMGB: number,
  estimatedTPS: number,
): ModelRecommendation[] {
  const models: ModelRecommendation[] = [
    {
      name: "SmolLM2-135M",
      paramCount: "135M",
      quant: "Q4_0",
      fileSizeGB: 0.08,
      requiredRAMGB: 0.5,
      quality: 3,
      estimatedTPS: Math.round(estimatedTPS * 3),
      downloadPattern: "HuggingFaceTB/SmolLM2-135M-GGUF/SmolLM2-135M-Q4_0.gguf",
      fitsOnHardware: totalRAMGB >= 1,
    },
    {
      name: "Qwen2.5-0.5B",
      paramCount: "0.5B",
      quant: "Q4_0",
      fileSizeGB: 0.35,
      requiredRAMGB: 1.5,
      quality: 5,
      estimatedTPS: Math.round(estimatedTPS * 2),
      downloadPattern: "Qwen/Qwen2.5-0.5B-Instruct-GGUF/qwen2.5-0.5b-instruct-q4_0.gguf",
      fitsOnHardware: totalRAMGB >= 2,
    },
    {
      name: "Qwen2.5-0.5B (Q4_K_S)",
      paramCount: "0.5B",
      quant: "Q4_K_S",
      fileSizeGB: 0.4,
      requiredRAMGB: 1.5,
      quality: 6,
      estimatedTPS: Math.round(estimatedTPS * 1.8),
      downloadPattern: "Qwen/Qwen2.5-0.5B-Instruct-GGUF/qwen2.5-0.5b-instruct-q4_k_s.gguf",
      fitsOnHardware: totalRAMGB >= 2,
    },
    {
      name: "Qwen2.5-1.5B",
      paramCount: "1.5B",
      quant: "Q4_K_M",
      fileSizeGB: 0.95,
      requiredRAMGB: 3,
      quality: 7,
      estimatedTPS,
      downloadPattern: "Qwen/Qwen2.5-1.5B-Instruct-GGUF/qwen2.5-1.5b-instruct-q4_k_m.gguf",
      fitsOnHardware: totalRAMGB >= 4,
    },
    {
      name: "Llama-3.2-1B",
      paramCount: "1B",
      quant: "Q4_K_M",
      fileSizeGB: 0.7,
      requiredRAMGB: 2.5,
      quality: 6,
      estimatedTPS: Math.round(estimatedTPS * 1.3),
      downloadPattern: "meta-llama/Llama-3.2-1B-Instruct-GGUF/llama-3.2-1b-instruct-q4_k_m.gguf",
      fitsOnHardware: totalRAMGB >= 3,
    },
    {
      name: "Llama-3.2-3B",
      paramCount: "3B",
      quant: "Q4_K_M",
      fileSizeGB: 2.0,
      requiredRAMGB: 5,
      quality: 8,
      estimatedTPS: Math.round(estimatedTPS * 0.5),
      downloadPattern: "meta-llama/Llama-3.2-3B-Instruct-GGUF/llama-3.2-3b-instruct-q4_k_m.gguf",
      fitsOnHardware: totalRAMGB >= 8,
    },
  ];

  return models.sort((a, b) => {
    if (a.fitsOnHardware && !b.fitsOnHardware) return -1;
    if (!a.fitsOnHardware && b.fitsOnHardware) return 1;
    return b.quality - a.quality;
  });
}

// ─── Full Build Plan Generator ──────────────────────────────────────────────

/** Generate a complete build plan from detected hardware */
export function generateBuildPlan(hardware: HardwareProfile): BuildPlan {
  const buildConfig = generateBuildConfig(hardware.cpu.buildTarget, hardware.cpu, hardware.memory);
  const models = getModelRecommendations(hardware.cpu.buildTarget, hardware.memory.totalGB, buildConfig.estimatedTPS);

  const instructions = [
    `## Build Plan for ${hardware.hostname || "Unknown Server"}`,
    "",
    `**CPU:** ${hardware.cpu.brand} (${hardware.cpu.microarchitecture})`,
    `**Cores:** ${hardware.cpu.physicalCores} physical, ${hardware.cpu.logicalCores} logical`,
    `**ISA Features:** ${hardware.cpu.isaFeatures.join(", ") || "none detected"}`,
    `**Build Target:** ${hardware.cpu.buildTarget.toUpperCase()}`,
    `**RAM:** ${hardware.memory.totalGB} GB ${hardware.memory.ramType !== "unknown" ? hardware.memory.ramType : ""}`,
    "",
    "### Step 1: Install build tools",
    "```bash",
    "# Debian/Ubuntu",
    "sudo apt-get update && sudo apt-get install -y build-essential cmake git",
    "",
    "# RHEL/CentOS (common on old servers)",
    "sudo yum groupinstall -y 'Development Tools'",
    "sudo yum install -y cmake git",
    "",
    "# Verify compiler supports our target",
    `gcc -march=${hardware.cpu.buildTarget === "sse2" ? "pentium4" : hardware.cpu.buildTarget === "sse3" ? "nocona" : "core2"} -E - < /dev/null && echo "OK" || echo "Need newer GCC"`,
    "```",
    "",
    "### Step 2: Clone and build",
    "```bash",
    ...buildConfig.buildCommands,
    "```",
    "",
    "### Step 3: Download a model",
    "```bash",
    "# Best model for this hardware:",
    models[0]
      ? `mkdir -p models\ncd models\n# ${models[0].name} (${models[0].quant}, ${models[0].fileSizeGB} GB)\nwget "https://huggingface.co/${models[0].downloadPattern}" -O ${models[0].name}.gguf`
      : "# No model fits on this hardware",
    "```",
    "",
    "### Step 4: Start the RAG server",
    "```bash",
    buildConfig.ragServerCommand,
    "",
    "# Test the server:",
    'curl http://localhost:8080/health',
    "",
    "# Test a chat completion:",
    `curl -s http://localhost:8080/v1/chat/completions \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"model": "model", "messages": [{"role": "user", "content": "Hello"}]}'`,
    "```",
    "",
    "### Step 5: Connect stitaP RAG pipeline",
    "```typescript",
    '// In your stitaP agent configuration:',
    "const ragEndpoint = 'http://SERVER_IP:8080';",
    "// The server exposes OpenAI-compatible endpoints:",
    "//   POST /v1/chat/completions — Chat with retrieved context",
    "//   POST /v1/embeddings        — Generate embeddings for vector search",
    "```",
  ];

  return {
    hardware: `${hardware.cpu.brand} (${hardware.cpu.microarchitecture})`,
    cpu: hardware.cpu.brand,
    buildTarget: hardware.cpu.buildTarget,
    buildConfig,
    models,
    instructions,
  };
}

/** Generate a build plan from a legacy server model (without live detection) */
export function generateLegacyBuildPlan(server: ServerModel): BuildPlan {
  const cpuName = server.cpus[server.cpus.length - 1];
  // We need to import CPU_DATABASE but use a dynamic approach to avoid circular deps
  const buildTarget: BuildTarget = server.year <= 2003 ? "sse2"
    : server.year <= 2004 ? "sse3"
    : server.year <= 2005 ? "ssse3"
    : server.year <= 2006 ? "ssse3"
    : "sse4.1";

  const cpu: CPUModel = {
    name: cpuName,
    vendor: "intel",
    microarchitecture: "Core",
    year: server.year,
    cores: 2,
    baseClockGHz: 2.0,
    maxClockGHz: 2.8,
    l2CacheKB: 4096,
    l3CacheKB: 0,
    fsbMHz: 1066,
    isaFeatures: buildTarget === "sse4.1" ? ["sse", "sse2", "sse3", "ssse3", "sse4.1", "f16c"]
      : buildTarget === "ssse3" ? ["sse", "sse2", "sse3", "ssse3"]
      : buildTarget === "sse3" ? ["sse", "sse2", "sse3"]
      : ["sse", "sse2"],
    buildTarget: buildTarget,
    maxAddressBits: 40,
  };

  const memory = { totalGB: server.maxRAMGB };
  const buildConfig = generateBuildConfig(buildTarget, cpu, memory);
  const models = getModelRecommendations(buildTarget, server.maxRAMGB, buildConfig.estimatedTPS);

  const instructions = [
    `## Build Plan: ${server.manufacturer} ${server.name} (${server.year})`,
    "",
    `**Max RAM:** ${server.maxRAMGB} GB ${server.ramType}`,
    `**CPU Sockets:** ${server.maxSockets} (${server.cpus.join(", ")})`,
    `**Build Target:** ${buildTarget.toUpperCase()}`,
    `**RAG Viability:** ${server.ragViability}/10`,
    "",
    ...buildConfig.buildCommands,
    "",
    "### Recommended model:",
    models[0] ? `  ${models[0].name} (${models[0].quant}, ${models[0].fileSizeGB} GB)` : "  None — RAM too limited",
    "",
    "### Notes:",
    ...buildConfig.warnings.map((w) => `- ${w}`),
    server.notes ? `- ${server.notes}` : "",
  ];

  return {
    hardware: `${server.manufacturer} ${server.name}`,
    cpu: cpuName,
    buildTarget: buildTarget,
    buildConfig,
    models,
    instructions,
  };
}
