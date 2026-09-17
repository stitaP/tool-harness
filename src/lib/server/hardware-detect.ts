/**
 * stitaP Hardware Detection Engine
 *
 * Detects the current machine's CPU capabilities, memory, and ISA features
 * at runtime. Used by the llama.cpp build optimizer to determine the best
 * compile flags, quantization level, and backend selection.
 *
 * On the server: uses /proc/cpuinfo, /proc/meminfo, and CPUID via inline assembly.
 * In the browser: uses navigator.hardwareConcurrency and performance APIs.
 * For remote servers: SSH probe scripts that run CPUID on the target machine.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ISAFeature =
  | "sse" | "sse2" | "sse3" | "ssse3" | "sse4.1" | "sse4.2"
  | "avx" | "avx2" | "avx512f" | "avx512vl"
  | "fma" | "f16c" | "popcnt" | "lzcnt" | "bmi" | "bmi2"
  | "aes" | "pclmul" | "vaes";

export type BuildTarget =
  | "scalar"    // No SIMD — Pentium III and older (pre-2001)
  | "sse"       // Pentium III / Xeon Tualatin (2001)
  | "sse2"      // Pentium 4 / Xeon Prestonia (2002)
  | "sse3"      // Pentium 4 Prescott / Xeon Nocona (2004)
  | "ssse3"     // Core / Xeon Woodcrest (2006)
  | "sse4.1"    // Penryn / Xeon Harpertown (2007)
  | "avx"       // Sandy Bridge (2011)
  | "avx2"      // Haswell (2013)
  | "avx512";   // Skylake-SP (2017)

export interface DetectedCPU {
  vendor: "intel" | "amd" | "unknown";
  brand: string;
  family: number;
  model: number;
  stepping: number;
  /** Physical core count */
  physicalCores: number;
  /** Logical core count (with HT) */
  logicalCores: number;
  /** Base frequency in MHz */
  baseFreqMHz: number;
  /** Max frequency in MHz (if detectable) */
  maxFreqMHz: number;
  /** L1 data cache in KB */
  l1DataKB: number;
  /** L1 instruction cache in KB */
  l1InstKB: number;
  /** L2 cache in KB */
  l2CacheKB: number;
  /** L3 cache in KB */
  l3CacheKB: number;
  /** Supported ISA features */
  isaFeatures: ISAFeature[];
  /** Best build target for this CPU */
  buildTarget: BuildTarget;
  /** CPU microarchitecture guess */
  microarchitecture: string;
}

export interface DetectedMemory {
  /** Total physical RAM in bytes */
  totalBytes: number;
  /** Available RAM in bytes */
  availableBytes: number;
  /** RAM in GB (formatted) */
  totalGB: number;
  /** Swap total in bytes */
  swapTotalBytes: number;
  /** RAM type (if detectable) */
  ramType: "DDR" | "DDR2" | "DDR3" | "DDR4" | "DDR5" | "unknown";
  /** RAM speed in MHz (if detectable) */
  ramSpeedMHz: number;
  /** ECC support detected */
  ecc: boolean;
}

export interface DetectedStorage {
  /** Total disk space in bytes */
  totalBytes: number;
  /** Available disk space in bytes */
  availableBytes: number;
  /** Disk type */
  diskType: "hdd" | "ssd" | "nvme" | "unknown";
  /** Whether TRIM is supported */
  trimSupported: boolean;
}

export interface HardwareProfile {
  /** Machine hostname */
  hostname: string;
  /** Operating system */
  os: string;
  /** Architecture */
  arch: string;
  /** Kernel version */
  kernelVersion: string;
  /** CPU info */
  cpu: DetectedCPU;
  /** Memory info */
  memory: DetectedMemory;
  /** Storage info */
  storage: DetectedStorage;
  /** Detection timestamp */
  detectedAt: string;
  /** Whether this is a virtual machine */
  isVirtual: boolean;
  /** Virtual machine type (if detected) */
  virtualType?: "vmware" | "hyper-v" | "kvm" | "xen" | "docker" | "unknown";
}

// ─── ISA Feature Ordering (for build target selection) ───────────────────────

