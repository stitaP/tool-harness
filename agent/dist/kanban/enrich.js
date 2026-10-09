import { searchWeb, extractUrl } from "../tools/web.js";
import { isOfficialDoc } from "../tools/docs.js";
/** Words the phase specs use that a small model may not know well. Each query is a generic documentation search. */
export const TERMS = [
    { id: "aria-label", re: /\baria-label\b/, query: "aria-label attribute", label: "aria-label", key: "aria-label" },
    { id: "aria-labelledby", re: /\baria-labelledby\b/, query: "aria-labelledby attribute", label: "aria-labelledby", key: "aria-labelledby" },
    { id: "aria-describedby", re: /\baria-describedby\b/, query: "aria-describedby attribute", label: "aria-describedby", key: "aria-describedby" },
    { id: "aria-current", re: /\baria-current\b/, query: "aria-current attribute", label: "aria-current", key: "aria-current" },
    { id: "aria-live", re: /\baria-live\b|role="(?:status|alert)"/, query: "aria-live regions", label: "aria-live / role=status / role=alert", key: "live region" },
    { id: "aria-expanded", re: /\baria-expanded\b|\baria-controls\b/, query: "aria-expanded attribute", label: "aria-expanded / aria-controls", key: "aria-expanded" },
    { id: "aria-selected", re: /\baria-selected\b|role="tab(?:list|panel)?"/, query: "ARIA tab role", label: "tabs: role=tab, tablist, tabpanel, aria-selected", key: "tab" },
    { id: "aria-invalid", re: /\baria-invalid\b/, query: "aria-invalid attribute", label: "aria-invalid", key: "aria-invalid" },
    { id: "aria-hidden", re: /\baria-hidden\b/, query: "aria-hidden attribute", label: "aria-hidden", key: "aria-hidden" },
    { id: "dialog", re: /<dialog\b|\bshowModal\b|\bdialog element\b/i, query: "HTML dialog element showModal", label: "<dialog> and showModal()", key: "dialog" },
    { id: "localstorage", re: /\blocalStorage\b/, query: "Window localStorage", label: "localStorage", key: "localstorage" },
    { id: "jwt", re: /\bJWT\b|\bHS256\b|\bbearer token\b/i, query: "JSON Web Token JWT RFC 7519", label: "JWT (HS256)", key: "token" },
    { id: "hmac", re: /\bHMAC\b|createHmac/, query: "Node.js crypto createHmac", label: "HMAC (crypto.createHmac)", key: "hmac" },
    { id: "scrypt", re: /\bscrypt\b|\bpbkdf2\b/i, query: "Node.js crypto scrypt", label: "crypto.scrypt (password hashing)", key: "scrypt" },
    { id: "timingsafe", re: /timingSafeEqual/, query: "Node.js crypto timingSafeEqual", label: "crypto.timingSafeEqual", key: "timingsafeequal" },
    { id: "grid", re: /grid-template|display:\s*grid/, query: "CSS grid-template-columns", label: "CSS grid-template-columns", key: "grid" },
    { id: "clamp", re: /\bclamp\(/, query: "CSS clamp() function", label: "CSS clamp()", key: "clamp" },
    { id: "reduced-motion", re: /prefers-reduced-motion/, query: "prefers-reduced-motion media query", label: "prefers-reduced-motion", key: "reduce" },
    { id: "focus-visible", re: /:focus-visible/, query: "CSS :focus-visible", label: ":focus-visible", key: "focus" },
    { id: "preconnect", re: /rel="preconnect"|\bpreconnect\b/, query: "link rel preconnect", label: "<link rel=\"preconnect\">" },
    { id: "lazy", re: /loading="lazy"|\bloading=.lazy/, query: "img loading attribute lazy", label: "loading=\"lazy\"" },
    { id: "opengraph", re: /\bog:[a-z]+|Open Graph/i, query: "Open Graph protocol meta tags", label: "Open Graph tags (og:title …)", key: "open graph" },
    { id: "sitemap", re: /sitemap\.xml|\bsitemap\b/i, query: "sitemap.xml format", label: "sitemap.xml", key: "sitemap" },
    { id: "robots", re: /robots\.txt/, query: "robots.txt", label: "robots.txt", key: "robots" },
    { id: "noindex", re: /\bnoindex\b/, query: "robots meta tag noindex", label: "noindex", key: "noindex" },
    { id: "theme-color", re: /theme-color/, query: "meta theme-color", label: "meta theme-color", key: "theme" },
    { id: "viewport", re: /name="viewport"/, query: "meta viewport", label: "meta viewport", key: "viewport" },
    { id: "numberformat", re: /Intl\.NumberFormat|en-IN\b/, query: "Intl.NumberFormat currency", label: "Intl.NumberFormat (en-IN)", key: "numberformat" },
    { id: "localecompare", re: /localeCompare/, query: "String localeCompare", label: "String.localeCompare", key: "localecompare" },
    { id: "node-test", re: /node:test|node --test/, query: "Node.js test runner", label: "node:test (the test runner)", key: "test runner" },
    { id: "node-http", re: /http\.createServer|createServer\(/, query: "Node.js http createServer", label: "http.createServer", key: "createserver" },
    { id: "fetch", re: /\bfetch\(/, query: "Fetch API", label: "fetch()", key: "fetch" },
    { id: "skiplink", re: /skip-link|skip link/i, query: "skip navigation link accessibility", label: "skip link", key: "skip" },
    { id: "intersection", re: /IntersectionObserver/, query: "IntersectionObserver", label: "IntersectionObserver", key: "intersectionobserver" },
    { id: "csp", re: /Content-Security-Policy/, query: "Content-Security-Policy header", label: "Content-Security-Policy", key: "content security policy" },
    { id: "samesite", re: /\bSameSite\b|\bHttpOnly\b/, query: "Set-Cookie SameSite HttpOnly", label: "cookie flags (SameSite, HttpOnly)", key: "samesite" },
    { id: "cors", re: /\bCORS\b/, query: "Cross-Origin Resource Sharing CORS", label: "CORS", key: "cross-origin" },
];
export const NOTES_MARK = "REFERENCE NOTES";
/** Standards bodies and specs that count as official for the terms above (added to the harness's list of official documentation sites). */
export const ENRICH_DOMAINS = ["datatracker.ietf.org", "www.rfc-editor.org", "ogp.me", "www.sitemaps.org", "developers.google.com/search", "owasp.org", "schema.org", "www.robotstxt.org", "www.w3.org", "html.spec.whatwg.org"];
const NOISE = /^(Source:|Baseline\b|Widely available|Limited availability|Newly available|Experimental|Deprecated|Non-standard|Secure context|Note:|See full compatibility|Learn more|Skip to|Table of|Last modified|Search|Menu|Sign in|Report a problem|This feature (?:is|has|works|was)|This page was)/i;
const strip = (l) => l.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
/** The paragraph of a documentation page that explains the thing, in plain words (skips titles, banners, link lists). Prefers one that names the term. */
export function firstParagraph(text, term) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !/^(#|\||-\s*$|[-*]\s)/.test(l) && !/^https?:\/\//.test(l));
    const cand = lines.map(strip).filter((l) => l.length >= 70 && /[a-z]{4}/.test(l) && !NOISE.test(l) && !/\b(browser versions|compatibility|available across browsers)\b/i.test(l));
    const key = (term ?? "").toLowerCase();
    const first = (l) => (l.match(/[^.!?]+[.!?]+(?:\s|$)/) ?? [l])[0].toLowerCase();
    const para = (key && (cand.find((l) => first(l).includes(key)) ?? cand.find((l) => l.toLowerCase().includes(key)))) || cand[0] || "";
    const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [para];
    let out = sentences[0]?.trim() ?? "";
    if (out.length < 90 && sentences[1])
        out = `${out} ${sentences[1].trim()}`; // a very short first sentence: add the next one
    if (out.length > 320)
        out = out.slice(0, 317).replace(/\s+\S*$/, "") + "…"; // never cut a word in half
    return out;
}
export function termsIn(c) {
    const text = `${c.title}\n${c.body}\n${(c.acceptance ?? []).join("\n")}`;
    return TERMS.filter((t) => t.re.test(text));
}
const cacheKey = (id) => `kanban_ref:${id}`;
export async function enrichBoard(rt, o = {}) {
    const K = rt.kanban, say = o.onProgress ?? (() => undefined);
    if ((rt.cfg.data.web.docs_lookup ?? "ask") === "never")
        return { cards: 0, notes: 0, terms: 0, looked_up: 0, failed: [], skipped: "web lookups are turned off (web.docs_lookup: never)" };
    const extra = [...(rt.cfg.data.web.docs_domains ?? []), ...ENRICH_DOMAINS];
    const f = o.fetcher ?? {
        search: (q) => searchWeb(rt, q, 12, o.signal),
        extract: (url) => extractUrl(rt, url, 6000, o.signal),
    };
    const board = o.board ? K.boards.get(o.board)?.id : undefined;
    const cards = K.list(undefined, board).filter((c) => c.type !== "epic" && !c.body.includes(NOTES_MARK));
    const need = new Map();
    const perCard = new Map();
    for (const c of cards) {
        const t = termsIn(c).slice(0, o.maxTermsPerCard ?? 6);
        if (t.length) {
            perCard.set(c.id, t);
            for (const x of t)
                need.set(x.id, x);
        }
    }
    const failed = [];
    let looked = 0;
    for (const t of need.values()) {
        if (o.signal?.aborted)
            break;
        if (rt.db.getMeta(cacheKey(t.id)))
            continue;
        say(`looking up: ${t.query}`);
        try {
            const hits = (await f.search(`${t.query} official documentation`)).filter((h) => isOfficialDoc(h.url, extra));
            if (!hits.length) {
                failed.push(`${t.label}: no official page found`);
                continue;
            }
            let summary = "", url = "";
            for (const h of hits.slice(0, 3)) { // the first official page may be a table of contents: try the next ones
                const text = await f.extract(h.url).catch(() => "");
                summary = firstParagraph(text, t.key ?? t.id.replace(/-.*/, ""));
                if (summary.length >= 40) {
                    url = h.url;
                    break;
                }
            }
            if (!url) {
                failed.push(`${t.label}: no readable summary on the official pages`);
                continue;
            }
            rt.db.setMeta(cacheKey(t.id), { term: t.id, label: t.label, summary, url, at: Date.now() });
            looked++;
        }
        catch (e) {
            failed.push(`${t.label}: ${String(e?.message ?? e).split("\n")[0].slice(0, 100)}`);
        }
    }
    let changed = 0, notes = 0;
    for (const c of cards) {
        const found = (perCard.get(c.id) ?? []).map((t) => rt.db.getMeta(cacheKey(t.id))).filter((n) => !!n);
        if (!found.length)
            continue;
        const text = [`${NOTES_MARK} (looked up on official sites; read them if a word is new to you)`, ...found.map((n) => `- ${n.label}: ${n.summary} (source: ${n.url})`)].join("\n");
        K.update(c.id, { body: `${c.body}\n\n${text}` }, { by: "enrich", reason: `added ${found.length} reference note(s) from official docs` });
        changed++;
        notes += found.length;
    }
    return { cards: changed, notes, terms: need.size, looked_up: looked, failed };
}
export function describeEnrich(r) {
    if (r.skipped)
        return `Nothing done: ${r.skipped}.`;
    return `Added ${r.notes} reference note(s) to ${r.cards} ticket(s) (${r.terms} terms found, ${r.looked_up} looked up now, the rest from the cache).${r.failed.length ? `\nNot found: ${r.failed.join("; ")}` : ""}`;
}
