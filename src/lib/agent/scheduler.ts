/**
 * stitaP Scheduler — Scheduled Agent Automations
 *
 * Hermes-parity gap: long-running agents need recurring work (nightly audits,
 * hourly syncs, weekly reports) without a human poking the session.
 *
 * Cron support is a deliberate subset ("cron-lite"): minute hour dom month dow
 * with `*`, lists, ranges and steps — enough for real automations, small enough
 * to stay SLM-explainable. Jobs are pure declarations; execution is delegated
 * to whatever runner the host provides (kanban task, swarm spawn, tool call),
 * so this module never owns processes it can't supervise.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleKind = "interval" | "cron" | "once";

export interface ScheduleJob {
  id: string;
  name: string;
  kind: ScheduleKind;
  /** Interval seconds (kind=interval), cron expression (kind=cron), ISO time (kind=once) */
  spec: string;
  /** Tool id + input executed when the job fires */
  action: { toolId: string; input: Record<string, unknown> };
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt: string;
  /** Consecutive failure count — jobs fail-silent after maxFailures unless reset */
  failureCount: number;
  maxFailures: number;
  runLog: Array<{ at: string; ok: boolean; durationMs: number; error?: string }>;
}

// ─── Cron-lite parser ─────────────────────────────────────────────────────────

/** Expand one cron field (star-slash-15, 1-5, 1,30, star, 5) into matched values. */
export function expandCronField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    let body = part;
    let step = 1;
    if (part.includes("/")) {
      const [b, s] = part.split("/");
      body = b;
      step = Number(s);
      if (!Number.isFinite(step) || step < 1) return null;
    }
    let lo = min, hi = max;
    if (body !== "*") {
      if (body.includes("-")) {
        const [a, b2] = body.split("-").map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b2)) return null;
        lo = a; hi = b2;
      } else {
        lo = hi = Number(body);
        if (!Number.isFinite(lo)) return null;
      }
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size ? out : null;
}

export interface CronFields { minute: number; hour: number; dayOfMonth: number; month: number; dayOfWeek: number }

export function parseCron(expr: string): { fields: Array<Set<number>> } | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const ranges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const fields: Array<Set<number>> = [];
  for (let i = 0; i < 5; i++) {
    const set = expandCronField(parts[i], ranges[i][0], ranges[i][1]);
    if (!set) return null;
    fields.push(set);
  }
  return { fields };
}

export function cronMatches(f: { fields: Array<Set<number>> }, d: Date): boolean {
  // Standard cron semantics: when both dom and dow are restricted, either may match (POSIX quirk)
  const domOk = f.fields[2].has(d.getDate());
  const dowOk = f.fields[4].has(d.getDay());
  return (
    dayCheck(f, domOk, dowOk) &&
    f.fields[0].has(d.getMinutes()) &&
    f.fields[1].has(d.getHours()) &&
    f.fields[3].has(d.getMonth() + 1)
  );
}

function dayCheck(f: { fields: Array<Set<number>> }, domOk: boolean, dowOk: boolean): boolean {
  const domRestricted = !isFullRange(f.fields[2], 1, 31);
  const dowRestricted = !isFullRange(f.fields[4], 0, 6);
  if (domRestricted && dowRestricted) return domOk || dowOk; // POSIX quirk
  return domOk && dowOk;
}

function isFullRange(set: Set<number>, min: number, max: number): boolean {
  if (set.size !== max - min + 1) return false;
  for (let i = min; i <= max; i++) if (!set.has(i)) return false;
  return true;
}

/** Compute the next fire time after `from` by scanning forward minute-by-minute (max 366 days). */
export function nextCronFire(expr: string, from: Date): Date | null {
  const parsed = parseCron(expr);
  if (!parsed) return null;
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const limit = new Date(from.getTime() + 366 * 24 * 3600 * 1000);
  while (t <= limit) {
    if (cronMatches(parsed, t)) return new Date(t.getTime());
    t.setMinutes(t.getMinutes() + 1);
  }
  return null;
}

// ─── Manager ──────────────────────────────────────────────────────────────────

let seq = 0;
function nextId(): string {
  seq += 1;
  return `job-${Date.now().toString(36)}-${seq}`;
}

export class Scheduler {
  private jobs = new Map<string, ScheduleJob>();

  add(name: string, kind: ScheduleKind, spec: string, action: ScheduleJob["action"], now = new Date(), opts?: { maxFailures?: number }): ScheduleJob | { error: string } {
    const nextRunAt = this.computeNext(kind, spec, now);
    if (!nextRunAt) return { error: `Invalid ${kind} spec: ${spec}` };
    const job: ScheduleJob = {
      id: nextId(), name, kind, spec, action, enabled: true,
      createdAt: now.toISOString(), nextRunAt: nextRunAt.toISOString(),
      failureCount: 0, maxFailures: opts?.maxFailures ?? 5, runLog: [],
    };
    this.jobs.set(job.id, job);
    return job;
  }

  private computeNext(kind: ScheduleKind, spec: string, now: Date): Date | null {
    if (kind === "interval") {
      const secs = Number(spec);
      if (!Number.isFinite(secs) || secs < 1) return null;
      return new Date(now.getTime() + secs * 1000);
    }
    if (kind === "cron") return nextCronFire(spec, now);
    const once = new Date(spec);
    return Number.isNaN(once.getTime()) ? null : once;
  }

  remove(id: string): boolean { return this.jobs.delete(id); }
  get(id: string): ScheduleJob | undefined { return this.jobs.get(id); }
  list(): ScheduleJob[] { return [...this.jobs.values()].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)); }

  enable(id: string, on: boolean): boolean {
    const j = this.jobs.get(id);
    if (!j) return false;
    j.enabled = on;
    return true;
  }

  /** Return every enabled job whose nextRunAt has passed, advancing their schedule. */
  dueJobs(now = new Date()): ScheduleJob[] {
    const due: ScheduleJob[] = [];
    for (const j of this.jobs.values()) {
      if (!j.enabled || j.failureCount >= j.maxFailures) continue;
      if (new Date(j.nextRunAt).getTime() <= now.getTime()) {
        due.push(j);
        const next = this.computeNext(j.kind, j.spec, now);
        j.nextRunAt = (j.kind === "once" ? undefined : next)?.toISOString() ?? "done";
        if (j.kind === "once") j.enabled = false;
      }
    }
    return due.sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
  }

  /** Record an outcome returned by the host runner. */
  recordResult(id: string, ok: boolean, durationMs: number, error?: string): boolean {
    const j = this.jobs.get(id);
    if (!j) return false;
    j.lastRunAt = new Date().toISOString();
    j.failureCount = ok ? 0 : j.failureCount + 1;
    j.runLog.unshift({ at: j.lastRunAt, ok, durationMs, ...(error ? { error } : {}) });
    if (j.runLog.length > 50) j.runLog.length = 50;
    return true;
  }

  compact(jobs = this.list()): string {
    return jobs.map((j) =>
      `${j.enabled ? "ON " : "OFF"} [${j.id}] ${j.name} (${j.kind}:${j.spec}) next=${j.nextRunAt} fails=${j.failureCount}/${j.maxFailures}`
    ).join("\n") || "(no scheduled jobs)";
  }
}

let singleton: Scheduler | undefined;
export function getScheduler(): Scheduler {
  singleton ??= new Scheduler();
  return singleton;
}
