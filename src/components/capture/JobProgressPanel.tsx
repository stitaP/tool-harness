import { useEffect, useState } from "react";
import {
  Check,
  Lightbulb,
  Loader2,
  Minus,
  Sparkles,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { CaptureJobState } from "@/lib/capture/types";
import { nlp } from "@/lib/nlp/service";
import type { ErrorExplanation } from "@/lib/nlp/types";
import { cn } from "@/lib/utils";

function StageIcon({ state }: { state: string }) {
  if (state === "active")
    return <Loader2 className="size-3.5 animate-spin text-zinc-900" />;
  if (state === "done") return <Check className="size-3.5 text-zinc-900" />;
  if (state === "failed") return <XCircle className="size-3.5 text-red-600" />;
  if (state === "skipped") return <Minus className="size-3.5 text-zinc-300" />;
  return <span className="block size-1.5 rounded-full bg-zinc-300" />;
}

export function JobProgressPanel({
  job,
  onCancel,
  onNew,
}: {
  job: CaptureJobState;
  onCancel: () => void;
  onNew: () => void;
}) {
  const finished =
    job.phase === "failed" ||
    job.phase === "cancelled" ||
    job.phase === "timed-out" ||
    job.phase === "blocked-by-policy";
  const isComplete = job.phase === "completed";
  // Error explanation (rule-first, instant; model only on explicit request).
  const [explanation, setExplanation] = useState<ErrorExplanation | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainModel, setExplainModel] = useState(false);

  async function explainError(useModel: boolean) {
    if (explainBusy) return;
    setExplainBusy(true);
    setExplainModel(useModel);
    try {
      const exp = await nlp.explainError(
        {
          code: job.errorCode,
          message: job.error,
          phase: job.phase,
        },
        { useModel },
      );
      setExplanation(exp);
    } finally {
      setExplainBusy(false);
    }
  }
  // Live elapsed timer — Date.now() must not run during render.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (finished || isComplete) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [finished, isComplete]);
  const elapsed = Math.round(
    ((job.endedAt ?? (now || job.startedAt)) - job.startedAt) / 1000,
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-8 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Capture job
          </p>
          <h2 className="mt-2 text-xl font-medium tracking-tight text-zinc-900">
            {finished ? "Capture halted" : isComplete ? "Capture complete" : "Rendering in progress"}
          </h2>
        </div>
        <span className="font-mono text-[12px] text-zinc-400">
          {job.id.slice(-8)} · {elapsed}s
        </span>
      </div>

      {finished && job.error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50/60 p-4">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-red-900">{job.error}</p>
              {job.errorCode === "missing-service" && (
                <div className="mt-3 space-y-2 text-[12px] leading-5 text-red-800">
                  <p>
                    URL capture renders through the self-hosted capture service
                    (the open-source ScreenshotOne replacement in this repo).
                    Configure it in the project&apos;s Keys / API keys tab:
                  </p>
                  <pre className="rounded-md bg-white/70 px-3 py-2 font-mono text-[11px]">
                    CAPTURE_SERVICE_URL=http://localhost:8080
                    CAPTURE_SERVICE_API_KEY=…
                  </pre>
                  <p>
                    Start it with <span className="font-mono">docker compose up
                    --build capture-service</span> — see the /api page.
                  </p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void explainError(false)}
                  disabled={explainBusy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 transition-colors hover:border-red-400 hover:bg-red-50 disabled:opacity-50"
                >
                  {explainBusy && !explainModel ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Lightbulb className="size-3.5" />
                  )}
                  {explainBusy && !explainModel ? "Explaining…" : "Explain this error"}
                </button>
                <button
                  onClick={() => void explainError(true)}
                  disabled={explainBusy || !nlp.capability().modelId}
                  title={
                    nlp.capability().modelId
                      ? "Ask the on-device model (Qwen2.5-0.5B @ 2-bit, ~415MB download)"
                      : "This device can't run the on-device model — rule explanations only"
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 transition-colors hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {explainBusy && explainModel ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {explainBusy && explainModel ? "Thinking on-device…" : "Explain in detail"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {explanation && (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-zinc-900">{explanation.summary}</p>
            <span className="ml-auto shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              {explanation.engine === "model"
                ? "on-device model"
                : explanation.engine === "rule"
                  ? "instant guide"
                  : "guide + fallback"}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] leading-5 text-zinc-600">{explanation.cause}</p>
          <ol className="mt-3 space-y-1.5">
            {explanation.steps.map((s, i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-[12.5px] leading-5 text-zinc-700">
                <span className="grid size-4 shrink-0 place-items-center rounded-full bg-zinc-900 font-mono text-[10px] font-medium text-white">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          {explanation.tip && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
              {explanation.tip}
            </p>
          )}
        </div>
      )}

      <ol className="mt-8 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {job.stages.map((stage) => {
          const active = stage.state === "active";
          const done = stage.state === "done";
          return (
            <li key={stage.name} className={cn("px-5 py-3", !active && !done && "opacity-50")}>
              <div className="flex items-center gap-3">
                <span className="grid w-5 place-items-center">
                  <StageIcon state={stage.state} />
                </span>
                <span className="flex-1 text-[13px] font-medium text-zinc-800">
                  {stage.name.replace(/-/g, " ")}
                </span>
                {stage.durationMs > 0 && (
                  <span className="font-mono text-[11px] text-zinc-400">
                    {(stage.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {stage.warnings.length > 0 && (
                  <TriangleAlert className="size-3.5 text-amber-600" />
                )}
              </div>
              {(stage.diagnostics.length > 0 || stage.warnings.length > 0) && (
                <div className="ml-8 mt-1.5 space-y-0.5">
                  {stage.diagnostics.map((d, i) => (
                    <p key={`d-${i}`} className="font-mono text-[11px] leading-5 text-zinc-500">
                      {d}
                    </p>
                  ))}
                  {stage.warnings.map((w, i) => (
                    <p key={`w-${i}`} className="flex items-center gap-1.5 text-[11px] leading-5 text-amber-700">
                      <TriangleAlert className="size-3 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {(finished || isComplete) && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={onNew}
            className="rounded-md bg-zinc-900 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-zinc-700"
          >
            New capture
          </button>
        </div>
      )}
      {!finished && !isComplete && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={onCancel}
            className="rounded-md border border-zinc-300 px-3.5 py-1.5 text-[12px] font-medium text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600"
          >
            Cancel capture
          </button>
        </div>
      )}
    </div>
  );
}
