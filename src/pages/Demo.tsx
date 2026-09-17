/**
 * Demo documentation page — the built-in capture target.
 *
 * Rendered two ways:
 *  1. Standalone at /demo (window scrolling).
 *  2. Inside the workspace's isolated scroll stage (the workspace passes the
 *     scroll container as `scrollRoot`, which the lazy sections use as their
 *     IntersectionObserver root).
 *
 * The page is intentionally tall (~7,000px) so the capture engine exercises
 * incremental lazy scrolling and emits a tiled SVG with multiple <image>
 * elements. It uses sticky (not fixed) positioning so a single full-page
 * raster contains exactly one header.
 */

import { createContext, useContext, useEffect, useRef } from "react";
import { Link } from "react-router";
import { useInView } from "react-intersection-observer";
import { cn } from "@/lib/utils";

const DemoScrollContext = createContext<HTMLElement | null>(null);

/* ------------------------------------------------------------------ */
/* Small building blocks                                                */
/* ------------------------------------------------------------------ */

function Reveal({
  className,
  children,
  delayMs = 0,
}: {
  className?: string;
  children: React.ReactNode;
  delayMs?: number;
}) {
  const root = useContext(DemoScrollContext);
  const { ref, inView } = useInView({
    root,
    rootMargin: "220px 0px",
    triggerOnce: true,
  });
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={cn(
        "transition-all duration-700 ease-out",
        inView ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function LazyImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const root = useContext(DemoScrollContext);
  const { ref, inView } = useInView({
    root,
    rootMargin: "300px 0px",
    triggerOnce: true,
  });
  return (
    <div ref={ref} className={className}>
      {inView && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

function BarChartCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = 640;
    const h = 280;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const bars = [42, 68, 54, 86, 71, 93, 64, 78, 59, 88, 73, 96];
    const pad = 34;
    const bw = (w - pad * 2) / bars.length;
    const max = 100;
    ctx.textAlign = "center";
    for (let i = 0; i < bars.length; i++) {
      const v = bars[i];
      const bh = (v / max) * (h - 64);
      const x = pad + i * bw + bw / 2;
      const y = h - 40 - bh;
      const grad = ctx.createLinearGradient(0, y, 0, h - 40);
      grad.addColorStop(0, "#27272a");
      grad.addColorStop(1, "#a1a1aa");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x - bw * 0.28, y, bw * 0.56, bh, 4);
      ctx.fill();
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillText(String(v), x, y - 6);
    }
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, h - 40);
    ctx.lineTo(w - pad, h - 40);
    ctx.stroke();
  }, []);
  return (
    <canvas
      ref={ref}
      width={640}
      height={280}
      className="w-full rounded-lg border border-zinc-200 bg-white"
    />
  );
}

/* ------------------------------------------------------------------ */
/* The demo site                                                        */
/* ------------------------------------------------------------------ */

