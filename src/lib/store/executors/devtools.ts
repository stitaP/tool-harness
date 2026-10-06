/**
 * Executors for developer/architecture tools: Mermaid diagrams, OpenViking
 * tiered context store, CAR harness governance, multi-language code
 * generation/validation, and legacy-server / llama.cpp / RAG deployment planning.
 */
import { getDiagramGenerator, type Diagram } from "@/lib/diagram/generator";
import { getVikingStore, type ContextTier, type L0Abstract, type L1Overview, type L2Details } from "@/lib/viking/context-store";
import { getWebBuilderAuditor } from "@/lib/viking/webbuilder-audit";
import { CARFramework, DEFAULT_WEBBUILDER_HARNESS, type CARConfig, type AutonomyLevel } from "@/lib/harness/car-framework";
import { generateCode, validateSyntax, checkSyntax, getApiQuickRef, getCodeGenStats } from "@/lib/integrations/codegen";
import { searchReferences, getReferenceCard, getLanguageProfile, getLanguageOverview, generateStarter, getReferenceStats, LANGUAGE_PROFILES, LANGUAGE_REFERENCES, type ProgrammingLanguage } from "@/lib/integrations/langref";
import { detectHardware, generateSSHProbeScript, parseProbeOutput, type HardwareProfile } from "@/lib/server/hardware-detect";
import { SERVER_DATABASE, queryServers, getBestRAGServers, getLegacyReport, getServerBuildTarget, estimateModelRAM, CPU_DATABASE, type ServerModel } from "@/lib/server/legacy-hardware";
import { generateBuildPlan, generateLegacyBuildPlan, generateBuildConfig, getModelRecommendations } from "@/lib/server/llama-build-optimizer";
import { generateDeploymentPlan, getDeploymentSummary } from "@/lib/server/rag-deployment";
import { callLlm, hasLlm } from "./hooks";
import { execs, json, num, str, bool, list, persisted, nodeModule, isNode, dataDir, type ExecMap } from "./util";

// ─── diagrams ────────────────────────────────────────────────────────────────

const arr = <T = any>(v: unknown): T[] => { const j = json<any>(v, []); return Array.isArray(j) ? j : j && typeof j === "object" ? Object.values(j) : []; };

/** Light structural Mermaid check (balanced brackets, known header, non-empty body). */
function checkMermaid(src: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const lines = src.split("\n").filter((l) => l.trim() && !l.trim().startsWith("%%"));
  if (!/^(graph|flowchart)\s+(TD|TB|BT|LR|RL)|^sequenceDiagram|^stateDiagram(-v2)?|^erDiagram|^classDiagram|^journey|^gantt/.test(lines[0]?.trim() ?? "")) issues.push(`unknown diagram header "${lines[0] ?? ""}"`);
  if (lines.length < 2) issues.push("diagram has no body");
  for (const [o, c] of [["[", "]"], ["(", ")"], ["{", "}"]]) {
    const n = (s: string, ch: string) => s.split(ch).length - 1;
    if (n(src, o) !== n(src, c)) issues.push(`unbalanced ${o}${c}`);
  }
  const subs = lines.filter((l) => /^\s*subgraph\b/.test(l)).length, ends = lines.filter((l) => /^\s*end\s*$/.test(l)).length;
  if (lines[0]?.startsWith("graph") && subs !== ends) issues.push(`subgraph/end mismatch (${subs}/${ends})`);
  return { valid: !issues.length, issues };
}

function diagramOut(d: Diagram) {
  const v = checkMermaid(d.mermaid);
  const fs = nodeModule("node:fs"), path = nodeModule("node:path");
  let file: string | undefined;
  if (fs && dataDir()) {
    file = path.join(dataDir()!, "diagrams", `${d.type}-${d.id}.mmd`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, d.mermaid);
  }
  return { id: d.id, type: d.type, title: d.title, mermaid: d.mermaid, markdown: "```mermaid\n" + d.mermaid + "\n```", valid: v.valid, issues: v.issues, file, ...d.metadata };
}

