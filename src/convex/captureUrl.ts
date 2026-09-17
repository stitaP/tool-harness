"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { evaluateUrlPolicy } from "../lib/capture/policy";
import {
  MAX_REDIRECT_HOPS,
  validateCaptureUrl,
  validateRedirectTarget,
} from "../lib/capture/urlSecurity";

/**
 * URL capture action backed by the self-hosted capture service
 * (`engines/` in this repo — the from-scratch Rust engine: our own HTTP
 * server, WebSocket client, CDP browser client and PNG decoder, zero
 * external crates; the only external piece is the Chromium binary).
 *
 * Configure it in the project's Keys/API keys tab:
 *   CAPTURE_SERVICE_URL     e.g. http://localhost:8080  (required)
 *   CAPTURE_SERVICE_API_KEY any key from the service's CAPTURE_API_KEYS
 *                           (omit only if the service runs in open mode)
 *
 * Without a service URL the action returns `{ ok: false, reason: "missing-service" }`
 * and the app surfaces setup guidance. The action re-validates every URL
 * server-side (scheme allowlist, private-network / SSRF blocks) and walks the
 * redirect chain hop-by-hop before anything is forwarded to the service.
 */

export type CaptureUrlResult =
  | { ok: true; base64: string; format: "png" | "webp" }
  | { ok: false; reason: string; message?: string };

/**
 * Walk the redirect chain with `redirect: "manual"` so every `Location` is
 * re-validated (scheme allowlist, private networks, credentials) before it
 * is followed — a public URL may redirect to a private or credential-bearing
 * target. Best-effort: if the probe itself fails, the original validated URL
 * is forwarded unchanged (the capture service's browser is the one fetching it).
 */
async function resolveRedirectsSafely(initial: string): Promise<{ ok: boolean; url: string; reason?: string }> {
  let current = initial;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let res: Response;
    try {
      res = await globalThis.fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": "stitap-redirect-probe" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { ok: true, url: initial }; // probe failed — keep the validated original
    }
    const status = res.status;
    if (status >= 300 && status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!location) return { ok: true, url: initial }; // 3xx without Location: pass through
      const target = validateRedirectTarget(location, current);
      if (!target.ok) return { ok: false, url: current, reason: target.reason };
      current = target.url;
      continue;
    }
    await res.body?.cancel().catch(() => undefined);
    return { ok: true, url: current };
  }
  return { ok: false, url: current, reason: `redirect chain exceeds ${MAX_REDIRECT_HOPS} hops` };
}

export const captureUrl = action({
  args: {
    url: v.string(),
    format: v.union(v.literal("png"), v.literal("webp")),
    fullPage: v.boolean(),
    width: v.number(),
    height: v.number(),
    scale: v.number(),
  },
  handler: async (ctx, args): Promise<CaptureUrlResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, reason: "unauthorized" };

    const base = (process.env.CAPTURE_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
    if (!base) {
      return {
        ok: false,
        reason: "missing-service",
        message:
          "URL capture needs the self-hosted capture service. Set CAPTURE_SERVICE_URL (and CAPTURE_SERVICE_API_KEY) in the project's Keys tab — see /api for the one-command docker setup.",
      };
    }
    if (!/^https?:\/\//.test(base)) {
      return {
        ok: false,
        reason: "bad-service-url",
        message: "CAPTURE_SERVICE_URL must start with http:// or https://.",
      };
    }
    const apiKey = (process.env.CAPTURE_SERVICE_API_KEY ?? "").trim();

    const check = validateCaptureUrl(args.url);
    if (!check.ok) return { ok: false, reason: `blocked: ${check.reason}` };

    // Enterprise policy (Phase 7) — evaluated *after* the SSRF guard so
    // allowlists only ever see public, http(s), credential-free URLs.
    const policy = await ctx.runQuery(internal.policy.internalPolicyForUser, {
      userId,
    });
    if (policy) {
      const mode = args.fullPage ? "full-page" : "viewport";
      if (policy.allowedModes.length > 0 && !policy.allowedModes.includes(mode)) {
        return {
          ok: false,
          reason: `blocked: capture mode "${mode}" is disabled by policy`,
        };
      }
      const policyCheck = evaluateUrlPolicy(check.url, policy);
      if (!policyCheck.ok) {
        return { ok: false, reason: `blocked: ${policyCheck.reason}` };
      }
    }

    // Redirect re-validation: follow the chain with per-hop checks so the
    // capture service only ever receives a URL that passed the same rules.
    const resolved = await resolveRedirectsSafely(check.url);
    if (!resolved.ok) {
      return { ok: false, reason: `blocked: redirect target ${resolved.reason}` };
    }

    const params = new URLSearchParams({
      url: resolved.url,
      format: args.format,
      full_page: args.fullPage ? "true" : "false",
      viewport_width: String(Math.round(args.width) || 1440),
      viewport_height: String(Math.round(args.height) || 900),
      device_scale_factor: String(args.scale || 1),
      block_ads: "true",
      wait_until: "load",
      timeout: "60000",
      omit_background: "false",
    });

    let res: Response;
    try {
      res = await globalThis.fetch(`${base}/v1/capture?${params.toString()}`, {
        headers: apiKey
          ? { authorization: `Bearer ${apiKey}`, accept: "image/png, image/webp" }
          : { accept: "image/png, image/webp" },
        signal: AbortSignal.timeout(80_000),
      });
    } catch {
      return {
        ok: false,
        reason: "network",
        message:
          "The capture service could not be reached. Is it running and is CAPTURE_SERVICE_URL correct?",
      };
    }

    if (!res.ok) {
      let message = `The capture service returned HTTP ${res.status}.`;
      const body = await res.text().catch(() => "");
      try {
        const json = JSON.parse(body) as { message?: string };
        if (json.message) message = json.message;
      } catch {
        if (body) message = body.slice(0, 400);
      }
      const reason =
        res.status === 401
          ? "invalid-key"
          : res.status === 429
            ? "rate-limited"
            : res.status === 413
              ? "too-large"
              : res.status === 504
                ? "timeout"
                : `http-${res.status}`;
      return { ok: false, reason, message };
    }

    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    // Keep action results under Convex limits; oversized pages fail cleanly.
    if (base64.length > 750_000) {
      return {
        ok: false,
        reason: "too-large",
        message:
          "The captured page produced an image too large to return. Try viewport mode or a smaller device scale factor.",
      };
    }

    // Audit the remote capture (Phase 7).
    await ctx.runMutation(internal.policy.recordAuditInternal, {
      userId,
      action: "capture.url",
      detail: `Captured ${resolved.url.slice(0, 200)} (${args.format}, ${args.fullPage ? "full-page" : "viewport"}).`,
    });
    return { ok: true, base64, format: args.format };
  },
});
