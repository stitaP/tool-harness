/**
 * strapi_cms: drive a Strapi (headless CMS, Community Edition, MIT) project.
 *  - types / create_type: content types as Strapi's own files (schema.json + core controller/route/service);
 *    `strapi develop` picks them up and serves REST at /api/<plural>.
 *  - setup: first admin user + a full-access API token saved to the project's .env (STRAPI_API_TOKEN).
 *  - list / get / create / update / delete: entries through the REST API.
 * Create the project itself with site_template id=cms-strapi.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mergeEnv } from "./sitetemplate.js";
import { obj, str, enm } from "./types.js";
const FIELD_TYPES = new Set(["string", "text", "richtext", "blocks", "email", "password", "uid", "integer", "biginteger", "decimal", "float", "boolean", "date", "datetime", "time", "json", "enumeration", "media", "relation"]);
/** "Blog post" → "blog-post" (Strapi wants kebab-case singular/plural names). */
export const kebab = (s) => s.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const pluralize = (s) => (/(s|x|z|ch|sh)$/.test(s) ? `${s}es` : /[^aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`);
/**
 * Field shorthand → Strapi attribute: "string", "string!" (required), "decimal", "enumeration:draft,published",
 * "media", "media[]" (multiple), "relation:category" (many-to-one), "relation[]:tag" (many-to-many), "uid:title".
 */
export function attribute(spec) {
    const s = String(spec).trim();
    const required = s.endsWith("!");
    const body = required ? s.slice(0, -1) : s;
    const [head, arg] = body.split(/:(.*)/s);
    const many = head.endsWith("[]");
    const type = many ? head.slice(0, -2) : head;
    if (!FIELD_TYPES.has(type))
        throw new Error(`unknown field type "${type}" (use: ${[...FIELD_TYPES].join(", ")})`);
    let a = { type };
    if (type === "enumeration")
        a.enum = String(arg ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    else if (type === "media")
        a = { type: "media", multiple: many, allowedTypes: ["images", "files", "videos", "audios"] };
    else if (type === "relation")
        a = { type: "relation", relation: many ? "manyToMany" : "manyToOne", target: `api::${kebab(arg ?? "")}.${kebab(arg ?? "")}` };
    else if (type === "uid" && arg)
        a.targetField = arg;
    if (required)
        a.required = true;
    return a;
}
/** The files Strapi expects for an API content type. */
export function contentTypeFiles(name, fields, o = {}) {
    const sing = kebab(name), plural = kebab(o.plural ?? pluralize(sing));
    const attributes = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, attribute(v)]));
    const schema = {
        kind: o.single ? "singleType" : "collectionType",
        collectionName: plural.replace(/-/g, "_"),
        info: { singularName: sing, pluralName: plural, displayName: o.display ?? name.trim().replace(/^./, (c) => c.toUpperCase()) },
        options: { draftAndPublish: o.draftAndPublish ?? true },
        pluginOptions: {},
        attributes,
    };
    const uid = `api::${sing}.${sing}`;
    return {
        [`src/api/${sing}/content-types/${sing}/schema.json`]: JSON.stringify(schema, null, 2) + "\n",
        [`src/api/${sing}/controllers/${sing}.ts`]: `import { factories } from '@strapi/strapi';\n\nexport default factories.createCoreController('${uid}');\n`,
        [`src/api/${sing}/routes/${sing}.ts`]: `import { factories } from '@strapi/strapi';\n\nexport default factories.createCoreRouter('${uid}');\n`,
        [`src/api/${sing}/services/${sing}.ts`]: `import { factories } from '@strapi/strapi';\n\nexport default factories.createCoreService('${uid}');\n`,
    };
}
function readEnv(dir) {
    const f = join(dir, ".env");
    if (!existsSync(f))
        return {};
    return Object.fromEntries(readFileSync(f, "utf8").split("\n").map((l) => /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
}
async function http(url, init = {}) {
    const headers = { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) };
    const r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(30_000) });
    const text = await r.text();
    let j;
    try {
        j = text ? JSON.parse(text) : {};
    }
    catch {
        j = { raw: text.slice(0, 300) };
    }
    if (!r.ok)
        throw new Error(`${r.status} ${j?.error?.message ?? j?.raw ?? r.statusText}${j?.error?.details?.errors ? `: ${JSON.stringify(j.error.details.errors).slice(0, 300)}` : ""}`);
    return j;
}
export const strapiTool = {
    name: "strapi_cms", toolset: "files", tier: "slm", deferred: true,
    description: "Headless CMS (Strapi) for a project made with site_template id=cms-strapi. action=types lists content types; create_type adds one (name, fields like {\"title\":\"string!\",\"price\":\"decimal\",\"status\":\"enumeration:draft,live\",\"image\":\"media\",\"category\":\"relation:category\"}); " +
        "setup creates the admin user and an API token (email, password); list/get/create/update/delete manage entries of a type (type = plural name, data = fields, id = documentId). Strapi must be running (npm run develop) for setup and entries.",
    parameters: obj({
        action: enm(["types", "create_type", "setup", "list", "get", "create", "update", "delete"], "what to do"),
        dir: str("Strapi project folder (default: working folder)"),
        url: str("Strapi URL (default http://localhost:1337)"),
        name: str("create_type: singular name, e.g. product"),
        plural: str("create_type: plural name if not regular"),
        fields: { type: "object", description: "create_type: field name → type shorthand", additionalProperties: { type: "string" } },
        single: { type: "boolean", description: "create_type: a single page (singleType), e.g. homepage" },
        type: str("entries: plural API name, e.g. products"),
        id: str("get/update/delete: documentId"),
        data: { type: "object", description: "create/update: field values" },
        query: str("list: extra query string, e.g. filters[status][$eq]=live&sort=createdAt:desc"),
        email: str("setup: admin email"),
        password: str("setup: admin password (8+ chars, upper, lower and a number)"),
    }, ["action"]),
    async handler(a, ctx) {
        const dir = resolve(ctx.cwd, a.dir ?? ".");
        const isStrapi = existsSync(join(dir, "package.json")) && /"@strapi\/strapi"/.test(readFileSync(join(dir, "package.json"), "utf8"));
        const base = String(a.url ?? `http://localhost:${readEnv(dir).PORT || 1337}`).replace(/\/+$/, "");
        if (a.action === "types") {
            if (!isStrapi)
                return `error: ${dir} is not a Strapi project (create one with site_template id=cms-strapi)`;
            const api = join(dir, "src", "api");
            const out = [];
            for (const n of existsSync(api) ? readdirSync(api) : []) {
                const f = join(api, n, "content-types", n, "schema.json");
                if (!existsSync(f))
                    continue;
                const s = JSON.parse(readFileSync(f, "utf8"));
                out.push(`${s.info.pluralName} (${s.kind}): ${Object.entries(s.attributes).map(([k, v]) => `${k}:${v.type}${v.required ? "!" : ""}`).join(", ")}`);
            }
            return out.length ? out.join("\n") : "No content types yet. Add one with action=create_type.";
        }
        if (a.action === "create_type") {
            if (!isStrapi)
                return `error: ${dir} is not a Strapi project`;
            if (!a.name || !a.fields || typeof a.fields !== "object")
                return "error: name and fields are required";
            const files = contentTypeFiles(String(a.name), a.fields, { plural: a.plural, single: !!a.single });
            const first = Object.keys(files)[0];
            if (existsSync(join(dir, first)))
                return `error: content type ${kebab(String(a.name))} already exists (${first})`;
            for (const [rel, body] of Object.entries(files)) {
                mkdirSync(join(dir, rel, ".."), { recursive: true });
                writeFileSync(join(dir, rel), body);
            }
            const plural = JSON.parse(files[first]).info.pluralName;
            return `Created content type ${kebab(String(a.name))} (${Object.keys(a.fields).length} fields). Strapi in develop mode restarts by itself; then REST: ${base}/api/${plural}. ` +
                `Reads need the API token (action=setup) or public permission (admin → Settings → Users & Permissions → Public).`;
        }
        if (a.action === "setup") {
            if (!a.email || !a.password)
                return "error: email and password are required";
            const reg = await http(`${base}/admin/register-admin`, { method: "POST", body: JSON.stringify({ email: a.email, password: a.password, firstname: "Admin" }) })
                .catch(async (e) => { if (!/already|registered|403|400/i.test(String(e.message)))
                throw e; return http(`${base}/admin/login`, { method: "POST", body: JSON.stringify({ email: a.email, password: a.password }) }); });
            const jwt = reg?.data?.token;
            if (!jwt)
                return "error: could not log in to the Strapi admin";
            const tok = await http(`${base}/admin/api-tokens`, { method: "POST", token: jwt, body: JSON.stringify({ name: `stitap-${Date.now()}`, description: "created by stitaP strapi_cms", type: "full-access", lifespan: null }) });
            const key = tok?.data?.accessKey;
            if (!key)
                return "error: Strapi did not return an API token";
            if (isStrapi) {
                const envFile = join(dir, ".env");
                writeFileSync(envFile, mergeEnv(existsSync(envFile) ? readFileSync(envFile, "utf8") : "", { STRAPI_API_TOKEN: key }));
                try {
                    chmodSync(envFile, 0o600);
                }
                catch { /* Windows */ } // `mode` applies only to new files
            }
            return `Admin ready (${a.email}); full-access API token saved to ${isStrapi ? join(dir, ".env") + " as STRAPI_API_TOKEN" : "(not saved: dir is not the Strapi project)"}. Admin panel: ${base}/admin`;
        }
        const token = process.env.STRAPI_API_TOKEN || readEnv(dir).STRAPI_API_TOKEN;
        if (!a.type)
            return "error: type (plural API name, e.g. products) is required";
        const coll = `${base}/api/${kebab(String(a.type))}`;
        switch (a.action) {
            case "list": return JSON.stringify(await http(`${coll}?${a.query ?? "pagination[pageSize]=25"}`, { token }), null, 1).slice(0, 12000);
            case "get": return JSON.stringify(await http(`${coll}/${a.id}?populate=*`, { token }), null, 1).slice(0, 12000);
            case "create": return JSON.stringify((await http(coll, { method: "POST", token, body: JSON.stringify({ data: a.data ?? {} }) })).data);
            case "update": return JSON.stringify((await http(`${coll}/${a.id}`, { method: "PUT", token, body: JSON.stringify({ data: a.data ?? {} }) })).data);
            case "delete":
                await http(`${coll}/${a.id}`, { method: "DELETE", token });
                return `Deleted ${a.type}/${a.id}`;
            default: return "error: unknown action";
        }
    },
};
