/**
 * Skills: procedural memory as SKILL.md folders (agentskills.io-compatible
 * frontmatter: name, description, plus optional version/tags/platforms).
 * Progressive disclosure: the system prompt lists names + descriptions; the
 * agent loads a full skill with skill_view only when it needs it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parseYaml, stringifyYaml } from "../util/yaml.js";

export interface SkillInfo { name: string; description: string; category: string; path: string; dir: string; source: "user" | "bundled" | "external"; meta: Record<string, any> }

export function parseFrontmatter(text: string): { meta: Record<string, any>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  try { return { meta: parseYaml(m[1]) ?? {}, body: m[2] }; } catch { return { meta: {}, body: m[2] }; }
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class SkillStore {
  private cache: SkillInfo[] | null = null;
  constructor(private userDir: string, private bundledDir: string, private externalDirs: () => string[]) {}

  invalidate() { this.cache = null; }

  private scan(dir: string, source: SkillInfo["source"], out: SkillInfo[]) {
    if (!existsSync(dir)) return;
    const visit = (d: string, depth: number) => {
      if (depth > 3) return;
      const skillFile = join(d, "SKILL.md");
      if (existsSync(skillFile)) {
        const { meta } = parseFrontmatter(readFileSync(skillFile, "utf8"));
        const name = String(meta.name ?? basename(d));
        const rel = relative(dir, d).split(/[\\/]/);
        out.push({ name, description: String(meta.description ?? "").trim(), category: rel.length > 1 ? rel[0] : "general", path: skillFile, dir: d, source, meta });
        return;
      }
      let entries: any[] = [];
      try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) if (e.isDirectory() && !e.name.startsWith(".")) visit(join(d, e.name), depth + 1);
    };
    visit(dir, 0);
  }

  list(): SkillInfo[] {
    if (this.cache) return this.cache;
    const out: SkillInfo[] = [];
    this.scan(this.userDir, "user", out);
    for (const d of this.externalDirs()) this.scan(resolve(d), "external", out);
    this.scan(this.bundledDir, "bundled", out);
    // user skills shadow bundled ones with the same name
    const seen = new Set<string>();
    this.cache = out.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true))).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return this.cache;
  }

  get(name: string): SkillInfo | undefined {
    const n = name.trim().toLowerCase();
    return this.list().find((s) => s.name.toLowerCase() === n);
  }

  index(maxChars = 4000): string {
    const lines: string[] = [];
    let cat = "";
    for (const s of this.list()) {
      if (s.category !== cat) { cat = s.category; lines.push(`${cat}:`); }
      lines.push(`  - ${s.name}: ${s.description.split("\n")[0].slice(0, 160)}`);
    }
    const t = lines.join("\n");
    return t.length > maxChars ? t.slice(0, maxChars) + "\n  … (use skills_list for the rest)" : t;
  }

  view(name: string, file?: string): string {
    const s = this.get(name);
    if (!s) throw new Error(`no skill named "${name}". Use skills_list.`);
    if (file) {
      const p = resolve(s.dir, file);
      if (!p.startsWith(resolve(s.dir))) throw new Error("file must be inside the skill directory");
      if (!existsSync(p)) throw new Error(`no file ${file} in skill ${name}`);
      return readFileSync(p, "utf8");
    }
    const others: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p); else if (e.name !== "SKILL.md") others.push(relative(s.dir, p));
      }
    };
    walk(s.dir);
    return readFileSync(s.path, "utf8") + (others.length ? `\n\n[Supporting files — load with skill_view(name, file): ${others.join(", ")}]` : "");
  }

  create(name: string, description: string, body: string, category = "learned", extra: Record<string, any> = {}, overwrite = false): SkillInfo {
    if (!NAME_RE.test(name)) throw new Error("skill name must be lowercase letters, digits and dashes (max 64)");
    if (!description.trim()) throw new Error("description is required (it decides when the skill is used)");
    const existing = this.get(name);
    if (existing && existing.source === "user" && !overwrite) throw new Error(`skill "${name}" already exists — use action=patch or edit`);
    const dir = existing && existing.source === "user" ? dirname(existing.path) : join(this.userDir, category.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "learned", name);
    mkdirSync(dir, { recursive: true });
    const meta = { name, description: description.trim(), version: "1.0.0", ...extra };
    writeFileSync(join(dir, "SKILL.md"), `---\n${stringifyYaml(meta)}\n---\n\n${body.trim()}\n`);
    this.invalidate();
    return this.get(name)!;
  }

  write(name: string, content: string): void {
    const s = this.get(name);
    if (!s) throw new Error(`no skill named "${name}"`);
    const target = this.ensureUserCopy(s);
    writeFileSync(target.path, content);
    this.invalidate();
  }

  writeFile(name: string, file: string, content: string): void {
    const s = this.ensureUserCopy(this.get(name) ?? (() => { throw new Error(`no skill named "${name}"`); })());
    const p = resolve(s.dir, file);
    if (!p.startsWith(resolve(s.dir))) throw new Error("file must be inside the skill directory");
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }

  /** Editing a bundled skill copies it into the user dir first (bundled files stay pristine). */
  private ensureUserCopy(s: SkillInfo): SkillInfo {
    if (s.source === "user") return s;
    const dir = join(this.userDir, s.category, s.name);
    mkdirSync(dir, { recursive: true });
    const copy = (from: string, to: string) => {
      for (const e of readdirSync(from, { withFileTypes: true })) {
        const a = join(from, e.name), b = join(to, e.name);
        if (e.isDirectory()) { mkdirSync(b, { recursive: true }); copy(a, b); } else writeFileSync(b, readFileSync(a));
      }
    };
    copy(s.dir, dir);
    this.invalidate();
    return this.get(s.name)!;
  }

  delete(name: string): void {
    const s = this.get(name);
    if (!s) throw new Error(`no skill named "${name}"`);
    if (s.source !== "user") throw new Error("only user-created skills can be deleted");
    const trash = join(this.userDir, ".trash");
    mkdirSync(trash, { recursive: true });
    renameSync(s.dir, join(trash, `${s.name}-${Date.now()}`));
    this.invalidate();
  }

  mtime(): number {
    let t = 0;
    for (const s of this.list()) { try { t = Math.max(t, statSync(s.path).mtimeMs); } catch { /* ignore */ } }
    return t;
  }
}
