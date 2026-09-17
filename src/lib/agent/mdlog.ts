/**
 * stitaP MDLog — Agent Markdown Bus + Execution Journal
 *
 * Two jobs:
 *
 * 1. MarkdownBus — agents communicate ONLY through markdown files: structured
 *    messages in per-project channels with @mentions, threading by subject,
 *    and a compact unread digest so an SLM worker can catch up on what its
 *    teammates reported. Messages render as real markdown documents.
 *
 * 2. ExecutionJournal — every time an agent executes a file/tool, a detailed
 *    record is kept: input, output summary, duration, status, and the
 *    benchmark verdict against the project's acceptance criteria. The journal
 *    renders to readable markdown so a human (or a later agent) can audit
 *    exactly what ran, why, and whether it met the bar.
 */

// ─── Markdown Bus ─────────────────────────────────────────────────────────────

export interface MdMessage {
  id: string;
  channel: string;
  from: string;
  subject: string;
  body: string; // full markdown body
  mentions: string[];
  threadOf?: string;
  at: string;
  readBy: Set<string>;
}

let seq = 0;

export class MarkdownBus {
  private messages: MdMessage[] = [];

  post(channel: string, from: string, subject: string, body: string, opts?: { mentions?: string[]; threadOf?: string }): MdMessage {
    const msg: MdMessage = {
      id: `md-${Date.now().toString(36)}-${++seq}`,
      channel,
      from,
      subject,
      body,
      mentions: opts?.mentions ?? extractMentions(body),
      ...(opts?.threadOf ? { threadOf: opts.threadOf } : {}),
      at: new Date().toISOString(),
      readBy: new Set(),
    };
    this.messages.push(msg);
    return msg;
  }

  /** Full markdown document of one message — the "file" an agent reads. */
  render(id: string): string {
    const m = this.messages.find((x) => x.id === id);
    if (!m) return "";
    return [
      `# ${m.subject}`,
      ``,
      `- **Channel:** ${m.channel}`,
      `- **From:** ${m.from}`,
      `- **At:** ${m.at}`,
      m.threadOf ? `- **Thread:** ${m.threadOf}` : "",
      m.mentions.length ? `- **Mentions:** ${m.mentions.join(", ")}` : "",
      ``,
      m.body,
    ].filter(Boolean).join("\n");
  }

  /** Unread digest for one agent: token-efficient catch-up block. */
  inbox(agent: string, channels?: string[], limit = 20): Array<{ id: string; channel: string; from: string; subject: string }> {
    return this.messages
      .filter((m) => !channels || channels.includes(m.channel))
      .filter((m) => m.from !== agent && !m.readBy.has(agent))
      .slice(-limit)
      .map(({ id, channel, from, subject }) => ({ id, channel, from, subject }));
  }

  markRead(agent: string, ids: string[]): number {
    let n = 0;
    for (const id of ids) {
      const m = this.messages.find((x) => x.id === id);
      if (m && m.from !== agent && !m.readBy.has(agent)) { m.readBy.add(agent); n++; }
    }
    return n;
  }

  thread(threadId: string): MdMessage[] {
    const root = this.messages.find((m) => m.id === threadId);
    if (!root) return [];
    return [root, ...this.messages.filter((m) => m.threadOf === threadId)];
  }

  search(query: string): MdMessage[] {
    const q = query.toLowerCase();
    return this.messages.filter((m) => m.subject.toLowerCase().includes(q) || m.body.toLowerCase().includes(q));
  }
}

export function extractMentions(body: string): string[] {
  return [...new Set([...body.matchAll(/@([\w.-]+)/g)].map((m) => m[1]))];
}

// ─── Execution Journal ────────────────────────────────────────────────────────

export interface JournalEntry {
  id: string;
  runId?: string;
  agent: string;
  target: string; // file path or tool id executed
  action: string;
  inputSummary: string;
  outputSummary: string;
  status: "ok" | "failed";
  durationMs: number;
  benchmark?: { name: string; passed: boolean; score: number; threshold: number };
  error?: string;
  at: string;
}

export class ExecutionJournal {
  private entries: JournalEntry[] = [];

  record(input: Omit<JournalEntry, "id" | "at">): JournalEntry {
    const e: JournalEntry = {
      ...input,
      id: `log-${Date.now().toString(36)}-${++seq}`,
      at: new Date().toISOString(),
    };
    this.entries.push(e);
    return e;
  }

  forRun(runId: string): JournalEntry[] { return this.entries.filter((e) => e.runId === runId); }
  forTarget(target: string): JournalEntry[] { return this.entries.filter((e) => e.target === target); }

  /** Did every recorded execution against `target` pass its benchmark? */
  benchmarkVerdict(target: string): { total: number; passed: number; allPassed: boolean } {
    const rel = this.entries.filter((e) => e.target === target && e.benchmark);
    return {
      total: rel.length,
      passed: rel.filter((e) => e.benchmark!.passed).length,
      allPassed: rel.length > 0 && rel.every((e) => e.benchmark!.passed),
    };
  }

  /**
   * Human-readable audit document: the artifact you read later to understand
   * which logical framework solved your problem and whether it worked.
   */
  renderMarkdown(opts?: { runId?: string; limit?: number }): string {
    let rows = opts?.runId ? this.forRun(opts.runId) : this.entries;
    if (opts?.limit) rows = rows.slice(-opts.limit);
    if (!rows.length) return "_No executions recorded._";
    const lines = ["# Execution Journal", "", "| Time | Agent | Target | Action | Status | ms | Benchmark |", "|---|---|---|---|---|---|---|"];
    for (const e of rows) {
      lines.push(`| ${e.at} | ${e.agent} | \`${e.target}\` | ${e.action} | ${e.status === "ok" ? "✅" : "❌"} | ${e.durationMs} | ${e.benchmark ? `${e.benchmark.passed ? "PASS" : "FAIL"} ${e.benchmark.score}/${e.benchmark.threshold} (${e.benchmark.name})` : "—"} |`);
      if (e.error) lines.push(`| | | ⚠ ${e.error} | | | | |`);
    }
    return lines.join("\n");
  }

  stats(): { total: number; failed: number; benchmarksRun: number; benchmarksPassed: number } {
    const b = this.entries.filter((e) => e.benchmark);
    return {
      total: this.entries.length,
      failed: this.entries.filter((e) => e.status === "failed").length,
      benchmarksRun: b.length,
      benchmarksPassed: b.filter((e) => e.benchmark!.passed).length,
    };
  }
}

let busSingleton: MarkdownBus | undefined;
let journalSingleton: ExecutionJournal | undefined;

export function getMarkdownBus(): MarkdownBus {
  busSingleton ??= new MarkdownBus();
  return busSingleton;
}
export function getJournal(): ExecutionJournal {
  journalSingleton ??= new ExecutionJournal();
  return journalSingleton;
}
