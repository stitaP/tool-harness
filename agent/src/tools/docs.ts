/**
 * docs_lookup: when the agent lacks knowledge of an API, library or concept, look it up online — only in official
 * documentation, and only with the user's consent (asked once per chat; unattended runs need web.docs_lookup: always).
 */
import { type Tool, obj, str } from "./types.js";
import { searchWeb, extractUrl, type Hit } from "./web.js";

/** Official documentation sites (host, or host/path prefix). Extend with web.docs_domains in config.yaml. */
export const OFFICIAL_DOCS = [
  "developer.mozilla.org", "html.spec.whatwg.org", "www.w3.org", "web.dev",
  "docs.python.org", "peps.python.org", "nodejs.org", "www.typescriptlang.org", "typescriptlang.org",
  "react.dev", "nextjs.org", "vuejs.org", "angular.dev", "svelte.dev", "kit.svelte.dev", "docs.astro.build", "tailwindcss.com",
  "vite.dev", "vitejs.dev", "webpack.js.org", "expressjs.com", "jestjs.io", "vitest.dev", "playwright.dev", "docs.deno.com", "bun.sh/docs",
  "docs.npmjs.com", "pnpm.io", "yarnpkg.com", "git-scm.com", "docs.github.com",
  "developer.apple.com", "docs.swift.org", "developer.android.com", "kotlinlang.org", "flutter.dev", "dart.dev",
  "learn.microsoft.com", "cloud.google.com", "docs.aws.amazon.com", "kubernetes.io", "docs.docker.com", "developer.hashicorp.com",
  "www.postgresql.org", "dev.mysql.com", "www.sqlite.org", "sqlite.org", "redis.io/docs", "www.mongodb.com/docs",
  "go.dev", "pkg.go.dev", "doc.rust-lang.org", "docs.rs", "docs.oracle.com", "www.php.net", "guides.rubyonrails.org", "ruby-doc.org",
  "docs.djangoproject.com", "flask.palletsprojects.com", "fastapi.tiangolo.com", "numpy.org", "pandas.pydata.org", "scikit-learn.org",
  "pytorch.org", "www.tensorflow.org", "huggingface.co/docs", "docs.anthropic.com", "platform.openai.com/docs",
];

export function isOfficialDoc(url: string, extra: string[] = []): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase(), path = u.pathname;
  return [...OFFICIAL_DOCS, ...extra].some((entry) => {
    const [h, ...rest] = entry.toLowerCase().split("/");
    const prefix = rest.length ? "/" + rest.join("/") : "";
    return (host === h || host.endsWith("." + h)) && (!prefix || path === prefix || path.startsWith(prefix + "/"));
  });
}

const consentKey = (sid: string) => `docs_consent:${sid}`;

export const docsLookupTool: Tool = {
  name: "docs_lookup", toolset: "web", tier: "slm",
  description: "Look up an API, library, CLI or concept in OFFICIAL documentation online (MDN, python.org, nodejs.org, react.dev, Apple, Microsoft, …) when you don't know it or aren't sure — instead of guessing. " +
    "The user is asked for permission first. Returns excerpts with source URLs; cite them.",
  parameters: obj({ query: str("what to look up, e.g. 'fetch AbortController timeout'"), topic: str("the technology, e.g. 'javascript', 'python', 'react', 'docker'") }, ["query"]),
  async handler(a, ctx) {
    const rt = ctx.rt, sid = ctx.session.id;
    const mode = rt.cfg.data.web.docs_lookup ?? "ask";
    if (mode === "never") return "Online documentation lookup is turned off (web.docs_lookup: never). Continue with what you know and say what you could not verify.";
    if (mode !== "always" && rt.db.getMeta(consentKey(sid)) !== "allowed") {
      const what = `${a.topic ? `${a.topic}: ` : ""}${a.query}`;
      const ans = await ctx.clarify(`The agent wants to look up "${what}" in official documentation online. Allow?`, ["Allow for this chat", "Allow once", "Don't allow"]);
      if (!ans || /don't|deny|no/i.test(ans)) return "The user did not allow an online lookup. Continue with what you know, and tell the user what you could not verify.";
      if (/chat/i.test(ans)) rt.db.setMeta(consentKey(sid), "allowed");
    }
    const extra: string[] = rt.cfg.data.web.docs_domains ?? [];
    const q = `${a.topic ? a.topic + " " : ""}${a.query}`;
    const seen = new Set<string>();
    const official: Hit[] = [];
    for (const query of [`${q} official documentation`, q]) {
      let hits: Hit[] = [];
      try { hits = await searchWeb(rt, query, 12, ctx.signal); } catch (e: any) { if (!official.length && query === q) return `error: search failed (${e.message})`; }
      for (const h of hits) if (isOfficialDoc(h.url, extra) && !seen.has(h.url)) { seen.add(h.url); official.push(h); }
      if (official.length >= 2) break;
    }
    if (!official.length) return `No official documentation found for "${q}". Don't rely on unofficial sources; continue with what you know and tell the user what you could not verify. (Official sites can be added under web.docs_domains.)`;
    const pages = await Promise.all(official.slice(0, 2).map((h) => extractUrl(rt, h.url, 5000, ctx.signal).catch((e) => `${h.url}\n(could not read: ${e.message})`)));
    return `Official documentation for "${q}" (cite these sources):\n\n${pages.join("\n\n---\n\n")}` +
      (official.length > 2 ? `\n\nMore official pages:\n${official.slice(2, 6).map((h) => `- ${h.title}: ${h.url}`).join("\n")}` : "");
  },
};
