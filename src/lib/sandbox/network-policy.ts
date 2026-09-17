/**
 * Sandbox Network Policy
 *
 * Controls network access for each sandbox independently.
 * Each sandbox gets its own policy that determines what URLs
 * can be accessed, what protocols are allowed, and logs all traffic.
 */

import type { SandboxNetworkPolicy, NetworkLogEntry } from "./types";

// ─── Default Policies ────────────────────────────────────────────────────────

export const DEFAULT_NETWORK_POLICY: SandboxNetworkPolicy = {
  allowAll: false,
  allowPatterns: [
    "https://api.example.com/*",
    "https://httpbin.org/*",
  ],
  blockPatterns: [],
  allowWebSockets: false,
  allowFetch: true,
  maxConcurrentRequests: 5,
  requestTimeoutMs: 10000,
};

export const OPEN_NETWORK_POLICY: SandboxNetworkPolicy = {
  allowAll: true,
  allowPatterns: [],
  blockPatterns: [],
  allowWebSockets: true,
  allowFetch: true,
  maxConcurrentRequests: 20,
  requestTimeoutMs: 30000,
};

export const RESTRICTED_NETWORK_POLICY: SandboxNetworkPolicy = {
  allowAll: false,
  allowPatterns: [],
  blockPatterns: ["*"],
  allowWebSockets: false,
  allowFetch: false,
  maxConcurrentRequests: 0,
  requestTimeoutMs: 5000,
};

// ─── Policy Matcher ──────────────────────────────────────────────────────────

/**
 * Check if a URL matches a glob-style pattern.
 * Supports: *, **, ?, and protocol-relative patterns.
 * Examples:
 *   "https://api.example.com/*" matches "https://api.example.com/users"
 *   "**.example.com/**" matches "https://sub.example.com/path/to/file"
 *   "https://example.com/api/**" matches "https://example.com/api/v1/users/123"
 */
export function matchesPattern(url: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{DOUBLE_STAR\}\}/g, ".*");

  const regex = new RegExp("^" + escaped + "$", "i");
  return regex.test(url);
}

// ─── Network Policy Checker ──────────────────────────────────────────────────

export class NetworkPolicyChecker {
  private policy: SandboxNetworkPolicy;
  private activeRequests: number = 0;
  private log: NetworkLogEntry[] = [];

  constructor(policy: SandboxNetworkPolicy) {
    this.policy = policy;
  }

  /** Check if a URL is allowed by this policy */
  checkUrl(url: string): { allowed: boolean; reason?: string } {
    // Check if fetch is disabled entirely
    if (!this.policy.allowFetch) {
      return { allowed: false, reason: "Fetch/XHR disabled by policy" };
    }

    // Check WebSocket
    if (url.startsWith("ws://") || url.startsWith("wss://")) {
      if (!this.policy.allowWebSockets) {
        return { allowed: false, reason: "WebSocket connections disabled by policy" };
      }
    }

    // Allow all if configured
    if (this.policy.allowAll) {
      // Still check block patterns
      for (const blockPattern of this.policy.blockPatterns) {
        if (matchesPattern(url, blockPattern)) {
          return { allowed: false, reason: `Blocked by pattern: ${blockPattern}` };
        }
      }
      return { allowed: true };
    }

    // Check block patterns first (block overrides allow)
    for (const blockPattern of this.policy.blockPatterns) {
      if (matchesPattern(url, blockPattern)) {
        return { allowed: false, reason: `Blocked by pattern: ${blockPattern}` };
      }
    }

    // Check allow patterns
    for (const allowPattern of this.policy.allowPatterns) {
      if (matchesPattern(url, allowPattern)) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: "URL not in allowlist" };
  }

  /** Check if a new request can be made (concurrency limit) */
  canMakeRequest(): { allowed: boolean; reason?: string } {
    if (this.activeRequests >= this.policy.maxConcurrentRequests) {
      return {
        allowed: false,
        reason: `Max concurrent requests (${this.policy.maxConcurrentRequests}) reached`,
      };
    }
    return { allowed: true };
  }

  /** Record that a request started */
  onRequestStart(): void {
    this.activeRequests++;
  }

