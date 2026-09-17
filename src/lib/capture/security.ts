/**
 * Sensitive-data detection (blueprint §17/§20).
 *
 * Scans URLs and metadata for obvious credential patterns so the capture flow
 * can warn the user (and suggest redaction) before content is published.
 * This is a heuristic guard, not a guarantee — it complements the URL security
 * validator and pixel-level redaction.
 */

export interface SensitiveMatch {
  id: string;
  label: string;
  /** Short context around the match, truncated. */
  hint: string;
}

const PATTERNS: { id: string; label: string; re: RegExp }[] = [
  { id: "api-key", label: "API key", re: /(?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key)/i },
  { id: "token", label: "Token", re: /(?:token|bearer|jwt)/i },
  { id: "password", label: "Password", re: /(?:passwd|password|pwd)/i },
  { id: "session", label: "Session", re: /(?:session[_-]?id|sso|auth[_-]?token|signature)/i },
  { id: "private-key", label: "Private key", re: /private[_-]?key|\.pem\b/i },
];

function contextAround(input: string, index: number, radius = 40): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(input.length, index + radius);
  const out = input.slice(start, end).replace(/\s+/g, " ");
  return out.length > 82 ? `${out.slice(0, 79)}…` : out;
}

/** Scan a string for credential-like parameters or phrases. */
export function scanSensitive(input: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  for (const p of PATTERNS) {
    const m = p.re.exec(input);
    if (m) {
      matches.push({ id: p.id, label: p.label, hint: contextAround(input, m.index) });
    }
  }
  return matches;
}

/** Convenience: scan just the query string of a URL. */
export function scanUrlForSensitive(url: string): SensitiveMatch[] {
  try {
    const u = new URL(url);
    return scanSensitive(u.search + " " + (u.username || ""));
  } catch {
    return scanSensitive(url);
  }
}