/** Accept ["/a","/b"], "a,b" or [{path,...}] for route lists. */
const routesIn = (v: unknown) => {
  const raw = typeof v === "string" && !/^\s*[[{]/.test(v) ? list(v) : arr(v);
  return raw.map((r: any) => (typeof r === "string" ? { path: r } : r));
};

// ─── OpenViking context store (persisted) ────────────────────────────────────

const vikingState = persisted<{ projects: any[]; resources: any[]; l0: [string, any][]; l1: [string, any][]; l2: [string, any][] }>("viking", () => ({ projects: [], resources: [], l0: [], l1: [], l2: [] }));
let vikingHydrated = false;
function viking() {
  const s = getVikingStore() as any;
  if (!vikingHydrated) {
    vikingHydrated = true;
    const st = vikingState.get();
    for (const p of st.projects) s.projects.set(p.id, p);
    for (const r of st.resources) s.resources.set(r.id, r);
    for (const [k, v] of st.l0) s.l0Data.set(k, v);
    for (const [k, v] of st.l1) s.l1Data.set(k, v);
    for (const [k, v] of st.l2) s.l2Data.set(k, v);
  }
  return s;
}
function saveViking() {
  const s = viking(), st = vikingState.get();
  st.projects = [...s.projects.values()]; st.resources = [...s.resources.values()];
  st.l0 = [...s.l0Data.entries()]; st.l1 = [...s.l1Data.entries()]; st.l2 = [...s.l2Data.entries()];
  vikingState.save();
}
function findProject(idOrName: string) {
  const s = viking();
  const p = s.getProject(idOrName) ?? [...s.projects.values()].find((x: any) => x.name === idOrName || x.baseUrl === idOrName);
  if (!p) throw new Error(`Viking project "${idOrName}" not found — create it with viking.create_project`);
  return p;
}

const emptyTokens = () => ({ colors: [], typography: [], spacing: [], breakpoints: [], shadows: [], borderRadii: [] });

/** Static HTML analysis (no DOM in Node): links, forms, interactions, design tokens, scripts. */
function analyseHtml(html: string, url: string) {
  const text = (re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? url;
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(html)?.[1] ?? "";
  const links = [...new Set(text(/<a\b[^>]*href=["']([^"'#]+)["']/gi))];
  const buttons = text(/<button\b[^>]*>([\s\S]*?)<\/button>/gi).map((b) => b.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => ({ action: /action=["']([^"']*)/i.exec(m[1])?.[1] ?? "", method: (/method=["']([^"']*)/i.exec(m[1])?.[1] ?? "get").toUpperCase(), fields: [...m[2].matchAll(/<(?:input|select|textarea)\b[^>]*name=["']([^"']+)["'][^>]*>/gi)].map((f) => ({ name: f[1], type: /type=["']([^"']+)/i.exec(f[0])?.[1] ?? "text", required: /\brequired\b/i.test(f[0]) })) }));
  const css = text(/<style[^>]*>([\s\S]*?)<\/style>/gi).join("\n") + "\n" + text(/style=["']([^"']*)["']/gi).join(";");
  const colors = [...new Set((css.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? []).map((c) => c.toLowerCase()))].slice(0, 40);
  const fonts = [...new Set(text(/font-family\s*:\s*([^;}"]+)/gi).map((f) => f.trim()))].slice(0, 10);
  const sizes = [...new Set(text(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi).map(Number))].sort((a, b) => a - b);
  const spacing = [...new Set(text(/(?:margin|padding|gap)[a-z-]*\s*:\s*(\d+)px/gi).map(Number))].sort((a, b) => a - b).slice(0, 20);
  const radii = [...new Set(text(/border-radius\s*:\s*(\d+)px/gi).map(Number))];
  const shadows = [...new Set(text(/box-shadow\s*:\s*([^;}]+)/gi).map((s) => s.trim()))].slice(0, 10);
  const breakpoints = [...new Set(text(/@media[^{]*min-width\s*:\s*(\d+)px/gi).map(Number))].sort((a, b) => a - b).map((w, k) => ({ name: ["sm", "md", "lg", "xl", "2xl"][k] ?? `bp${k}`, minWidth: w }));
  const scripts = text(/<script\b[^>]*src=["']([^"']+)["']/gi);
  const apis = [...new Set([...html.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]))];
  const headings = text(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi).map((h) => h.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const components = [...new Set([...html.matchAll(/<(header|nav|main|footer|aside|section|article|form|table|dialog)\b/gi)].map((m) => m[1].toLowerCase()))];
  const l0: L0Abstract = { summary: `${title}${desc ? ` — ${desc}` : ""}`.slice(0, 300), resourceType: "page", complexity: Math.min(10, Math.ceil((links.length + buttons.length + forms.length * 3) / 10) + 1), entities: headings.slice(0, 10) };
  const l1: L1Overview = {
    componentTree: components.join(" > "),
    dataModels: forms.map((f, k) => ({ name: f.action || `form${k + 1}`, fields: f.fields.map((x) => ({ name: x.name, type: x.type, required: x.required })), relationships: [] })),
    interactions: [...buttons.map((b) => ({ trigger: "click", action: "button", target: b, description: `Button "${b}"` })), ...forms.map((f) => ({ trigger: "submit", action: f.method, target: f.action, description: `Form ${f.method} ${f.action} (${f.fields.length} fields)` }))],
    dependencies: [...scripts, ...apis],
    designTokens: { colors, typography: fonts.map((f) => ({ fontFamily: f, sizes })), spacing, breakpoints, shadows, borderRadii: radii },
    route: { path: (() => { try { return new URL(url).pathname; } catch { return url; } })(), method: "GET", params: [], isProtected: /login|sign.?in|password/i.test(html) && forms.some((f) => f.fields.some((x) => x.type === "password")) },
  };
  return { title, links, l0, l1, scripts, apis };
}

async function fetchPage(url: string): Promise<{ html: string; status: number; ms: number; bytes: number; headers: Record<string, string> }> {
  const t = Date.now();
  const res = await fetch(url, { headers: { "user-agent": "stitaP-viking/0.1", accept: "text/html,*/*" }, redirect: "follow" });
  const html = await res.text();
  return { html, status: res.status, ms: Date.now() - t, bytes: html.length, headers: Object.fromEntries((res.headers as any).entries()) };
}

// ─── CAR harness (persisted) ─────────────────────────────────────────────────

const DEFAULT_GATES = [
  { name: "Route Coverage", description: "Every discovered route has L0 + L1", conditions: [{ id: "routeCoverage", description: "Routes with L0/L1 (%)", type: "coverage", threshold: 100 }] },
  { name: "Component Catalog", description: "UI components identified", conditions: [{ id: "componentCatalog", description: "Components classified (%)", type: "coverage", threshold: 90 }] },
  { name: "Design Tokens", description: "Colors, typography, spacing, breakpoints extracted", conditions: [{ id: "designTokens", description: "Token categories extracted (of 4)", type: "coverage", threshold: 4 }] },
  { name: "Interaction Map", description: "Interactive elements documented", conditions: [{ id: "interactionMap", description: "Interactions documented (%)", type: "coverage", threshold: 90 }] },
  { name: "API Contracts", description: "Integrations have I/O contracts", conditions: [{ id: "apiContracts", description: "APIs with contracts (%)", type: "coverage", threshold: 100 }] },
  { name: "Performance", description: "Core Web Vitals recorded", conditions: [{ id: "performance", description: "Vitals measured (of 3)", type: "quality", threshold: 3 }] },
  { name: "Accessibility", description: "ARIA, keyboard nav, contrast verified", conditions: [{ id: "accessibility", description: "Accessibility score", type: "quality", threshold: 90 }] },
  { name: "Diagrams", description: "Route map + user journey generated", conditions: [{ id: "diagrams", description: "Required diagrams", type: "custom", threshold: 2 }] },
] as const;

const carState = persisted<{ state: any | null }>("car-harness", () => ({ state: null }));
let car: CARFramework | null = null;
function harness(): CARFramework {
  if (car) return car;
  const saved = carState.get().state;
  car = new CARFramework(saved?.config ?? DEFAULT_WEBBUILDER_HARNESS);
  if (saved) (car as any).state = saved;
  else DEFAULT_GATES.forEach((g, k) => car!.addGate({ ...(g as any), conditions: g.conditions.map((c) => ({ ...c })), onFail: "warn", maxRetries: 0, order: k + 1 }));
  return car;
}
const saveCar = () => { carState.get().state = (harness() as any).state; carState.save(); };

// ─── codegen: real syntax checking with installed toolchains ─────────────────

const LANGS = Object.keys(LANGUAGE_PROFILES) as ProgrammingLanguage[];
const lang = (v: unknown): ProgrammingLanguage => {
  const s = str(v).toLowerCase().replace(/^c\+\+$/, "cpp").replace(/^js$/, "javascript").replace(/^ts$/, "typescript").replace(/^py$/, "python");
  if (!LANGS.includes(s as ProgrammingLanguage)) throw new Error(`unsupported language "${str(v)}" (${LANGS.join(", ")})`);
  return s as ProgrammingLanguage;
};

function which(cmd: string): boolean {
  const cp = nodeModule("node:child_process");
  if (!cp) return false;
  try { cp.execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" }); return true; } catch { return false; }
}

/** Compiler/parser check using toolchains on this machine; null when none is available. */
function nativeCheck(language: ProgrammingLanguage, code: string): { tool: string; valid: boolean; errors: string[] } | null {
  if (language === "javascript") {
    try { new Function(code.replace(/^\s*(import|export)\b.*$/gm, "")); return { tool: "v8-parse", valid: true, errors: [] }; }
    catch (e: any) { if (!/import|export|await/.test(code)) return { tool: "v8-parse", valid: false, errors: [e.message] }; }
  }
  if (language === "typescript") {
    try {
      const ts = nodeModule("node:module")?.createRequire(process.cwd() + "/")("typescript");
      const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: 99, module: 99 } });
      const errors = (out.diagnostics ?? []).map((d: any) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      return { tool: "typescript", valid: !errors.length, errors };
    } catch { /* typescript not installed */ }
  }
  const cp = nodeModule("node:child_process"), fs = nodeModule("node:fs"), path = nodeModule("node:path"), os = nodeModule("node:os");
  if (!cp) return null;
  const run = (bin: string, args: string[], input?: string) => {
    const r = cp.spawnSync(bin, args, { input, encoding: "utf8", timeout: 30000 });
    return { ok: r.status === 0, err: `${r.stderr ?? ""}${r.stdout ?? ""}`.trim() };
  };
  const tmp = (ext: string, name = "main") => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "stitap-cg-")); const f = path.join(d, `${name}${ext}`); fs.writeFileSync(f, code); return f; };
  if (language === "python") {
    const py = which("python3") ? "python3" : which("python") ? "python" : null;
    if (!py) return null;
    const r = run(py, ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], code);
    return { tool: `${py} ast`, valid: r.ok, errors: r.ok ? [] : [r.err.split("\n").slice(-3).join(" ")] };
  }
  if (language === "c" || language === "cpp") {
    const cc = language === "c" ? (which("gcc") ? "gcc" : which("clang") ? "clang" : null) : (which("g++") ? "g++" : which("clang++") ? "clang++" : null);
    if (!cc) return null;
    const r = run(cc, ["-fsyntax-only", tmp(language === "c" ? ".c" : ".cpp")]);
    return { tool: cc, valid: r.ok, errors: r.ok ? [] : r.err.split("\n").filter((l: string) => /error/.test(l)).slice(0, 20) };
  }
  if (language === "java" && which("javac")) {
    const cls = /public\s+(?:final\s+)?class\s+(\w+)/.exec(code)?.[1] ?? "Main";
    const f = tmp(".java", cls);
    const r = run("javac", ["-d", path.dirname(f), f]);
    return { tool: "javac", valid: r.ok, errors: r.ok ? [] : r.err.split("\n").filter((l: string) => /error/.test(l)).slice(0, 20) };
  }
  if (language === "rust" && which("rustc")) {
    const f = tmp(".rs");
    const r = run("rustc", ["--edition", "2021", "--crate-type", "lib", "--emit=metadata", "-o", f + ".rmeta", f]);
    return { tool: "rustc", valid: r.ok, errors: r.ok ? [] : r.err.split("\n").filter((l: string) => /^error/.test(l)).slice(0, 20) };
  }
  return null;
}

