import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { BlocksWithLists } from "@/components/docs/Blocks";
import {
  FOUNDATIONS_CHAPTERS,
  buildGlossaryChapter,
} from "@/lib/docs/foundations";

/**
 * /docs/start - the beginner path. Renders the same plain-language
 * foundation chapters and glossary that open the PDF manual, so people
 * who have never met an "agent" or an "LLM" can learn every term before
 * touching the technical reference.
 */

const GLOSSARY = buildGlossaryChapter();

export default function StartHere() {
  const [active, setActive] = useState(0);
  const total = FOUNDATIONS_CHAPTERS.length;

  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteNav />

      <div className="mx-auto max-w-7xl px-6 py-10 pb-24">
        {/* Intro */}
        <div className="mb-8 max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-400">Beginner path</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
            Never used AI tooling? Start here.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            These thirteen short chapters assume nothing. They explain what
            models are, where they came from, and how they are made - in
            everyday language - then walk you through your first session,
            first swarm, and first governed project step by step. When you
            finish, the technical{" "}
            <Link to="/docs" className="text-violet-400 hover:underline">documentation</Link>{" "}
            will read normally.
          </p>
        </div>

        <div className="flex gap-8">
          {/* Chapter rail */}
          <aside className="sticky top-24 hidden h-fit w-64 shrink-0 lg:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Chapters
            </p>
            <nav className="space-y-1">
              {FOUNDATIONS_CHAPTERS.map((ch, i) => (
                <button
                  key={ch.title}
                  onClick={() => setActive(i)}
                  className={`block w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                    active === i
                      ? "bg-violet-500/15 font-medium text-violet-300"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  {i + 1}. {ch.title}
                </button>
              ))}
              <button
                onClick={() => setActive(-1)}
                className={`block w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                  active === -1
                    ? "bg-violet-500/15 font-medium text-violet-300"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                }`}
              >
                Glossary
              </button>
            </nav>
            <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs leading-relaxed text-zinc-400">
              Prefer paper? These chapters are Part I of the{" "}
              <Link to="/docs/pdf" className="text-violet-400 hover:underline">
                PDF manual
              </Link>
              , followed by the full technical reference.
            </div>
            <Link
              to="/tutorials"
              className="mt-3 block rounded px-3 py-1.5 text-sm text-emerald-400 transition-colors hover:text-emerald-300"
            >
              Step-by-step tutorials →
            </Link>
          </aside>

          {/* Chapter body */}
          <main className="min-w-0 flex-1">
            {active === -1 ? (
              <section>
                <h2 className="text-2xl font-bold text-white">Glossary</h2>
                <ul className="mt-6 space-y-3">
                  {GLOSSARY.blocks.map((bl) =>
                    bl.type === "bullet" ? (
                      <li key={bl.text.slice(0, 40)} className="ml-5 list-disc text-sm leading-relaxed marker:text-zinc-600">
                        {bl.text}
                      </li>
                    ) : null,
                  )}
                </ul>
              </section>
            ) : (
              (() => {
                const ch = FOUNDATIONS_CHAPTERS[active];
                return (
                  <section key={ch.title}>
                    <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
                      Chapter {active + 1} of {total}
                    </p>
                    <h2 className="mt-2 text-2xl font-bold text-white">{ch.title}</h2>
                    <div className="mt-6">
                      <BlocksWithLists blocks={ch.blocks} />
                    </div>
                    <div className="mt-10 flex items-center justify-between border-t border-zinc-800 pt-6">
                      {active > 0 ? (
                        <button
                          onClick={() => setActive(active - 1)}
                          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                        >
                          ← {FOUNDATIONS_CHAPTERS[active - 1].title}
                        </button>
                      ) : <span />}
                      {active < total - 1 ? (
                        <button
                          onClick={() => setActive(active + 1)}
                          className="stitap-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                        >
                          Next: {FOUNDATIONS_CHAPTERS[active + 1].title}
                          <ArrowRight className="size-4" />
                        </button>
                      ) : (
                        <Link
                          to="/docs"
                          className="stitap-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                        >
                          Continue to the technical docs
                          <ArrowRight className="size-4" />
                        </Link>
                      )}
                    </div>
                  </section>
                );
              })()
            )}
          </main>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
