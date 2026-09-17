import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy, KeyRound, Server } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type TryState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string; reason: string }
  | { status: "done"; base64: string; format: string; bytes: number };

const PARAMS: Array<[string, string, string]> = [
  ["url", "string", "Required. Public http(s) URL. SSRF rules block private networks, loopback and credential-bearing URLs."],
  ["format", "png | webp | jpeg", "Output encoding (default png)."],
  ["full_page", "bool", "Capture the whole scrollable page instead of the viewport (default false)."],
  ["viewport_width", "int", "Viewport width in CSS px (default 1440, clamped)."],
  ["viewport_height", "int", "Viewport height in CSS px (default 900, clamped)."],
  ["device_scale_factor", "float", "HiDPI factor 1–3 (default 1, clamped)."],
  ["quality", "int", "1–100, for webp/jpeg only (default 90)."],
  ["block_ads", "bool", "Block known ad/tracker hosts in the browser (default true)."],
  ["omit_background", "bool", "Transparent background where the page has none (default false)."],
  ["wait_until", "load | domcontentloaded | networkidle", "Readiness before capturing (default load)."],
  ["selector", "string", "Wait for this CSS selector to exist before capturing."],
  ["delay", "int", "Extra settle time in ms after readiness (default 100)."],
  ["timeout", "int", "Capture budget in ms (default 30000, clamped)."],
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950">
      <pre className="overflow-x-auto p-4 text-[12px] leading-6 text-zinc-300">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(code).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function TryPanel() {
  const captureUrl = useAction(api.captureUrl.captureUrl);
  const { isAuthenticated, isLoading } = useAuth();
  const [url, setUrl] = useState("https://example.com");
  const [format, setFormat] = useState<"png" | "webp">("png");
  const [fullPage, setFullPage] = useState(false);
  const [state, setState] = useState<TryState>({ status: "idle" });

  const run = async () => {
    setState({ status: "running" });
    const res = await captureUrl({
      url,
      format,
      fullPage,
      width: 1280,
      height: 800,
      scale: 1,
    });
    if (res.ok) {
      setState({
        status: "done",
        base64: res.base64,
        format: res.format,
        bytes: Math.round((res.base64.length * 3) / 4),
      });
    } else {
      setState({ status: "error", reason: res.reason, message: res.message ?? res.reason });
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50/60 px-6 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          Try it live
        </p>
        <p className="mt-1 text-[13px] text-zinc-500">
          Renders through your configured capture service (the Convex action
          used by the app's URL captures).
        </p>
      </div>
      <div className="space-y-4 px-6 py-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isLoading && isAuthenticated && run()}
            placeholder="https://example.com"
            className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 outline-none transition-colors focus:border-zinc-900"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "png" | "webp")}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-700 outline-none focus:border-zinc-900"
          >
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
          </select>
          <button
            onClick={() => setFullPage((v) => !v)}
            className={cn(
              "rounded-md border px-3 py-2 text-[13px] font-medium transition-colors",
              fullPage
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400",
            )}
          >
            Full page
          </button>
          <button
            onClick={run}
            disabled={!isAuthenticated || state.status === "running"}
            className="rounded-md bg-zinc-900 px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.status === "running" ? "Capturing…" : "Capture"}
          </button>
        </div>

        {isLoading ? null : !isAuthenticated ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[12.5px] leading-5 text-zinc-600">
            Sign in to run captures from this page — or call the service
            directly with curl (no account needed).{" "}
            <Link
              to="/auth?returnTo=%2Fapi"
              className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
            >
              Sign in →
            </Link>
          </p>
        ) : state.status === "error" ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
            <p className="text-[12.5px] font-medium text-red-700">
              {state.reason === "missing-service"
                ? "The capture service isn't configured yet"
                : state.reason === "invalid-key"
                  ? "The capture service rejected the API key"
                  : state.reason === "unauthorized"
                    ? "Not signed in"
                    : `Capture failed (${state.reason})`}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-red-600/90">{state.message}</p>
            {state.reason === "missing-service" && (
              <p className="mt-2 text-[12px] leading-5 text-red-600/90">
                Set <code className="font-mono text-[11px]">CAPTURE_SERVICE_URL</code>{" "}
                and{" "}
                <code className="font-mono text-[11px]">CAPTURE_SERVICE_API_KEY</code>{" "}
                in the project's Keys tab, then retry. The demo-page capture in
                the dashboard works without any of this.
              </p>
            )}
          </div>
        ) : state.status === "done" ? (
          <div className="rounded-md border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/60 px-3 py-2">
              <p className="font-mono text-[11px] text-zinc-500">
                {(state.bytes / 1024).toFixed(1)} KB · {state.format.toUpperCase()}
              </p>
              <Link
                to="/auth?returnTo=%2Fdashboard"
                className="text-[11px] font-medium text-zinc-700 underline-offset-2 hover:underline"
              >
                Annotate it in the studio →
              </Link>
            </div>
            <img
              src={`data:image/${state.format};base64,${state.base64}`}
              alt={`Screenshot of ${url}`}
              className="block w-full"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Nav */}
      <SiteNav />

      {/* Hero */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-20 md:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-[12px] font-medium text-zinc-500">
              <span className="size-1.5 rounded-full bg-zinc-900" />
              Open source · MIT · self-hosted
            </p>
            <h1 className="mt-7 font-serif text-[40px] leading-[1.05] tracking-tight text-zinc-900 md:text-[60px]">
              The capture API, on your own hardware.
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-8 text-zinc-500">
              One HTTP call renders any public page in headless Chromium and
              returns the image bytes — PNG, WebP or JPEG, viewport or full
              page. It's the engine behind stitaP's URL captures, and it runs
              entirely on machines you control.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#self-host"
                className="group inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700"
              >
                <Server className="size-4" />
                Deploy it yourself
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#reference"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-5 py-3 text-[14px] font-medium text-zinc-700 transition-colors hover:border-zinc-900"
              >
                <KeyRound className="size-4" />
                API reference
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Try it */}
      <section id="try" className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
              Live demo
            </p>
            <h2 className="mt-4 font-serif text-3xl tracking-tight text-zinc-900">
              One request, image bytes back.
            </h2>
            <div className="mt-8">
              <TryPanel />
            </div>
          </motion.div>
        </div>
      </section>

      {/* API reference */}
      <section id="reference" className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            API reference
          </p>
          <h2 className="mt-4 font-serif text-3xl tracking-tight text-zinc-900">
            ScreenshotOne-compatible, zero lock-in.
          </h2>

          <div className="mt-8 space-y-4">
            <CodeBlock
              code={`curl "http://localhost:8080/v1/capture?url=https://example.com&format=png&full_page=true&viewport_width=1440" \\
  -H "Authorization: Bearer $CAPTURE_API_KEY" \\
  -o shot.png`}
            />
            <CodeBlock
              code={`# POST accepts the same parameters as JSON
curl -X POST "http://localhost:8080/v1/capture" \\
  -H "Authorization: Bearer $CAPTURE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "format": "webp", "full_page": false}' \\
  -o shot.webp`}
            />
          </div>

          <div className="mt-10 overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/60">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Parameter
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Type
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {PARAMS.map(([name, type, notes]) => (
                  <tr key={name} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-[12.5px] text-zinc-900">{name}</td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-zinc-500">{type}</td>
                    <td className="px-4 py-3 text-[12.5px] leading-5 text-zinc-600">{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Self-host */}
      <section id="self-host" className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Self-host
          </p>
          <h2 className="mt-4 max-w-lg font-serif text-3xl tracking-tight text-zinc-900">
            One command, everything included.
          </h2>
          <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
            The service ships as a Docker image with Chromium and its system
            libraries baked in. It runs as a non-root user, closes a fresh
            browser after every request, and never touches your local network.
          </p>

          <div className="mt-8 space-y-4">
            <CodeBlock
              code={`# from the repository root
docker compose up --build capture-service
# → capture-service listening on http://localhost:8080`}
            />
            <CodeBlock
              code={`# point the stitaP app at it (project Keys/API keys tab):
CAPTURE_SERVICE_URL=http://localhost:8080
CAPTURE_SERVICE_API_KEY=change-me   # any key from CAPTURE_API_KEYS`}
            />
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 md:grid-cols-3">
            {[
              ["Full-page + viewport", "Lazy content is triggered by walking the page; animations, transitions and carets are frozen; video is paused before the shot."],
              ["Ad-blocking browser", "Known ad/tracker hosts are aborted inside Chromium, so third-party payloads never load and the shot is cleaner."],
              ["Hard budgets", "Per-request timeouts, clamped viewport/scale limits, a configurable full-page height cap, and an optional rate limit."],
            ].map(([t, b]) => (
              <div key={t} className="flex flex-col bg-white p-7">
                <h3 className="text-[15px] font-semibold text-zinc-900">{t}</h3>
                <p className="mt-2 text-[12.5px] leading-6 text-zinc-500">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Security
          </p>
          <h2 className="mt-4 max-w-lg font-serif text-3xl tracking-tight text-zinc-900">
            The page is untrusted. Treat it that way.
          </h2>
          <ul className="mt-8 max-w-2xl space-y-4">
            {[
              ["SSRF guard at the edge", "Scheme allowlist, private-network / loopback / link-local / CGNAT blocks, credential rejection — enforced by the service and re-enforced by the app's Convex action before every request."],
              ["One browser per request", "A fresh Chromium context per capture, closed in a finally block. No cookies, no storage, no shared state between requests."],
              ["Static output only", "The response is an image file. Scripts and markup from the page never reach your clients."],
              ["API keys + rate limits", "Bearer / access_key auth against CAPTURE_API_KEYS and a per-identity rate limit keep the browser worker from being a free-for-all."],
            ].map(([t, b]) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-zinc-900" />
                <div>
                  <p className="text-[13.5px] font-medium text-zinc-800">{t}</p>
                  <p className="text-[12.5px] leading-5 text-zinc-500">{b}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
