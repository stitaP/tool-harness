/**
 * stitaP HuggingFace Integration
 *
 * Provides model search, download management, GGUF format detection,
 * quantization level selection, and authenticated downloads from
 * the HuggingFace Hub API.
 *
 * Credentials are stored in localStorage (HF_TOKEN key) and never
 * sent to any server except huggingface.co directly from the browser.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HFToken {
  token: string;
  username?: string;
  expiresAt?: number;
}

export interface HFModel {
  id: string;
  modelId: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  pipelineTag?: string;
  lastModified: string;
  private: boolean;
  _gated: boolean;
  /** GGUF files available for download */
  ggufFiles: HFGGUFFile[];
  /** Model parameters count (e.g., "7B", "1.5B") */
  params?: string;
  /** Supported quantization levels */
  quantLevels: string[];
  /** Estimated RAM needed in GB */
  estimatedRAMGB?: number;
  /** Description from model card */
  description?: string;
}

export interface HFGGUFFile {
  filename: string;
  /** Quantization level (e.g., "Q4_K_M", "Q8_0", "F16") */
  quant: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Human-readable size */
  sizeHuman: string;
  /** Download URL */
  downloadUrl: string;
  /** SHA256 hash if available */
  sha256?: string;
}

export interface HFDownloadJob {
  id: string;
  modelId: string;
  file: HFGGUFFile;
  status: "queued" | "downloading" | "paused" | "completed" | "error";
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
  /** Local path where the file is saved */
  localPath?: string;
}

export interface HFSearchParams {
  query: string;
  author?: string;
  tags?: string[];
  pipelineTag?: string;
  sort?: "downloads" | "likes" | "lastModified";
  direction?: -1 | 1;
  limit?: number;
  /** Only show models with GGUF files */
  ggufOnly?: boolean;
  /** Filter by parameter count */
  maxParams?: number;
  /** Filter by estimated RAM */
  maxRAMGB?: number;
}

