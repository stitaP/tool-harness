/** Path resolution and sensitive-path guards for file tools; egress guard for web tools. */
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function expandHome(p: string): string {
  return p === "~" ? homedir() : p.startsWith("~/") || p.startsWith("~\\") ? resolve(homedir(), p.slice(2)) : p;
}

export function resolvePath(cwd: string, p: string): string {
  const e = expandHome(p.trim());
  return isAbsolute(e) ? resolve(e) : resolve(cwd, e);
}

export function blockedReason(abs: string, blocked: string[], write: boolean): string | null {
  for (const b of blocked) {
    const bp = resolve(expandHome(b));
    if (abs === bp || abs.startsWith(bp + "/") || abs.startsWith(bp + "\\")) return `access to ${b} is blocked by security.blocked_paths`;
  }
  if (write && /(^|[\\/])\.env(\.|$)/.test(abs) && !/\.example$/.test(abs)) return null; // allowed but approval-gated by caller
  return null;
}

/** Glob → RegExp: `**` any path, `*` within a segment, `?` one char. Patterns are matched against "/"-separated paths. */
function globRe(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/**
 * Files the agent's file tools must never change: `security.protected_paths` (absolute or ~ globs) plus the patterns in a
 * `.stitap-protected` file (one glob per line, relative to that file's folder, # comments) found in the target's folder
 * or any parent — e.g. a project marks `tests/**` so provided tests can't be rewritten.
 */
export function protectedReason(abs: string, globs: string[] = []): string | null {
  const norm = abs.split("\\").join("/");
  for (const g of globs) if (globRe(resolve(expandHome(g)).split("\\").join("/")).test(norm)) return `${abs} is protected by security.protected_paths (${g})`;
  for (let dir = dirname(abs); ; dir = dirname(dir)) {
    const f = join(dir, ".stitap-protected");
    if (existsSync(f)) {
      const rel = relative(dir, abs).split("\\").join("/");
      for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
        const g = line.replace(/#.*/, "").trim();
        if (g && globRe(g.replace(/^\.?\//, "")).test(rel)) return `${rel} is protected by ${f} (${g}) — do not change it; change your own code instead`;
      }
    }
    if (dirname(dir) === dir) break;
  }
  return null;
}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
}

/** Throws when a URL is not allowed by egress policy. */
export async function checkEgress(url: string, opts: { allowPrivate: boolean; allowlist: string[] }): Promise<URL> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`invalid URL: ${url}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`only http(s) URLs are allowed (got ${u.protocol})`);
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (opts.allowlist.length && !opts.allowlist.some((d) => host === d.toLowerCase() || host.endsWith("." + d.toLowerCase().replace(/^\*\./, "")))) {
    throw new Error(`egress to ${host} is not in web.egress_allowlist`);
  }
  if (!opts.allowPrivate) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) throw new Error(`requests to private host ${host} are blocked (set web.allow_private: true to permit)`);
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a: any) => a.address);
    if (ips.some(privateIp)) throw new Error(`requests to private network address for ${host} are blocked (set web.allow_private: true to permit)`);
  }
  return u;
}
