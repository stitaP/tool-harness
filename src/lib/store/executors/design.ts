/**
 * Executors for the agent design canvas (persisted, multi-call editing with
 * React/HTML/SVG/PNG/Figma-JSON export) and Indic / South-Indian typography.
 */
import {
  createCanvas, addArtboard, addElement, updateElement, removeElement, reorderLayer, groupElements, autoLayout, centerElements,
  createLandingPage, serializeCanvas, deserializeCanvas, exportToReact, exportToFigmaJson, COMPONENT_PRESETS, ARTBOARD_PRESETS,
  type CanvasState, type CanvasElement, type ElementKind, type Breakpoint,
} from "@/lib/design/agent-canvas";
import { SCRIPT_RULES, detectScript, detectAllScripts, scriptTypographyCSS, scriptDesignTokens, applyIndicStyle, NEWSPAPER_PRESETS, validateIndicTypography, type IndicScript } from "@/lib/design/indic-typography";
import { SOUTH_INDIAN_LANGUAGES, generateLanguageCSS, generateTailwindConfig, validateLanguageTypography, comparisonTable } from "@/lib/design/south-indian-typography";
import { execs, json, num, str, list, persisted, secret, nodeModule, isNode, dataDir, type ExecMap } from "./util";

// ─── canvas persistence ──────────────────────────────────────────────────────

const store = persisted<Record<string, string>>("design-canvases", () => ({}));
function load(id: string): CanvasState {
  const raw = store.get()[id] ?? Object.values(store.get()).find((s) => { try { return JSON.parse(s).name === id; } catch { return false; } });
  if (!raw) throw new Error(`canvas ${id} not found — design.canvas.create first (existing: ${Object.keys(store.get()).join(", ") || "none"})`);
  return deserializeCanvas(raw);
}
function put(s: CanvasState): CanvasState { store.get()[s.id] = serializeCanvas(s); store.save(); return s; }
const artboardOf = (s: CanvasState, id: string) => { const a = s.artboards.find((x) => x.id === id || x.name === id) ?? (id === "first" || id === "default" ? s.artboards[0] : undefined); if (!a) throw new Error(`artboard ${id} not found (${s.artboards.map((x) => `${x.id} "${x.name}"`).join(", ") || "none — design.artboard.add first"})`); return a; };
const elementOf = (s: CanvasState, id: string) => { const e = s.elements.get(id) ?? [...s.elements.values()].find((x) => x.name === id); if (!e) throw new Error(`element ${id} not found`); return e; };
const summary = (s: CanvasState) => ({ canvasId: s.id, name: s.name, artboards: s.artboards.map((a) => ({ id: a.id, name: a.name, breakpoint: a.breakpoint, size: `${a.width}×${a.height}`, elements: a.elementIds.length })), elements: s.elements.size, script: s.script });

// ─── HTML / SVG export ───────────────────────────────────────────────────────

