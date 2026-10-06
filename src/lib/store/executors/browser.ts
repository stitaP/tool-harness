/**
 * Browser automation executors (Playwright, agent runtime only).
 *
 * One Chromium per process, one context+page per named session
 * (`sessionId`, or `tabId` for compatibility; default "default"). Each session
 * keeps rolling buffers of console messages, network requests, WebSocket
 * frames and DOM events so the inspect tools can report on what happened.
 * Playwright is resolved at runtime (project, agent folder or global npm);
 * Chromium from STITAP_CHROMIUM, Playwright's own download, or installed
 * Chrome/Edge.
 */
import { execs, num, str, bool, list, json, secret, nodeModule, isBrowser, dataDir, uid, r2, type ExecMap } from "./util";

// ─── Playwright loading ──────────────────────────────────────────────────────

let pwCache: any;
function loadPlaywright(): any {
  if (pwCache) return pwCache;
  if (isBrowser()) throw new Error("browser automation needs the desktop/agent runtime (Playwright)");
  const mod = nodeModule("node:module"), path = nodeModule("node:path"), cp = nodeModule("node:child_process");
  const bases = [process.cwd() + "/", (() => { try { return import.meta.url; } catch { return ""; } })(), path.join(process.execPath, "..", "..", "lib", "node_modules") + "/", path.join(process.execPath, "..", "node_modules") + "/"].filter(Boolean);
  try { const g = String(cp.execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 })).trim(); if (g) bases.push(g + "/"); } catch { /* npm missing */ }
  for (const b of bases) for (const name of ["playwright", "playwright-core"]) {
    try { pwCache = mod.createRequire(b)(name); return pwCache; } catch { /* next */ }
  }
  throw new Error("Playwright is not installed. Install once: npm i -g playwright && npx playwright install chromium (or set STITAP_CHROMIUM to a Chrome/Edge executable)");
}

let browserP: Promise<any> | null = null;
async function browser(): Promise<any> {
  if (browserP) { const b = await browserP.catch(() => null); if (b?.isConnected()) return b; }
  const pw = loadPlaywright();
  const headless = secret("STITAP_BROWSER_HEADLESS") !== "false";
  const exe = secret("STITAP_CHROMIUM");
  browserP = (async () => {
    const errs: string[] = [];
    for (const opts of [exe ? { executablePath: exe } : null, {}, { channel: "chrome" }, { channel: "msedge" }].filter(Boolean) as any[]) {
      try { return await pw.chromium.launch({ headless, ...opts }); } catch (e: any) { errs.push(e.message.split("\n")[0]); }
    }
    throw new Error(`could not launch Chromium: ${errs.join(" | ")} — run: npx playwright install chromium`);
  })();
  return browserP;
}

// ─── sessions ────────────────────────────────────────────────────────────────

export interface NetEntry { id: string; url: string; method: string; type: string; status?: number; ms?: number; size?: number; reqHeaders?: Record<string, string>; resHeaders?: Record<string, string>; postData?: string; body?: string; failure?: string; t0: number; fromCache?: boolean }
export interface Sess { ctx: any; page: any; console: any[]; network: NetEntry[]; ws: any[]; recording: { network: boolean; console: boolean; ws: boolean; bodies: boolean }; mainResponse?: any; persistent?: boolean; extensions?: string[] }
const sessions = new Map<string, Sess>();
const sid = (i: Record<string, unknown>) => str(i.sessionId ?? (i.tabId !== undefined ? `tab-${i.tabId}` : undefined), "default");

function wire(s: Sess, page: any) {
  page.on("console", (m: any) => { if (!s.recording.console) return; s.console.push({ level: m.type(), text: m.text(), location: m.location?.(), at: Date.now() }); if (s.console.length > 1000) s.console.shift(); });
  page.on("pageerror", (e: Error) => { s.console.push({ level: "error", text: `Uncaught ${e.name}: ${e.message}`, stack: e.stack, at: Date.now() }); if (s.console.length > 1000) s.console.shift(); });
  const byReq = new WeakMap<any, NetEntry>();
  page.on("request", (r: any) => { if (!s.recording.network) return; const e: NetEntry = { id: uid("rq").toLowerCase(), url: r.url(), method: r.method(), type: r.resourceType(), reqHeaders: r.headers(), postData: r.postData()?.slice(0, 4000), t0: Date.now() }; byReq.set(r, e); s.network.push(e); if (s.network.length > 2000) s.network.shift(); });
  page.on("requestfinished", async (r: any) => {
    const e = byReq.get(r); if (!e) return;
    const res = await r.response().catch(() => null);
    e.ms = Date.now() - e.t0; e.status = res?.status(); e.resHeaders = res?.headers(); e.fromCache = res?.fromServiceWorker?.() ?? false;
    try { const sz = await r.sizes(); e.size = sz.responseBodySize; } catch { /* n/a */ }
    if (s.recording.bodies && res && /json|text|javascript|xml/.test(res.headers()["content-type"] ?? "")) { try { e.body = (await res.text()).slice(0, 10000); } catch { /* streamed */ } }
  });
  page.on("requestfailed", (r: any) => { const e = byReq.get(r); if (e) { e.failure = r.failure()?.errorText; e.ms = Date.now() - e.t0; } });
  page.on("websocket", (ws: any) => {
    const rec = (dir: string) => (f: any) => { if (!s.recording.ws) return; s.ws.push({ url: ws.url(), dir, payload: String(f.payload ?? "").slice(0, 2000), at: Date.now() }); if (s.ws.length > 2000) s.ws.shift(); };
    s.ws.push({ url: ws.url(), dir: "open", at: Date.now() });
    ws.on("framesent", rec("sent")); ws.on("framereceived", rec("received")); ws.on("close", () => s.ws.push({ url: ws.url(), dir: "close", at: Date.now() }));
  });
}