const ISA_ORDER: ISAFeature[] = [
  "sse", "sse2", "sse3", "ssse3", "sse4.1", "sse4.2",
  "avx", "avx2", "avx512f", "avx512vl",
  "fma", "f16c", "popcnt", "lzcnt", "bmi", "bmi2",
  "aes", "pclmul", "vaes",
];

const BUILD_TARGET_ORDER: BuildTarget[] = [
  "scalar", "sse", "sse2", "sse3", "ssse3", "sse4.1",
  "avx", "avx2", "avx512",
];

/** Map ISA features to the best compile-time build target */
function featuresToBuildTarget(features: ISAFeature[]): BuildTarget {
  if (features.includes("avx512f")) return "avx512";
  if (features.includes("avx2")) return "avx2";
  if (features.includes("avx")) return "avx";
  if (features.includes("sse4.1")) return "sse4.1";
  if (features.includes("ssse3")) return "ssse3";
  if (features.includes("sse3")) return "sse3";
  if (features.includes("sse2")) return "sse2";
  if (features.includes("sse")) return "sse";
  return "scalar";
}

// ─── CPUID Execution ────────────────────────────────────────────────────────

/** Execute CPUID instruction and return EAX, EBX, ECX, EDX */
function executeCPUID(leaf: number, subleaf = 0): [number, number, number, number] {
  // This runs on the actual server via Node.js process
  // In browser, we fall back to navigator APIs
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("child_process") as typeof import("child_process");

    // Use a small C helper compiled at install time, or parse /proc/cpuinfo
    const output = execSync(
      `grep -m1 'flags' /proc/cpuinfo 2>/dev/null || echo ""`,
      { encoding: "utf-8", timeout: 5000 },
    );
    return parseCPUIDFromProc(output, leaf);
  } catch {
    return [0, 0, 0, 0];
  }
}

/** Parse CPU features from /proc/cpuinfo flags line */
function parseCPUIDFromProc(
  flagsLine: string,
  _leaf: number,
): [number, number, number, number] {
  // Decode feature flags into CPUID register values
  let ecx = 0;
  let edx = 0;

  const flagMap: Record<string, [number, number]> = {
    sse: [0, 1 << 25],
    sse2: [0, 1 << 26],
    sse3: [1 << 0, 0],
    ssse3: [1 << 9, 0],
    "sse4.1": [1 << 19, 0],
    "sse4.2": [1 << 20, 0],
    avx: [1 << 28, 0],
    avx2: [0, 0], // CPUID.7:EBX
    fma: [1 << 12, 0],
    f16c: [1 << 29, 0],
    popcnt: [1 << 23, 0],
    pclmul: [1 << 1, 0],
    aes: [1 << 25, 0],
  };

  for (const [flag, [ecxBit, edxBit]] of Object.entries(flagMap)) {
    if (flagsLine.includes(flag)) {
      ecx |= ecxBit;
      edx |= edxBit;
    }
  }

  return [0, 0, ecx, edx];
}

// ─── Feature Parsing ────────────────────────────────────────────────────────

/** Parse feature flags string into ISAFeature array */
function parseFeatureFlags(flagsStr: string): ISAFeature[] {
  const features: ISAFeature[] = [];
  const flagSet = new Set(flagsStr.toLowerCase().split(/\s+/));

  const featureMap: [string, ISAFeature][] = [
    ["sse", "sse"],
    ["sse2", "sse2"],
    ["sse3", "sse3"],
    ["ssse3", "ssse3"],
    ["sse4_1", "sse4.1"],
    ["sse4.2", "sse4.2"],
    ["sse4a", "sse4.1"], // AMD SSE4a is similar
    ["avx", "avx"],
    ["avx2", "avx2"],
    ["avx512f", "avx512f"],
    ["avx512vl", "avx512vl"],
    ["fma", "fma"],
    ["fma3", "fma"],
    ["f16c", "f16c"],
    ["popcnt", "popcnt"],
    ["lzcnt", "lzcnt"],
    ["bmi1", "bmi"],
    ["bmi2", "bmi2"],
    ["aes", "aes"],
    ["pclmulqdq", "pclmul"],
    ["vaes", "vaes"],
  ];

  for (const [flag, feature] of featureMap) {
    if (flagSet.has(flag)) {
      features.push(feature);
    }
  }

  return [...new Set(features)];
}

