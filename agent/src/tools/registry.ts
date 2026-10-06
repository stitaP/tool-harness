import type { Runtime } from "../runtime/runtime.js";
import type { ToolSchema } from "../providers/types.js";
import { editDistance } from "../util/misc.js";
import type { Tier, Tool } from "./types.js";

const TIER_RANK: Record<Tier, number> = { slm: 0, standard: 1, full: 2 };

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(t: Tool): void { this.tools.set(t.name, t); }
  unregister(name: string): void { this.tools.delete(name); }
  unregisterWhere(pred: (t: Tool) => boolean): void { for (const t of [...this.tools.values()]) if (pred(t)) this.tools.delete(t.name); }
  get(name: string): Tool | undefined { return this.tools.get(name); }
  all(): Tool[] { return [...this.tools.values()]; }

  isAvailable(t: Tool, rt: Runtime): boolean {
    if (rt.cfg.data.tools.disabled.includes(t.name)) return false;
    if (rt.cfg.policy?.disable_tools?.includes(t.name)) return false;
    try { return t.available ? t.available(rt) === true : true; } catch { return false; }
  }

  /** Tools sent in the model schema for a session. Stable for the session's life. */
  active(rt: Runtime, opts: { profile?: string; allowed?: Set<string> } = {}): Tool[] {
    const profile = (opts.profile ?? rt.cfg.data.agent.tool_profile) as Tier;
    const rank = TIER_RANK[profile] ?? 1;
    const deferredCfg = new Set(rt.cfg.data.tools.deferred ?? []);
    // tools.enabled: names or toolsets ("browser", "desktop") always offered, whatever the profile
    const forced = new Set((rt.cfg.data.tools as any).enabled ?? []);
    return this.all().filter((t) => {
      if (opts.allowed && !opts.allowed.has(t.name)) return false;
      if (t.deferred || deferredCfg.has(t.name)) return false;
      if (TIER_RANK[t.tier ?? "standard"] > rank && !forced.has(t.name) && !forced.has(t.toolset)) return false;
      return this.isAvailable(t, rt);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Tools reachable via tool_search / use_tool (everything available but not active). */
  discoverable(rt: Runtime, active: Tool[]): Tool[] {
    const act = new Set(active.map((t) => t.name));
    return this.all().filter((t) => !act.has(t.name) && this.isAvailable(t, rt));
  }

  schemas(tools: Tool[]): ToolSchema[] {
    return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }

  /** Repair a hallucinated / misspelled tool name. */
  resolveName(name: string, candidates: Tool[]): Tool | undefined {
    const exact = candidates.find((t) => t.name === name);
    if (exact) return exact;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const n = norm(name);
    const byNorm = candidates.find((t) => norm(t.name) === n);
    if (byNorm) return byNorm;
    let best: Tool | undefined, bestD = Infinity;
    for (const t of candidates) {
      const d = editDistance(n, norm(t.name));
      if (d < bestD) { bestD = d; best = t; }
    }
    return best && bestD <= Math.max(2, Math.floor(n.length / 5)) ? best : undefined;
  }

  search(query: string, pool: Tool[], limit = 10): Tool[] {
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
    const scored = pool.map((t) => {
      const hay = `${t.name} ${t.toolset} ${t.description}`.toLowerCase();
      let s = 0;
      for (const w of words) {
        if (t.name.toLowerCase().includes(w)) s += 5;
        if (t.toolset.toLowerCase().includes(w)) s += 2;
        if (hay.includes(w)) s += 1;
      }
      return { t, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    return scored.slice(0, limit).map((x) => x.t);
  }
}
