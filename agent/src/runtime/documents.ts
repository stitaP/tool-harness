/**
 * The document viewer: which files the web chat may show, what kind each one is, and which documents a chat has
 * created (files the agent wrote, plus document paths it reported, e.g. a design run's report.md). Used by the
 * `/api/file` routes, the `/open` command and the `show_document` tool.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { blockedReason, resolvePath } from "../safety/paths.js";
import type { Runtime } from "./runtime.js";
import { guardedFetch } from "../tools/web.js";

export type DocKind = "markdown" | "html" | "image" | "pdf" | "office" | "table" | "text" | "binary";

const KINDS: Record<string, DocKind> = {
  ".md": "markdown", ".markdown": "markdown", ".mdx": "markdown",
  ".html": "html", ".htm": "html",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image", ".svg": "image", ".bmp": "image", ".ico": "image",
  ".pdf": "pdf",
  ".docx": "office", ".xlsx": "office", ".pptx": "office", ".odt": "office", ".ods": "office", ".odp": "office", ".doc": "office", ".xls": "office", ".ppt": "office", ".rtf": "office",
  ".csv": "table", ".tsv": "table",
};
/** Extensions that count as documents (listed by `/open`, linked in chat); code files open too but are not listed. */
export const DOC_EXT = new Set([...Object.keys(KINDS), ".txt", ".json", ".yaml", ".yml"]);

export const MIME: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8", ".markdown": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".ico": "image/x-icon", ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const docKind = (p: string): DocKind => KINDS[extname(p).toLowerCase()] ?? "text";

/** Secrets the viewer never shows, wherever they are. */
const SECRET = /(^|\/)(\.env(\.(?!example$)[^/]*)?|id_(rsa|ed25519|ecdsa|dsa)[^/]*|[^/]+\.(pem|key|p12|pfx|keychain-db)|\.netrc|\.npmrc|\.pypirc|credentials(\.json)?|state\.db(-wal|-shm)?)$|\/Library\/Keychains\//;

/** The real path; for a path that does not exist, the real path of its nearest existing folder plus the rest. */
const real = (p: string): string => {
  const abs = resolve(p);
  try { return realpathSync(abs); } catch { const up = dirname(abs); return up === abs ? abs : join(real(up), basename(abs)); }
};

/**
 * Why `abs` may not be shown, or null when it may. Allowed: anything under the home folder, the temp folder or the
 * harness home, except `security.blocked_paths` and secret files (.env, private keys, the state database).
 */
export function viewBlocked(rt: Runtime, abs: string): string | null {
  const r = real(abs);
  const roots = [homedir(), tmpdir(), rt.home, "/tmp", "/private/tmp", "/private/var/folders"].map(real);
  if (!roots.some((x) => r === x || r.startsWith(x.replace(/\/$/, "") + "/"))) return `${abs} is outside the folders the viewer shows (your home folder and the temp folder)`;
  const b = blockedReason(r, rt.cfg.data.security.blocked_paths ?? [], false) ?? blockedReason(abs, rt.cfg.data.security.blocked_paths ?? [], false);
  if (b) return b;
  if (SECRET.test(r) || SECRET.test(abs)) return `${basename(abs)} may hold secrets, so the viewer does not show it`;
  return null;
}

