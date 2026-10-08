#!/usr/bin/env node
/**
 * Regenerate docs/tool-catalog.md from the Tool Store itself (agent/store/store.mjs), so the catalog always matches
 * the tools that exist. Run after adding or changing store tools:  node agent/scripts/gen-tool-catalog.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { listTools } = await import(new URL("../store/store.mjs", import.meta.url).href);
const OUT = fileURLToPath(new URL("../../docs/tool-catalog.md", import.meta.url));

/** id prefix → section title. Unknown prefixes get a title-cased name. */
const DOMAINS = {
  agent: "Agent Orchestration", analytics: "Analytics & Database", voice: "Voice & Text-to-Speech", browser: "Browser Automation & Testing",
  harness: "CAR Governance Framework", catalog: "Catalog", chains: "Chains", storage: "Cloud Storage", cfd: "Computational Fluid Dynamics",
  database: "Database Connectors", design: "Design System & Canvas", diagram: "Diagram & Architecture", doc: "Document Parsing",
  email: "Email Communication", math: "Engineering Mathematics", enterprise: "Enterprise Workflow", env: "Environment Management",
  fault: "Fault Detection & Quality", fractal: "Fractal Analysis", approvals: "Governance", graph: "Graph Execution", chart: "Graphs & Visualization",
  huggingface: "Hugging Face Hub", typography: "Indic Typography Engine", inference: "Inference & Model Management", knowledge: "Knowledge Base",
  llm: "LLM Integration & Prompting", server: "Legacy Server Revival", ml: "Machine Learning", maps: "Maps & Geolocation", hardware: "Mobile Hardware",
  notify: "Notifications", ocr: "OCR & Text Recognition", os: "OS & Desktop Integration", trace: "Observability & Tracing",
  office: "Office Document Generation", viking: "OpenViking Context Store", payment: "Payment Processing", collab: "Real-time Collaboration",
  sms: "SMS Communication", sandbox: "Sandbox Execution", session: "Session Management", swarm: "Swarm Intelligence", standards: "Standards",
  scheduler: "Task Scheduling", text: "Text Analysis & NLP", video: "Video Editing & Rendering", media: "Media Processing",
  ecom: "E-commerce", fin: "Finance & Lending Calculators", chit: "Chit Funds", re: "Real Estate", codegen: "Code Generation",
};
const title = (p) => DOMAINS[p] ?? p.replace(/(^|-)(\w)/g, (_, s, c) => (s ? " " : "") + c.toUpperCase());
const anchor = (s) => s.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

const tools = listTools().slice().sort((a, b) => a.id.localeCompare(b.id));
const groups = new Map();
for (const t of tools) { const p = t.id.split(".")[0]; groups.set(p, [...(groups.get(p) ?? []), t]); }
const ordered = [...groups.entries()].sort((a, b) => title(a[0]).localeCompare(title(b[0])));
const slm = tools.filter((t) => t.slmFriendly).length;

let md = `# stitaP Tool Harness — Tool Catalog

> **${tools.length} tools across ${ordered.length} domains**, every one with a working executor.
> Generated from the Tool Store by \`agent/scripts/gen-tool-catalog.mjs\` — do not edit by hand; re-run the script after changing tools.

The agent reaches these through \`tool_search\` + \`use_tool\` (see [tool-store.md](tool-store.md) for credentials,
requirements and approvals). For the agent's own built-in tools (files, terminal, browser, pipelines, site templates, …)
see [agent-runtime.md](agent-runtime.md). Business solutions built from these tools: [enterprise-use-cases.md](enterprise-use-cases.md).

| Metric | Value |
|---|---|
| Tools | **${tools.length}** |
| Domains | **${ordered.length}** |
| SLM-friendly (small, clear parameters) | **${slm}** (${Math.round((slm / tools.length) * 100)}%) |
| With an executor | **${tools.filter((t) => t.executable).length}** |

## Domains

${ordered.map(([p, ts]) => `- [${title(p)}](#${anchor(title(p))}) (${ts.length})`).join("\n")}
`;

for (const [p, ts] of ordered) {
  md += `\n## ${title(p)}\n`;
  for (const t of ts) {
    md += `\n### \`${t.id}\`\n\n**${t.name}**${t.slmFriendly ? " | ✅ SLM" : ""}\n\n${t.description}\n`;
    if (t.parameters?.length) {
      md += `\n| Parameter | Type | Required | Description |\n|---|---|---|---|\n`;
      for (const x of t.parameters) md += `| \`${x.name}\` | ${cell(x.type)} | ${x.required ? "Yes" : "No"} | ${cell(x.description)} |\n`;
    }
    if (t.tags?.length) md += `\n**Tags:** ${t.tags.join(", ")}\n`;
  }
}

writeFileSync(OUT, md);
console.log(`wrote ${OUT}: ${tools.length} tools, ${ordered.length} domains`);
