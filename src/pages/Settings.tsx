import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  CAPTURE_MODES,
  DEFAULT_POLICY,
  RETENTION_MAX_DAYS,
  summarizePolicy,
  type CapturePolicy,
} from "@/lib/capture/policy";
import {
  getHFToken,
  setHFToken,
  clearHFToken,
  hasHFToken,
  searchModels,
  startDownload,
  pauseDownload,
  getDownloadJobs,
  listDownloadedModels,
  deleteDownloadedModel,
  POPULAR_MODELS,
  QUANT_LEVELS,
  recommendQuant,
  formatBytes,
  formatETA,
  formatSpeed,
  type HFModel,
  type HFDownloadJob,
  type DownloadedModel,
  type HFGGUFFile,
} from "@/lib/huggingface";
import { cn } from "@/lib/utils";

/**
 * Phase 7 — enterprise capture policy, audit trail and retention controls.
 *
 * Policy is per-user with a single-org bootstrap: the first user to edit
 * policy becomes admin (see `src/convex/policy.ts`). Everything here is
 * enforced server-side in `captureUrl.ts` and the retention job; this page
 * is the administration surface.
 */

interface AuditRow {
  _id: string;
  _creationTime: number;
  action: string;
  detail: string;
}

const inputCls =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[12.5px] text-zinc-900 outline-none transition-colors focus:border-zinc-900";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-zinc-200 px-6 py-5 first:border-t-0">
      <p className="text-[13px] font-semibold text-zinc-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-2xl text-[12px] leading-5 text-zinc-500">{description}</p>
      )}
      <div className="mt-3">{children}</div>
    </div>
  );
}

// ─── HuggingFace Section ────────────────────────────────────────────────────

