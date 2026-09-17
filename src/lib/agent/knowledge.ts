/**
 * stitaP Knowledge — In-house RAG (Retrieval-Augmented Generation)
 *
 * Hermes-parity gap: agents need to consult documents the company loads
 * (guidelines, help files, prior run reports) without pushing raw text into
 * every prompt. This is a fully local vector store:
 *
 * - Deterministic hashed embeddings (no model download, works air-gapped)
 * - Cosine similarity retrieval with top-k + score threshold
 * - Optional metadata filters and source-scoped search
 * - Chunking tuned for SLM budgets (small windows, overlap)
 *
 * When a real embedding model IS available through the inference router, a
 * host can swap `embed` for model-backed vectors — the store only needs
 * `number[]` and cosine distance.
 */

// ─── Embedding ────────────────────────────────────────────────────────────────

export const EMBED_DIMS = 384;

const STOP = new Set("a an the and or of to in on for with is are was were be been it its this that as at by from".split(" "));

/** Light suffix stemmer — enough for retrieval without a real lemmatizer. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic hashed embedding with bigram features. L2-normalized.
 *
 * Dual independent hash functions reduce collision variance enough that
 * unrelated short texts score near zero under cosine distance (single-hash
 * bag-of-words on 256 dims can score 0.25+ on pure noise). */
export function embed(text: string): number[] {
  const vec = new Float64Array(EMBED_DIMS);
  const tokens = tokenize(text);
  const bump = (feature: string, weight: number) => {
    const h1 = hash32(feature);
    const h2 = hash32(`${feature}\u0000b`) ^ 0x9e3779b9;
    vec[h1 % EMBED_DIMS] += weight * (((h1 >>> 16) & 1) === 0 ? 1 : -1);
    vec[h2 % EMBED_DIMS] += weight * (((h2 >>> 16) & 1) === 0 ? 1 : -1);
  };
  for (let i = 0; i < tokens.length; i++) {
    bump(tokens[i], 1);
    if (i > 0) bump(`${tokens[i - 1]}_${tokens[i]}`, 0.5); // bigram keeps some word order
  }
  let norm = 0;
  for (let i = 0; i < EMBED_DIMS; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  sourceName: string;
  index: number;
  text: string;
  vector: number[];
  metadata: Record<string, string | number | boolean>;
  addedAt: string;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  chunkCount: number;
  bytes: number;
  metadata: Record<string, string | number | boolean>;
  addedAt: string;
}

export interface SearchHit {
  chunkId: string;
  sourceName: string;
  text: string;
  score: number;
}

export interface KnowledgeStats { sources: number; chunks: number; approxTokens: number }

let seq = 0;

export class KnowledgeBase {
  private chunks: KnowledgeChunk[] = [];
  private sources = new Map<string, KnowledgeSource>();

  /** Add a document: chunked with overlap, embedded once at write time. */
  addDocument(name: string, text: string, opts?: { sourceId?: string; maxChars?: number; overlapChars?: number; metadata?: Record<string, string | number | boolean> }): KnowledgeSource {
    const sourceId = opts?.sourceId ?? `src-${Date.now().toString(36)}-${++seq}`;
    const maxChars = opts?.maxChars ?? 800;
    const overlap = Math.min(opts?.overlapChars ?? 120, Math.floor(maxChars / 4));
    const clean = text.replace(/\s+\n/g, "\n").trim();
    let index = 0;
    for (let start = 0; start < clean.length || index === 0; start += maxChars - overlap) {
      const piece = clean.slice(start, start + maxChars).trim();
      if (!piece) break;
      this.chunks.push({
        id: `${sourceId}#${index}`, sourceId, sourceName: name, index,
        text: piece,
        vector: embed(piece),
        metadata: opts?.metadata ?? {},
        addedAt: new Date().toISOString(),
      });
      index++;
      if (start + maxChars >= clean.length) break;
    }
    const src: KnowledgeSource = {
      id: sourceId, name, chunkCount: index, bytes: clean.length,
      metadata: opts?.metadata ?? {}, addedAt: new Date().toISOString(),
    };
    this.sources.set(sourceId, src);
    return src;
  }

  removeSource(sourceId: string): boolean {
    if (!this.sources.has(sourceId)) return false;
    this.chunks = this.chunks.filter((c) => c.sourceId !== sourceId);
    return this.sources.delete(sourceId);
  }

  listSources(): KnowledgeSource[] {
    return [...this.sources.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  search(query: string, opts?: { topK?: number; minScore?: number; sourceIds?: string[] }): SearchHit[] {
    const qv = embed(query);
    const topK = opts?.topK ?? 5;
    const minScore = opts?.minScore ?? 0.06;
    const allow = opts?.sourceIds ? new Set(opts.sourceIds) : undefined;
    return this.chunks
      .filter((c) => !allow || allow.has(c.sourceId))
      .map((c) => ({ chunk: c, score: cosine(qv, c.vector) }))
      .filter((h) => h.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((h) => ({ chunkId: h.chunk.id, sourceName: h.chunk.sourceName, text: h.chunk.text, score: Math.round(h.score * 1000) / 1000 }));
  }

  /**
   * SLM-friendly context block: retrieved chunks stitched under budget.
   * Returns "" when nothing relevant — callers skip RAG injection entirely.
   */
  buildContext(query: string, tokenBudget = 600): string {
    const hits = this.search(query, { topK: 8 });
    if (!hits.length) return "";
    const parts: string[] = [];
    let used = 0;
    for (const h of hits) {
      const cost = Math.ceil(h.text.length / 4) + 12;
      if (used + cost > tokenBudget) break;
      parts.push(`[${h.sourceName} ${h.score}] ${h.text}`);
      used += cost;
    }
    return parts.join("\n---\n");
  }

  stats(): KnowledgeStats {
    const chars = this.chunks.reduce((s, c) => s + c.text.length, 0);
    return { sources: this.sources.size, chunks: this.chunks.length, approxTokens: Math.ceil(chars / 4) };
  }
}

let singleton: KnowledgeBase | undefined;
export function getKnowledgeBase(): KnowledgeBase {
  singleton ??= new KnowledgeBase();
  return singleton;
}
