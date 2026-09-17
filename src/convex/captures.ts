import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  EXT_UPLOAD_TTL_MS,
  validateExtensionPayload,
} from "../lib/capture/extension";
import { sanitizeLibraryFields } from "../lib/capture/libraryInput";

/**
 * Captures library: persistence for published SVG documents (stored in Convex
 * file storage, referenced from `captures` rows). URL capture itself lives in
 * `captureUrl.ts` (a Node action). Current-tab captures land through the
 * extension endpoints below (`createExtensionUpload` / `saveExtensionCapture`).
 */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("captures")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return Promise.all(
      rows.map(async (row) => ({
        // The embedding vector is intentionally omitted from list responses —
        // it is large and only needed at index/search time. embedModel stays so
        // the client knows which captures still need indexing.
        _id: row._id,
        _creationTime: row._creationTime,
        userId: row.userId,
        title: row.title,
        description: row.description,
        tags: row.tags,
        url: row.url,
        source: row.source,
        captureMode: row.captureMode,
        width: row.width,
        height: row.height,
        thumbnail: row.thumbnail,
        metadataJson: row.metadataJson,
        storageId: row.storageId,
        createdAt: row.createdAt,
        embedModel: row.embedModel,
        ocrText: row.ocrText,
        svgUrl: (await ctx.storage.getUrl(row.storageId)) ?? null,
      })),
    );
  },
});

export const getUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveCapture = mutation({
  args: {
    storageId: v.id("_storage"),
    title: v.string(),
    description: v.string(),
    tags: v.array(v.string()),
    url: v.optional(v.string()),
    captureMode: v.string(),
    width: v.number(),
    height: v.number(),
    thumbnail: v.string(),
    metadataJson: v.string(),
    // OCR-at-capture flattened text (blueprint §14) — feeds the search index.
    ocrText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const f = sanitizeLibraryFields({
      title: args.title,
      description: args.description,
      tags: args.tags,
      url: args.url,
      captureMode: args.captureMode,
      width: args.width,
      height: args.height,
      thumbnail: args.thumbnail,
    });
    await ctx.db.insert("captures", {
      userId,
      ...f,
      metadataJson: args.metadataJson.slice(0, 50_000),
      storageId: args.storageId,
      createdAt: Date.now(),
      ocrText: args.ocrText ? args.ocrText.slice(0, 50_000) : undefined,
    });
    // Audit hook (Phase 7).
    await ctx.runMutation(internal.policy.recordAuditInternal, {
      userId,
      action: "captures.saved",
      detail: `Saved "${f.title.slice(0, 120)}" (${f.width}×${f.height}, ${f.captureMode}).`,
    });
  },
});

/* ------------------------------------------------------------------ */
/* Current-tab extension endpoints (Phase A)                            */
/*                                                                      */
/* The extension is the capture controller — it renders tiles in the    */
/* user's own browser (so auth'd / VPN-gated pages work) and uploads a  */
/* single PNG here. These endpoints are storage + persistence only;     */
/* the backend never sees cookies, form values, or DOM text.            */
/* ------------------------------------------------------------------ */

export const createExtensionUpload = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return {
      uploadUrl,
      sessionId: crypto.randomUUID(),
      expiresAt: Date.now() + EXT_UPLOAD_TTL_MS,
    };
  },
});

export const saveExtensionCapture = mutation({
  args: {
    storageId: v.id("_storage"),
    title: v.string(),
    url: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    deviceScaleFactor: v.number(),
    mode: v.string(),
    capturedAt: v.string(),
    thumbnail: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    // Geometry / mode guards — shared with the smoke test so the contract is
    // exercised without a live Convex deployment.
    const check = validateExtensionPayload({
      width: args.width,
      height: args.height,
      deviceScaleFactor: args.deviceScaleFactor,
      mode: args.mode,
      title: args.title,
    });
    if (!check.ok) {
      throw new Error(`Rejected by capture guards: ${check.errors.join("; ")}`);
    }

    const f = sanitizeLibraryFields({
      title: args.title,
      description: args.description ?? "",
      tags: args.tags ?? [],
      url: args.url,
      captureMode: args.mode === "viewport" ? "viewport" : "full-page",
      width: args.width,
      height: args.height,
      thumbnail: args.thumbnail,
    });
    await ctx.db.insert("captures", {
      userId,
      source: "extension",
      ...f,
      metadataJson: JSON.stringify({
        title: f.title,
        description: f.description,
        tags: f.tags,
        source: "extension",
        capturedAt: args.capturedAt,
        deviceScaleFactor: args.deviceScaleFactor,
      }).slice(0, 50_000),
      storageId: args.storageId,
      createdAt: Date.now(),
    });
  },
});

