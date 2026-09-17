/**
 * stitaP Multi-agent Teamwork
 *
 * Matches the Google Antigrativity Teamwork framework layout:
 * - Framework Architecture description card
 * - 5 workflow pattern cards with step flow visualization
 * - Click any card to configure and launch the workflow
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  WORKFLOW_TEMPLATES,
  ROLE_DEFINITIONS,
  getDefaultConfig,
  validateConfig,
  estimateTokenCost,
  getRecommendedWorkflow,
  formatDuration,
  formatTokens,
  createWorkflowId,
  type WorkflowType,
  type WorkflowConfig,
  type AgentConfig,
  type WorkflowStep,
  type AgentRole,
} from "@/lib/teamwork/engine";
import { WorkflowRunner, type RunnerState } from "@/lib/teamwork/runner";
import ExecutionDashboard from "./ExecutionDashboard";
import { cn } from "@/lib/utils";

// ─── Workflow Card Config ───────────────────────────────────────────────────

const WORKFLOW_CARD_CONFIG: Record<
  WorkflowType,
  {
    badgeColor: string;
    badgeBg: string;
    description: string;
  }
> = {
  "iterative-coding": {
    badgeColor: "#F59E0B",
    badgeBg: "#FEF3C7",
    description: "Non-decomposable problems",
  },
  "distributed-coding": {
    badgeColor: "#3B82F6",
    badgeBg: "#DBEAFE",
    description: "Decomposable software engineering tasks",
  },
  "long-proof": {
    badgeColor: "#F59E0B",
    badgeBg: "#FEF3C7",
    description: "Open math & science problems",
  },
  "self-verification": {
    badgeColor: "#10B981",
    badgeBg: "#D1FAE5",
    description: "Deep reasoning with rigorous self-verification",
  },
  "document-review": {
    badgeColor: "#EF4444",
    badgeBg: "#FEE2E2",
    description: "Paper & document analysis",
  },
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Teamwork() {
  const navigate = useNavigate();
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowType | null>(null);
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "agents" | "steps" | "settings">("overview");
  const [errors, setErrors] = useState<string[]>([]);
  const [runner, setRunner] = useState<WorkflowRunner | null>(null);
  const [runnerState, setRunnerState] = useState<RunnerState | null>(null);

  const handleSelectWorkflow = useCallback((type: WorkflowType) => {
    setSelectedWorkflow(type);
    setConfig(getDefaultConfig(type));
    setActiveTab("overview");
    setErrors([]);
  }, []);

  const handleGoalChange = useCallback(
    (goal: string) => {
      if (!config) return;
      setConfig({ ...config, goal });
    },
    [config],
  );

  const handleAgentChange = useCallback(
    (index: number, updates: Partial<AgentConfig>) => {
      if (!config) return;
      const agents = [...config.agents];
      agents[index] = { ...agents[index], ...updates };
      setConfig({ ...config, agents });
    },
    [config],
  );

  const handleAddAgent = useCallback(
    (role: AgentRole) => {
      if (!config) return;
      const template = WORKFLOW_TEMPLATES[config.type];
      const defaultAgent = template.defaultAgents.find((a) => a.role === role);
      if (defaultAgent) {
        setConfig({
          ...config,
          agents: [
            ...config.agents,
            {
              ...defaultAgent,
              name: `${defaultAgent.name} ${config.agents.length + 1}`,
            },
          ],
        });
      }
    },
    [config],
  );

  const handleRemoveAgent = useCallback(
    (index: number) => {
      if (!config) return;
      setConfig({
        ...config,
        agents: config.agents.filter((_, i) => i !== index),
      });
    },
    [config],
  );

  const handleStepChange = useCallback(
    (index: number, updates: Partial<WorkflowStep>) => {
      if (!config) return;
      const steps = [...config.steps];
      steps[index] = { ...steps[index], ...updates };
      setConfig({ ...config, steps });
    },
    [config],
  );

  const handleValidate = useCallback(() => {
    if (!config) return;
    const errs = validateConfig(config);
    setErrors(errs);
    return errs.length === 0;
  }, [config]);

  const handleStartWorkflow = useCallback(() => {
    if (!config) return;
    if (!handleValidate()) return;

    const r = new WorkflowRunner(config);
    setRunner(r);
    r.subscribe((state) => setRunnerState({ ...state }));
    r.start();
  }, [config, handleValidate]);

  const costEstimate = useMemo(() => {
    if (!config) return null;
    return estimateTokenCost(config);
  }, [config]);

  // ── Execution Dashboard Mode ──
  if (runner && runnerState) {
    return (
      <ExecutionDashboard
        config={config!}
        runner={runner}
        state={runnerState}
        onBack={() => {
          runner.abort();
          setRunner(null);
          setRunnerState(null);
        }}
      />
    );
  }

  // ── Workflow Selection (Google Antigravity Layout) ──
  if (!config || !selectedWorkflow) {
    return (
      <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 50%, #0a0a1a 100%)" }}>
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-black/40 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-white"
            >
              <span className="grid size-6 place-items-center rounded border border-white/20 bg-white/10 text-[10px] font-bold text-white">
                V
              </span>
              stitaP
            </button>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
              Teamwork
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-12">
          {/* Title */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Multi-agent Teamwork
            </h1>
          </div>

          {/* Quick Goal Input */}
          <div className="mx-auto mb-12 max-w-2xl">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <label className="block text-[13px] font-medium text-white/80">
                What do you want to solve?
              </label>
              <textarea
                value={config?.goal ?? ""}
                onChange={(e) => {
                  const goal = e.target.value;
                  if (goal.length > 10) {
                    const recommended = getRecommendedWorkflow(goal);
                    setSelectedWorkflow(recommended);
                    setConfig(getDefaultConfig(recommended));
                    setTimeout(() => {
                      setConfig((prev) => (prev ? { ...prev, goal } : prev));
                    }, 0);
                  } else {
                    handleSelectWorkflow(getRecommendedWorkflow(goal));
                    setTimeout(() => {
                      setConfig((prev) => (prev ? { ...prev, goal } : prev));
                    }, 0);
                  }
                }}
                placeholder="e.g., Prove that every even number greater than 2 can be expressed as the sum of two primes..."
                rows={3}
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-[13px] text-white placeholder-white/30 outline-none transition-colors focus:border-white/30 font-mono"
              />
              <p className="mt-2 text-[11px] text-white/30">
                Describe your challenge and we'll recommend the best workflow pattern.
              </p>
            </div>
          </div>

          {/* Workflow Cards Grid — Google Antigravity Style */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Framework Architecture Card (spans full width on mobile, half on desktop) */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm md:col-span-1 lg:col-span-1">
              <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                Framework Architecture
              </span>
              <h3 className="mt-3 text-[15px] font-semibold text-white">
                The Teamwork framework applies across many domains
              </h3>
              <p className="mt-2 text-[12px] leading-5 text-white/40">
                Autonomous multi-agent orchestration
              </p>
              <div className="mt-4 space-y-2">
                {Object.entries(WORKFLOW_TEMPLATES).map(([type, template]) => {
                  const cardConfig = WORKFLOW_CARD_CONFIG[type as WorkflowType];
                  return (
                    <button
                      key={type}
                      onClick={() => handleSelectWorkflow(type as WorkflowType)}
                      className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: cardConfig.badgeColor }}
                      />
                      <span className="text-[12px] font-medium text-white/80">
                        {template.name}
                      </span>
                      <span className="ml-auto text-[10px] text-white/30">
                        {template.steps.length} steps
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Iterative Coding Card */}
            <WorkflowCard
              type="iterative-coding"
              onSelect={handleSelectWorkflow}
            />

            {/* Distributed Coding Card */}
            <WorkflowCard
              type="distributed-coding"
              onSelect={handleSelectWorkflow}
            />

            {/* Long Proof Card */}
            <WorkflowCard
              type="long-proof"
              onSelect={handleSelectWorkflow}
            />

            {/* Self-Verification Card */}
            <WorkflowCard
              type="self-verification"
              onSelect={handleSelectWorkflow}
            />

            {/* Document Review Card */}
            <WorkflowCard
              type="document-review"
              onSelect={handleSelectWorkflow}
            />
          </div>

          {/* All workflows list */}
          <div className="mt-16 text-center">
            <p className="text-[12px] text-white/30">
              The Teamwork framework applies across many domains
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ── Configuration Editor ──
  const inputCls =
    "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[12.5px] text-zinc-900 outline-none transition-colors focus:border-zinc-900";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedWorkflow(null);
              setConfig(null);
            }}
            className="flex items-center gap-2 text-[13px] font-semibold tracking-tight"
          >
            <span className="grid size-6 place-items-center rounded border border-zinc-900 bg-zinc-900 text-[10px] font-bold text-white">
              V
            </span>
            stitaP
          </button>
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Teamwork → {WORKFLOW_TEMPLATES[selectedWorkflow].name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {costEstimate && (
            <span className="text-[11px] text-zinc-500">
              ~{formatTokens(costEstimate.estimatedTokens)} tokens · ~${costEstimate.estimatedCostUSD.toFixed(2)}
            </span>
          )}
          <button
            onClick={handleStartWorkflow}
            className="rounded-md bg-zinc-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Start Teamwork
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1fr_320px]">
        {/* Main Content */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {/* Tabs */}
          <div className="flex border-b border-zinc-200">
            {(["overview", "agents", "steps", "settings"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2.5 text-[12px] font-medium capitalize transition-colors",
                  activeTab === tab
                    ? "border-b-2 border-zinc-900 text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-4 p-6">
              <div>
                <label className="block text-[12px] font-medium text-zinc-700">Goal</label>
                <textarea
                  value={config.goal}
                  onChange={(e) => handleGoalChange(e.target.value)}
                  rows={3}
                  className={cn(inputCls, "mt-1 font-mono text-[12px]")}
                  placeholder="Describe what you want to achieve..."
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-zinc-700">Context</label>
                <textarea
                  value={config.context}
                  onChange={(e) => setConfig({ ...config, context: e.target.value })}
                  rows={4}
                  className={cn(inputCls, "mt-1 font-mono text-[12px]")}
                  placeholder="Provide any relevant context, constraints, or requirements..."
                />
              </div>

              {/* Workflow Visualization */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <p className="mb-3 text-[12px] font-medium text-zinc-700">Workflow Steps</p>
                <div className="flex flex-wrap items-center gap-2">
                  {config.steps.map((step, i) => {
                    const role = ROLE_DEFINITIONS[step.role];
                    return (
                      <div key={step.id} className="flex items-center gap-2">
                        <div
                          className="rounded-lg border px-3 py-2"
                          style={{ borderColor: role.color + "40", backgroundColor: role.color + "10" }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span style={{ color: role.color }}>{role.icon}</span>
                            <span className="text-[11px] font-medium" style={{ color: role.color }}>
                              {step.name}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] text-zinc-500">{step.role}</p>
                        </div>
                        {i < config.steps.length - 1 && <span className="text-zinc-300">→</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-[12px] font-medium text-red-800">Configuration Errors</p>
                  <ul className="mt-1 space-y-1">
                    {errors.map((err, i) => (
                      <li key={i} className="text-[11px] text-red-600">• {err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Agents Tab */}
          {activeTab === "agents" && (
            <div className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-zinc-700">
                  Agent Team ({config.agents.length})
                </p>
                <div className="flex gap-2">
                  {Object.entries(ROLE_DEFINITIONS).map(([role, def]) => (
                    <button
                      key={role}
                      onClick={() => handleAddAgent(role as AgentRole)}
                      className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-400"
                      title={`Add ${def.name}`}
                    >
                      {def.icon}+
                    </button>
                  ))}
                </div>
              </div>

              {config.agents.map((agent, i) => {
                const def = ROLE_DEFINITIONS[agent.role];
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-zinc-200 p-4"
                    style={{ borderLeftColor: def.color, borderLeftWidth: 3 }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{def.icon}</span>
                        <div>
                          <input
                            value={agent.name}
                            onChange={(e) => handleAgentChange(i, { name: e.target.value })}
                            className="border-b border-transparent bg-transparent text-[13px] font-semibold text-zinc-900 outline-none hover:border-zinc-300 focus:border-zinc-900"
                          />
                          <p className="text-[11px] text-zinc-500">{def.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveAgent(i)}
                        className="text-[10px] text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-zinc-500">
                          System Prompt
                        </label>
                        <textarea
                          value={agent.systemPrompt}
                          onChange={(e) => handleAgentChange(i, { systemPrompt: e.target.value })}
                          rows={3}
                          className={cn(inputCls, "mt-1 text-[11px]")}
                        />
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[10px] font-medium text-zinc-500">
                            Max Tokens
                          </label>
                          <input
                            type="number"
                            value={agent.maxTokens}
                            onChange={(e) =>
                              handleAgentChange(i, { maxTokens: Number(e.target.value) })
                            }
                            className={cn(inputCls, "mt-1 text-[11px]")}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-zinc-500">
                            Temperature
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="1"
                            value={agent.temperature}
                            onChange={(e) =>
                              handleAgentChange(i, { temperature: Number(e.target.value) })
                            }
                            className={cn(inputCls, "mt-1 text-[11px]")}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-zinc-500">
                            Principles
                          </label>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {agent.principles.map((p, pi) => (
                              <span
                                key={pi}
                                className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-600"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Steps Tab */}
          {activeTab === "steps" && (
            <div className="space-y-4 p-6">
              {config.steps.map((step, i) => {
                const role = ROLE_DEFINITIONS[step.role];
                return (
                  <div key={step.id} className="rounded-lg border border-zinc-200 p-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-8 items-center justify-center rounded-full text-[12px] font-bold text-white"
                        style={{ backgroundColor: role.color }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <input
                          value={step.name}
                          onChange={(e) => handleStepChange(i, { name: e.target.value })}
                          className="border-b border-transparent bg-transparent text-[13px] font-semibold text-zinc-900 outline-none hover:border-zinc-300 focus:border-zinc-900"
                        />
                        <p className="text-[11px] text-zinc-500">{step.description}</p>
                      </div>
                      <select
                        value={step.role}
                        onChange={(e) => handleStepChange(i, { role: e.target.value as AgentRole })}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px]"
                      >
                        {Object.entries(ROLE_DEFINITIONS).map(([r, d]) => (
                          <option key={r} value={r}>
                            {d.icon} {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-zinc-500">
                          Max Tokens
                        </label>
                        <input
                          type="number"
                          value={step.maxTokens}
                          onChange={(e) =>
                            handleStepChange(i, { maxTokens: Number(e.target.value) })
                          }
                          className={cn(inputCls, "mt-1 text-[11px]")}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-zinc-500">
                          Timeout
                        </label>
                        <input
                          type="number"
                          value={Math.floor(step.timeoutMs / 1000)}
                          onChange={(e) =>
                            handleStepChange(i, { timeoutMs: Number(e.target.value) * 1000 })
                          }
                          className={cn(inputCls, "mt-1 text-[11px]")}
                        />
                        <p className="text-[9px] text-zinc-400">seconds</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-zinc-500">
                          Retries
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="5"
                          value={step.retries}
                          onChange={(e) =>
                            handleStepChange(i, { retries: Number(e.target.value) })
                          }
                          className={cn(inputCls, "mt-1 text-[11px]")}
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-[11px] text-zinc-600">
                          <input
                            type="checkbox"
                            checked={step.verificationRequired}
                            onChange={(e) =>
                              handleStepChange(i, { verificationRequired: e.target.checked })
                            }
                            className="size-3"
                          />
                          Verify
                        </label>
                      </div>
                    </div>

                    {step.loopEnabled !== undefined && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="flex items-center gap-2 text-[11px] text-zinc-600">
                          <input
                            type="checkbox"
                            checked={step.loopEnabled ?? false}
                            onChange={(e) =>
                              handleStepChange(i, { loopEnabled: e.target.checked })
                            }
                            className="size-3"
                          />
                          Enable retry loop
                        </label>
                        {step.loopEnabled && (
                          <input
                            value={step.loopCondition ?? ""}
                            onChange={(e) =>
                              handleStepChange(i, { loopCondition: e.target.value })
                            }
                            placeholder="Loop condition..."
                            className={cn(inputCls, "flex-1 text-[10px] font-mono")}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="space-y-4 p-6">
              <div className="border-t border-zinc-200 px-0 py-5 first:border-t-0">
                <p className="text-[13px] font-semibold text-zinc-900">Budget Controls</p>
                <p className="mt-1 max-w-2xl text-[12px] leading-5 text-zinc-500">
                  Limit tokens and time to prevent runaway costs
                </p>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium text-zinc-700">
                      Max Total Tokens
                    </label>
                    <input
                      type="number"
                      value={config.maxTotalTokens}
                      onChange={(e) =>
                        setConfig({ ...config, maxTotalTokens: Number(e.target.value) })
                      }
                      className={cn(inputCls, "mt-1")}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-zinc-700">Max Time</label>
                    <input
                      type="number"
                      value={Math.floor(config.maxTimeMs / 1000)}
                      onChange={(e) =>
                        setConfig({ ...config, maxTimeMs: Number(e.target.value) * 1000 })
                      }
                      className={cn(inputCls, "mt-1")}
                    />
                    <p className="mt-1 text-[10px] text-zinc-400">seconds</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-200 px-0 py-5">
                <p className="text-[13px] font-semibold text-zinc-900">Verification</p>
                <div className="mt-2 flex gap-2">
                  {(["none", "basic", "strict", "paranoid"] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setConfig({ ...config, verificationStrictness: level })}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-[12px] font-medium capitalize transition-colors",
                        config.verificationStrictness === level
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-400",
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-200 px-0 py-5">
                <p className="text-[13px] font-semibold text-zinc-900">Execution</p>
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2 text-[12px] text-zinc-700">
                    <input
                      type="checkbox"
                      checked={config.parallelExecution}
                      onChange={(e) =>
                        setConfig({ ...config, parallelExecution: e.target.checked })
                      }
                      className="size-3.5"
                    />
                    Enable parallel execution where possible
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-zinc-700">
                    <input
                      type="checkbox"
                      checked={config.memoryEnabled}
                      onChange={(e) =>
                        setConfig({ ...config, memoryEnabled: e.target.checked })
                      }
                      className="size-3.5"
                    />
                    Enable memory (agents remember previous steps)
                  </label>
                  {config.memoryEnabled && (
                    <div className="ml-6">
                      <label className="block text-[11px] font-medium text-zinc-500">
                        Memory Scope
                      </label>
                      <select
                        value={config.memoryScope}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            memoryScope: e.target.value as "session" | "workflow" | "persistent",
                          })
                        }
                        className={cn(inputCls, "mt-1 w-48 text-[11px]")}
                      >
                        <option value="session">Session (current run only)</option>
                        <option value="workflow">Workflow (persists across runs)</option>
                        <option value="persistent">Persistent (never forgets)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {costEstimate && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-[12px] font-semibold text-zinc-900">Cost Estimate</p>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Steps</span>
                  <span className="font-medium text-zinc-700">{costEstimate.totalSteps}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Est. Tokens</span>
                  <span className="font-medium text-zinc-700">
                    {formatTokens(costEstimate.estimatedTokens)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Est. Cost</span>
                  <span className="font-medium text-zinc-700">
                    ${costEstimate.estimatedCostUSD.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Est. Time</span>
                  <span className="font-medium text-zinc-700">
                    {formatDuration(costEstimate.estimatedTimeMs)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-[12px] font-semibold text-zinc-900">Agent Roles</p>
            <div className="mt-3 space-y-2">
              {Object.entries(ROLE_DEFINITIONS).map(([role, def]) => (
                <div key={role} className="flex items-center gap-2 text-[11px]">
                  <span style={{ color: def.color }}>{def.icon}</span>
                  <span className="font-medium text-zinc-700">{def.name}</span>
                  <span className="text-zinc-400">—</span>
                  <span className="text-zinc-500">{def.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-[12px] font-semibold text-zinc-900">Tips</p>
            <ul className="mt-2 space-y-1.5 text-[11px] text-zinc-500">
              <li>• Start with <strong>Iterative Coding</strong> for simple tasks</li>
              <li>• Use <strong>Distributed Coding</strong> for multi-file features</li>
              <li>• Try <strong>Long Proof</strong> for mathematical problems</li>
              <li>• <strong>Self-Verification</strong> catches more bugs but costs more</li>
              <li>• Set token budgets to prevent runaway costs</li>
              <li>• Enable memory for long-running workflows</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

// ─── Workflow Card Component ────────────────────────────────────────────────

function WorkflowCard({
  type,
  onSelect,
}: {
  type: WorkflowType;
  onSelect: (type: WorkflowType) => void;
}) {
  const template = WORKFLOW_TEMPLATES[type];
  const cardConfig = WORKFLOW_CARD_CONFIG[type];

  return (
    <button
      onClick={() => onSelect(type)}
      className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition-all hover:border-white/20 hover:bg-white/10 backdrop-blur-sm"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[14px] font-semibold text-white">{template.name}</p>
          <p className="mt-1 text-[12px] leading-5 text-white/40">
            {cardConfig.description}
          </p>
        </div>
      </div>

      {/* Step flow visualization — colored pills with arrows */}
      <div className="mt-4 flex items-center gap-1.5 flex-wrap">
        {template.steps.map((step, i) => {
          const role = ROLE_DEFINITIONS[step.role];
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-medium text-white"
                style={{ backgroundColor: role.color }}
              >
                {step.name}
              </span>
              {i < template.steps.length - 1 && (
                <span className="text-[10px] text-white/30">→</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-white/30">
        <span>{template.steps.length} steps</span>
        <span>{template.defaultAgents.length} agents</span>
        <span>{formatTokens(template.steps.reduce((s, st) => s + st.maxTokens, 0))} tokens</span>
      </div>
    </button>
  );
}
