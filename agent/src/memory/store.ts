/**
 * Bounded, curated memory: MEMORY.md (agent notes: environment, conventions,
 * lessons) and USER.md (who the user is, preferences). Snapshotted into the
 * system prompt at session start; edited through the `memory` tool.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type MemTarget = "memory" | "user";

export class MemoryStore {
  constructor(private dir: string, private limits: () => { memory_chars: number; user_chars: number }) {
    mkdirSync(dir, { recursive: true });
  }
  private file(t: MemTarget) { return join(this.dir, t === "user" ? "USER.md" : "MEMORY.md"); }
  limit(t: MemTarget) { const l = this.limits(); return t === "user" ? l.user_chars : l.memory_chars; }

  entries(t: MemTarget): string[] {
    const f = this.file(t);
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()).filter(Boolean);
  }

  private save(t: MemTarget, entries: string[]) {
    const title = t === "user" ? "# User profile" : "# Agent memory";
    writeFileSync(this.file(t), `${title}\n\n${entries.map((e) => `- ${e.replace(/\s*\n\s*/g, " ")}`).join("\n")}\n`);
  }

  size(t: MemTarget) { return this.entries(t).reduce((n, e) => n + e.length + 3, 0); }

  add(t: MemTarget, content: string): string {
    const c = content.trim().replace(/\s*\n\s*/g, " ");
    if (!c) throw new Error("content is empty");
    const es = this.entries(t);
    if (es.some((e) => e.toLowerCase() === c.toLowerCase())) return "already remembered";
    const after = this.size(t) + c.length + 3;
    if (after > this.limit(t)) {
      throw new Error(`${t} is full (${this.size(t)}/${this.limit(t)} chars). Consolidate first: use action=replace to merge related entries or action=remove for stale ones, then add again.`);
    }
    es.push(c);
    this.save(t, es);
    return `added (${after}/${this.limit(t)} chars used)`;
  }

  replace(t: MemTarget, oldText: string, content: string): string {
    const es = this.entries(t);
    const i = es.findIndex((e) => e.includes(oldText.trim()));
    if (i < 0) throw new Error(`no ${t} entry contains "${oldText}"`);
    const next = [...es];
    next[i] = content.trim().replace(/\s*\n\s*/g, " ");
    const size = next.reduce((n, e) => n + e.length + 3, 0);
    if (size > this.limit(t)) throw new Error(`replacement would exceed the ${t} limit (${size}/${this.limit(t)})`);
    this.save(t, next);
    return `replaced (${size}/${this.limit(t)} chars used)`;
  }

  remove(t: MemTarget, oldText: string): string {
    const es = this.entries(t);
    const next = es.filter((e) => !e.includes(oldText.trim()));
    if (next.length === es.length) throw new Error(`no ${t} entry contains "${oldText}"`);
    this.save(t, next);
    return `removed ${es.length - next.length} entr${es.length - next.length === 1 ? "y" : "ies"}`;
  }

  snapshot(): string {
    const m = this.entries("memory"), u = this.entries("user");
    const parts: string[] = [];
    if (u.length) parts.push(`## About the user (USER.md)\n${u.map((e) => `- ${e}`).join("\n")}`);
    if (m.length) parts.push(`## Your memory (MEMORY.md)\n${m.map((e) => `- ${e}`).join("\n")}`);
    return parts.join("\n\n");
  }
}
