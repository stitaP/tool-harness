import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ChevronDown } from "lucide-react";

const PRODUCT_LINKS = [
  { label: "Image Capture", href: "/features#capture", desc: "Webpages → editable SVG" },
  { label: "Screen Recorder", href: "/recorder", desc: "Screen, region & window" },
  { label: "Video Editor", href: "/editor", desc: "Multi-track timeline editor" },
  { label: "SLM Tutorial Studio", href: "/tools", desc: "Help docs → tutorial videos" },
];

const PLATFORM_LINKS = [
  { label: "Notebook", href: "/notebook", desc: "Chat + agents, configured to your hardware" },
  { label: "Agent Studio", href: "/studio", desc: "Define roles, scope docs + tools, run teams" },
  { label: "Tool Store", href: "/store", desc: "106 agent-ready tools" },
  { label: "CFD Demo", href: "/pipeflow", desc: "Pipe flow thermal analysis — just results" },
  { label: "Modules Notebook", href: "/modules", desc: "Compose your session" },
  { label: "Agent Platform", href: "/agents", desc: "Swarms · long-running runs · ops modules" },
];

const USE_CASE_LINKS = [
  { label: "All 20 Enterprise Use Cases", href: "/docs/enterprise-use-cases", desc: "Working solutions with real tools" },
  { label: "Accessibility Audit", href: "/docs/enterprise-use-cases#1-website-accessibility-audit-agent", desc: "WCAG 2.2 compliance" },
  { label: "QA Test Generator", href: "/docs/enterprise-use-cases#16-qa-test-case-generator", desc: "Auto-generate test scripts" },
  { label: "SQL Analytics", href: "/docs/enterprise-use-cases#6-sql-analytics-assistant", desc: "Self-service BI" },
  { label: "Engineering Simulation", href: "/docs/enterprise-use-cases#9-engineering-simulation-workbench", desc: "CFD, FEA, thermal" },
  { label: "Design-to-Code", href: "/docs/enterprise-use-cases#14-design-to-code-platform", desc: "UI → React + Tailwind" },
  { label: "Legacy Server Revival", href: "/docs/enterprise-use-cases#10-legacy-server-revival", desc: "Old servers → RAG chatbots" },
];

const RESOURCE_LINKS = [
  { label: "Platform Overview", href: "/overview", desc: "Every feature + why it exists" },
  { label: "Start Here (beginners)", href: "/docs/start", desc: "Learn agents & LLMs from scratch" },
  { label: "Documentation", href: "/docs" },
  { label: "Tool Reference", href: "/docs/tools", desc: "All 267 tools, in detail" },
  { label: "Use Cases", href: "/docs/enterprise-use-cases", desc: "30 enterprise business solutions" },
  { label: "PDF Manual", href: "/docs/pdf", desc: "Complete manual, generated locally" },
  { label: "Interactive Guide", href: "/guide" },
  { label: "Tutorial", href: "/tutorial", desc: "Hands-on walkthrough" },
  { label: "Help Center", href: "/help" },
  { label: "API Reference", href: "/api" },
  { label: "Downloads", href: "/downloads" },
];

function NavDropdown({ label, items }: { label: string; items: Array<{ label: string; href: string; desc?: string }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="flex items-center gap-1 px-3 py-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-white">
        {label}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-1">
          <div className="w-64 rounded-xl border border-zinc-800 bg-zinc-950/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
            {items.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 transition-colors hover:bg-zinc-900"
              >
                <div className="text-[13px] font-medium text-zinc-100">{item.label}</div>
                {item.desc && <div className="text-[11px] text-zinc-500">{item.desc}</div>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Unified site navigation — dark glass bar shared across all public pages. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl">
      {/* Animated brand rule */}
      <div className="animated-border h-px w-full opacity-60" />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="stitap-gradient grid size-8 place-items-center rounded-lg text-[13px] font-black text-white shadow-lg shadow-orange-950">
            S
          </span>
          <span className="text-[15px] font-bold tracking-tight text-white">stitaP</span>
          <span className="hidden rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-400 lg:inline">
            agentic AI tool harness
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavDropdown label="Agent Platform" items={PLATFORM_LINKS} />
          <NavDropdown label="Use Cases" items={USE_CASE_LINKS} />
          <NavDropdown label="Media Tools" items={PRODUCT_LINKS} />
          <Link to="/docs" className="px-3 py-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-white">Docs</Link>
          <Link to="/guide" className="px-3 py-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-white">Guide</Link>
          <Link to="/downloads" className="px-3 py-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-white">Downloads</Link>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            to="/store"
            className="group inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Launch app
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
