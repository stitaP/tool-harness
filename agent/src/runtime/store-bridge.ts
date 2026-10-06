/**
 * Bridge to the stitaP Tool Store (src/lib/store, 367 tools, all with
 * executors). The store code is pre-bundled for Node by `npm run build:store`
 * into store/store.mjs. On load the bridge installs host hooks so store tools
 * use the agent's secrets (~/.stitap/.env), its configured model (text and
 * vision) and its memory/skills/kanban, and it gates side-effecting tools
 * (sending messages, payments, refunds, shell, power, schema changes…)
 * behind the same approval flow as the terminal.
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resourcePath } from "../util/resources.js";
import { log } from "../util/log.js";
import { dangerReason } from "../safety/dangerous.js";
import { buildProvider } from "../providers/index.js";
import type { ToolContext } from "../tools/types.js";
import type { Runtime } from "./runtime.js";

type Args = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const WRITE_SQL = /^\s*(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|merge)\b/i;

/** Returns a reason when a store call needs human approval, else null. */
export function storeApprovalReason(id: string, a: Args): string | null {
  const cmd = s(a.command);
  switch (id) {
    case "os.execute": case "agent.terminal": return cmd ? dangerReason(cmd) : null;
    case "env.run": return dangerReason(s(a.code)) ? "code contains a dangerous shell pattern" : null;
    case "sandbox.exec": return null; // isolated
    case "os.power": return ["sleep", "lock"].includes(s(a.action).toLowerCase()) ? `puts this computer to ${s(a.action)}` : null;
    case "os.file.write": return /\.(env|npmrc|pypirc|netrc)$|[\\/]\.(bashrc|zshrc|profile)$|authorized_keys/.test(s(a.path)) ? "writes a sensitive file" : null;
    case "email.send": return `sends email to ${[].concat(a.to as any).join(", ")}`;
    case "sms.send": return `sends an SMS to ${s(a.to)}`;
    case "voice.call": return a.to ? `places a phone call to ${s(a.to)}` : null;
    case "payment.create_checkout": return `creates a ${s(a.provider)} checkout for ${s(a.amount)} ${s(a.currency)}`;
    case "payment.subscription": return ["create", "update", "cancel"].includes(s(a.action)) ? `${s(a.action)}s a subscription` : null;
    case "database.migrate": return a.dryRun ? null : "changes the database schema";
    case "database.query": return WRITE_SQL.test(s(a.query)) ? "modifies data in the database" : null;
    case "storage.upload": return s(a.provider).toLowerCase() === "local" ? null : `uploads to ${s(a.provider)} bucket ${s(a.bucket)}`;
    case "storage.share": return s(a.provider).toLowerCase() === "local" ? null : "creates a shareable link";
    case "ecom.process_refund": return `refunds order ${s(a.orderId)}`;
    case "ecom.cancel_order": return `cancels order ${s(a.orderId)}`;
    case "ecom.auto_reply": return s(a.action) === "refund" ? "issues a refund while replying" : null;
    case "ecom.adjust_price": return `changes the price of ${s(a.productId)} to ${s(a.newPrice)}`;
    case "ecom.bulk_process_tickets": return "replies to customer tickets in bulk";
    case "fin.whatsapp.send_receipt": case "fin.whatsapp.send_reminder": return "sends a WhatsApp message to a customer";
    case "fin.whatsapp.batch_reminders": return "sends WhatsApp reminders in bulk";
    case "huggingface.delete": return `deletes model file ${s(a.filename)}`;
    default: return null;
  }
}

interface StoreTool { id: string; name: string; category: string; description: string; tags: string[]; executable: boolean; parameters: { name: string; type: string; description: string; required: boolean; enum?: string[] }[] }

/**
 * Names used in AGENTS.md / CAR-framework docs → the Tool Store ids that implement them. An array means the name covers
 * several tools (the caller is told to pick one). Keeps documented names working even though the store uses dotted ids.
 */
