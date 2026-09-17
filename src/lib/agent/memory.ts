/**
 * Agent Persistent Memory
 *
 * Cross-session memory that survives conversation restarts.
 * Stores user preferences, project context, workflow patterns,
 * and learned facts. Designed for SLMs with compact retrieval.
 *
 * Memory types:
 * - user: preferences, name, communication style, tools they use
 * - project: codebase facts, architecture decisions, tech stack
 * - workflow: recurring patterns, common task sequences
 * - fact: general knowledge learned during interactions
 * - skill: extracted procedures from completed tasks
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemoryType = "user" | "project" | "workflow" | "fact" | "skill";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  /** Short key for dedup/lookup (e.g., "user.name", "project.framework") */
  key: string;
  /** The actual content — kept short for SLM consumption */
  content: string;
  /** Importance score 1-10 (higher = more important, injected first into context) */
  importance: number;
  /** Tags for filtering */
  tags: string[];
  /** When this memory was created */
  createdAt: string;
  /** When this memory was last accessed/confirmed */
  lastAccessedAt: string;
  /** How many times this memory has been accessed */
  accessCount: number;
  /** Confidence that this memory is still valid (decays over time) */
  confidence: number;
  /** Optional: source conversation/task ID */
  sourceId?: string;
  /** Optional: supporting evidence */
  evidence?: string[];
}

export interface MemoryStore {
  entries: MemoryEntry[];
  /** Maximum entries before summarisation/pruning */
  maxEntries: number;
  /** When the store was last summarised */
  lastSummarisedAt: string;
}

export interface MemoryQuery {
  type?: MemoryType;
  tags?: string[];
  keys?: string[];
  minImportance?: number;
  minConfidence?: number;
  search?: string;
  limit?: number;
}

export interface MemoryStats {
  totalEntries: number;
  byType: Record<MemoryType, number>;
  avgImportance: number;
  avgConfidence: number;
  oldestEntry: string;
  newestEntry: string;
  totalAccesses: number;
}

// ─── Memory Manager ───────────────────────────────────────────────────────────

export class AgentMemory {
  private store: MemoryStore;

  constructor(maxEntries = 500) {
    this.store = {
      entries: [],
      maxEntries,
      lastSummarisedAt: new Date().toISOString(),
    };
  }

  /** Add or update a memory entry */
  add(entry: Omit<MemoryEntry, "id" | "createdAt" | "lastAccessedAt" | "accessCount" | "confidence">): MemoryEntry {
    // Check for existing entry with same key
    const existing = this.store.entries.find(e => e.key === entry.key && e.type === entry.type);

    if (existing) {
      // Update existing
      existing.content = entry.content;
      existing.importance = Math.max(existing.importance, entry.importance);
      existing.tags = [...new Set([...existing.tags, ...entry.tags])];
      existing.lastAccessedAt = new Date().toISOString();
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
      if (entry.evidence) {
        existing.evidence = [...new Set([...(existing.evidence || []), ...entry.evidence])];
      }
      return existing;
    }

    // Create new
    const newEntry: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: entry.type,
      key: entry.key,
      content: entry.content,
      importance: entry.importance,
      tags: entry.tags,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
      confidence: 1.0,
      sourceId: entry.sourceId,
      evidence: entry.evidence,
    };

    this.store.entries.push(newEntry);

    // Auto-prune if over limit
    if (this.store.entries.length > this.store.maxEntries) {
      this.prune();
    }

