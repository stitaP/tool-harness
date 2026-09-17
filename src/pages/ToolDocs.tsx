import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search, ChevronDown } from "lucide-react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CATEGORY_DOCS, DEEP_DIVES } from "@/lib/docs/tool-docs";
import { ALL_TOOLS } from "@/lib/store";
import type { ToolCategory, ToolManifest } from "@/lib/store/tool-types";

/**
 * /docs/tools — full per-tool reference, generated from the live registry.
 * Same data source as chapters 20+ of the downloadable PDF manual.
 */

const CATS = [...new Set(ALL_TOOLS.map((t) => t.category))];

function ToolEntry({ tool }: { tool: ToolManifest }) {
  const [open, setOpen] = useState(false);
  const req = tool.parameters.filter((p) => p.required);
  const opt = tool.parameters.filter((p) => !p.required);

  return (
    <div id={`tool-${tool.id}`} className="scroll-mt-32 rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <code className="font-mono text-sm font-bold text-cyan-300">{tool.id}</code>
            <span className="text-sm font-medium text-zinc-200">{tool.name}</span>
            <span className="font-mono text-[10px] text-zinc-600">v{tool.version}</span>
            {tool.slmFriendly && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">SLM</span>
            )}
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{tool.description}</p>
        </div>
        <ChevronDown className={`size-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-800 px-5 py-4">
          <p className="text-[13px] leading-relaxed text-zinc-300">{tool.longDescription || tool.description}</p>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Usage</h4>
            {!tool.parameters.length ? (
              <p className="mt-2 text-[13px] text-zinc-400">Takes no parameters.</p>
            ) : (
              <div className="mt-2 overflow-hidden rounded-lg border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-zinc-900 text-zinc-400">
                      <th className="px-3 py-1.5 font-medium">Parameter</th>
                      <th className="px-3 py-1.5 font-medium">Type</th>
                      <th className="px-3 py-1.5 font-medium">Description</th>
                      <th className="px-3 py-1.5 font-medium">Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...req, ...opt].map((p) => (
                      <tr key={p.name} className="border-t border-zinc-800/60">
                        <td className="px-3 py-1.5 font-mono text-zinc-200">
                          {p.name}
                          {p.required && <span className="ml-1 text-rose-400">*</span>}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-500">{p.type}</td>
                        <td className="px-3 py-1.5 text-zinc-400">{p.description}</td>
                        <td className="px-3 py-1.5 font-mono text-zinc-500">
                          {p.default !== undefined ? JSON.stringify(p.default) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {tool.capabilities[0]?.offline && <Tag tone="emerald">offline-capable</Tag>}
            {(tool.capabilities[0] as unknown as { requiresBrowser?: boolean })?.requiresBrowser && <Tag tone="blue">browser session</Tag>}
            {(tool.capabilities[0] as unknown as { requiresNetwork?: boolean })?.requiresNetwork && <Tag tone="amber">network access</Tag>}
            {tool.dependencies?.map((d) => <Tag key={d} tone="zinc">depends on {d}</Tag>)}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Invocation</h4>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
              <code>{`store.execute("${tool.id}", {\n${req.map((p) => `  "${p.name}": <${p.type}>,`).join("\n") || "  // no required params"}\n})`}</code>
            </pre>
          </div>

          {DEEP_DIVES[tool.id] && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-violet-300">Worked example</h4>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{DEEP_DIVES[tool.id].scenario}</p>
              <ol className="mt-3 space-y-1.5">
                {DEEP_DIVES[tool.id].steps.map((s, i) => (
                  <li key={i} className="ml-5 list-decimal text-[13px] leading-relaxed marker:text-zinc-600">
                    {s.replace(/^\d+\.\s*/, "")}
                  </li>
                ))}
              </ol>
              <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-violet-300">Annotated output</h4>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
                <code>{DEEP_DIVES[tool.id].sampleOutput.join("\n")}</code>
              </pre>
              <ul className="mt-3 space-y-1.5">
                {DEEP_DIVES[tool.id].tips.map((tip, i) => (
                  <li key={i} className="ml-5 list-disc text-[13px] leading-relaxed marker:text-zinc-600">
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "emerald" | "blue" | "amber" | "zinc" }) {
  const tones = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    zinc: "border-zinc-700 bg-zinc-800 text-zinc-400",
  };
  return <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>;
}

export default function ToolDocs() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<ToolCategory | "all">("all");
  const [params] = useSearchParams();

  // Deep links from store cards (?tool=browser.click): reveal + scroll
  useEffect(() => {
    const id = params.get("tool");
    if (!id) return;
    setQuery(id);
    requestAnimationFrame(() => {
      document.getElementById(`tool-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [params]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return ALL_TOOLS.filter(
      (t) =>
        (cat === "all" || t.category === cat) &&
        (!q ||
          t.id.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))),
    );
  }, [query, cat]);

  const grouped = useMemo(() => {
    const map = new Map<ToolCategory, ToolManifest[]>();
    for (const t of filtered) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteNav />

      <div className="mx-auto max-w-7xl px-6 py-10 pb-24">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Tool Reference</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Complete documentation for all {ALL_TOOLS.length} deployed tools — usage, parameters,
              capabilities and invocation. Generated live from the registry, so it always matches
              what the runtime executes. The same content ships as chapters 20+ of the{" "}
              <Link to="/docs/pdf" className="text-violet-400 hover:underline">PDF manual</Link>.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
              <span className="text-sm text-emerald-300">20 enterprise use cases — every tool tested, no stubs</span>
              <Link to="/docs/enterprise-use-cases" className="text-sm font-semibold text-emerald-400 hover:underline">View all →</Link>
            </div>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools…"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => setCat("all")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              cat === "all" ? "border-violet-500 bg-violet-500/15 text-violet-300" : "border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            All ({ALL_TOOLS.length})
          </button>
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                cat === c ? "border-violet-500 bg-violet-500/15 text-violet-300" : "border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {c} ({ALL_TOOLS.filter((t) => t.category === c).length})
            </button>
          ))}
        </div>

        <div className="mt-10 space-y-14">
          {grouped.map(([category, tools]) => {
            const doc = CATEGORY_DOCS[category];
            return (
              <section key={category}>
                <h2 className="text-xl font-bold capitalize text-white">{doc?.label ?? `${category} tools`}</h2>
                {doc && (
                  <div className="mt-3 space-y-3">
                    {doc.background.map((para, i) => (
                      <p key={i} className="max-w-3xl text-[13px] leading-relaxed text-zinc-400">{para}</p>
                    ))}
                    {doc.useCases.length > 0 && (
                      <div className="max-w-3xl rounded-lg border-l-4 border-violet-500 bg-violet-500/10 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Design use cases</p>
                        <ul className="mt-2 space-y-1.5">
                          {doc.useCases.map((uc, i) => (
                            <li key={i} className="text-[13px] leading-relaxed text-zinc-300">— {uc}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-5 space-y-3">
                  {tools.map((t) => <ToolEntry key={t.id} tool={t} />)}
                </div>
              </section>
            );
          })}
          {!grouped.length && (
            <p className="py-16 text-center text-sm text-zinc-500">No tools match "{query}".</p>
          )}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
