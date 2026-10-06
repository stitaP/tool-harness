/**
 * Browser QA, visual and design executors (Playwright, agent runtime only):
 * vision helpers, performance / accessibility / responsive / security / SEO
 * audits, visual regression, form & API testing, design-guideline checks.
 * Vision tools send the screenshot to the configured model when one exists;
 * otherwise they return the deterministic DOM/pixel analysis and say so.
 */
import { generateDesignAuditCDP, generateColorPaletteCDP, generateTypographyCDP, generateSpacingCDP, generateComponentQACDP } from "@/lib/store/tools/browser-design-tools";
import { ALL_RULES, RULES_BY_SOURCE, FLUENT_SPACING_RAMP, WCAG_CONTRAST, TOUCH_TARGETS } from "@/lib/design/guidelines";
import { callLlm, hasLlm, llmJson } from "./hooks";
import { pageFor, session, goto, saveShot, dataUrl, sel, snapshot, type Sess } from "./browser";
import { execs, num, str, bool, list, json, nodeModule, dataDir, r2, type ExecMap } from "./util";

const B = () => (globalThis as any).Buffer;
const b64 = (buf: Uint8Array) => B().from(buf).toString("base64");
/** Run one of the CDP-generator scripts (Runtime.evaluate expression returning JSON) in the page. */
async function runScript(page: any, cmds: { method: string; params: Record<string, unknown> }[]): Promise<any> {
  const ev = cmds.find((c) => c.method === "Runtime.evaluate");
  if (!ev) throw new Error("no evaluate script");
  const v = await page.evaluate(String(ev.params.expression));
  try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return v; }
}

// ─── colour maths ────────────────────────────────────────────────────────────

const hex2rgb = (h: string): [number, number, number] => { const x = h.replace("#", ""); const f = x.length === 3 ? x.split("").map((c) => c + c).join("") : x.slice(0, 6); return [0, 2, 4].map((k) => parseInt(f.slice(k, k + 2), 16)) as [number, number, number]; };
const rgb2hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const parseColor = (c: string): [number, number, number, number] | null => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c); if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]; if (/^#[0-9a-f]{3,8}$/i.test(c)) return [...hex2rgb(c), 1]; return null; };
const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return r2((x + 0.05) / (y + 0.05), 2); };
function rgb2hsl([r, g, b]: number[]): [number, number, number] { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
function hsl2rgb(h: number, s: number, l: number): [number, number, number] { const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0) * 255, f(8) * 255, f(4) * 255]; }
function scale(hex: string): Record<string, string> {
  const [h, s] = rgb2hsl(hex2rgb(hex));
  const L: Record<string, number> = { 50: 0.97, 100: 0.94, 200: 0.86, 300: 0.76, 400: 0.64, 500: 0.52, 600: 0.44, 700: 0.36, 800: 0.28, 900: 0.2, 950: 0.12 };
  return Object.fromEntries(Object.entries(L).map(([k, l]) => [k, rgb2hex(...hsl2rgb(h, Math.min(1, s * (l > 0.9 || l < 0.2 ? 0.8 : 1)), l))]));
}
function palette(brand: string, standard: string, dark: boolean) {
  const [h, s] = rgb2hsl(hex2rgb(brand));
  const hue = (dh: number) => rgb2hex(...hsl2rgb((h + dh + 360) % 360, s, 0.5));
  const scales: Record<string, Record<string, string>> = { primary: scale(brand), secondary: scale(hue(30)), accent: scale(hue(180)), neutral: scale(rgb2hex(...hsl2rgb(h, 0.08, 0.5))), success: scale("#16a34a"), warning: scale("#d97706"), danger: scale("#dc2626"), info: scale("#0284c7") };
  const need = standard === "AAA" ? 7 : 4.5;
  const W = [255, 255, 255], K = [9, 9, 11];
  const pick = (sc: Record<string, string>, on: number[]) => Object.entries(sc).find(([, c]) => contrast(hex2rgb(c), on) >= need)?.[1];
  const light = { background: "#ffffff", foreground: scales.neutral["950"], muted: scales.neutral["100"], mutedForeground: scales.neutral["600"], border: scales.neutral["200"], primary: [...Object.entries(scales.primary)].reverse().find(([k, c]) => +k >= 500 && contrast(hex2rgb(c), W) >= 4.5)?.[1] ?? scales.primary["700"], primaryForeground: "#ffffff", ring: scales.primary["400"] };
  const darkT = { background: scales.neutral["950"], foreground: scales.neutral["50"], muted: scales.neutral["900"], mutedForeground: scales.neutral["400"], border: scales.neutral["800"], primary: Object.entries(scales.primary).find(([k, c]) => +k <= 500 && contrast(hex2rgb(c), K) >= 4.5)?.[1] ?? scales.primary["300"], primaryForeground: scales.neutral["950"], ring: scales.primary["500"] };
  const checks = [["foreground on background", light.foreground, light.background], ["muted text", light.mutedForeground, light.background], ["primary button", light.primaryForeground, light.primary], ...(dark ? [["dark: foreground", darkT.foreground, darkT.background], ["dark: muted text", darkT.mutedForeground, darkT.background], ["dark: primary button", darkT.primaryForeground, darkT.primary]] : [])].map(([n, fg, bg]) => ({ pair: n, fg, bg, ratio: contrast(hex2rgb(fg), hex2rgb(bg)), passes: contrast(hex2rgb(fg), hex2rgb(bg)) >= need }));
  void pick;
  return { scales, semantic: { light, ...(dark ? { dark: darkT } : {}) }, contrastChecks: checks, standard };
}
function tokensOut(p: ReturnType<typeof palette>, fmt: string): string {
  const flat: [string, string][] = [...Object.entries(p.scales).flatMap(([n, sc]) => Object.entries(sc).map(([k, v]) => [`${n}-${k}`, v] as [string, string])), ...Object.entries(p.semantic.light).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), v] as [string, string])];
  if (fmt === "json") return JSON.stringify({ scales: p.scales, semantic: p.semantic }, null, 2);
  if (fmt === "scss") return flat.map(([k, v]) => `$${k}: ${v};`).join("\n");
  if (fmt === "tailwind") return `// tailwind.config.js\nexport default {\n  theme: { extend: { colors: ${JSON.stringify(p.scales, null, 2).replace(/\n/g, "\n    ")} } },\n};`;
  const dark = (p.semantic as any).dark;
  return `:root {\n${flat.map(([k, v]) => `  --${k}: ${v};`).join("\n")}\n}${dark ? `\n@media (prefers-color-scheme: dark) {\n  :root {\n${Object.entries(dark).map(([k, v]) => `    --${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`).join("\n")}\n  }\n}` : ""}`;
}

// ─── screenshots / image analysis (decoded in the page canvas) ───────────────

async function shot(page: any, full = false): Promise<string> { return b64(await page.screenshot({ type: "png", fullPage: full })); }
async function imagePage(): Promise<any> { const s = await session({ sessionId: "__image" }); return s.page; }

const PIXELS_JS = `async ([src, sample]) => {
  const img = new Image(); img.src = src; await img.decode();
  const w = Math.min(img.width, 800), h = Math.round(img.height * w / img.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, buckets = new Map(), step = Math.max(1, Math.floor((w * h) / (sample || 20000)));
  let n = 0;
  for (let i = 0; i < w * h; i += step) { const o = i * 4; if (d[o + 3] < 128) continue; const k = (d[o] >> 4) << 8 | (d[o + 1] >> 4) << 4 | (d[o + 2] >> 4); const b = buckets.get(k) || { r: 0, g: 0, b: 0, n: 0 }; b.r += d[o]; b.g += d[o + 1]; b.b += d[o + 2]; b.n++; buckets.set(k, b); n++; }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 12).map(b => ({ rgb: [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)], share: +(b.n / n * 100).toFixed(1) }));
  let edges = 0; for (let y = 1; y < h - 1; y += 2) for (let xx = 1; xx < w - 1; xx += 2) { const o = (y * w + xx) * 4, o2 = o + 4, o3 = o + w * 4; const g = Math.abs(d[o] - d[o2]) + Math.abs(d[o] - d[o3]); if (g > 60) edges++; }
  return { width: img.width, height: img.height, colors: top, edgeDensity: +(edges / ((w * h) / 4) * 100).toFixed(2) };
}`;
async function analyseImage(b64png: string, sample = 20000) {
  const page = await imagePage();
  const r = await page.evaluate(`(${PIXELS_JS})(${JSON.stringify([dataUrl(b64png), sample])})`);
  r.colors = r.colors.map((c: any) => ({ hex: rgb2hex(c.rgb[0], c.rgb[1], c.rgb[2]), share: c.share }));
  return r;
}

const DIFF_JS = `async ([a, b, tol, ignore]) => {
  const load = async (s) => { const i = new Image(); i.src = s; await i.decode(); return i; };
  const [A, Bi] = [await load(a), await load(b)];
  const w = Math.max(A.width, Bi.width), h = Math.max(A.height, Bi.height);
  const ctx = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x; };
  const da = ctx(A).getImageData(0, 0, w, h), db = ctx(Bi).getImageData(0, 0, w, h);
  const out = document.createElement('canvas'); out.width = w; out.height = h; const ox = out.getContext('2d'); ox.drawImage(Bi, 0, 0); ox.fillStyle = 'rgba(255,255,255,0.6)'; ox.fillRect(0, 0, w, h);
  const od = ox.getImageData(0, 0, w, h); let diff = 0, minX = w, minY = h, maxX = 0, maxY = 0;
  const skip = (x, y) => ignore.some(r => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; if (skip(x, y)) continue; const dd = Math.max(Math.abs(da.data[o] - db.data[o]), Math.abs(da.data[o + 1] - db.data[o + 1]), Math.abs(da.data[o + 2] - db.data[o + 2])); if (dd > tol) { diff++; od.data[o] = 255; od.data[o + 1] = 0; od.data[o + 2] = 0; od.data[o + 3] = 255; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; } }
  ox.putImageData(od, 0, 0);
  return { width: w, height: h, sizeChanged: A.width !== Bi.width || A.height !== Bi.height, diffPixels: diff, diffPercent: +(diff / (w * h) * 100).toFixed(3), bbox: diff ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null, diffImage: out.toDataURL('image/png').split(',')[1] };
}`;

const ELEMENTS_JS = `(max) => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.bottom > 0 && r.top < innerHeight * 3; };
  const role = (el) => el.getAttribute('role') || ({ A: 'link', BUTTON: 'button', INPUT: 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox', IMG: 'img', NAV: 'navigation', HEADER: 'banner', FOOTER: 'contentinfo', MAIN: 'main', H1: 'heading', H2: 'heading', H3: 'heading', FORM: 'form', SVG: 'img' })[el.tagName] || null;
  const out = [];
  for (const el of document.querySelectorAll('a,button,input,select,textarea,img,svg,h1,h2,h3,nav,header,footer,main,form,[role],label,video,canvas,iframe')) { if (out.length >= max || !vis(el)) continue; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); out.push({ role: role(el), tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.alt || el.innerText || el.value || el.placeholder || el.title || '').trim().replace(/\\s+/g, ' ').slice(0, 80), box: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)], color: cs.color, bg: cs.backgroundColor, font: cs.fontSize + ' ' + cs.fontWeight }); }
  const regions = ['header','nav','main','aside','footer'].map(t => { const e = document.querySelector(t + ',[role=' + ({header:'banner',nav:'navigation',main:'main',aside:'complementary',footer:'contentinfo'})[t] + ']'); if (!e) return null; const r = e.getBoundingClientRect(); return { region: t, box: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] }; }).filter(Boolean);
  return { title: document.title, url: location.href, viewport: [innerWidth, innerHeight], scrollHeight: document.documentElement.scrollHeight, regions, elements: out };
}`;

