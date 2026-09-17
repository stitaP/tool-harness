import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import {
  MODULE_REGISTRY,
  SESSION_PRESETS,
  createSessionState,
  setModuleEnabled,
  applyPreset,
  computeBudget,
  persistSessionState,
  loadPersistedSessionState,
} from "@/lib/session";
import type { SessionModuleState, SessionProfileId, ModuleCategory } from "@/lib/session";
import { createSwarm } from "@/lib/agent/swarm";
import type { SwarmTopology } from "@/lib/agent/swarm";

const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  capture: "Capture & Media",
  browser: "Browser",
  testing: "Testing",
  design: "Design QA",
  vision: "Vision",
  orchestration: "Orchestration",
  agent: "Agent Systems",
  inference: "Inference",
  sandbox: "Sandboxes",
  integrations: "Integrations",
  enterprise: "Enterprise",
  document: "Documents",
  video: "Video",
  audio: "Audio",
};

const TOPOLOGIES: SwarmTopology[] = ["hierarchical", "mesh", "ring", "star", "pipeline"];

function formatGB(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1) + " GB";
}

export default function Modules() {
  const [state, setState] = useState<SessionModuleState>(() => loadPersistedSessionState() ?? createSessionState("balanced"));

  // Swarm form state
  const [swarmName, setSwarmName] = useState("my-swarm");
  const [topology, setTopology] = useState<SwarmTopology>("hierarchical");
  const [cores, setCores] = useState(8);
  const [ramGb, setRamGb] = useState(16);
  const [params, setParams] = useState(3);
  const [bits, setBits] = useState(4);
  const [desired, setDesired] = useState(4);

  useEffect(() => persistSessionState(state), [state]);

  const budget = useMemo(
    () => computeBudget(state, { modelContextWindow: 8192 }),
    [state],
  );

  const swarmResult = useMemo(() => {
    try {
      return createSwarm({
        name: swarmName || "swarm",
        topology,
        count: desired,
        model: { name: `model-${params}b-q${bits}`, parameterBillions: params, bitsPerWeight: bits, contextWindow: 8192 },
        specs: {
          physicalCores: Math.max(1, cores),
          usableRamBytes: Math.max(1, ramGb) * 1024 ** 3,
          backend: "auto (router decides)",
        },
      });
    } catch {
      return null;
    }
  }, [swarmName, topology, cores, ramGb, params, bits, desired]);

  const grouped = useMemo(() => {
    const groups = new Map<ModuleCategory, typeof MODULE_REGISTRY>();
    for (const mod of MODULE_REGISTRY) {
      if (!groups.has(mod.category)) groups.set(mod.category, []);
      groups.get(mod.category)!.push(mod);
    }
    return Array.from(groups.entries());
  }, []);

  const toggle = (id: string, on: boolean) =>
    setState((s) => setModuleEnabled(s, id, on));

  return (
    <div className="min-h-screen bg-gray-950">
      <SiteNav />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Budget summary bar */}
        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          {[
            { label: "Modules on", value: `${budget.enabledCount}/${MODULE_REGISTRY.length}` },
            { label: "Context overhead", value: `${budget.totalContextOverheadTokens} tok` },
            { label: "Recommended window", value: `${budget.recommendedContextWindow.toLocaleString()} tok` },
            { label: "Router workload", value: budget.workloadMode },
            { label: "Tools active", value: String(budget.toolIds.length) },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500">{c.label}</p>
              <p className="mt-1 text-lg font-semibold text-white">{c.value}</p>
            </div>
          ))}
        </section>

        {/* Presets */}
        <section className="mb-8 flex flex-wrap items-center gap-3">
          {(Object.keys(SESSION_PRESETS) as SessionProfileId[]).map((pid) => (
            <button
              key={pid}
              onClick={() => setState((s) => applyPreset(s, pid))}
              title={SESSION_PRESETS[pid].description}
              className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                state.profile === pid
                  ? "border-violet-500 bg-violet-500/15 text-violet-200"
                  : "border-gray-800 bg-gray-900/50 text-gray-300 hover:border-gray-700"
              }`}
            >
              {SESSION_PRESETS[pid].label}
            </button>
          ))}
          {state.profile === "custom" && (
            <span className="text-sm text-gray-500">(custom selection)</span>
          )}
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* Module checklist */}
          <section>
            <h2 className="mb-4 text-lg font-semibold text-white">Modules</h2>
            <div className="space-y-6">
              {grouped.map(([cat, mods]) => (
                <div key={cat}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <div className="space-y-1.5">
                    {mods.map((mod) => {
                      const on = !!state.enabled[mod.id];
                      return (
                        <label
                          key={mod.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                            on
                              ? "border-violet-500/40 bg-violet-500/5"
                              : "border-gray-800 bg-gray-900/40 hover:border-gray-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => toggle(mod.id, e.target.checked)}
                            className="mt-1 h-4 w-4 accent-violet-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{mod.name}</span>
                              {mod.offline ? (
                                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">offline</span>
                              ) : (
                                <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-400">network</span>
                              )}
                              <span className="ml-auto text-[11px] text-gray-500">~{mod.contextOverheadTokens} tok</span>
                            </div>
                            <p className="mt-0.5 text-xs text-gray-400">{mod.description}</p>
                            {mod.requires.length > 0 && (
                              <p className="mt-1 text-[11px] text-gray-600">requires: {mod.requires.join(", ")}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Right rail: swarm + tools-in-session */}
          <aside className="space-y-6">
            {/* Swarm configurator */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h2 className="text-base font-semibold text-white">Swarm Configuration</h2>
              <p className="mt-1 text-xs text-gray-500">
                Sized from your hardware — workers are clamped to physical cores and RAM.
              </p>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <label className="text-xs text-gray-400">Name</label>
                  <input
                    value={swarmName}
                    onChange={(e) => setSwarmName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Topology</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {TOPOLOGIES.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTopology(t)}
                        className={`rounded px-2.5 py-1 text-xs transition-colors ${
                          topology === t
                            ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/50"
                            : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Physical cores" value={cores} onChange={setCores} min={1} max={128} />
                  <NumberField label="Usable RAM (GB)" value={ramGb} onChange={setRamGb} min={1} max={1024} />
                  <NumberField label="Params (B)" value={params} onChange={setParams} min={0.5} max={80} step={0.5} />
                  <NumberField label="Bits / weight" value={bits} onChange={setBits} min={2} max={16} step={1} />
                </div>
                <div>
                  <label className="flex justify-between text-xs text-gray-400">
                    <span>Desired workers</span>
                    <span>{desired}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={desired}
                    onChange={(e) => setDesired(Number(e.target.value))}
                    className="mt-1 w-full accent-violet-500"
                  />
                </div>
              </div>

              {swarmResult && (
                <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Recommended</span>
                    <span className="font-semibold text-emerald-400">
                      {swarmResult.sizing.recommendedWorkers} workers
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-gray-500">
                    <span>max by RAM {swarmResult.sizing.maxWorkersByRam}</span>
                    <span>max by cores {swarmResult.sizing.maxWorkersByCores}</span>
                  </div>
                  <p className="mt-2 text-gray-500">
                    {formatGB(swarmResult.sizing.estimatedMemoryPerWorkerBytes)} per model slot ·{" "}
                    {swarmResult.sizing.sharedModelPreferred ? "shared instance preferred" : "single shared instance required"}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                    {swarmResult.sizing.rationale.slice(0, 3).map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {swarmResult.config.workers.map((w) => (
                      <span key={w.id} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-300">
                        {w.role}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">
                    router workload → <span className="text-cyan-400">{swarmResult.config.workloadMode}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Active tool ids */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h2 className="text-base font-semibold text-white">Tools in this session</h2>
              <div className="mt-2 flex max-h-48 flex-wrap gap-1 overflow-y-auto">
                {budget.toolIds.map((t) => (
                  <span key={t} className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Enterprise pointer */}
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <h2 className="text-base font-semibold text-white">Enterprise Projects</h2>
              <p className="mt-1 text-xs text-gray-400">
                Load company guidelines, plan language ports / version upgrades, and run
                long-lived kanban execution with git + Jira sync.
              </p>
              <Link
                to="/guide#enterprise"
                className="mt-3 inline-block rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/30"
              >
                Read the guide →
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none"
      />
    </div>
  );
}
