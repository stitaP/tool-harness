/**
 * Capture policy engine (blueprint §5.3 + §22 "Enterprise hardening").
 *
 * Pure logic — safe to run on the client, inside Convex mutations/actions and
 * in tests. Defines what the product *allows* on top of the SSRF guard in
 * `urlSecurity.ts`:
 *
 *   - domain allowlist / denylist (exact domain + subdomains, `*.` rules),
 *   - offline mode (`allowRemoteCapture: false` disables remote URL capture —
 *     in-app demo and current-tab captures keep working),
 *   - retention policy (days until library rows + audit records are pruned),
 *   - allowed capture modes (empty = all modes).
 *
 * Enforced server-side in `captureUrl.ts` (URL captures) and surfaced in the
 * Settings page. Policy rows are per-user (single-org bootstrap: the first
 * user to edit policy becomes admin, see `src/convex/policy.ts`).
 */

export const CAPTURE_MODES = ["viewport", "full-page", "element", "region"] as const;
export type CaptureModeName = (typeof CAPTURE_MODES)[number];

export interface CapturePolicy {
  /** Domains allowed for remote capture. Empty = any public domain (SSRF rules still apply). */
  allowlist: string[];
  /** Domains never allowed, even if the allowlist is empty. */
  denylist: string[];
  /** false = offline mode: remote URL capture is disabled entirely. */
  allowRemoteCapture: boolean;
  /** Days library captures are kept (0 = keep forever). Audit records are capped separately. */
  retentionDays: number;
  /** Allowed capture modes; empty = all. */
  allowedModes: CaptureModeName[];
}

export const DEFAULT_POLICY: CapturePolicy = {
  allowlist: [],
  denylist: [],
  allowRemoteCapture: true,
  retentionDays: 365,
  allowedModes: [],
};

export const RETENTION_MAX_DAYS = 3650;
/** Audit records are pruned after `max(retentionDays, this)` regardless of policy. */
export const AUDIT_LOG_MAX_DAYS = 180;

export type PolicyResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/** Lowercase + strip trailing dots (root-relative FQDN normalization). */
export function normalizeDomain(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  while (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}

/**
 * Does `hostname` match a policy rule?
 *   - `example.com`  matches example.com and any subdomain,
 *   - `*.example.com` matches subdomains only (not the apex).
 * Rules and hostnames are normalized (case, trailing dots).
 */
export function domainMatchesRule(hostname: string, rule: string): boolean {
  const h = normalizeDomain(hostname);
  const r = normalizeDomain(rule);
  if (!h || !r) return false;
  if (r.startsWith("*.")) {
    const base = r.slice(2);
    return h !== base && h.endsWith("." + base);
  }
  return h === r || h.endsWith("." + r);
}

/**
 * Evaluate a URL against the policy. Applied *after* the SSRF guard so
 * allowlists only ever see public, http(s), credential-free URLs.
 */
export function evaluateUrlPolicy(rawUrl: string, policy: CapturePolicy): PolicyResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL is not valid" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) URLs can be policy-checked" };
  }
  if (!policy.allowRemoteCapture) {
    return {
      ok: false,
      reason: "Offline mode is enabled — remote URL capture is disabled by policy.",
    };
  }
  const host = normalizeDomain(parsed.hostname);
  if (!host) return { ok: false, reason: "URL has no hostname" };
  for (const rule of policy.denylist) {
    if (domainMatchesRule(host, rule)) {
      return { ok: false, reason: `Domain "${host}" is on the capture denylist.` };
    }
  }
  if (policy.allowlist.length > 0 && !policy.allowlist.some((r) => domainMatchesRule(host, r))) {
    return {
      ok: false,
      reason: `Domain "${host}" is not on the capture allowlist.`,
    };
  }
  return { ok: true, url: rawUrl };
}

/** Clamp a mode list to the known capture modes, de-duplicated. */
export function sanitizeAllowedModes(modes: string[] | undefined): CaptureModeName[] {
  return Array.from(new Set((modes ?? []).filter((m): m is CaptureModeName => CAPTURE_MODES.includes(m as CaptureModeName))));
}

const DOMAIN_RULE_RE = /^(\*\.)?[a-z0-9.-]+$/;

function cleanDomainList(list: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (list ?? [])
        .map((d) => normalizeDomain(d))
        .filter((d) => d.length > 0 && d.length <= 253 && DOMAIN_RULE_RE.test(d)),
    ),
  );
}

/**
 * Validate + clamp arbitrary input into a well-formed `CapturePolicy`.
 * Used by `updateMyPolicy` (Convex) and the Settings form.
 */
export function sanitizePolicyInput(input: Partial<CapturePolicy>): CapturePolicy {
  return {
    allowlist: cleanDomainList(input.allowlist),
    denylist: cleanDomainList(input.denylist),
    allowRemoteCapture: input.allowRemoteCapture !== false,
    retentionDays: Math.min(
      RETENTION_MAX_DAYS,
      Math.max(0, Math.round(input.retentionDays ?? DEFAULT_POLICY.retentionDays)),
    ),
    allowedModes: sanitizeAllowedModes(input.allowedModes),
  };
}

/** One-line human summary (used in the export report). */
export function summarizePolicy(policy: CapturePolicy): string {
  const parts: string[] = [];
  if (!policy.allowRemoteCapture) parts.push("offline mode (remote URL capture disabled)");
  if (policy.allowlist.length > 0) {
    parts.push(`allowlist: ${policy.allowlist.length} domain(s)`);
  }
  if (policy.denylist.length > 0) {
    parts.push(`denylist: ${policy.denylist.length} domain(s)`);
  }
  if (policy.allowedModes.length > 0) {
    parts.push(`modes: ${policy.allowedModes.join(", ")}`);
  }
  if (policy.retentionDays > 0) parts.push(`retention: ${policy.retentionDays}d`);
  else parts.push("retention: keep forever");
  return parts.join(" · ");
}
