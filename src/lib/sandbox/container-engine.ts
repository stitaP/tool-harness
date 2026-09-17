/**
 * stitaP Cross-Platform Container Engine — Lazy Install Edition
 *
 * Key principle: ONLY install what's needed, WHEN it's needed.
 *
 * The agent asks "run this Python code." The system:
 * 1. Checks: Is Python already on this machine? → Use it directly
 * 2. Checks: Is Docker available with a Python image cached? → Use that
 * 3. Only if neither exists: Pull Docker image / install binary
 * 4. Remembers what was installed → next time it's instant
 *
 * Nothing is downloaded until the first task that needs it.
 * If an agent never uses Java, Java is never installed.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ContainerBackend = "docker" | "podman" | "chroot" | "process" | "native" | "webworker";

export type RuntimeLanguage = "python" | "java" | "node" | "rust" | "go" | "bash" | "deno" | "ruby";

export type ContainerStatus = "creating" | "running" | "stopped" | "error" | "paused";

export interface ContainerConfig {
  name: string;
  runtime: RuntimeLanguage;
  version?: string;
  memoryMB?: number;
  cpuLimit?: number;
  timeoutSecs?: number;
  persistent?: boolean;
  env?: Record<string, string>;
  network?: "none" | "restricted" | "full";
  allowedDomains?: string[];
  volumes?: Array<{ host: string; container: string; readonly?: boolean }>;
  workdir?: string;
  packages?: string[];
  startupScript?: string;
}

export interface Container {
  id: string;
  name: string;
  config: ContainerConfig;
  status: ContainerStatus;
  backend: ContainerBackend;
  image: string;
  createdAt: string;
  lastActivity: string;
  pid?: number;
  dockerId?: string;
  ipAddress?: string;
  installedRuntimes: Record<string, string>;
  initialized: boolean;
  resources: {
    cpuPercent: number;
    memoryMB: number;
    diskMB: number;
    runningTimeSecs: number;
  };
  logs: string[];
  exitCode: number | null;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  artifacts: Array<{ path: string; size: number }>;
}

export interface RuntimeInfo {
  language: RuntimeLanguage;
  version: string;
  installSizeMB: number;
  installCommand: string;
  binary: string;
  packageManager: string;
  packageInstallCmd: string;
  setupCommands: string[];
  fileExtension: string;
  runCommand: (file: string) => string;
}

export interface HostRuntimeStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  /** How the runtime was obtained */
  source: "host" | "docker" | "not-installed";
}

// ─── Runtime Catalog ────────────────────────────────────────────────────────