export async function session(i: Record<string, unknown>): Promise<Sess> {
  const key = sid(i);
  let s = sessions.get(key);
  if (s && !s.page.isClosed()) return s;
  const vw = { width: num(i.viewportWidth, 1280), height: num(i.viewportHeight, 800) };
  const ext = i.extensionPath ? list(i.extensionPath) : [];
  let ctx: any, persistent = false;
  if (ext.length) {
    const pw = loadPlaywright(), path = nodeModule("node:path");
    ctx = await pw.chromium.launchPersistentContext(path.join(dataDir() ?? nodeModule("node:os").tmpdir(), "browser-profiles", key), { headless: secret("STITAP_BROWSER_HEADLESS") !== "false", executablePath: secret("STITAP_CHROMIUM") || undefined, viewport: vw, args: [`--disable-extensions-except=${ext.join(",")}`, ...ext.map((e) => `--load-extension=${e}`), "--headless=new"] });
    persistent = true;
  } else ctx = await (await browser()).newContext({ viewport: vw, ignoreHTTPSErrors: secret("STITAP_BROWSER_IGNORE_TLS") === "true", userAgent: secret("STITAP_BROWSER_UA") || undefined });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  s = { ctx, page, console: [], network: [], ws: [], recording: { network: true, console: true, ws: true, bodies: false }, persistent, extensions: ext };
  wire(s, page);
  ctx.on("page", (p: any) => { s!.page = p; wire(s!, p); });
  sessions.set(key, s);
  return s;
}

/** Page for a tool call; navigates first when `url` is given and differs from the current page. */
export async function pageFor(i: Record<string, unknown>): Promise<{ s: Sess; page: any }> {
  const s = await session(i);
  if (i.url && s.page.url() !== str(i.url)) await goto(s, str(i.url), num(i.timeout, 30000));
  if (s.page.url() === "about:blank" && !i.url) throw new Error("no page loaded — call browser.navigate first (or pass url)");
  return { s, page: s.page };
}
export async function goto(s: Sess, url: string, timeout = 30000) {
  const u = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
  const res = await s.page.goto(u, { waitUntil: "domcontentloaded", timeout });
  s.mainResponse = res;
  await s.page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 8000) }).catch(() => undefined);
  return res;
}
export async function closeStoreBrowsers(): Promise<void> {
  for (const s of sessions.values()) await s.ctx.close().catch(() => undefined);
  sessions.clear();
  if (browserP) { const b = await browserP.catch(() => null); await b?.close().catch(() => undefined); browserP = null; }
}

