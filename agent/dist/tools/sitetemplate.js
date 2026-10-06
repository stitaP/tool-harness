/**
 * site_template: ready-made sites from a catalog of open-source projects (templates/catalog.json).
 * Each entry is an upstream project pinned to an exact version plus our patch, so a small model fills in a
 * config instead of writing a site. Only permissive licenses are catalogued; the upstream LICENSE stays in
 * every generated project and TEMPLATE-NOTICE.md records where it came from.
 */
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { obj, str, int, bool, enm } from "./types.js";
export const TEMPLATES_DIR = fileURLToPath(new URL("../../templates/", import.meta.url));
export function loadCatalog(dir = TEMPLATES_DIR) {
    return JSON.parse(readFileSync(join(dir, "catalog.json"), "utf8")).templates;
}
/** {name}-style placeholders; unknown ones become empty. */
export function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
/** Set KEY=value lines in a .env text (replace existing keys, append new ones). */
export function mergeEnv(text, values) {
    const body = text.replace(/\n+$/, "");
    const lines = body ? body.split("\n") : [];
    for (const [k, v] of Object.entries(values)) {
        const line = `${k}=${/[\s#"']/.test(v) ? JSON.stringify(v) : v}`;
        const i = lines.findIndex((l) => new RegExp(`^\\s*${k}\\s*=`).test(l));
        if (i >= 0)
            lines[i] = line;
        else
            lines.push(line);
    }
    return lines.join("\n").replace(/\n*$/, "\n");
}
const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
async function sh(ctx, cmd, cwd, timeoutS = 900) {
    const r = await ctx.rt.terminal.exec(cmd, { cwd, timeoutMs: timeoutS * 1000, signal: ctx.signal });
    if (r.interrupted)
        throw new Error("interrupted");
    if (r.timedOut || r.exitCode !== 0)
        throw new Error(`\`${cmd.slice(0, 120)}\` failed${r.timedOut ? " (timed out)" : ` (exit ${r.exitCode})`}: ${r.output.trim().slice(-800)}`);
    return r.output;
}
function describe(t) {
    return `${t.id} — ${t.title}\n  ${t.framework}, ${t.license}, ${t.status === "adapted" ? "adapted and tested" : "upstream as shipped"}; source: ${t.upstream}` +
        (t.backend ? `\n  backend: ${t.backend}` : "") + (t.provides?.length ? `\n  provides: ${t.provides.join("; ")}` : "") + (t.notes ? `\n  notes: ${t.notes}` : "");
}
export const siteTemplateTool = {
    name: "site_template", toolset: "files", tier: "slm", deferred: true,
    description: "Create a ready-made website from open-source templates instead of writing one: e-commerce (Next.js+Payload CMS, or Nuxt storefront on it), company website, docs portal, landing/SaaS, admin dashboard, chat, streaming, IoT, EV chargers, lending/core banking (Fineract), remote desktop. " +
        "action=list (optionally category/framework), info (id), create (id, name; site_name, company, port, backend_url/admin_email/admin_password for front-ends; install=true to npm install).",
    parameters: obj({
        action: enm(["list", "info", "create"], "list, info or create"),
        id: str("template id (from list)"),
        category: str("list: filter, e.g. ecommerce, docs, website, dashboard, finance, iot, streaming"),
        framework: str("list: filter, e.g. next, nuxt"),
        name: str("create: project folder name (lowercase, dashes)"),
        dir: str("create: parent folder (default: working folder)"),
        site_name: str("create: site / brand name"),
        company: str("create: company name"),
        description: str("create: one-line site description"),
        brand_color: str("create: primary colour (Tailwind colour name for Nuxt UI templates, e.g. green, emerald, blue)"),
        port: int("create: dev server port"),
        backend_url: str("create (front-ends): URL of the backend, e.g. http://localhost:3000"),
        admin_email: str("create (front-ends): backend admin email"),
        admin_password: str("create (front-ends): backend admin password"),
        install: bool("create: also install dependencies (downloads several hundred MB)"),
    }, ["action"]),
    async handler(a, ctx) {
        const all = loadCatalog();
        if (a.action === "list") {
            const rows = all.filter((t) => (!a.category || t.category === a.category) && (!a.framework || t.framework === a.framework));
            return rows.length ? rows.map(describe).join("\n") : `No templates match. Categories: ${[...new Set(all.map((t) => t.category))].join(", ")}`;
        }
        const t = all.find((x) => x.id === a.id);
        if (!t)
            return `error: unknown template "${a.id}". Templates: ${all.map((x) => x.id).join(", ")}`;
        if (a.action === "info")
            return describe(t) + (t.after_create?.length ? `\n  after create: ${t.after_create.join(" ")}` : "");
        const name = String(a.name ?? t.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || t.id;
        const parent = resolve(ctx.cwd, a.dir ?? ".");
        const target = join(parent, name);
        if (existsSync(target) && readdirSync(target).length)
            return `error: ${target} already exists and is not empty`;
        const ok = await ctx.requestApproval({ tool: "site_template", command: `create ${t.id} in ${target}`, reason: `download ${t.upstream} (${t.license})${a.install ? " and install its dependencies" : ""}` });
        if (!ok)
            return "BLOCKED: not approved.";
        const vars = { name, site_name: a.site_name ?? name, company: a.company ?? a.site_name ?? name, port: a.port ?? t.port, backend_url: a.backend_url ?? (t.defaults?.backend_url ? undefined : "http://localhost:3000"), admin_email: a.admin_email ?? "", admin_password: a.admin_password ?? "" };
        for (const [k, v] of Object.entries(t.defaults ?? {}))
            vars[k] ??= fill(v, vars);
        if (a.description)
            vars.description = a.description;
        if (a.brand_color)
            vars.brand_color = a.brand_color;
        const steps = [];
        if (t.source.type === "git") {
            await sh(ctx, `git init -q ${q(target)} && git -C ${q(target)} fetch -q --depth 1 ${q(t.source.repo)} ${t.source.commit} && git -C ${q(target)} checkout -q FETCH_HEAD`, parent, 600);
            steps.push(`fetched ${t.source.repo} at ${t.source.commit.slice(0, 12)}`);
        }
        else {
            await sh(ctx, `CI=1 ${fill(t.source.command, vars)} < /dev/null`, parent, 900);
            steps.push(`generated with ${fill(t.source.command, vars).split(" -n ")[0].replace(/^npx -y /, "")}`);
        }
        if (t.patch) {
            await sh(ctx, `git apply --whitespace=nowarn ${q(join(TEMPLATES_DIR, t.patch))}`, target, 120);
            steps.push(`applied ${t.patch}`);
        }
        for (const r of t.remove ?? [])
            rmSync(join(target, r), { recursive: true, force: true });
        const missed = [];
        for (const r of t.replace ?? []) {
            const f = join(target, r.file);
            const text = existsSync(f) ? readFileSync(f, "utf8") : "";
            if (!text.includes(r.find)) {
                missed.push(r.file);
                continue;
            }
            // inside JS/TS string literals a name like "Prasu's Store" needs its quote escaped
            const js = /\.(m?[jt]s|cjs)$/.test(r.file);
            const safe = js ? Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")])) : vars;
            writeFileSync(f, text.split(r.find).join(fill(r.with, safe)));
        }
        if (t.replace?.length)
            steps.push(`applied brand settings${missed.length ? ` (not found in: ${[...new Set(missed)].join(", ")})` : ""}`);
        rmSync(join(target, ".git"), { recursive: true, force: true }); // the project is yours: no upstream history
        if (t.env) {
            const envFile = join(target, ".env");
            const base = existsSync(envFile) ? readFileSync(envFile, "utf8") : existsSync(join(target, ".env.example")) ? readFileSync(join(target, ".env.example"), "utf8") : "";
            const values = Object.fromEntries(Object.entries(t.env).map(([k, v]) => [k, fill(v, vars)]).filter(([, v]) => v !== ""));
            writeFileSync(envFile, mergeEnv(base, values));
            try {
                chmodSync(envFile, 0o600);
            }
            catch { /* Windows */ } // secrets inside; `mode` applies only to new files
            steps.push(`wrote .env (${Object.keys(values).join(", ")})`);
        }
        writeFileSync(join(target, "TEMPLATE-NOTICE.md"), `# Template origin\n\nCreated from **${t.title}** (template \`${t.id}\`).\n\n- Upstream: ${t.upstream}\n` +
            `- Version: ${t.source.type === "git" ? `commit ${t.source.commit}` : t.source.command.split(" ").find((w) => /@\d/.test(w)) ?? "pinned generator"}\n- License: ${t.license} — keep the upstream license file and its copyright notice.\n` +
            (t.patch ? `- Changes: ${t.patch} from the stitaP template library.\n` : ""));
        if (a.install && t.install) {
            await sh(ctx, t.install, target, 1800);
            steps.push(`installed dependencies (${t.install})`);
        }
        const run = t.dev ? fill(t.dev, vars) : "see README.md";
        return `Created ${target} from ${t.id} (${t.license}).\n- ${steps.join("\n- ")}\n` +
            `Next: cd ${name} && ${a.install || !t.install ? "" : `${t.install} && `}${run}${t.port || a.port ? `  (http://localhost:${vars.port})` : ""}` +
            (t.backend ? (t.defaults?.backend_url ? `\nBackend: ${t.backend} (until you have one, it uses ${vars.backend_url ?? t.defaults.backend_url}).` : `\nBackend: create and start ${t.backend} first.`) : "") + (t.after_create?.length ? `\n${t.after_create.map((s) => `- ${s}`).join("\n")}` : "");
    },
};
