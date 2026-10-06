/**
 * page_check: open every HTML page of a static site in headless Chromium and report the ones that are broken:
 * a script error, a missing local file (CSS/JS/image), or an empty page. Tests that load pages in jsdom do not
 * notice a page whose content was wiped; this does. Used by the pipeline after each phase and by the agent.
 */
import { createServer, type Server } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, relative, sep } from "node:path";
import { loadPlaywright, resolvePw } from "./webtest.js";
import { type Tool, obj, str, int } from "./types.js";

export interface PageResult { page: string; ok: boolean; problems: string[]; textChars: number }

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain", ".xml": "application/xml",
};
const SKIP = new Set(["node_modules", ".git", "tests", "test", "docs", "dist", "build", "coverage", "server"]);

export const pageCheckAvailable = () => resolvePw() !== null;

/** HTML pages of the site: the folder's own and one level of subfolders (admin/…), not tests/docs/node_modules. */
export function sitePages(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const add = (d: string, depth: number) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const full = join(d, e.name);
      if (e.isDirectory() && depth === 0) add(full, 1);
      else if (e.isFile() && e.name.endsWith(".html")) out.push(relative(root, full).split(sep).join("/"));
    }
  };
  add(root, 0);
  return out.sort();
}

function serve(root: string): Promise<{ server: Server; base: string }> {
  return new Promise((res, rej) => {
    const server = createServer((req, resp) => {
      let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
      let file = normalize(join(root, p));
      if (!file.startsWith(root)) { resp.writeHead(403).end(); return; }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) { resp.writeHead(404).end("not found"); return; }
      resp.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      resp.end(readFileSync(file));
    });
    server.on("error", rej);
    server.listen(0, "127.0.0.1", () => { const a = server.address() as any; res({ server, base: `http://127.0.0.1:${a.port}/` }); });
  });
}

/** Load each page and judge it. `minText`: fewer visible characters than this means the page rendered empty. */
export async function checkPages(root: string, pages = sitePages(root), o: { minText?: number; timeoutMs?: number } = {}): Promise<PageResult[]> {
  if (!pages.length) return [];
  const pw = await loadPlaywright();
  const { server, base } = await serve(root);
  const browser = await pw.chromium.launch({ headless: true });
  const out: PageResult[] = [];
  try {
    for (const page of pages) {
      const problems: string[] = [];
      const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      tab.on("pageerror", (e: any) => problems.push(`script error: ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`));
      tab.on("response", (r: any) => {
        const u = r.url();
        // only this site's own files: the API isn't served here, external hosts may be offline
        if (r.status() >= 400 && u.startsWith(base) && !new URL(u).pathname.startsWith("/api/")) problems.push(`missing file: /${u.slice(base.length)} (${r.status()})`);
      });
      let textChars = 0;
      try {
        await tab.goto(base + page, { waitUntil: "load", timeout: o.timeoutMs ?? 15_000 });
        await tab.waitForTimeout(300);   // module scripts render after load
        textChars = await tab.evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length);
        if (textChars < (o.minText ?? 80)) problems.push(`page is nearly empty (${textChars} characters of visible text)`);
      } catch (e: any) { problems.push(`did not load: ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`); }
      await tab.close();
      out.push({ page, ok: problems.length === 0, problems: tidy(problems), textChars });
    }
  } finally {
    await browser.close().catch(() => undefined);
    server.close();
  }
  return out;
}

/** Empty page and script errors first; missing files folded into one line. */
function tidy(problems: string[]): string[] {
  const uniq = [...new Set(problems)];
  const missing = uniq.filter((p) => p.startsWith("missing file: ")).map((p) => p.slice(14).replace(/ \(\d+\)$/, ""));
  const rest = uniq.filter((p) => !p.startsWith("missing file: ")).sort((a, b) => Number(b.startsWith("page is")) - Number(a.startsWith("page is")));
  return [...rest.slice(0, 4), ...(missing.length ? [`missing files (${missing.length}): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}`] : [])];
}

export function formatPages(rs: PageResult[]): string {
  const bad = rs.filter((r) => !r.ok);
  return `${rs.length - bad.length}/${rs.length} pages OK` + (bad.length ? ":\n" + bad.map((r) => `✖ ${r.page}\n  ${r.problems.join("\n  ")}`).join("\n") : "");
}

export const pageCheckTool: Tool = {
  name: "page_check", toolset: "testing", tier: "slm",
  description: "Open the site's HTML pages in a real browser (headless) and list broken ones: script errors, missing CSS/JS/image files, empty pages. Run after changing pages, styles or page scripts.",
  parameters: obj({ dir: str("Site folder (default: working folder)"), pages: str("Comma-separated pages to check (default: all .html pages)"), min_text: int("Visible characters below which a page counts as empty (default 80)") }, []),
  available: () => pageCheckAvailable() || "playwright-core is not installed (run: harness browser setup)",
  async handler(a, ctx) {
    const root = a.dir ? join(ctx.cwd, String(a.dir)) : ctx.cwd;
    const pages = a.pages ? String(a.pages).split(",").map((s) => s.trim()).filter(Boolean) : sitePages(root);
    if (!pages.length) return "No .html pages found.";
    return formatPages(await checkPages(root, pages, { minText: Number(a.min_text) || undefined }));
  },
};