export interface HFSearchResult {
  models: HFModel[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HFDownloadProgress {
  jobId: string;
  modelId: string;
  filename: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  status: HFDownloadJob["status"];
}

/** Quantization level info for display and selection */
export interface QuantLevel {
  id: string;
  name: string;
  bitsPerWeight: number;
  qualityScore: number; // 1-10
  speedScore: number;   // 1-10
  ramMultiplier: number; // relative to F16 (F16 = 1.0)
  description: string;
}

// ─── Quantization Levels ────────────────────────────────────────────────────

export const QUANT_LEVELS: QuantLevel[] = [
  {
    id: "F16",
    name: "Float16",
    bitsPerWeight: 16,
    qualityScore: 10,
    speedScore: 3,
    ramMultiplier: 1.0,
    description: "Full float16 precision. Maximum quality but requires 2x RAM per parameter.",
  },
  {
    id: "Q8_0",
    name: "8-bit quantized",
    bitsPerWeight: 8,
    qualityScore: 9,
    speedScore: 5,
    ramMultiplier: 0.53,
    description: "Near-lossless quantization. Good for testing and high-quality inference.",
  },
  {
    id: "Q6_K",
    name: "6-bit K-quant",
    bitsPerWeight: 6,
    qualityScore: 8,
    speedScore: 6,
    ramMultiplier: 0.40,
    description: "K-quant method. Excellent quality-to-size ratio.",
  },
  {
    id: "Q5_K_M",
    name: "5-bit K-quant Medium",
    bitsPerWeight: 5,
    qualityScore: 7.5,
    speedScore: 7,
    ramMultiplier: 0.34,
    description: "Good balance. Most users' recommended choice.",
  },
  {
    id: "Q4_K_M",
    name: "4-bit K-quant Medium",
    bitsPerWeight: 4,
    qualityScore: 7,
    speedScore: 8,
    ramMultiplier: 0.28,
    description: "Most popular quant. Good quality with 75% memory reduction vs F16.",
  },
  {
    id: "Q4_K_S",
    name: "4-bit K-quant Small",
    bitsPerWeight: 4,
    qualityScore: 6.5,
    speedScore: 8.5,
    ramMultiplier: 0.26,
    description: "Slightly smaller than Q4_K_M. Use when RAM is tight.",
  },
  {
    id: "Q3_K_M",
    name: "3-bit K-quant Medium",
    bitsPerWeight: 3,
    qualityScore: 5.5,
    speedScore: 9,
    ramMultiplier: 0.22,
    description: "Noticeable quality loss on complex tasks. Good for simple Q&A.",
  },
  {
    id: "Q3_K_S",
    name: "3-bit K-quant Small",
    bitsPerWeight: 3,
    qualityScore: 5,
    speedScore: 9,
    ramMultiplier: 0.20,
    description: "Very compressed. Use only when RAM is extremely limited.",
  },
  {
    id: "Q2_K",
    name: "2-bit K-quant",
    bitsPerWeight: 2,
    qualityScore: 3.5,
    speedScore: 9.5,
    ramMultiplier: 0.16,
    description: "Significant quality loss. Only for experimentation or very constrained hardware.",
  },
  {
    id: "IQ4_XS",
    name: "iMatrix 4-bit XS",
    bitsPerWeight: 4,
    qualityScore: 7.5,
    speedScore: 8,
    ramMultiplier: 0.26,
    description: "Importance-matrix quantization. Better quality than Q4_K at same size.",
  },
  {
    id: "IQ3_XS",
    name: "iMatrix 3-bit XS",
    bitsPerWeight: 3,
    qualityScore: 6,
    speedScore: 9,
    ramMultiplier: 0.21,
    description: "Importance-matrix 3-bit. Better than Q3_K at same size.",
  },
  {
    id: "IQ2_XS",
    name: "iMatrix 2-bit XS",
    bitsPerWeight: 2,
    qualityScore: 4,
    speedScore: 9.5,
    ramMultiplier: 0.15,
    description: "Extreme compression with importance matrices. Experimental.",
  },
  {
    id: "IQ1_M",
    name: "iMatrix 1-bit Medium",
    bitsPerWeight: 1,
    qualityScore: 2,
    speedScore: 10,
    ramMultiplier: 0.10,
    description: "BitNet b1.58 era. Extreme compression. Research/experimental only.",
  },
];

// ─── Token Management ───────────────────────────────────────────────────────

const HF_TOKEN_KEY = "stitap_hf_token";

/** Get the stored HuggingFace token */
export function getHFToken(): HFToken | null {
  try {
    const raw = localStorage.getItem(HF_TOKEN_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw) as HFToken;
    if (token.expiresAt && Date.now() > token.expiresAt) {
      localStorage.removeItem(HF_TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/** Save a HuggingFace token */
export function setHFToken(token: string, username?: string): void {
  const hfToken: HFToken = { token, username };
  localStorage.setItem(HF_TOKEN_KEY, JSON.stringify(hfToken));
}

/** Remove the stored HuggingFace token */
export function clearHFToken(): void {
  localStorage.removeItem(HF_TOKEN_KEY);
}

/** Check if a valid token is configured */
export function hasHFToken(): boolean {
  return getHFToken() !== null;
}

/** Build auth headers for HuggingFace API calls */
function authHeaders(): Record<string, string> {
  const t = getHFToken();
  return t ? { Authorization: `Bearer ${t.token}` } : {};
}

// ─── Model Search ───────────────────────────────────────────────────────────

/**
 * Search HuggingFace Hub for models.
 * Supports filtering by GGUF files, parameter count, and RAM requirements.
 */
export async function searchModels(
  params: HFSearchParams,
): Promise<HFSearchResult> {
  const {
    query,
    author,
    tags = [],
    sort = "downloads",
    direction = -1,
    limit = 20,
    ggufOnly = true,
    maxParams,
    maxRAMGB,
  } = params;

  // Build the search query
  const searchParts: string[] = [query];
  if (author) searchParts.unshift(author);
  if (ggufOnly) tags.push("gguf");
  const fullQuery = searchParts.join("/");

  const searchParams = new URLSearchParams({
    search: fullQuery,
    sort,
    direction: String(direction),
    limit: String(Math.min(limit, 50)),
    filter: tags.join(","),
  });

  const url = `https://huggingface.co/api/models?${searchParams.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        ...authHeaders(),
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`HuggingFace API error: ${res.status} ${res.statusText}`);
    }

    const data: Array<{
      id: string;
      author?: string;
      downloads?: number;
      likes?: number;
      tags?: string[];
      pipeline_tag?: string;
      lastModified?: string;
      private?: boolean;
      gated?: string | boolean;
      siblings?: Array<{ filename: string; size?: number }>;
    }> = await res.json();

    let models: HFModel[] = data.map((m) => {
      const ggufFiles = extractGGUFFiles(m.siblings ?? []);
      const params = extractParamCount(m.tags ?? []);
      const quantLevels = extractQuantLevels(ggufFiles);
      const estimatedRAMGB = params ? estimateRAM(params, quantLevels[0]) : undefined;

      return {
        id: m.id,
        modelId: m.id,
        author: m.author ?? m.id.split("/")[0],
        downloads: m.downloads ?? 0,
        likes: m.likes ?? 0,
        tags: m.tags ?? [],
        pipelineTag: m.pipeline_tag,
        lastModified: m.lastModified ?? new Date().toISOString(),
        private: m.private ?? false,
        _gated: typeof m.gated === "string" ? true : (m.gated ?? false),
        ggufFiles,
        params,
        quantLevels,
        estimatedRAMGB,
      };
    });

    // Post-search filters
    if (maxParams) {
      models = models.filter((m) => {
        if (!m.params) return true;
        const num = parseFloat(m.params);
        return !isNaN(num) && num <= maxParams;
      });
    }

    if (maxRAMGB) {
      models = models.filter((m) => {
        if (!m.estimatedRAMGB) return true;
        return m.estimatedRAMGB <= maxRAMGB;
      });
    }

    return {
      models,
      total: models.length,
      page: 1,
      pageSize: limit,
    };
  } catch (err) {
    throw new Error(
      `Model search failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Get detailed info for a specific model */
export async function getModelInfo(modelId: string): Promise<HFModel> {
  const url = `https://huggingface.co/api/models/${modelId}`;

  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Model info failed: ${res.status} ${res.statusText}`);
  }

  const m: {
    id: string;
    author?: string;
    downloads?: number;
    likes?: number;
    tags?: string[];
    pipeline_tag?: string;
    lastModified?: string;
    private?: boolean;
    gated?: string | boolean;
    siblings?: Array<{ filename: string; size?: number }>;
    cardData?: { description?: string };
  } = await res.json();

  const ggufFiles = extractGGUFFiles(m.siblings ?? []);
  const params = extractParamCount(m.tags ?? []);
  const quantLevels = extractQuantLevels(ggufFiles);
  const estimatedRAMGB = params ? estimateRAM(params, quantLevels[0]) : undefined;

  return {
    id: m.id,
    modelId: m.id,
    author: m.author ?? m.id.split("/")[0],
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0,
    tags: m.tags ?? [],
    pipelineTag: m.pipeline_tag,
    lastModified: m.lastModified ?? new Date().toISOString(),
    private: m.private ?? false,
    _gated: typeof m.gated === "string" ? true : (m.gated ?? false),
    ggufFiles,
    params,
    quantLevels,
    estimatedRAMGB,
    description: m.cardData?.description,
  };
}

// ─── GGUF File Detection ────────────────────────────────────────────────────

/** Extract GGUF files from a model's file listing */
function extractGGUFFiles(
  siblings: Array<{ filename: string; size?: number }>,
): HFGGUFFile[] {
  return siblings
    .filter((f) => f.filename.endsWith(".gguf"))
    .map((f) => {
      const quant = extractQuantFromFilename(f.filename);
      const sizeBytes = f.size ?? 0;
      return {
        filename: f.filename,
        quant,
        sizeBytes,
        sizeHuman: formatBytes(sizeBytes),
        downloadUrl: `https://huggingface.co/${getCurrentModelId(f.filename)}resolve/main/${f.filename}`,
        sha256: undefined,
      };
    })
    .sort((a, b) => {
      // Sort: F16 > Q8 > Q6 > Q5 > Q4 > Q3 > Q2 > IQ
      const order = (q: string) => {
        if (q.startsWith("F16")) return 0;
        if (q.startsWith("Q8")) return 1;
        if (q.startsWith("Q6")) return 2;
        if (q.startsWith("Q5")) return 3;
        if (q.startsWith("Q4")) return 4;
        if (q.startsWith("Q3")) return 5;
        if (q.startsWith("Q2")) return 6;
        if (q.startsWith("IQ")) return 7;
        return 8;
      };
      return order(a.quant) - order(b.quant);
    });
}

function extractQuantFromFilename(filename: string): string {
  const name = filename.replace(".gguf", "");
  const patterns = [
    /IQ[1234]_[A-Z]+/,
    /Q[234568]_[A-Z]+/,
    /[Ff]16/,
    /[Ff]32/,
  ];
  for (const pat of patterns) {
    const match = name.match(pat);
    if (match) return match[0].toUpperCase();
  }
  return "unknown";
}

function getCurrentModelId(_filename: string): string {
  // Will be set by the caller
  return "";
}

function extractQuantLevels(files: HFGGUFFile[]): string[] {
  const levels = new Set(files.map((f) => f.quant));
  return Array.from(levels).sort();
}

// ─── Parameter Detection ────────────────────────────────────────────────────

function extractParamCount(tags: string[]): string | undefined {
  for (const tag of tags) {
    const match = tag.match(/(\d+\.?\d*)[bB]/);
    if (match) return `${match[1]}B`;
  }
  return undefined;
}

/** Estimate RAM needed for a model at a given quantization level */
function estimateRAM(params: string, quant: string): number {
  const numParams = parseFloat(params);
  if (isNaN(numParams)) return 0;

  const quantInfo = QUANT_LEVELS.find((q) => q.id === quant);
  const bitsPerWeight = quantInfo?.bitsPerWeight ?? 4;

  // bytes = params * bits_per_weight / 8
  const modelBytes = (numParams * 1_000_000_000 * bitsPerWeight) / 8;
  const modelGB = modelBytes / (1024 * 1024 * 1024);

  // Add ~20% overhead for KV cache and runtime
  return Math.round(modelGB * 1.2 * 10) / 10;
}

// ─── Download Management ────────────────────────────────────────────────────

const downloadJobs = new Map<string, HFDownloadJob>();
const downloadControllers = new Map<string, AbortController>();

/** Start downloading a GGUF file */
export async function startDownload(
  modelId: string,
  file: HFGGUFFile,
  onProgress?: (progress: HFDownloadProgress) => void,
): Promise<HFDownloadJob> {
  const jobId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const job: HFDownloadJob = {
    id: jobId,
    modelId,
    file,
    status: "downloading",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: file.sizeBytes,
    speed: 0,
    eta: 0,
    startedAt: new Date().toISOString(),
  };

  downloadJobs.set(jobId, job);

  const controller = new AbortController();
  downloadControllers.set(jobId, controller);

  // Build the download URL
  const url = `https://huggingface.co/${modelId}/resolve/main/${file.filename}`;

  try {
    const headers: Record<string, string> = {
      ...authHeaders(),
    };

    // If we have a partial download, resume from where we left off
    const existing = await getPartialDownload(modelId, file.filename);
    if (existing && existing.offset > 0) {
      headers.Range = `bytes=${existing.offset}-`;
      job.downloadedBytes = existing.offset;
    }

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }

    const contentLength = Number(res.headers.get("content-length")) || file.sizeBytes;
    job.totalBytes = contentLength;

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const chunks: Uint8Array[] = [];
    let downloaded = job.downloadedBytes;
    const startTime = Date.now();
    let lastReportTime = startTime;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      downloaded += value.length;

      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      const speed = elapsed > 0 ? downloaded / elapsed : 0;
      const remaining = contentLength - downloaded;
      const eta = speed > 0 ? remaining / speed : 0;
      const percent = Math.min(100, (downloaded / contentLength) * 100);

      job.downloadedBytes = downloaded;
      job.totalBytes = contentLength;
      job.progress = percent;
      job.speed = speed;
      job.eta = eta;

      // Throttle progress reports to every 200ms
      if (now - lastReportTime >= 200) {
        lastReportTime = now;
        onProgress?.({
          jobId,
          modelId,
          filename: file.filename,
          downloadedBytes: downloaded,
          totalBytes: contentLength,
          percent,
          speedBytesPerSec: speed,
          etaSeconds: eta,
          status: "downloading",
        });
      }
    }

    // Combine all chunks into a single blob
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob(chunks as any[], { type: "application/octet-stream" });

    // Store in IndexedDB for persistence
    await saveDownloadedFile(modelId, file.filename, blob);

    job.status = "completed";
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    job.localPath = `models/${modelId}/${file.filename}`;

    downloadControllers.delete(jobId);

    onProgress?.({
      jobId,
      modelId,
      filename: file.filename,
      downloadedBytes: downloaded,
      totalBytes: contentLength,
      percent: 100,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      status: "completed",
    });

    return job;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      job.status = "paused";
    } else {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    }
    downloadControllers.delete(jobId);
    return job;
  }
}

/** Pause an in-progress download */
export function pauseDownload(jobId: string): void {
  const controller = downloadControllers.get(jobId);
  if (controller) {
    controller.abort();
  }
  const job = downloadJobs.get(jobId);
  if (job) {
    job.status = "paused";
  }
}

/** Resume a paused download */
export async function resumeDownload(
  jobId: string,
  onProgress?: (progress: HFDownloadProgress) => void,
): Promise<HFDownloadJob | null> {
  const job = downloadJobs.get(jobId);
  if (!job || job.status !== "paused") return null;

  job.status = "downloading";
  return startDownload(job.modelId, job.file, onProgress);
}

/** Cancel a download */
export function cancelDownload(jobId: string): void {
  const controller = downloadControllers.get(jobId);
  if (controller) controller.abort();
  downloadJobs.delete(jobId);
  downloadControllers.delete(jobId);
}

/** Get all download jobs */
export function getDownloadJobs(): HFDownloadJob[] {
  return Array.from(downloadJobs.values());
}

/** Get a specific download job */
export function getDownloadJob(jobId: string): HFDownloadJob | undefined {
  return downloadJobs.get(jobId);
}

// ─── IndexedDB Persistence ──────────────────────────────────────────────────

const DB_NAME = "stitap_hf_downloads";
const DB_VERSION = 1;
const STORE_NAME = "models";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDownloadedFile(
  modelId: string,
  filename: string,
  blob: Blob,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const key = `${modelId}/${filename}`;
  tx.objectStore(STORE_NAME).put(blob, key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getDownloadedFile(
  modelId: string,
  filename: string,
): Promise<Blob | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const key = `${modelId}/${filename}`;
  const req = tx.objectStore(STORE_NAME).get(key);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      db.close();
      resolve(req.result ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

interface PartialDownload {
  offset: number;
}

async function getPartialDownload(
  modelId: string,
  filename: string,
): Promise<PartialDownload | null> {
  // For simplicity, always start fresh. Resume support would need
  // chunked storage.
  return null;
}

// ─── Downloaded Model Management ────────────────────────────────────────────

export interface DownloadedModel {
  modelId: string;
  filename: string;
  sizeBytes: number;
  downloadedAt: string;
  localPath: string;
}

/** List all downloaded models */
export async function listDownloadedModels(): Promise<DownloadedModel[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();

    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        db.close();
        const models: DownloadedModel[] = (req.result as IDBValidKey[])
          .filter((key): key is string => typeof key === "string" && key.includes("/"))
          .map((key: string) => {
            const slashIdx = key.indexOf("/");
            return {
              modelId: key.substring(0, slashIdx),
              filename: key.substring(slashIdx + 1),
              sizeBytes: 0, // Would need to check blob size
              downloadedAt: new Date().toISOString(),
              localPath: `models/${key}`,
            };
          });
        resolve(models);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

/** Delete a downloaded model file */
export async function deleteDownloadedModel(
  modelId: string,
  filename: string,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const key = `${modelId}/${filename}`;
  tx.objectStore(STORE_NAME).delete(key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ─── Popular Model Presets ──────────────────────────────────────────────────

export interface PopularModel {
  id: string;
  name: string;
  description: string;
  params: string;
  category: "general" | "code" | "math" | "multilingual" | "tiny" | "enterprise";
  minRAMGB: number;
  recommendedQuant: string;
  tags: string[];
}

export const POPULAR_MODELS: PopularModel[] = [
  // Tiny models (run on anything)
  {
    id: "smolLM/SmolLM2-135M-Instruct-GGUF",
    name: "SmolLM2 135M",
    description: "Ultra-tiny model. Runs on any hardware with 512 MB RAM.",
    params: "135M",
    category: "tiny",
    minRAMGB: 0.5,
    recommendedQuant: "Q4_0",
    tags: ["tiny", "fast", "edge"],
  },
  {
    id: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    name: "Qwen2.5 0.5B",
    description: "Small but capable. Great for edge devices and old servers.",
    params: "0.5B",
    category: "general",
    minRAMGB: 1,
    recommendedQuant: "Q4_K_M",
    tags: ["small", "edge", "multilingual"],
  },
  // Sweet spot models
  {
    id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    name: "Qwen2.5 1.5B",
    description: "Best balance of quality and resource usage. Perfect for RAG chatbots.",
    params: "1.5B",
    category: "general",
    minRAMGB: 2,
    recommendedQuant: "Q4_K_M",
    tags: ["balanced", "rag", "chat"],
  },
  {
    id: "Qwen/Qwen2.5-3B-Instruct-GGUF",
    name: "Qwen2.5 3B",
    description: "Good quality for moderate hardware. Handles complex conversations.",
    params: "3B",
    category: "general",
    minRAMGB: 4,
    recommendedQuant: "Q4_K_M",
    tags: ["balanced", "complex", "chat"],
  },
  // Code models
  {
    id: "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF",
    name: "Qwen2.5 Coder 3B",
    description: "Specialized for code generation and analysis.",
    params: "3B",
    category: "code",
    minRAMGB: 4,
    recommendedQuant: "Q4_K_M",
    tags: ["code", "programming"],
  },
  {
    id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
    name: "Qwen2.5 Coder 7B",
    description: "High-quality code generation. Needs 8+ GB RAM.",
    params: "7B",
    category: "code",
    minRAMGB: 8,
    recommendedQuant: "Q4_K_M",
    tags: ["code", "programming", "advanced"],
  },
  // Larger models
  {
    id: "Qwen/Qwen2.5-7B-Instruct-GGUF",
    name: "Qwen2.5 7B",
    description: "High quality general model. Requires 8+ GB RAM.",
    params: "7B",
    category: "general",
    minRAMGB: 8,
    recommendedQuant: "Q4_K_M",
    tags: ["high-quality", "chat"],
  },
  {
    id: "meta-llama/Llama-3.2-3B-Instruct-GGUF",
    name: "Llama 3.2 3B",
    description: "Meta's efficient model. Good instruction following.",
    params: "3B",
    category: "general",
    minRAMGB: 4,
    recommendedQuant: "Q4_K_M",
    tags: ["meta", "instruct"],
  },
  {
    id: "microsoft/Phi-3.5-mini-instruct-GGUF",
    name: "Phi-3.5 Mini",
    description: "Microsoft's efficient model. Strong reasoning for its size.",
    params: "3.8B",
    category: "general",
    minRAMGB: 4,
    recommendedQuant: "Q4_K_M",
    tags: ["microsoft", "reasoning"],
  },
  // Multilingual
  {
    id: "Qwen/Qwen2.5-7B-Instruct-GGUF",
    name: "Qwen2.5 7B Multilingual",
    description: "Excellent multilingual support including Asian languages.",
    params: "7B",
    category: "multilingual",
    minRAMGB: 8,
    recommendedQuant: "Q4_K_M",
    tags: ["multilingual", "asian"],
  },
];

// ─── Utility Functions ──────────────────────────────────────────────────────

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Format seconds to human-readable ETA */
export function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

/** Format speed to human-readable string */
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/** Get recommended quantization for available RAM and model size */
export function recommendQuant(
  availableRAMGB: number,
  modelParams: string,
): QuantLevel {
  const numParams = parseFloat(modelParams);
  if (isNaN(numParams)) return QUANT_LEVELS[3]; // Default to Q5_K_M

  // Calculate RAM needed for each quant level
  for (const q of QUANT_LEVELS) {
    const neededGB = (numParams * q.ramMultiplier * 2) * 1.2; // rough estimate
    if (neededGB <= availableRAMGB * 0.85) return q; // 85% utilization max
  }

  // Fall back to most aggressive quantization
  return QUANT_LEVELS[QUANT_LEVELS.length - 1];
}

/** Get models suitable for a given RAM amount */
export function getModelsForRAM(ramGB: number): PopularModel[] {
  return POPULAR_MODELS.filter((m) => m.minRAMGB <= ramGB);
}