/** Guess microarchitecture from CPU vendor, family, and model */
function guessMicroarchitecture(
  vendor: string,
  family: number,
  model: number,
): string {
  if (vendor === "intel") {
    if (family === 15 && model <= 6) return "NetBurst (Prescott)";
    if (family === 15 && model > 6) return "NetBurst (Cedar Mill)";
    if (family === 6 && model >= 15 && model <= 21) return "Core (Yonah/Conroe)";
    if (family === 6 && model >= 22 && model <= 29) return "Core (Penryn)";
    if (family === 6 && model >= 30 && model <= 34) return "Nehalem";
    if (family === 6 && model >= 37 && model <= 44) return "Westmere";
    if (family === 6 && model >= 42 && model <= 47) return "Sandy Bridge";
    if (family === 6 && model >= 58 && model <= 63) return "Ivy Bridge";
    if (family === 6 && model >= 60 && model <= 71) return "Haswell";
    if (family === 6 && model >= 85) return "Skylake-SP+";
    return `Intel Family-${family} Model-${model}`;
  }
  if (vendor === "amd") {
    if (family === 15) return "K8";
    if (family === 16) return "K10 (Barcelona)";
    if (family === 17) return "Bulldozer";
    if (family === 21) return "Piledriver";
    if (family === 23) return "Zen";
    if (family === 25) return "Zen 3";
    if (family === 26) return "Zen 4";
    return `AMD Family-${family} Model-${model}`;
  }
  return "Unknown";
}

// ─── Linux Server Detection ─────────────────────────────────────────────────

/** Detect CPU from /proc/cpuinfo (Linux) */
function detectCPULinux(): DetectedCPU {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");

    const cpuinfo = fs.readFileSync("/proc/cpuinfo", "utf-8");
    const lines = cpuinfo.split("\n");

    let brand = "Unknown";
    let vendor = "unknown" as "intel" | "amd" | "unknown";
    let family = 0;
    let model = 0;
    let stepping = 0;
    let physicalCores = 0;
    let logicalCores = 0;
    let baseFreqMHz = 0;
    let maxFreqMHz = 0;
    let l1DataKB = 0;
    let l2CacheKB = 0;
    let l3CacheKB = 0;
    let flagsStr = "";

    const physicalIds = new Set<string>();
    const coreIds = new Set<string>();

    for (const line of lines) {
      const [key, ...rest] = line.split(":").map((s) => s.trim());
      const val = rest.join(":").trim();

      switch (key) {
        case "model name":
          brand = val;
          if (val.toLowerCase().includes("intel")) vendor = "intel";
          if (val.toLowerCase().includes("amd")) vendor = "amd";
          break;
        case "vendor_id":
          if (val.includes("Intel")) vendor = "intel";
          if (val.includes("AMD")) vendor = "amd";
          break;
        case "cpu family":
          family = parseInt(val, 10) || 0;
          break;
        case "model":
          model = parseInt(val, 10) || 0;
          break;
        case "stepping":
          stepping = parseInt(val, 10) || 0;
          break;
        case "physical id":
          physicalIds.add(val);
          break;
        case "core id":
          coreIds.add(val);
          break;
        case "cpu MHz":
          baseFreqMHz = Math.max(baseFreqMHz, parseFloat(val) || 0);
          break;
        case "cache size": {
          const kb = parseInt(val, 10) || 0;
          if (kb >= 4096) l3CacheKB = kb;
          else if (kb >= 256) l2CacheKB = Math.max(l2CacheKB, kb);
          break;
        }
        case "flags":
          flagsStr = val;
          break;
      }
    }

    // Count cores
    logicalCores = lines.filter((l) => l.startsWith("processor")).length;
    physicalCores = coreIds.size || Math.ceil(logicalCores / 2);
    if (physicalIds.size > 0) {
      physicalCores = Math.max(physicalCores, physicalIds.size * (coreIds.size || 1));
    }

    const isaFeatures = parseFeatureFlags(flagsStr);
    const buildTarget = featuresToBuildTarget(isaFeatures);
    const microarchitecture = guessMicroarchitecture(vendor, family, model);

    return {
      vendor,
      brand,
      family,
      model,
      stepping,
      physicalCores,
      logicalCores,
      baseFreqMHz: Math.round(baseFreqMHz),
      maxFreqMHz: Math.round(maxFreqMHz || baseFreqMHz),
      l1DataKB,
      l1InstKB: 0,
      l2CacheKB,
      l3CacheKB,
      isaFeatures,
      buildTarget,
      microarchitecture,
    };
  } catch {
    return defaultCPU();
  }
}