const LAYOUT_JS = `() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const all = [...document.body.querySelectorAll('*')].filter(vis);
  const flex = all.filter(e => getComputedStyle(e).display.includes('flex')).length, grid = all.filter(e => getComputedStyle(e).display.includes('grid')).length;
  const abs = all.filter(e => ['absolute','fixed'].includes(getComputedStyle(e).position)).length;
  const overflow = all.filter(e => { const r = e.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 1; }).slice(0, 10).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''));
  const lefts = {}; all.filter(e => e.children.length === 0 && e.innerText?.trim()).forEach(e => { const x = Math.round(e.getBoundingClientRect().left / 4) * 4; lefts[x] = (lefts[x] || 0) + 1; });
  const alignLines = Object.entries(lefts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([x, n]) => ({ x: +x, elements: n }));
  const main = document.querySelector('main') || document.body, mr = main.getBoundingClientRect();
  const cols = [...new Set([...main.querySelectorAll(':scope > * > *, :scope > *')].filter(vis).map(e => Math.round(e.getBoundingClientRect().left / 20)))].length;
  const textArea = all.filter(e => e.children.length === 0 && e.innerText?.trim()).reduce((s, e) => { const r = e.getBoundingClientRect(); return s + r.width * r.height; }, 0);
  const pageArea = document.documentElement.scrollWidth * document.documentElement.scrollHeight;
  const z = all.filter(e => getComputedStyle(e).zIndex !== 'auto').map(e => +getComputedStyle(e).zIndex).sort((a, b) => b - a).slice(0, 5);
  const maxW = Math.round(mr.width);
  return { elements: all.length, flexContainers: flex, gridContainers: grid, positioned: abs, horizontalOverflow: overflow, alignmentLines: alignLines, approxColumns: Math.min(cols, 12), contentWidth: maxW, centered: Math.abs(mr.left - (innerWidth - mr.right)) < 8, textDensity: +(textArea / pageArea * 100).toFixed(1), whitespaceRatio: +(100 - textArea / pageArea * 100).toFixed(1), topZIndexes: z };
}`;

const A11Y_JS = `(o) => {
  const out = [], push = (rule, sev, el, msg, fix, wcag) => { if (out.length < 300) out.push({ rule, severity: sev, wcag, element: el ? (el.outerHTML || '').slice(0, 160) : undefined, selector: el ? (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '')) : undefined, message: msg, fix }); };
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (el) => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && el.getAttribute('aria-labelledby').split(' ').map(id => document.getElementById(id)?.textContent).join(' ')) || el.innerText || el.getAttribute('title') || el.querySelector?.('img[alt]')?.alt || el.value || '').trim();
  const S = o.scope;
  if (S === 'full' || S === 'images') document.querySelectorAll('img').forEach(i => { if (!i.hasAttribute('alt')) push('image-alt', 'error', i, 'Image has no alt attribute', 'Add alt="" for decorative images or descriptive alt text', '1.1.1'); });
  if (S === 'full' || S === 'images') document.querySelectorAll('svg').forEach(s => { if (s.closest('a,button') && !name(s.closest('a,button')) && !s.getAttribute('aria-label') && !s.querySelector('title')) push('svg-name', 'error', s.closest('a,button'), 'Icon-only control has no accessible name', 'Add aria-label to the button/link', '4.1.2'); });
  if (S === 'full' || S === 'aria') {
    document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea').forEach(f => { const lab = f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]'); if (!lab && !f.closest('label') && !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby') && !f.title) push('label', 'error', f, 'Form field has no label', 'Associate a <label for> or aria-label', '3.3.2'); });
    document.querySelectorAll('button,[role=button],a[href]').forEach(b => { if (vis(b) && !name(b)) push(b.tagName === 'A' ? 'link-name' : 'button-name', 'error', b, 'Control has no accessible name', 'Add text content or aria-label', '4.1.2'); });
    const ROLES = 'alert alertdialog application article banner button cell checkbox columnheader combobox complementary contentinfo definition dialog directory document feed figure form grid gridcell group heading img link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio navigation none note option presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status switch tab table tablist tabpanel term textbox timer toolbar tooltip tree treegrid treeitem'.split(' ');
    document.querySelectorAll('[role]').forEach(e => { for (const r of e.getAttribute('role').split(' ')) if (!ROLES.includes(r)) push('aria-role', 'error', e, 'Invalid ARIA role "' + r + '"', 'Use a valid WAI-ARIA role', '4.1.2'); });
    document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]').forEach(e => { for (const a of ['aria-labelledby','aria-describedby','aria-controls']) { const v = e.getAttribute(a); if (v) for (const id of v.split(/\\s+/)) if (!document.getElementById(id)) push('aria-reference', 'error', e, a + ' references missing id "' + id + '"', 'Point to an existing element id', '4.1.2'); } });
    document.querySelectorAll('[aria-hidden=true]').forEach(e => { if (e.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')) push('aria-hidden-focus', 'error', e, 'aria-hidden region contains focusable elements', 'Remove focusable children or add tabindex=-1/inert', '4.1.2'); });
    const ids = {}; document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; }); Object.entries(ids).filter(([, n]) => n > 1).slice(0, 10).forEach(([id]) => push('duplicate-id', 'warning', document.getElementById(id), 'Duplicate id "' + id + '"', 'Make ids unique', '4.1.1'));
    if (!document.documentElement.lang) push('html-lang', 'error', null, '<html> has no lang attribute', 'Add lang="en" (or the page language)', '3.1.1');
    if (!document.title.trim()) push('document-title', 'error', null, 'Page has no <title>', 'Add a descriptive title', '2.4.2');
    if (!document.querySelector('main,[role=main]')) push('landmark-main', 'warning', null, 'No main landmark', 'Wrap the primary content in <main>', '1.3.1');
  }
  if (S === 'full' || S === 'headings') { const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis); if (!hs.some(h => h.tagName === 'H1')) push('page-has-heading-one', 'warning', null, 'No <h1> on the page', 'Add one h1 describing the page', '1.3.1'); let prev = 0; hs.forEach(h => { const l = +h.tagName[1]; if (prev && l > prev + 1) push('heading-order', 'warning', h, 'Heading level skips from h' + prev + ' to h' + l, 'Use sequential heading levels', '1.3.1'); prev = l; if (!h.innerText.trim()) push('empty-heading', 'error', h, 'Empty heading', 'Add text or remove the heading', '2.4.6'); }); }
  if (S === 'full' || S === 'keyboard') { document.querySelectorAll('[tabindex]').forEach(e => { if (+e.getAttribute('tabindex') > 0) push('tabindex', 'warning', e, 'Positive tabindex disrupts focus order', 'Use tabindex="0" or DOM order', '2.4.3'); }); document.querySelectorAll('div[onclick],span[onclick],[role=button]:not(button)').forEach(e => { if (e.tabIndex < 0) push('keyboard-access', 'error', e, 'Clickable element is not keyboard-focusable', 'Use <button> or add tabindex="0" and key handlers', '2.1.1'); });
    const st = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } }).map(r => r.cssText).join('\\n'); if (/:focus\\s*\\{[^}]*outline\\s*:\\s*(none|0)/.test(st) && !/:focus-visible/.test(st)) push('focus-visible', 'error', null, 'Focus outline removed without a :focus-visible replacement', 'Provide a visible focus style', '2.4.7'); }
  if (S === 'full' || S === 'contrast') {
    const parse = (c) => { const m = c.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const L = (c) => { const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const bgOf = (el) => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; if (getComputedStyle(e).backgroundImage !== 'none') return null; e = e.parentElement; } return [255, 255, 255, 1]; };
    let n = 0;
    for (const el of document.querySelectorAll('p,span,a,li,td,th,label,button,h1,h2,h3,h4,h5,h6,small,strong,em,div')) { if (n > 2000) break; if (!vis(el) || ![...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) continue; n++;
      const cs = getComputedStyle(el), fg = parse(cs.color), bg = bgOf(el); if (!fg || !bg) continue;
      const ratio = (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05), size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = size >= 24 || (bold && size >= 18.66);
      const need = o.standard === 'AAA' ? (large ? 4.5 : 7) : (large ? 3 : 4.5);
      if (ratio < need) push('color-contrast', 'error', el, 'Contrast ' + ratio.toFixed(2) + ':1 (needs ' + need + ':1) for ' + size + 'px text', 'Darken the text or lighten the background', o.standard === 'AAA' ? '1.4.6' : '1.4.3'); }
  }
  return out;
}`;

const SEO_JS = `() => {
  const m = (n) => document.querySelector('meta[name="' + n + '"],meta[property="' + n + '"]')?.content;
  const links = [...document.querySelectorAll('a[href]')];
  const imgs = [...document.querySelectorAll('img')];
  return { url: location.href, title: document.title, description: m('description'), robots: m('robots'), viewport: m('viewport'), canonical: document.querySelector('link[rel=canonical]')?.href, lang: document.documentElement.lang, hreflang: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang),
    og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map(x => [x.getAttribute('property'), x.content])), twitter: Object.fromEntries([...document.querySelectorAll('meta[name^="twitter:"]')].map(x => [x.getAttribute('name'), x.content])),
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { const j = JSON.parse(s.textContent); return { valid: true, type: [].concat(j['@type'] || j['@graph']?.map(g => g['@type']) || []).flat() }; } catch (e) { return { valid: false, error: String(e).slice(0, 120) }; } }),
    headings: [...document.querySelectorAll('h1,h2,h3')].map(h => ({ level: +h.tagName[1], text: h.innerText.trim().slice(0, 100) })),
    images: { total: imgs.length, missingAlt: imgs.filter(i => !i.hasAttribute('alt')).length, noDimensions: imgs.filter(i => !i.getAttribute('width') || !i.getAttribute('height')).length, notLazy: imgs.filter(i => i.loading !== 'lazy' && i.getBoundingClientRect().top > innerHeight).length },
    links: { total: links.length, internal: links.filter(a => a.host === location.host).length, external: links.filter(a => a.host !== location.host).length, nofollow: links.filter(a => /nofollow/.test(a.rel)).length, emptyText: links.filter(a => !a.innerText.trim() && !a.getAttribute('aria-label') && !a.querySelector('img[alt]')).length, generic: links.filter(a => /^(click here|here|read more|more|link)$/i.test(a.innerText.trim())).length },
    wordCount: document.body.innerText.split(/\\s+/).filter(Boolean).length };
}`;

