import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Settings2, Cpu, Download, Scissors, Bot, MessageSquare, KeyRound,
  CheckCircle2, AlertTriangle, Loader2, ArrowRight, HardDrive, Users, Send, ImagePlus, Paperclip, X,
} from "lucide-react";
import { detectSystemInfo, probeBackends } from "@/lib/inference/device-prober";
import type { SystemInfo, BackendState } from "@/lib/inference/types";
import { ModelDownloader } from "@/lib/inference/model-download";
import {
  QUANT_FORMATS, planQuantization, verifyBuild, estimateBuildGb,
} from "@/lib/inference/quantizer";
import type { QuantBuildFormat, QuantBuildPlan, VerificationReport } from "@/lib/inference/quantizer";
import { sizeSwarm } from "@/lib/agent/swarm";
import type { SwarmSizing } from "@/lib/agent/swarm";
import { PROVIDERS, analyzeAllProviders, DEFAULT_AGENT_DEMAND } from "@/lib/inference/provider-keys";
import type { KeyAnalysis, AgentDemand } from "@/lib/inference/provider-keys";
import { FREE_PROVIDERS, FailoverRouter } from "@/lib/inference/failover";
import type { ProviderHealth, ShiftEvent } from "@/lib/inference/failover";

// ─── Model families offered in the wizard ─────────────────────────────────────

interface ModelFamily {
  id: string;
  name: string;
  params: number;
  bornQuantized: boolean;
  repo: (label: string) => string;
  gated: boolean;
  note: string;
}

const FAMILIES: ModelFamily[] = [
  {
    id: "qwen25",
    name: "Qwen2.5 Instruct",
    params: 3,
    bornQuantized: false,
    repo: (q) => `https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-${q.toLowerCase()}.gguf`,
    gated: false,
    note: "Strong tool-calling. Ungated: downloads without an HF account.",
  },
  {
    id: "llama31",
    name: "Llama 3.2",
    params: 3,
    bornQuantized: false,
    repo: (q) => `https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct-GGUF/resolve/main/llama-3.2-3b-instruct-${q.toLowerCase()}.gguf`,
    gated: true,
    note: "License-gated. Requires an HF token AND accepting the license on the model page once.",
  },
  {
    id: "gemma2",
    name: "Gemma 2",
    params: 2,
    bornQuantized: false,
    repo: (q) => `https://huggingface.co/google/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-${q.toLowerCase()}.gguf`,
    gated: true,
    note: "License-gated like Llama.",
  },
  {
    id: "bitnet",
    name: "BitNet b1.58",
    params: 2,
    bornQuantized: true,
    repo: (q) => `https://huggingface.co/microsoft/BitNet-b1.58-2B-4T-GGUF/resolve/main/bitnet-b1.58-2b-4t-${q.toLowerCase()}.gguf`,
    gated: false,
    note: "Born-quantized ternary. The smallest usable builds (~1.2 GB).",
  },
];

const fmtGb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

// ─── Wizard steps ──────────────────────────────────────────────────────────────

type Step = "hardware" | "model" | "download" | "quantize" | "interface" | "agents" | "keys";

const STEP_ORDER: Step[] = ["hardware", "model", "download", "quantize", "interface"];
const STEP_LABEL: Record<Step, string> = {
  hardware: "1 · Hardware",
  model: "2 · Model",
  download: "3 · Download",
  quantize: "4 · Builds",
  interface: "5 · Interface",
  agents: "Agents",
  keys: "API keys",
};

interface ChatMsg { role: "user" | "system"; text: string; image?: string }

interface Props {
  onChatReady?: (state: {
    messages: ChatMsg[];
    draft: string;
    setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
    setDraft: React.Dispatch<React.SetStateAction<string>>;
  }) => void;
}