export function DemoSite({ scrollRoot }: { scrollRoot?: HTMLElement | null }) {
  return (
    <DemoScrollContext.Provider value={scrollRoot ?? null}>
      <div
        data-stitap-capture-root
        className="min-h-screen bg-white font-sans text-zinc-900 antialiased"
      >
        {/* Sticky header — appears once in a full-page capture */}
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
            <div className="flex items-center gap-8">
              <a href="#top" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <span className="grid h-6 w-6 place-items-center rounded border border-zinc-900 bg-zinc-900 text-[10px] font-bold text-white">
                  V
                </span>
                stitaP Docs
              </a>
              <nav className="hidden items-center gap-6 text-[13px] text-zinc-500 md:flex">
                <a href="#features" className="hover:text-zinc-900">Features</a>
                <a href="#guides" className="hover:text-zinc-900">Guides</a>
                <a href="#reference" className="hover:text-zinc-900">Reference</a>
                <a href="#pricing" className="hover:text-zinc-900">Pricing</a>
                <a href="#changelog" className="hover:text-zinc-900">Changelog</a>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-[12px] text-zinc-400 sm:flex">
                <span className="text-zinc-300">⌘</span> Search docs…
              </div>
              <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-700">
                Get started
              </button>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section id="top" className="border-b border-zinc-200 bg-[#fafaf9]">
          <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 md:pt-24">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] font-medium text-amber-800">
              <span className="size-1.5 rounded-full bg-amber-500" />
              v2.4 — SVG capture for documentation
            </div>
            <h1 className="mt-6 max-w-2xl font-serif text-4xl leading-[1.1] tracking-tight text-zinc-900 md:text-[54px]">
              Every page, rebuilt as an editable SVG.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-zinc-500">
              stitaP renders any website in a real browser, tiles the result,
              and packages it as a portable SVG — annotations, metadata, and
              all. Built for documentation teams who need images that scale to
              any medium.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button className="rounded-md bg-zinc-900 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-700">
                Start capturing
              </button>
              <button className="rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-[13px] font-medium text-zinc-700 hover:border-zinc-900">
                Read the guide
              </button>
            </div>
            <p className="mt-6 text-[12px] text-zinc-400">
              No credit card · 100 free captures · MIT-style output license
            </p>
          </div>
        </section>

        {/* Logos strip */}
        <section className="border-b border-zinc-200">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-6">
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              Trusted by docs teams at
            </span>
            {["Northwind", "Acme Corp", "Planetary", "Framewrk", "Lumen"].map(
              (name) => (
                <span
                  key={name}
                  className="font-serif text-[15px] font-semibold text-zinc-400"
                >
                  {name}
                </span>
              ),
            )}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Capture modes
              </p>
              <h2 className="mt-3 max-w-lg font-serif text-3xl tracking-tight text-zinc-900">
                Three output guarantees, one capture engine.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 md:grid-cols-3">
              {[
                {
                  tag: "Portable image SVG",
                  title: "Pixel-perfect, universally compatible",
                  body: "The rendered page is embedded as a raster inside an SVG canvas, then annotated with native vector elements. Works in any <img> tag, anywhere.",
                  accent: true,
                },
                {
                  tag: "Hybrid editable SVG",
                  title: "Vector where it counts",
                  body: "Headings become text, buttons become rects, charts stay raster. Moderate editability with high fidelity. Shipping in a later release.",
                  accent: false,
                },
                {
                  tag: "Native vector",
                  title: "Experimental reconstruction",
                  body: "Nearly everything becomes a vector object. Text layout and complex CSS are hard — this mode is explicitly not pixel-perfect.",
                  accent: false,
                },
              ].map((f) => (
                <div key={f.tag} className="bg-white p-7">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                      f.accent
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-500",
                    )}
                  >
                    {f.tag}
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-zinc-900">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="guides" className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <h2 className="font-serif text-3xl tracking-tight text-zinc-900">
                How a capture works
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-10 md:grid-cols-4">
              {[
                ["01", "Normalize", "The request is validated, clamped and made immutable."],
                ["02", "Render", "A real browser loads the page and waits for stability."],
                ["03", "Tile", "Lazy content is loaded, the page frozen and captured in tiles."],
                ["04", "Package", "Raster meets vector in a sanitized, validated SVG."],
              ].map(([n, t, b]) => (
                <Reveal key={n} delayMs={80}>
                  <div className="border-t border-zinc-300 pt-4">
                    <span className="font-serif text-[28px] text-zinc-300">{n}</span>
                    <h3 className="mt-3 text-[15px] font-semibold text-zinc-900">
                      {t}
                    </h3>
                    <p className="mt-2 text-[13px] leading-6 text-zinc-500">{b}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Canvas chart */}
        <section id="reference" className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Reference
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-zinc-900">
                Capture throughput, last twelve weeks
              </h2>
            </Reveal>
            <Reveal delayMs={120} className="mt-8">
              <BarChartCanvas />
              <p className="mt-3 text-[12px] text-zinc-400">
                Canvas regions are rasterized into the SVG and marked as
                raster-only content.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Code */}
        <section className="border-b border-zinc-200 bg-[#fafaf9]">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
            <div>
              <Reveal>
                <h2 className="font-serif text-3xl tracking-tight text-zinc-900">
                  One tag in your docs.
                </h2>
                <p className="mt-4 max-w-sm text-[14px] leading-7 text-zinc-500">
                  The published SVG is a self-contained file. Drop it into any
                  page, any medium — print, PDF, slide decks, email.
                </p>
              </Reveal>
            </div>
            <Reveal delayMs={120}>
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 shadow-sm">
                <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
                  <span className="size-2 rounded-full bg-zinc-700" />
                  <span className="size-2 rounded-full bg-zinc-700" />
                  <span className="size-2 rounded-full bg-zinc-700" />
                  <span className="ml-2 text-[11px] text-zinc-500">
                    guide.html
                  </span>
                </div>
                <pre className="overflow-x-auto p-4 text-[12px] leading-6 text-zinc-200">
                  <code>
                    <span className="text-amber-300">&lt;figure</span>{" "}
                    <span className="text-zinc-400">class=</span>
                    <span className="text-emerald-300">"capture"</span>
                    <span className="text-amber-300">&gt;</span>
                    {"\n  "}
                    <span className="text-amber-300">&lt;img</span>{" "}
                    <span className="text-zinc-400">src=</span>
                    <span className="text-emerald-300">"/pages/settings.svg"</span>
                    {"\n       "}
                    <span className="text-zinc-400">width=</span>
                    <span className="text-emerald-300">"1440"</span>{" "}
                    <span className="text-zinc-400">height=</span>
                    <span className="text-emerald-300">"4200"</span>
                    {"\n       "}
                    <span className="text-zinc-400">loading=</span>
                    <span className="text-emerald-300">"lazy"</span>{" "}
                    <span className="text-zinc-400">decoding=</span>
                    <span className="text-emerald-300">"async"</span>{" "}
                    <span className="text-amber-300">/&gt;</span>
                    {"\n  "}
                    <span className="text-amber-300">&lt;figcaption&gt;</span>
                    Account settings — step 3
                    <span className="text-amber-300">&lt;/figcaption&gt;</span>
                    {"\n"}
                    <span className="text-amber-300">&lt;/figure&gt;</span>
                  </code>
                </pre>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing table */}
        <section id="pricing" className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <h2 className="font-serif text-3xl tracking-tight text-zinc-900">
                Plans
              </h2>
              <p className="mt-3 text-[14px] text-zinc-500">
                Everything includes unlimited annotations and SVG exports.
              </p>
            </Reveal>
            <Reveal delayMs={120} className="mt-10 overflow-hidden rounded-xl border border-zinc-200">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-zinc-200 bg-[#fafaf9] text-[12px] uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Feature</th>
                    <th className="px-5 py-3 font-medium">Starter</th>
                    <th className="px-5 py-3 font-medium">Pro</th>
                    <th className="px-5 py-3 font-medium">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[
                    ["Captures / month", "100", "5,000", "Unlimited"],
                    ["Full-page & viewport", "Yes", "Yes", "Yes"],
                    ["Hybrid SVG editing", "—", "Yes", "Yes"],
                    ["Redaction & audit", "—", "Yes", "Yes"],
                    ["SSO & policy engine", "—", "—", "Yes"],
                  ].map(([f, a, b, c]) => (
                    <tr key={f} className="bg-white">
                      <td className="px-5 py-3.5 font-medium text-zinc-700">{f}</td>
                      <td className="px-5 py-3.5 text-zinc-500">{a}</td>
                      <td className="px-5 py-3.5 text-zinc-500">{b}</td>
                      <td className="px-5 py-3.5 text-zinc-500">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        {/* Lazy-loaded changelog */}
        <section id="changelog" className="border-b border-zinc-200 bg-[#fafaf9]">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Lazy-loaded on scroll
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-zinc-900">
                Changelog
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                ["v2.4", "Tiled SVG output for pages over 4,000px", "Aug 2026"],
                ["v2.3", "Step-sequence capture with auto captions", "Jul 2026"],
                ["v2.2", "Secure redaction with verification reports", "Jun 2026"],
                ["v2.1", "Hybrid SVG: first vector conversions", "May 2026"],
                ["v2.0", "Portable Image SVG + annotation engine", "Apr 2026"],
                ["v1.9", "Infinite-scroll limits and pass tracking", "Mar 2026"],
              ].map(([v, t, d], i) => (
                <Reveal key={v} delayMs={i * 60}>
                  <div className="rounded-xl border border-zinc-200 bg-white p-5">
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-600">
                        {v}
                      </span>
                      <span className="text-[11px] text-zinc-400">{d}</span>
                    </div>
                    <p className="mt-3 text-[13px] leading-6 text-zinc-700">{t}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Lazy image banner */}
        <section className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <div className="relative h-72 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900 md:h-80">
                <LazyImage
                  className="absolute inset-0"
                  src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='1200'%20height='400'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0'%20y1='0'%20x2='1'%20y2='1'%3E%3Cstop%20offset='0'%20stop-color='%2327272a'/%3E%3Cstop%20offset='1'%20stop-color='%2371717a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='1200'%20height='400'%20fill='url(%23g)'/%3E%3Ctext%20x='60'%20y='180'%20font-family='Georgia,serif'%20font-size='42'%20fill='%23fafaf9'%3ECapture%20the%20whole%20page.%3C/text%3E%3Ctext%20x='60'%20y='230'%20font-family='sans-serif'%20font-size='18'%20fill='%23a1a1aa'%3EIncluding%20everything%20below%20the%20fold.%3C/text%3E%3C/svg%3E"
                  alt="Capture the whole page"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-900/80 to-transparent p-6">
                  <p className="text-[13px] font-medium text-white">
                    Lazy images load only when they approach the viewport — the
                    capture engine scrolls incrementally to trigger them.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* CTA + footer */}
        <section className="bg-zinc-950 text-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <h2 className="max-w-xl font-serif text-3xl tracking-tight md:text-4xl">
                Ship documentation images that never pixelate.
              </h2>
              <div className="mt-8 flex flex-wrap gap-3">
                <button className="rounded-md bg-white px-5 py-2.5 text-[13px] font-medium text-zinc-900 hover:bg-zinc-200">
                  Start capturing
                </button>
                <button className="rounded-md border border-white/20 px-5 py-2.5 text-[13px] font-medium text-zinc-300 hover:border-white/60">
                  Book a demo
                </button>
              </div>
            </Reveal>
            <div className="mt-16 flex flex-col items-start justify-between gap-6 border-t border-white/10 pt-8 text-[12px] text-zinc-500 md:flex-row md:items-center">
              <span>© 2026 stitaP Capture Systems, Inc.</span>
              <div className="flex gap-6">
                <a href="#top" className="hover:text-white">Docs</a>
                <a href="#top" className="hover:text-white">API</a>
                <a href="#top" className="hover:text-white">Status</a>
                <a href="#top" className="hover:text-white">Privacy</a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </DemoScrollContext.Provider>
  );
}

export default function DemoPage() {
  return (
    <div className="bg-white">
      {/* Floating exit bar - the demo renders a fake target site with no site
          navigation of its own, so give the user an explicit way out. */}
      <div className="fixed inset-x-0 bottom-0 z-[9999] flex flex-wrap items-center justify-center gap-3 border-t border-zinc-200 bg-zinc-950/95 px-4 py-2.5 backdrop-blur">
        <span className="text-xs text-zinc-400">
          This page is a simulated website used by the capture demo — it has no real navigation.
        </span>
        <Link
          to="/"
          className="stitap-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          ← Back to stitaP
        </Link>
        <Link
          to="/features"
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
        >
          Capture features
        </Link>
        <Link
          to="/docs"
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
        >
          Documentation
        </Link>
      </div>
      <DemoSite />
    </div>
  );
}