export const STORE_ALIASES: Record<string, string | string[]> = {
  browser_use: "browser.navigate", dom_inspect: "browser.extract", screenshot: "browser.screenshot", network_intercept: "browser.network",
  viking_store: "viking.index_resource", viking_index: "viking.index_resource", viking_query: "viking.query",
  agent_memory: "agent.memory", memory_store: "agent.memory", memory_query: "agent.memory", memory_decay: "agent.memory",
  webbuilder_audit: "viking.webbuilder_audit", standards_check: "standards.audit", performance_measure: "browser.performance",
  knowledge_base: "knowledge.search",
  harness_check: "harness.action_check", spend_verify: "harness.spend_check", gate_evaluate: "harness.gate_evaluate",
  diagram_design: ["diagram.architecture", "diagram.user_journey", "diagram.component_tree", "diagram.data_flow", "diagram.er_diagram", "diagram.route_map", "diagram.state_machine"],
  diagram_generate: ["diagram.architecture", "diagram.user_journey", "diagram.component_tree", "diagram.data_flow", "diagram.er_diagram", "diagram.route_map", "diagram.state_machine"],
};

export class StoreBridge {
  private mod: any = null;
  private tools: StoreTool[] = [];
  private loading: Promise<void> | null = null;
  error: string | null = null;

  constructor(private enabled: () => boolean, private customPath: () => string, private rt?: Runtime) {}

  /** Install the agent's secrets, model and capabilities into the store. */
  private installHooks(): void {
    const rt = this.rt, m = this.mod;
    if (!rt || !m) return;
    m.setSecretResolver?.((name: string) => rt.cfg.secret(name) ?? process.env[name]);
    m.setLlmCaller?.(async (req: any) => {
      const vm = (rt.cfg.data as any).vision_model;
      const prov = req.images?.length && vm ? buildProvider({ ...rt.cfg.data.model, ...vm, tool_mode: "native" }, rt.cfg) : rt.aux();
      const msgs = req.messages?.length ? req.messages : [{ role: "user", content: req.prompt ?? "" }];
      const messages: any[] = [...(req.system ? [{ role: "system", content: req.system + (req.json ? "\n\nReply with JSON only." : "") }] : []), ...msgs.map((x: any, k: number) => ({ role: x.role, content: x.content, ...(k === msgs.length - 1 && req.images?.length ? { meta: { images: req.images.map((i: string) => (i.startsWith("data:") ? i : `data:image/png;base64,${i}`)) } } : {}) }))];
      const r = await prov.chat({ messages, maxTokens: req.maxTokens, temperature: req.temperature, json: req.json });
      return { text: r.content, model: r.model, provider: prov.id, usage: r.usage };
    });
    m.setAgentHost?.({
      memory: async (a: Args) => {
        const act = s(a.action);
        const target = s(a.type) === "user" ? "user" : "memory";
        if (act === "add") return { result: rt.memory.add(target as any, s(a.key) ? `${s(a.key)}: ${s(a.content)}` : s(a.content)) };
        if (act === "remove") return { result: rt.memory.remove(target as any, s(a.key || a.search)) };
        if (act === "to-prompt" || act === "stats" || act === "summarise") return { snapshot: rt.memory.snapshot() };
        const q = s(a.search || a.key).toLowerCase();
        const hits = (["memory", "user"] as const).flatMap((t) => rt.memory.entries(t).map((e) => ({ target: t, entry: e }))).filter((e) => !q || e.entry.toLowerCase().includes(q));
        return { count: hits.length, results: hits.slice(0, Number(a.limit) || 20) };
      },
      skills: async (a: Args) => {
        const act = s(a.action);
        if (act === "list") return { skills: rt.skills.list().map((x: any) => ({ name: x.name, description: x.description, category: x.category })) };
        if (act === "get") return { skill: rt.skills.view(s(a.skillId || a.name)) };
        if (act === "search") { const q = s(a.search || a.name).toLowerCase(); return { results: rt.skills.list().filter((x: any) => `${x.name} ${x.description}`.toLowerCase().includes(q)).map((x: any) => ({ name: x.name, description: x.description })) }; }
        if (act === "create" || act === "extract") { const steps = Array.isArray(a.steps) ? a.steps : s(a.steps).split(/\n|,(?=\s*\D)/).filter(Boolean); const body = `# ${s(a.name)}\n\n${s(a.description)}\n\n## Steps\n${steps.map((x: any, k: number) => `${k + 1}. ${typeof x === "string" ? x.trim() : x.action}`).join("\n")}\n`; const info = rt.skills.create(s(a.name).toLowerCase().replace(/[^a-z0-9]+/g, "-"), s(a.description), body, s(a.category) || "learned"); return { created: info }; }
        if (act === "delete") { rt.skills.delete(s(a.skillId || a.name)); return { deleted: true }; }
        return { skills: rt.skills.list().length };
      },
      kanban: async (a: Args) => {
        const act = s(a.action), k = rt.kanban;
        const P: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
        const ST: Record<string, string> = { todo: "backlog", ready: "ready", "in-progress": "running", review: "review", done: "done", blocked: "blocked", cancelled: "done" };
        if (act === "add-task") return k.create({ title: s(a.title), body: s(a.description), priority: P[s(a.priority)] ?? 1, depends_on: a.dependsOn ? s(a.dependsOn).split(",").map((x) => x.trim()) : [] });
        if (act === "move-task") return k.update(s(a.taskId), { status: (ST[s(a.status)] ?? s(a.status)) as any });
        if (act === "add-comment") return k.comment(s(a.taskId), s(a.comment), s(a.author) || "agent");
        if (act === "get-ready") return { tasks: k.ready() };
        if (act === "fan-out") { const subs = typeof a.subtasks === "string" ? (() => { try { return JSON.parse(a.subtasks as string); } catch { return s(a.subtasks).split(","); } })() : a.subtasks; return { subtasks: (subs as any[]).map((t) => k.create({ title: typeof t === "string" ? t.trim() : t.title, body: typeof t === "string" ? "" : t.description ?? "", depends_on: [] })) }; }
        return { cards: k.list() };
      },
    });
  }