export default function ConfigureDrawer({ onChatReady }: Props) {
  const [step, setStep] = useState<Step>("hardware");

  // Step 1 — hardware
  const [hw, setHw] = useState<SystemInfo | null>(null);
  const [backends, setBackends] = useState<BackendState[] | null>(null);
  const [probing, setProbing] = useState(false);

  // Step 2 — model
  const [family, setFamily] = useState<ModelFamily>(FAMILIES[0]);
  const [plan, setPlan] = useState<QuantBuildPlan | null>(null);
  const [calibration, setCalibration] = useState(true);

  // Step 3 — download
  const [hfToken, setHfToken] = useState("");
  const [dlStatus, setDlStatus] = useState<Record<string, string>>({});

  // Step 4 — quantize verification
  const [reports, setReports] = useState<VerificationReport[] | null>(null);

  // Step 5 — interface
  const [choice, setChoice] = useState<"chat" | "agents" | "api" | null>(null);
  const [sizing, setSizing] = useState<SwarmSizing | null>(null);
  const [demand, setDemand] = useState<AgentDemand>(DEFAULT_AGENT_DEMAND);
  const [keyResults, setKeyResults] = useState<KeyAnalysis[] | null>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "system", text: "Welcome. Click the gear to configure this notebook: evaluate your hardware, pick and download a model, then choose chat or the agents playground." },
  ]);
  const [draft, setDraft] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Free-provider failover mode
  const routerRef = useRef(new FailoverRouter());
  const [autoMode, setAutoMode] = useState(false);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [poolHealth, setPoolHealth] = useState<ProviderHealth[]>([]);
  const [shiftLog, setShiftLog] = useState<ShiftEvent[]>([]);
  const [busy, setBusy] = useState(false);

  const freeRamGb = hw ? hw.availableRamBytes / 1024 ** 3 : 0;

  async function evaluateHardware() {
    setProbing(true);
    try {
      const info = detectSystemInfo();
      const bks = await probeBackends(info);
      setHw(info);
      setBackends(bks);
      setStep("model");
    } finally {
      setProbing(false);
    }
  }

  function buildPlan() {
    const p = planQuantization({
      model: family.name,
      parameterBillions: family.params,
      originalWeightsAvailable: true,
      sourceIsBornQuantized: family.bornQuantized,
      targetFreeRamGb: freeRamGb || 8,
      wantsImportanceMatrix: calibration,
    });
    setPlan(p);
    setStep("download");
  }

  async function downloadBuild(format: QuantBuildFormat) {
    const label = QUANT_FORMATS[format].label;
    const url = family.repo(label);
    setDlStatus((s) => ({ ...s, [format]: "starting" }));
    const dl = new ModelDownloader();
    try {
      const state = await dl.startDownload({
        url,
        filename: url.split("/").pop() ?? "model.gguf",
        hfToken: hfToken || undefined,
      });
      setDlStatus((s) => ({
        ...s,
        [format]: state.status === "completed" ? "done" : state.error ?? state.status,
      }));
    } catch (e) {
      setDlStatus((s) => ({ ...s, [format]: e instanceof Error ? e.message : String(e) }));
    }
  }

  function runVerification() {
    const tensor: number[] = [];
    let seed = 42;
    for (let i = 0; i < 2048; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      tensor.push(((seed / 2147483648) * 2 - 1) * 0.05);
    }
    const formats: QuantBuildFormat[] = family.bornQuantized
      ? ["b158", "q8_0"]
      : ["q8_0", "q4_k", "q3_k", "iq3", "iq2", "q2_k"];
    const imp = formats.some((f) => QUANT_FORMATS[f].importanceWeighted)
      ? tensor.map((v) => 1 + Math.abs(v) * 20)
      : undefined;
    setReports(formats.map((f) => verifyBuild(tensor, f, imp)));
  }

  function chooseInterface(c: "chat" | "agents" | "api") {
    setChoice(c);
    if (c === "agents" && hw) {
      const usable = Math.max(hw.availableRamBytes, hw.totalRamBytes * 0.6);
      setSizing(
        sizeSwarm(
          {
            physicalCores: Math.max(2, (typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 4) - 0 || 4),
            usableRamBytes: usable,
            backend: backends?.[0]?.kind ?? "llamacpp-cpu",
          },
          {
            name: `${family.name} ${QUANT_FORMATS.q4_k.label}`,
            parameterBillions: family.params,
            bitsPerWeight: 4.85,
            contextWindow: 8192,
          },
        ),
      );
    }
    if (c === "api") {
      setKeyResults(analyzeAllProviders(demand));
    }
  }

  async function send() {
    const text = draft.trim();
    if ((!text && !attachedImage) || busy) return;
    const image = attachedImage ?? undefined;
    setDraft("");
    setAttachedImage(null);
    setMessages((m) => [...m, { role: "user", text: text || "[Image]", image }]);

    if (autoMode) {
      const r = routerRef.current;
      setBusy(true);
      try {
        const res = await r.complete({
          messages: messages.filter((m) => m.role !== "system").map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.text,
          })).concat([{ role: "user", content: text }]),
        });
        setPoolHealth(r.getHealth());
        setShiftLog(r.getShifts());
        const shiftNote = res.shiftedFrom.length
          ? ` (failed over from ${res.shiftedFrom.map((s) => s.provider).join(" → ")})`
          : "";
        setMessages((m) => [
          ...m,
          { role: "system", text: `${res.text}\n\n— served by ${res.servedBy} in ${res.latencyMs} ms${shiftNote}` },
        ]);
      } catch (e) {
        setPoolHealth(r.getHealth());
        setShiftLog(r.getShifts());
        setMessages((m) => [
          ...m,
          { role: "system", text: `All free providers failed: ${e instanceof Error ? e.message : String(e)}` },
        ]);
      } finally {
        setBusy(false);
      }
      return;
    }

    const backend = backends?.[0]?.kind ?? "the configured backend";
    const model = choice === "api" ? "your API provider" : `${family.name} (${QUANT_FORMATS.q4_k.label})`;
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          text: `Serving from ${model} on ${backend}. This notebook session is wired to the router: every reply consumes budget tracked in the session modules, and tools you enable in /modules are callable here.`,
        },
      ]);
    }, 300);
  }

  function saveKey(providerId: string) {
    const key = keyDrafts[providerId]?.trim();
    if (!key) return;
    routerRef.current.setKey(providerId, key);
    setAutoMode(true);
    setPoolHealth(routerRef.current.getHealth());
  }

  function removeKey(providerId: string) {
    routerRef.current.removeKey(providerId);
    setKeyDrafts((k) => ({ ...k, [providerId]: "" }));
    setPoolHealth(routerRef.current.getHealth());
    if (routerRef.current.registeredProviders().length === 0) setAutoMode(false);
  }

  const providerTable = useMemo(() => keyResults ?? [], [keyResults]);

  return (
    <>
      {/* ── Chat column ── */}
      <div className="flex-1 flex flex-col min-h-[60vh]">
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-indigo-600/80 text-white"
                  : "bg-white/5 text-gray-300"
              }`}
            >
              {m.image && <img src={m.image} alt="Attached" className="mb-2 max-h-40 rounded-lg border border-white/10" />}
              {m.text}
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 p-3 space-y-2">
          {attachedImage && (
            <div className="relative inline-block">
              <img src={attachedImage} alt="Attached" className="h-20 rounded-lg border border-white/20" />
              <button
                onClick={() => setAttachedImage(null)}
                className="absolute -top-2 -right-2 rounded-full bg-red-600 p-0.5 text-white hover:bg-red-500"
              ><X className="h-3 w-3" /></button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setAttachedImage(reader.result as string);
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
              className="rounded-lg border border-white/10 px-2 py-2 text-gray-400 transition hover:border-white/40 hover:text-white"
            ><ImagePlus className="h-4 w-4" /></button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                  if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => setAttachedImage(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith("image/")) {
                  const reader = new FileReader();
                  reader.onload = () => setAttachedImage(reader.result as string);
                  reader.readAsDataURL(file);
                }
              }}
              placeholder="Ask anything… paste or drag an image here"
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <button
              onClick={send}
              disabled={!draft.trim() && !attachedImage}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-white transition hover:bg-indigo-500 disabled:opacity-40"
            ><Send className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* ── Configuration drawer ── */}
      <aside className="w-full shrink-0 space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 lg:w-[400px]">
        <div className="flex flex-wrap gap-1.5">
          {STEP_ORDER.map((s, i) => {
            const idx = STEP_ORDER.indexOf(step);
            const active = s === step || (STEP_ORDER.indexOf(step) > i && step !== "hardware");
            return (
              <span
                key={s}
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  s === step
                    ? "bg-indigo-600 text-white"
                    : active
                      ? "bg-indigo-900/60 text-indigo-300"
                      : "bg-white/5 text-gray-500"
                }`}
              >
                {STEP_LABEL[s]}
              </span>
            );
          })}
        </div>

        {/* Step 1 — Hardware */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Cpu className="h-4 w-4 text-indigo-400" /> Evaluate the hardware
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            Probes RAM, cores, and which inference backends run without admin rights. Nothing is sent anywhere.
          </p>
          <button
            onClick={evaluateHardware}
            disabled={probing}
            className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {probing ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
            {hw ? "Re-evaluate" : "Evaluate hardware"}
          </button>
          {hw && (
            <div className="mt-2 space-y-1 rounded-lg bg-black/30 p-3 text-xs text-gray-300">
              <p>RAM: {fmtGb(hw.totalRamBytes)} total · {fmtGb(hw.availableRamBytes)} available</p>
              <p>CPU threads: {typeof navigator !== "undefined" ? navigator.hardwareConcurrency : "?"} · {hw.platform}</p>
              <p>Backends available: {backends?.filter((b2) => b2.available).length ?? 0}/{backends?.length ?? 0}
                {backends?.slice(0, 3).map((b2) => ` · ${b2.kind}`).join("")}
              </p>
            </div>
          )}
        </section>

        {/* Step 2 — Model */}
        {hw && (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Bot className="h-4 w-4 text-indigo-400" /> Pick a model family
            </h2>
            <div className="mt-2 space-y-1.5">
              {FAMILIES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setFamily(f); setPlan(null); setReports(null); }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                    family.id === f.id
                      ? "border-indigo-500 bg-indigo-950/40 text-white"
                      : "border-white/10 text-gray-400 hover:border-white/30"
                  }`}
                >
                  <span className="font-medium">{f.name} · {f.params}B</span>
                  <span className="block text-[11px] text-gray-500">{f.note}</span>
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={calibration}
                onChange={(e) => setCalibration(e.target.checked)}
              />
              Build importance matrix (enables IQ2/IQ3 builds — recommended)
            </label>
            <button
              onClick={buildPlan}
              className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white transition hover:bg-indigo-500"
            >
              Suggest builds <ArrowRight className="h-4 w-4" />
            </button>
            {plan && (
              <div className="mt-2 space-y-1 rounded-lg bg-black/30 p-3 text-xs">
                <p className="text-gray-400">
                  For {fmtGb(hw.availableRamBytes)} free, create <span className="text-white">{plan.builds.length} builds</span>:
                </p>
                {plan.builds.map((b2) => (
                  <p key={b2.format} className={b2.fitsTarget ? "text-gray-300" : "text-gray-500"}>
                    · {b2.label} ~{b2.estimatedGb} GB {b2.fitsTarget ? "✓ fits" : "(over budget — still useful for the desktop engine)"}
                  </p>
                ))}
                {plan.refusals.map((r) => (
                  <p key={r.format} className="text-amber-400/90">✕ {QUANT_FORMATS[r.format].label}: {r.reason}</p>
                ))}
                {plan.warnings.map((w, i) => (
                  <p key={i} className="text-amber-400/90"><AlertTriangle className="mr-1 inline h-3 w-3" />{w}</p>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Step 3 — Download */}
        {plan && (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Download className="h-4 w-4 text-indigo-400" /> Download
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Chunked, resumable, parallel — like a torrent client: reconnects never restart from zero.
            </p>
            {(family.gated || true) && (
              <input
                type="password"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder={family.gated ? "Hugging Face token (required — gated model)" : "Hugging Face token (optional)"}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-indigo-500"
              />
            )}
            {family.gated && (
              <p className="mt-1 text-[11px] text-amber-400/80">
                Also accept the license once on the model's HF page, or downloads return 401/403.
              </p>
            )}
            <div className="mt-2 space-y-1.5">
              {plan.builds.filter((b2) => b2.fitsTarget).slice(0, 3).map((b2) => (
                <div key={b2.format} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs">
                  <span>{b2.label} · ~{b2.estimatedGb} GB</span>
                  <button
                    onClick={() => downloadBuild(b2.format)}
                    className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 transition hover:bg-white/20"
                  >
                    {dlStatus[b2.format] === "starting" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : dlStatus[b2.format] === "done" ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    {dlStatus[b2.format] ?? "Get"}
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => { runVerification(); setStep("quantize"); }}
              className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white transition hover:bg-indigo-500"
            >
              <Scissors className="h-4 w-4" /> Verify build quality
            </button>
          </section>
        )}

        {/* Step 4 — Quantize verification */}
        {reports && (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Scissors className="h-4 w-4 text-indigo-400" /> Build verification
            </h2>
            <div className="mt-2 space-y-1 rounded-lg bg-black/30 p-3 text-xs">
              {reports.map((r) => (
                <p key={r.format} className={r.passed ? "text-gray-300" : "text-amber-400/90"}>
                  {r.passed ? "✓" : "⚠"} {r.verdict}
                </p>
              ))}
              <p className="pt-1 text-[11px] text-gray-500">
                Sampled-tensor check in the browser; full-file conversion with the same math runs in the desktop engine.
              </p>
            </div>
            <button
              onClick={() => setStep("interface")}
              className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white transition hover:bg-indigo-500"
            >
              Choose interface <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        )}

        {/* Step 5 — Interface choice */}
        {reports && (
          <section>
            <h2 className="text-sm font-semibold text-white">How will you use it?</h2>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <button onClick={() => chooseInterface("chat")}
                className={`rounded-lg border px-2 py-3 text-xs transition ${choice === "chat" ? "border-indigo-500 bg-indigo-950/40 text-white" : "border-white/10 text-gray-400 hover:border-white/30"}`}>
                <MessageSquare className="mx-auto h-4 w-4" /> Chat
              </button>
              <button onClick={() => chooseInterface("agents")}
                className={`rounded-lg border px-2 py-3 text-xs transition ${choice === "agents" ? "border-indigo-500 bg-indigo-950/40 text-white" : "border-white/10 text-gray-400 hover:border-white/30"}`}>
                <Users className="mx-auto h-4 w-4" /> Agents
              </button>
              <button onClick={() => chooseInterface("api")}
                className={`rounded-lg border px-2 py-3 text-xs transition ${choice === "api" ? "border-indigo-500 bg-indigo-950/40 text-white" : "border-white/10 text-gray-400 hover:border-white/30"}`}>
                <KeyRound className="mx-auto h-4 w-4" /> API keys
              </button>
            </div>

            {choice === "agents" && sizing && (
              <div className="mt-2 space-y-1 rounded-lg bg-black/30 p-3 text-xs text-gray-300">
                <p className="text-white">Suggested: {sizing.recommendedWorkers} agents on this machine</p>
                {sizing.rationale.map((r, i) => <p key={i}>· {r}</p>)}
                <Link to="/agents" className="block pt-1 text-indigo-400 hover:underline">Open the agents playground →</Link>
              </div>
            )}

            {choice === "api" && (
              <div className="mt-2 space-y-2 text-xs">
                <p className="text-gray-400">Demand per agent: {demand.requestsPerMinutePerAgent} req/min · {demand.tokensPerMinutePerAgent.toLocaleString()} tok/min · {demand.concurrentAgents} concurrent</p>
                <div className="flex gap-2">
                  <label className="flex-1">
                    Agents
                    <input type="number" min={1} max={16} value={demand.concurrentAgents}
                      onChange={(e) => setDemand({ ...demand, concurrentAgents: Number(e.target.value) || 1 })}
                      className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1" />
                  </label>
                  <button onClick={() => setKeyResults(analyzeAllProviders(demand))}
                    className="mt-4 h-7 rounded bg-indigo-600 px-3 text-white transition hover:bg-indigo-500">
                    Analyze keys
                  </button>
                </div>
                {providerTable.map((k) => (
                  <div key={k.provider} className="rounded-lg bg-black/30 p-2.5">
                    <p className="text-white">{k.provider} — {k.singleKeySufficient ? "one key is enough" : `${k.keysNeeded} keys needed`}</p>
                    <p className="text-gray-500">{k.bindingLimit}</p>
                    {k.recommendations.slice(0, 2).map((r, i) => <p key={i} className="text-gray-400">· {r}</p>)}
                  </div>
                ))}
                <p className="text-[11px] text-gray-500">
                  Mechanism: a key's ceiling is min(RPM, TPM, concurrency) ÷ per-agent demand. Providers ranked by agents per key.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Free-provider pool with automatic failover */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound className="h-4 w-4 text-indigo-400" /> Free providers · auto-failover
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            Paste one or more free keys. When a vendor rate-limits, exhausts its day, or goes down, the notebook
            shifts to the next healthy provider in the background — the conversation just continues.
          </p>
          <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {FREE_PROVIDERS.map((p) => {
              const registered = routerRef.current.getKey(p.id) !== undefined;
              const h = poolHealth.find((x) => x.providerId === p.id);
              const statusColor =
                h?.status === "healthy" ? "text-emerald-400"
                : h?.status === "cooling" ? "text-amber-400"
                : h?.status === "exhausted" || h?.status === "key-invalid" ? "text-rose-400"
                : registered ? "text-indigo-300"
                : "text-gray-500";
              return (
                <div key={p.id} className="rounded-lg border border-white/10 px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-200">{p.name}</span>
                    <span className={statusColor}>{registered ? h?.status ?? "ready" : "no key"}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {p.requestsPerMinute} req/min · {p.requestsPerDay.toLocaleString()}/day · {p.tradeoff}
                    {p.trainsOnData && <span className="text-amber-400/80"> · trains on your prompts</span>}
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      type="password"
                      value={keyDrafts[p.id] ?? ""}
                      onChange={(e) => setKeyDrafts((k) => ({ ...k, [p.id]: e.target.value }))}
                      placeholder={registered ? "key saved" : "paste free key"}
                      className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] outline-none focus:border-indigo-500"
                    />
                    {registered ? (
                      <button onClick={() => removeKey(p.id)} className="rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20">Remove</button>
                    ) : (
                      <button onClick={() => saveKey(p.id)} className="rounded bg-indigo-600 px-2 py-1 text-[11px] text-white hover:bg-indigo-500">Save</button>
                    )}
                    <a href={p.keyUrl} target="_blank" rel="noreferrer" className="rounded bg-white/5 px-2 py-1 text-[11px] text-indigo-300 hover:bg-white/10">Get key</a>
                  </div>
                  {h?.lastError && <p className="mt-1 text-[11px] text-rose-400/80">{h.lastError}</p>}
                </div>
              );
            })}
          </div>
          {autoMode && (
            <p className="mt-2 rounded-lg bg-emerald-950/40 p-2 text-[11px] text-emerald-300">
              Auto-failover active across {routerRef.current.registeredProviders().length} provider(s).
              {shiftLog.length > 0 && ` Last shift: ${shiftLog[shiftLog.length - 1].reason}`}
            </p>
          )}
        </section>
      </aside>
    </>
  );
}
