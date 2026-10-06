/** Secret redaction for logs, tool output and outbound messages. */

const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]"],
  [/\bsk-(?:ant-|proj-|or-v1-)?[A-Za-z0-9_\-]{20,}\b/g, "sk-…[REDACTED]"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, "gh…[REDACTED]"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, "github_pat_…[REDACTED]"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, "xox…[REDACTED]"],
  [/\bxapp-[A-Za-z0-9-]{10,}\b/g, "xapp-…[REDACTED]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "AKIA…[REDACTED]"],
  [/\bAIza[0-9A-Za-z_\-]{35}\b/g, "AIza…[REDACTED]"],
  [/\b\d{8,10}:AA[A-Za-z0-9_\-]{30,}\b/g, "[REDACTED TELEGRAM TOKEN]"],
  [/(Bearer\s+)[A-Za-z0-9._\-]{20,}/gi, "$1[REDACTED]"],
];
/** `key = value` assignments: right for logs and outbound messages, wrong for tool output, where it hides ordinary code
 * (`const token = authHeader.slice(7)`, `errors.password = 'Password is required'`) and the model writes the placeholder back. */
const ASSIGNMENT: [RegExp, string] = [/((?:api[_-]?key|secret|password|passwd|token)\s*[=:]\s*["']?)[^\s"']{8,}/gi, "$1[REDACTED]"];

function redactFormats(s: string): string {
  let out = s;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

export function redact(s: string): string {
  if (!s) return s;
  return redactFormats(s).replace(ASSIGNMENT[0], ASSIGNMENT[1]);
}

/** Also redact literal values of known secrets (from .env) that may appear verbatim. */
export function redactKnown(s: string, secrets: string[]): string {
  let out = redact(s);
  for (const v of secrets) if (v && v.length >= 8) out = out.split(v).join("[REDACTED]");
  return out;
}

/** Tool output the model reads (files, command output): only unmistakable secrets, so code stays intact. */
export function redactToolOutput(s: string, secrets: string[]): string {
  if (!s) return s;
  let out = redactFormats(s);
  for (const v of secrets) if (v && v.length >= 8) out = out.split(v).join("[REDACTED]");
  return out;
}