// ─── server: real local hardware ─────────────────────────────────────────────

function gpus(): { name: string; vramGB?: number; vendor: string }[] {
  const cp = nodeModule("node:child_process");
  if (!cp) return [];
  const sh = (cmd: string, args: string[]) => { try { return cp.execFileSync(cmd, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }) as string; } catch { return ""; } };
  const out: { name: string; vramGB?: number; vendor: string }[] = [];
  if (which("nvidia-smi")) for (const l of sh("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]).trim().split("\n").filter(Boolean)) { const [name, mem] = l.split(","); out.push({ name: name.trim(), vramGB: Math.round(Number(mem) / 102.4) / 10, vendor: "nvidia" }); }
  if (out.length) return out;
  if (process.platform === "darwin") {
    const j = json<any>(sh("system_profiler", ["SPDisplaysDataType", "-json"]) || "{}", {});
    for (const g of j.SPDisplaysDataType ?? []) out.push({ name: g.sppci_model ?? g._name, vendor: /apple/i.test(g.sppci_model ?? "") ? "apple" : "other", vramGB: g.spdisplays_vram ? parseFloat(g.spdisplays_vram) / (/MB/.test(g.spdisplays_vram) ? 1024 : 1) : undefined });
  } else if (process.platform === "win32") {
    for (const l of sh("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name + '|' + $_.AdapterRAM }"]).trim().split(/\r?\n/).filter(Boolean)) { const [name, ram] = l.split("|"); out.push({ name, vendor: /nvidia/i.test(name) ? "nvidia" : /amd|radeon/i.test(name) ? "amd" : /intel/i.test(name) ? "intel" : "other", vramGB: Number(ram) ? Math.round(Number(ram) / 1073741824 * 10) / 10 : undefined }); }
  } else if (which("lspci")) {
    for (const l of sh("lspci", []).split("\n").filter((l) => /VGA|3D controller|Display controller/.test(l))) { const name = l.replace(/^.*?: /, ""); out.push({ name, vendor: /nvidia/i.test(name) ? "nvidia" : /amd|ati/i.test(name) ? "amd" : /intel/i.test(name) ? "intel" : "other" }); }
  }
  return out;
}

