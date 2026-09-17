/**
 * URL security validation for capture sources (SSRF best-effort guard).
 * Pure logic — safe to run on the client and inside the Convex action.
 * Mirrors the rules in the capture-engine blueprint (Step 2: Validate the
 * Source and Authorization).
 */

export type UrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

const BLOCKED_SCHEMES = new Set([
  "file:",
  "ftp:",
  "ftps:",
  "gopher:",
  "data:",
  "javascript:",
  "blob:",
  "about:",
  "chrome:",
  "edge:",
  "resource:",
  "ws:",
  "wss:",
  "mailto:",
  "tel:",
]);

/* ------------------------------------------------------------------ */
/* IDN / hostname normalization (RFC 3492 punycode from scratch)        */
/* ------------------------------------------------------------------ */

/** RFC 3492 punycode parameters. */
const PUNY_BASE = 36;
const PUNY_TMIN = 1;
const PUNY_TMAX = 26;
const PUNY_SKEW = 38;
const PUNY_DAMP = 700;
const PUNY_INITIAL_BIAS = 72;
const PUNY_INITIAL_N = 128;

function punyDigitValue(c: string): number {
  const code = c.charCodeAt(0);
  if (code >= 0x61 && code <= 0x7a) return code - 0x61; // a-z
  if (code >= 0x41 && code <= 0x5a) return code - 0x41; // A-Z
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26; // 0-9
  return 0;
}

function punyDigit(d: number): string {
  return d < 26 ? String.fromCharCode(0x61 + d) : String.fromCharCode(0x30 + d - 26);
}

function punyAdapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / PUNY_DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((PUNY_BASE - PUNY_TMIN) * PUNY_TMAX) >> 1) {
    d = Math.floor(d / (PUNY_BASE - PUNY_TMIN));
    k += PUNY_BASE;
  }
  return k + Math.floor(((PUNY_BASE - PUNY_TMIN + 1) * d) / (d + PUNY_SKEW));
}

/** RFC 3492 punycode encode (used for the IDN `xn--` prefix of host labels). */
export function punycodeEncode(input: string): string {
  const codePoints = Array.from(input, (ch) => ch.codePointAt(0)!);
  const output: string[] = [];
  let n = PUNY_INITIAL_N;
  let delta = 0;
  let bias = PUNY_INITIAL_BIAS;
  let handled = 0;

  // Basic code points (ASCII) first.
  for (const c of codePoints) {
    if (c < 0x80) {
      output.push(String.fromCodePoint(c));
      handled += 1;
    }
  }
  const b = handled;
  if (b > 0) output.push("-");

  while (handled < codePoints.length) {
    let m = Number.MAX_SAFE_INTEGER;
    for (const c of codePoints) {
      if (c >= n && c < m) m = c;
    }
    delta += (m - n) * (handled + 1);
    n = m;
    for (const c of codePoints) {
      if (c < n) {
        delta += 1;
      } else if (c === n) {
        let q = delta;
        for (let k = PUNY_BASE; ; k += PUNY_BASE) {
          const t = k <= bias ? PUNY_TMIN : k >= bias + PUNY_TMAX ? PUNY_TMAX : k - bias;
          if (q < t) break;
          output.push(punyDigit(t + ((q - t) % (PUNY_BASE - t))));
          q = Math.floor((q - t) / (PUNY_BASE - t));
        }
        output.push(punyDigit(q));
        bias = punyAdapt(delta, handled + 1, handled === b);
        delta = 0;
        handled += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return output.join("");
}

/**
 * Canonical hostname: lowercase, trailing dot stripped, non-ASCII labels
 * converted to their punycode `xn--` form so allowlists/denylists and SSRF
 * checks all compare ASCII. Bracketed IPv6 literals pass through untouched.
 */
export function normalizeHostname(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  while (h.endsWith(".")) h = h.slice(0, -1);
  if (!h) return h;
  if (h.startsWith("[")) return h; // [::1] style IPv6 literal
  const labels = h.split(".");
  const out = labels.map((label) => {
    if (/^[a-z0-9-]+$/.test(label)) return label;
    return "xn--" + punycodeEncode(label);
  });
  return out.join(".");
}

function isNumericIp(hostname: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts;
}

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "::1") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h.endsWith(".internal") || h.endsWith(".lan")) return true;

  // IPv6 literals
  if (h.includes(":")) {
    const addr = h.startsWith("[") ? h.slice(1, -1) : h;
    const lower = addr.toLowerCase();
    if (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fe80::") ||
      lower.startsWith("2001:db8:")
    ) {
      return true;
    }
    // Unspecified / loopback shorthand forms
    if (lower.replace(/^0+:0+/, "::") === "::" || lower.replace(/^0+:0+/, "::") === "::1") {
      return true;
    }
    return false;
  }

  const ip = isNumericIp(h);
  if (!ip) return false;
  const [a, b] = ip;
  if (a === 0) return true; // 0.0.0.0
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

/** Reject any URL that is not http(s), points at private networks, or carries
 *  credentials. Any http/https port is allowed: the fetch is performed by the
 *  self-hosted capture service's Chromium, not our server, so custom ports on
 *  public hosts are low-risk. SSRF protection is enforced by the private-
 *  network / IP rules below rather than by the port number. */
export function validateCaptureUrl(raw: string): UrlValidationResult {
  if (!raw || raw.length > 2048) {
    return { ok: false, reason: "URL is empty or too long" };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "URL is not valid" };
  }

  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    return { ok: false, reason: `Scheme "${parsed.protocol}" is not allowed` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http:// and https:// are allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URLs containing credentials are blocked" };
  }
  if (parsed.hostname.length === 0) {
    return { ok: false, reason: "URL has no hostname" };
  }
  // Normalize IDNs to ASCII before any comparison: a unicode lookalike of a
  // private hostname (e.g. a homoglyph of `localhost`) must not slip past the
  // IP/loopback checks, and allowlist rules are compared in canonical form.
  const host = normalizeHostname(parsed.hostname);
  if (isPrivateHostname(host)) {
    return { ok: false, reason: "Private or local network addresses are blocked" };
  }
  try {
    parsed.hostname = host;
  } catch {
    return { ok: false, reason: "URL hostname could not be normalized" };
  }
  // Ports: any http(s) port is permitted (e.g. dev servers on :8081).
  // Scheme + private-network rules above are the actual SSRF defense.
  return { ok: true, url: parsed.toString() };
}

/**
 * Resolve a redirect `Location` (absolute or relative to `from`) and
 * re-validate it with the same rules as the original URL.
 *
 * A public URL may redirect anywhere; each hop of the chain must pass the
 * same scheme / private-network / credential checks before the capture
 * service is allowed to follow it.
 */
export function validateRedirectTarget(location: string, from: string): UrlValidationResult {
  if (!location || location.length > 2048) {
    return { ok: false, reason: "Redirect target is empty or too long" };
  }
  let resolved: string;
  try {
    resolved = new URL(location, from).toString();
  } catch {
    return { ok: false, reason: "Redirect target is not a valid URL" };
  }
  return validateCaptureUrl(resolved);
}

/** Maximum redirect hops the capture flow will follow (each hop re-validated). */
export const MAX_REDIRECT_HOPS = 5;
