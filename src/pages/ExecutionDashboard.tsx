/**
 * stitaP Teamwork Execution Dashboard
 *
 * Real-time visualization of multi-agent teamwork execution.
 * Shows agent statuses, step progress, token usage, event log, and controls.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  ROLE_DEFINITIONS,
  formatDuration,
  formatTokens,
  type WorkflowConfig,
} from "@/lib/teamwork/engine";
import {
  WorkflowRunner,
  type RunnerState,
} from "@/lib/teamwork/runner";

// ─── Props ──────────────────────────────────────────────────────────────────

interface ExecutionDashboardProps {
  config: WorkflowConfig;
  runner: WorkflowRunner;
  state: RunnerState;
  onBack: () => void;
}

// ─── Event Log Component ────────────────────────────────────────────────────

function EventLog({ events }: { events: RunnerState["events"] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div
      ref={logRef}
      className="h-[250px] overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 font-mono text-[11px]"
    >
      {events.length === 0 && (
        <p className="text-zinc-500">Waiting for execution to start...</p>
      )}
      {events.map((event) => {
        const role = event.agentRole ? ROLE_DEFINITIONS[event.agentRole] : null;
        const time = new Date(event.timestamp).toLocaleTimeString();
        return (
          <div key={event.id} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-zinc-500">{time}</span>
            {role && (
              <span style={{ color: role.color }} className="shrink-0">
                {role.icon}
              </span>
            )}
            <span
              className={cn(
                event.type === "step_start" && "text-blue-400",
                event.type === "step_complete" && "text-green-400",
                event.type === "step_fail" && "text-red-400",
                event.type === "verification" && "text-yellow-400",
                event.type === "loop" && "text-purple-400",
                event.type === "system" && "text-zinc-400",
                event.type === "agent_think" && "text-cyan-400",
                event.type === "agent_output" && "text-emerald-400",
              )}
            >
              {event.message}
            </span>
            {event.tokensUsed && event.tokensUsed > 0 && (
              <span className="shrink-0 text-zinc-500">
                +{formatTokens(event.tokensUsed)} tok
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Agent Card Component ───────────────────────────────────────────────────

function AgentCard({
  agent,
}: {
  agent: RunnerState["agents"][number];
}) {
  const def = ROLE_DEFINITIONS[agent.role];
  const isActive = agent.status === "working" || agent.status === "thinking" || agent.status === "reviewing";
  const isCompleted = agent.status === "completed";
  const isFailed = agent.status === "failed";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        isActive && "ring-2 ring-offset-1",
        isCompleted && "border-green-200 bg-green-50",
        isFailed && "border-red-200 bg-red-50",
        !isActive && !isCompleted && !isFailed && "border-zinc-200 bg-white",
      )}
      style={{
        borderColor: isActive ? def.color + "60" : undefined,
        backgroundColor: isActive ? def.color + "08" : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{def.icon}</span>
          <div>
            <p className="text-[12px] font-semibold text-zinc-900">{agent.name}</p>
            <p className="text-[10px] text-zinc-500">{def.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={cn("size-2 rounded-full", isActive && "animate-pulse")}
              style={{
                backgroundColor: isCompleted
                  ? "#10B981"
                  : isFailed
                    ? "#EF4444"
                    : isActive
                      ? def.color
                      : "#D1D5DB",
              }}
            />
            <span className="text-[10px] capitalize text-zinc-500">{agent.status}</span>
          </div>
          <span className="text-[10px] text-zinc-400">
            {formatTokens(agent.tokensUsed)} tok
          </span>
        </div>
      </div>
      {agent.lastMessage && (
        <p className="mt-2 truncate text-[10px] text-zinc-400 italic">
          &ldquo;{agent.lastMessage}&rdquo;
        </p>
      )}
    </div>
  );
}

// ─── Step Progress Component ────────────────────────────────────────────────

function StepProgress({
  step,
  isCurrent,
}: {
  step: RunnerState["steps"][number];
  isCurrent: boolean;
}) {
  const def = ROLE_DEFINITIONS[step.role];

  return (
    <div
      className={cn(
        "relative rounded-lg border p-3 transition-all",
        isCurrent && "ring-2",
        step.status === "completed" && "border-green-200 bg-green-50/50",
        step.status === "failed" && "border-red-200 bg-red-50/50",
        step.status === "running" && "border-zinc-300 bg-zinc-50",
        step.status === "pending" && "border-zinc-200 bg-white",
      )}
      style={{
        borderColor: isCurrent ? def.color + "60" : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: def.color }}
          >
            {step.status === "completed"
              ? "✓"
              : step.status === "failed"
                ? "✗"
                : step.status === "running"
                  ? "⟳"
                  : ""}
          </span>
          <div>
            <p className="text-[12px] font-medium text-zinc-900">{step.name}</p>
            <p className="text-[10px] text-zinc-500">
              {def.icon} {def.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-zinc-400">
          {step.retryCount > 0 && (
            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700">
              Retry #{step.retryCount}
            </span>
          )}
          <span>{formatTokens(step.tokensUsed)} tok</span>
          <span className="capitalize text-zinc-500">{step.status}</span>
        </div>
      </div>

      {/* Progress bar */}
      {step.status === "running" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${step.progress}%`,
              backgroundColor: def.color,
            }}
          />
        </div>
      )}

      {/* Verification result */}
      {step.verification && (
        <div
          className={cn(
            "mt-2 rounded px-2 py-1 text-[10px]",
            step.verification.passed
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {step.verification.passed
            ? `✓ Verified (${(step.verification.confidence * 100).toFixed(0)}% confidence)`
            : `✗ Failed: ${step.verification.issues.join(", ")}`}
        </div>
      )}

      {/* Result preview */}
      {step.result && step.status === "completed" && (
        <p className="mt-2 truncate text-[10px] text-zinc-400 italic">
          &ldquo;{step.result}&rdquo;
        </p>
      )}
    </div>
  );
}

// ─── Flow Visualization ─────────────────────────────────────────────────────

function FlowVisualization({
  steps,
  currentIndex,
}: {
  steps: RunnerState["steps"];
  currentIndex: number;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {steps.map((step, i) => {
        const def = ROLE_DEFINITIONS[step.role];
        const isCurrent = i === currentIndex;
        const isCompleted = step.status === "completed";
        const isFailed = step.status === "failed";

        return (
          <div key={step.id} className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all",
                isCurrent && "ring-2 ring-offset-1",
                isCompleted && "bg-green-100 text-green-800",
                isFailed && "bg-red-100 text-red-800",
                !isCurrent && !isCompleted && !isFailed && "bg-zinc-100 text-zinc-600",
              )}
              style={{
                borderColor: isCurrent ? def.color : undefined,
                backgroundColor: isCurrent ? def.color + "15" : undefined,
                color: isCurrent ? def.color : undefined,
              }}
            >
              <span>{def.icon}</span>
              <span>{step.name}</span>
              {isCompleted && <span className="text-green-600">✓</span>}
              {isFailed && <span className="text-red-600">✗</span>}
            </div>
            {i < steps.length - 1 && (
              <span className="text-zinc-300 text-[10px]">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function ExecutionDashboard({
  config,
  runner,
  state,
  onBack,
}: ExecutionDashboardProps) {
  const completedSteps = state.steps.filter((s) => s.status === "completed").length;
  const failedSteps = state.steps.filter((s) => s.status === "failed").length;
  const isRunning = state.status === "running";
  const isPaused = state.status === "paused";
  const isComplete = state.status === "completed" || state.status === "failed" || state.status === "aborted";

  const currentStepIndex = state.steps.findIndex((s) => s.status === "running");
  const tokenPercent = config.maxTotalTokens > 0
    ? Math.min(100, (state.totalTokensUsed / config.maxTotalTokens) * 100)
    : 0;
  const timePercent = config.maxTimeMs > 0 && state.startedAt
    ? Math.min(100, ((Date.now() - state.startedAt) / config.maxTimeMs) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[13px] font-semibold tracking-tight"
          >
            <span className="grid size-6 place-items-center rounded border border-zinc-900 bg-zinc-900 text-[10px] font-bold text-white">
              V
            </span>
            stitaP
          </button>
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Teamwork → {config.name} → Running
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase",
              isRunning && "bg-blue-100 text-blue-700",
              isPaused && "bg-yellow-100 text-yellow-700",
              state.status === "completed" && "bg-green-100 text-green-700",
              state.status === "failed" && "bg-red-100 text-red-700",
              state.status === "aborted" && "bg-zinc-100 text-zinc-700",
            )}
          >
            {state.status}
          </span>

          {/* Controls */}
          {!isComplete && (
            <>
              {isRunning ? (
                <button
                  onClick={() => runner.pause()}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Pause
                </button>
              ) : isPaused ? (
                <button
                  onClick={() => runner.resume()}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-zinc-700"
                >
                  Resume
                </button>
              ) : null}
              <button
                onClick={() => runner.abort()}
                className="rounded-md border border-red-200 px-3 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
              >
                Abort
              </button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {/* Metrics Bar */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-[10px] font-medium text-zinc-500 uppercase">Tokens</p>
            <p className="mt-1 text-[20px] font-bold text-zinc-900">
              {formatTokens(state.totalTokensUsed)}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all duration-500"
                style={{ width: `${tokenPercent}%` }}
              />
            </div>
            <p className="mt-1 text-[9px] text-zinc-400">
              / {formatTokens(config.maxTotalTokens)} budget
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-[10px] font-medium text-zinc-500 uppercase">Time</p>
            <p className="mt-1 text-[20px] font-bold text-zinc-900">
              {formatDuration(state.totalDurationMs)}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all duration-500"
                style={{ width: `${timePercent}%` }}
              />
            </div>
            <p className="mt-1 text-[9px] text-zinc-400">
              / {formatDuration(config.maxTimeMs)} limit
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-[10px] font-medium text-zinc-500 uppercase">Steps</p>
            <p className="mt-1 text-[20px] font-bold text-zinc-900">
              {completedSteps}/{state.steps.length}
            </p>
            {failedSteps > 0 && (
              <p className="mt-1 text-[10px] text-red-500">{failedSteps} failed</p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-[10px] font-medium text-zinc-500 uppercase">Agents</p>
            <p className="mt-1 text-[20px] font-bold text-zinc-900">
              {state.agents.filter((a) => a.status !== "idle").length}/{state.agents.length}
            </p>
            <p className="mt-1 text-[10px] text-zinc-400">active</p>
          </div>
        </div>

        {/* Flow Visualization */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-medium text-zinc-500">Workflow Pipeline</p>
          <FlowVisualization steps={state.steps} currentIndex={currentStepIndex} />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Left: Step Details */}
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="mb-3 text-[12px] font-semibold text-zinc-900">Step Progress</p>
              <div className="space-y-3">
                {state.steps.map((step, i) => (
                  <StepProgress
                    key={step.id}
                    step={step}
                    isCurrent={i === currentStepIndex}
                  />
                ))}
              </div>
            </div>

            {/* Event Log */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="mb-3 text-[12px] font-semibold text-zinc-900">Event Log</p>
              <EventLog events={state.events} />
            </div>
          </div>

          {/* Right: Agent Cards */}
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="mb-3 text-[12px] font-semibold text-zinc-900">Agent Status</p>
              <div className="space-y-3">
                {state.agents.map((agent) => (
                  <AgentCard key={agent.role} agent={agent} />
                ))}
              </div>
            </div>

            {/* Workflow Info */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-[12px] font-semibold text-zinc-900">Workflow</p>
              <div className="mt-2 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Type</span>
                  <span className="font-medium text-zinc-700">{config.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Verification</span>
                  <span className="font-medium text-zinc-700 capitalize">
                    {config.verificationStrictness}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Parallel</span>
                  <span className="font-medium text-zinc-700">
                    {config.parallelExecution ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Memory</span>
                  <span className="font-medium text-zinc-700">
                    {config.memoryEnabled ? config.memoryScope : "Off"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