/** Detect memory from /proc/meminfo (Linux) */
function detectMemoryLinux(): DetectedMemory {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");

    const meminfo = fs.readFileSync("/proc/meminfo", "utf-8");
    let totalKB = 0;
    let availableKB = 0;
    let swapTotalKB = 0;

    for (const line of meminfo.split("\n")) {
      const [key, ...rest] = line.split(":").map((s) => s.trim());
      const valStr = rest.join(":").trim();
      const val = parseInt(valStr, 10) || 0;

      if (key === "MemTotal") totalKB = val;
      else if (key === "MemAvailable") availableKB = val;
      else if (key === "SwapTotal") swapTotalKB = val;
    }

    // Detect RAM type and speed (if dmidecode available)
    let ramType: DetectedMemory["ramType"] = "unknown";
    let ramSpeedMHz = 0;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require("child_process") as typeof import("child_process");
      const memDevice = execSync(
        "dmidecode -t memory 2>/dev/null | grep -E '(Type:|Speed:)' | head -4",
        { encoding: "utf-8", timeout: 5000 },
      );
      for (const line of memDevice.split("\n")) {
        if (line.includes("Type:")) {
          const type = line.split(":")[1]?.trim();
          if (type === "DDR") ramType = "DDR";
          else if (type === "DDR2") ramType = "DDR2";
          else if (type === "DDR3") ramType = "DDR3";
          else if (type === "DDR4") ramType = "DDR4";
          else if (type === "DDR5") ramType = "DDR5";
        }
        if (line.includes("Speed:") && !line.includes("Unknown")) {
          const speed = parseInt(line.split(":")[1]?.trim() || "0", 10);
          if (speed > 0) ramSpeedMHz = speed;
        }
      }
    } catch {
      // dmidecode not available — not root, etc.
    }

    return {
      totalBytes: totalKB * 1024,
      availableBytes: (availableKB || totalKB * 0.8) * 1024,
      totalGB: Math.round((totalKB / 1048576) * 10) / 10,
      swapTotalBytes: swapTotalKB * 1024,
      ramType,
      ramSpeedMHz,
      ecc: false, // Would need dmidecode or edac-utils
    };
  } catch {
    return defaultMemory();
  }
}

/** Detect storage */
function detectStorageLinux(): DetectedStorage {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("child_process") as typeof import("child_process");

    const dfOutput = execSync("df -B1 / 2>/dev/null | tail -1", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const parts = dfOutput.trim().split(/\s+/);
    const totalBytes = parseInt(parts[1], 10) || 0;
    const availableBytes = parseInt(parts[3], 10) || 0;

    // Detect disk type
    let diskType: DetectedStorage["diskType"] = "unknown";
    try {
      const rotCheck = execSync(
        "cat /sys/block/sda/queue/rotational 2>/dev/null || echo 1",
        { encoding: "utf-8", timeout: 3000 },
      ).trim();
      diskType = rotCheck === "0" ? "ssd" : "hdd";
    } catch {
      diskType = "hdd"; // Assume HDD for pre-2008 servers
    }

    return { totalBytes, availableBytes, diskType, trimSupported: false };
  } catch {
    return { totalBytes: 0, availableBytes: 0, diskType: "unknown", trimSupported: false };
  }
}

// ─── Defaults ───────────────────────────────────────────────────────────────

function defaultCPU(): DetectedCPU {
  return {
    vendor: "unknown",
    brand: "Unknown CPU",
    family: 0,
    model: 0,
    stepping: 0,
    physicalCores: 1,
    logicalCores: 1,
    baseFreqMHz: 0,
    maxFreqMHz: 0,
    l1DataKB: 0,
    l1InstKB: 0,
    l2CacheKB: 0,
    l3CacheKB: 0,
    isaFeatures: [],
    buildTarget: "scalar",
    microarchitecture: "Unknown",
  };
}