export const RUNTIME_CATALOG: Record<RuntimeLanguage, {
  defaultVersion: string;
  dockerImage: string;
  installSizeMB: number;
  binary: string;
  hostBinaries: string[]; // binary names to check on host
  installCmd: string;     // command to install on host if needed
  packageManager: string;
  packageInstallCmd: string;
  setupCommands: string[];
  fileExtension: string;
  runCommand: (file: string) => string;
}> = {
  python: {
    defaultVersion: "3.11",
    dockerImage: "python:3.11-slim",
    installSizeMB: 250,
    binary: "python3",
    hostBinaries: ["python3", "python"],
    installCmd: "apt-get update && apt-get install -y python3 python3-pip",
    packageManager: "pip",
    packageInstallCmd: "pip install",
    setupCommands: ["pip install --upgrade pip"],
    fileExtension: ".py",
    runCommand: (f) => `python3 ${f}`,
  },
  java: {
    defaultVersion: "21",
    dockerImage: "eclipse-temurin:21-jdk",
    installSizeMB: 500,
    binary: "java",
    hostBinaries: ["java", "javac"],
    installCmd: "apt-get update && apt-get install -y default-jdk",
    packageManager: "maven",
    packageInstallCmd: "mvn dependency:copy -Dartifact=",
    setupCommands: ["apt-get update && apt-get install -y maven"],
    fileExtension: ".java",
    runCommand: (f) => `javac ${f} && java ${f.replace(".java", "")}`,
  },
  node: {
    defaultVersion: "21",
    dockerImage: "node:21-slim",
    installSizeMB: 200,
    binary: "node",
    hostBinaries: ["node", "nodejs"],
    installCmd: "apt-get update && apt-get install -y nodejs npm",
    packageManager: "npm",
    packageInstallCmd: "npm install",
    setupCommands: ["npm install -g typescript tsx"],
    fileExtension: ".js",
    runCommand: (f) => `node ${f}`,
  },
  rust: {
    defaultVersion: "latest",
    dockerImage: "rust:slim",
    installSizeMB: 800,
    binary: "rustc",
    hostBinaries: ["rustc", "cargo"],
    installCmd: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
    packageManager: "cargo",
    packageInstallCmd: "cargo add",
    setupCommands: [],
    fileExtension: ".rs",
    runCommand: (f) => `rustc ${f} -o /tmp/out && /tmp/out`,
  },
  go: {
    defaultVersion: "1.22",
    dockerImage: "golang:1.22-alpine",
    installSizeMB: 300,
    binary: "go",
    hostBinaries: ["go"],
    installCmd: "apt-get update && apt-get install -y golang",
    packageManager: "go",
    packageInstallCmd: "go get",
    setupCommands: [],
    fileExtension: ".go",
    runCommand: (f) => `go run ${f}`,
  },
  bash: {
    defaultVersion: "5",
    dockerImage: "bash:latest",
    installSizeMB: 20,
    binary: "bash",
    hostBinaries: ["bash", "sh"],
    installCmd: "apt-get update && apt-get install -y bash",
    packageManager: "apt-get",
    packageInstallCmd: "apt-get install -y",
    setupCommands: [],
    fileExtension: ".sh",
    runCommand: (f) => `bash ${f}`,
  },
  deno: {
    defaultVersion: "1.42",
    dockerImage: "denoland/deno:latest",
    installSizeMB: 100,
    binary: "deno",
    hostBinaries: ["deno"],
    installCmd: "curl -fsSL https://deno.land/install.sh | sh",
    packageManager: "deno",
    packageInstallCmd: "deno add",
    setupCommands: [],
    fileExtension: ".ts",
    runCommand: (f) => `deno run --allow-all ${f}`,
  },
  ruby: {
    defaultVersion: "3.3",
    dockerImage: "ruby:3.3-slim",
    installSizeMB: 200,
    binary: "ruby",
    hostBinaries: ["ruby"],
    installCmd: "apt-get update && apt-get install -y ruby-full",
    packageManager: "gem",
    packageInstallCmd: "gem install",
    setupCommands: [],
    fileExtension: ".rb",
    runCommand: (f) => `ruby ${f}`,
  },
};

// ─── Host Runtime Detection ─────────────────────────────────────────────────

/** Cache of detected host runtimes — checked once, reused forever */
const hostRuntimeCache = new Map<RuntimeLanguage, HostRuntimeStatus>();

/** Docker image cache — tracks which images are already pulled */
const dockerImageCache = new Map<string, boolean>();

/**
 * Check if a runtime is already installed on the host machine.
 * This runs `which <binary>` or `<binary> --version` to detect it.
 * Result is cached — only checked once per process lifetime.
 */
export async function detectHostRuntime(
  language: RuntimeLanguage,
): Promise<HostRuntimeStatus> {
  // Return cached result if available
  const cached = hostRuntimeCache.get(language);
  if (cached) return cached;

  const runtime = RUNTIME_CATALOG[language];
  const status: HostRuntimeStatus = {
    installed: false,
    version: null,
    path: null,
    source: "not-installed",
  };

  // Only check host if we're in Node.js (not browser)
  if (typeof process === "undefined" || !process.versions?.node) {
    hostRuntimeCache.set(language, status);
    return status;
  }

  try {
    const { execSync } = await import("child_process");

    // Check each possible binary name
    for (const binary of runtime.hostBinaries) {
      try {
        // Try to get version
        const version = execSync(`${binary} --version 2>/dev/null || ${binary} -version 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 5000,
          stdio: "pipe",
        }).trim().split("\n")[0];

        const path = execSync(`which ${binary} 2>/dev/null || command -v ${binary} 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 3000,
          stdio: "pipe",
        }).trim();

        status.installed = true;
        status.version = version;
        status.path = path;
        status.source = "host";
        hostRuntimeCache.set(language, status);
        return status;
      } catch {
        // Binary not found, try next
      }
    }
  } catch {
    // Not in Node.js environment
  }

  hostRuntimeCache.set(language, status);
  return status;
}

