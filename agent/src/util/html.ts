/** Dependency-free HTML → readable text/markdown-ish conversion for web_extract. */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).trim().replace(/\s+/g, " ") : "";
}

export function htmlToText(html: string, baseUrl?: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|noscript|svg|iframe|template|head)[\s\S]*?<\/\1>/gi, "");
  // prefer main/article content if present
  const main = /<(main|article)[^>]*>([\s\S]*?)<\/\1>/i.exec(s);
  if (main && main[2].length > 500) s = main[2];
  s = s.replace(/<(nav|footer|aside|form)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n, t) => `\n\n${"#".repeat(Number(n))} ${t.replace(/<[^>]+>/g, "").trim()}\n\n`);
  s = s.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, t: string) => {
    const label = t.replace(/<[^>]+>/g, "").trim();
    if (!label) return "";
    let url = href;
    try { if (baseUrl) url = new URL(href, baseUrl).toString(); } catch { /* keep */ }
    return url.startsWith("javascript:") || url.startsWith("#") ? label : `[${label}](${url})`;
  });
  s = s.replace(/<li[^>]*>/gi, "\n- ").replace(/<\/(p|div|section|tr|ul|ol|table|blockquote|pre)>/gi, "\n\n");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/t[dh]>/gi, " | ");
  s = s.replace(/<(code)[^>]*>([\s\S]*?)<\/\1>/gi, "`$2`");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