const FORMS_JS = `(sel) => [...document.querySelectorAll(sel || 'form')].map((f, k) => ({ index: k, selector: f.id ? '#' + f.id : (sel || 'form') + ':nth-of-type(' + (k + 1) + ')', action: f.getAttribute('action'), method: (f.method || 'get').toUpperCase(), noValidate: f.noValidate,
  fields: [...f.elements].filter(e => e.name || e.id).filter(e => !['submit','button','reset','hidden','fieldset'].includes(e.type)).map(e => ({ name: e.name || e.id, selector: e.id ? '#' + CSS.escape(e.id) : '[name="' + e.name + '"]', type: e.type, tag: e.tagName.toLowerCase(), required: e.required, pattern: e.pattern || undefined, min: e.min || undefined, max: e.max || undefined, minLength: e.minLength > 0 ? e.minLength : undefined, maxLength: e.maxLength > 0 ? e.maxLength : undefined, options: e.options ? [...e.options].map(o => o.value).slice(0, 20) : undefined, autocomplete: e.autocomplete || undefined, label: (e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.placeholder || '').trim().slice(0, 60) })) }))`;

const validFor = (f: any): string => ({ email: "test.user@example.com", url: "https://example.com", tel: "+919876543210", number: String(f.min ? Number(f.min) + 1 : 5), date: "2026-01-15", "datetime-local": "2026-01-15T10:30", time: "10:30", month: "2026-01", week: "2026-W03", color: "#336699", password: "Str0ng!Passw0rd", search: "query" } as Record<string, string>)[f.type] ?? (f.pattern ? "" : f.minLength ? "x".repeat(f.minLength) : /name/i.test(f.name) ? "Asha Rao" : /zip|pin|postal/i.test(f.name) ? "560001" : /phone|mobile/i.test(f.name) ? "9876543210" : "Sample text");
const invalidFor = (f: any): string[] => ({ email: ["not-an-email", "a@", "@b.com"], url: ["notaurl", "http//x"], number: ["abc", String(f.max ? Number(f.max) + 1 : -999999)], tel: ["abc"], date: ["2026-13-45"] } as Record<string, string[]>)[f.type] ?? (f.pattern ? ["!!invalid!!"] : f.maxLength ? ["x".repeat(f.maxLength + 5)] : []);

// ─── helpers for vision tools ────────────────────────────────────────────────

async function visionOrNull(prompt: string, images: string[], system?: string): Promise<{ text: string; model?: string } | null> {
  if (!hasLlm()) return null;
  try { const r = await callLlm({ system, prompt, images, maxTokens: 3000 }); return { text: r.text, model: r.model }; } catch (e: any) { return { text: "", model: `error: ${e.message}` }; }
}
const GOAL_PROMPT: Record<string, string> = {
  describe: "Describe this web page screenshot: purpose, layout regions, key content, primary actions and any visible problems.",
  recreate: "Recreate this UI as production code. Match layout, spacing, colours and typography closely. Output a single code block.",
  tutorial: "Write a step-by-step tutorial for a first-time user of this screen: what each area does and how to complete the main task.",
  annotate: "List the UI elements visible in this screenshot as JSON [{label, role, bbox:[x,y,w,h], note}].",
  compare: "Compare the two screenshots and list every visual difference (layout, text, colour, missing/added elements).",
};

async function imgInput(i: Record<string, unknown>): Promise<{ b64: string; page?: any; s?: Sess }> {
  if (i.screenshotB64) return { b64: str(i.screenshotB64).replace(/^data:[^,]+,/, "") };
  const { s, page } = await pageFor(i);
  return { b64: await shot(page), page, s };
}

function audit(results: any[], weightOf: (v: any) => number = (v) => (v.severity === "error" ? 8 : v.severity === "warning" ? 3 : 1)) {
  const penalty = results.reduce((a, v) => a + weightOf(v), 0);
  return Math.max(0, Math.round(100 - penalty * 100 / (penalty + 60)));
}
const grade = (score: number) => (score >= 90 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "F");

// ─── executors ───────────────────────────────────────────────────────────────