function localHardware(): HardwareProfile & { gpus: ReturnType<typeof gpus> } {
  if (!isNode()) throw new Error("local hardware detection needs the agent runtime (Node.js); use action=generate-probe to inspect a machine over SSH");
  const hw = detectHardware();
  const os = nodeModule("node:os");
  const cpus = os.cpus();
  if (!hw.cpu.brand || hw.cpu.brand === "unknown" || !hw.cpu.logicalCores) {
    hw.cpu.brand = cpus[0]?.model ?? hw.cpu.brand;
    hw.cpu.logicalCores = cpus.length;
    hw.cpu.physicalCores = hw.cpu.physicalCores || cpus.length;
    hw.cpu.baseFreqMHz = hw.cpu.baseFreqMHz || cpus[0]?.speed || 0;
    hw.cpu.vendor = /intel/i.test(hw.cpu.brand) ? "intel" : /amd/i.test(hw.cpu.brand) ? "amd" : hw.cpu.vendor;
  }
  if (!hw.memory.totalBytes) { hw.memory.totalBytes = os.totalmem(); hw.memory.availableBytes = os.freemem(); hw.memory.totalGB = Math.round(os.totalmem() / 1073741824 * 10) / 10; }
  if (hw.hostname === "unknown") hw.hostname = os.hostname();
  if (!hw.kernelVersion) hw.kernelVersion = os.release();
  return { ...hw, gpus: gpus() };
}

function findServer(name: string): ServerModel {
  const q = name.toLowerCase().replace(/\s+/g, " ").trim();
  const s = SERVER_DATABASE.find((x) => `${x.manufacturer} ${x.name}`.toLowerCase() === q || x.name.toLowerCase() === q)
    ?? SERVER_DATABASE.find((x) => `${x.manufacturer} ${x.name}`.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()));
  if (!s) throw new Error(`server "${name}" not in the legacy database — use server.legacy-hardware-db action=list-all for names`);
  return s;
}

/** Build plan for a named legacy server, or for this machine when no model is given. */
function planFor(serverModel: unknown) {
  if (str(serverModel)) { const s = findServer(str(serverModel)); return { target: s as ServerModel | HardwareProfile, label: `${s.manufacturer} ${s.name}`, plan: generateLegacyBuildPlan(s) }; }
  const hw = localHardware();
  return { target: hw as ServerModel | HardwareProfile, label: `${hw.hostname} (this machine)`, plan: generateBuildPlan(hw) };
}

function writeArtefacts(dir: string, files: Record<string, string>): string[] {
  const fs = nodeModule("node:fs"), path = nodeModule("node:path");
  if (!fs || !dataDir()) return [];
  const root = path.join(dataDir()!, dir);
  fs.mkdirSync(root, { recursive: true });
  return Object.entries(files).map(([name, content]) => { const f = path.join(root, name); fs.writeFileSync(f, content, { mode: name.endsWith(".sh") ? 0o755 : 0o644 }); return f; });
}

// ─── executors ───────────────────────────────────────────────────────────────

