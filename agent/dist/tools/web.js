import { checkEgress } from "../safety/paths.js";
import { decodeEntities, htmlTitle, htmlToText } from "../util/html.js";
import { truncateMiddle } from "../util/misc.js";
import { obj, str, int, arr } from "./types.js";
const UA = "Mozilla/5.0 (compatible; stitaP-agent/0.1; +https://github.com/stitaP/tool-harness)";
export async function guardedFetch(rt, url, init = {}, signal) {
    const w = rt.cfg.data.web;
    let current = url;
    for (let hop = 0; hop < 6; hop++) {
        await checkEgress(current, { allowPrivate: w.allow_private, allowlist: w.egress_allowlist });
        const sig = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]);
        const res = await fetch(current, { ...init, redirect: "manual", signal: sig, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5", ...init.headers } });
        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
            current = new URL(res.headers.get("location"), current).toString();
            continue;
        }
        return res;
    }
    throw new Error("too many redirects");
}
async function ddg(rt, q, n, signal) {
    const res = await guardedFetch(rt, `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {}, signal);
    const html = await res.text();
    const hits = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m;
    while ((m = re.exec(html)) && hits.length < n) {
        let url = decodeEntities(m[1]);
        const u = /uddg=([^&]+)/.exec(url);
        if (u)
            url = decodeURIComponent(u[1]);
        if (url.startsWith("//"))
            url = "https:" + url;
        if (/duckduckgo\.com\/y\.js/.test(url))
            continue; // ads
        hits.push({ url, title: decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim(), snippet: decodeEntities((m[3] ?? "").replace(/<[^>]+>/g, "")).trim() });
    }
    if (!hits.length && /anomaly|captcha/i.test(html))
        throw new Error("DuckDuckGo rate-limited this request; configure web.search_provider (searxng/brave/tavily)");
    return hits;
}
async function searx(rt, q, n, signal) {
    const base = rt.cfg.data.web.searxng_url.replace(/\/+$/, "");
    if (!base)
        throw new Error("web.searxng_url is not set");
    const prev = rt.cfg.data.web.allow_private;
    rt.cfg.data.web.allow_private = true; // self-hosted search is usually on the LAN
    try {
        const res = await guardedFetch(rt, `${base}/search?q=${encodeURIComponent(q)}&format=json`, {}, signal);
        const j = await res.json();
        return (j.results ?? []).slice(0, n).map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? "" }));
    }
    finally {
        rt.cfg.data.web.allow_private = prev;
    }
}
async function brave(rt, q, n, signal) {
    const key = rt.cfg.secret(rt.cfg.data.web.brave_api_key_env);
    if (!key)
        throw new Error(`set ${rt.cfg.data.web.brave_api_key_env} in .env for Brave search`);
    const res = await guardedFetch(rt, `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`, { headers: { "X-Subscription-Token": key, accept: "application/json" } }, signal);
    const j = await res.json();
    return (j.web?.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: (r.description ?? "").replace(/<[^>]+>/g, "") }));
}
async function tavily(rt, q, n, signal) {
    const key = rt.cfg.secret(rt.cfg.data.web.tavily_api_key_env);
    if (!key)
        throw new Error(`set ${rt.cfg.data.web.tavily_api_key_env} in .env for Tavily search`);
    const res = await guardedFetch(rt, "https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: key, query: q, max_results: n }) }, signal);
    const j = await res.json();
    return (j.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? "" }));
}
const PROVIDERS = { duckduckgo: ddg, searxng: searx, brave, tavily };
/** Search with the configured provider (web.search_provider). */
export function searchWeb(rt, q, n, signal) {
    return (PROVIDERS[rt.cfg.data.web.search_provider] ?? ddg)(rt, q, n, signal);
}
export const webSearchTool = {
    name: "web_search", toolset: "web", tier: "slm", parallelSafe: true,
    description: "Search the web. Returns titles, URLs and snippets. Follow up with web_extract to read pages.",
    parameters: obj({ query: str("Search query"), max_results: int("Number of results (default 6, max 15)") }, ["query"]),
    async handler(a, ctx) {
        const n = Math.min(Number(a.max_results) || 6, 15);
        const prov = PROVIDERS[ctx.rt.cfg.data.web.search_provider] ?? ddg;
        const hits = await prov(ctx.rt, String(a.query), n, ctx.signal);
        if (!hits.length)
            return "no results";
        return hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`).join("\n");
    },
};
export async function extractUrl(rt, url, maxChars, signal) {
    const res = await guardedFetch(rt, url, {}, signal);
    if (!res.ok)
        return `${url}\nHTTP ${res.status} ${res.statusText}`;
    const ct = res.headers.get("content-type") ?? "";
    if (/pdf/i.test(ct))
        return `${url}\n(PDF document, ${res.headers.get("content-length") ?? "?"} bytes — download it with terminal (curl -o) and extract text with a PDF tool)`;
    if (/^image\//i.test(ct))
        return `${url}\n(image — use vision_analyze with this URL)`;
    const body = await res.text();
    if (/json/i.test(ct))
        return `${url}\n${truncateMiddle(body, maxChars)}`;
    if (/html|xml/i.test(ct) || /^\s*</.test(body)) {
        const title = htmlTitle(body);
        return `# ${title || url}\nSource: ${res.url || url}\n\n${truncateMiddle(htmlToText(body, url), maxChars, "use a narrower page or search")}`;
    }
    return `${url}\n${truncateMiddle(body, maxChars)}`;
}
export const webExtractTool = {
    name: "web_extract", toolset: "web", tier: "slm", parallelSafe: true,
    description: "Fetch one or more web pages and return their readable text (markdown-ish).",
    parameters: obj({ urls: arr(str("URL"), "URLs to fetch (max 5)"), url: str("Single URL (alternative to urls)"), max_chars: int("Max characters per page (default 15000)") }),
    async handler(a, ctx) {
        const urls = (Array.isArray(a.urls) ? a.urls : []).concat(a.url ? [a.url] : []).slice(0, 5);
        if (!urls.length)
            return "error: provide url or urls";
        const max = Math.min(Number(a.max_chars) || 15000, 60000);
        const parts = await Promise.all(urls.map((u) => extractUrl(ctx.rt, u, max, ctx.signal).catch((e) => `${u}\nerror: ${e.message}`)));
        return parts.join("\n\n---\n\n");
    },
};