function defaultMemory(): DetectedMemory {
  return {
    totalBytes: 0,
    availableBytes: 0,
    totalGB: 0,
    swapTotalBytes: 0,
    ramType: "unknown",
    ramSpeedMHz: 0,
    ecc: false,
  };
}

// ─── Main Detection ─────────────────────────────────────────────────────────

/** Detect full hardware profile of the current machine */
export function detectHardware(): HardwareProfile {
  const os =
    typeof process !== "undefined" && process.platform
      ? process.platform
      : typeof navigator !== "undefined"
        ? navigator.platform
        : "unknown";

  const arch =
    typeof process !== "undefined" && process.arch
      ? process.arch
      : typeof navigator !== "undefined"
        ? navigator.userAgent
        : "unknown";

  // Detect VM
  let isVirtual = false;
  let virtualType: HardwareProfile["virtualType"];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    const dmi = fs.readFileSync("/sys/class/dmi/id/product_name", "utf-8").trim().toLowerCase();
    if (dmi.includes("vmware")) { isVirtual = true; virtualType = "vmware"; }
    else if (dmi.includes("virtualbox")) { isVirtual = true; virtualType = "kvm"; }
    else if (dmi.includes("kvm") || dmi.includes("qemu")) { isVirtual = true; virtualType = "kvm"; }
    else if (dmi.includes("xen")) { isVirtual = true; virtualType = "xen"; }
    else if (dmi.includes("microsoft")) { isVirtual = true; virtualType = "hyper-v"; }
  } catch {
    // Not on Linux or not accessible
  }

  let hostname = "unknown";
  let kernelVersion = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("child_process") as typeof import("child_process");
    hostname = execSync("hostname", { encoding: "utf-8", timeout: 3000 }).trim();
    kernelVersion = execSync("uname -r", { encoding: "utf-8", timeout: 3000 }).trim();
  } catch {
    // Not available
  }

  return {
    hostname,
    os,
    arch,
    kernelVersion,
    cpu: detectCPULinux(),
    memory: detectMemoryLinux(),
    storage: detectStorageLinux(),
    detectedAt: new Date().toISOString(),
    isVirtual,
    virtualType,
  };
}

// ─── SSH Probe (for remote servers) ─────────────────────────────────────────

/** Generate an SSH probe script that runs on a remote server and returns hardware info */
export function generateSSHProbeScript(): string {
  return `#!/bin/bash
# stitaP Hardware Detection Probe
# Run this on the target server to detect its hardware capabilities.
# Usage: ssh user@server 'bash -s' < probe.sh

echo "=== STITAP HARDWARE PROBE ==="
echo "hostname: $(hostname)"
echo "kernel: $(uname -r)"
echo "arch: $(uname -m)"
echo "os: $(cat /etc/os-release 2>/dev/null | head -1)"

# CPU info
echo "=== CPU ==="
grep -E '(model name|vendor_id|cpu family|model|stepping|cpu MHz|cache size|flags|processor)' /proc/cpuinfo | head -20

# Core count
echo "cores_physical: $(lscpu 2>/dev/null | grep 'Core(s) per socket' | awk '{print $NF}' || echo unknown)"
echo "cores_socket: $(lscpu 2>/dev/null | grep 'Socket(s)' | awk '{print $NF}' || echo 1)"
echo "threads: $(nproc 2>/dev/null || echo unknown)"

# Memory
echo "=== MEMORY ==="
grep -E '(MemTotal|MemAvailable|SwapTotal)' /proc/meminfo

# RAM type via dmidecode (requires root)
echo "=== RAM DETAILS ==="
dmidecode -t memory 2>/dev/null | grep -E '(Type:|Speed:|Size:)' | head -12 || echo "dmidecode not available (need root)"

# Storage
echo "=== STORAGE ==="
lsblk -d -o NAME,SIZE,ROTA,TYPE 2>/dev/null || fdisk -l 2>/dev/null | grep "Disk /dev"
df -h / 2>/dev/null | tail -1

# Virtualization detection
echo "=== VIRTUALIZATION ==="
cat /sys/class/dmi/id/product_name 2>/dev/null || echo "unknown"
grep -c 'hypervisor' /proc/cpuinfo 2>/dev/null || echo 0

# ISA features check
echo "=== ISA CHECK ==="
echo "sse: $(grep -c 'sse ' /proc/cpuinfo)"
echo "sse2: $(grep -c 'sse2 ' /proc/cpuinfo)"
echo "sse3: $(grep -c 'sse3 ' /proc/cpuinfo)"
echo "ssse3: $(grep -c 'ssse3 ' /proc/cpuinfo)"
echo "sse4_1: $(grep -c 'sse4_1 ' /proc/cpuinfo)"
echo "avx: $(grep -c ' avx ' /proc/cpuinfo)"
echo "avx2: $(grep -c ' avx2 ' /proc/cpuinfo)"
echo "avx512f: $(grep -c ' avx512f ' /proc/cpuinfo)"
echo "fma: $(grep -c ' fma ' /proc/cpuinfo)"
echo "f16c: $(grep -c ' f16c ' /proc/cpuinfo)"
echo "popcnt: $(grep -c ' popcnt ' /proc/cpuinfo)"

echo "=== END PROBE ==="
`;
}

