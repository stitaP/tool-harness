import { Link } from "react-router";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: "Products",
    links: [
      { label: "Image Capture", href: "/features#capture" },
      { label: "Screen Recorder", href: "/recorder" },
      { label: "Video Editor", href: "/editor" },
      { label: "SLM Tutorial Studio", href: "/tools" },
    ],
  },
  {
    title: "Agent Platform",
    links: [
      { label: "Tool Store", href: "/store" },
      { label: "Modules Notebook", href: "/modules" },
      { label: "Agent Harness", href: "/agents" },
      { label: "Swarm Engine", href: "/modules#swarm" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Platform Overview", href: "/overview" },
      { label: "Documentation", href: "/docs" },
      { label: "Tool Reference", href: "/docs/tools" },
      { label: "PDF Manual (full download)", href: "/docs/pdf" },
      { label: "Interactive Guide", href: "/guide" },
      { label: "Help Center", href: "/help" },
      { label: "API Reference", href: "/api" },
    ],
  },
  {
    title: "Get stitaP",
    links: [
      { label: "Downloads — Win / Mac / Linux", href: "/downloads" },
      { label: "Web App", href: "/store" },
      { label: "Live Demo", href: "/demo" },
      { label: "Features", href: "/features" },
    ],
  },
];

/** Unified site footer shared across all public pages. */
export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="stitap-gradient grid size-8 place-items-center rounded-lg text-[13px] font-black text-white">S</span>
              <span className="text-[15px] font-bold tracking-tight text-white">stitaP</span>
            </div>
            <p className="mt-4 max-w-xs text-[12px] leading-6 text-zinc-500">
              The self-contained agentic AI tool harness. 350+ in-house tools,
              swarm orchestration, and an inference router that runs from a
              laptop to an air-gapped server — zero external dependencies.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.href} className="text-[13px] text-zinc-500 transition-colors hover:text-zinc-200">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-zinc-800/80 pt-6 text-[11px] text-zinc-600 md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} stitaP. Open source, auditable, yours.</span>
          <span className="font-mono">GGUF-native · offline-first · no telemetry</span>
        </div>
      </div>
    </footer>
  );
}
