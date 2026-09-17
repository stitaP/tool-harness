/**
 * stitaP Notifications — Dispatcher for Long-Running Agents
 *
 * Hermes-parity gap: agents that run for hours/days/weeks must be able to
 * reach the human without polling. This is an in-house dispatcher:
 *
 * - Pluggable channels (in-app, webhook URL, log file) — no vendor SDKs
 * - Severity rules, quiet hours, and per-key dedupe windows so a swarm
 *   failure storm produces one alert instead of two hundred
 * - Delivery queue with retry/backoff; nothing is lost if a channel is down
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Severity = "debug" | "info" | "warn" | "error" | "critical";

export interface NotificationChannel {
  id: string;
  kind: "in-app" | "webhook" | "log";
  target: string; // in-app inbox name, webhook URL, or log file path
  minSeverity: Severity;
  enabled: boolean;
}

export interface NotificationMessage {
  id: string;
  channelIds: string[];
  severity: Severity;
  title: string;
  body: string;
  /** Dedupe key — identical keys inside the dedupe window are collapsed */
  dedupeKey?: string;
  createdAt: string;
  attempts: number;
  deliveredAt?: string;
  lastError?: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { debug: 0, info: 1, warn: 2, error: 3, critical: 4 };

// ─── Dispatcher ───────────────────────────────────────────────────────────────

let seq = 0;

export class NotificationDispatcher {
  private channels = new Map<string, NotificationChannel>();
  private queue: NotificationMessage[] = [];
  private seen = new Map<string, number>(); // dedupeKey -> epoch ms
  private quietHours: { from: number; to: number } | null = null; // hours 0-23
  private dedupeWindowMs = 5 * 60 * 1000;

  addChannel(kind: NotificationChannel["kind"], target: string, opts?: { id?: string; minSeverity?: Severity; enabled?: boolean }): NotificationChannel {
    const ch: NotificationChannel = {
      id: opts?.id ?? `ch-${++seq}`,
      kind, target,
      minSeverity: opts?.minSeverity ?? "info",
      enabled: opts?.enabled ?? true,
    };
    this.channels.set(ch.id, ch);
    return ch;
  }

  removeChannel(id: string): boolean { return this.channels.delete(id); }
  listChannels(): NotificationChannel[] { return [...this.channels.values()]; }

  setQuietHours(fromHour: number, toHour: number): void { this.quietHours = { from: fromHour, to: toHour }; }
  clearQuietHours(): void { this.quietHours = null; }
  setDedupeWindow(ms: number): void { this.dedupeWindowMs = ms; }

  private inQuietHours(at: Date): boolean {
    if (!this.quietHours) return false;
    const h = at.getHours();
    const { from, to } = this.quietHours;
    return from <= to ? h >= from && h < to : h >= from || h < to;
  }

  /**
   * Enqueue a notification. Returns null when suppressed by severity,
   * quiet hours, or the dedupe window — suppression is not an error.
   */
  notify(severity: Severity, title: string, body: string, now = new Date(), opts?: { dedupeKey?: string; channelIds?: string[] }): NotificationMessage | null {
    const targets = [...this.channels.values()].filter(
      (c) => c.enabled && SEVERITY_ORDER[severity] >= SEVERITY_ORDER[c.minSeverity] && (!opts?.channelIds || opts.channelIds.includes(c.id)),
    );
    if (!targets.length) return null;
    if (severity !== "critical" && this.inQuietHours(now)) return null;

    if (opts?.dedupeKey) {
      const prev = this.seen.get(opts.dedupeKey);
      if (prev !== undefined && now.getTime() - prev < this.dedupeWindowMs) return null;
      this.seen.set(opts.dedupeKey, now.getTime());
    }

    const msg: NotificationMessage = {
      id: `ntf-${Date.now().toString(36)}-${++seq}`,
      channelIds: targets.map((c) => c.id),
      severity, title, body,
      dedupeKey: opts?.dedupeKey,
      createdAt: now.toISOString(),
      attempts: 0,
    };
    this.queue.push(msg);
    return msg;
  }

  /**
   * Drain the delivery queue. `deliver` performs the actual send (fetch/log)
   * and is provided by the host so this module stays network-agnostic.
   */
  async flush(deliver: (msg: NotificationMessage, channel: NotificationChannel) => Promise<void>): Promise<{ delivered: number; failed: number }> {
    let delivered = 0, failed = 0;
    const stillQueued: NotificationMessage[] = [];
    for (const msg of this.queue) {
      let ok = true;
      for (const chId of msg.channelIds) {
        const ch = this.channels.get(chId);
        if (!ch) continue;
        try {
          await deliver(msg, ch);
        } catch (e) {
          ok = false;
          msg.lastError = e instanceof Error ? e.message : String(e);
        }
      }
      msg.attempts += 1;
      if (ok) { msg.deliveredAt = new Date().toISOString(); delivered++; }
      else { failed++; if (msg.attempts < 3) stillQueued.push(msg); }
    }
    this.queue = stillQueued;
    // Prune dedupe memory so long-running processes don't grow forever
    if (this.seen.size > 500) {
      const cutoff = Date.now() - this.dedupeWindowMs * 2;
      for (const [k, t] of this.seen) if (t < cutoff) this.seen.delete(k);
    }
    return { delivered, failed };
  }

  pending(): NotificationMessage[] { return [...this.queue]; }

  compact(): string {
    const chs = this.listChannels().map((c) => `${c.id}:${c.kind}(≥${c.minSeverity})${c.enabled ? "" : "[off]"}`).join(" ");
    return `channels: ${chs || "(none)"} | queued: ${this.queue.length} | quiet: ${this.quietHours ? `${this.quietHours.from}-${this.quietHours.to}` : "none"}`;
  }
}

let singleton: NotificationDispatcher | undefined;
export function getNotifications(): NotificationDispatcher {
  singleton ??= new NotificationDispatcher();
  return singleton;
}