  private defaultPath(): string { return resourcePath("store", "store.mjs"); }

  async load(): Promise<void> {
    if (this.mod || !this.enabled()) return;
    this.loading ??= (async () => {
      const embedded = (globalThis as any).__stitapStore;
      const p = this.customPath() || this.defaultPath();
      if (!embedded && !existsSync(p)) { this.error = `store bundle not found at ${p} (run: npm run build:store)`; return; }
      try {
        this.mod = embedded ?? await import(pathToFileURL(p).href);
        this.tools = this.mod.listTools();
        this.installHooks();
      } catch (e: any) {
        this.error = `failed to load store bundle: ${e.message}`;
        log.warn(this.error);
      }
    })();
    await this.loading;
  }

  get count() { return { total: this.tools.length, executable: this.tools.filter((t) => t.executable).length }; }

  async search(query: string, n: number): Promise<{ id: string; category: string; description: string; params: string }[]> {
    await this.load();
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
    if (!words.length) return [];
    return this.tools.filter((t) => t.executable).map((t) => {
      const hay = `${t.id} ${t.name} ${t.category} ${t.description} ${t.tags.join(" ")}`.toLowerCase();
      let s = 0;
      for (const w of words) { if (t.id.toLowerCase().includes(w)) s += 4; if (hay.includes(w)) s += 1; }
      return { t, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(({ t }) => ({
      id: t.id, category: t.category, description: t.description,
      params: t.parameters.map((p) => `${p.name}${p.required ? "" : "?"}:${p.type}${p.enum ? `(${p.enum.join("|")})` : ""}`).join(", ") || "(none)",
    }));
  }

  list(): StoreTool[] { return this.tools; }

  async call(id: string, args: Record<string, unknown>, ctx?: Pick<ToolContext, "requestApproval">): Promise<string> {
    await this.load();
    if (!this.mod) return `store unavailable: ${this.error ?? "disabled"}`;
    const alias = STORE_ALIASES[id];
    if (Array.isArray(alias)) return `"${id}" covers several store tools — call the one that fits: ${alias.map((x) => `store:${x}`).join(", ")}`;
    if (alias) id = alias;
    const t = this.tools.find((x) => x.id === id);
    if (!t) return `unknown store tool "${id}" — use tool_search`;
    if (!t.executable) return `store tool "${id}" is catalog-only (no executor in this build)`;
    const why = storeApprovalReason(id, args ?? {});
    if (why) {
      if (!ctx) return `BLOCKED: store:${id} ${why} and needs approval, which is unavailable in this context`;
      const ok = await ctx.requestApproval({ tool: `store:${id}`, command: `${id} ${JSON.stringify(args ?? {}).slice(0, 300)}`, reason: why });
      if (!ok) return `BLOCKED: store:${id} was not approved (${why}). Do not retry; choose another approach or ask the user.`;
    }
    const r = await this.mod.executeTool(id, args ?? {});
    if (!r?.success) return `error: ${r?.error ?? "tool failed"}`;
    const data = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
    return data ?? "ok";
  }

  /** Close store-owned browsers (called on shutdown). */
  async close(): Promise<void> { await this.mod?.closeStoreBrowsers?.().catch(() => undefined); }

}