export const DEVTOOLS_EXECUTORS: ExecMap = execs({
  // diagrams
  "diagram.user_journey": (i) => diagramOut(getDiagramGenerator().generateUserJourney(routesIn(i.routes).map((r: any) => ({ path: str(r.path ?? r.route), isProtected: bool(r.isProtected ?? r.protected), interactions: list(r.interactions ?? r.actions) })), str(i.title, "User Journey"))),
  "diagram.component_tree": (i) => {
    const raw = typeof i.components === "string" && !/^\s*[[{]/.test(i.components) ? list(i.components).map((name) => ({ name })) : arr(i.components);
    return diagramOut(getDiagramGenerator().generateComponentTree(raw.map((c: any) => (typeof c === "string" ? { name: c } : { name: str(c.name), children: c.children ? list(c.children) : undefined, type: c.type })), str(i.title, "UI Component Tree")));
  },
  "diagram.data_flow": (i) => {
    const nodes = arr(i.nodes).map((n: any) => (typeof n === "string" ? { id: n, label: n } : { id: str(n.id ?? n.name), label: str(n.label ?? n.name ?? n.id), type: n.type }));
    const edges = arr(i.edges).map((e: any) => (typeof e === "string" ? (() => { const [from, to] = e.split(/\s*->\s*/); return { from, to }; })() : { from: str(e.from ?? e.source), to: str(e.to ?? e.target), label: e.label, type: e.type }));
    return diagramOut(getDiagramGenerator().generateDataFlow(nodes, edges, str(i.title, "Data Flow")));
  },
  "diagram.architecture": (i) => {
    const j = json<any>(i.layers, []);
    const layers = Array.isArray(j) ? j.map((l: any) => ({ name: str(l.name), components: list(l.components) })) : Object.entries(j).map(([name, c]) => ({ name, components: list(c) }));
    return diagramOut(getDiagramGenerator().generateArchitecture(layers, str(i.title, "System Architecture")));
  },
  "diagram.state_machine": (i) => {
    const transitions = arr(i.transitions).map((t: any) => (typeof t === "string" ? (() => { const m = /^(.+?)\s*-+>\s*(.+?)(?:\s*:\s*(.+))?$/.exec(t); return { from: m?.[1] ?? "", to: m?.[2] ?? "", event: m?.[3] ?? "" }; })() : { from: str(t.from), to: str(t.to), event: str(t.event ?? t.label ?? t.on) }));
    const states = i.states ? list(i.states) : [...new Set(transitions.flatMap((t) => [t.from, t.to]))];
    return diagramOut(getDiagramGenerator().generateStateMachine(states, transitions, str(i.title, "State Machine")));
  },
  "diagram.er_diagram": (i) => {
    const entities = arr(i.entities).map((e: any) => ({ name: str(e.name), fields: (Array.isArray(e.fields) ? e.fields : list(e.fields)).map((f: any) => (typeof f === "string" ? (() => { const [name, type = "string"] = f.split(":"); return { name: name.trim(), type: type.trim(), pk: /^id$/i.test(name.trim()) }; })() : { name: str(f.name), type: str(f.type, "string"), pk: bool(f.pk ?? f.primaryKey) })) }));
    const rels = arr(i.relationships).map((r: any) => ({ from: str(r.from), to: str(r.to), type: (["1:1", "1:N", "N:M"].includes(str(r.type)) ? str(r.type) : "1:N") as "1:1" | "1:N" | "N:M", label: r.label }));
    return diagramOut(getDiagramGenerator().generateERDiagram(entities, rels, str(i.title, "Data Model")));
  },
  "diagram.route_map": (i) => diagramOut(getDiagramGenerator().generateRouteMap(routesIn(i.routes).map((r: any) => ({ path: str(r.path ?? r.route), children: r.children ? list(r.children) : undefined, isProtected: bool(r.isProtected ?? r.protected) })), str(i.title, "Route Navigation Map"))),

  // viking
  "viking.create_project": (i) => {
    const s = viking();
    const existing = [...s.projects.values()].find((p: any) => p.name === str(i.name));
    if (existing) return { project: existing, existed: true };
    const p = s.createProject(str(i.name), str(i.baseUrl));
    saveViking();
    return { project: p, vikingUri: `viking://resources/${p.name}/` };
  },
  "viking.index_resource": (i) => {
    const s = viking(), p = findProject(str(i.projectId));
    const tier = str(i.tier, "L0").toUpperCase() as ContextTier;
    const type = (str(i.resourceType, "page") as L0Abstract["resourceType"]);
    const l0: L0Abstract = { summary: str(i.summary), resourceType: type, complexity: num(i.complexity, 1), entities: list(i.entities) };
    const l1Raw = json<any>(i.overview ?? i.l1, null);
    const l1: L1Overview | undefined = tier !== "L0" ? { componentTree: str(l1Raw?.componentTree), dataModels: l1Raw?.dataModels ?? [], interactions: l1Raw?.interactions ?? [], dependencies: list(l1Raw?.dependencies), designTokens: { ...emptyTokens(), ...(l1Raw?.designTokens ?? {}) }, route: l1Raw?.route } : undefined;
    const l2: L2Details | undefined = tier === "L2" ? { rawContent: str(i.content ?? i.rawContent), networkTraces: [], cssRules: [], jsBehaviors: [], contentHash: String(str(i.content).length) } : undefined;
    const r = s.addResource(p.id, str(i.path).replace(/^\/+/, ""), tier, type, l0, l1, l2);
    if (i.tags) r.tags = list(i.tags);
    saveViking();
    return { resource: r };
  },
  "viking.query": (i) => {
    const s = viking(), p = findProject(str(i.projectId));
    const ids = new Set([...s.resources.values()].filter((r: any) => r.vikingUri.includes(`/${p.name}/`)).map((r: any) => r.id));
    const results = s.query({ search: i.search ? str(i.search) : undefined, tier: i.tier ? (str(i.tier).toUpperCase() as ContextTier) : undefined, tokenBudget: i.tokenBudget ? num(i.tokenBudget) : undefined, limit: num(i.limit, 50) }).filter((r: any) => ids.has(r.resource?.id ?? r.id));
    return { project: p.name, count: results.length, results, summary: s.summarizeProject(p.id) };
  },
  "viking.build_context": (i) => ({ context: viking().buildContext(str(i.query), num(i.tokenBudget, 4000)) }),
  "viking.webbuilder_audit": async (i) => {
    const s = viking();
    const start = new URL(str(i.url));
    const depth = str(i.depth, "quick");
    const maxPages = depth === "deep" ? 30 : depth === "full" ? 10 : 1;
    let p = [...s.projects.values()].find((x: any) => x.baseUrl === start.origin);
    if (!p) p = s.createProject(start.hostname, start.origin);
    const queue = [start.href], seen = new Set<string>(), crawled: any[] = [], errors: string[] = [];
    while (queue.length && crawled.length < maxPages) {
      const u = queue.shift()!;
      if (seen.has(u)) continue;
      seen.add(u);
      try {
        const page = i.html && u === start.href ? { html: str(i.html), status: 200, ms: 0, bytes: str(i.html).length, headers: {} } : await fetchPage(u);
        const a = analyseHtml(page.html, u);
        const path = new URL(u).pathname.replace(/^\/+/, "") || "index";
        s.addResource(p.id, path, "L2", "page", a.l0, a.l1, { rawContent: page.html.slice(0, 200000), networkTraces: [{ url: u, method: "GET", status: page.status, duration: page.ms, requestSize: 0, responseSize: page.bytes, timestamp: new Date().toISOString() }], cssRules: [], jsBehaviors: a.scripts, contentHash: String(page.html.length) });
        crawled.push({ url: u, status: page.status, title: a.title, links: a.links.length });
        for (const l of a.links) { try { const n = new URL(l, u); n.hash = ""; if (n.origin === start.origin && !seen.has(n.href)) queue.push(n.href); } catch { /* bad link */ } }
      } catch (e: any) { errors.push(`${u}: ${e.message}`); if (!crawled.length && queue.length === 0) throw new Error(`could not fetch ${u}: ${e.message}`); }
    }
    saveViking();
    const res = [...s.resources.values()].filter((r: any) => r.vikingUri.includes(`/${p.name}/`));
    const report = getWebBuilderAuditor().audit(start.href, res, s.l0Data, s.l1Data, s.l2Data);
    return { projectId: p.id, pagesCrawled: crawled.length, crawled, errors, report };
  },

  // harness
  "harness.car_config": (i) => {
    const prev = (harness() as any).state;
    const base: CARConfig = prev.config;
    const cfg: CARConfig = {
      ...base, id: `car-${str(i.name).toLowerCase().replace(/\W+/g, "-")}`, name: str(i.name), description: str(i.description, base.description),
      control: { ...base.control, ...(i.requireApproval ? { requireApproval: list(i.requireApproval) } : {}), ...(i.blockedActions ? { blockedActions: list(i.blockedActions) } : {}) },
      agency: { ...base.agency, defaultAutonomy: (str(i.autonomyLevel, base.agency.defaultAutonomy) as AutonomyLevel), ...(i.maxConcurrentAgents ? { maxConcurrentAgents: num(i.maxConcurrentAgents) } : {}) },
      runtime: { ...base.runtime, ...(i.tokenBudget ? { sessionTokenBudget: num(i.tokenBudget) } : {}), ...(i.costCap ? { sessionCostCap: num(i.costCap) } : {}) },
    };
    car = new CARFramework(cfg);
    (car as any).state.agents = prev.agents;
    (car as any).state.evaluationGates = prev.evaluationGates;
    saveCar();
    return { config: cfg, spendRails: (car as any).state.spendRails };
  },
  "harness.register_agent": (i) => {
    const h = harness();
    if (!h.canSpawnAgent()) throw new Error(`max concurrent agents (${(h as any).state.config.agency.maxConcurrentAgents}) reached`);
    const a = h.registerAgent(str(i.name), str(i.role), { autonomyLevel: i.autonomyLevel ? (str(i.autonomyLevel) as AutonomyLevel) : undefined, tokenBudget: i.tokenBudget ? num(i.tokenBudget) : undefined, allowedTools: i.allowedTools ? list(i.allowedTools) : undefined });
    saveCar();
    return { agent: a, agents: h.getAgents().length };
  },
  "harness.spend_check": (i) => {
    const h = harness(), resource = str(i.resource) as "tokens" | "cost" | "time" | "memory", amount = num(i.amount);
    const check = h.checkSpendRail(resource, amount);
    if (bool(i.record, true) && (check as any).allowed !== false) h.recordUsage(resource, amount);
    saveCar();
    return { ...check, recorded: bool(i.record, true) && (check as any).allowed !== false, spend: h.getSpendSummary() };
  },
  "harness.gate_evaluate": (i) => {
    const h = harness();
    for (const g of arr(i.gates)) h.addGate({ name: str(g.name), description: str(g.description), conditions: (g.conditions ?? []).map((c: any) => ({ id: str(c.id), description: str(c.description, c.id), type: c.type ?? "custom", threshold: num(c.threshold) })), onFail: g.onFail ?? "warn", maxRetries: num(g.maxRetries, 0), order: num(g.order, 99) });
    const ctxRaw = json<Record<string, unknown>>(i.context, {});
    const ctx = Object.fromEntries(Object.entries(ctxRaw).map(([k, v]) => [k, typeof v === "boolean" ? (v ? 100 : 0) : Number(v)]));
    const results = h.evaluateGates(ctx);
    saveCar();
    return { passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length, results: results.map((r) => ({ gate: r.gate.name, passed: r.passed, details: r.details, conditions: r.gate.conditions.map((c) => ({ id: c.id, threshold: c.threshold, current: c.current })) })) };
  },
  "harness.generate_agents_md": () => {
    const md = harness().generateAgentsMd();
    const files = writeArtefacts("harness", { "AGENTS.md": md });
    return { markdown: md, file: files[0] };
  },
  "harness.action_check": (i) => {
    const h = harness(), action = str(i.action);
    const r = h.checkActionAllowed(action);
    const tool = i.agentId ? { toolPermitted: h.checkToolPermission(str(i.agentId), action) } : {};
    return { action, ...r, ...tool };
  },

  // codegen
  "codegen.generate": async (i) => {
    const req = { language: lang(i.language), task: str(i.task), inputFormat: i.inputFormat ? str(i.inputFormat) : undefined, outputFormat: i.outputFormat ? str(i.outputFormat) : undefined, dependencies: i.dependencies ? list(i.dependencies) : undefined, errorHandling: i.errorHandling === undefined ? undefined : bool(i.errorHandling), comments: i.comments === undefined ? undefined : bool(i.comments) };
    const base = generateCode(req);
    if (!hasLlm() || bool(i.offline)) return { ...base, generator: "templates", note: hasLlm() ? undefined : "template skeleton only — configure a model (agent runtime does this automatically) for complete implementations" };
    // Ground the model on the verified API cards for this language, then check what it wrote.
    const cards = base.apisUsed.map((a) => a.card).concat(searchReferences({ language: req.language, search: req.task }).slice(0, 6).map((r) => getReferenceCard(r.id) ?? "")).filter(Boolean).slice(0, 8);
    const prof = getLanguageProfile(req.language);
    let code = "", attempts = 0, check: ReturnType<typeof nativeCheck> = null;
    let prompt = [`Write a complete, runnable ${prof.displayName ?? req.language} program for this task:`, req.task, req.inputFormat ? `Input: ${req.inputFormat}` : "", req.outputFormat ? `Output: ${req.outputFormat}` : "", req.dependencies?.length ? `Allowed dependencies: ${req.dependencies.join(", ")}` : "Prefer the standard library.", req.errorHandling === false ? "" : "Handle errors.", cards.length ? `Verified API reference:\n${cards.join("\n\n")}` : "", "Reply with only the code in one fenced block."].filter(Boolean).join("\n\n");
    while (attempts++ < 3) {
      const r = await callLlm({ system: "You are a precise senior engineer. Output compilable code only.", prompt, maxTokens: 4000, temperature: 0.2 });
      code = (/```[\w+-]*\n([\s\S]*?)```/.exec(r.text)?.[1] ?? r.text).trim();
      check = nativeCheck(req.language, code);
      if (!check || check.valid) break;
      prompt += `\n\nYour previous answer failed ${check.tool}:\n${check.errors.join("\n")}\nFix it and reply with the full corrected code.`;
    }
    return { ...base, code, generator: "llm", attempts, validation: validateSyntax({ language: req.language, code }), compiler: check ? { tool: check.tool, valid: check.valid, errors: check.errors } : "no local toolchain" };
  },
  "codegen.validate": (i) => {
    const language = lang(i.language), code = str(i.code);
    const rules = validateSyntax({ language, code });
    const native = nativeCheck(language, code);
    return { ...rules, valid: native ? native.valid && rules.errors.length === 0 : rules.valid, rulesValid: rules.valid, compiler: native?.tool ?? "rules-only", compilerErrors: native?.errors ?? [] };
  },
  "codegen.check": (i) => {
    const language = lang(i.language), code = str(i.code);
    const r = checkSyntax({ language, code });
    const native = nativeCheck(language, code);
    const issues = [...r.issues, ...(native?.errors ?? []).map((m) => ({ line: Number(/:(\d+):/.exec(m)?.[1] ?? /line (\d+)/.exec(m)?.[1] ?? 0), column: 0, severity: "error" as const, message: m }))];
    return { valid: r.valid && (native?.valid ?? true), checkedWith: native?.tool ?? "rules-only", issues };
  },
  "codegen.reference": (i) => {
    if (i.id) { const card = getReferenceCard(str(i.id)); if (!card) throw new Error(`no reference entry "${str(i.id)}"`); return { id: str(i.id), card }; }
    const results = searchReferences({ language: i.language ? lang(i.language) : undefined, search: i.search ? str(i.search) : undefined, category: i.category as any });
    return { count: results.length, results: results.slice(0, num(i.limit, 20)).map((r) => ({ id: r.id, name: r.name, signature: r.signature, import: r.import, returns: r.returns, whenToUse: r.whenToUse, example: r.example })) };
  },
  "codegen.profile": (i) => getLanguageProfile(lang(i.language)),
  "codegen.starter": (i) => generateStarter(lang(i.language), str(i.task)),
  "codegen.overview": (i) => (i.language ? { language: lang(i.language), overview: getLanguageOverview(lang(i.language)), quickRef: getApiQuickRef(lang(i.language)) } : { languages: LANGS, quickRef: getApiQuickRef() }),
  "codegen.pattern": (i) => {
    const patterns = LANGUAGE_REFERENCES.filter((r) => r.id.startsWith("pattern."));
    if (!i.pattern) return { patterns: patterns.map((p) => ({ id: p.id.slice(8), name: p.name, signature: p.signature })) };
    const key = str(i.pattern).replace(/^pattern\./, "").toLowerCase().replace(/[\s-]+/g, "_");
    const p = patterns.find((x) => x.id === `pattern.${key}`) ?? patterns.find((x) => x.id.includes(key) || x.name.toLowerCase().includes(key.replace(/_/g, " ")));
    if (!p) throw new Error(`unknown pattern "${str(i.pattern)}" (${patterns.map((x) => x.id.slice(8)).join(", ")})`);
    let example = p.example;
    if (i.language) {
      const l = lang(i.language), label = { python: "Python", javascript: "JavaScript|Node", typescript: "TypeScript", java: "Java", cpp: "C\\+\\+", c: "C\\b", rust: "Rust" }[l];
      const sections = p.example.split(/\n(?=(?:#|\/\/)\s*\w)/);
      const hit = sections.find((s) => new RegExp(`^(?:#|//)\\s*(?:${label})`, "i").test(s.trim()));
      example = hit ?? p.example;
    }
    return { id: p.id.slice(8), name: p.name, description: p.whenToUse, code: example, gotchas: p.gotchas };
  },
  "codegen.stats": () => ({ ...getCodeGenStats(), references: getReferenceStats() }),

  // server
  "server.hardware-detect": (i) => {
    const action = str(i.action, "detect-local");
    if (action === "generate-probe") return { script: generateSSHProbeScript(), usage: "ssh user@server 'bash -s' < probe.sh > probe.txt, then call action=parse-probe with probeOutput" };
    if (action === "parse-probe") { const p = parseProbeOutput(str(i.probeOutput)); return { profile: p }; }
    const hw = localHardware();
    return { profile: hw, buildTarget: hw.cpu.buildTarget, recommendedModelRAMGB: Math.max(0, Math.round((hw.memory.totalGB - 2) * 10) / 10) };
  },
  "server.legacy-hardware-db": (i) => {
    const action = str(i.action, "list-all");
    const view = (s: ServerModel) => ({ ...s, buildTarget: getServerBuildTarget(s), modelRAMGB: estimateModelRAM(s), cpu: CPU_DATABASE[s.cpus[s.cpus.length - 1]] });
    if (action === "query") { const r = queryServers({ maxYear: i.maxYear ? num(i.maxYear) : undefined, minRAMGB: i.minRAMGB ? num(i.minRAMGB) : undefined, manufacturer: i.manufacturer ? str(i.manufacturer) : undefined }); return { count: r.length, servers: r.map(view) }; }
    if (action === "best-rag") return { servers: getBestRAGServers().slice(0, num(i.limit, 10)) };
    if (action === "report") return getLegacyReport();
    return { count: SERVER_DATABASE.length, servers: SERVER_DATABASE.map((s) => ({ name: `${s.manufacturer} ${s.name}`, year: s.year, maxRAMGB: s.maxRAMGB, ragViability: s.ragViability, buildTarget: getServerBuildTarget(s) })) };
  },
  "server.build-optimizer": (i) => {
    const action = str(i.action, "build-plan");
    const { label, plan, target } = planFor(i.serverModel);
    if (action === "build-config") {
      const isLocal = !("manufacturer" in target);
      const cfg = isLocal ? generateBuildConfig((target as HardwareProfile).cpu.buildTarget, (target as HardwareProfile).cpu, (target as HardwareProfile).memory) : plan.buildConfig;
      const files = writeArtefacts(`llama-build/${label.replace(/\W+/g, "-")}`, { "build.sh": ["#!/usr/bin/env bash", "set -euo pipefail", ...cfg.buildCommands, "", `# run: ${cfg.runCommand}`, `# rag server: ${cfg.ragServerCommand}`].join("\n") });
      return { target: label, config: cfg, files };
    }
    if (action === "model-recommendations") return { target: label, buildTarget: plan.buildTarget, models: plan.models.length ? plan.models : getModelRecommendations(plan.buildTarget, num(i.ramGB, 8), plan.buildConfig.estimatedTPS) };
    return { target: label, plan };
  },
  "server.rag-deploy": (i) => {
    const action = str(i.action, "full-plan");
    const { label, plan, target } = planFor(i.serverModel);
    const dep = generateDeploymentPlan(target, plan);
    if (action === "summary") return { target: label, summary: getDeploymentSummary(dep) };
    if (action === "performance-estimate") return { target: label, performance: dep.expectations };
    const script = dep.deploymentScript;
    const files = writeArtefacts(`rag/${label.replace(/\W+/g, "-")}`, { "deploy.sh": script, "plan.json": JSON.stringify(dep, null, 2) });
    if (action === "deployment-script") return { target: label, script, files };
    return { target: label, plan: dep, files };
  },
});
