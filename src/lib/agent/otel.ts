/**
 * stitaP OpenTelemetry-Compatible Observability
 *
 * Implements AutoGen v0.4's observability and debugging features.
 * Provides tracking, tracing, and debugging for agent interactions
 * with OpenTelemetry compatibility for industry-standard observability.
 *
 * Key features:
 * - Distributed tracing with spans
 * - Metrics collection (counters, histograms, gauges)
 * - Structured logging with correlation
 * - Export to OTel-compatible backends (Jaeger, Zipkin, Grafana)
 * - Real-time debugging dashboard
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
export type MetricType = "counter" | "histogram" | "gauge";

export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: string;
  endTime?: string;
  status: "OK" | "ERROR" | "UNSET";
  attributes: Record<string, string | number | boolean>;
  events: OtelEvent[];
  resource: OtelResource;
}

export interface OtelEvent {
  name: string;
  timestamp: string;
  attributes: Record<string, string | number | boolean>;
}

export interface OtelResource {
  "service.name": string;
  "service.version": string;
  "agent.id": string;
  "agent.role": string;
  [key: string]: string;
}

export interface OtelMetric {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: string;
}

export interface OtelLog {
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  traceId?: string;
  spanId?: string;
  attributes: Record<string, unknown>;
}

export interface OtelExporter {
  exportSpans(spans: OtelSpan[]): Promise<void>;
  exportMetrics(metrics: OtelMetric[]): Promise<void>;
  exportLogs(logs: OtelLog[]): Promise<void>;
}

// ─── Tracer ─────────────────────────────────────────────────────────────────

export class OtelTracer {
  private spans: OtelSpan[] = [];
  private activeSpans = new Map<string, OtelSpan>();
  private resource: OtelResource;
  private exporters: OtelExporter[] = [];

  constructor(resource: OtelResource) {
    this.resource = resource;
  }

  /** Add an exporter */
  addExporter(exporter: OtelExporter): void {
    this.exporters.push(exporter);
  }

  /** Start a new span */
  startSpan(
    name: string,
    kind: SpanKind = "internal",
    parentSpanId?: string,
    attributes: Record<string, string | number | boolean> = {},
  ): string {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const traceId = parentSpanId
      ? this.spans.find((s) => s.spanId === parentSpanId)?.traceId ?? spanId
      : spanId;

    const span: OtelSpan = {
      traceId,
      spanId,
      parentSpanId,
      name,
      kind,
      startTime: new Date().toISOString(),
      status: "UNSET",
      attributes: { ...attributes },
      events: [],
      resource: this.resource,
    };

    this.spans.push(span);
    this.activeSpans.set(spanId, span);
    return spanId;
  }

  /** End a span */
  endSpan(spanId: string, status: "OK" | "ERROR" = "OK"): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = new Date().toISOString();
    span.status = status;
    this.activeSpans.delete(spanId);

    // Export if we have exporters
    if (this.exporters.length > 0) {
      void Promise.all(this.exporters.map((e) => e.exportSpans([span])));
    }
  }

  /** Add an event to a span */
  addEvent(
    spanId: string,
    name: string,
    attributes: Record<string, string | number | boolean> = {},
  ): void {
    const span = this.activeSpans.get(spanId) ?? this.spans.find((s) => s.spanId === spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes,
    });
  }

  /** Set span attributes */
  setAttributes(
    spanId: string,
    attributes: Record<string, string | number | boolean>,
  ): void {
    const span = this.activeSpans.get(spanId) ?? this.spans.find((s) => s.spanId === spanId);
    if (!span) return;

    Object.assign(span.attributes, attributes);
  }

  /** Get all spans */
  getSpans(filter?: { traceId?: string; agentId?: string }): OtelSpan[] {
    let result = this.spans;
    if (filter?.traceId) result = result.filter((s) => s.traceId === filter.traceId);
    if (filter?.agentId) {
      result = result.filter((s) => s.resource["agent.id"] === filter.agentId);
    }
    return result;
  }

  /** Get a trace (all spans for a traceId) */
  getTrace(traceId: string): OtelSpan[] {
    return this.spans
      .filter((s) => s.traceId === traceId)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /** Flush all pending spans */
  async flush(): Promise<void> {
    if (this.exporters.length > 0 && this.spans.length > 0) {
      await Promise.all(this.exporters.map((e) => e.exportSpans(this.spans)));
    }
  }
}

// ─── Metrics Collector ──────────────────────────────────────────────────────

export class OtelMetrics {
  private metrics: OtelMetric[] = [];
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private gauges = new Map<string, number>();
  private exporters: OtelExporter[] = [];

  addExporter(exporter: OtelExporter): void {
    this.exporters.push(exporter);
  }

  /** Increment a counter */
  counter(name: string, value = 1, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);

