/**
 * stitaP Tracing — Run Observability
 *
 * Hermes-parity gap: multi-tool agent runs were opaque — self-improve tracked
 * aggregate tool stats, but there was no per-run step journal to answer "what
 * exactly did the swarm do, in what order, costing how many tokens, and where
 * did it stall?". Spans form a tree per run; traces can be exported for
 * postmortems or replayed against skills.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpanStatus = "running" | "ok" | "error" | "cancelled";

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  toolId?: string;
  startedAt: string;
  endedAt?: string;
  status: SpanStatus;
  tokensIn: number;
  tokensOut: number;
  attributes: Record<string, string | number | boolean>;
  error?: string;
}

export interface AgentTrace {
  id: string;
  name: string;
  sessionId?: string;
  startedAt: string;
  endedAt?: string;
  status: SpanStatus;
  spans: TraceSpan[];
}

export interface TraceSummary {
  id: string;
  name: string;
  status: SpanStatus;
  durationMs: number;
  spanCount: number;
  errorCount: number;
  totalTokens: number;
}

// ─── Tracer ───────────────────────────────────────────────────────────────────

let seq = 0;

export class RunTracer {
  private traces = new Map<string, AgentTrace>();

  start(name: string, opts?: { sessionId?: string }): AgentTrace {
    const trace: AgentTrace = {
      id: `run-${Date.now().toString(36)}-${++seq}`,
      name,
      ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
      startedAt: new Date().toISOString(),
      status: "running",
      spans: [],
    };
    this.traces.set(trace.id, trace);
    return trace;
  }

  /** Open a span inside a trace. */
  span(traceId: string, name: string, opts?: { parentId?: string; toolId?: string; attributes?: Record<string, string | number | boolean> }): TraceSpan | null {
    const t = this.traces.get(traceId);
    if (!t) return null;
    const s: TraceSpan = {
      id: `${traceId}-s${t.spans.length + 1}`,
      ...(opts?.parentId ? { parentId: opts.parentId } : {}),
      name,
      ...(opts?.toolId ? { toolId: opts.toolId } : {}),
      startedAt: new Date().toISOString(),
      status: "running",
      tokensIn: 0,
      tokensOut: 0,
      attributes: opts?.attributes ?? {},
    };
    t.spans.push(s);
    return s;
  }

  /** Close a span with outcome and token accounting. */
  endSpan(span: TraceSpan, status: Exclude<SpanStatus, "running">, opts?: { tokensIn?: number; tokensOut?: number; error?: string; attributes?: Record<string, string | number | boolean> }): void {
    span.endedAt = new Date().toISOString();
    span.status = status;
    if (opts?.tokensIn) span.tokensIn = opts.tokensIn;
    if (opts?.tokensOut) span.tokensOut = opts.tokensOut;
    if (opts?.error) span.error = opts.error;
    if (opts?.attributes) Object.assign(span.attributes, opts.attributes);
  }

  finish(traceId: string, status: Exclude<SpanStatus, "running"> = "ok"): boolean {
    const t = this.traces.get(traceId);
    if (!t) return false;
    // Auto-close any spans left running so exports are always consistent
    for (const s of t.spans) if (s.status === "running") { s.endedAt = new Date().toISOString(); s.status = "cancelled"; }
    t.endedAt = new Date().toISOString();
    t.status = status;
    return true;
  }

  get(id: string): AgentTrace | undefined { return this.traces.get(id); }

  list(limit = 20): TraceSummary[] {
    return [...this.traces.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map((t) => {
        const end = t.endedAt ? Date.parse(t.endedAt) : Date.now();
        return {
          id: t.id, name: t.name, status: t.status,
          durationMs: Math.max(0, end - Date.parse(t.startedAt)),
          spanCount: t.spans.length,
          errorCount: t.spans.filter((s) => s.status === "error").length,
          totalTokens: t.spans.reduce((s, x) => s + x.tokensIn + x.tokensOut, 0),
        };
      });
  }

  /**
   * Human-readable waterfall for a single run — the artifact you attach to a
   * postmortem or a Jira comment.
   */
  renderWaterfall(traceId: string): string {
    const t = this.traces.get(traceId);
    if (!t) return "(trace not found)";
    const lines = [`RUN ${t.name} [${t.status}] ${t.startedAt}`];
    const dur = (s: TraceSpan) => (s.endedAt ? Math.max(0, Date.parse(s.endedAt) - Date.parse(s.startedAt)) : 0).toString().padStart(6);
    const depth = (s: TraceSpan) => {
      let d = 0, p = s.parentId;
      while (p) { d++; p = t.spans.find((x) => x.id === p)?.parentId; }
      return d;
    };
    for (const s of t.spans) {
      lines.push(`${"  ".repeat(depth(s))}└ ${s.name}${s.toolId ? ` (${s.toolId})` : ""} ${dur(s)}ms ${s.status}${s.tokensIn || s.tokensOut ? ` tok ${s.tokensIn}→${s.tokensOut}` : ""}${s.error ? ` ⚠ ${s.error}` : ""}`);
    }
    const tok = t.spans.reduce((a, s) => a + s.tokensIn + s.tokensOut, 0);
    lines.push(`TOTAL ${t.spans.length} spans, ~${tok} tokens`);
    return lines.join("\n");
  }

  prune(keep = 100): void {
    const all = [...this.traces.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    for (const t of all.slice(keep)) this.traces.delete(t.id);
  }
}

let singleton: RunTracer | undefined;
export function getTracer(): RunTracer {
  singleton ??= new RunTracer();
  return singleton;
}