function HuggingFaceSection({ canEdit }: { canEdit: boolean }) {
  const [token, setTokenState] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(hasHFToken());
  const [username, setUsername] = useState(() => getHFToken()?.username ?? "");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HFModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedQuant, setSelectedQuant] = useState<string | null>(null);
  const [maxRAMGB, setMaxRAMGB] = useState(16);

  // Download state
  const [activeDownloads, setActiveDownloads] = useState<HFDownloadJob[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
  const [showDownloads, setShowDownloads] = useState(false);

  // Model detail state
  const [selectedModel, setSelectedModel] = useState<HFModel | null>(null);
  const [selectedFile, setSelectedFile] = useState<HFGGUFFile | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load token on mount
  useEffect(() => {
    const existing = getHFToken();
    if (existing) {
      setIsAuthenticated(true);
      setUsername(existing.username ?? "");
    }
  }, []);

  // Poll downloads every 500ms
  useEffect(() => {
    if (!showDownloads) return;
    pollRef.current = setInterval(() => {
      setActiveDownloads(getDownloadJobs());
    }, 500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [showDownloads]);

  // Load downloaded models
  useEffect(() => {
    void listDownloadedModels().then(setDownloadedModels);
  }, [downloadedModels.length]);

  const handleTokenSave = useCallback(() => {
    if (!token.trim()) {
      toast.error("Please enter a token");
      return;
    }
    setHFToken(token.trim());
    setIsAuthenticated(true);
    toast.success("HuggingFace token saved");
    setTokenState("");
  }, [token]);

  const handleTokenRemove = useCallback(() => {
    clearHFToken();
    setIsAuthenticated(false);
    setUsername("");
    toast.success("HuggingFace token removed");
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const result = await searchModels({
        query: searchQuery.trim(),
        ggufOnly: true,
        maxRAMGB,
        sort: "downloads",
        direction: -1,
        limit: 20,
      });
      setSearchResults(result.models);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, maxRAMGB]);

  const handleDownload = useCallback(
    async (model: HFModel, file: HFGGUFFile) => {
      const job = await startDownload(model.modelId, file, (progress) => {
        setActiveDownloads(getDownloadJobs());
        if (progress.status === "completed") {
          toast.success(`Downloaded ${file.filename}`);
          void listDownloadedModels().then(setDownloadedModels);
        }
      });
      setActiveDownloads(getDownloadJobs());
      if (job.status === "error") {
        toast.error(job.error ?? "Download failed");
      }
    },
    [],
  );

  const handleDelete = useCallback(async (modelId: string, filename: string) => {
    try {
      await deleteDownloadedModel(modelId, filename);
      void listDownloadedModels().then(setDownloadedModels);
      toast.success("Model deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }, []);

  return (
    <Section
      title="HuggingFace Integration"
      description="Connect your HuggingFace account to search, download, and manage AI models for local inference."
    >
      {/* ── Auth ── */}
      <div className="space-y-4">
        {!isAuthenticated ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
              <p className="font-medium">Authentication required</p>
              <p className="mt-1">
                Enter your HuggingFace token to search and download models.
                Get one at{' '}
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-900"
                >
                  huggingface.co/settings/tokens
                </a>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setTokenState(e.target.value)}
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className={cn(inputCls, "pr-20 font-mono text-[12px]")}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 hover:text-zinc-600"
                >
                  {showToken ? "Hide" : "Show"}
                </button>
              </div>
              <button
                onClick={handleTokenSave}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-700"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div>
              <p className="text-[12px] font-medium text-emerald-800">
                ✓ Connected{username ? ` as ${username}` : ""}
              </p>
              <p className="text-[11px] text-emerald-600">
                Token saved locally. Searches go directly to huggingface.co.
              </p>
            </div>
            <button
              onClick={handleTokenRemove}
              className="rounded-md border border-emerald-300 px-2.5 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* ── Search ── */}
        <div className="border-t border-zinc-200 pt-4">
          <p className="mb-2 text-[12px] font-medium text-zinc-700">Search Models</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
              placeholder="e.g., qwen2.5, llama, phi-3, deepseek..."
              className={cn(inputCls, "flex-1 font-mono text-[12px]")}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">Max RAM:</span>
              <select
                value={maxRAMGB}
                onChange={(e) => setMaxRAMGB(Number(e.target.value))}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[12px]"
              >
                <option value={2}>2 GB</option>
                <option value={4}>4 GB</option>
                <option value={8}>8 GB</option>
                <option value={16}>16 GB</option>
                <option value={32}>32 GB</option>
                <option value={64}>64 GB</option>
              </select>
            </div>
            <button
              onClick={() => void handleSearch()}
              disabled={isSearching || !searchQuery.trim()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {isSearching ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {/* ── Popular Models ── */}
        <div className="border-t border-zinc-200 pt-4">
          <p className="mb-2 text-[12px] font-medium text-zinc-700">Popular Models</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {POPULAR_MODELS.filter((m) => m.minRAMGB <= maxRAMGB).slice(0, 8).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSearchQuery(m.id);
                  void (async () => {
                    setIsSearching(true);
                    try {
                      const result = await searchModels({
                        query: m.id,
                        ggufOnly: true,
                        limit: 10,
                      });
                      setSearchResults(result.models);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Search failed");
                    } finally {
                      setIsSearching(false);
                    }
                  })();
                }}
                className="rounded-md border border-zinc-200 p-2.5 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-zinc-800">{m.name}</p>
                    <p className="text-[11px] text-zinc-500">{m.params} · {m.minRAMGB} GB min</p>
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      m.category === "tiny"
                        ? "bg-blue-100 text-blue-700"
                        : m.category === "code"
                          ? "bg-purple-100 text-purple-700"
                          : m.category === "enterprise"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {m.category}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-zinc-400 line-clamp-2">{m.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Search Results ── */}
        {searchResults.length > 0 && (
          <div className="border-t border-zinc-200 pt-4">
            <p className="mb-2 text-[12px] font-medium text-zinc-700">
              Search Results ({searchResults.length})
            </p>
            <div className="space-y-2">
              {searchResults.map((model) => (
                <div
                  key={model.modelId}
                  className="rounded-md border border-zinc-200 p-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-[12px] font-medium text-zinc-800">{model.modelId}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                        <span>↓ {model.downloads.toLocaleString()}</span>
                        <span>♥ {model.likes.toLocaleString()}</span>
                        {model.params && <span>{model.params}</span>}
                        {model.estimatedRAMGB && <span>~{model.estimatedRAMGB} GB RAM</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedModel(selectedModel?.modelId === model.modelId ? null : model)}
                      className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:border-zinc-400"
                    >
                      {selectedModel?.modelId === model.modelId ? "Close" : "Details"}
                    </button>
                  </div>

                  {/* GGUF Files */}
                  {selectedModel?.modelId === model.modelId && model.ggufFiles.length > 0 && (
                    <div className="mt-3 border-t border-zinc-100 pt-3">
                      <p className="mb-1.5 text-[11px] font-medium text-zinc-600">Available Downloads</p>
                      <div className="space-y-1">
                        {model.ggufFiles.map((file) => (
                          <div
                            key={file.filename}
                            className="flex items-center justify-between rounded border border-zinc-100 bg-zinc-50/60 px-2 py-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10.5px] text-zinc-700">{file.quant}</span>
                              <span className="text-[10px] text-zinc-400">{file.sizeHuman}</span>
                              {file.quant === (selectedModel?.params ? recommendQuant(maxRAMGB, selectedModel.params).id : "Q4_K_M") && (
                                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-medium text-emerald-700">
                                  Recommended
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => void handleDownload(model, file)}
                              className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-zinc-700"
                            >
                              Download
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Active Downloads ── */}
        {activeDownloads.filter((d) => d.status === "downloading" || d.status === "paused").length > 0 && (
          <div className="border-t border-zinc-200 pt-4">
            <p className="mb-2 text-[12px] font-medium text-zinc-700">Active Downloads</p>
            <div className="space-y-2">
              {activeDownloads
                .filter((d) => d.status === "downloading" || d.status === "paused")
                .map((job) => (
                  <div key={job.id} className="rounded-md border border-zinc-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-medium text-zinc-700">
                          {job.file.filename}
                        </p>
                        <p className="text-[10px] text-zinc-500">{job.modelId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.status === "downloading" ? (
                          <button
                            onClick={() => pauseDownload(job.id)}
                            className="rounded border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600 hover:border-zinc-400"
                          >
                            Pause
                          </button>
                        ) : (
                          <span className="text-[10px] text-amber-600">Paused</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>{formatBytes(job.downloadedBytes)} / {formatBytes(job.totalBytes)}</span>
                        <span>{formatSpeed(job.speed)} · ETA {formatETA(job.eta)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full bg-zinc-900 transition-all"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── Downloaded Models ── */}
        <div className="border-t border-zinc-200 pt-4">
          <button
            onClick={() => setShowDownloads(!showDownloads)}
            className="flex items-center gap-2 text-[12px] font-medium text-zinc-700 hover:text-zinc-900"
          >
            <span>Downloaded Models ({downloadedModels.length})</span>
            <span className="text-[10px] text-zinc-400">{showDownloads ? "▲" : "▼"}</span>
          </button>
          {showDownloads && downloadedModels.length > 0 && (
            <div className="mt-2 space-y-1">
              {downloadedModels.map((m) => (
                <div
                  key={`${m.modelId}/${m.filename}`}
                  className="flex items-center justify-between rounded border border-zinc-100 bg-zinc-50/60 px-2 py-1.5"
                >
                  <div>
                    <p className="font-mono text-[10.5px] text-zinc-700">{m.filename}</p>
                    <p className="text-[10px] text-zinc-400">{m.modelId}</p>
                  </div>
                  <button
                    onClick={() => void handleDelete(m.modelId, m.filename)}
                    className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
          {showDownloads && downloadedModels.length === 0 && (
            <p className="mt-2 text-[11px] text-zinc-400">No models downloaded yet.</p>
          )}
        </div>

        {/* ── Quantization Reference ── */}
        <div className="border-t border-zinc-200 pt-4">
          <p className="mb-2 text-[12px] font-medium text-zinc-700">Quantization Guide</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {QUANT_LEVELS.slice(0, 8).map((q) => (
              <div
                key={q.id}
                className={cn(
                  "rounded border p-2 text-[10px]",
                  selectedQuant === q.id
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-zinc-50/60 text-zinc-600",
                )}
                onClick={() => setSelectedQuant(selectedQuant === q.id ? null : q.id)}
              >
                <p className="font-mono font-medium">{q.id}</p>
                <p className="mt-0.5 text-[9px] opacity-75">{q.bitsPerWeight} bits</p>
              </div>
            ))}
          </div>
          {selectedQuant && (
            <p className="mt-2 text-[11px] text-zinc-500">
              {QUANT_LEVELS.find((q) => q.id === selectedQuant)?.description}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const policy = useQuery(api.policy.getMyPolicy);
  const admin = useQuery(api.policy.isAdmin);
  const audit = useQuery(api.policy.listMyAudit, { limit: 100 });
  const updateMyPolicy = useMutation(api.policy.updateMyPolicy);
  const recordAudit = useMutation(api.policy.recordAudit);
  const runRetentionNow = useMutation(api.policy.runRetentionNow);

  const [form, setForm] = useState<CapturePolicy>(DEFAULT_POLICY);
  const [saving, setSaving] = useState(false);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [retentionResult, setRetentionResult] = useState<string | null>(null);

  // Load the saved policy into the form once.
  useEffect(() => {
    if (policy) {
      setForm({
        allowlist: policy.allowlist,
        denylist: policy.denylist,
        allowRemoteCapture: policy.allowRemoteCapture,
        retentionDays: policy.retentionDays,
        allowedModes: policy.allowedModes,
      });
    }
  }, [policy]);

  const canEdit = admin === true;

  const allowlistText = form.allowlist.join("\n");
  const denylistText = form.denylist.join("\n");

  const parseDomains = (text: string): string[] =>
    text
      .split(/[\n,]/)
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateMyPolicy({
        allowlist: parseDomains(allowlistText),
        denylist: parseDomains(denylistText),
        allowRemoteCapture: form.allowRemoteCapture,
        retentionDays: form.retentionDays,
        allowedModes: form.allowedModes,
      });
      await recordAudit({
        action: "policy.view",
        detail: `Saved capture policy (${res.role === "admin" ? "admin" : "member"}).`,
      });
      toast.success(
        res.role === "admin"
          ? "Policy saved — you are now an administrator."
          : "Policy saved",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the policy");
    } finally {
      setSaving(false);
    }
  };

  const handleRunRetention = async () => {
    setRetentionBusy(true);
    setRetentionResult(null);
    try {
      const r = await runRetentionNow();
      setRetentionResult(
        `Pruned ${r.deletedCaptures} capture(s) and ${r.prunedAudit} audit record(s). ` +
          `Audit log capped at ${r.auditCapDays}d, retention capped at ${r.retentionCapDays}d.`,
      );
      toast.success("Retention job finished");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retention job failed");
    } finally {
      setRetentionBusy(false);
    }
  };

  const currentSummary = useMemo(
    () => (policy && !policy.isDefault ? summarizePolicy(policy) : ""),
    [policy],
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-[13px] font-semibold tracking-tight"
          >
            <span className="grid size-6 place-items-center rounded border border-zinc-900 bg-zinc-900 text-[10px] font-bold text-white">
              V
            </span>
            stitaP
          </button>
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Settings
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => void handleSave()}
              disabled={saving || !policy}
              className="rounded-md bg-zinc-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save policy"}
            </button>
          )}
          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-md border border-zinc-200 px-3.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-900"
          >
            Back to studio
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <Section
            title="Capture policy"
            description="Applied to every URL capture after the SSRF guard. In-app demo captures and current-tab extension captures are unaffected."
          >
            {!policy ? (
              <p className="font-mono text-[12px] text-zinc-400">Loading policy…</p>
            ) : !canEdit ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] leading-5 text-amber-800">
                You're a member — only administrators can change the capture
                policy. The effective policy below is still shown for reference.
              </div>
            ) : policy.isDefault ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[12px] leading-5 text-zinc-600">
                No policy saved yet — the defaults apply. Saving any change
                bootstraps you as the first administrator (single-org setup).
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 font-mono text-[11px] leading-5 text-emerald-800">
                {currentSummary}
              </div>
            )}
          </Section>

          <Section
            title="Remote URL capture"
            description="Offline mode disables remote URL capture entirely — only in-app demo and current-tab captures remain."
          >
            <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-zinc-700">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.allowRemoteCapture}
                onChange={(e) =>
                  setForm((f) => ({ ...f, allowRemoteCapture: e.target.checked }))
                }
                className="size-3.5 accent-zinc-900"
              />
              Allow remote URL capture
            </label>
          </Section>

          <Section
            title="Domain allowlist"
            description="Empty = any public domain is allowed (SSRF rules still apply). A non-empty list restricts URL capture to these domains and their subdomains. One per line; *.example.com matches subdomains only."
          >
            <textarea
              value={allowlistText}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, allowlist: parseDomains(e.target.value) }))}
              rows={4}
              placeholder={"example.com\n*.docs.example.com"}
              className={cn(inputCls, "font-mono text-[12px]")}
            />
          </Section>

          <Section
            title="Domain denylist"
            description="Never captured, even when the allowlist is empty. This is a hard block on top of the SSRF guard."
          >
            <textarea
              value={denylistText}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, denylist: parseDomains(e.target.value) }))}
              rows={3}
              placeholder={"payments.internal\n*.staging.example.com"}
              className={cn(inputCls, "font-mono text-[12px]")}
            />
          </Section>

          <Section
            title="Allowed capture modes"
            description="Empty = all modes. Restrict to the modes your reviewers actually need."
          >
            <div className="flex flex-wrap gap-2">
              {CAPTURE_MODES.map((m) => {
                const active = form.allowedModes.includes(m);
                return (
                  <button
                    key={m}
                    disabled={!canEdit}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        allowedModes: active
                          ? f.allowedModes.filter((x) => x !== m)
                          : [...f.allowedModes, m],
                      }))
                    }
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50",
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-400",
                    )}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            title="Retention"
            description={`Library captures are pruned after this many days (0 = keep forever, max ${RETENTION_MAX_DAYS}). Audit records are capped at least 30 days regardless.`}
          >
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={RETENTION_MAX_DAYS}
                disabled={!canEdit}
                value={form.retentionDays}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    retentionDays: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className={cn(inputCls, "w-32")}
              />
              <span className="text-[12px] text-zinc-500">days</span>
            </div>
            {canEdit && (
              <button
                onClick={() => void handleRunRetention()}
                disabled={retentionBusy}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-900 disabled:opacity-40"
              >
                {retentionBusy ? "Running…" : "Run retention now"}
              </button>
            )}
            {retentionResult && (
              <p className="mt-2 font-mono text-[11px] leading-5 text-zinc-500">
                {retentionResult}
              </p>
            )}
            <p className="mt-2 text-[11px] leading-4 text-zinc-400">
              Retention also runs automatically every hour via the scheduled
              job (Convex cron, see <code>src/convex/crons.ts</code>).
            </p>
          </Section>

          <HuggingFaceSection canEdit={canEdit} />
        </div>

        <aside className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <Section title="Audit log" description="Recent security-relevant activity (newest first).">
            {audit === undefined ? (
              <p className="font-mono text-[12px] text-zinc-400">Loading…</p>
            ) : audit.length === 0 ? (
              <p className="text-[12px] leading-5 text-zinc-400">
                No audit records yet. Policy changes, URL captures, saves,
                deletes and retention runs are recorded here.
              </p>
            ) : (
              <ul className="max-h-[560px] space-y-2.5 overflow-y-auto pr-1">
                {audit.map((a: AuditRow) => (
                  <li key={a._id} className="rounded-md border border-zinc-100 bg-zinc-50/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] font-medium text-zinc-700">
                        {a.action}
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-zinc-400">
                        {new Date(a._creationTime).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-[11px] leading-4 text-zinc-500">
                      {a.detail}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </main>
    </div>
  );
}