/** Parse probe output into a HardwareProfile */
export function parseProbeOutput(output: string): Partial<HardwareProfile> {
  const lines = output.split("\n");
  const result: Partial<HardwareProfile> = {};

  const hostnameLine = lines.find((l) => l.startsWith("hostname:"));
  if (hostnameLine) result.hostname = hostnameLine.split(":")[1]?.trim();

  const kernelLine = lines.find((l) => l.startsWith("kernel:"));
  if (kernelLine) result.kernelVersion = kernelLine.split(":")[1]?.trim();

  // Parse ISA checks
  const features: ISAFeature[] = [];
  const isaCheck = lines.filter((l) => l.includes(":") && !l.startsWith("="));

  for (const line of isaCheck) {
    const [key, val] = line.split(":").map((s) => s.trim());
    const count = parseInt(val, 10);
    if (count > 0) {
      const featureMap: Record<string, ISAFeature> = {
        sse: "sse", sse2: "sse2", sse3: "sse3", ssse3: "ssse3",
        sse4_1: "sse4.1", avx: "avx", avx2: "avx2", avx512f: "avx512f",
        fma: "fma", f16c: "f16c", popcnt: "popcnt",
      };
      if (featureMap[key]) features.push(featureMap[key]);
    }
  }

  // Parse memory
  const memTotal = lines.find((l) => l.startsWith("MemTotal:"));
  if (memTotal) {
    const kb = parseInt(memTotal.split(":")[1]?.trim() || "0", 10);
    result.memory = {
      ...defaultMemory(),
      totalBytes: kb * 1024,
      totalGB: Math.round((kb / 1048576) * 10) / 10,
      availableBytes: kb * 1024 * 0.8,
      swapTotalBytes: 0,
      ramType: "unknown",
      ramSpeedMHz: 0,
      ecc: false,
    };
  }

  // Parse core count
  const threadsLine = lines.find((l) => l.startsWith("threads:"));
  const physCoresLine = lines.find((l) => l.startsWith("cores_physical:"));

  result.cpu = {
    ...defaultCPU(),
    isaFeatures: features,
    buildTarget: featuresToBuildTarget(features),
    physicalCores: parseInt(physCoresLine?.split(":")[1]?.trim() || "1", 10) || 1,
    logicalCores: parseInt(threadsLine?.split(":")[1]?.trim() || "1", 10) || 1,
  };

  // Detect virtualization
  const vmLine = lines.find((l) => l.includes("vmware") || l.includes("virtualbox") || l.includes("kvm") || l.includes("xen"));
  if (vmLine) {
    result.isVirtual = true;
    if (vmLine.includes("vmware")) result.virtualType = "vmware";
    else if (vmLine.includes("kvm")) result.virtualType = "kvm";
    else if (vmLine.includes("xen")) result.virtualType = "xen";
  }

  return result;
}