export const BROWSER_QA_EXECUTORS: ExecMap = execs({
  "browser.visual-understand": async (i) => {
    const { b64: img, page } = await imgInput(i);
    const action = str(i.action, "full"), goal = str(i.goal, "describe");
    const dom = page ? await page.evaluate(`(${ELEMENTS_JS})(${num(i.maxElements, 80)})`) : undefined;
    const pix = await analyseImage(img);
    const out: any = { screenshot: saveShot(B().from(img, "base64")), dimensions: [pix.width, pix.height] };
    if (action === "elements" || action === "full") out.elements = dom?.elements ?? "pass tabId/sessionId of a loaded page for DOM elements (screenshot-only mode)";
    if (action === "layout" || action === "full") out.layout = dom ? { regions: dom.regions, scrollHeight: dom.scrollHeight, viewport: dom.viewport, ...(page ? await page.evaluate(`(${LAYOUT_JS})()`) : {}) } : { edgeDensity: pix.edgeDensity };
    if (action === "colors" || action === "full") out.colors = pix.colors;
    const prompt = `${GOAL_PROMPT[goal] ?? GOAL_PROMPT.describe}${dom ? `\n\nDOM context (title, regions, elements with boxes):\n${JSON.stringify({ title: dom.title, regions: dom.regions, elements: dom.elements.slice(0, 40) })}` : ""}`;
    if (action === "prompt") return { ...out, prompt, imageB64: bool(i.includeRaw) ? img : undefined };
    if (action === "full") { const v = await visionOrNull(prompt, [dataUrl(img)]); out.understanding = v?.text ?? null; out.llm = v ? v.model : "not configured — returned DOM/pixel analysis only"; }
    if (bool(i.includeRaw)) out.imageB64 = img;
    return out;
  },
  "browser.extract-visual-context": async (i) => {
    const { page } = await pageFor(i);
    let box: { x: number; y: number; width: number; height: number } | null = null;
    if (i.selector) box = await page.locator(sel(i.selector)).first().boundingBox();
    else if (i.bboxW) box = { x: num(i.bboxX), y: num(i.bboxY), width: num(i.bboxW), height: num(i.bboxH) };
    if (!box) throw new Error("pass selector or bboxX/bboxY/bboxW/bboxH");
    const buf = await page.screenshot({ type: "png", clip: box });
    const inside = await page.evaluate(([b]: any[]) => [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= b.x - 1 && r.top >= b.y - 1 && r.right <= b.x + b.width + 1 && r.bottom <= b.y + b.height + 1 && e.children.length === 0; }).slice(0, 80).map((e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), text: (e as HTMLElement).innerText?.trim().slice(0, 100), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], color: cs.color, bg: cs.backgroundColor, font: `${cs.fontSize} ${cs.fontWeight} ${cs.fontFamily.split(",")[0]}` }; }), [box]);
    const pix = await analyseImage(b64(buf), 5000);
    return { box, crop: saveShot(buf, "png", true), elements: inside, text: inside.map((e: any) => e.text).filter(Boolean).join(" ").slice(0, 2000), colors: pix.colors.slice(0, 6) };
  },
  "browser.screenshot-to-llm": async (i) => {
    const s = await session({ ...i, viewportWidth: num(i.viewportWidth, 1280), viewportHeight: num(i.viewportHeight, 800) });
    if (i.viewportWidth || i.viewportHeight) await s.page.setViewportSize({ width: num(i.viewportWidth, 1280), height: num(i.viewportHeight, 800) });
    if (i.url) await goto(s, str(i.url));
    if (s.page.url() === "about:blank") throw new Error("pass url (or navigate first)");
    const img = await shot(s.page), goal = str(i.goal, "describe");
    const dom = await s.page.evaluate(`(${ELEMENTS_JS})(60)`);
    const prompt = `${GOAL_PROMPT[goal] ?? GOAL_PROMPT.describe}${goal === "recreate" ? ` Use ${str(i.codeLang, "React + Tailwind")}.` : ""}\n\nPage: ${dom.title} (${dom.url})\nDOM summary: ${JSON.stringify({ regions: dom.regions, elements: dom.elements.slice(0, 40) })}`;
    const v = await visionOrNull(prompt, [dataUrl(img)], "You are a meticulous front-end engineer and UX analyst.");
    const code = v && goal === "recreate" ? /```[\w+-]*\n([\s\S]*?)```/.exec(v.text)?.[1] : undefined;
    return { url: s.page.url(), goal, screenshot: saveShot(B().from(img, "base64")), result: v?.text ?? null, code, llm: v ? v.model : "not configured — set a model (the agent runtime uses its own) to get the analysis; prompt and screenshot are included", prompt: v ? undefined : prompt };
  },
  "browser.icon-detect": async (i) => {
    if (i.screenshotB64 && !i.tabId && !i.sessionId && !i.url) {
      const v = await visionOrNull('Detect every icon in this UI screenshot. Reply JSON [{"name","meaning","bbox":[x,y,w,h]}].', [dataUrl(str(i.screenshotB64))]);
      if (!v?.text) throw new Error("screenshot-only icon detection needs a vision model; pass a loaded page (sessionId/url) for DOM-based detection");
      return { icons: llmJson(v.text), method: "vision", model: v.model };
    }
    const { page } = await pageFor(i);
    const icons = await page.evaluate((scope: string | null) => {
      const root = scope ? document.querySelector(scope) : document.body; if (!root) return [];
      const vis = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
      const out: any[] = [];
      const add = (el: Element, kind: string, name: string) => { const r = el.getBoundingClientRect(); const ctl = el.closest("a,button,[role=button]"); out.push({ kind, name, bbox: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], inControl: ctl ? ctl.tagName.toLowerCase() : null, accessibleName: ctl?.getAttribute("aria-label") || el.getAttribute("aria-label") || (el.querySelector?.("title")?.textContent ?? "") || (ctl as HTMLElement | null)?.innerText?.trim() || null }); };
      root.querySelectorAll("svg").forEach((s) => { const r = s.getBoundingClientRect(); if (vis(s) && r.width <= 64 && r.height <= 64) add(s, "svg", s.getAttribute("data-icon") || s.getAttribute("class")?.match(/(?:lucide|icon|fa)-([\w-]+)/)?.[1] || s.querySelector("title")?.textContent || s.querySelector("use")?.getAttribute("href")?.replace(/^.*#/, "") || "svg"); });
      root.querySelectorAll("img").forEach((im) => { const r = im.getBoundingClientRect(); if (vis(im) && r.width <= 64 && r.height <= 64) add(im, "img", im.alt || im.src.split("/").pop()!.split("?")[0]); });
      root.querySelectorAll("i,span").forEach((e) => { const c = typeof e.className === "string" ? e.className : ""; if (vis(e) && /\b(fa-|material-icons|material-symbols|bi-|icon-|glyphicon|ti-)/.test(c)) add(e, "font", c.match(/(?:fa|bi|ti|icon)-([\w-]+)/)?.[1] || (e as HTMLElement).innerText.trim() || c); });
      return out.slice(0, 300);
    }, i.selector ? sel(i.selector) : null);
    return { count: icons.length, unlabeledControls: icons.filter((x: any) => x.inControl && !x.accessibleName).length, icons, method: "dom" };
  },
  "browser.color-analyze": async (i) => {
    const { b64: img, page } = await imgInput(i);
    const pix = await analyseImage(img, num(i.sampleSize, 20000));
    const css = page ? await page.evaluate(() => { const c: Record<string, number> = {}, bg: Record<string, number> = {}; for (const e of document.querySelectorAll("body *")) { const s = getComputedStyle(e); if ((e as HTMLElement).innerText?.trim() && e.children.length === 0) c[s.color] = (c[s.color] ?? 0) + 1; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) bg[s.backgroundColor] = (bg[s.backgroundColor] ?? 0) + 1; } return { text: c, background: bg }; }) : null;
    const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => { const p = parseColor(c); return { color: p ? rgb2hex(p[0], p[1], p[2]) : c, uses: n }; });
    const textC = css ? top(css.text) : [], bgC = css ? top(css.background) : [];
    const pairs = textC.slice(0, 5).flatMap((t) => bgC.slice(0, 3).map((b) => ({ fg: t.color, bg: b.color, ratio: contrast(hex2rgb(t.color), hex2rgb(b.color)) }))).filter((p) => /^#/.test(p.fg) && /^#/.test(p.bg));
    const sat = pix.colors.map((c: any) => rgb2hsl(hex2rgb(c.hex))[1]);
    return { dominant: pix.colors, textColors: textC, backgroundColors: bgC, contrastPairs: pairs.sort((a, b) => a.ratio - b.ratio).slice(0, 10), lowContrast: pairs.filter((p) => p.ratio < 4.5).length, paletteSize: pix.colors.filter((c: any) => c.share >= 1).length, mood: sat.reduce((a: number, b: number) => a + b, 0) / Math.max(1, sat.length) > 0.45 ? "vivid" : "muted", darkMode: lum(hex2rgb(pix.colors[0]?.hex ?? "#ffffff")) < 0.2 };
  },
  "browser.layout-analyze": async (i) => {
    if (i.screenshotB64 && !i.tabId && !i.sessionId && !i.url) { const pix = await analyseImage(str(i.screenshotB64)); const v = await visionOrNull("Analyse the layout of this UI: grid/columns, regions, alignment, spacing rhythm, visual hierarchy, issues. Be specific.", [dataUrl(str(i.screenshotB64))]); return { dimensions: [pix.width, pix.height], edgeDensity: pix.edgeDensity, analysis: v?.text ?? null, llm: v ? v.model : "not configured (pass a loaded page for DOM layout analysis)" }; }
    const { page } = await pageFor(i);
    const l = await page.evaluate(`(${LAYOUT_JS})()`), d = await page.evaluate(`(${ELEMENTS_JS})(0)`);
    const issues = [...(l.horizontalOverflow.length ? [`horizontal overflow: ${l.horizontalOverflow.join(", ")}`] : []), ...(l.alignmentLines.length > 5 && l.alignmentLines[5].elements > 3 ? ["many competing left edges — tighten the alignment grid"] : []), ...(!d.regions.some((r: any) => r.region === "main") ? ["no <main> region"] : [])];
    return { ...l, regions: d.regions, viewport: d.viewport, scrollHeight: d.scrollHeight, issues };
  },
  "browser.performance": async (i) => {
    const { s, page } = await pageFor(i);
    const action = str(i.action, "all");
    if (bool(i.reload, true) && !i.url) { s.network = []; await page.reload({ waitUntil: "load" }); }
    await page.evaluate(() => { const w = window as any; w.__stitapPerf = { cls: 0, lcp: 0, inp: 0, longTasks: 0, tbt: 0 }; try { new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) w.__stitapPerf.cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch { /* unsupported */ } try { new PerformanceObserver((l) => { const e = l.getEntries(); w.__stitapPerf.lcp = (e[e.length - 1] as any).startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* */ } try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { w.__stitapPerf.longTasks++; w.__stitapPerf.tbt += Math.max(0, e.duration - 50); } }).observe({ type: "longtask", buffered: true }); } catch { /* */ } try { new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) w.__stitapPerf.inp = Math.max(w.__stitapPerf.inp, e.duration); }).observe({ type: "event", buffered: true, durationThreshold: 16 } as any); } catch { /* */ } });
    // interact a little so INP has data
    await page.mouse.click(5, 5).catch(() => undefined);
    await page.waitForTimeout(num(i.duration, 2000));
    const m: any = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0] as any, p = Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)])); const res = performance.getEntriesByType("resource") as any[]; return { ...(window as any).__stitapPerf, ttfb: n ? Math.round(n.responseStart - n.requestStart) : null, fcp: p["first-contentful-paint"] ?? null, fp: p["first-paint"] ?? null, domContentLoaded: n ? Math.round(n.domContentLoadedEventEnd) : null, load: n ? Math.round(n.loadEventEnd) : null, transferKB: Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024), requests: res.length, resources: res.map((r) => ({ name: r.name.slice(0, 160), type: r.initiatorType, ms: Math.round(r.duration), kb: Math.round((r.transferSize || 0) / 1024), renderBlocking: r.renderBlockingStatus })).sort((a, b) => b.ms - a.ms).slice(0, 25), domNodes: document.querySelectorAll("*").length, jsHeapMB: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) : undefined }; });
    const rate = (v: number | null, good: number, poor: number) => (v === null ? "n/a" : v <= good ? "good" : v <= poor ? "needs-improvement" : "poor");
    const vitals = { LCP: { ms: Math.round(m.lcp) || null, rating: rate(Math.round(m.lcp) || null, 2500, 4000) }, CLS: { value: r2(m.cls, 3), rating: rate(m.cls, 0.1, 0.25) }, INP: { ms: m.inp || null, rating: rate(m.inp || null, 200, 500), note: "lab measurement from synthetic interaction" }, FCP: { ms: m.fcp, rating: rate(m.fcp, 1800, 3000) }, TTFB: { ms: m.ttfb, rating: rate(m.ttfb, 800, 1800) }, TBT: { ms: Math.round(m.tbt), rating: rate(m.tbt, 200, 600) } };
    const sugg: string[] = [];
    if (vitals.LCP.rating !== "good") sugg.push("LCP: preload the hero image/font, serve images in AVIF/WebP at the rendered size, and remove render-blocking CSS/JS above the fold");
    if (vitals.CLS.rating !== "good") sugg.push("CLS: set width/height (or aspect-ratio) on images/embeds and reserve space for late-loading UI");
    if (vitals.TBT.rating !== "good") sugg.push(`TBT: ${m.longTasks} long tasks — code-split, defer non-critical scripts, move work off the main thread`);
    if (m.transferKB > 2000) sugg.push(`page weight ${m.transferKB} KB — compress, lazy-load below-the-fold media, drop unused JS`);
    const blocking = m.resources.filter((r: any) => r.renderBlocking === "blocking"); if (blocking.length) sugg.push(`${blocking.length} render-blocking resources: ${blocking.slice(0, 3).map((r: any) => r.name.split("/").pop()).join(", ")}`);
    if (m.domNodes > 1500) sugg.push(`${m.domNodes} DOM nodes — virtualise long lists`);
    const out: any = { url: page.url(), webVitals: vitals };
    if (action === "paint" || action === "all") out.paint = { firstPaint: m.fp, firstContentfulPaint: m.fcp, domContentLoaded: m.domContentLoaded, load: m.load };
    if ((action === "resources" || action === "all") && i.includeResources !== false) out.resources = { requests: m.requests, transferKB: m.transferKB, slowest: m.resources };
    if (action === "all") out.runtime = { domNodes: m.domNodes, jsHeapMB: m.jsHeapMB, longTasks: m.longTasks };
    if (i.includeSuggestions !== false) out.suggestions = sugg;
    return out;
  },
  "browser.interact-test": async (i) => {
    const { s, page } = await pageFor(i);
    const loc = page.locator(sel(i.selector)).first(), action = str(i.action, "click");
    await loc.waitFor({ state: "visible", timeout: num(i.waitForTimeout, 5000) });
    const consoleBefore = s.console.length, netBefore = s.network.length, urlBefore = page.url();
    await page.evaluate(() => { const w = window as any; w.__stitapMut = 0; w.__stitapMo2?.disconnect(); w.__stitapMo2 = new MutationObserver((m) => (w.__stitapMut += m.length)); w.__stitapMo2.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true }); });
    const domBefore = i.expectDomChange ? await page.locator(sel(i.expectDomChange)).count() : 0;
    const navP = bool(i.expectNavigation) ? page.waitForNavigation({ timeout: num(i.waitForTimeout, 5000) }).then(() => true).catch(() => false) : null;
    const reqP = i.expectNetworkRequest ? page.waitForRequest((r: any) => r.url().includes(str(i.expectNetworkRequest)), { timeout: num(i.waitForTimeout, 5000) }).then(() => true).catch(() => false) : null;
    const t0 = Date.now();
    if (action === "dblclick") await loc.dblclick(); else if (action === "rightclick") await loc.click({ button: "right" }); else if (action === "hover") await loc.hover(); else if (action === "focus") await loc.focus(); else if (action === "submit") await loc.evaluate((el: any) => (el.form ?? el).requestSubmit?.() ?? (el.form ?? el).submit()); else await loc.click();
    const firstPaint = await page.evaluate(() => new Promise<number>((res) => { const t = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t))); }));
    if (i.waitFor) await page.waitForSelector(sel(i.waitFor), { timeout: num(i.waitForTimeout, 5000) }).catch(() => undefined);
    else await page.waitForTimeout(300);
    const latency = Date.now() - t0;
    const mutations = await page.evaluate(() => (window as any).__stitapMut ?? 0).catch(() => 0);
    const errors = s.console.slice(consoleBefore).filter((c) => c.level === "error");
    const checks: Record<string, boolean> = {};
    if (navP) checks.navigation = (await navP) || page.url() !== urlBefore;
    if (reqP) checks.networkRequest = await reqP;
    if (i.expectDomChange) checks.domChange = (await page.locator(sel(i.expectDomChange)).count()) !== domBefore || mutations > 0;
    if (i.expectNoConsoleError !== false) checks.noConsoleError = errors.length === 0;
    if (i.waitFor) checks.waitFor = (await page.locator(sel(i.waitFor)).count()) > 0;
    return { selector: str(i.selector), action, passed: Object.values(checks).every(Boolean), checks, latencyMs: bool(i.measureLatency, true) ? latency : undefined, nextFrameMs: r2(firstPaint, 1), domMutations: mutations, requests: s.network.slice(netBefore).map((e) => `${e.method} ${e.url}`).slice(0, 20), consoleErrors: errors.map((e) => e.text).slice(0, 10), url: page.url() };
  },
  "browser.a11y-audit": async (i) => {
    const { page } = await pageFor(i);
    const scope = str(i.scope, "full"), standard = str(i.standard, "AA");
    let engine = "stitap-rules", violations: any[] = [];
    try {
      const req = nodeModule("node:module").createRequire(process.cwd() + "/");
      const axePath = req.resolve("axe-core/axe.min.js");
      await page.addScriptTag({ path: axePath });
      const tags = ["wcag2a", ...(standard !== "A" ? ["wcag2aa", "wcag21aa", "wcag22aa"] : []), ...(standard === "AAA" ? ["wcag2aaa"] : []), "best-practice"];
      const r = await page.evaluate((t: string[]) => (window as any).axe.run(document, { runOnly: { type: "tag", values: t } }), tags);
      engine = "axe-core";
      violations = r.violations.flatMap((v: any) => v.nodes.slice(0, 10).map((n: any) => ({ rule: v.id, severity: v.impact === "critical" || v.impact === "serious" ? "error" : "warning", impact: v.impact, wcag: v.tags.filter((t: string) => /^wcag\d/.test(t)).join(","), selector: n.target.join(" "), element: n.html.slice(0, 160), message: v.help, fix: n.failureSummary })));
      if (scope !== "full") violations = violations.filter((v) => ({ contrast: /contrast/, aria: /aria|label|name|role/, keyboard: /focus|tabindex|keyboard|scrollable/, headings: /heading/, images: /image|alt|svg/ } as Record<string, RegExp>)[scope]?.test(v.rule) ?? true);
    } catch { violations = await page.evaluate(`(${A11Y_JS})(${JSON.stringify({ scope, standard })})`); }
    if (bool(i.screenshotViolations)) for (const v of violations.slice(0, 5)) { if (!v.selector) continue; try { v.screenshot = saveShot(await page.locator(v.selector).first().screenshot({ timeout: 3000 })).file; } catch { /* not visible */ } }
    const score = audit(violations);
    const byRule: Record<string, number> = {}; for (const v of violations) byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
    return { url: page.url(), engine, standard, scope, score, grade: grade(score), errors: violations.filter((v) => v.severity === "error").length, warnings: violations.filter((v) => v.severity !== "error").length, byRule, violations: violations.map((v) => (i.includeFixes === false ? { ...v, fix: undefined } : v)) };
  },
  "browser.responsive-test": async (i) => {
    const { page } = await pageFor(i);
    const orig = page.viewportSize();
    const vps = (str(i.viewports) ? str(i.viewports).split(/[,;\s]+/) : ["375x812", "768x1024", "1280x800", "1920x1080"]).map((v) => { const [w, h] = v.toLowerCase().split("x").map(Number); return { width: w, height: h || 900 }; }).filter((v) => v.width > 0);
    const results: any[] = [];
    for (const vp of vps) {
      await page.setViewportSize(vp); await page.waitForTimeout(400);
      const r = await page.evaluate(([checkOverflow, checkTouch, minTouch]: any[]) => {
        const docW = document.documentElement.clientWidth, out: any = { scrollWidth: document.documentElement.scrollWidth, hasHorizontalScroll: document.documentElement.scrollWidth > docW + 1 };
        if (checkOverflow) out.overflowing = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > docW + 1 && getComputedStyle(e).position !== "fixed"; }).slice(0, 8).map((e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : "") + (typeof e.className === "string" && e.className ? `.${e.className.trim().split(/\s+/)[0]}` : ""));
        if (checkTouch && innerWidth < 900) out.smallTouchTargets = [...document.querySelectorAll("a,button,input,select,[role=button]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < minTouch || r.height < minTouch); }).slice(0, 10).map((e) => { const r = e.getBoundingClientRect(); return { el: e.tagName.toLowerCase() + ((e as HTMLElement).innerText ? ` "${(e as HTMLElement).innerText.trim().slice(0, 30)}"` : ""), size: `${Math.round(r.width)}×${Math.round(r.height)}` }; });
        out.minFontSize = Math.min(...[...document.querySelectorAll("p,li,span,a,td")].filter((e) => (e as HTMLElement).innerText?.trim()).map((e) => parseFloat(getComputedStyle(e).fontSize)).filter(Boolean), 99);
        out.viewportMeta = !!document.querySelector("meta[name=viewport]");
        return out;
      }, [i.checkOverflow !== false, i.checkTouchTargets !== false, (TOUCH_TARGETS as any)?.minimum ?? 44]);
      const issues = [...(r.hasHorizontalScroll ? ["horizontal scroll"] : []), ...(r.smallTouchTargets?.length ? [`${r.smallTouchTargets.length} touch targets < 44px`] : []), ...(vp.width < 600 && r.minFontSize < 12 ? [`text as small as ${r.minFontSize}px`] : []), ...(!r.viewportMeta ? ["missing <meta name=viewport>"] : [])];
      results.push({ viewport: `${vp.width}x${vp.height}`, passed: !issues.length, issues, ...r, screenshot: i.includeScreenshots === false ? undefined : saveShot(await page.screenshot({ type: "png", fullPage: false })).file });
    }
    if (orig) await page.setViewportSize(orig);
    return { url: page.url(), passed: results.every((r) => r.passed), results };
  },
  "browser.security-headers": async (i) => {
    const s = await session(i);
    const res = i.url ? await goto(s, str(i.url)) : s.mainResponse ?? (s.page.url() !== "about:blank" ? await s.page.reload() : null);
    if (!res) throw new Error("pass url (or navigate first)");
    const h: Record<string, string> = await res.allHeaders?.() ?? res.headers();
    const https = res.url().startsWith("https:");
    const csp = h["content-security-policy"];
    const checks = [
      { header: "Strict-Transport-Security", present: !!h["strict-transport-security"], ok: !https || /max-age=(\d+)/.test(h["strict-transport-security"] ?? "") && Number(/max-age=(\d+)/.exec(h["strict-transport-security"])![1]) >= 15552000, value: h["strict-transport-security"], fix: "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload", weight: https ? 20 : 0 },
      { header: "Content-Security-Policy", present: !!csp, ok: !!csp && !/unsafe-inline|unsafe-eval|\*\s|default-src \*/.test(csp), value: csp?.slice(0, 300), fix: "Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-…'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'", weight: 25, notes: csp ? [/unsafe-inline/.test(csp) && "allows 'unsafe-inline'", /unsafe-eval/.test(csp) && "allows 'unsafe-eval'", !/object-src/.test(csp) && "no object-src", !/frame-ancestors/.test(csp) && "no frame-ancestors"].filter(Boolean) : undefined },
      { header: "X-Frame-Options / frame-ancestors", present: !!h["x-frame-options"] || /frame-ancestors/.test(csp ?? ""), ok: /deny|sameorigin/i.test(h["x-frame-options"] ?? "") || /frame-ancestors/.test(csp ?? ""), value: h["x-frame-options"], fix: "X-Frame-Options: DENY (or CSP frame-ancestors 'self')", weight: 15 },
      { header: "X-Content-Type-Options", present: !!h["x-content-type-options"], ok: /nosniff/i.test(h["x-content-type-options"] ?? ""), value: h["x-content-type-options"], fix: "X-Content-Type-Options: nosniff", weight: 10 },
      { header: "Referrer-Policy", present: !!h["referrer-policy"], ok: /no-referrer|strict-origin|same-origin/.test(h["referrer-policy"] ?? ""), value: h["referrer-policy"], fix: "Referrer-Policy: strict-origin-when-cross-origin", weight: 10 },
      { header: "Permissions-Policy", present: !!h["permissions-policy"], ok: !!h["permissions-policy"], value: h["permissions-policy"]?.slice(0, 200), fix: "Permissions-Policy: camera=(), microphone=(), geolocation=()", weight: 10 },
      { header: "Cross-Origin-Opener-Policy", present: !!h["cross-origin-opener-policy"], ok: /same-origin/.test(h["cross-origin-opener-policy"] ?? ""), value: h["cross-origin-opener-policy"], fix: "Cross-Origin-Opener-Policy: same-origin", weight: 5 },
      { header: "Server / X-Powered-By disclosure", present: !!(h["x-powered-by"] || /\d/.test(h.server ?? "")), ok: !h["x-powered-by"] && !/\d/.test(h.server ?? ""), value: [h.server, h["x-powered-by"]].filter(Boolean).join(" · ") || undefined, fix: "Remove X-Powered-By and version numbers from Server", weight: 5 },
    ];
    const max = checks.reduce((a, c) => a + c.weight, 0), got = checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0), score = Math.round((got / max) * 100);
    const out: any = { url: res.url(), status: res.status(), https, score, grade: grade(score), checks: checks.map(({ weight, fix, ...c }) => ({ ...c, ...(i.includeRemediation !== false && !c.ok ? { fix } : {}) })) };
    if (i.checkMixedContent !== false && https) out.mixedContent = s.network.filter((e) => e.url.startsWith("http:")).map((e) => `${e.type} ${e.url}`).slice(0, 20);
    if (i.checkCookies !== false) out.cookies = (await s.ctx.cookies([res.url()])).map((c: any) => ({ name: c.name, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, issues: [!c.secure && https && "missing Secure", !c.httpOnly && /sess|token|auth|sid|jwt/i.test(c.name) && "auth cookie without HttpOnly", c.sameSite === "None" && !c.secure && "SameSite=None without Secure"].filter(Boolean) }));
    return out;
  },
  "browser.seo-audit": async (i) => {
    const { s, page } = await pageFor(i);
    const d = await page.evaluate(`(${SEO_JS})()`), scope = str(i.scope, "full"), issues: { area: string; severity: string; message: string; suggestion: string }[] = [];
    const add = (area: string, severity: string, message: string, suggestion: string) => { if (scope === "full" || scope === area) issues.push({ area, severity, message, suggestion }); };
    if (!d.title) add("meta", "error", "missing <title>", "Add a unique 50–60 character title"); else if (d.title.length < 30 || d.title.length > 65) add("meta", "warning", `title is ${d.title.length} chars`, "Aim for 30–60 characters with the primary keyword first");
    if (!d.description) add("meta", "error", "missing meta description", "Add a 120–160 character description"); else if (d.description.length < 70 || d.description.length > 170) add("meta", "warning", `description is ${d.description.length} chars`, "Aim for 120–160 characters");
    if (!d.canonical) add("meta", "warning", "no canonical link", "Add <link rel=canonical href=…>");
    if (/noindex/i.test(d.robots ?? "")) add("meta", "error", "page is noindex", "Remove noindex if the page should rank");
    if (!d.viewport) add("meta", "error", "no viewport meta", "Add <meta name=viewport content='width=device-width, initial-scale=1'>");
    if (!d.lang) add("meta", "warning", "<html> lang missing", "Set lang for language targeting");
    for (const k of ["og:title", "og:description", "og:image"]) if (!d.og[k]) add("social", "warning", `missing ${k}`, `Add <meta property="${k}">`);
    if (!d.twitter["twitter:card"]) add("social", "info", "missing twitter:card", 'Add <meta name="twitter:card" content="summary_large_image">');
    const h1 = d.headings.filter((h: any) => h.level === 1).length;
    if (h1 !== 1) add("headings", h1 ? "warning" : "error", `${h1} <h1> elements`, "Use exactly one h1 that states the page topic");
    if (d.images.missingAlt) add("images", "warning", `${d.images.missingAlt} images without alt`, "Add descriptive alt text");
    if (d.images.noDimensions) add("images", "info", `${d.images.noDimensions} images without width/height`, "Set dimensions to avoid layout shift");
    if (d.images.notLazy) add("images", "info", `${d.images.notLazy} below-the-fold images not lazy-loaded`, 'Add loading="lazy"');
    if (d.links.emptyText) add("links", "warning", `${d.links.emptyText} links without text`, "Give links descriptive text or aria-label");
    if (d.links.generic) add("links", "info", `${d.links.generic} generic link texts ("click here")`, "Use descriptive anchor text");
    if (!d.jsonLd.length) add("structured-data", "info", "no JSON-LD structured data", "Add schema.org JSON-LD (Organization, Product, Article…)"); else d.jsonLd.filter((j: any) => !j.valid).forEach((j: any) => add("structured-data", "error", `invalid JSON-LD: ${j.error}`, "Fix the JSON syntax"));
    if (d.wordCount < 250) add("meta", "info", `thin content (${d.wordCount} words)`, "Add substantive content");
    let robots: string | undefined, sitemap: boolean | undefined;
    if (scope === "full") { try { const o = new URL(page.url()).origin; const r = await s.ctx.request.get(`${o}/robots.txt`, { timeout: 8000 }); robots = r.ok() ? (await r.text()).slice(0, 1000) : undefined; sitemap = robots ? /sitemap:/i.test(robots) : false; if (!robots) add("meta", "info", "no robots.txt", "Add robots.txt with a Sitemap: line"); } catch { /* offline */ } }
    const score = audit(issues, (v) => (v.severity === "error" ? 10 : v.severity === "warning" ? 4 : 1));
    return { url: page.url(), score, grade: grade(score), issues: i.includeSuggestions === false ? issues.map(({ suggestion, ...x }) => x) : issues, data: d, robotsTxt: robots, sitemapDeclared: sitemap };
  },
  "browser.visual-regression": async (i) => {
    const fs = nodeModule("node:fs"), path = nodeModule("node:path");
    const shotOf = async (url: string) => { const s = await session({ sessionId: "__vr", viewportWidth: num(i.viewportWidth, 1280), viewportHeight: num(i.viewportHeight, 800) }); await goto(s, url); await s.page.waitForTimeout(300); return shot(s.page, bool(i.fullPage)); };
    let current = i.currentB64 ? str(i.currentB64).replace(/^data:[^,]+,/, "") : i.currentUrl ? await shotOf(str(i.currentUrl)) : null;
    let pageUrl = str(i.currentUrl);
    if (!current) { const { page } = await pageFor(i); current = await shot(page, bool(i.fullPage)); pageUrl = page.url(); }
    const key = (str(i.baselineName) || pageUrl || "baseline").replace(/[^\w.-]+/g, "_").slice(0, 120);
    const baseFile = dataDir() ? path.join(dataDir()!, "baselines", `${key}.png`) : null;
    let baseline = i.baselineB64 ? str(i.baselineB64).replace(/^data:[^,]+,/, "") : i.baselineUrl ? await shotOf(str(i.baselineUrl)) : baseFile && fs.existsSync(baseFile) ? fs.readFileSync(baseFile).toString("base64") : null;
    if (!baseline) { if (!baseFile) throw new Error("no baseline"); fs.mkdirSync(path.dirname(baseFile), { recursive: true }); fs.writeFileSync(baseFile, B().from(current, "base64")); return { baselineCreated: true, baselineFile: baseFile, note: "first run stores the baseline; run again after changes to compare" }; }
    const ignore = str(i.ignoreRegions) ? json<any[]>(i.ignoreRegions, []) : [];
    const tol = num(i.tolerance, 16), threshold = num(i.threshold, 0.1);
    const r = await (await imagePage()).evaluate(`(${DIFF_JS})(${JSON.stringify([dataUrl(baseline), dataUrl(current), tol, ignore])})`);
    const diffShot = saveShot(B().from(r.diffImage, "base64"));
    const passed = r.diffPercent <= threshold && !r.sizeChanged;
    if (bool(i.updateBaseline) && baseFile) { fs.mkdirSync(path.dirname(baseFile), { recursive: true }); fs.writeFileSync(baseFile, B().from(current, "base64")); }
    return { passed, diffPercent: r.diffPercent, diffPixels: r.diffPixels, thresholdPercent: threshold, sizeChanged: r.sizeChanged, changedRegion: r.bbox, diffImage: diffShot.file, baselineFile: baseFile && fs.existsSync(baseFile) ? baseFile : undefined };
  },
  "browser.test-suggester": async (i) => {
    const { page } = await pageFor(i);
    const scope = str(i.scope, "all"), url = page.url();
    const info = await page.evaluate(`(() => ({ forms: (${FORMS_JS})(), nav: [...document.querySelectorAll('nav a[href], header a[href]')].slice(0, 12).map(a => ({ text: a.innerText.trim().slice(0, 40), href: a.getAttribute('href') })), buttons: [...document.querySelectorAll('button,[role=button]')].filter(b => b.offsetParent).slice(0, 12).map(b => ({ text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 40), type: b.type })), dialogs: document.querySelectorAll('dialog,[role=dialog]').length, title: document.title }))()`);
    const sc: { title: string; priority: string; category: string; steps: string[]; code: string }[] = [];
    const q = (s: string) => JSON.stringify(s);
    if (scope === "all" || scope === "navigation") { sc.push({ title: "Page loads with title", priority: "critical", category: "navigation", steps: ["open page", "check title"], code: `await page.goto(${q(url)});\nawait expect(page).toHaveTitle(${q(info.title)});` }); for (const l of info.nav.filter((n: any) => n.text && n.href && !n.href.startsWith("#")).slice(0, 5)) sc.push({ title: `Nav link "${l.text}" works`, priority: "high", category: "navigation", steps: [`click ${l.text}`, "expect URL change and no error"], code: `await page.goto(${q(url)});\nawait page.getByRole('link', { name: ${q(l.text)} }).first().click();\nawait expect(page).toHaveURL(/${l.href.replace(/^https?:\/\/[^/]+/, "").replace(/[/.?*+^$()[\]{}|\\-]/g, "\\$&") || "\\/"}/);` }); }
    if (scope === "all" || scope === "forms") for (const f of info.forms.slice(0, 3)) {
      const req = f.fields.filter((x: any) => x.required);
      sc.push({ title: `Form ${f.selector}: required fields block submit`, priority: "critical", category: "forms", steps: ["submit empty", "expect validation"], code: `await page.goto(${q(url)});\nconst form = page.locator(${q(f.selector)});\nawait form.locator('[type=submit], button').first().click();\n${req.map((x: any) => `await expect(page.locator(${q(x.selector)})).toHaveJSProperty('validity.valid', false);`).join("\n") || "// no required fields — consider adding validation"}` });
      sc.push({ title: `Form ${f.selector}: valid submission`, priority: "high", category: "forms", steps: f.fields.map((x: any) => `fill ${x.name}`), code: `await page.goto(${q(url)});\n${f.fields.filter((x: any) => x.type !== "checkbox" && x.tag !== "select").map((x: any) => `await page.fill(${q(x.selector)}, ${q(validFor(x))});`).join("\n")}\nawait page.locator(${q(f.selector)}).locator('[type=submit], button').first().click();\n// assert success message / redirect here` });
      for (const x of f.fields.filter((y: any) => invalidFor(y).length).slice(0, 3)) sc.push({ title: `Field ${x.name} rejects invalid input`, priority: "medium", category: "forms", steps: [`type ${invalidFor(x)[0]}`], code: `await page.fill(${q(x.selector)}, ${q(invalidFor(x)[0])});\nawait expect(page.locator(${q(x.selector)})).toHaveJSProperty('validity.valid', false);` });
    }
    if (scope === "all" || scope === "interactions") for (const b of info.buttons.filter((x: any) => x.text && x.type !== "submit").slice(0, 4)) sc.push({ title: `Button "${b.text}" responds`, priority: "medium", category: "interactions", steps: [`click ${b.text}`, "expect visible change"], code: `await page.goto(${q(url)});\nawait page.getByRole('button', { name: ${q(b.text)} }).click();\n// assert the resulting UI state` });
    if (scope === "all" || scope === "errors") { sc.push({ title: "No console errors on load", priority: "high", category: "errors", steps: ["collect console errors", "load page"], code: `const errors = [];\npage.on('pageerror', e => errors.push(e.message));\npage.on('console', m => m.type() === 'error' && errors.push(m.text()));\nawait page.goto(${q(url)});\nexpect(errors).toEqual([]);` }); sc.push({ title: "404 page handled", priority: "low", category: "errors", steps: ["open unknown path"], code: `const res = await page.goto(new URL('/__does-not-exist__', ${q(url)}).href);\nexpect(res?.status()).toBe(404);` }); }
    if (scope === "all" || scope === "accessibility") sc.push({ title: "No serious axe violations", priority: "high", category: "accessibility", steps: ["run axe"], code: `import AxeBuilder from '@axe-core/playwright';\nawait page.goto(${q(url)});\nconst r = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze();\nexpect(r.violations.filter(v => ['serious','critical'].includes(v.impact))).toEqual([]);` });
    const order = ["critical", "high", "medium", "low"], prio = str(i.priority, "all");
    const list_ = sc.filter((x) => prio === "all" || order.indexOf(x.priority) <= order.indexOf(prio)).sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority)).slice(0, num(i.maxScenarios, 15));
    const file = i.includeCode === false ? undefined : `import { test, expect } from '@playwright/test';\n\n${list_.map((x) => `test(${q(x.title)}, async ({ page }) => {\n  ${x.code.split("\n").join("\n  ")}\n});`).join("\n\n")}\n`;
    return { url, scenarios: list_.map(({ code, ...x }) => (i.includeCode === false ? x : { ...x, code })), testFile: file };
  },
  "browser.form-test": async (i) => {
    const { page } = await pageFor(i);
    const forms = await page.evaluate(`(${FORMS_JS})(${JSON.stringify(i.formSelector ? str(i.formSelector) : null)})`);
    if (!forms.length) throw new Error("no forms found");
    const url = page.url(), results: any[] = [];
    const validity = (s: string) => page.evaluate((q: string) => { const el = document.querySelector(q) as any; return el ? { valid: el.validity?.valid ?? true, message: el.validationMessage } : null; }, s);
    for (const f of forms.slice(0, 3)) {
      const r: any = { form: f.selector, method: f.method, action: f.action, fields: f.fields.length, tests: [] };
      const reset = async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); };
      if (i.testEmpty !== false) { await reset(); const v = await page.evaluate((q: string) => { const fm = document.querySelector(q) as HTMLFormElement; return fm ? { valid: fm.checkValidity(), invalid: [...fm.elements].filter((e: any) => e.willValidate && !e.validity.valid).map((e: any) => ({ name: e.name || e.id, message: e.validationMessage })) } : null; }, f.selector); r.tests.push({ test: "empty submit blocked", passed: f.fields.some((x: any) => x.required) ? v?.valid === false : null, detail: v, note: f.fields.some((x: any) => x.required) ? undefined : "no required fields declared — server-side validation only?" }); }
      if (i.testInvalid !== false) for (const x of f.fields) for (const bad of invalidFor(x)) { await page.fill(x.selector, bad).catch(() => undefined); const v = await validity(x.selector); r.tests.push({ test: `${x.name} rejects "${bad.slice(0, 30)}"`, passed: v ? !v.valid : null, message: v?.message }); }
      if (i.testValid !== false) { await reset(); for (const x of f.fields) { if (x.tag === "select") { if (x.options?.[1]) await page.selectOption(x.selector, x.options[1]).catch(() => undefined); } else if (x.type === "checkbox" || x.type === "radio") { if (x.required) await page.check(x.selector).catch(() => undefined); } else await page.fill(x.selector, validFor(x)).catch(() => undefined); } const ok = await page.evaluate((q: string) => (document.querySelector(q) as HTMLFormElement)?.checkValidity(), f.selector); r.tests.push({ test: "valid data passes client validation", passed: !!ok }); }
      if (i.testEdgeCases !== false) for (const x of f.fields.filter((y: any) => ["text", "textarea", "search", ""].includes(y.type) || y.tag === "textarea").slice(0, 3)) for (const [label, val] of [["10k chars", "x".repeat(10000)], ["unicode", "తెలుగు 😀 Ω"], ["html", "<script>alert(1)</script>"]] as [string, string][]) { await page.fill(x.selector, val).catch(() => undefined); const v = await page.evaluate((q: string) => (document.querySelector(q) as any)?.value?.length, x.selector); r.tests.push({ test: `${x.name} edge: ${label}`, passed: true, storedLength: v, note: x.maxLength && v > x.maxLength ? "maxlength not enforced" : undefined }); }
      r.passed = r.tests.filter((t: any) => t.passed === false).length === 0;
      results.push(r);
    }
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    return { url, forms: forms.map((f: any) => ({ selector: f.selector, fields: f.fields })), results, note: "client-side validation only — the form is never submitted" };
  },
  "browser.api-test": async (i) => {
    const { s, page } = await pageFor(i);
    const action = str(i.action, "all");
    if (!s.network.some((e) => ["xhr", "fetch"].includes(e.type))) { s.recording.network = true; s.recording.bodies = !!i.includePayloads || bool(i.validateSchemas, true); await page.reload({ waitUntil: "networkidle" }).catch(() => undefined); await page.waitForTimeout(num(i.duration, 2000)); }
    const apis = s.network.filter((e) => ["xhr", "fetch"].includes(e.type));
    const groups = new Map<string, NetEntryLike[]>();
    for (const e of apis) { const k = `${e.method} ${e.url.split("?")[0]}`; groups.set(k, [...(groups.get(k) ?? []), e]); }
    const endpoints = [...groups.entries()].map(([k, es]) => {
      const last = es[es.length - 1], h = last.resHeaders ?? {};
      let schema: any; if (last.body) { try { const j = JSON.parse(last.body); const shape = (v: any, d = 0): any => (d > 3 ? typeof v : Array.isArray(v) ? [v.length ? shape(v[0], d + 1) : "unknown"] : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).slice(0, 25).map(([a, b]) => [a, shape(b, d + 1)])) : v === null ? "null" : typeof v); schema = shape(j); } catch { schema = "invalid JSON"; } }
      const issues = [...((last.status ?? 0) >= 400 ? [`HTTP ${last.status}`] : []), ...(last.failure ? [last.failure] : []), ...(bool(i.checkCaching, true) && last.method === "GET" && !h["cache-control"] && !h.etag ? ["no Cache-Control/ETag on GET"] : []), ...(bool(i.checkCORS, true) && h["access-control-allow-origin"] === "*" && h["access-control-allow-credentials"] === "true" ? ["CORS: * with credentials"] : []), ...(schema === "invalid JSON" && /json/.test(h["content-type"] ?? "") ? ["body is not valid JSON"] : []), ...((last.ms ?? 0) > 1000 ? [`slow (${last.ms} ms)`] : [])];
      return { endpoint: k, calls: es.length, status: last.status, ms: last.ms, sizeBytes: last.size, contentType: h["content-type"], cacheControl: h["cache-control"], cors: h["access-control-allow-origin"], schema: action !== "discover" && bool(i.validateSchemas, true) ? schema : undefined, payload: bool(i.includePayloads) ? { request: last.postData, response: last.body?.slice(0, 2000) } : undefined, issues };
    });
    if (action === "benchmark" || action === "all") for (const ep of endpoints.filter((e) => e.endpoint.startsWith("GET ")).slice(0, 5)) {
      const u = ep.endpoint.slice(4), times: number[] = [];
      for (let k = 0; k < 5; k++) { const t0 = Date.now(); try { await s.ctx.request.get(u, { timeout: 15000 }); times.push(Date.now() - t0); } catch { /* skip */ } }
      if (times.length) { times.sort((a, b) => a - b); (ep as any).benchmark = { runs: times.length, minMs: times[0], p50Ms: times[Math.floor(times.length / 2)], maxMs: times[times.length - 1] }; }
    }
    return { url: page.url(), discovered: endpoints.length, failing: endpoints.filter((e) => e.issues.some((x) => /HTTP|failed|net::/.test(x))).length, endpoints };
  },
  "browser.design-audit": async (i) => {
    const { page } = await pageFor(i);
    const scope = str(i.scope, "all"), source = str(i.source, "all");
    const r = await runScript(page, generateDesignAuditCDP(scope, source));
    const v: any[] = r?.violations ?? [];
    const rules = source === "all" ? ALL_RULES : RULES_BY_SOURCE[source as keyof typeof RULES_BY_SOURCE] ?? ALL_RULES;
    const enriched = v.map((x) => { const rule = rules.find((y) => y.id === x.rule); return { ...x, title: rule?.title, category: rule?.category, fix: rule?.fix ?? x.suggestion, ...(bool(i.includeCodeExamples) && rule?.pattern ? { example: rule.pattern } : {}) }; });
    const score = audit(enriched, (x) => (rules.find((y) => y.id === x.rule)?.weight ?? (x.severity === "error" ? 8 : 3)) / 2);
    const byCat: Record<string, number> = {}; for (const x of enriched) byCat[x.category ?? "other"] = (byCat[x.category ?? "other"] ?? 0) + 1;
    return { url: page.url(), scope, source, score, grade: grade(score), violations: enriched.length, byCategory: byCat, findings: enriched.slice(0, 150), rulesChecked: rules.length };
  },
  "browser.design-suggest": async (i) => {
    const { page } = await pageFor(i);
    const [auditR, typo, space, colors] = await Promise.all([runScript(page, generateDesignAuditCDP("all", "all")), runScript(page, generateTypographyCDP()), runScript(page, generateSpacingCDP()), runScript(page, generateColorPaletteCDP())]);
    const fw = str(i.framework, "tailwind"), focus = str(i.focusArea, "all"), max = num(i.maxSuggestions, 10);
    const sugg: { area: string; priority: string; title: string; why: string; code?: string }[] = [];
    for (const v of (auditR?.violations ?? []).slice(0, 40)) { const rule = ALL_RULES.find((r) => r.id === v.rule); const area = ["a11y", "accessibility", "forms"].includes(rule?.category ?? "") ? "accessibility" : ["animation"].includes(rule?.category ?? "") ? "performance" : "visual"; sugg.push({ area, priority: v.severity === "error" ? "high" : "medium", title: rule?.title ?? v.rule, why: `${v.element}: ${v.suggestion ?? rule?.fix}`, code: rule?.pattern }); }
    const sizes = Object.keys(typo?.sizes ?? {}); if (sizes.length > 8) sugg.push({ area: "visual", priority: "medium", title: `Consolidate ${sizes.length} font sizes into a type scale`, why: "Too many sizes weaken hierarchy", code: fw === "tailwind" ? "text-xs text-sm text-base text-lg text-xl text-2xl text-4xl" : ":root{--text-sm:.875rem;--text-base:1rem;--text-lg:1.125rem;--text-xl:1.25rem;--text-2xl:1.5rem;--text-4xl:2.25rem}" });
    const off = (space?.offGrid ?? space?.violations ?? []) as any[]; if (Array.isArray(off) && off.length) sugg.push({ area: "visual", priority: "low", title: `${off.length} spacing values off the 4px grid`, why: `Use the ramp ${FLUENT_SPACING_RAMP.slice(0, 10).join(", ")}px`, code: fw === "tailwind" ? "p-1 p-2 p-3 p-4 p-6 p-8 (4px multiples)" : "--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-6:24px" });
    const nColors = Object.keys(colors?.colors ?? colors?.palette ?? {}).length; if (nColors > 12) sugg.push({ area: "visual", priority: "medium", title: `Reduce ${nColors} distinct colours to a token palette`, why: "Ad-hoc colours drift; use semantic tokens", code: "use browser.color-palette action=tokens" });
    let llmText: string | undefined;
    if (hasLlm()) { const img = await shot(page); const v = await visionOrNull(`You are a senior product designer. Given this screenshot and these automated findings, give the ${max} most impactful improvements for ${focus === "all" ? "visual design, UX, performance and accessibility" : focus}, each with a concrete ${fw} code change.\nFindings: ${JSON.stringify(sugg.slice(0, 25))}`, [dataUrl(img)]); llmText = v?.text; }
    const filtered = sugg.filter((x) => focus === "all" || x.area === focus || (focus === "ux" && x.area === "visual")).sort((a, b) => (a.priority === "high" ? 0 : a.priority === "medium" ? 1 : 2) - (b.priority === "high" ? 0 : b.priority === "medium" ? 1 : 2)).slice(0, max);
    return { url: page.url(), suggestions: filtered, designerNotes: llmText ?? null, llm: llmText ? "used" : "not configured — rule-based suggestions only" };
  },
  "browser.design-generate": async (i) => {
    const component = str(i.component), fw = str(i.framework, "tailwind"), theme = str(i.theme, "both"), style = str(i.style, "modern");
    const prompt = `Generate a ${fw} ${component} component with ${style} style, ${theme} theme, fully accessible, responsive, with dark mode and reduced-motion support. Follow Vercel Web Interface Guidelines and Fluent 2 spacing (4px grid).`;
    const rules = ALL_RULES.filter((r) => r.weight >= 7).slice(0, 25).map((r) => `- ${r.title}: ${r.fix}`).join("\n");
    if (!hasLlm()) throw new Error("design generation needs a language model (the agent runtime provides its configured model; standalone set ANTHROPIC_API_KEY / OPENAI_API_KEY / OLLAMA_HOST)");
    const r = await callLlm({ system: `You write production-quality UI components. Follow these rules:\n${rules}${bool(i.responsive, true) ? "\n- Mobile-first, responsive." : ""}${bool(i.accessibility, true) ? "\n- WCAG 2.2 AA: labels, focus-visible, contrast, keyboard." : ""}${bool(i.animations) ? "\n- Subtle motion, respect prefers-reduced-motion." : ""}`, prompt: `${prompt}\nReply with one code block, then a 3-line note on design decisions.`, maxTokens: 4000 });
    const code = /```[\w+-]*\n([\s\S]*?)```/.exec(r.text)?.[1] ?? r.text;
    const fs = nodeModule("node:fs"), path = nodeModule("node:path");
    let file: string | undefined;
    if (fs && dataDir()) { file = path.join(dataDir()!, "exports", `${component.replace(/\W+/g, "-").toLowerCase()}.${fw === "css" ? "html" : "tsx"}`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, code); }
    let preview: string | undefined;
    if (fw === "css" || /<html|<div|<section/i.test(code) && !/import |export /.test(code)) { try { const s = await session({ sessionId: "__preview" }); await s.page.setContent(code); preview = saveShot(await s.page.screenshot({ type: "png" })).file; } catch { /* no browser */ } }
    return { component, framework: fw, theme, style, code, notes: r.text.replace(/```[\s\S]*?```/, "").trim().slice(0, 1000), file, preview, model: r.model };
  },
  "browser.color-palette": async (i) => {
    const action = str(i.action, "analyse"), std = str(i.contrastStandard, "AA");
    if (action === "generate" || action === "tokens") {
      const brand = str(i.brandColor, "#4f46e5");
      if (!/^#?[0-9a-f]{3,6}$/i.test(brand)) throw new Error("brandColor must be a hex colour like #4f46e5");
      const p = palette(brand.startsWith("#") ? brand : `#${brand}`, std, i.includeDarkMode !== false);
      return action === "tokens" ? { format: str(i.outputFormat, "css"), tokens: tokensOut(p, str(i.outputFormat, "css")), contrastChecks: p.contrastChecks } : { brandColor: brand, ...p, css: tokensOut(p, str(i.outputFormat, "css")) };
    }
    const { page } = await pageFor(i);
    const r = await runScript(page, generateColorPaletteCDP(i.brandColor ? str(i.brandColor) : undefined));
    if (action === "validate") {
      const pairs = await page.evaluate(() => { const out: Record<string, number> = {}; for (const e of document.querySelectorAll("p,span,a,li,button,h1,h2,h3,label,td")) { if (!(e as HTMLElement).innerText?.trim()) continue; let b: Element | null = e, bg = "rgb(255, 255, 255)"; while (b) { const c = getComputedStyle(b).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; } b = b.parentElement; } const k = `${getComputedStyle(e).color}|${bg}|${parseFloat(getComputedStyle(e).fontSize) >= 24 ? "L" : "N"}`; out[k] = (out[k] ?? 0) + 1; } return out; });
      const res = Object.entries(pairs).map(([k, n]) => { const [fg, bg, size] = k.split("|"); const a = parseColor(fg), b = parseColor(bg); const ratio = a && b ? contrast(a, b) : null; const need = std === "AAA" ? (size === "L" ? 4.5 : 7) : (size === "L" ? 3 : 4.5); return { fg: a ? rgb2hex(a[0], a[1], a[2]) : fg, bg: b ? rgb2hex(b[0], b[1], b[2]) : bg, largeText: size === "L", uses: n, ratio, required: need, passes: ratio !== null && ratio >= need }; }).sort((x, y) => (x.ratio ?? 0) - (y.ratio ?? 0));
      return { url: page.url(), standard: std, pairs: res.length, failing: res.filter((x) => !x.passes).length, results: res.slice(0, 40), wcag: WCAG_CONTRAST };
    }
    return { url: page.url(), analysis: r };
  },
  "browser.typography-check": async (i) => {
    const { page } = await pageFor(i);
    const r = await runScript(page, generateTypographyCDP());
    const extra = await page.evaluate((loading: boolean) => { const fams = new Set<string>(); document.querySelectorAll("body *").forEach((e) => fams.add(getComputedStyle(e).fontFamily.split(",")[0].replace(/["']/g, "").trim())); const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({ level: +h.tagName[1], size: parseFloat(getComputedStyle(h).fontSize), weight: +getComputedStyle(h).fontWeight })); const body = parseFloat(getComputedStyle(document.querySelector("p") ?? document.body).fontSize); const lh = (() => { const p = document.querySelector("p"); if (!p) return null; const s = getComputedStyle(p); return s.lineHeight === "normal" ? 1.2 : parseFloat(s.lineHeight) / parseFloat(s.fontSize); })(); const measure = (() => { const p = [...document.querySelectorAll("p")].find((x) => x.innerText.length > 200); return p ? Math.round(p.getBoundingClientRect().width / (parseFloat(getComputedStyle(p).fontSize) * 0.5)) : null; })(); const fontsLoaded = loading ? [...(document as any).fonts].map((f: any) => ({ family: f.family, status: f.status, display: f.display })) : undefined; return { families: [...fams].filter(Boolean), headings: hs, bodySize: body, bodyLineHeight: lh, charsPerLine: measure, fonts: fontsLoaded }; }, bool(i.checkLoading, true));
    const issues: string[] = [];
    if (extra.families.length > 3) issues.push(`${extra.families.length} font families in use (${extra.families.slice(0, 5).join(", ")}) — limit to 2–3`);
    if (extra.bodySize < 16) issues.push(`body text ${extra.bodySize}px — use ≥ 16px`);
    if (extra.bodyLineHeight && extra.bodyLineHeight < 1.4) issues.push(`body line-height ${r2(extra.bodyLineHeight, 2)} — use 1.5–1.7`);
    if (extra.charsPerLine && (extra.charsPerLine > 85 || extra.charsPerLine < 40)) issues.push(`~${extra.charsPerLine} characters per line — aim for 45–75`);
    if (bool(i.checkHierarchy, true)) { const byLevel: Record<number, number> = {}; for (const h of extra.headings) byLevel[h.level] = Math.max(byLevel[h.level] ?? 0, h.size); const lv = Object.keys(byLevel).map(Number).sort(); for (let k = 1; k < lv.length; k++) if (byLevel[lv[k]] >= byLevel[lv[k - 1]]) issues.push(`h${lv[k]} (${byLevel[lv[k]]}px) is not smaller than h${lv[k - 1]} (${byLevel[lv[k - 1]]}px)`); }
    if (extra.fonts?.some((f: any) => f.display === "auto" || f.display === "block")) issues.push("web fonts without font-display: swap/optional (invisible text while loading)");
    const score = Math.max(0, 100 - issues.length * 12);
    return { url: page.url(), scale: str(i.scale, "both"), score, grade: grade(score), issues, ...extra, analysis: r };
  },
  "browser.spacing-check": async (i) => {
    const { page } = await pageFor(i);
    const r = await runScript(page, generateSpacingCDP());
    const tol = num(i.tolerance, 0);
    const values: number[] = await page.evaluate(() => { const out: number[] = []; for (const e of [...document.querySelectorAll("body *")].slice(0, 3000)) { const s = getComputedStyle(e); for (const k of ["marginTop", "marginBottom", "marginLeft", "marginRight", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "gap", "rowGap", "columnGap"]) { const v = parseFloat((s as any)[k]); if (v >= 4) out.push(Math.round(v)); } } return out; });
    const counts: Record<number, number> = {}; for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
    const off = Object.entries(counts).filter(([v]) => { const n = Number(v); return n % 4 > tol && 4 - (n % 4) > tol; }).sort((a, b) => b[1] - a[1]);
    const onGrid = values.length ? r2((values.filter((v) => v % 4 <= tol || 4 - (v % 4) <= tol).length / values.length) * 100, 1) : 100;
    const out: any = { url: page.url(), gridUnit: 4, onGridPercent: onGrid, distinctValues: Object.keys(counts).length, offGrid: off.slice(0, 15).map(([v, n]) => ({ px: Number(v), uses: n, nearest: Math.round(Number(v) / 4) * 4 })), mostUsed: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v, n]) => ({ px: Number(v), uses: n })), ramp: FLUENT_SPACING_RAMP, analysis: r };
    if (bool(i.checkResponsive)) { const orig = page.viewportSize(); await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(300); out.mobileHorizontalPadding = await page.evaluate(() => { const m = document.querySelector("main") ?? document.body; const r = m.getBoundingClientRect(); const first = m.querySelector("p,h1,h2"); return first ? Math.round(first.getBoundingClientRect().left - r.left) : null; }); if (orig) await page.setViewportSize(orig); }
    out.score = Math.round(onGrid); out.grade = grade(out.score);
    return out;
  },
  "browser.component-qa": async (i) => {
    const { page } = await pageFor(i);
    const r = await runScript(page, generateComponentQACDP());
    const want = list(i.components).map((c) => c.toLowerCase().replace(/s$/, ""));
    const fixes = i.includeFixes !== false;
    const issues: { component: string; issue: string; fix?: string }[] = [];
    const comp = (r ?? {}) as Record<string, any[]>;
    const use = (k: string) => !want.length || want.some((w) => k.startsWith(w));
    if (use("button")) for (const b of comp.buttons ?? []) {
      const n = b.text || "(icon)";
      if (b.isIconOnly && !b.hasAriaLabel) issues.push({ component: "button", issue: `icon-only button without aria-label`, fix: fixes ? '<button aria-label="Describe action">…</button>' : undefined });
      if (!b.meetsTouchTarget && !b.disabled) issues.push({ component: "button", issue: `"${n}" is ${b.width}×${b.height}px (< 44×44 touch target)`, fix: fixes ? "min-height: 44px; min-width: 44px (or padding: 12px 16px)" : undefined });
      if (b.cursor !== "pointer" && !b.disabled) issues.push({ component: "button", issue: `"${n}" has cursor:${b.cursor}`, fix: fixes ? "cursor: pointer" : undefined });
    }
    if (use("input")) for (const f of comp.inputs ?? []) {
      if (["hidden", "submit", "button"].includes(f.type)) continue;
      if (!f.hasLabel && !f.hasAriaLabel) issues.push({ component: "input", issue: `${f.type} "${f.name || f.id}" has no label`, fix: fixes ? `<label for="${f.id || f.name}">…</label>` : undefined });
      if (!f.hasAutocomplete && /email|name|tel|address|postal|zip/.test(`${f.type} ${f.name}`)) issues.push({ component: "input", issue: `${f.name || f.type} lacks autocomplete`, fix: fixes ? `autocomplete="${/email/.test(f.type + f.name) ? "email" : /tel/.test(f.type + f.name) ? "tel" : "on"}"` : undefined });
    }
    if (use("link")) for (const l of comp.links ?? []) {
      if (!l.hasHref) issues.push({ component: "link", issue: `<a> "${l.text}" without href (not keyboard reachable)`, fix: fixes ? "use <button> for actions or add href" : undefined });
      if (l.hasTarget && !l.hasRel) issues.push({ component: "link", issue: `"${l.text}" opens a new tab without rel`, fix: fixes ? 'rel="noopener noreferrer"' : undefined });
      if (!l.text) issues.push({ component: "link", issue: "link with no text", fix: fixes ? "add text or aria-label" : undefined });
    }
    if (use("modal")) for (const m of comp.modals ?? []) { if (!m.hasAriaLabel) issues.push({ component: "modal", issue: "dialog without accessible name", fix: fixes ? 'aria-labelledby="dialog-title"' : undefined }); if (!m.hasCloseButton) issues.push({ component: "modal", issue: "dialog without close button", fix: fixes ? '<button aria-label="Close">×</button>' : undefined }); }
    const comps = Object.entries(comp).filter(([k, v]) => Array.isArray(v) && use(k.replace(/s$/, ""))).map(([k, v]) => ({ type: k, count: v.length }));
    const states = await page.evaluate(() => { const st = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).join("\n"); return { hover: (st.match(/:hover/g) ?? []).length, focusVisible: (st.match(/:focus-visible/g) ?? []).length, disabled: (st.match(/:disabled|\[disabled\]/g) ?? []).length, reducedMotion: /prefers-reduced-motion/.test(st), darkMode: /prefers-color-scheme:\s*dark/.test(st) || !!document.querySelector("[data-theme=dark], .dark") }; });
    if (!states.focusVisible) issues.push({ component: "global", issue: "no :focus-visible styles", fix: i.includeFixes === false ? undefined : ":focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }" });
    if (!states.reducedMotion) issues.push({ component: "global", issue: "no prefers-reduced-motion handling", fix: i.includeFixes === false ? undefined : "@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }" });
    const score = Math.max(0, Math.round(100 - issues.length * 100 / (issues.length + 20)));
    return { url: page.url(), components: comps, states, score, grade: grade(score), issues: issues.slice(0, 100) };
  },
});

type NetEntryLike = { url: string; method: string; type: string; status?: number; ms?: number; size?: number; resHeaders?: Record<string, string>; postData?: string; body?: string; failure?: string };
void snapshot;