const LANG: Record<string, string> = { telugu: "te", devanagari: "hi", bengali: "bn", tamil: "ta", kannada: "kn", malayalam: "ml", gujarati: "gu", gurmukhi: "pa", odia: "or" };
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
function cssOf(el: CanvasElement, abs: boolean): string {
  const st: Record<string, unknown> = { ...el.style };
  if (st.gradient) { st.background = st.gradient; delete st.gradient; }
  const parts = Object.entries(st).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${kebab(k)}:${v}`);
  if (abs) parts.push(`position:absolute`, `left:${el.bounds.x}px`, `top:${el.bounds.y}px`, `width:${el.bounds.width}px`, `height:${el.bounds.height}px`);
  if (el.flex) parts.push("display:flex", `flex-direction:${el.flex.direction ?? "row"}`, `gap:${el.flex.gap ?? "0"}`, `align-items:${({ start: "flex-start", end: "flex-end" } as any)[el.flex.align ?? ""] ?? el.flex.align ?? "stretch"}`, `justify-content:${({ start: "flex-start", end: "flex-end", between: "space-between", around: "space-around" } as any)[el.flex.justify ?? ""] ?? el.flex.justify ?? "flex-start"}`, ...(el.flex.wrap ? ["flex-wrap:wrap"] : []));
  if (el.grid) parts.push("display:grid", `grid-template-columns:repeat(${el.grid.columns},1fr)`, `gap:${el.grid.gap ?? "16px"}`);
  if (el.kind === "button" || el.kind === "badge") parts.push("display:inline-flex", "align-items:center", "justify-content:center", "border:none", "cursor:pointer");
  if (el.kind === "text" && !el.style.textAlign) parts.push("margin:0");
  parts.push("box-sizing:border-box");
  return parts.join(";");
}
function elHtml(el: CanvasElement, s: CanvasState, abs: boolean): string {
  if (el.hidden) return "";
  const style = cssOf(el, abs), lang = el.script ? ` lang="${LANG[el.script] ?? el.script}"` : "";
  const kids = el.children.map((c) => s.elements.get(c)).filter(Boolean).map((c) => elHtml(c!, s, false)).join("");
  const text = el.text ? esc(el.text) : "";
  switch (el.kind) {
    case "text": return `<p data-id="${el.id}" style="${style}"${lang}>${text}</p>`;
    case "button": return el.href ? `<a href="${esc(el.href)}" data-id="${el.id}" style="${style};text-decoration:none"${lang}>${text}</a>` : `<button data-id="${el.id}" style="${style}"${lang}>${text}</button>`;
    case "image": case "avatar": return `<img data-id="${el.id}" src="${esc(el.src ?? `https://placehold.co/${el.bounds.width}x${el.bounds.height}`)}" alt="${esc(el.alt ?? el.name)}" style="${style};object-fit:cover">`;
    case "input": return `<input data-id="${el.id}" placeholder="${esc(el.placeholder ?? el.text ?? "")}" style="${style}">`;
    case "divider": return `<hr data-id="${el.id}" style="${style};border:none;border-top:1px solid ${el.style.color ?? "#e4e4e7"}">`;
    case "icon": return `<span data-id="${el.id}" aria-label="${esc(el.icon ?? el.name)}" style="${style}">${esc(el.text ?? "●")}</span>`;
    case "nav": return `<nav data-id="${el.id}" style="${style}">${text}${kids}</nav>`;
    case "footer": return `<footer data-id="${el.id}" style="${style}">${text}${kids}</footer>`;
    case "section": case "hero": return `<section data-id="${el.id}" style="${style}"${lang}>${text}${kids}</section>`;
    default: return `<div data-id="${el.id}" style="${style}"${lang}>${text}${kids}</div>`;
  }
}
const fitHeight = (s: CanvasState, a: { height: number; elementIds: string[] }) => Math.max(a.height, ...a.elementIds.map((id) => { const e = s.elements.get(id); return e ? e.bounds.y + e.bounds.height : 0; }));
const childIds = (s: CanvasState) => new Set([...s.elements.values()].flatMap((e) => e.children));
function exportHtml(s: CanvasState, artboardId?: string): string {
  const abs = s.artboards.filter((a) => !artboardId || a.id === artboardId);
  const nested = childIds(s);
  const fonts = s.script ? scriptTypographyCSS(s.script, { includeFonts: true }) : "";
  const body = abs.map((a) => `<main data-artboard="${a.id}" aria-label="${esc(a.name)}" style="position:relative;width:${a.width}px;min-height:${fitHeight(s, a)}px;margin:0 auto 40px;background:${a.backgroundColor};overflow:hidden">\n${a.elementIds.map((id) => s.elements.get(id)).filter((e) => e && !nested.has(e.id)).sort((x, y) => s.layerOrder.indexOf(x!.id) - s.layerOrder.indexOf(y!.id)).map((e) => "  " + elHtml(e!, s, true)).join("\n")}\n</main>`).join("\n");
  return `<!doctype html>\n<html lang="${s.script ? LANG[s.script] ?? "en" : "en"}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(s.name)}</title>\n<style>\nbody{margin:0;background:#f4f4f5;font-family:${s.tokens.fonts?.sans ?? Object.values(s.tokens.fonts ?? {})[0] ?? "Inter, system-ui, sans-serif"}}\n${fonts}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}
function exportSvg(s: CanvasState, artboardId?: string): string {
  const a = artboardId ? artboardOf(s, artboardId) : s.artboards[0];
  if (!a) throw new Error("canvas has no artboards");
  const px = (v: unknown, d: number) => { const m = /([\d.]+)/.exec(String(v ?? "")); return m ? Number(m[1]) : d; };
  const items = a.elementIds.map((id) => s.elements.get(id)).filter((e): e is CanvasElement => !!e && !e.hidden).sort((x, y) => s.layerOrder.indexOf(x.id) - s.layerOrder.indexOf(y.id));
  const out = items.map((e) => {
    const { x, y, width: w, height: h } = e.bounds, rx = px(e.style.borderRadius, 0), fill = e.style.backgroundColor ?? (e.style.gradient ? "#6366f1" : "none"), op = e.style.opacity ?? 1;
    const rect = fill !== "none" || e.style.border ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(rx, h / 2)}" fill="${fill}" opacity="${op}"${e.style.border ? ` stroke="${/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i.exec(e.style.border)?.[0] ?? "#e4e4e7"}" stroke-width="${px(e.style.border, 1)}"` : ""}/>` : "";
    if (e.kind === "image" || e.kind === "avatar") return `<image href="${esc(e.src ?? "")}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${e.kind === "avatar" ? ` clip-path="circle(50%)"` : ""}/>`;
    if (e.kind === "divider") return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${e.style.color ?? "#e4e4e7"}"/>`;
    if (!e.text) return rect;
    const fs = px(e.style.fontSize, 16), anchor = e.kind === "button" || e.kind === "badge" || e.style.textAlign === "center" ? "middle" : e.style.textAlign === "right" ? "end" : "start";
    const tx = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x + px(e.style.padding, 0);
    const maxChars = Math.max(4, Math.floor((w - 2 * px(e.style.padding, 0)) / (fs * 0.55)));
    const lines = e.text.split(/\s+/).reduce<string[]>((acc, word) => { const last = acc[acc.length - 1]; if (last !== undefined && (last + " " + word).length <= maxChars) acc[acc.length - 1] = `${last} ${word}`; else acc.push(word); return acc; }, []);
    const lh = fs * (Number(e.style.lineHeight) || 1.3), total = lines.length * lh, ty = e.kind === "button" || e.kind === "badge" ? y + h / 2 - total / 2 + fs * 0.85 : y + fs;
    return `${rect}<text x="${tx}" y="${ty}" font-size="${fs}" font-weight="${e.style.fontWeight ?? 400}" fill="${e.style.color ?? "#09090b"}" text-anchor="${anchor}" font-family="${esc(e.style.fontFamily ?? (e.script ? SCRIPT_RULES[e.script].recommendedFonts.join(", ") : "Inter, Arial, sans-serif"))}">${lines.map((l, k) => `<tspan x="${tx}" dy="${k ? lh : 0}">${esc(l)}</tspan>`).join("")}</text>`;
  }).join("\n  ");
  const H = fitHeight(s, a);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.width}" height="${H}" viewBox="0 0 ${a.width} ${H}">\n  <rect width="100%" height="100%" fill="${a.backgroundColor}"/>\n  ${out}\n</svg>\n`;
}

