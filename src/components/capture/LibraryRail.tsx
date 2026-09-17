import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useConvex, useMutation } from "convex/react";
import { ImagePlus, Search, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { nlp } from "@/lib/nlp/service";
import { cosineSimilarity } from "@/lib/nlp/rule";
import { cn } from "@/lib/utils";

export interface SavedCapture {
  _id: Id<"captures">;
  title: string;
  description: string;
  tags: string[];
  url?: string;
  source?: "demo" | "url" | "extension";
  captureMode: string;
  width: number;
  height: number;
  thumbnail: string;
  metadataJson: string;
  createdAt: number;
  svgUrl: string | null;
  /** Embedder model id — set once the on-device NLP layer has indexed this capture. */
  embedModel?: string | null;
  /** Flattened text captured at capture time (blueprint §14) — feeds search. */
  ocrText?: string;
}

interface EmbeddingRow {
  captureId: Id<"captures">;
  embedModel: string;
  embedding: number[];
}

type SearchMode = "text" | "semantic";

function embedTextOf(c: SavedCapture): string {
  return [c.title, c.description, c.tags.join(" "), c.url ?? "", c.ocrText ?? ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
}

export function LibraryRail({
  captures,
  isLoading,
  activeId,
  onOpen,
  onDelete,
  onNew,
}: {
  captures: SavedCapture[];
  isLoading: boolean;
  activeId: string | null;
  onOpen: (c: SavedCapture) => void;
  onDelete: (c: SavedCapture) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("text");
  const [semanticHits, setSemanticHits] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [indexInfo, setIndexInfo] = useState<string | null>(null);
  const client = useConvex();
  const setEmbedding = useMutation(api.captures.setCaptureEmbedding);
  const searchByEmbedding = useAction(api.captures.searchByEmbedding);
  const searchToken = useRef(0);

  const searchStatus = nlp.status("search");

  /* Text filtering */
  const textFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return captures;
    return captures.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        (c.url ?? "").toLowerCase().includes(q) ||
        (c.ocrText ?? "").toLowerCase().includes(q),
    );
  }, [captures, query]);

  /* Semantic search: embed on-device, index any unindexed captures, rank by cosine. */
  useEffect(() => {
    if (mode !== "semantic") return;
    const token = ++searchToken.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        const q = query.trim();
        if (!q) {
          setSemanticHits(null);
          return;
        }
        setBusy(true);
        try {
          const { vectors, model } = await nlp.embed([q]);
          const qv = vectors[0];
          const missing = captures.filter((c) => c.embedModel !== model);
          if (missing.length > 0) {
            const batch = missing.slice(0, 25);
            for (let i = 0; i < batch.length; i++) {
              if (token !== searchToken.current) return;
              const c = batch[i];
              const [v] = (await nlp.embed([embedTextOf(c)])).vectors;
              await setEmbedding({ id: c._id, embedding: v, embedModel: model });
              setIndexInfo(`Indexing ${i + 1}/${batch.length}…`);
            }
            setIndexInfo(null);
          }
          // Preferred path: server-side Convex vector index (scale-up). Fall
          // back to fetching all embeddings + client cosine if the action
          // isn't available (e.g. index not deployed in this environment).
          let hits: Array<{ id: Id<"captures">; score: number }>;
          try {
            const serverHits = await searchByEmbedding({ query: qv, limit: 12 });
            hits = serverHits.map((h) => ({ id: h._id, score: h._score }));
          } catch {
            const rows = (await client.query(api.captures.getCaptureEmbeddings)) as EmbeddingRow[];
            hits = rows
              .filter((e) => e.embedModel === model)
              .map((e) => ({ id: e.captureId, score: cosineSimilarity(qv, e.embedding) }))
              .filter((h) => h.score > 0.14);
          }
          hits.sort((a, b) => b.score - a.score);
          setSemanticHits(new Map(hits.map((h) => [h.id, h.score])));
        } catch (e) {
          console.error("Semantic search failed:", e);
          setSemanticHits(null);
        } finally {
          setBusy(false);
          setIndexInfo(null);
        }
      })();
    }, 320);
    return () => window.clearTimeout(timer);
  }, [mode, query, captures, client, setEmbedding, searchByEmbedding]);

  const visible = useMemo(() => {
    if (mode === "semantic") {
      if (!semanticHits) return captures;
      return captures
        .filter((c) => semanticHits.has(c._id))
        .sort((a, b) => (semanticHits.get(b._id) ?? 0) - (semanticHits.get(a._id) ?? 0));
    }
    return textFiltered;
  }, [mode, captures, semanticHits, textFiltered]);

  const noMatches = !isLoading && visible.length === 0;
  const indexedCount = captures.filter((c) => c.embedModel).length;

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Library
          </p>
          <span className="font-mono text-[11px] text-zinc-400">{captures.length}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === "semantic" ? "Search by meaning…" : "Search captures…"}
              className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-[12px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900"
            />
          </div>
          <button
            onClick={onNew}
            title="New capture"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:border-zinc-900 hover:text-zinc-900"
          >
            <ImagePlus className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-200">
            {(["text", "semantic"] as SearchMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setSemanticHits(null);
                }}
                className={cn(
                  "px-2.5 py-1 text-[10.5px] font-medium transition-colors",
                  mode === m
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-500 hover:text-zinc-900",
                )}
              >
                {m === "semantic" ? "Semantic" : "Text"}
              </button>
            ))}
          </div>
          {mode === "semantic" && (
            <span className="truncate font-mono text-[10px] text-zinc-400">
              {busy
                ? indexInfo ?? "Searching…"
                : searchStatus.state === "ready"
                  ? `on-device · ${indexedCount} indexed`
                  : searchStatus.state === "loading"
                    ? "loading model…"
                    : "on-device · rule fallback"}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && (
          <p className="px-4 py-6 font-mono text-[11px] text-zinc-400">Loading…</p>
        )}
        {!isLoading && noMatches && (
          <div className="px-4 py-8">
            <p className="text-[12px] leading-5 text-zinc-400">
              {query
                ? mode === "semantic"
                  ? "No semantic matches. Try different words, or a broader query."
                  : "No captures match your search."
                : "Your saved captures will appear here. Capture a page, annotate it, and save."}
            </p>
          </div>
        )}
        <ul className="divide-y divide-zinc-100">
          {visible.map((c) => {
            const score = mode === "semantic" ? semanticHits?.get(c._id) : undefined;
            return (
              <li key={c._id}>
                <button
                  onClick={() => onOpen(c)}
                  className={cn(
                    "group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
                    activeId === c._id ? "bg-zinc-50" : "hover:bg-zinc-50/70",
                  )}
                >
                  <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
                    {c.thumbnail ? (
                      <img src={c.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center font-mono text-[9px] text-zinc-400">
                        {c.source === "extension" ? "IMG" : "SVG"}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-zinc-900">
                      {c.title || "Untitled capture"}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10.5px] text-zinc-400">
                      {c.width}×{c.height} · {c.captureMode}
                      {c.source === "extension" ? " · current tab" : ""}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-zinc-400">
                      {new Date(c.createdAt).toLocaleDateString()}
                      {c.tags.length > 0 && ` · ${c.tags.slice(0, 3).join(", ")}`}
                    </span>
                  </span>
                  {score !== undefined && (
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] text-zinc-400">
                      {score.toFixed(2)}
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onDelete(c);
                      }
                    }}
                    className="mt-0.5 shrink-0 text-zinc-300 opacity-0 transition-all hover:text-red-600 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