/** Resolve a path the user or the agent gave (relative to the chat's folder, `~` allowed); throws when it can't be shown. */
export function resolveDoc(rt: Runtime, sid: string | null, p: string): string {
  const raw = String(p ?? "").trim().replace(/^["'`]|["'`]$/g, "").replace(/:(\d+)(:\d+)?$/, "");
  if (!raw) throw new Error("no path given");
  const cwd = sid ? rt.sessionCwd(sid) : rt.defaultCwd();
  let abs = resolvePath(cwd, raw);
  // a bare name: also look in the chat's added folders
  if (!existsSync(abs) && sid && !raw.includes("/")) for (const d of rt.extraDirs(sid)) if (existsSync(join(d, raw))) { abs = join(d, raw); break; }
  const why = viewBlocked(rt, abs);
  if (why) throw new Error(why);
  if (!existsSync(abs)) throw new Error(`not found: ${abs}`);
  return abs;
}

export interface DocEntry { path: string; name: string; kind: DocKind | "dir"; size: number; mtime: number }

export function docEntry(abs: string): DocEntry | null {
  try { const st = statSync(abs); return { path: abs, name: basename(abs), kind: st.isDirectory() ? "dir" : docKind(abs), size: st.size, mtime: st.mtimeMs }; } catch { return null; }
}

/** The entries of a folder: sub-folders first, then files; hidden files and build folders skipped. */
export function listFolder(dir: string, max = 300): DocEntry[] {
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((n) => !n.startsWith(".") && !["node_modules", "dist", "build", "__pycache__"].includes(n)).slice(0, max)
    .map((n) => docEntry(join(dir, n))).filter((e): e is DocEntry => !!e)
    .sort((a, b) => Number(b.kind === "dir") - Number(a.kind === "dir") || a.name.localeCompare(b.name));
}

const WRITE_TOOLS = new Set(["write_file", "patch", "convert_document", "office_to_markdown", "site_template", "screen_capture", "browser_screenshot"]);
const PATH_RE = /(?:^|[\s`'"(\[:=])((?:~|\/)[^\s`'"()<>\[\]|*?]+\.([A-Za-z0-9]{2,5}))(?=$|[\s`'"),.;:\]])/g;

/**
 * Documents this chat created or pointed at, newest first: paths the agent wrote with a file tool, and document paths
 * named in tool results or replies (a design run's report.md, an exported PDF …). Only files that still exist.
 */
export function chatDocuments(rt: Runtime, sid: string, max = 30): DocEntry[] {
  const cwd = rt.sessionCwd(sid);
  const found = new Map<string, number>();       // path → order seen
  let n = 0;
  const add = (p: string) => { const abs = resolvePath(cwd, p); if (!found.has(abs)) found.set(abs, n++); };
  for (const m of rt.db.getMessages(sid)) {
    for (const tc of m.tool_calls ?? []) {
      const name = (tc as any).function?.name ?? (tc as any).name;
      if (!WRITE_TOOLS.has(name)) continue;
      let a: any = (tc as any).function?.arguments ?? (tc as any).arguments ?? {};
      if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
      for (const k of ["path", "output", "out", "file"]) if (typeof a?.[k] === "string" && a[k]) add(a[k]);
    }
    if ((m.role === "assistant" || m.role === "tool") && typeof m.content === "string")
      for (const x of m.content.matchAll(PATH_RE)) if (DOC_EXT.has("." + x[2].toLowerCase())) add(x[1].replace(/[.,;:]+$/, ""));
  }
  return [...found.keys()]
    .filter((p) => DOC_EXT.has(extname(p).toLowerCase()) && !p.startsWith(join(rt.home, "spill") + "/") && !viewBlocked(rt, p))   // spill files: long tool output, not documents
    .map((p) => docEntry(p)).filter((e): e is DocEntry => !!e && e.kind !== "dir")
    .sort((a, b) => b.mtime - a.mtime).slice(0, max);
}

/** Open a file in the desktop's own viewer (the terminal REPL has no viewer of its own). */
export function openOnDesktop(abs: string): Promise<string | null> {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  return new Promise((res) => execFile(cmd, [abs], { timeout: 10_000 }, (err) => res(err ? `could not open it with ${cmd}: ${err.message}` : null)));
}

/**
 * Show a document to the user of chat `sid`: the web chat opens its viewer (an `open_document` event); a terminal
 * chat opens the desktop viewer. Returns what happened, for the tool result or the command reply.
 */
export async function showDocument(rt: Runtime, sid: string, abs: string, source: string): Promise<string> {
  const e = docEntry(abs);
  const what = e?.kind === "dir" ? "folder" : "document";
  const web = (rt.attached.get(sid) ?? 0) > 0 && source !== "cli";
  rt.emitEvent(sid, { type: "open_document", path: abs, kind: e?.kind });
  if (source === "cli") {
    const err = await openOnDesktop(abs);
    return err ? `${abs}: ${err}` : `Opened ${abs} in the desktop viewer.`;
  }
  if (web || source === "web") return `Opened the ${what} ${abs} in the chat's document viewer.`;
  return `The document viewer is part of the web chat; this chat (${source}) has none. The ${what} is at ${abs} (open it from the web chat with /open ${abs}).`;
}

// ── documents on the web: Google Docs / Sheets / Slides, Drive files, and plain links to a PDF, Word file … ──
export const isUrl = (p: string) => /^https?:\/\//i.test(String(p ?? "").trim());
const GOOGLE = /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]{20,})/;
const DRIVE = /^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{20,})/;
const EXT_OF_TYPE: Record<string, string> = Object.fromEntries(Object.entries(MIME).map(([e, m]) => [m.split(";")[0], e]));

/** Where a web document is downloaded from: Google files are exported as Word / Excel / PowerPoint. */
export function exportUrl(url: string): { url: string; ext?: string; kind: string } {
  const g = GOOGLE.exec(url.trim());
  if (g) {
    const [, type, id] = g;
    if (type === "document") return { url: `https://docs.google.com/document/d/${id}/export?format=docx`, ext: ".docx", kind: "Google Doc" };
    if (type === "spreadsheets") return { url: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, ext: ".xlsx", kind: "Google Sheet" };
    return { url: `https://docs.google.com/presentation/d/${id}/export/pptx`, ext: ".pptx", kind: "Google Slides" };
  }
  const d = DRIVE.exec(url.trim());
  if (d) return { url: `https://drive.google.com/uc?export=download&id=${d[1]}`, kind: "Google Drive file" };
  return { url: url.trim(), kind: "link" };
}

/**
 * Download a document link into <home>/downloads and return the local copy (fetched again each time, so an edited
 * Google file shows its latest version). Only files shared as "anyone with the link" can be read.
 */
export async function fetchDocUrl(rt: Runtime, url: string): Promise<{ path: string; source: string; kind: string }> {
  const x = exportUrl(url);
  const res = await guardedFetch(rt, x.url, { headers: { accept: "*/*" } });
  const type = String(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const google = x.kind !== "link";
  if (res.status === 401 || res.status === 403 || res.status === 404 || (google && type === "text/html"))
    throw new Error(google ? `this ${x.kind} is private (or does not exist). In Google, choose Share › General access › "Anyone with the link" (Viewer) and try again, or download it (File › Download) and open the file.` : `the link answered ${res.status}${type ? ` (${type})` : ""}`);
  if (!res.ok) throw new Error(`the link answered ${res.status} ${res.statusText}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > 40e6) throw new Error(`the file is too large to show (${Math.round(len / 1e6)} MB)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 40e6) throw new Error(`the file is too large to show (${Math.round(buf.length / 1e6)} MB)`);
  const cd = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "");
  let name = cd ? decodeURIComponent(cd[1]) : decodeURIComponent(new URL(x.url).pathname.split("/").pop() || "document");
  const ext = extname(name).toLowerCase() || x.ext || EXT_OF_TYPE[type] || (type.startsWith("text/") ? ".txt" : "");
  name = basename(name, extname(name)).replace(/[^\w.-]+/g, "_").slice(0, 60) || "document";
  const dir = join(rt.home, "downloads");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}-${createHash("sha1").update(url.trim()).digest("hex").slice(0, 8)}${ext}`);
  writeFileSync(path, buf);
  return { path, source: url.trim(), kind: x.kind };
}