  /** Record that a request completed */
  onRequestComplete(entry: NetworkLogEntry): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.log.push(entry);
  }

  /** Get the full network log */
  getLog(): NetworkLogEntry[] {
    return [...this.log];
  }

  /** Get current active request count */
  getActiveRequestCount(): number {
    return this.activeRequests;
  }

  /** Get traffic summary */
  getSummary(): {
    totalRequests: number;
    allowedRequests: number;
    blockedRequests: number;
    avgDurationMs: number;
    totalBytesIn: number;
    totalBytesOut: number;
    topDomains: Array<{ domain: string; count: number }>;
  } {
    const total = this.log.length;
    const allowed = this.log.filter(e => !e.blocked).length;
    const blocked = total - allowed;
    const avgDuration = total > 0
      ? this.log.reduce((sum, e) => sum + e.durationMs, 0) / total
      : 0;
    const totalBytesIn = this.log.reduce((sum, e) => sum + e.responseSize, 0);
    const totalBytesOut = this.log.reduce((sum, e) => sum + e.requestSize, 0);

    // Count domains
    const domainCounts: Record<string, number> = {};
    for (const entry of this.log) {
      try {
        const domain = new URL(entry.url).hostname;
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      } catch {
        // invalid URL
      }
    }
    const topDomains = Object.entries(domainCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRequests: total,
      allowedRequests: allowed,
      blockedRequests: blocked,
      avgDurationMs: Math.round(avgDuration),
      totalBytesIn,
      totalBytesOut,
      topDomains,
    };
  }

  /** Update the policy */
  setPolicy(policy: SandboxNetworkPolicy): void {
    this.policy = policy;
  }

  /** Get current policy */
  getPolicy(): SandboxNetworkPolicy {
    return { ...this.policy };
  }
}

// ─── Intercept Fetch (for sandbox injection) ─────────────────────────────────

/**
 * Returns JavaScript code that intercepts fetch and XMLHttpRequest
 * inside a sandboxed worker, enforcing the network policy.
 */
export function generateNetworkInterceptor(policy: SandboxNetworkPolicy): string {
  const policyJson = JSON.stringify(policy);
  const parts = [
    "(function() {",
    "  var POLICY = " + policyJson + ";",
    "  var BLOCKED_LOG = [];",
    "",
    "  function matchesGlob(url, pattern) {",
    "    var escaped = pattern",
    "      .replace(/[.+^{}()|[\\\\]\\]/g, '\\\\$&')",
    "      .replace(/\\\\\\\\*/g, '{{DBLSTAR}}')",
    "      .replace(/\\\\*/g, '[^/]*')",
    "      .replace(/\\\\?/g, '[^/]')",
    "      .replace(/\\{\\{DBLSTAR\\}\\}/g, '.*');",
    "    return new RegExp('^' + escaped + '$', 'i').test(url);",
    "  }",
    "",
    "  function isAllowed(url) {",
    "    if (!POLICY.allowFetch) return false;",
    "    if (url.startsWith('ws://') || url.startsWith('wss://')) return POLICY.allowWebSockets;",
    "    if (POLICY.allowAll) {",
    "      return !POLICY.blockPatterns.some(function(p) { return matchesGlob(url, p); });",
    "    }",
    "    if (POLICY.blockPatterns.some(function(p) { return matchesGlob(url, p); })) return false;",
    "    return POLICY.allowPatterns.some(function(p) { return matchesGlob(url, p); });",
    "  }",
    "",
    "  var origFetch = globalThis.fetch;",
    "  globalThis.fetch = function(url, opts) {",
    "    var urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : String(url);",
    "    if (!isAllowed(urlStr)) {",
    "      BLOCKED_LOG.push({ url: urlStr, time: Date.now(), reason: 'blocked' });",
    "      return Promise.reject(new Error('Network blocked by sandbox policy: ' + urlStr));",
    "    }",
    "    return origFetch.call(this, url, opts);",
    "  };",
    "",
    "  var origOpen = XMLHttpRequest.prototype.open;",
    "  XMLHttpRequest.prototype.open = function(method, url) {",
    "    var urlStr = typeof url === 'string' ? url : String(url);",
    "    if (!isAllowed(urlStr)) {",
    "      BLOCKED_LOG.push({ url: urlStr, time: Date.now(), reason: 'blocked' });",
    "      throw new Error('Network blocked by sandbox policy: ' + urlStr);",
    "    }",
    "    return origOpen.apply(this, arguments);",
    "  };",
    "",
    "  globalThis.__SANDBOX_NETWORK_LOG = BLOCKED_LOG;",
    "})();",
  ];
  return parts.join("\n");
}