async function screenshotHtml(html: string, file: string, width: number): Promise<boolean> {
  try {
    const req = nodeModule("node:module").createRequire(process.cwd() + "/");
    let pw: any;
    try { pw = req("playwright"); } catch { pw = req("playwright-core"); }
    const b = await pw.chromium.launch({ executablePath: secret("STITAP_CHROMIUM") || undefined });
    try { const p = await b.newPage({ viewport: { width, height: 800 } }); await p.setContent(html, { waitUntil: "networkidle" }); await p.screenshot({ path: file, fullPage: true }); return true; } finally { await b.close(); }
  } catch { return false; }
}

function writeExport(name: string, ext: string, content: string): string | undefined {
  const fs = nodeModule("node:fs"), path = nodeModule("node:path");
  if (!fs || !dataDir()) return undefined;
  const f = path.join(dataDir()!, "exports", `${name.replace(/[^\w.-]+/g, "-").toLowerCase()}.${ext}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}

// ─── typography helpers ──────────────────────────────────────────────────────

const SCRIPTS = Object.keys(SCRIPT_RULES) as IndicScript[];
const script = (v: unknown): IndicScript => { const s = str(v).toLowerCase().replace(/^hindi$|^marathi$|^nepali$|^sanskrit$/, "devanagari").replace(/^punjabi$/, "gurmukhi").replace(/^oriya$/, "odia") as IndicScript; if (!SCRIPTS.includes(s)) throw new Error(`unknown script "${str(v)}" (${SCRIPTS.join(", ")})`); return s; };
const PRESET_INDEX: Record<string, number> = { main: 0, headline: 1, feature: 2, breaking: 3 };
function pickPreset<T extends { name: string }>(arr: T[], key: string): T {
  if (!arr?.length) throw new Error("no newspaper presets for this script");
  return arr.find((p) => p.name.toLowerCase().includes(key.toLowerCase())) ?? arr[Math.min(PRESET_INDEX[key] ?? 0, arr.length - 1)];
}
function presetCss(p: { columns: number; columnWidth: string; gap: string; lineHeight: number; fontSize: string; fontFamily: string }, sel: string) {
  return `${sel} {\n  column-count: ${p.columns};\n  column-width: ${p.columnWidth};\n  column-gap: ${p.gap};\n  column-rule: 1px solid #d4d4d8;\n  font-family: ${p.fontFamily};\n  font-size: ${p.fontSize};\n  line-height: ${p.lineHeight};\n  letter-spacing: 0;\n  text-align: justify;\n  hyphens: none;\n}\n${sel} p { margin: 0 0 0.8em; orphans: 3; widows: 3; }`;
}
const cssObj = (v: unknown): Record<string, unknown> => {
  const j = json<any>(v, null);
  if (j && typeof j === "object") return j;
  // accept raw CSS declarations: "font-size: 16px; line-height: 1.8"
  return Object.fromEntries(str(v).replace(/[{}]/g, ";").split(";").map((d) => d.split(":")).filter((p) => p.length >= 2 && p[0].trim() && !p[0].includes("@")).map(([k, ...r]) => [k.trim().replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()), r.join(":").trim()]));
};

const SAMPLE: Record<IndicScript, { headline: string; body: string }> = {
  telugu: { headline: "తెలుగు వార్తలు", body: "హైదరాబాద్‌లో నేడు కొత్త మెట్రో మార్గం ప్రారంభమైంది. ప్రయాణికులకు ఇది ఎంతో ఉపయోగకరంగా ఉంటుంది." },
  devanagari: { headline: "आज की मुख्य ख़बरें", body: "दिल्ली में आज नई मेट्रो लाइन शुरू हुई। यात्रियों के लिए यह बहुत उपयोगी होगी।" },
  bengali: { headline: "আজকের প্রধান খবর", body: "কলকাতায় আজ নতুন মেট্রো লাইন চালু হয়েছে। যাত্রীদের জন্য এটি খুবই উপকারী হবে।" },
  tamil: { headline: "இன்றைய முக்கிய செய்திகள்", body: "சென்னையில் இன்று புதிய மெட்ரோ வழித்தடம் தொடங்கப்பட்டது. பயணிகளுக்கு இது மிகவும் பயனுள்ளதாக இருக்கும்." },
  kannada: { headline: "ಇಂದಿನ ಪ್ರಮುಖ ಸುದ್ದಿಗಳು", body: "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಇಂದು ಹೊಸ ಮೆಟ್ರೋ ಮಾರ್ಗ ಆರಂಭವಾಯಿತು. ಪ್ರಯಾಣಿಕರಿಗೆ ಇದು ತುಂಬಾ ಉಪಯುಕ್ತವಾಗಿದೆ." },
  malayalam: { headline: "ഇന്നത്തെ പ്രധാന വാർത്തകൾ", body: "കൊച്ചിയിൽ ഇന്ന് പുതിയ മെട്രോ പാത തുറന്നു. യാത്രക്കാർക്ക് ഇത് ഏറെ ഉപകാരപ്രദമാകും." },
  gujarati: { headline: "આજના મુખ્ય સમાચાર", body: "અમદાવાદમાં આજે નવી મેટ્રો લાઇન શરૂ થઈ. મુસાફરો માટે આ ખૂબ ઉપયોગી થશે." },
  gurmukhi: { headline: "ਅੱਜ ਦੀਆਂ ਮੁੱਖ ਖ਼ਬਰਾਂ", body: "ਅੰਮ੍ਰਿਤਸਰ ਵਿੱਚ ਅੱਜ ਨਵੀਂ ਬੱਸ ਸੇਵਾ ਸ਼ੁਰੂ ਹੋਈ। ਯਾਤਰੀਆਂ ਲਈ ਇਹ ਬਹੁਤ ਲਾਭਦਾਇਕ ਹੋਵੇਗੀ।" },
  odia: { headline: "ଆଜିର ମୁଖ୍ୟ ଖବର", body: "ଭୁବନେଶ୍ୱରରେ ଆଜି ନୂଆ ବସ୍ ସେବା ଆରମ୍ଭ ହେଲା। ଯାତ୍ରୀଙ୍କ ପାଇଁ ଏହା ବହୁତ ଉପଯୋଗୀ ହେବ।" },
} as any;

function southIndian(lang: "telugu" | "kannada" | "tamil" | "malayalam") {
  const cfg = SOUTH_INDIAN_LANGUAGES[lang];
  return {
    [`typography.${lang}.css`]: (i: Record<string, unknown>) => {
      let css = generateLanguageCSS(lang as any);
      if (i.selector) css = css.replace(/:lang\(\w+\)|\[lang="?\w+"?\]|\.lang-\w+/g, str(i.selector));
      if (i.includeFonts === false) css = css.replace(/@import[^;]+;\n?/g, "");
      return { language: lang, css, file: writeExport(`${lang}-typography`, "css", css) };
    },
    [`typography.${lang}.validate`]: (i: Record<string, unknown>) => { const v = validateLanguageTypography(lang as any, cssObj(i.css)); return { language: lang, valid: !v.some((x: any) => x.severity === "error"), violations: v }; },
    [`typography.${lang}.newspaper`]: (i: Record<string, unknown>) => { const p = pickPreset(cfg.newspaperPresets, str(i.preset, "main")); const css = presetCss(p, `.${lang}-newspaper`); return { language: lang, preset: p, css, html: `<article class="${lang}-newspaper" lang="${cfg.code}"><h2>${SAMPLE[lang as IndicScript]?.headline ?? ""}</h2><p>${SAMPLE[lang as IndicScript]?.body ?? ""}</p></article>` }; },
    [`typography.${lang}.tailwind`]: () => { const c = generateTailwindConfig(lang as any); return { language: lang, config: c, snippet: `// tailwind.config.js → theme.extend\n${JSON.stringify(c, null, 2)}` }; },
  };
}

// ─── executors ───────────────────────────────────────────────────────────────

const kindDefaults = (k: ElementKind): Record<string, string> => ({ button: { backgroundColor: "#4f46e5", color: "#ffffff", borderRadius: "8px", padding: "12px 24px", fontWeight: "600" }, card: { backgroundColor: "#ffffff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,.12)", padding: "24px" }, input: { border: "1px solid #d4d4d8", borderRadius: "8px", padding: "10px 12px" }, badge: { backgroundColor: "#eef2ff", color: "#4338ca", borderRadius: "999px", padding: "2px 10px", fontSize: "12px" }, text: { color: "#09090b" } } as any)[k] ?? {};

export const DESIGN_EXECUTORS: ExecMap = execs({
  "design.canvas.create": (i) => { const s = put(createCanvas({ name: i.name ? str(i.name) : undefined, description: i.description ? str(i.description) : undefined, tokens: i.tokens ? json<any>(i.tokens) : undefined })); return { ...summary(s), tokens: s.tokens, next: "design.artboard.add or design.landing.create" }; },
  "design.artboard.add": (i) => {
    const r = addArtboard(load(str(i.canvasId)), { name: i.name ? str(i.name) : undefined, breakpoint: i.breakpoint ? (str(i.breakpoint) as Breakpoint) : undefined, width: i.width ? num(i.width) : undefined, height: i.height ? num(i.height) : undefined, backgroundColor: i.backgroundColor ? str(i.backgroundColor) : undefined });
    put(r.state); return { artboard: r.artboard, presets: Object.keys(ARTBOARD_PRESETS) };
  },
  "design.element.add": (i) => {
    const s = load(str(i.canvasId)), ab = artboardOf(s, str(i.artboardId)), kind = str(i.kind) as ElementKind;
    let style: Record<string, unknown> = { ...kindDefaults(kind), ...Object.fromEntries(["backgroundColor", "color", "fontSize", "fontWeight", "borderRadius", "padding", "textAlign"].filter((k) => i[k] !== undefined).map((k) => [k, str(i[k])])) };
    const sc = i.text ? detectScript(str(i.text)) : null;
    if (sc) style = applyIndicStyle(sc, kind, style);
    const r = addElement(s, ab.id, { kind, name: str(i.name, kind), bounds: { x: num(i.x, 0), y: num(i.y, 0), width: num(i.width), height: num(i.height) }, style: style as any, children: [], text: i.text ? str(i.text) : undefined, src: i.src ? str(i.src) : undefined, icon: i.icon ? str(i.icon) : undefined, href: i.href ? str(i.href) : undefined, ...(sc ? { script: sc } : {}) });
    if (r.element.bounds.x + r.element.bounds.width > ab.width) (r.element as any).warning = `extends past artboard width ${ab.width}`;
    put(r.state); return { element: r.element, artboardId: ab.id };
  },
  "design.preset.add": (i) => {
    let s = load(str(i.canvasId));
    const ab = artboardOf(s, str(i.artboardId)), p = COMPONENT_PRESETS[str(i.preset)];
    if (!p) throw new Error(`unknown preset (${Object.keys(COMPONENT_PRESETS).join(", ")})`);
    const dy = num(i.offsetY, Math.max(0, ...ab.elementIds.map((id) => { const e = s.elements.get(id); return e ? e.bounds.y + e.bounds.height : 0; })));
    const scale = ab.width / 1440, ids: string[] = [];
    for (const el of p.elements) { const r = addElement(s, ab.id, { ...el, children: [], bounds: { x: Math.round(el.bounds.x * scale), y: el.bounds.y + dy, width: Math.round(el.bounds.width * scale), height: el.bounds.height } } as any); s = r.state; ids.push(r.element.id); }
    put(s); return { preset: str(i.preset), name: p.name, elementIds: ids, offsetY: dy };
  },
  "design.layout.auto": (i) => {
    let s = load(str(i.canvasId)); const ab = artboardOf(s, str(i.artboardId));
    s = str(i.mode) === "center" ? centerElements(s, ab.id) : autoLayout(s, ab.id, { direction: str(i.mode, "column") === "row" ? "row" : "column", gap: num(i.gap, 16), align: (str(i.align, "start") as any), padding: num(i.padding, 0) });
    put(s); return { artboardId: ab.id, positions: artboardOf(s, ab.id).elementIds.map((id) => { const e = s.elements.get(id)!; return { id, name: e.name, ...e.bounds }; }) };
  },
  "design.element.group": (i) => { const s0 = load(str(i.canvasId)); const ab = artboardOf(s0, str(i.artboardId)); const ids = list(i.elementIds).map((x) => elementOf(s0, x).id); if (ids.length < 2) throw new Error("group needs at least 2 elements"); const r: any = groupElements(s0, ab.id, ids, str(i.name, "Group")); const s = r.state ?? r; put(s); return { group: r.group ?? [...s.elements.values()].find((e: CanvasElement) => e.kind === "group" && ids.every((id) => e.children.includes(id))), grouped: ids.length }; },
  "design.landing.create": (i) => { const r = createLandingPage(load(str(i.canvasId)), { title: i.title ? str(i.title) : undefined, subtitle: i.subtitle ? str(i.subtitle) : undefined, cta: i.cta ? str(i.cta) : undefined, brand: i.brand ? str(i.brand) : undefined }); put(r.state); return { artboardId: r.artboardId, ...summary(r.state) }; },
  "design.element.update": (i) => { const s = load(str(i.canvasId)); const e = elementOf(s, str(i.elementId)); const patch = json<any>(i.patch); const styleKeys = ["backgroundColor", "color", "fontSize", "fontWeight", "fontFamily", "borderRadius", "padding", "textAlign", "lineHeight", "opacity", "boxShadow", "border", "gradient"]; const p: any = { ...patch }; const style = { ...e.style, ...(patch.style ?? {}) }; for (const k of styleKeys) if (k in p) { style[k as keyof typeof style] = p[k]; delete p[k]; } const bounds = { ...e.bounds, ...(patch.bounds ?? {}), ...Object.fromEntries(["x", "y", "width", "height"].filter((k) => k in p).map((k) => [k, num(p[k])])) }; for (const k of ["x", "y", "width", "height", "bounds"]) delete p[k]; const s2 = put(updateElement(s, e.id, { ...p, style, bounds })); return { element: s2.elements.get(e.id) }; },
  "design.element.remove": (i) => { const s = load(str(i.canvasId)); const e = elementOf(s, str(i.elementId)); const s2 = put(removeElement(s, e.id)); return { removed: e.id, elements: s2.elements.size }; },
  "design.layer.reorder": (i) => { const s = load(str(i.canvasId)); const e = elementOf(s, str(i.elementId)); const s2 = put(reorderLayer(s, e.id, str(i.direction) as any)); return { elementId: e.id, layerIndex: s2.layerOrder.indexOf(e.id), layers: s2.layerOrder.length }; },
  "design.export": async (i) => {
    const s = load(str(i.canvasId)), fmt = str(i.format, "react"), ab = i.artboardId ? artboardOf(s, str(i.artboardId)).id : undefined;
    if (!s.artboards.length) throw new Error("canvas is empty — add an artboard first");
    if (fmt === "figma-json") { const j = exportToFigmaJson(s); return { format: fmt, json: j, file: writeExport(s.name, "figma.json", JSON.stringify(j, null, 2)) }; }
    if (fmt === "react") { const code = exportToReact(s, ab); return { format: fmt, code, file: writeExport(s.name, "tsx", code), note: "uses Tailwind classes" }; }
    if (fmt === "svg") { const svg = exportSvg(s, ab); return { format: fmt, svg, file: writeExport(s.name, "svg", svg) }; }
    const html = exportHtml(s, ab);
    if (fmt === "png") {
      if (!isNode()) throw new Error("PNG export needs the agent runtime");
      const fs = nodeModule("node:fs"), path = nodeModule("node:path");
      const f = path.join(dataDir() ?? ".", "exports", `${s.name.replace(/[^\w.-]+/g, "-").toLowerCase()}.png`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (!(await screenshotHtml(html, f, Math.max(...s.artboards.map((a) => a.width))))) throw new Error("PNG export needs Playwright + Chromium (npm i -g playwright && npx playwright install chromium); export svg or html instead");
      return { format: fmt, file: f, bytes: fs.statSync(f).size };
    }
    return { format: "html", html, file: writeExport(s.name, "html", html) };
  },
  "design.indic.create": (i) => {
    const sc = script(i.script), layout = str(i.layout, "website"), rules = SCRIPT_RULES[sc], sample = SAMPLE[sc];
    let s = createCanvas({ name: str(i.name, `${rules.name ?? sc} ${layout}`) });
    s = { ...s, script: sc };
    const { state, artboard } = addArtboard(s, { breakpoint: "desktop", name: `${layout} (${sc})` });
    s = state;
    const font = rules.recommendedFonts.join(", ");
    const add = (kind: ElementKind, name: string, b: [number, number, number, number], text: string | undefined, style: Record<string, unknown>) => { const r = addElement(s, artboard.id, { kind, name, bounds: { x: b[0], y: b[1], width: b[2], height: b[3] }, style: applyIndicStyle(sc, kind, { fontFamily: font, ...style }) as any, children: [], text, script: sc }); s = r.state; return r.element.id; };
    add("nav", "Masthead", [0, 0, 1440, 72], layout === "newspaper" ? sample.headline : (rules.name ?? sc), { backgroundColor: layout === "newspaper" ? "#ffffff" : "#09090b", color: layout === "newspaper" ? "#09090b" : "#ffffff", fontSize: layout === "newspaper" ? "40px" : "22px", fontWeight: "700", padding: "16px 48px", borderBottom: "3px double #09090b" });
    if (layout === "newspaper") {
      for (let c = 0; c < 4; c++) add("text", `Column ${c + 1}`, [48 + c * 340, 120, 316, 600], `${sample.body} ${sample.body}`, { fontSize: "17px", color: "#18181b", textAlign: "left" });
    } else if (layout === "blog") {
      add("text", "Title", [320, 120, 800, 120], sample.headline, { fontSize: "44px", fontWeight: "700" });
      add("text", "Body", [320, 260, 720, 400], `${sample.body} ${sample.body} ${sample.body}`, { fontSize: "19px", color: "#27272a" });
    } else {
      add("hero", "Hero", [0, 72, 1440, 520], undefined, { backgroundColor: "#4f46e5" });
      add("text", "Headline", [220, 200, 1000, 120], sample.headline, { fontSize: "56px", fontWeight: "700", color: "#ffffff", textAlign: "center" });
      add("text", "Sub", [320, 340, 800, 100], sample.body, { fontSize: "20px", color: "#e0e7ff", textAlign: "center" });
      add("button", "CTA", [620, 470, 200, 56], sc === "telugu" ? "ప్రారంభించండి →" : "Get started →", { backgroundColor: "#ffffff", color: "#4f46e5", borderRadius: "10px", fontWeight: "700" });
    }
    put(s);
    return { ...summary(s), artboardId: artboard.id, rules: { lineHeight: rules.lineHeightRecommended, fonts: rules.recommendedFonts }, next: `design.export canvasId=${s.id} format=html` };
  },

  // Indic typography (all scripts)
  "typography.indic.detect": (i) => { const t = str(i.text), main = detectScript(t), all = detectAllScripts(t); return { script: main, scripts: all, mixed: all.length > 1, rules: main ? { fonts: SCRIPT_RULES[main].recommendedFonts, langCode: LANG[main] } : null }; },
  "typography.indic.rules": (i) => ({ script: script(i.script), rules: SCRIPT_RULES[script(i.script)] }),
  "typography.indic.css": (i) => { const sc = script(i.script), css = scriptTypographyCSS(sc, { selector: i.selector ? str(i.selector) : undefined, includeFonts: i.includeFonts === undefined ? true : !!i.includeFonts }); return { script: sc, css, file: writeExport(`${sc}-typography`, "css", css) }; },
  "typography.indic.tokens": (i) => ({ script: script(i.script), tokens: scriptDesignTokens(script(i.script)) }),
  "typography.indic.validate": (i) => { const v = validateIndicTypography(script(i.script), cssObj(i.css)); return { script: script(i.script), valid: !v.some((x: any) => x.severity === "error"), violations: v }; },
  "typography.indic.newspaper": (i) => { const sc = script(i.script), p = pickPreset(NEWSPAPER_PRESETS[sc], str(i.preset, "main")); return { script: sc, preset: p, css: presetCss(p, `.${sc}-newspaper`), html: `<article class="${sc}-newspaper" lang="${LANG[sc] ?? sc}"><h2>${SAMPLE[sc].headline}</h2><p>${SAMPLE[sc].body}</p></article>` }; },

  // South-Indian language packs
  ...southIndian("telugu"), ...southIndian("kannada"), ...southIndian("tamil"), ...southIndian("malayalam"),
  "typography.south-indian.compare": () => ({ markdown: comparisonTable(), languages: Object.values(SOUTH_INDIAN_LANGUAGES).map((c) => ({ code: c.code, name: c.name, nativeName: c.nativeName, bodyFontSize: c.fontSize.body, lineHeight: c.lineHeight.recommended, fonts: c.fonts.sans.slice(0, 2), complexConjuncts: c.hasComplexConjuncts })) }),
});