    this.metrics.push({
      name,
      type: "counter",
      value: this.counters.get(key)!,
      labels,
      timestamp: new Date().toISOString(),
    });
  }

  /** Record a histogram value */
  histogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);

    this.metrics.push({
      name,
      type: "histogram",
      value,
      labels,
      timestamp: new Date().toISOString(),
    });
  }

  /** Set a gauge value */
  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.gauges.set(key, value);

    this.metrics.push({
      name,
      type: "gauge",
      value,
      labels,
      timestamp: new Date().toISOString(),
    });
  }

  /** Get aggregated metrics */
  getAggregated(): Record<string, { count: number; sum: number; avg: number; min: number; max: number }> {
    const result: Record<string, { count: number; sum: number; avg: number; min: number; max: number }> = {};

    for (const [key, values] of this.histograms) {
      const name = key.split(":")[0];
      result[name] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }

    return result;
  }

  /** Export metrics */
  async export(): Promise<void> {
    if (this.exporters.length > 0 && this.metrics.length > 0) {
      await Promise.all(this.exporters.map((e) => e.exportMetrics(this.metrics)));
    }
  }
}

// ─── Structured Logger ──────────────────────────────────────────────────────

export class OtelLogger {
  private logs: OtelLog[] = [];
  private exporters: OtelExporter[] = [];
  private minLevel: OtelLog["level"] = "INFO";

  constructor(minLevel: OtelLog["level"] = "INFO") {
    this.minLevel = minLevel;
  }

  addExporter(exporter: OtelExporter): void {
    this.exporters.push(exporter);
  }

  private shouldLog(level: OtelLog["level"]): boolean {
    const levels: OtelLog["level"][] = ["DEBUG", "INFO", "WARN", "ERROR"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private log(level: OtelLog["level"], message: string, attributes: Record<string, unknown> = {}, traceId?: string, spanId?: string): void {
    if (!this.shouldLog(level)) return;

    const entry: OtelLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      traceId,
      spanId,
      attributes,
    };

    this.logs.push(entry);

    // Console output
    const prefix = `[${entry.timestamp}] [${level}]`;
    if (level === "ERROR") {
      console.error(prefix, message, attributes);
    } else if (level === "WARN") {
      console.warn(prefix, message, attributes);
    } else {
      console.log(prefix, message, attributes);
    }

    // Export
    if (this.exporters.length > 0) {
      void Promise.all(this.exporters.map((e) => e.exportLogs([entry])));
    }
  }

  debug(message: string, attributes?: Record<string, unknown>, traceId?: string, spanId?: string): void {
    this.log("DEBUG", message, attributes, traceId, spanId);
  }

  info(message: string, attributes?: Record<string, unknown>, traceId?: string, spanId?: string): void {
    this.log("INFO", message, attributes, traceId, spanId);
  }

  warn(message: string, attributes?: Record<string, unknown>, traceId?: string, spanId?: string): void {
    this.log("WARN", message, attributes, traceId, spanId);
  }

  error(message: string, attributes?: Record<string, unknown>, traceId?: string, spanId?: string): void {
    this.log("ERROR", message, attributes, traceId, spanId);
  }

  /** Get logs */
  getLogs(filter?: { level?: OtelLog["level"]; traceId?: string; limit?: number }): OtelLog[] {
    let result = this.logs;
    if (filter?.level) result = result.filter((l) => l.level === filter.level);
    if (filter?.traceId) result = result.filter((l) => l.traceId === filter.traceId);
    if (filter?.limit) result = result.slice(-filter.limit);
    return result;
  }
}

// ─── Console Exporter (for development) ─────────────────────────────────────

export class ConsoleExporter implements OtelExporter {
  async exportSpans(spans: OtelSpan[]): Promise<void> {
    for (const span of spans) {
      console.log(`[TRACE] ${span.name} (${span.status}) ${span.startTime} → ${span.endTime ?? "ongoing"}`);
    }
  }

  async exportMetrics(metrics: OtelMetric[]): Promise<void> {
    for (const metric of metrics) {
      console.log(`[METRIC] ${metric.name} = ${metric.value} (${metric.type})`);
    }
  }

  async exportLogs(logs: OtelLog[]): Promise<void> {
    for (const log of logs) {
      console.log(`[LOG] [${log.level}] ${log.message}`);
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createObservabilityStack(serviceName: string, agentId: string, agentRole: string) {
  const resource: OtelResource = {
    "service.name": serviceName,
    "service.version": "1.0.0",
    "agent.id": agentId,
    "agent.role": agentRole,
  };

  const tracer = new OtelTracer(resource);
  const metrics = new OtelMetrics();
  const logger = new OtelLogger("INFO");

  // Add console exporter for development
  const consoleExporter = new ConsoleExporter();
  tracer.addExporter(consoleExporter);
  metrics.addExporter(consoleExporter);
  logger.addExporter(consoleExporter);

  return { tracer, metrics, logger, resource };
}