/* ------------------------------------------------------------------ */
/* On-device semantic search (NLP layer)                                */
/*                                                                      */
/* Embeddings are computed in the browser (MiniLM-L6-v2 or the rule     */
/* fallback — both 384-dim, L2-normalized) and stored here; search runs */
/* over the Convex vector index with the query embedding.               */
/* ------------------------------------------------------------------ */

export const setCaptureEmbedding = mutation({
  args: {
    id: v.id("captures"),
    embedding: v.array(v.number()),
    embedModel: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== userId) throw new Error("Not found");
    if (args.embedding.length !== 384) {
      throw new Error("Embedding must be 384 dimensions");
    }
    if (args.embedding.some((n) => !Number.isFinite(n))) {
      throw new Error("Embedding contains non-finite values");
    }
    await ctx.db.patch(args.id, {
      embedding: args.embedding,
      embedModel: args.embedModel.slice(0, 40),
    });
  },
});

/**
 * Minimal row projection for vector-search hits (internal — the action below
 * passes only ids that already passed the `userId` filter in the index).
 */
export const getByIds = internalQuery({
  args: { ids: v.array(v.id("captures")) },
  handler: async (ctx, args) => {
    const out: Array<{
      _id: typeof args.ids[number];
      _creationTime: number;
      title: string;
      thumbnail: string;
      width: number;
      height: number;
      captureMode: string;
      source?: "demo" | "url" | "extension";
      url?: string;
      createdAt: number;
      embedModel?: string;
      ocrText?: string;
    }> = [];
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      out.push({
        _id: row._id,
        _creationTime: row._creationTime,
        title: row.title,
        thumbnail: row.thumbnail,
        width: row.width,
        height: row.height,
        captureMode: row.captureMode,
        source: row.source,
        url: row.url,
        createdAt: row.createdAt,
        embedModel: row.embedModel,
        ocrText: row.ocrText,
      });
    }
    return out;
  },
});

/**
 * Semantic library search over the native vector index (scale-up path).
 *
 * The query embedding is still computed on-device (MiniLM-L6-v2 / rule
 * fallback, 384-dim, L2-normalized) — only the ranking moves server-side, so
 * large libraries don't ship every embedding to the client on every search.
 * Falls back to client-side cosine (getCaptureEmbeddings) when the vector
 * index is unavailable on the deployment.
 */
/** A capture row projection returned from vector-search hits. */
export interface SearchHitRow {
  _id: Id<"captures">;
  _creationTime: number;
  title: string;
  thumbnail: string;
  width: number;
  height: number;
  captureMode: string;
  source?: "demo" | "url" | "extension";
  url?: string;
  createdAt: number;
  embedModel?: string;
  ocrText?: string;
}

export const searchByEmbedding = action({
  args: {
    query: v.array(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("captures"),
      _score: v.number(),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ _id: Id<"captures">; _score: number }>> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    if (args.query.length !== 384 || args.query.some((n) => !Number.isFinite(n))) {
      throw new Error("Query embedding must be 384 finite numbers");
    }
    const limit = Math.min(Math.max(1, Math.round(args.limit ?? 20)), 50);
    const hits: Array<{ _id: Id<"captures">; _score: number }> =
      await ctx.vectorSearch("captures", "by_embedding", {
        vector: args.query,
        limit,
        filter: (q) => q.eq("userId", userId),
      });
    if (hits.length === 0) return [];
    const rows: SearchHitRow[] = await ctx.runQuery(
      internal.captures.getByIds,
      { ids: hits.map((h) => h._id) },
    );
    const byId = new Map<Id<"captures">, SearchHitRow>(
      rows.map((r) => [r._id, r]),
    );
    return hits
      .map((h) => {
        const row = byId.get(h._id);
        return row ? { _id: row._id, _score: h._score } : null;
      })
      .filter((r): r is { _id: Id<"captures">; _score: number } => r !== null);
  },
});

export const getCaptureEmbeddings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("captures")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .filter((r) => Array.isArray(r.embedding) && r.embedding.length === 384)
      .map((r) => ({
        captureId: r._id,
        embedModel: r.embedModel ?? "",
        embedding: r.embedding as number[],
      }));
  },
});

export const remove = mutation({
  args: { id: v.id("captures") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== userId) throw new Error("Not found");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(args.id);
    // Audit hook (Phase 7).
    await ctx.runMutation(internal.policy.recordAuditInternal, {
      userId,
      action: "captures.deleted",
      detail: `Deleted "${row.title.slice(0, 120)}" (${row.width}×${row.height}).`,
    });
  },
});