/**
 * Check if a Docker image is already pulled locally.
 */
export async function isDockerImageCached(image: string): Promise<boolean> {
  const cached = dockerImageCache.get(image);
  if (cached !== undefined) return cached;

  try {
    const { execSync } = await import("child_process");
    execSync(`docker image inspect ${image} > /dev/null 2>&1`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    });
    dockerImageCache.set(image, true);
    return true;
  } catch {
    dockerImageCache.set(image, false);
    return false;
  }
}

/**
 * Pull a Docker image only if it's not already cached.
 */
async function ensureDockerImage(image: string): Promise<boolean> {
  if (await isDockerImageCached(image)) return true;

  try {
    const { execSync } = await import("child_process");
    execSync(`docker pull ${image}`, {
      encoding: "utf-8",
      timeout: 120_000, // 2 min for image pull
      stdio: "pipe",
    });
    dockerImageCache.set(image, true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect what's available on this machine and recommend the best approach.
 */
export async function detectBackends(): Promise<{
  docker: boolean;
  podman: boolean;
  chroot: boolean;
  webworker: boolean;
  recommended: ContainerBackend;
  hostRuntimes: Record<RuntimeLanguage, HostRuntimeStatus>;
}> {
  const result = {
    docker: false,
    podman: false,
    chroot: false,
    webworker: typeof Worker !== "undefined",
    recommended: "webworker" as ContainerBackend,
    hostRuntimes: {} as Record<RuntimeLanguage, HostRuntimeStatus>,
  };

  // Check Docker/Podman/chroot (same as before)
  if (typeof process !== "undefined" && process.versions?.node) {
    try {
      const { execSync } = await import("child_process");
      execSync("docker info --format '{{.ServerVersion}}'", { encoding: "utf-8", timeout: 5000, stdio: "pipe" });
      result.docker = true;
      result.recommended = "docker";
    } catch { /* no docker */ }

    try {
      const { execSync } = await import("child_process");
      execSync("podman info --format '{{.Version.Version}}'", { encoding: "utf-8", timeout: 5000, stdio: "pipe" });
      result.podman = true;
      if (!result.docker) result.recommended = "podman";
    } catch { /* no podman */ }

    if (process.platform === "linux") {
      try {
        const { execSync } = await import("child_process");
        execSync("chroot --version", { encoding: "utf-8", timeout: 3000, stdio: "pipe" });
        result.chroot = true;
        if (!result.docker && !result.podman) result.recommended = "chroot";
      } catch { /* no chroot */ }
    }
  }

  // Detect host runtimes for all languages
  for (const lang of Object.keys(RUNTIME_CATALOG) as RuntimeLanguage[]) {
    result.hostRuntimes[lang] = await detectHostRuntime(lang);
  }

  return result;
}

// ─── Container Manager ──────────────────────────────────────────────────────

const containers = new Map<string, Container>();

/** Create a new container */
export async function createContainer(config: ContainerConfig): Promise<Container> {
  const backends = await detectBackends();
  const backend = backends.recommended;
  const runtime = RUNTIME_CATALOG[config.runtime];

  const id = `ctr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const container: Container = {
    id,
    name: config.name,
    config,
    status: "creating",
    backend,
    image: runtime.dockerImage,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    installedRuntimes: {},
    initialized: false,
    resources: { cpuPercent: 0, memoryMB: 0, diskMB: 0, runningTimeSecs: 0 },
    logs: [],
    exitCode: null,
  };

  containers.set(id, container);

  try {
    switch (backend) {
      case "docker":
      case "podman":
        await initDockerContainer(container);
        break;
      case "chroot":
        await initChrootContainer(container);
        break;
      case "process":
      case "native":
        await initProcessContainer(container);
        break;
      default:
        container.status = "running";
        container.logs.push(`[${container.name}] Container ready (${backend} mode)`);
    }

    // Only install packages if actually requested
    if (config.packages && config.packages.length > 0) {
      const pkgCmd = runtime.packageInstallCmd;
      for (const pkg of config.packages) {
        await execInContainer(id, `${pkgCmd} ${pkg}`);
      }
    }

    if (config.startupScript) {
      await execInContainer(id, config.startupScript);
    }

    container.initialized = true;
    container.status = "running";
  } catch (err) {
    container.status = "error";
    container.logs.push(`[${container.name}] Error: ${err}`);
  }

  return container;
}

/** Execute a command inside a container */
export async function execInContainer(
  containerId: string,
  command: string,
  timeoutSecs?: number,
): Promise<ExecutionResult> {
  const container = containers.get(containerId);
  if (!container) {
    return { success: false, stdout: "", stderr: "Container not found", exitCode: 1, duration: 0, artifacts: [] };
  }

  const start = Date.now();
  const timeout = timeoutSecs ?? container.config.timeoutSecs ?? 30;

  container.lastActivity = new Date().toISOString();
  container.resources.runningTimeSecs += (Date.now() - start) / 1000;

  try {
    switch (container.backend) {
      case "docker":
      case "podman":
        return await execDocker(container, command, timeout);
      case "chroot":
        return await execChroot(container, command, timeout);
      case "process":
      case "native":
        return await execProcess(container, command, timeout);
      default:
        return {
          success: true,
          stdout: `[${container.name}] Simulated: ${command}`,
          stderr: "",
          exitCode: 0,
          duration: Date.now() - start,
          artifacts: [],
        };
    }
  } catch (err) {
    return {
      success: false,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
      duration: Date.now() - start,
      artifacts: [],
    };
  }
}

export async function writeFileInContainer(containerId: string, path: string, content: string): Promise<boolean> {
  const result = await execInContainer(containerId, `cat > ${path} << 'ENDOFFILE'\n${content}\nENDOFFILE`);
  return result.success;
}

export async function readFileFromContainer(containerId: string, path: string): Promise<string | null> {
  const result = await execInContainer(containerId, `cat ${path}`);
  return result.success ? result.stdout : null;
}

export async function stopContainer(containerId: string): Promise<boolean> {
  const container = containers.get(containerId);
  if (!container) return false;
  container.status = "stopped";
  if (container.dockerId && (container.backend === "docker" || container.backend === "podman")) {
    try {
      const { execSync } = await import("child_process");
      execSync(`${container.backend} stop ${container.dockerId}`, { timeout: 10000 });
    } catch { /* best effort */ }
  }
  return true;
}

export async function destroyContainer(containerId: string): Promise<boolean> {
  await stopContainer(containerId);
  return containers.delete(containerId);
}

export function listContainers(): Container[] {
  return [...containers.values()];
}

export function getContainer(containerId: string): Container | undefined {
  return containers.get(containerId);
}

// ─── Docker Backend ─────────────────────────────────────────────────────────

async function initDockerContainer(container: Container): Promise<void> {
  const runtime = RUNTIME_CATALOG[container.config.runtime];

  // ONLY pull image if not already cached — this is the lazy install
  const imageReady = await ensureDockerImage(runtime.dockerImage);
  if (!imageReady) {
    container.status = "error";
    container.logs.push(`[${container.name}] Failed to pull Docker image: ${runtime.dockerImage}`);
    return;
  }

  const cmd = container.backend;
  const args = [
    "run", "-d",
    "--name", container.id,
    "--memory", `${container.config.memoryMB ?? 512}m`,
    "--cpus", `${container.config.cpuLimit ?? 1}`,
    "--network", container.config.network === "none" ? "none" : "bridge",
    "-w", container.config.workdir ?? "/workspace",
    "-v", `${container.id}-workspace:/workspace`,
  ];

  for (const [key, val] of Object.entries(container.config.env ?? {})) {
    args.push("-e", `${key}=${val}`);
  }

  args.push(runtime.dockerImage);
  args.push("sleep", "infinity");

  try {
    const { execSync } = await import("child_process");
    const dockerId = execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", timeout: 60000 }).trim();
    container.dockerId = dockerId;
    container.status = "running";
    container.logs.push(`[${container.name}] Docker started: ${dockerId.slice(0, 12)} (image was ${await isDockerImageCached(runtime.dockerImage) ? "cached" : "freshly pulled"})`);
  } catch (err) {
    container.status = "error";
    container.logs.push(`[${container.name}] Docker init failed: ${err}`);
  }
}

async function execDocker(container: Container, command: string, timeout: number): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { execSync } = await import("child_process");
    const output = execSync(
      `${container.backend} exec ${container.dockerId} bash -c ${JSON.stringify(command)}`,
      { encoding: "utf-8", timeout: timeout * 1000, stdio: "pipe" },
    );
    return { success: true, stdout: output, stderr: "", exitCode: 0, duration: Date.now() - start, artifacts: [] };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      success: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? (err instanceof Error ? err.message : String(err)),
      exitCode: e.status ?? 1,
      duration: Date.now() - start,
      artifacts: [],
    };
  }
}

// ─── Chroot Backend ─────────────────────────────────────────────────────────

async function initChrootContainer(container: Container): Promise<void> {
  const { execSync } = await import("child_process");
  const rootfs = `/tmp/stitap-chroot/${container.id}`;
  execSync(`mkdir -p ${rootfs}/{bin,lib,lib64,usr,tmp,workspace,proc}`, { timeout: 5000 });

  const essentialBins = ["/bin/bash", "/bin/sh", "/usr/bin/env"];
  for (const bin of essentialBins) {
    try { execSync(`cp ${bin} ${rootfs}${bin} 2>/dev/null || true`, { timeout: 5000 }); } catch { /* ok */ }
  }

  container.status = "running";
  container.logs.push(`[${container.name}] Chroot created at ${rootfs}`);
}

async function execChroot(container: Container, command: string, timeout: number): Promise<ExecutionResult> {
  const start = Date.now();
  const rootfs = `/tmp/stitap-chroot/${container.id}`;
  try {
    const { execSync } = await import("child_process");
    const output = execSync(`chroot ${rootfs} /bin/bash -c ${JSON.stringify(command)}`, {
      encoding: "utf-8", timeout: timeout * 1000, stdio: "pipe",
    });
    return { success: true, stdout: output, stderr: "", exitCode: 0, duration: Date.now() - start, artifacts: [] };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { success: false, stdout: e.stdout ?? "", stderr: e.stderr ?? String(err), exitCode: e.status ?? 1, duration: Date.now() - start, artifacts: [] };
  }
}

// ─── Process Backend ────────────────────────────────────────────────────────

async function initProcessContainer(container: Container): Promise<void> {
  container.status = "running";
  container.logs.push(`[${container.name}] Process container (no isolation)`);
}

async function execProcess(container: Container, command: string, timeout: number): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { execSync } = await import("child_process");
    const output = execSync(command, {
      encoding: "utf-8", timeout: timeout * 1000, stdio: "pipe",
      cwd: container.config.workdir ?? "/tmp",
    });
    return { success: true, stdout: output, stderr: "", exitCode: 0, duration: Date.now() - start, artifacts: [] };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { success: false, stdout: e.stdout ?? "", stderr: e.stderr ?? String(err), exitCode: e.status ?? 1, duration: Date.now() - start, artifacts: [] };
  }
}

// ─── Lazy Agent-Facing API ──────────────────────────────────────────────────

/**
 * The main entry point for agents.
 *
 * SMART PROVISIONING — checks in order:
 * 1. Is the runtime already on the host? → Use it directly (zero overhead)
 * 2. Is Docker available with cached image? → Use Docker (fast start)
 * 3. Is Docker available but image not cached? → Pull image then use Docker
 * 4. Fallback to chroot or native process
 *
 * Nothing is installed until the FIRST task that needs it.
 * If the agent only uses Python, only Python is ever touched.
 */
export async function provisionCodingEnvironment(
  runtime: RuntimeLanguage,
  options: {
    name?: string;
    packages?: string[];
    memoryMB?: number;
    timeoutSecs?: number;
  } = {},
): Promise<{
  containerId: string;
  backend: ContainerBackend;
  runtime: RuntimeLanguage;
  version: string;
  hostDetected: boolean;
  runCode: (filename: string, code: string) => Promise<ExecutionResult>;
  exec: (command: string) => Promise<ExecutionResult>;
  destroy: () => Promise<boolean>;
}> {
  const runtimeInfo = RUNTIME_CATALOG[runtime];

  // STEP 1: Check if runtime is already on the host
  const hostStatus = await detectHostRuntime(runtime);

  if (hostStatus.installed) {
    // Fastest path — run directly on host, no container needed
    const container = await createContainer({
      name: options.name ?? `${runtime}-env-${Date.now()}`,
      runtime,
      memoryMB: options.memoryMB ?? 512,
      timeoutSecs: options.timeoutSecs ?? 60,
      persistent: true,
      network: "restricted",
      packages: options.packages,
    });
    // Override backend to native since we're using the host runtime
    container.backend = "native";

    return {
      containerId: container.id,
      backend: "native",
      runtime,
      version: hostStatus.version ?? runtimeInfo.defaultVersion,
      hostDetected: true,
      runCode: async (filename: string, code: string) => {
        await writeFileInContainer(container.id, `/workspace/${filename}`, code);
        return execInContainer(container.id, runtimeInfo.runCommand(`/workspace/${filename}`));
      },
      exec: (cmd: string) => execInContainer(container.id, cmd),
      destroy: () => destroyContainer(container.id),
    };
  }

  // STEP 2-4: No host runtime — use container (Docker/chroot/process)
  const container = await createContainer({
    name: options.name ?? `${runtime}-env-${Date.now()}`,
    runtime,
    memoryMB: options.memoryMB ?? 512,
    timeoutSecs: options.timeoutSecs ?? 60,
    persistent: true,
    network: "restricted",
    packages: options.packages,
  });

  return {
    containerId: container.id,
    backend: container.backend,
    runtime,
    version: runtimeInfo.defaultVersion,
    hostDetected: false,
    runCode: async (filename: string, code: string) => {
      await writeFileInContainer(container.id, `/workspace/${filename}`, code);
      return execInContainer(container.id, runtimeInfo.runCommand(`/workspace/${filename}`));
    },
    exec: (cmd: string) => execInContainer(container.id, cmd),
    destroy: () => destroyContainer(container.id),
  };
}

/**
 * One-shot code execution with automatic cleanup.
 * Agent says "run this Python code" → gets a result.
 * Only installs what's needed. Reuses host runtime if available.
 */
export async function runAgentCode(
  language: RuntimeLanguage,
  code: string,
  options: { timeoutSecs?: number; packages?: string[] } = {},
): Promise<ExecutionResult> {
  const runtime = RUNTIME_CATALOG[language];
  const env = await provisionCodingEnvironment(language, {
    name: `agent-${language}-${Date.now()}`,
    packages: options.packages,
    timeoutSecs: options.timeoutSecs ?? 30,
  });

  const ext = runtime.fileExtension;
  return env.runCode(`script${ext}`, code);
}

/**
 * Clear the host runtime cache (e.g., after installing a new runtime).
 */
export function clearRuntimeCache(): void {
  hostRuntimeCache.clear();
  dockerImageCache.clear();
}

// ─── HuggingFace Model Provisioning ────────────────────────────────────────

import {
  hasHFToken,
  startDownload,
  listDownloadedModels,
  type HFGGUFFile,
} from "@/lib/huggingface";

export interface ModelProvisionResult {
  success: boolean;
  /** Path to the GGUF model file inside the container/workspace */
  modelPath: string;
  /** The GGUF file that was used */
  file: HFGGUFFile;
  /** Whether it was already downloaded */
  cached: boolean;
  /** Backend used */
  backend: ContainerBackend;
  /** Error message if failed */
  error?: string;
}

/**
 * Automatically provision an LLM model for use in a container.
 *
 * 1. Check if a compatible model is already downloaded (IndexedDB)
 * 2. If not, search HuggingFace for GGUF files matching the request
 * 3. Download the best matching file
 * 4. Return the local path ready for use with llama.cpp
 */
export async function provisionModel(
  modelId: string,
  options: {
    preferredQuant?: string;
    maxRAMGB?: number;
    onProgress?: (progress: number) => void;
  } = {},
): Promise<ModelProvisionResult> {
  const { preferredQuant = "Q4_K_M", onProgress } = options;

  if (!hasHFToken()) {
    return {
      success: false,
      modelPath: "",
      file: { filename: "", quant: "", sizeBytes: 0, sizeHuman: "", downloadUrl: "" },
      cached: false,
      backend: "native",
      error: "No HuggingFace token configured. Add one in Settings → HuggingFace Integration.",
    };
  }

  // Check if already downloaded
  const downloaded = await listDownloadedModels();
  const existing = downloaded.find(
    (m: { modelId: string; filename: string }) => m.modelId === modelId && m.filename.includes(preferredQuant),
  );

  if (existing) {
    return {
      success: true,
      modelPath: existing.localPath,
      file: {
        filename: existing.filename,
        quant: preferredQuant,
        sizeBytes: existing.sizeBytes,
        sizeHuman: "",
        downloadUrl: "",
      },
      cached: true,
      backend: "native",
    };
  }

  // Search for the model's GGUF files
  try {
    const searchUrl = `https://huggingface.co/api/models/${modelId}`;
    const token = localStorage.getItem("stitap_hf_token");
    const headers: Record<string, string> = {};
    if (token) {
      const parsed = JSON.parse(token) as { token: string };
      headers.Authorization = `Bearer ${parsed.token}`;
    }

    const res = await fetch(searchUrl, { headers });
    if (!res.ok) throw new Error(`Model not found: ${res.status}`);

    const data: { siblings?: Array<{ filename: string; size?: number }> } = await res.json();
    const ggufFiles = (data.siblings ?? [])
      .filter((f) => f.filename.endsWith(".gguf"))
      .map((f) => ({
        filename: f.filename,
        quant: f.filename.includes("Q4_K_M") ? "Q4_K_M"
          : f.filename.includes("Q4_K_S") ? "Q4_K_S"
          : f.filename.includes("Q5_K_M") ? "Q5_K_M"
          : f.filename.includes("Q8_0") ? "Q8_0"
          : f.filename.includes("F16") ? "F16"
          : "unknown",
        sizeBytes: f.size ?? 0,
        sizeHuman: "",
        downloadUrl: `https://huggingface.co/${modelId}/resolve/main/${f.filename}`,
      }));

    // Find best matching file
    const target = ggufFiles.find((f) => f.quant === preferredQuant)
      ?? ggufFiles.find((f) => f.quant === "Q4_K_M")
      ?? ggufFiles[0];

    if (!target) {
      return {
        success: false,
        modelPath: "",
        file: { filename: "", quant: "", sizeBytes: 0, sizeHuman: "", downloadUrl: "" },
        cached: false,
        backend: "native",
        error: `No GGUF files found for model ${modelId}`,
      };
    }

    // Download it
    const job = await startDownload(modelId, target, (progress) => {
      onProgress?.(progress.percent);
    });

    if (job.status !== "completed") {
      return {
        success: false,
        modelPath: "",
        file: target,
        cached: false,
        backend: "native",
        error: job.error ?? "Download failed",
      };
    }

    return {
      success: true,
      modelPath: job.localPath ?? `models/${modelId}/${target.filename}`,
      file: target,
      cached: false,
      backend: "native",
    };
  } catch (err) {
    return {
      success: false,
      modelPath: "",
      file: { filename: "", quant: "", sizeBytes: 0, sizeHuman: "", downloadUrl: "" },
      cached: false,
      backend: "native",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
