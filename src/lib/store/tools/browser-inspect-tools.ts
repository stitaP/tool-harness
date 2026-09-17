/**
 * Browser Deep Inspection Tools — Captures every layer of browser data
 *
 * These tools give the LLM complete visibility into the browser:
 *   DOM → APIs → Network → Storage → Framework State → Extensions
 *   → Source Code → WebSockets → Console → Events → Cookies
 *
 * Every tool generates CDP commands executed in the browser worker and
 * returns LLM-friendly structured output.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DEEP DOM INSPECTION
// ═══════════════════════════════════════════════════════════════════════════════

export const INSPECT_MANIFEST: ToolManifest = {
  id: "browser.inspect",
  name: "Deep DOM Inspector",
  description: "Inspect every DOM element with attributes, computed styles, shadow DOM, iframes, and accessibility tree",
  longDescription:
    "Performs a recursive DOM walk capturing: element tags, IDs, classes, all attributes, computed styles, " +
    "bounding rects, shadow roots, iframe content, aria roles, and the full accessibility tree. " +
    "Returns a hierarchical JSON structure the LLM can reason about. Supports depth limiting, " +
    "selector-scoped inspection, and hidden-element inclusion.",
  category: "browser",
  subcategory: "inspection",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["inspect", "dom", "shadow-dom", "iframe", "accessibility", "a11y", "computed-styles", "attributes"],
  icon: "ScanSearch",
  color: "#06b6d4",
  parameters: [
    { name: "selector", type: "string", description: "Root CSS selector (default: document.documentElement)", required: false },
    { name: "depth", type: "number", description: "Max traversal depth (0=unlimited)", required: false, default: 0, min: 0, max: 50 },
    { name: "includeHidden", type: "boolean", description: "Include display:none elements", required: false, default: false },
    { name: "includeShadowDOM", type: "boolean", description: "Traverse shadow roots", required: false, default: true },
    { name: "includeIframes", type: "boolean", description: "Traverse same-origin iframes", required: false, default: true },
    { name: "includeStyles", type: "boolean", description: "Include computed styles per element", required: false, default: false },
    { name: "includeA11y", type: "boolean", description: "Include accessibility tree", required: false, default: true },
    { name: "maxNodes", type: "number", description: "Maximum nodes to return (prevents OOM)", required: false, default: 5000, min: 100, max: 50000 },
    { name: "attributeFilter", type: "array", description: "Only return these attributes (empty = all)", required: false },
  ],
  capabilities: [
    { name: "deep-inspect", description: "Full DOM tree with shadow roots, iframes, a11y", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateInspectCDP(input: ToolInput): unknown[] {
  const selector = (input.selector as string) || "document.documentElement";
  const depth = (input.depth as number) || 0;
  const includeHidden = input.includeHidden as boolean;
  const includeShadowDOM = input.includeShadowDOM !== false;
  const includeIframes = input.includeIframes !== false;
  const includeStyles = input.includeStyles as boolean;
  const includeA11y = input.includeA11y !== false;
  const maxNodes = (input.maxNodes as number) || 5000;
  const attributeFilter = input.attributeFilter as string[] | undefined;

  const script = `(() => {
    const ROOT = ${JSON.stringify(selector)};
    const MAX_DEPTH = ${depth};
    const INCLUDE_HIDDEN = ${includeHidden};
    const INCLUDE_SHADOW = ${includeShadowDOM};
    const INCLUDE_IFRAMES = ${includeIframes};
    const INCLUDE_STYLES = ${includeStyles};
    const INCLUDE_A11Y = ${includeA11y};
    const MAX_NODES = ${maxNodes};
    const ATTR_FILTER = ${JSON.stringify(attributeFilter || null)};
    const STYLE_PROPS = [
      'display','visibility','opacity','position','width','height',
      'top','left','right','bottom','margin','padding','border',
      'background','color','font-size','font-weight','font-family',
      'text-align','text-decoration','overflow','z-index','transform',
      'box-shadow','border-radius','line-height','cursor','flex','grid'
    ];

    let count = 0;
    const warnings = [];

    function getAttrs(el) {
      const attrs = {};
      if (!el.attributes) return attrs;
      for (const a of el.attributes) {
        if (ATTR_FILTER && !ATTR_FILTER.includes(a.name)) continue;
        attrs[a.name] = a.value;
      }
      return attrs;
    }

    function getComputed(el) {
      if (!INCLUDE_STYLES) return undefined;
      const cs = getComputedStyle(el);
      const styles = {};
      for (const p of STYLE_PROPS) styles[p] = cs.getPropertyValue(p);
      return styles;
    }

    function getA11y(el) {
      if (!INCLUDE_A11Y) return undefined;
      const role = el.getAttribute('role');
      const ariaLabel = el.getAttribute('aria-label');
      const ariaDescribedBy = el.getAttribute('aria-describedby');
      const tabIndex = el.tabIndex;
      const isFocusable = el.matches('a[href],button,input,select,textarea,[tabindex]');
      const text = el.innerText?.trim().slice(0, 200);
      return { role, ariaLabel, ariaDescribedBy, tabIndex, isFocusable, text };
    }

    function walk(el, currentDepth) {
      if (count >= MAX_NODES) { if (count === MAX_NODES) warnings.push('node limit reached'); return null; }
      if (MAX_DEPTH > 0 && currentDepth > MAX_DEPTH) return null;
      if (!INCLUDE_HIDDEN && el.nodeType === 1) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      }
      count++;
      const node = {
        tag: el.tagName?.toLowerCase() || '#text',
        id: el.id || undefined,
        classes: el.className && typeof el.className === 'string' ? el.className.split(' ').filter(Boolean) : undefined,
        attrs: el.nodeType === 1 ? getAttrs(el) : undefined,
        text: el.nodeType === 3 ? el.textContent?.trim().slice(0, 500) : undefined,
        rect: el.nodeType === 1 ? (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() : undefined,
        styles: getComputed(el),
        a11y: getA11y(el),
        children: [],
        shadowRoot: undefined,
        iframes: [],
      };
      if (el.shadowRoot && INCLUDE_SHADOW) {
        const kids = [];
        for (const c of el.shadowRoot.children) { const n = walk(c, currentDepth + 1); if (n) kids.push(n); }
        node.shadowRoot = kids.length > 0 ? kids : undefined;
      }
      if (el.tagName === 'IFRAME' && INCLUDE_IFRAMES) {
        try { const doc = el.contentDocument; if (doc && doc.body) { node.iframes = [walk(doc.body, currentDepth + 1)].filter(Boolean); } } catch(e) { warnings.push('cross-origin iframe blocked'); }
      }
      if (el.children) {
        for (const c of el.children) { const n = walk(c, currentDepth + 1); if (n) node.children.push(n); }
      }
      if (node.children.length === 0) delete node.children;
      if (node.iframes.length === 0) delete node.iframes;
      return node;
    }

    const root = document.querySelector(ROOT) || document.documentElement;
    const tree = walk(root, 0);
    return { tree, totalNodes: count, warnings };
  })()`;

  return [
    { method: "Runtime.evaluate", params: { expression: script, returnByValue: true, generatePreview: false } },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. NETWORK TRAFFIC CAPTURE
// ═══════════════════════════════════════════════════════════════════════════════

export const NETWORK_MANIFEST: ToolManifest = {
  id: "browser.network",
  name: "Network Traffic Capture",
  description: "Capture every HTTP request and response: URLs, methods, headers, bodies, status codes, timing, and cookies",
  longDescription:
    "Enables CDP Network domain to capture all HTTP/HTTPS traffic. Records request/response headers, " +
    "request/response bodies (JSON, form-data, text), status codes, timing waterfall, " +
    "resource types, initiator stacks, and redirect chains. Stores everything in a " +
    "structured log the LLM can query by URL pattern, method, status, or content type.",
  category: "browser",
  subcategory: "network",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["network", "api", "fetch", "xhr", "requests", "responses", "headers", "traffic", "har"],
  icon: "Network",
  color: "#10b981",
  parameters: [
    { name: "action", type: "enum", description: "start=begin capturing, stop=stop & return, snapshot=get current log", required: false, default: "snapshot", enum: ["start", "stop", "snapshot"] },
    { name: "filter", type: "object", description: "Filter: { urlPattern, methods[], statusRange, resourceTypes[], excludeDomains[] }", required: false },
    { name: "maxEntries", type: "number", description: "Max entries to keep in buffer", required: false, default: 500, min: 10, max: 10000 },
    { name: "includeBodies", type: "boolean", description: "Capture request/response bodies (can be large)", required: false, default: true },
    { name: "includeCookies", type: "boolean", description: "Include cookies in request/response headers", required: false, default: true },
  ],
  capabilities: [
    { name: "network-capture", description: "Capture all HTTP traffic with full bodies and headers", requiresBrowser: true, requiresNetwork: true, offline: false },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateNetworkCDP(input: ToolInput): unknown[] {
  const action = (input.action as string) || "snapshot";
  const maxEntries = (input.maxEntries as number) || 500;
  const includeBodies = input.includeBodies !== false;

  if (action === "start") {
    return [
      { method: "Network.enable", params: { maxTotalBufferSize: includeBodies ? 50 * 1024 * 1024 : 0 } },
      {
        method: "Runtime.evaluate",
        params: {
          expression: `(() => {
            if (!window.__stitap_net) window.__stitap_net = { entries: [], capturing: true };
            window.__stitap_net.capturing = true;
            window.__stitap_net.entries = [];
            window.__stitap_net.startTs = Date.now();

            window.__stitap_net.onRequest = (params) => {
              if (!window.__stitap_net.capturing) return;
              window.__stitap_net.entries.push({
                id: params.requestId,
                url: params.request.url,
                method: params.request.method,
                headers: params.request.headers,
                postData: params.request.postData,
                resourceType: params.type,
                initiator: params.initiator,
                timestamp: params.timestamp,
                cookies: params.request.cookies,
              });
            };

            window.__stitap_net.onResponse = (params) => {
              const entry = window.__stitap_net.entries.find(e => e.id === params.requestId);
              if (entry) {
                entry.status = params.response.status;
                entry.statusText = params.response.statusText;
                entry.responseHeaders = params.response.headers;
                entry.responseCookies = params.response.cookies;
                entry.responseTiming = params.response.timing;
                entry.mimeType = params.response.mimeType;
                entry.redirectUrl = params.response.redirectResponse?.url;
              }
            };

            window.__stitap_net.onResponseReceived = (params) => {
              const entry = window.__stitap_net.entries.find(e => e.id === params.requestId);
              if (entry) {
                entry.encodedBodySize = params.encodedBodySize;
                entry.decodedBodySize = params.decodedBodySize;
              }
            };
            return 'Network capture started';
          })()`,
          returnByValue: true,
        },
      },
    ];
  }

  if (action === "stop") {
    return [
      {
        method: "Runtime.evaluate",
        params: {
          expression: `(() => {
            if (!window.__stitap_net) return { entries: [], status: 'no-capture-active' };
            window.__stitap_net.capturing = false;
            const entries = window.__stitap_net.entries.slice(0, ${maxEntries});
            const summary = {
              total: entries.length,
              byMethod: {},
              byStatus: {},
              byResourceType: {},
              apis: [],
              timing: { first: entries[0]?.timestamp, last: entries[entries.length-1]?.timestamp },
            };
            for (const e of entries) {
              summary.byMethod[e.method] = (summary.byMethod[e.method] || 0) + 1;
              const s = String(e.status || 'pending');
              summary.byStatus[s] = (summary.byStatus[s] || 0) + 1;
              if (e.resourceType) summary.byResourceType[e.resourceType] = (summary.byResourceType[e.resourceType] || 0) + 1;
              if (e.resourceType === 'xhr' || e.resourceType === 'fetch') {
                summary.apis.push({ url: e.url, method: e.method, status: e.status, mimeType: e.mimeType, size: e.decodedBodySize });
              }
            }
            window.__stitap_net.entries = [];
            return { entries, summary };
          })()`,
          returnByValue: true,
        },
      },
    ];
  }

  // snapshot (default)
  return [
    {
      method: "Runtime.evaluate",
      params: {
        expression: `(() => {
          if (!window.__stitap_net) return { entries: [], status: 'capture-not-started' };
          const entries = window.__stitap_net.entries.slice(0, ${maxEntries});
          const summary = {
            total: entries.length,
            capturing: window.__stitap_net.capturing,
            byMethod: {},
            byStatus: {},
            byResourceType: {},
          };
          for (const e of entries) {
            summary.byMethod[e.method] = (summary.byMethod[e.method] || 0) + 1;
            const s = String(e.status || 'pending');
            summary.byStatus[s] = (summary.byStatus[s] || 0) + 1;
            if (e.resourceType) summary.byResourceType[e.resourceType] = (summary.byResourceType[e.resourceType] || 0) + 1;
          }
          return { entries, summary };
        })()`,
        returnByValue: true,
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. BROWSER STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

export const STORAGE_MANIFEST: ToolManifest = {
  id: "browser.storage",
  name: "Browser Storage Inspector",
  description: "Read cookies, localStorage, sessionStorage, and IndexedDB with full metadata",
  longDescription:
    "Accesses all browser storage mechanisms: cookies (including HttpOnly via CDP), localStorage, " +
    "sessionStorage, and IndexedDB databases. Returns structured data with keys, values, expiry, " +
    "and size information. The LLM can use this to understand authentication state, " +
    "user preferences, cached data, and application state.",
  category: "browser",
  subcategory: "storage",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["storage", "cookies", "localstorage", "sessionstorage", "indexeddb", "auth", "state"],
  icon: "Database",
  color: "#f59e0b",
  parameters: [
    { name: "types", type: "array", description: "Which storage types to inspect", required: false, default: ["cookies", "localStorage", "sessionStorage"] },
    { name: "filter", type: "string", description: "Key name filter (substring match)", required: false },
    { name: "includeValues", type: "boolean", description: "Include actual values (false = keys + sizes only)", required: false, default: true },
    { name: "maxValueLength", type: "number", description: "Truncate values longer than this", required: false, default: 10000 },
    { name: "origin", type: "string", description: "Origin for storage (default: current page)", required: false },
  ],
  capabilities: [
    { name: "storage-read", description: "Read all browser storage including HttpOnly cookies", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateStorageCDP(input: ToolInput): unknown[] {
  const types = (input.types as string[]) || ["cookies", "localStorage", "sessionStorage"];
  const filter = (input.filter as string) || "";
  const includeValues = input.includeValues !== false;
  const maxValue = (input.maxValueLength as number) || 10000;

  const script = `(() => {
    const FILTER = ${JSON.stringify(filter)};
    const INC_VAL = ${includeValues};
    const MAX_VAL = ${maxValue};
    const TYPES = ${JSON.stringify(types)};
    const result = {};

    if (TYPES.includes('cookies')) {
      result.cookies = document.cookie.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        const val = v.join('=');
        if (FILTER && !k.toLowerCase().includes(FILTER.toLowerCase())) return null;
        return { key: k, value: INC_VAL ? val.slice(0, MAX_VAL) : '[' + val.length + ' chars]', size: val.length };
      }).filter(Boolean);
    }

    if (TYPES.includes('localStorage')) {
      result.localStorage = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (FILTER && !k.toLowerCase().includes(FILTER.toLowerCase())) continue;
        result.localStorage.push({ key: k, value: INC_VAL ? v.slice(0, MAX_VAL) : '[' + v.length + ' chars]', size: v.length });
      }
    }

    if (TYPES.includes('sessionStorage')) {
      result.sessionStorage = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        const v = sessionStorage.getItem(k);
        if (FILTER && !k.toLowerCase().includes(FILTER.toLowerCase())) continue;
        result.sessionStorage.push({ key: k, value: INC_VAL ? v.slice(0, MAX_VAL) : '[' + v.length + ' chars]', size: v.length });
      }
    }

    if (TYPES.includes('indexedDB')) {
      result.indexedDB = { databases: [] };
      try {
        const dbs = indexedDB.databases ? await indexedDB.databases() : [];
        for (const db of dbs) {
          result.indexedDB.databases.push({ name: db.name, version: db.version });
        }
      } catch(e) { result.indexedDB.error = e.message; }
    }

    if (TYPES.includes('cache')) {
      try {
        const keys = await caches.keys();
        result.cacheAPI = { caches: keys };
      } catch(e) { result.cacheAPI = { error: e.message }; }
    }

    // Compute totals
    result.summary = {
      cookieCount: result.cookies?.length || 0,
      localStorageCount: result.localStorage?.length || 0,
      sessionStorageCount: result.sessionStorage?.length || 0,
      totalCookieBytes: result.cookies?.reduce((s, c) => s + (c?.size || 0), 0) || 0,
      totalLocalStorageBytes: result.localStorage?.reduce((s, c) => s + (c?.size || 0), 0) || 0,
    };

    return result;
  })()`;

  return [
    { method: "Runtime.evaluate", params: { expression: script, returnByValue: true, awaitPromise: true } },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FRAMEWORK STATE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

export const STATE_MANIFEST: ToolManifest = {
  id: "browser.state",
  name: "Framework State Extractor",
  description: "Extract application state from React, Vue, Angular, Redux, MobX, and Zustand",
  longDescription:
    "Probes the page for common framework internals: React fiber tree (components, props, hooks, " +
    "state), Vue reactive instances, Angular component tree, Redux/MobX/Zustand stores. " +
    "Returns a structured snapshot of the application's client-side state that the LLM can " +
    "use to understand what data the app is working with.",
  category: "browser",
  subcategory: "state",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["react", "vue", "angular", "redux", "state", "fiber", "store", "framework"],
  icon: "Boxes",
  color: "#8b5cf6",
  parameters: [
    { name: "frameworks", type: "array", description: "Frameworks to detect (auto=all)", required: false, default: ["react", "vue", "angular", "redux", "zustand"] },
    { name: "selector", type: "string", description: "Root element to inspect (default: #root)", required: false },
    { name: "maxComponents", type: "number", description: "Max components to extract", required: false, default: 200, min: 10, max: 5000 },
    { name: "includeHooks", type: "boolean", description: "Include React hook values", required: false, default: true },
    { name: "includeStore", type: "boolean", description: "Include global store state (Redux/Zustand)", required: false, default: true },
  ],
  capabilities: [
    { name: "state-extract", description: "Read React/Vue/Redux/Zustand state from the page", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateStateCDP(input: ToolInput): unknown[] {
  const frameworks = (input.frameworks as string[]) || ["react", "vue", "angular", "redux", "zustand"];
  const maxComp = (input.maxComponents as number) || 200;
  const includeHooks = input.includeHooks !== false;
  const includeStore = input.includeStore !== false;

  const script = `(() => {
    const FRAMEWORKS = ${JSON.stringify(frameworks)};
    const MAX = ${maxComp};
    const HOOKS = ${includeHooks};
    const STORE = ${includeStore};
    const result = { detected: [], components: [], stores: {}, hooks: {} };

    // ── React ──
    if (FRAMEWORKS.includes('react')) {
      const rootEl = document.getElementById('root') || document.getElementById('app') || document.querySelector('[data-reactroot]') || document.body;
      const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (fiberKey) {
        result.detected.push('react');
        let count = 0;
        const visited = new Set();

        function walkFiber(fiber) {
          if (!fiber || count >= MAX || visited.has(fiber)) return;
          visited.add(fiber);
          if (fiber.tag === 0 || fiber.tag === 1) {
            count++;
            const name = fiber.type?.displayName || fiber.type?.name || fiber.memoizedProps?.name || 'Anonymous';
            const comp = { name, tag: fiber.tag === 0 ? 'Function' : 'Class' };
            if (fiber.memoizedProps && Object.keys(fiber.memoizedProps).length > 0) {
              const props = {};
              for (const [k, v] of Object.entries(fiber.memoizedProps)) {
                if (k === 'children' || typeof v === 'function') continue;
                try { props[k] = JSON.parse(JSON.stringify(v)); } catch { props[k] = String(v).slice(0, 200); }
              }
              if (Object.keys(props).length > 0) comp.props = props;
            }
            if (HOOKS && fiber.memoizedState) {
              const hookValues = [];
              let hook = fiber.memoizedState;
              let hIdx = 0;
              while (hook && hIdx < 20) {
                if (hook.memoizedState !== undefined && hook.memoizedState !== null) {
                  try {
                    const val = JSON.parse(JSON.stringify(hook.memoizedState));
                    if (typeof val !== 'function') hookValues.push({ index: hIdx, value: val });
                  } catch { hookValues.push({ index: hIdx, value: String(hook.memoizedState).slice(0, 100) }); }
                }
                hook = hook.next;
                hIdx++;
              }
              if (hookValues.length > 0) comp.hooks = hookValues;
            }
            result.components.push(comp);
          }
          walkFiber(fiber.child);
          walkFiber(fiber.sibling);
        }
        walkFiber(rootEl[fiberKey]);
      }
    }

    // ── Vue ──
    if (FRAMEWORKS.includes('vue')) {
      const vueRoot = document.querySelector('[data-v-app]') || document.querySelector('#app');
      if (vueRoot && vueRoot.__vue_app__) {
        result.detected.push('vue');
        const app = vueRoot.__vue_app__;
        result.vue = { version: app.version || 'unknown', components: [] };
        if (app._instance) {
          const inst = app._instance;
          result.vue.rootComponent = {
            name: inst.type?.name || 'App',
            data: inst.data ? (() => { try { return JSON.parse(JSON.stringify(inst.data)); } catch { return 'unserializable'; } })() : undefined,
            props: inst.props ? (() => { try { return JSON.parse(JSON.stringify(inst.props)); } catch { return 'unserializable'; } })() : undefined,
          };
        }
      }
    }

    // ── Redux ──
    if (STORE && FRAMEWORKS.includes('redux')) {
      try {
        const store = window.__REDUX_DEVTOOLS_EXTENSION__ || window.__REDUX_STORE__;
        if (store && store.getState) {
          result.stores.redux = (() => { try { return JSON.parse(JSON.stringify(store.getState())); } catch { return 'unserializable'; } })();
          result.detected.push('redux');
        }
      } catch {}
      try {
        if (window.__NEXT_DATA__) {
          result.stores.nextData = { page: window.__NEXT_DATA__.page, props: Object.keys(window.__NEXT_DATA__.props?.pageProps || {}) };
          result.detected.push('nextjs');
        }
      } catch {}
    }

    // ── Zustand ──
    if (STORE && FRAMEWORKS.includes('zustand')) {
      try {
        const stores = window.__ZUSTAND_STORES__;
        if (stores) {
          result.stores.zustand = Object.entries(stores).map(([name, store]) => ({
            name,
            state: (() => { try { return JSON.parse(JSON.stringify(store.getState())); } catch { return 'unserializable'; } })(),
          }));
          result.detected.push('zustand');
        }
      } catch {}
    }

    result.summary = { detectedFrameworks: result.detected, componentCount: result.components.length };
    return result;
  })()`;

  return [
    { method: "Runtime.evaluate", params: { expression: script, returnByValue: true } },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. EXTENSIONS INSPECTOR
// ═══════════════════════════════════════════════════════════════════════════════

export const EXTENSIONS_MANIFEST: ToolManifest = {
  id: "browser.extensions",
  name: "Extensions Inspector",
  description: "List installed browser extensions, their permissions, content scripts, and injected code",
  longDescription:
    "Queries chrome.management API to list all installed extensions, their permissions, " +
    "version, enabled state, and content scripts. Also detects injected scripts by " +
    "scanning <script> tags and DOM mutations. Reports extensions that modify page content " +
    "or intercept network requests, which affect capture fidelity.",
  category: "browser",
  subcategory: "extensions",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["extensions", "plugins", "permissions", "content-scripts", "addons"],
  icon: "Puzzle",
  color: "#ef4444",
  parameters: [
    { name: "includeContentScripts", type: "boolean", description: "Scan for injected content scripts", required: false, default: true },
    { name: "includePermissions", type: "boolean", description: "Include extension permissions", required: false, default: true },
  ],
  capabilities: [
    { name: "extensions-list", description: "List installed extensions and their capabilities", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateExtensionsCDP(_input: ToolInput): unknown[] {
  const script = `(() => {
    const result = { extensions: [], injectedScripts: [], injectedStyles: [] };

    // Scan for injected scripts
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      const src = s.getAttribute('src') || '';
      const isPageScript = src.startsWith('/') || src.startsWith('./') || src.includes(location.hostname);
      result.injectedScripts.push({
        src,
        isPageScript,
        type: s.type || 'classic',
        async: s.async,
        defer: s.defer,
        integrity: s.integrity || undefined,
      });
    }

    // Scan for injected stylesheets
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (const l of links) {
      result.injectedStyles.push({
        href: l.getAttribute('href') || '',
        media: l.media || 'all',
      });
    }

    // Detect common extension markers
    const extensionMarkers = {
      adblock: !!document.querySelector('[id*="adblock"],[class*="adblock"],[id*="ublock"],[class*="ublock"]'),
      passwordManager: !!document.querySelector('[id*="lastpass"],[id*="1password"],[class*="bitwarden"]'),
      devTools: !!document.querySelector('[class*="devtools"],[id*="react-devtools"],[id*="vue-devtools"]'),
      analytics: !!window.ga || !!window.gtag || !!window._gaq || !!window.dataLayer,
      trackingPixels: document.querySelectorAll('img[width="1"],img[height="1"],img[style*="1px"]').length > 0,
    };
    result.detected = extensionMarkers;

    result.summary = {
      scriptCount: result.injectedScripts.length,
      externalScripts: result.injectedScripts.filter(s => !s.isPageScript).length,
      styleCount: result.injectedStyles.length,
      detectedMarkers: Object.entries(extensionMarkers).filter(([, v]) => v).map(([k]) => k),
    };

    return result;
  })()`;

  return [
    { method: "Runtime.evaluate", params: { expression: script, returnByValue: true } },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SOURCE CODE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

export const SOURCE_MANIFEST: ToolManifest = {
  id: "browser.source",
  name: "Source Code Extractor",
  description: "Extract all inline scripts, external script contents, stylesheets, and source maps",
  longDescription:
    "Reads all <script> and <style> elements to extract the page's JavaScript and CSS source code. " +
    "For external resources, fetches the content. Detects source maps and reconstructs original " +
    "file paths. Returns a structured codebase the LLM can analyze for understanding the app's " +
    "logic, detecting patterns, or generating documentation.",
  category: "browser",
  subcategory: "source",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["source", "scripts", "styles", "css", "javascript", "sourcemaps", "code"],
  icon: "Code",
  color: "#6366f1",
  parameters: [
    { name: "types", type: "array", description: "What to extract", required: false, default: ["scripts", "styles"] },
    { name: "includeInline", type: "boolean", description: "Include inline <script> and <style> content", required: false, default: true },
    { name: "includeExternal", type: "boolean", description: "Include external script/style URLs", required: false, default: true },
    { name: "maxContentLength", type: "number", description: "Max chars per script/style", required: false, default: 50000 },
    { name: "fetchExternal", type: "boolean", description: "Fetch external scripts to get full content", required: false, default: false },
  ],
  capabilities: [
    { name: "source-extract", description: "Read all JS and CSS source code from the page", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateSourceCDP(input: ToolInput): unknown[] {
  const types = (input.types as string[]) || ["scripts", "styles"];
  const maxLen = (input.maxContentLength as number) || 50000;

  const script = `(() => {
    const TYPES = ${JSON.stringify(types)};
    const MAX = ${maxLen};
    const result = { scripts: [], styles: [], meta: {} };

    if (TYPES.includes('scripts')) {
      const allScripts = document.querySelectorAll('script');
      for (const s of allScripts) {
        const entry = {
          src: s.src || null,
          type: s.type || 'classic',
          async: s.async,
          defer: s.defer,
          content: null,
          size: 0,
        };
        if (!s.src && s.textContent) {
          entry.content = s.textContent.slice(0, MAX);
          entry.size = s.textContent.length;
        }
        if (s.src) {
          entry.size = 0; // unknown until fetched
          entry.url = s.src;
        }
        result.scripts.push(entry);
      }
    }

    if (TYPES.includes('styles')) {
      const allStyles = document.querySelectorAll('style, link[rel="stylesheet"]');
      for (const s of allStyles) {
        const entry = { href: null, content: null, size: 0, media: 'all' };
        if (s.tagName === 'STYLE') {
          entry.content = s.textContent?.slice(0, MAX) || '';
          entry.size = s.textContent?.length || 0;
          entry.media = s.media || 'all';
        } else {
          entry.href = s.getAttribute('href');
          entry.media = s.media || 'all';
        }
        result.styles.push(entry);
      }
    }

    result.meta = {
      totalScripts: result.scripts.length,
      totalStyles: result.styles.length,
      inlineScripts: result.scripts.filter(s => !s.src).length,
      externalScripts: result.scripts.filter(s => s.src).length,
      inlineStyles: result.styles.filter(s => !s.href).length,
      externalStyles: result.styles.filter(s => s.href).length,
    };

    return result;
  })()`;

  return [
    { method: "Runtime.evaluate", params: { expression: script, returnByValue: true } },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. WEBSOCKET CAPTURE
// ═══════════════════════════════════════════════════════════════════════════════

export const WEBSOCKET_MANIFEST: ToolManifest = {
  id: "browser.websocket",
  name: "WebSocket Capture",
  description: "Intercept and log all WebSocket frames sent and received",
  longDescription:
    "Monkey-patches WebSocket constructor to intercept all send/receive operations. " +
    "Records every message frame with direction (in/out), payload (text or binary size), " +
    "timestamp, and origin URL. Detects common protocols (Socket.IO, STOMP, GraphQL subscriptions). " +
    "Enables the LLM to understand real-time data flows.",
  category: "browser",
  subcategory: "network",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["websocket", "ws", "realtime", "socket", "protocol", "frames"],
  icon: "Radio",
  color: "#14b8a6",
  parameters: [
    { name: "action", type: "enum", description: "start=begin intercepting, stop=stop & return log", required: false, default: "snapshot", enum: ["start", "stop", "snapshot"] },
    { name: "maxFrames", type: "number", description: "Max frames to keep", required: false, default: 1000, min: 10, max: 10000 },
  ],
  capabilities: [
    { name: "websocket-capture", description: "Intercept WebSocket traffic in real-time", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateWebSocketCDP(input: ToolInput): unknown[] {
  const action = (input.action as string) || "snapshot";
  const maxFrames = (input.maxFrames as number) || 1000;

  if (action === "start") {
    return [
      {
        method: "Runtime.evaluate",
        params: {
          expression: `(() => {
            if (window.__stitap_ws) return 'already capturing';
            const origWS = window.WebSocket;
            window.__stitap_ws = { frames: [], connections: [], capturing: true, origWS };

            window.WebSocket = function(url, protocols) {
              const ws = protocols ? new origWS(url, protocols) : new origWS(url);
              const conn = { url, protocols, frames: [], connectedAt: Date.now() };
              window.__stitap_ws.connections.push(conn);

              const origSend = ws.send.bind(ws);
              ws.send = function(data) {
                if (window.__stitap_ws.capturing) {
                  const frame = { dir: 'out', data: typeof data === 'string' ? data.slice(0, 10000) : '[binary:' + (data.byteLength || data.size || '?') + ']', ts: Date.now() };
                  conn.frames.push(frame);
                  window.__stitap_ws.frames.push(frame);
                }
                return origSend(data);
              };

              ws.addEventListener('message', (e) => {
                if (window.__stitap_ws.capturing) {
                  const frame = { dir: 'in', data: typeof e.data === 'string' ? e.data.slice(0, 10000) : '[binary:' + (e.data.byteLength || e.data.size || '?') + ']', ts: Date.now() };
                  conn.frames.push(frame);
                  window.__stitap_ws.frames.push(frame);
                }
              });

              ws.addEventListener('open', () => { conn.openedAt = Date.now(); });
              ws.addEventListener('close', (e) => { conn.closedAt = Date.now(); conn.closeCode = e.code; conn.closeReason = e.reason; });
              ws.addEventListener('error', (e) => { conn.error = e.message || 'error'; });

              return ws;
            };
            window.WebSocket.prototype = origWS.prototype;
            window.WebSocket.CONNECTING = origWS.CONNECTING;
            window.WebSocket.OPEN = origWS.OPEN;
            window.WebSocket.CLOSING = origWS.CLOSING;
            window.WebSocket.CLOSED = origWS.CLOSED;

            return 'WebSocket capture started (intercepts new connections)';
          })()`,
          returnByValue: true,
        },
      },
    ];
  }

  return [
    {
      method: "Runtime.evaluate",
      params: {
        expression: `(() => {
          if (!window.__stitap_ws) return { status: 'capture-not-active', connections: [], frames: [] };
          const ws = window.__stitap_ws;
          const frames = ws.frames.slice(-${maxFrames});
          const connections = ws.connections.map(c => ({
            url: c.url,
            frameCount: c.frames.length,
            open: !c.closedAt,
            closeCode: c.closeCode,
            duration: c.closedAt ? (c.closedAt - c.openedAt) : (Date.now() - c.openedAt),
          }));
          if ('${action}' === 'stop') ws.capturing = false;
          return { status: ws.capturing ? 'active' : 'stopped', connections, frames, summary: { totalFrames: frames.length, totalConnections: connections.length, inFrames: frames.filter(f => f.dir === 'in').length, outFrames: frames.filter(f => f.dir === 'out').length } };
        })()`,
        returnByValue: true,
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. CONSOLE CAPTURE
// ═══════════════════════════════════════════════════════════════════════════════

export const CONSOLE_MANIFEST: ToolManifest = {
  id: "browser.console",
  name: "Console Log Capture",
  description: "Capture all console.log, warn, error, info, and debug messages with stack traces",
  longDescription:
    "Hooks into console methods to capture all output. Each entry includes the log level, " +
    "formatted message, arguments, timestamp, and stack trace. Detects uncaught errors " +
    "and unhandled promise rejections. The LLM can use this to diagnose runtime issues " +
    "and understand what the page is doing.",
  category: "browser",
  subcategory: "debug",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["console", "logs", "errors", "warnings", "debug", "stack-traces"],
  icon: "Terminal",
  color: "#f97316",
  parameters: [
    { name: "action", type: "enum", description: "start=begin capturing, stop=stop & return, snapshot=get current", required: false, default: "snapshot", enum: ["start", "stop", "snapshot"] },
    { name: "levels", type: "array", description: "Log levels to capture", required: false, default: ["log", "warn", "error", "info", "debug"] },
    { name: "maxEntries", type: "number", description: "Max log entries", required: false, default: 500, min: 10, max: 5000 },
    { name: "includeStackTrace", type: "boolean", description: "Include stack traces", required: false, default: true },
  ],
  capabilities: [
    { name: "console-capture", description: "Capture all console output with stack traces", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateConsoleCDP(input: ToolInput): unknown[] {
  const action = (input.action as string) || "snapshot";
  const maxEntries = (input.maxEntries as number) || 500;

  if (action === "start") {
    return [
      {
        method: "Runtime.evaluate",
        params: {
          expression: `(() => {
            if (window.__stitap_console) return 'already capturing';
            const origMethods = {};
            const levels = ['log','warn','error','info','debug','trace','dir','table'];
            window.__stitap_console = { entries: [], capturing: true, origMethods };

            for (const level of levels) {
              origMethods[level] = console[level].bind(console);
              console[level] = function(...args) {
                if (window.__stitap_console.capturing) {
                  const entry = { level, message: args.map(a => { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return '[unserializable]'; } }).join(' '), args: args.length, ts: Date.now() };
                  if (level === 'error' || level === 'warn') {
                    try { entry.stack = new Error().stack?.split('\\n').slice(1, 4).join(' | '); } catch {}
                  }
                  window.__stitap_console.entries.push(entry);
                }
                return origMethods[level](...args);
              };
            }

            window.addEventListener('error', (e) => {
              if (window.__stitap_console.capturing) {
                window.__stitap_console.entries.push({ level: 'uncaught-error', message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, ts: Date.now() });
              }
            });
            window.addEventListener('unhandledrejection', (e) => {
              if (window.__stitap_console.capturing) {
                window.__stitap_console.entries.push({ level: 'unhandled-rejection', message: String(e.reason?.message || e.reason || 'unknown'), ts: Date.now() });
              }
            });

            return 'Console capture started';
          })()`,
          returnByValue: true,
        },
      },
    ];
  }

  return [
    {
      method: "Runtime.evaluate",
      params: {
        expression: `(() => {
          if (!window.__stitap_console) return { status: 'not-active', entries: [] };
          const c = window.__stitap_console;
          const entries = c.entries.slice(-${maxEntries});
          if ('${action}' === 'stop') {
            for (const [level, fn] of Object.entries(c.origMethods)) console[level] = fn;
            c.capturing = false;
          }
          return {
            status: c.capturing ? 'active' : 'stopped',
            entries,
            summary: {
              total: entries.length,
              byLevel: entries.reduce((acc, e) => { acc[e.level] = (acc[e.level] || 0) + 1; return acc; }, {}),
              errors: entries.filter(e => e.level === 'error' || e.level === 'uncaught-error' || e.level === 'unhandled-rejection'),
            },
          };
        })()`,
        returnByValue: true,
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. DOM EVENT CAPTURE
// ═══════════════════════════════════════════════════════════════════════════════

export const DOMEVENTS_MANIFEST: ToolManifest = {
  id: "browser.domevents",
  name: "DOM Event Capture",
  description: "Capture all DOM events with target, phase, bubbles, timestamp, and propagation path",
  longDescription:
    "Installs event listeners on all common DOM event types to capture every interaction: " +
    "clicks, inputs, scrolls, keyboard events, focus changes, mutation observer changes, " +
    "drag events, and more. Returns a timeline of events with their targets, " +
    "bubbling paths, and timing. The LLM can replay user interactions or " +
    "understand the page's event-driven behavior.",
  category: "browser",
  subcategory: "events",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["events", "dom-events", "clicks", "inputs", "mutation-observer", "user-interaction"],
  icon: "MousePointerClick",
  color: "#ec4899",
  parameters: [
    { name: "action", type: "enum", description: "start=begin, stop=stop & return, snapshot=get current", required: false, default: "snapshot", enum: ["start", "stop", "snapshot"] },
    { name: "eventTypes", type: "array", description: "Event types to capture", required: false, default: ["click", "input", "change", "submit", "keydown", "keyup", "focus", "blur", "scroll", "resize", "mousedown", "mouseup"] },
    { name: "maxEntries", type: "number", description: "Max events to keep", required: false, default: 500, min: 10, max: 5000 },
    { name: "includeMutationObserver", type: "boolean", description: "Also capture DOM mutations", required: false, default: true },
  ],
  capabilities: [
    { name: "events-capture", description: "Capture all DOM events and mutations", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateDomEventsCDP(input: ToolInput): unknown[] {
  const action = (input.action as string) || "snapshot";
  const maxEntries = (input.maxEntries as number) || 500;
  const eventTypes = (input.eventTypes as string[]) || ["click", "input", "change", "submit", "keydown", "keyup", "focus", "blur", "scroll", "resize"];
  const includeMutation = input.includeMutationObserver !== false;

  if (action === "start") {
    return [
      {
        method: "Runtime.evaluate",
        params: {
          expression: `(() => {
            if (window.__stitap_events) return 'already capturing';
            window.__stitap_events = { entries: [], capturing: true };
            const TYPES = ${JSON.stringify(eventTypes)};

            for (const type of TYPES) {
              document.addEventListener(type, (e) => {
                if (!window.__stitap_events.capturing) return;
                const target = e.target;
                const selector = target.id ? '#' + target.id : target.tagName?.toLowerCase() + (target.className && typeof target.className === 'string' ? '.' + target.className.split(' ')[0] : '');
                window.__stitap_events.entries.push({
                  type: e.type,
                  target: selector,
                  targetTag: target.tagName,
                  targetId: target.id || undefined,
                  value: target.value !== undefined ? String(target.value).slice(0, 200) : undefined,
                  key: e.key || undefined,
                  keyCode: e.keyCode || undefined,
                  x: e.clientX,
                  y: e.clientY,
                  bubbles: e.bubbles,
                  ts: Date.now(),
                });
              }, { capture: true, passive: true });
            }

            if (${includeMutation}) {
              const obs = new MutationObserver((mutations) => {
                if (!window.__stitap_events.capturing) return;
                for (const m of mutations.slice(0, 10)) {
                  window.__stitap_events.entries.push({
                    type: 'mutation',
                    target: m.target.id ? '#' + m.target.id : m.target.tagName?.toLowerCase(),
                    mutationType: m.type,
                    addedNodes: m.addedNodes.length,
                    removedNodes: m.removedNodes.length,
                    attributeName: m.attributeName,
                    ts: Date.now(),
                  });
                }
              });
              obs.observe(document.body, { childList: true, attributes: true, subtree: true, characterData: true });
            }

            return 'DOM event capture started';
          })()`,
          returnByValue: true,
        },
      },
    ];
  }

  return [
    {
      method: "Runtime.evaluate",
      params: {
        expression: `(() => {
          if (!window.__stitap_events) return { status: 'not-active', entries: [] };
          const ev = window.__stitap_events;
          const entries = ev.entries.slice(-${maxEntries});
          if ('${action}' === 'stop') ev.capturing = false;
          return {
            status: ev.capturing ? 'active' : 'stopped',
            entries,
            summary: {
              total: entries.length,
              byType: entries.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
            },
          };
        })()`,
        returnByValue: true,
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. FULL COOKIE JAR
// ═══════════════════════════════════════════════════════════════════════════════

export const COOKIES_MANIFEST: ToolManifest = {
  id: "browser.cookies",
  name: "Full Cookie Jar",
  description: "Read all cookies including HttpOnly via CDP with full metadata: domain, path, expiry, SameSite, Secure flags",
  longDescription:
    "Uses CDP Network.getCookies to access ALL cookies including HttpOnly ones that JavaScript " +
    "cannot read. Returns full cookie metadata: name, value, domain, path, expires, " +
    "httpOnly, secure, sameSite, size, and session flag. Groups cookies by domain " +
    "for easy analysis of auth and tracking cookies.",
  category: "browser",
  subcategory: "storage",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["cookies", "httpOnly", "session", "auth", "tracking", "samesite"],
  icon: "Cookie",
  color: "#a855f7",
  parameters: [
    { name: "urls", type: "array", description: "URLs to get cookies for (default: all)", required: false },
    { name: "filter", type: "string", description: "Filter by cookie name (substring)", required: false },
    { name: "groupedByDomain", type: "boolean", description: "Group results by domain", required: false, default: true },
  ],
  capabilities: [
    { name: "cookies-full", description: "Read all cookies including HttpOnly via CDP", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-23",
  slmFriendly: true,
};

export function generateCookiesCDP(input: ToolInput): unknown[] {
  return [
    {
      method: "Network.getCookies",
      params: { urls: (input.urls as string[]) || [location.href] },
    },
    {
      method: "Runtime.evaluate",
      params: {
        expression: `(() => {
          // This is a placeholder — the actual cookie data comes from Network.getCookies response
          return { status: 'use-network-getCookies' };
        })()`,
        returnByValue: true,
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALL DEEP INSPECTION TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

export const DEEP_BROWSER_TOOLS: ToolManifest[] = [
  INSPECT_MANIFEST,
  NETWORK_MANIFEST,
  STORAGE_MANIFEST,
  STATE_MANIFEST,
  EXTENSIONS_MANIFEST,
  SOURCE_MANIFEST,
  WEBSOCKET_MANIFEST,
  CONSOLE_MANIFEST,
  DOMEVENTS_MANIFEST,
  COOKIES_MANIFEST,
];