    return newEntry;
  }

  /** Retrieve memories matching a query */
  query(q: MemoryQuery): MemoryEntry[] {
    let results = [...this.store.entries];

    if (q.type) {
      results = results.filter(e => e.type === q.type);
    }
    if (q.tags && q.tags.length > 0) {
      results = results.filter(e => q.tags!.some(t => e.tags.includes(t)));
    }
    if (q.keys && q.keys.length > 0) {
      results = results.filter(e => q.keys!.includes(e.key));
    }
    if (q.minImportance !== undefined) {
      results = results.filter(e => e.importance >= q.minImportance!);
    }
    if (q.minConfidence !== undefined) {
      results = results.filter(e => e.confidence >= q.minConfidence!);
    }
    if (q.search) {
      const searchLower = q.search.toLowerCase();
      results = results.filter(e =>
        e.content.toLowerCase().includes(searchLower) ||
        e.key.toLowerCase().includes(searchLower) ||
        e.tags.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    // Sort by: importance * confidence * freshness
    results.sort((a, b) => {
      const scoreA = a.importance * a.confidence * this.freshnessScore(a);
      const scoreB = b.importance * b.confidence * this.freshnessScore(b);
      return scoreB - scoreA;
    });

    if (q.limit) {
      results = results.slice(0, q.limit);
    }

    // Mark as accessed
    for (const entry of results) {
      entry.accessCount++;
      entry.lastAccessedAt = new Date().toISOString();
    }

    return results;
  }

  /** Get memories formatted for SLM prompt injection (compact) */
  toSLMPrompt(maxTokens = 2000): string {
    const important = this.store.entries
      .filter(e => e.confidence > 0.3)
      .sort((a, b) => (b.importance * b.confidence) - (a.importance * a.confidence))
      .slice(0, 50);

    const lines: string[] = [];
    let charCount = 0;

    for (const entry of important) {
      const line = `[${entry.type}] ${entry.key}: ${entry.content}`;
      if (charCount + line.length > maxTokens * 4) break; // rough char estimate
      lines.push(line);
      charCount += line.length;
    }

    return lines.join("\n");
  }

  /** Get memories formatted as structured JSON (for tool output) */
  toJSON(): MemoryStore {
    return {
      ...this.store,
      entries: this.store.entries.map(e => ({ ...e })),
    };
  }

  /** Import from JSON */
  fromJSON(data: MemoryStore): void {
    this.store = {
      ...data,
      entries: data.entries.map(e => ({ ...e })),
    };
  }

  /** Get stats */
  stats(): MemoryStats {
    const entries = this.store.entries;
    const byType: Record<MemoryType, number> = { user: 0, project: 0, workflow: 0, fact: 0, skill: 0 };
    for (const e of entries) byType[e.type]++;

    return {
      totalEntries: entries.length,
      byType,
      avgImportance: entries.length > 0 ? entries.reduce((s, e) => s + e.importance, 0) / entries.length : 0,
      avgConfidence: entries.length > 0 ? entries.reduce((s, e) => s + e.confidence, 0) / entries.length : 0,
      oldestEntry: entries.length > 0 ? entries.reduce((o, e) => e.createdAt < o ? e.createdAt : o, entries[0].createdAt) : "",
      newestEntry: entries.length > 0 ? entries.reduce((n, e) => e.createdAt > n ? e.createdAt : n, entries[0].createdAt) : "",
      totalAccesses: entries.reduce((s, e) => s + e.accessCount, 0),
    };
  }

  /** Remove a memory by ID */
  remove(id: string): boolean {
    const idx = this.store.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this.store.entries.splice(idx, 1);
    return true;
  }

  /** Remove memories by key */
  removeByKey(key: string): number {
    const before = this.store.entries.length;
    this.store.entries = this.store.entries.filter(e => e.key !== key);
    return before - this.store.entries.length;
  }

  /** Decay confidence of old memories (call periodically) */
  decay(rate = 0.01): number {
    let decayed = 0;
    const now = Date.now();
    for (const entry of this.store.entries) {
      const ageDays = (now - new Date(entry.lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 7) {
        const decayAmount = rate * Math.floor(ageDays / 7);
        const newConf = Math.max(0.05, entry.confidence - decayAmount);
        if (newConf !== entry.confidence) {
          entry.confidence = newConf;
          decayed++;
        }
      }
    }
    return decayed;
  }

  /** Summarise and merge similar memories (SLM-friendly) */
  summarise(): { merged: number; removed: number } {
    let merged = 0;
    let removed = 0;

    // Group by type
    const byType = new Map<MemoryType, MemoryEntry[]>();
    for (const entry of this.store.entries) {
      if (!byType.has(entry.type)) byType.set(entry.type, []);
      byType.get(entry.type)!.push(entry);
    }

    for (const [, entries] of byType) {
      // Find entries with very similar keys
      const keyGroups = new Map<string, MemoryEntry[]>();
      for (const entry of entries) {
        const prefix = entry.key.split(".").slice(0, 2).join(".");
        if (!keyGroups.has(prefix)) keyGroups.set(prefix, []);
        keyGroups.get(prefix)!.push(entry);
      }

      for (const [, group] of keyGroups) {
        if (group.length <= 1) continue;

        // Keep the highest-importance entry, merge evidence
        group.sort((a, b) => b.importance - a.importance);
        const keeper = group[0];

        for (let i = 1; i < group.length; i++) {
          const loser = group[i];
          // Merge evidence
          if (loser.evidence) {
            keeper.evidence = [...new Set([...(keeper.evidence || []), ...loser.evidence])];
          }
          // Take the more recent content if it seems like an update
          if (new Date(loser.lastAccessedAt) > new Date(keeper.lastAccessedAt) && loser.content.length > 0) {
            keeper.content = loser.content;
            keeper.lastAccessedAt = loser.lastAccessedAt;
          }
          keeper.importance = Math.max(keeper.importance, loser.importance);
          keeper.tags = [...new Set([...keeper.tags, ...loser.tags])];

          // Remove the loser
          const idx = this.store.entries.findIndex(e => e.id === loser.id);
          if (idx !== -1) {
            this.store.entries.splice(idx, 1);
            removed++;
          }
          merged++;
        }
      }
    }

    this.store.lastSummarisedAt = new Date().toISOString();
    return { merged, removed };
  }

  /** Clear all memories */
  clear(): void {
    this.store.entries = [];
  }

  /** Get entry count */
  count(): number {
    return this.store.entries.length;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Prune lowest-value entries when over limit */
  private prune(): void {
    // Score each entry
    const scored = this.store.entries.map(e => ({
      entry: e,
      score: e.importance * e.confidence * this.freshnessScore(e) * (1 + Math.log(e.accessCount + 1)),
    }));

    scored.sort((a, b) => a.score - b.score);

    // Remove bottom 10%
    const removeCount = Math.ceil(this.store.entries.length * 0.1);
    const idsToRemove = new Set(scored.slice(0, removeCount).map(s => s.entry.id));
    this.store.entries = this.store.entries.filter(e => !idsToRemove.has(e.id));
  }

  /** Freshness score: 1.0 for today, decays over weeks */
  private freshnessScore(entry: MemoryEntry): number {
    const ageDays = (Date.now() - new Date(entry.lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0.1, 1.0 / (1 + ageDays / 14));
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _memory: AgentMemory | null = null;

export function getAgentMemory(): AgentMemory {
  if (!_memory) {
    _memory = new AgentMemory();
  }
  return _memory;
}