/** Save a screenshot buffer; returns path plus base64 when small (or when asked). */
export function saveShot(buf: Uint8Array, ext = "png", withB64 = false): { file?: string; bytes: number; base64?: string } {
  const fs = nodeModule("node:fs"), path = nodeModule("node:path");
  const B = (globalThis as any).Buffer;
  let file: string | undefined;
  if (fs && dataDir()) { file = path.join(dataDir()!, "screenshots", `shot-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${ext}`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }
  return { file, bytes: buf.length, ...(withB64 ? { base64: B.from(buf).toString("base64") } : {}) };
}
export const dataUrl = (b64: string, mime = "image/png") => (b64.startsWith("data:") ? b64 : `data:${mime};base64,${b64}`);

/** Resolve a selector: CSS, Playwright engines (text=, role=, xpath=) or a [ref] number from a snapshot. */
export const sel = (v: unknown) => { const s = str(v).trim(); return /^\[?\d+\]?$/.test(s) ? `[data-stitap-ref="${s.replace(/\D/g, "")}"]` : s; };

const SNAPSHOT_JS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  document.querySelectorAll('[data-stitap-ref]').forEach(e => e.removeAttribute('data-stitap-ref'));
  const q = 'a[href], button, input, textarea, select, [role=button], [role=link], [role=tab], [role=checkbox], [role=menuitem], [contenteditable=true], summary';
  let n = 0; const items = [];
  for (const el of document.querySelectorAll(q)) { if (!vis(el) || n >= 150) continue; n++; el.setAttribute('data-stitap-ref', String(n));
    const tag = el.tagName.toLowerCase(), type = el.getAttribute('type') || '';
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    items.push('[' + n + '] ' + tag + (type ? '[' + type + ']' : '') + ' ' + JSON.stringify(label) + (tag === 'a' ? ' -> ' + el.getAttribute('href') : '')); }
  return { title: document.title, url: location.href, text: (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 4000), interactive: items };
})()`;
export const snapshot = (page: any) => page.evaluate(SNAPSHOT_JS);

// ─── in-page scripts ─────────────────────────────────────────────────────────

const EXTRACT_JS = `(o) => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const root = o.selector ? document.querySelector(o.selector) : document.body;
  if (!root) return { error: 'selector not found: ' + o.selector };
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
  if (o.mode === 'links') return [...root.querySelectorAll('a[href]')].filter(a => o.includeHidden || vis(a)).map(a => ({ text: txt(a).slice(0, 120), href: a.href, rel: a.rel || undefined, external: a.host !== location.host })).slice(0, 1000);
  if (o.mode === 'tables') return [...root.querySelectorAll('table')].map(t => { const rows = [...t.rows].map(r => [...r.cells].map(c => txt(c))); const head = t.tHead ? rows.shift() : (t.rows[0] && [...t.rows[0].cells].every(c => c.tagName === 'TH') ? rows.shift() : null); return { caption: t.caption ? txt(t.caption) : undefined, headers: head, rows: rows.slice(0, 500), objects: head ? rows.slice(0, 500).map(r => Object.fromEntries(head.map((h, k) => [h || 'col' + k, r[k]]))) : undefined }; });
  if (o.mode === 'metadata') { const m = {}; document.querySelectorAll('meta[name], meta[property]').forEach(x => m[x.getAttribute('name') || x.getAttribute('property')] = x.content); return { title: document.title, lang: document.documentElement.lang, canonical: document.querySelector('link[rel=canonical]')?.href, meta: m, jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent); } catch { return { invalid: s.textContent.slice(0, 200) }; } }) }; }
  if (o.mode === 'selector') return [...(o.selector ? document.querySelectorAll(o.selector) : [root])].filter(e => o.includeHidden || vis(e)).slice(0, 500).map(e => { const out = { tag: e.tagName.toLowerCase(), text: txt(e).slice(0, 500) }; for (const a of (o.attributes || [])) out[a] = e.getAttribute(a); if (!o.attributes?.length) { if (e.href) out.href = e.href; if (e.src) out.src = e.src; if (e.value !== undefined && e.value !== '') out.value = e.value; } return out; });
  if (o.mode === 'structured') { const walk = (el, d) => { if (d > (o.maxDepth || 6) || (!o.includeHidden && el.nodeType === 1 && !vis(el))) return null; const kids = [...el.children].map(c => walk(c, d + 1)).filter(Boolean); const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim(); const t = el.tagName.toLowerCase(); if (!kids.length && !own && !['img','input','button','a'].includes(t)) return null; const n = { tag: t }; if (el.id) n.id = el.id; const role = el.getAttribute('role'); if (role) n.role = role; if (own) n.text = own.slice(0, 200); if (t === 'a') n.href = el.href; if (t === 'img') n.alt = el.alt, n.src = el.src; if (kids.length) n.children = kids; return n; }; return walk(root, 0); }
  return { text: (o.includeHidden ? root.textContent : root.innerText).replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 100000) };
}`;

const INSPECT_JS = `(o) => {
  const root = o.selector ? document.querySelector(o.selector) : document.documentElement;
  if (!root) return { error: 'selector not found' };
  let count = 0;
  const STY = ['display','position','color','backgroundColor','fontSize','fontWeight','fontFamily','margin','padding','width','height','zIndex','opacity','overflow','flexDirection','gridTemplateColumns'];
  const node = (el, d) => {
    if (count++ >= (o.maxNodes || 500)) return { truncated: true };
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!o.includeHidden && (cs.display === 'none' || cs.visibility === 'hidden')) return null;
    const n = { tag: el.tagName.toLowerCase(), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    const attrs = {}; for (const a of el.attributes) if (!o.attributeFilter?.length || o.attributeFilter.includes(a.name)) attrs[a.name] = a.value.slice(0, 200); if (Object.keys(attrs).length) n.attrs = attrs;
    const own = [...el.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent.trim()).join(' ').trim(); if (own) n.text = own.slice(0, 200);
    if (o.includeStyles) { n.style = {}; for (const k of STY) n.style[k] = cs[k]; }
    if (o.includeA11y) { n.role = el.getAttribute('role') || el.tagName.toLowerCase(); const nm = el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title'); if (nm) n.name = nm; if (el.tabIndex >= 0) n.focusable = true; }
    const kids = [];
    if (d < (o.depth || 8)) { for (const c of el.children) { const k = node(c, d + 1); if (k) kids.push(k); }
      if (o.includeShadowDOM && el.shadowRoot) for (const c of el.shadowRoot.children) { const k = node(c, d + 1); if (k) { k.shadow = true; kids.push(k); } }
      if (o.includeIframes && el.tagName === 'IFRAME') { try { const doc = el.contentDocument; if (doc) kids.push({ iframe: el.src, tree: node(doc.documentElement, d + 1) }); } catch { kids.push({ iframe: el.src, crossOrigin: true }); } } }
    else if (el.children.length) n.childCount = el.children.length;
    if (kids.length) n.children = kids;
    return n;
  };
  return { tree: node(root, 0), nodes: count };
}`;

const STORAGE_JS = `async (o) => {
  const out = {}, want = (t) => !o.types?.length || o.types.includes(t), cut = (v) => o.includeValues === false ? undefined : (typeof v === 'string' && v.length > (o.maxValueLength || 500) ? v.slice(0, o.maxValueLength || 500) + '…' : v);
  const ok = (k) => !o.filter || k.toLowerCase().includes(o.filter.toLowerCase());
  for (const [t, s] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) if (want(t)) { out[t] = {}; for (let i = 0; i < s.length; i++) { const k = s.key(i); if (ok(k)) out[t][k] = cut(s.getItem(k)); } }
  if (want('indexedDB') && indexedDB.databases) out.indexedDB = (await indexedDB.databases()).map(d => ({ name: d.name, version: d.version }));
  if (want('cacheStorage') && self.caches) { out.cacheStorage = {}; for (const n of await caches.keys()) { const c = await caches.open(n); out.cacheStorage[n] = (await c.keys()).slice(0, 100).map(r => r.url); } }
  if (want('serviceWorkers') && navigator.serviceWorker) out.serviceWorkers = (await navigator.serviceWorker.getRegistrations()).map(r => ({ scope: r.scope, active: r.active?.scriptURL }));
  return out;
}`;

const STATE_JS = `(o) => {
  const out = { frameworks: [] , components: [] };
  const w = window, want = (f) => !o.frameworks?.length || o.frameworks.includes(f);
  const anyEl = document.querySelector(o.selector || 'body *');
  const fiberKey = (el) => Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  const reactRoot = [...document.querySelectorAll(o.selector || 'body, body *')].find(el => fiberKey(el));
  if (reactRoot || w.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size) { out.frameworks.push({ name: 'react', version: w.React?.version || [...(w.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.values?.() || [])][0]?.version });
    if (want('react') && reactRoot) { let f = reactRoot[fiberKey(reactRoot)]; while (f?.return) f = f.return; const seen = new Set(); const walk = (n, d) => { if (!n || out.components.length >= (o.maxComponents || 100) || d > 200) return; if (typeof n.type === 'function' || typeof n.type === 'object' && n.type) { const name = n.type.displayName || n.type.name || n.type.render?.name; if (name && !seen.has(n)) { seen.add(n); const c = { framework: 'react', name, props: {} }; for (const [k, v] of Object.entries(n.memoizedProps || {})) { if (k === 'children') continue; c.props[k] = typeof v === 'function' ? 'ƒ' : (v && typeof v === 'object') ? (Array.isArray(v) ? '[' + v.length + ']' : '{…}') : v; } if (o.includeHooks && n.memoizedState && typeof n.type === 'function') { const hooks = []; let h = n.memoizedState; while (h && hooks.length < 20) { const v = h.memoizedState; hooks.push(v && typeof v === 'object' ? (Array.isArray(v) ? '[' + v.length + ']' : '{…}') : v); h = h.next; } c.hooks = hooks; } out.components.push(c); } } walk(n.child, d + 1); walk(n.sibling, d); }; walk(f, 0); } }
  const vueEl = [...document.querySelectorAll('*')].find(e => e.__vue_app__ || e.__vue__);
  if (vueEl) { const app = vueEl.__vue_app__; out.frameworks.push({ name: 'vue', version: app?.version || vueEl.__vue__?.$root?.constructor?.version });
    if (want('vue') && app?._instance) { const walk = (i, d) => { if (!i || out.components.length >= (o.maxComponents || 100) || d > 50) return; out.components.push({ framework: 'vue', name: i.type?.name || i.type?.__name || 'Anonymous', props: JSON.parse(JSON.stringify(i.props || {}, (k, v) => typeof v === 'function' ? 'ƒ' : v)) }); const sub = i.subTree; const kids = []; const collect = (vn) => { if (!vn) return; if (vn.component) kids.push(vn.component); if (Array.isArray(vn.children)) vn.children.forEach(collect); }; collect(sub); kids.forEach(k => walk(k, d + 1)); }; walk(app._instance, 0); } }
  if (w.ng || document.querySelector('[ng-version]')) out.frameworks.push({ name: 'angular', version: document.querySelector('[ng-version]')?.getAttribute('ng-version') });
  if ([...document.querySelectorAll('*')].some(e => Object.keys(e).some(k => k.startsWith('__svelte')))) out.frameworks.push({ name: 'svelte' });
  if (w.__NEXT_DATA__) out.frameworks.push({ name: 'next.js', buildId: w.__NEXT_DATA__.buildId, page: w.__NEXT_DATA__.page });
  if (w.__NUXT__) out.frameworks.push({ name: 'nuxt' });
  if (w.jQuery) out.frameworks.push({ name: 'jquery', version: w.jQuery.fn?.jquery });
  if (o.includeStore) { out.stores = {}; if (w.__NEXT_DATA__?.props) out.stores.nextProps = JSON.parse(JSON.stringify(w.__NEXT_DATA__.props).slice(0, 20000)); if (w.__NUXT__) out.stores.nuxt = JSON.parse(JSON.stringify(w.__NUXT__).slice(0, 20000).replace(/,?[^,]*$/, '') + '}') ; if (w.__APOLLO_STATE__) out.stores.apollo = Object.keys(w.__APOLLO_STATE__).slice(0, 100); if (w.__INITIAL_STATE__) out.stores.initialState = w.__INITIAL_STATE__; if (w.__REDUX_STATE__) out.stores.redux = w.__REDUX_STATE__; if (w.store?.getState) try { out.stores.redux = w.store.getState(); } catch {} }
  return out;
}`;

const DOMEVENTS_JS = `(o) => {
  if (o.action === 'stop') { (window.__stitapEvOff || []).forEach(f => f()); window.__stitapEvOff = []; window.__stitapMo?.disconnect(); return { stopped: true, events: window.__stitapEv || [] }; }
  if (o.action === 'snapshot') return { events: (window.__stitapEv || []).slice(-(o.maxEntries || 200)) };
  window.__stitapEv = []; (window.__stitapEvOff || []).forEach(f => f()); window.__stitapEvOff = [];
  const d = (el) => el && el.tagName ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : String(el);
  for (const t of (o.eventTypes?.length ? o.eventTypes : ['click','input','change','submit','keydown','focus','blur','scroll'])) { const h = (e) => { window.__stitapEv.push({ type: e.type, target: d(e.target), key: e.key, value: e.target?.value?.slice?.(0, 100), at: Date.now() }); if (window.__stitapEv.length > 2000) window.__stitapEv.shift(); }; document.addEventListener(t, h, true); window.__stitapEvOff.push(() => document.removeEventListener(t, h, true)); }
  if (o.includeMutationObserver) { window.__stitapMo = new MutationObserver(ms => { for (const m of ms.slice(0, 20)) window.__stitapEv.push({ type: 'mutation:' + m.type, target: d(m.target), added: m.addedNodes.length, removed: m.removedNodes.length, attr: m.attributeName, at: Date.now() }); }); window.__stitapMo.observe(document.body, { childList: true, subtree: true, attributes: true }); }
  return { listening: true };
}`;

// ─── executors ───────────────────────────────────────────────────────────────

const filterNet = (list_: NetEntry[], f: any) => list_.filter((e) => (!f?.urlPattern || new RegExp(String(f.urlPattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"), "i").test(e.url)) && (!f?.resourceType || [].concat(f.resourceType).includes(e.type as never)) && (!f?.method || String(f.method).toUpperCase() === e.method) && (!f?.status || (f.status === "error" ? (e.status ?? 0) >= 400 || !!e.failure : String(e.status) === String(f.status))));

export const BROWSER_CORE_EXECUTORS: ExecMap = execs({
  "browser.navigate": async (i) => {
    const s = await session(i);
    const t0 = Date.now();
    const res = await goto(s, str(i.url), num(i.timeout, 30000));
    if (i.waitForSelector) await s.page.waitForSelector(sel(i.waitForSelector), { timeout: num(i.timeout, 30000) });
    const snap = await snapshot(s.page);
    return { sessionId: sid(i), url: s.page.url(), status: res?.status(), title: snap.title, loadMs: Date.now() - t0, interactive: snap.interactive, text: snap.text.slice(0, 2000) };
  },
  "browser.click": async (i) => {
    const { page } = await pageFor(i);
    const loc = page.locator(sel(i.selector)).first(), type = str(i.clickType, "single");
    const opts = { timeout: num(i.timeout, 10000), ...(i.offsetX !== undefined || i.offsetY !== undefined ? { position: { x: num(i.offsetX, 0), y: num(i.offsetY, 0) } } : {}) };
    const before = page.url();
    if (type === "double") await loc.dblclick(opts); else await loc.click({ ...opts, button: type === "right" ? "right" : "left" });
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    return { clicked: str(i.selector), navigated: page.url() !== before, url: page.url(), title: await page.title() };
  },
  "browser.type": async (i) => {
    const { page } = await pageFor(i);
    const loc = page.locator(sel(i.selector)).first();
    if (bool(i.clear, true)) await loc.fill("");
    if (num(i.delay, 0) > 0) await loc.pressSequentially(str(i.text), { delay: num(i.delay) }); else await loc.fill(str(i.text));
    if (bool(i.pressEnter)) { await loc.press("Enter"); await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined); }
    return { typed: str(i.text).length, value: await loc.inputValue().catch(() => undefined), url: page.url() };
  },
  "browser.scroll": async (i) => {
    const { page } = await pageFor(i);
    const mode = str(i.mode, "delta"), behavior = str(i.behavior, "instant");
    if (mode === "toElement") await page.locator(sel(i.selector)).first().scrollIntoViewIfNeeded();
    else await page.evaluate(([m, dy, y, b]: any[]) => { if (m === "toBottom") window.scrollTo({ top: document.body.scrollHeight, behavior: b }); else if (m === "toPosition") window.scrollTo({ top: y, behavior: b }); else window.scrollBy({ top: dy, behavior: b }); }, [mode, num(i.deltaY, 600), num(i.y, 0), behavior]);
    await page.waitForTimeout(behavior === "smooth" ? 600 : 100);
    return page.evaluate(() => ({ scrollY: Math.round(window.scrollY), scrollHeight: document.body.scrollHeight, viewportHeight: innerHeight, atBottom: innerHeight + scrollY >= document.body.scrollHeight - 2 }));
  },
  "browser.screenshot": async (i) => {
    const { page } = await pageFor(i);
    const mode = str(i.mode, "viewport"), fmt = str(i.format, "png") === "jpeg" ? "jpeg" : "png";
    const o: any = { type: fmt, ...(fmt === "jpeg" ? { quality: num(i.quality, 80) } : {}) };
    let buf: Uint8Array;
    if (mode === "element") buf = await page.locator(sel(i.selector)).first().screenshot(o);
    else if (mode === "region") { const r = json<any>(i.region); buf = await page.screenshot({ ...o, clip: { x: num(r.x), y: num(r.y), width: num(r.width), height: num(r.height) } }); }
    else buf = await page.screenshot({ ...o, fullPage: mode === "fullPage" });
    if (str(i.format) === "webp") { const p = await page.evaluate(async (b64: string) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d")!.drawImage(img, 0, 0); return c.toDataURL("image/webp", 0.85).split(",")[1]; }, (globalThis as any).Buffer.from(buf).toString("base64")); buf = (globalThis as any).Buffer.from(p, "base64"); }
    return { ...saveShot(buf, str(i.format, "png") === "jpeg" ? "jpg" : str(i.format, "png"), bool(i.includeBase64)), url: page.url(), mode };
  },
  "browser.extract": async (i) => { const { page } = await pageFor(i); return { mode: str(i.mode, "text"), url: page.url(), data: await page.evaluate(`(${EXTRACT_JS})(${JSON.stringify({ mode: str(i.mode, "text"), selector: i.selector ? str(i.selector) : undefined, attributes: list(i.attributes), includeHidden: bool(i.includeHidden), maxDepth: num(i.maxDepth, 6) })})`) }; },
  "browser.wait": async (i) => {
    const { page } = await pageFor(i);
    const c = str(i.condition, "element"), timeout = num(i.timeout, 15000), t0 = Date.now();
    if (c === "element") await page.waitForSelector(sel(i.selector), { timeout, state: str(i.state, "visible") });
    else if (c === "text") await page.getByText(str(i.text)).first().waitFor({ timeout });
    else if (c === "networkIdle") await page.waitForLoadState("networkidle", { timeout });
    else if (c === "custom") await page.waitForFunction(str(i.expression), undefined, { timeout });
    else await page.waitForTimeout(timeout);
    return { condition: c, satisfied: true, waitedMs: Date.now() - t0 };
  },
  "browser.drag": async (i) => {
    const { page } = await pageFor(i);
    if (i.targetSelector && str(i.method, "mouse") === "native") await page.dragAndDrop(sel(i.sourceSelector), sel(i.targetSelector));
    else {
      const a = await page.locator(sel(i.sourceSelector)).first().boundingBox();
      if (!a) throw new Error("source element not visible");
      const b = i.targetSelector ? await page.locator(sel(i.targetSelector)).first().boundingBox() : { x: num(i.targetX) , y: num(i.targetY), width: 0, height: 0 };
      if (!b) throw new Error("target element not visible");
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
    }
    return { dragged: str(i.sourceSelector), to: i.targetSelector ? str(i.targetSelector) : { x: num(i.targetX), y: num(i.targetY) } };
  },
  "browser.hover": async (i) => {
    const { page } = await pageFor(i);
    const loc = page.locator(sel(i.selector)).first();
    if (num(i.delay, 0)) await page.waitForTimeout(num(i.delay));
    await loc.hover();
    if (num(i.holdDuration, 0)) await page.waitForTimeout(num(i.holdDuration));
    const tip = await page.evaluate((s: string) => { const el = document.querySelector(s); return { title: el?.getAttribute("title"), ariaDescribedBy: el?.getAttribute("aria-describedby") ? document.getElementById(el.getAttribute("aria-describedby")!)?.textContent : undefined, cursor: el ? getComputedStyle(el).cursor : undefined }; }, sel(i.selector)).catch(() => ({}));
    return { hovered: str(i.selector), ...tip };
  },
  "browser.inspect": async (i) => {
    const { page } = await pageFor(i);
    const r: any = await page.evaluate(`(${INSPECT_JS})(${JSON.stringify({ selector: i.selector ? str(i.selector) : undefined, depth: num(i.depth, 6), includeHidden: bool(i.includeHidden), includeShadowDOM: bool(i.includeShadowDOM), includeIframes: bool(i.includeIframes), includeStyles: bool(i.includeStyles), includeA11y: bool(i.includeA11y), maxNodes: num(i.maxNodes, 400), attributeFilter: list(i.attributeFilter) })})`);
    if (bool(i.includeA11y)) { try { r.ariaSnapshot = await page.locator(i.selector ? sel(i.selector) : "body").first().ariaSnapshot(); } catch { /* older Playwright */ } }
    return r;
  },
  "browser.network": async (i) => {
    const s = await session(i), action = str(i.action, "snapshot");
    if (action === "start") { s.network = []; s.recording.network = true; s.recording.bodies = bool(i.includeBodies); return { recording: true, includeBodies: s.recording.bodies }; }
    if (action === "stop") s.recording.network = false;
    const f = json<any>(i.filter, {});
    const entries = filterNet(s.network, f).slice(-num(i.maxEntries, 200)).map((e) => ({ ...e, reqHeaders: bool(i.includeCookies) ? e.reqHeaders : Object.fromEntries(Object.entries(e.reqHeaders ?? {}).filter(([k]) => k !== "cookie")), body: bool(i.includeBodies) ? e.body : undefined, postData: bool(i.includeBodies) ? e.postData : undefined }));
    const byType: Record<string, number> = {}; for (const e of s.network) byType[e.type] = (byType[e.type] ?? 0) + 1;
    return { recording: s.recording.network, total: s.network.length, failed: s.network.filter((e) => e.failure || (e.status ?? 0) >= 400).length, transferBytes: s.network.reduce((a, e) => a + (e.size ?? 0), 0), byType, entries };
  },
  "browser.storage": async (i) => {
    const { s, page } = await pageFor(i);
    const r: any = await page.evaluate(`(${STORAGE_JS})(${JSON.stringify({ types: list(i.types), filter: i.filter ? str(i.filter) : "", includeValues: i.includeValues === undefined ? true : bool(i.includeValues), maxValueLength: num(i.maxValueLength, 500) })})`);
    if (!list(i.types).length || list(i.types).includes("cookies")) r.cookies = (await s.ctx.cookies(i.origin ? [str(i.origin)] : [page.url()])).filter((c: any) => !i.filter || c.name.toLowerCase().includes(str(i.filter).toLowerCase())).map((c: any) => ({ ...c, value: i.includeValues === false ? undefined : String(c.value).slice(0, num(i.maxValueLength, 500)) }));
    return { origin: new URL(page.url()).origin, ...r };
  },
  "browser.state": async (i) => { const { page } = await pageFor(i); return page.evaluate(`(${STATE_JS})(${JSON.stringify({ frameworks: list(i.frameworks), selector: i.selector ? str(i.selector) : undefined, maxComponents: num(i.maxComponents, 100), includeHooks: bool(i.includeHooks), includeStore: bool(i.includeStore) })})`); },
  "browser.extensions": async (i) => {
    const s = await session(i);
    const workers = s.ctx.serviceWorkers?.() ?? [], pages = s.ctx.backgroundPages?.() ?? [];
    const ids = [...new Set([...workers, ...pages].map((w: any) => /chrome-extension:\/\/([a-p]{32})/.exec(w.url())?.[1]).filter(Boolean))];
    const fs = nodeModule("node:fs"), path = nodeModule("node:path");
    const manifests = (s.extensions ?? []).map((d) => { try { const m = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8")); return { path: d, name: m.name, version: m.version, manifestVersion: m.manifest_version, ...(bool(i.includePermissions, true) ? { permissions: m.permissions, hostPermissions: m.host_permissions } : {}), ...(bool(i.includeContentScripts, true) ? { contentScripts: m.content_scripts?.map((c: any) => ({ matches: c.matches, js: c.js })) } : {}) }; } catch (e: any) { return { path: d, error: e.message }; } });
    return { sessionId: sid(i), loaded: ids, extensions: manifests, note: s.persistent ? undefined : "no extensions in this session — open a session with extensionPath (unpacked extension folder) to load one, e.g. browser.extensions sessionId=ext extensionPath=/path/to/ext" };
  },
  "browser.source": async (i) => {
    const { s, page } = await pageFor(i);
    const types = list(i.types).length ? list(i.types) : ["scripts", "styles", "html"], max = num(i.maxContentLength, 20000);
    const r: any = await page.evaluate(([inl, ext, mx]: any[]) => ({
      scripts: [...document.scripts].map((sc) => (sc.src ? (ext ? { src: sc.src, type: sc.type || "classic", async: sc.async, defer: sc.defer } : null) : inl ? { inline: true, type: sc.type || "classic", content: sc.textContent!.slice(0, mx) } : null)).filter(Boolean),
      styles: [...document.querySelectorAll("link[rel=stylesheet], style")].map((st: any) => (st.href ? (ext ? { href: st.href, media: st.media || undefined } : null) : inl ? { inline: true, content: st.textContent.slice(0, mx) } : null)).filter(Boolean),
      htmlLength: document.documentElement.outerHTML.length,
    }), [i.includeInline === undefined ? true : bool(i.includeInline), i.includeExternal === undefined ? true : bool(i.includeExternal), max]);
    if (types.includes("html")) r.html = (await page.content()).slice(0, max);
    if (!types.includes("scripts")) delete r.scripts;
    if (!types.includes("styles")) delete r.styles;
    if (bool(i.fetchExternal)) for (const it of [...(r.scripts ?? []), ...(r.styles ?? [])].filter((x: any) => x.src || x.href).slice(0, 20)) { try { const res = await s.ctx.request.get(it.src ?? it.href, { timeout: 15000 }); it.status = res.status(); it.content = (await res.text()).slice(0, max); } catch (e: any) { it.error = e.message; } }
    return r;
  },
  "browser.websocket": async (i) => {
    const s = await session(i), action = str(i.action, "snapshot");
    if (action === "start") { s.ws = []; s.recording.ws = true; return { recording: true, note: "frames are captured for sockets opened after this point (reload to capture existing ones)" }; }
    if (action === "stop") s.recording.ws = false;
    const conns: Record<string, { sent: number; received: number; open: boolean }> = {};
    for (const f of s.ws) { const c = (conns[f.url] ??= { sent: 0, received: 0, open: false }); if (f.dir === "open") c.open = true; else if (f.dir === "close") c.open = false; else c[f.dir as "sent" | "received"]++; }
    return { recording: s.recording.ws, connections: conns, frames: s.ws.slice(-num(i.maxFrames, 200)) };
  },
  "browser.console": async (i) => {
    const s = await session(i), action = str(i.action, "snapshot");
    if (action === "start") { s.console = []; s.recording.console = true; return { recording: true }; }
    if (action === "stop") s.recording.console = false;
    const lv = list(i.levels);
    const entries = s.console.filter((c) => !lv.length || lv.includes(c.level) || (lv.includes("warn") && c.level === "warning")).slice(-num(i.maxEntries, 200)).map((c) => (bool(i.includeStackTrace) ? c : { level: c.level, text: c.text, location: c.location ? `${c.location.url}:${c.location.lineNumber}` : undefined, at: c.at }));
    const counts: Record<string, number> = {}; for (const c of s.console) counts[c.level] = (counts[c.level] ?? 0) + 1;
    return { recording: s.recording.console, counts, entries };
  },
  "browser.domevents": async (i) => { const { page } = await pageFor(i); return page.evaluate(`(${DOMEVENTS_JS})(${JSON.stringify({ action: str(i.action, "start"), eventTypes: list(i.eventTypes), maxEntries: num(i.maxEntries, 200), includeMutationObserver: bool(i.includeMutationObserver) })})`); },
  "browser.cookies": async (i) => {
    const s = await session(i);
    const urls = list(i.urls).length ? list(i.urls) : s.page.url() !== "about:blank" ? [s.page.url()] : [];
    const cs = (await s.ctx.cookies(urls.length ? urls : undefined)).filter((c: any) => !i.filter || `${c.name} ${c.domain}`.toLowerCase().includes(str(i.filter).toLowerCase()));
    const view = cs.map((c: any) => ({ name: c.name, domain: c.domain, path: c.path, expires: c.expires > 0 ? new Date(c.expires * 1000).toISOString() : "session", httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, size: c.name.length + String(c.value).length, issues: [!c.secure && "not Secure", !c.httpOnly && /sess|token|auth|jwt|sid/i.test(c.name) && "auth-like cookie readable by JS (no HttpOnly)", c.sameSite === "None" && !c.secure && "SameSite=None without Secure"].filter(Boolean) }));
    if (!bool(i.groupedByDomain)) return { count: view.length, cookies: view };
    const g: Record<string, any[]> = {}; for (const c of view) (g[c.domain] ??= []).push(c);
    return { count: view.length, domains: g };
  },
});

void r2;
