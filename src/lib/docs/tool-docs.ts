/**
 * Tool Reference Documentation Generator
 *
 * Builds detailed per-tool documentation directly from the live tool
 * registry (ALL_TOOLS manifests), so docs can never drift from what is
 * actually deployed: every id, parameter, default and capability you read
 * here is read from the same objects the runtime executes.
 *
 * Per-tool entries are generated; the per-category "background" and
 * "use cases" prose is curated and explains WHY each tool family exists
 * and how it was designed.
 */

import { ALL_TOOLS } from "@/lib/store";
import type { ToolManifest, ToolCategory } from "@/lib/store/tool-types";
import type { PdfChapter } from "./pdf";

// ─── Curated category background & use cases ─────────────────────────

interface CategoryDoc {
  label: string;
  background: string[];
  useCases: string[];
}

export const CATEGORY_DOCS: Partial<Record<ToolCategory, CategoryDoc>> = {
  browser: {
    label: "Browser Automation & Deep Inspection",
    background: [
      "The browser family is the largest in the store because it solves the harness's hardest problem: letting an agent - often a small one - perceive and act on a modern web app. Playwright-style automation was reimplemented from first principles so it runs inside stitaP's sandboxed engine with no external driver downloads.",
      "Beyond acting (click, type, navigate), this family is built for INSPECTION depth that typical automation skips: full attribute dumps, computed styles, shadow-DOM piercing, iframe traversal, network capture with request/response bodies, storage access (cookies, localStorage, sessionStorage, IndexedDB) and framework state extraction. The design bet is that an agent which sees the API contract behind every action needs far fewer reasoning tokens than one that only sees pixels.",
      "Every tool returns compact, structured results rather than raw HTML dumps - token economy was a first-class design constraint because these outputs feed SLM context windows.",
    ],
    useCases: [
      "Regression capture-once-regenerate-later: record the API contract of a flow; when the site ships a new version, diff captured contracts to regenerate automation without re-learning from scratch.",
      "Building harness fixtures: browser.state extracts a React/Redux tree so tests can assert on application state, not just DOM side effects.",
      "Debugging production issues: network.capture pairs every action with its API calls and timing, turning 'the button did nothing' into 'POST /checkout returned 502 after 8.4s'.",
    ],
  },
  capture: {
    label: "Capture & Screenshot",
    background: [
      "Capture is where stitaP started: Snagit-inspired SVG website capture with three output promises (Portable Image SVG, Hybrid Editable SVG, experimental Native Vector). The capture tool exposes the pipeline - freeze fixed elements, scroll-and-stitch tiles, package as SVG with annotation and metadata layers.",
      "It was kept as a single deliberate surface rather than many flags because the pipeline phases are internally stateful; the tool orchestrates readiness detection, lazy-load waiting and DPR normalization for you.",
    ],
    useCases: [
      "Documentation teams capturing pixel-faithful, text-searchable screenshots (OCR layers persist at capture time).",
      "Creating encrypted captures whose metadata library can regenerate playwright-style automation scripts later, readable only by stitaP.",
    ],
  },
  visual: {
    label: "Visual Understanding (On-Device ViT)",
    background: [
      "The vision family answers 'how does an agent understand a JPG/PNG?' without any cloud API: an on-device Vision-Transformer-style model runs quantized INT8 inference in pure TypeScript against bundled weights. It detects UI elements, reads layout structure, and describes regions.",
      "Design rule: no heuristic pixel rules for buttons/menus/icons - understanding comes from the learned model, with OCR complementing it for exact text. This matters because heuristics break on every unusual design system while learned features generalize.",
    ],
    useCases: [
      "Alt-text suggestion during capture: model describes the region, OCR supplies literal text, both merge into accessibility metadata.",
      "Verifying rendered output: after a swarm ships a UI change, visual tools compare before/after captures semantically rather than pixel-diffing.",
      "Tutorial generation: locating which part of a screenshot contains the control a help-doc step refers to.",
    ],
  },
  design: {
    label: "Design System & UI Quality",
    background: [
      "These tools encode three named design methodologies as auditable checks: Vercel web design guidelines, Microsoft Fluent/UI-UX guidance, and tasteskill heuristics. They audit color contrast, typography scale, spacing rhythm, and component consistency on any page or design token file.",
      "They exist because agent-built UI needs objective review loops: a coder agent can ship a screen, a reviewer agent can run the design audit, and concrete violations - not vibes - go back into the loop.",
    ],
    useCases: [
      "Enterprise guideline enforcement: run design.audit as a verification-gate step so UI stories cannot close with WCAG failures.",
      "Generating compliant screens from scratch via design.codegen, then validating them with the same rule set that shaped them.",
    ],
  },
  llm: {
    label: "LLM Integration & Prompting",
    background: [
      "The LLM family standardizes prompting and parsing for any backend the inference router selects - local GGUF via llama.cpp, OpenVINO, or an API-key provider if the user configures one. Prompt builders compose roles, few-shot examples and constraints; response parsers extract structured JSON/code deterministically with repair passes for malformed model output.",
      "A core design decision: every parser degrades gracefully. A small model that half-follows a format still yields usable structured data instead of crashing the chain.",
    ],
    useCases: [
      "SLM tutorial scripting: build a constrained prompt, parse the step list, retry with repair instructions when the 1B model drops fields.",
      "Provider-agnostic pipelines: swap a laptop GGUF for a server vLLM endpoint without touching prompt or parser code.",
    ],
  },
  video: {
    label: "Video Editing & Rendering",
    background: [
      "Eight tools cover the timeline editor's engine: multi-track composition, cuts/transitions, text overlays, stickers/templates, and rendering through the in-house frame pipeline (PNG-style DEFLATE frames, own MP4/WebM muxers). Nothing calls ffmpeg - offline servers must be able to export video.",
      "Tools are granular by design: each timeline operation is individually invokable so agents can script edits programmatically while humans use the /editor UI over the same engine.",
    ],
    useCases: [
      "SLM Tutorial Studio: doc steps → narration audio + screen segments composed automatically into a finished MP4.",
      "Batch post-production: schedule a nightly job that cuts, titles and renders raw recordings into publishable clips.",
    ],
  },
  audio: {
    label: "Audio & Speech",
    background: [
      "Speech synthesis, resampling and mixing are first-party DSP implementations. Narration synthesis is intentionally template-driven rather than neural-first: deterministic prosody from punctuation works everywhere, and higher-quality neural voices slot in when a local TTS model is available through the router.",
    ],
    useCases: [
      "Narrated tutorials produced fully air-gapped.",
      "Mixing system audio and microphone tracks for recorded walkthroughs with loudness normalization.",
    ],
  },
  document: {
    label: "Document Parsing & Knowledge Extraction",
    background: [
      "Six tools turn help centers, wikis, PDFs and HTML into structured steps and clean text. detectTutorial classifies whether a page IS a tutorial; extractSteps pulls ordered actionable steps with their selectors/screenshots. These feed Tutorial Studio, RAG ingestion and migration planning.",
      "Parsing is structural (headings, lists, aria hints) rather than regex-scraping, so it survives site redesigns much better - the same philosophy as the semantic-layer SVG capture.",
    ],
    useCases: [
      "Company onboarding: point at your internal help site; get narrated video tutorials and a RAG knowledge base from the same crawl.",
      "Feeding migration projects: parse legacy version's documentation to derive user stories the enterprise runner executes.",
    ],
  },
  export: {
    label: "Export & Format Conversion",
    background: [
      "Export tools serialize captures, edits and reports into deliverable formats - including the PDF writer that generated the manual you are reading, implemented from scratch against ISO 32000 with base-14 fonts.",
      "Formats were chosen for audience reality: guides deploy as HTML and PDF, captures as SVG/PNG - so those paths got first-class fidelity treatment.",
    ],
    useCases: [
      "One-click delivery of a finished guide: HTML bundle for the web, PDF for print, both from the same intermediate representation.",
    ],
  },
  agent: {
    label: "Agent Orchestration Tools",
    background: [
      "These expose the orchestration engines (stitap-chains, stitap-graph) and the session/swarm/enterprise systems as invokable store tools, so models can drive other agents: define a StateGraph from a declarative spec, run a ReAct loop, size a swarm to the host, or launch a long-running migration project.",
      "They exist because Hermes-class platforms need agents composing agents - but each stays one-purpose, honoring the no-duplicate-modules rule.",
    ],
    useCases: [
      "An interactive session spawns a sub-swarm for a bounded subtask and consumes its blackboard digests.",
      "Ops teams trigger weekly migration progress runs via scheduler.jobs calling graph.run workflows.",
    ],
  },
};

const FALLBACK_DOC: CategoryDoc = {
  label: "Tools",
  background: ["This tool family follows the standard store contract: declared permissions, sandboxed execution, structured outputs sized for SLM contexts."],
  useCases: [],
};

function catDoc(cat: string): CategoryDoc {
  return CATEGORY_DOCS[cat as ToolCategory] ?? FALLBACK_DOC;
}

// ─── Per-tool section generation ─────────────────────────────────────

/** One parameter per bullet, Microsoft Style. */
function paramBullets(m: ToolManifest): PdfChapter["blocks"] {
  if (!m.parameters.length) return [{ type: "p", text: "Takes no parameters." }];
  const out: PdfChapter["blocks"] = [];
  for (const p of m.parameters) {
    const req = p.required ? "required" : "optional";
    const def = p.default !== undefined ? ` Default: ${JSON.stringify(p.default)}.` : "";
    const range =
      p.min !== undefined || p.max !== undefined
        ? ` Allowed range: ${p.min ?? "-"} to ${p.max ?? "-"}.`
        : "";
    const en = p.enum?.length ? ` One of: ${p.enum.join(" | ")}.` : "";
    out.push({
      type: "bullet",
      text: `${p.name} (${p.type}, ${req}) - ${p.description}.${def}${range}${en}`,
    });
  }
  return out;
}

function capLine(m: ToolManifest): string {
  const caps: string[] = [];
  const c0 = m.capabilities[0];
  if (c0) {
    if (c0.offline) caps.push("works fully offline");
    if ((c0 as unknown as { requiresBrowser?: boolean }).requiresBrowser) caps.push("requires a browser session");
    if ((c0 as unknown as { requiresNetwork?: boolean }).requiresNetwork) caps.push("requires network access");
  }
  if (m.slmFriendly) caps.push("SLM-friendly (usable by small models directly)");
  if (m.dependencies?.length) caps.push(`depends on: ${m.dependencies.join(", ")}`);
  return caps.length ? `Runtime notes: ${caps.join("; ")}.` : "";
}

function exampleCall(m: ToolManifest): string[] {
  const args = m.parameters.filter((p) => p.required);
  const lines = [
    "// invoke via store executor or HTTP /api/tools",
    `store.execute("${m.id}", {`,
  ];
  if (!args.length) {
    lines.push("})");
    return lines;
  }
  args.forEach((p) => lines.push(`  "${p.name}": <${p.type}>,`));
  lines.push("})");
  return lines;
}

function toolBlocks(m: ToolManifest) {
  const blocks: PdfChapter["blocks"] = [];
  blocks.push({ type: "h3", text: `${m.id} -- ${m.name} (v${m.version})` });
  blocks.push({ type: "p", text: m.longDescription || m.description });
  if (m.tags.length) blocks.push({ type: "p", text: `Keywords: ${m.tags.join(", ")}.` });
  const notes = capLine(m);
  if (notes) blocks.push({ type: "bullet", text: notes.replace("Runtime notes: ", "") });
  blocks.push({ type: "h3", text: "Parameters" });
  blocks.push(...paramBullets(m));
  blocks.push({ type: "h3", text: "Invocation" });
  blocks.push({ type: "code", lines: exampleCall(m) });
  const dive = DEEP_DIVES[m.id];
  if (dive) blocks.push(...deepDiveBlocks(dive));
  return blocks;
}

// ─── Curated deep dives for flagship tools ──────────────────────────

/**
 * Hand-written worked examples for the tools people use first and most.
 * Every other tool still gets full parameter docs + invocation generated
 * from its manifest; these entries add scenario, steps, annotated output,
 * and tips.
 */
export const DEEP_DIVES: Record<string, DeepDive> = {
  "browser.navigate": {
    scenario:
      "You want to capture the state of a dashboard that requires a login and takes several seconds to load its charts. Navigation is the first step of every browser workflow, so getting its options right matters.",
    steps: [
      "Call browser.navigate with the page URL and waitUntil 'networkidle' so background requests settle before you proceed.",
      "If the site needs authentication, call browser.type into the login fields and browser.click the submit button before navigating onward.",
      "Check the returned status field: 'ok' means navigation completed; 'timeout' means the load event never fired within the limit.",
    ],
    sampleOutput: [
      "{",
      "  status: 'ok',               // load event fired",
      "  finalUrl: '.../dashboard',  // after redirects",
      "  title: 'Ops Dashboard',",
      "  loadMs: 2841                // useful baseline for perf tests",
      "}",
    ],
    tips: [
      "Prefer waitUntil 'networkidle' for pages with lazy data; use 'domcontentloaded' when you only need static markup.",
      "Record loadMs on every navigation - it is free performance telemetry for later comparison.",
      "A timeout is not an error state by itself; inspect network.capture next to see which request hung.",
    ],
  },
  "browser.click": {
    scenario:
      "An agent must press a 'Generate report' button whose label changes between deployments. You want the click to survive redesigns without rewriting selectors every release.",
    steps: [
      "Locate the button with a stable selector such as [data-action='generate'] or role/text fallbacks rather than brittle CSS paths.",
      "Call browser.click with that selector; leave clickType as 'left' and omit offsets unless the target has distinct hit zones.",
      "Set a generous timeout for buttons that trigger long work, then follow with browser.wait for the expected result element.",
    ],
    sampleOutput: [
      "{",
        "  clicked: true,",
        "  selector: \"[data-action='generate']\",",
        "  waitedMs: 12,           // actionability wait (visible+enabled)",
        "}",
    ],
    tips: [
      "If clicked is false, run browser.inspect on the selector: the element may be inside a closed shadow root or an iframe this session cannot reach.",
      "For canvas or map targets, pass offsetX/offsetY - clicking coordinates beats trying to select pixels as elements.",
      "Chain clicks with browser.wait between them; never assume UI updates complete synchronously.",
    ],
  },
  "browser.extract": {
    scenario:
      "You need product data from a listing page - names, prices, ratings - delivered as compact JSON that fits a small model's context window instead of raw HTML that would not.",
    steps: [
      "Navigate and wait for the listing to render fully.",
      "Call browser.extract with mode 'structured' and a schema describing the fields you want per item.",
      "Feed the result directly to an LLM prompt or store it; the output is already normalized JSON.",
    ],
    sampleOutput: [
      "{ count: 24,",
        "  items: [",
        "    { name: 'Desk Lamp', price: '39.00', rating: 4.6 },",
        "    ...   // one object per matched item",
        "  ] }",
    ],
    tips: [
      "Structured extraction costs hundreds of tokens where the same page's HTML costs tens of thousands - always extract, never paste HTML.",
      "When a field comes back missing, inspect one item with browser.inspect to find the real attribute name.",
      "For paginated lists, wrap extraction in a loop over pagination clicks and merge arrays yourself.",
    ],
  },
  "browser.inspect": {
    scenario:
      "Extraction returned nothing for a widget. You suspect it lives inside shadow DOM or an iframe and want ground truth about what the browser actually sees.",
    steps: [
      "Call browser.inspect with the CSS selector and depth high enough to include descendants.",
      "Read attributes, computed styles, and open/closed shadow-root status from the result.",
      "If the node sits in an iframe, re-run inspection after switching context; results report their frame origin.",
    ],
    sampleOutput: [
      "{ found: true,",
        "  tag: 'x-pricewidget',",
        "  shadowRoot: { mode: 'closed' },   // why selectors missed",
        "  attrs: { currency: 'EUR', sku: '4471' },",
        "  computed: { display: 'grid' } }",
    ],
    tips: [
      "Closed shadow roots are the most common reason selectors silently fail; the inspector tells you immediately.",
      "Copy computed styles from here when design audits flag unexpected spacing or color.",
      "Inspect before automating: ten seconds of ground truth saves minutes of blind retries.",
    ],
  },
  "browser.network": {
    scenario:
      "Users say checkout intermittently fails. You want every API call behind the flow, with statuses and timings, captured while you walk through it once.",
    steps: [
      "Start capture, then perform the user journey manually or via browser tools.",
      "Stop capture and read the request list: method, URL, status, duration, and sizes.",
      "Pair each slow or failed request with the action that triggered it using timestamps.",
    ],
    sampleOutput: [
      "{ requests: [",
        "  { method:'POST', url:'/api/checkout', status:502, ms:8412 },",
        "  { method:'GET',  url:'/api/cart',     status:200, ms:118  },",
        "  ... ] }",
    ],
    tips: [
      "The 502 above plus its 8.4-second duration is your bug report; hand both to the backend team verbatim.",
      "Capture bodies only when needed - they dominate token cost if fed back to a model.",
      "Diff captures across releases to spot new, vanished, or slowed endpoints; this powers regenerate-after-version-change workflows.",
    ],
  },
  "browser.state": {
    scenario:
      "Your test asserts on application behavior, but the DOM shows symptoms rather than causes. You want the framework's own state tree as evidence.",
    steps: [
      "Trigger the interaction under test.",
      "Call browser.state to extract the React/Vue/Redux tree at that instant.",
      "Assert on state fields (cart.items.length === 3) instead of rendered side effects.",
    ],
    sampleOutput: [
      "{ framework: 'react',",
        "  redux: { cart: { items: 3, total: 117.0 } },",
        "  components: { CheckoutForm: { submitting: false } } }",
    ],
    tips: [
      "State assertions survive visual redesigns - the DOM can change completely while meaning stays constant.",
      "Trim trees before storing snapshots; production apps carry large irrelevant subtrees.",
    ],
  },
  "browser.storage": {
    scenario:
      "Login state lives in localStorage and a feature flag rides on a cookie. Tests must set up both deterministically instead of clicking through the UI every run.",
    steps: [
      "Inspect storage after one manual login to learn the exact keys.",
      "In tests, write those keys directly via browser.storage before navigating.",
      "Clear or overwrite them between runs for isolation.",
    ],
    sampleOutput: [
      "{ local: { auth: 'eyJhbGci...' },",
        "  cookies: [{ name:'flag-new-checkout', value:'on' }] }",
    ],
    tips: [
      "Seeding storage turns five setup clicks into one deterministic call - and removes a whole class of flaky-login failures.",
      "Never commit real tokens captured here; sanitize fixtures.",
    ],
  },
  "browser.performance": {
    scenario:
      "Before and after a release, you want objective numbers proving whether the page got faster or slower.",
    steps: [
      "Navigate fresh (cache state controlled), then call browser.performance.",
      "Record FCP, LCP, TTI-style metrics, and resource totals.",
      "Compare against the previous run; investigate any regression over 10 percent.",
    ],
    sampleOutput: [
      "{ fcpMs: 1240, lcpMs: 2310, tbtMs: 340,",
        "  requests: 47, transferKB: 1820 }",
    ],
    tips: [
      "Run three navigations and take medians; single samples are noisy.",
      "LCP regressions usually trace to one resource - cross-reference browser.network timings.",
    ],
  },
  "browser.interact-test": {
    scenario:
      "You need proof that clicking a button produces the expected response within an acceptable time, phrased as a repeatable check rather than a one-off observation.",
    steps: [
      "Define the interaction: target selector, expected result selector or state condition, max latency.",
      "Run interact-test; it clicks, waits, measures, and evaluates the expectation.",
      "Store the verdict with timing as regression evidence.",
    ],
    sampleOutput: [
      "{ passed: true, latencyMs: 412, thresholdMs: 1500,",
        "  evidence: { resultVisible: true, stateUpdated: true } }",
    ],
    tips: [
      "Latency thresholds should come from product requirements, not vibes; 1.5 seconds is a common default.",
      "Failures print which evidence was missing - visible-but-not-updated means frontend lied; neither means the click missed.",
    ],
  },
  "browser.a11y-audit": {
    scenario:
      "Company policy requires WCAG conformance before any UI ships. The audit turns that policy into gate evidence a reviewer agent can check mechanically.",
    steps: [
      "Run a11y-audit on the page in its final state.",
      "Read violations sorted by severity; each includes the offending selector and the rule reference.",
      "Fix issues, rerun until zero serious violations, attach the clean report to the story.",
    ],
    sampleOutput: [
      "{ score: 92, violations: [",
        "  { rule:'color-contrast', severity:'serious', nodes:['.muted-label'] }, ] }",
    ],
    tips: [
      "Contrast failures are the most common and the cheapest to fix - start there.",
      "Wire the audit into enterprise verification gates so stories cannot close with serious violations outstanding.",
    ],
  },
  "browser.visual-understand": {
    scenario:
      "A screenshot arrives with no metadata. You need to know what interface it shows - which controls exist, what layout organizes them - without any cloud vision API.",
    steps: [
      "Pass the image (or capture) to visual-understand.",
      "Read the structured scene description: detected element types, arrangement, notable regions.",
      "Combine with OCR output when literal text labels matter.",
    ],
    sampleOutput: [
      "{ layout: 'sidebar+content',",
        "  elements: ['navbar','table','pagination','primary-button'],",
        "  description: 'Admin table view with row actions...' }",
    ],
    tips: [
      "Understanding comes from the bundled quantized model - no heuristics - so unusual designs still classify sensibly.",
      "For alt text, merge model description with OCR strings; each covers what the other misses.",
    ],
  },
  "browser.layout-analyze": {
    scenario:
      "Design review suspects the new page breaks the grid at certain widths. You want measured layout structure, not opinions.",
    steps: [
      "Run layout-analyze per breakpoint of interest.",
      "Compare column counts, gutter widths, and alignment across breakpoints.",
      "Feed deviations into design.suggest for concrete fixes.",
    ],
    sampleOutput: [
      "{ columns: 12, gutters: '24px', aligned: true,",
        "  overflowX: false, breakpoints: { md: {...}, lg: {...} } }",
    ],
    tips: [
      "Overflow flags at narrow widths catch the classic horizontal-scroll defect before users do.",
      "Pair with browser.responsive-test to automate the sweep across devices.",
    ],
  },
  "llm.buildPrompt": {
    scenario:
      "You keep retyping the same few-shot instructions for extracting step lists from help articles. Prompt building belongs in a template, not in chat history.",
    steps: [
      "Create a template with typed variables and two worked examples.",
      "Fill variables at runtime with llm.buildPrompt.",
      "Send through llm.call; parse with llm.parseResponse using the matching parser.",
    ],
    sampleOutput: [
      "{ prompt: '<system>...<examples>...</examples>Task: ...',",
        "  tokenEstimate: 486 }   // know the cost before sending",
    ],
    tips: [
      "tokenEstimate lets small-model sessions verify the prompt fits the window budget before spending it.",
      "Two good examples beat ten mediocre ones; few-shot slots are expensive tokens.",
    ],
  },
  "swarm.configure": {
    scenario:
      "You want four agents refactoring a module tonight and need to know how many workers your hardware actually supports before promising anything.",
    steps: [
      "Provide physical cores, usable RAM, and model size (parameters and bits).",
      "Read the recommendation: worker count, topology, memory-per-worker, and the rationale text.",
      "Accept, or reduce workers if other applications share the machine.",
    ],
    sampleOutput: [
      "{ workers: 4, topology: 'hierarchical',",
        "  memoryPerWorkerGB: 5.0, routerMode: 'throughput',",
        "  rationale: '32 GB / 5.0 per worker leaves OS headroom...' }",
    ],
    tips: [
      "The rationale is honest arithmetic, not marketing: reserve OS memory before believing worker counts.",
      "One shared batched model instance usually beats duplicated processes; the configurator prefers it automatically.",
    ],
  },
  "enterprise.project": {
    scenario:
      "Leadership wants a legacy service ported next quarter with auditable progress. You stage it as a governed project instead of a pile of prompts.",
    steps: [
      "Load guideline packs for coding, testing, review, and documentation standards.",
      "Describe the migration goal; approve the planned story tree after reading acceptance criteria.",
      "Let the runner execute stories develop-test-document with gates; monitor board, git commits, and Jira comments.",
      "Review verification-gate outcomes daily; rejected stories loop with reasons attached.",
    ],
    sampleOutput: [
      "{ project: 'py2-to-py3', stories: 14, epicTicket: 'OPS-882',",
        "  checkpoints: 'per-phase',",
        "  gates: { verification: true, approvals: 'medium+' } }",
    ],
    tips: [
      "Edit acceptance criteria during planning - cheap then, expensive later.",
      "Checkpoints make multi-week runs survivable; never disable them.",
      "Attach trace waterfalls to stakeholder updates instead of writing status reports by hand.",
    ],
  },
  "inference.quant": {
    scenario:
      "You downloaded an 8-bit GGUF of a 13B model, but your laptop has 16 GB RAM and the OS needs 4. The quantization menu turns that situation into a safe decision.",
    steps: [
      "Provide your hardware profile: usable RAM, cores, and intended workload.",
      "Read each option's memory estimate, projected speed, and quality note; Q4_K_M for this model needs roughly 9 GB.",
      "Because your existing file does not match the device need, follow the menu's advice: fetch the pre-made Q4_K_M rather than requantizing - double quantization loses quality permanently.",
    ],
    sampleOutput: [
      "{ options: [",
        "  { quant:'Q8_0', memGB:'14.0', verdict:'does not fit' },",
        "  { quant:'Q4_K_M', memGB:'9.1', verdict:'recommended' } ],",
        "  sourceAdvice: 'fetch premade; do not requantize' }",
    ],
    tips: [
      "The memory formula is params x bits/8 x 1.2; sanity-check any recommendation against it.",
      "Re-run the menu whenever hardware changes - recommendations are situational, not permanent.",
    ],
  },
  "inference.download": {
    scenario:
      "A 20 GB model download keeps failing at 80 percent on your rural connection. You need progress that survives disconnects instead of restarting nightly.",
    steps: [
      "Start the download from the published URL plus SHA256 digest.",
      "On any failure, restart the same task; it resumes from the last verified chunk, not byte zero.",
      "After assembly, the full-file hash verifies automatically before the model becomes available.",
    ],
    sampleOutput: [
      "{ state:'downloading', chunk:'812/1024', parallel:3,",
        "  verifiedBytes: '16.2GB', etaMin: 22 }",
    ],
    tips: [
      "Parallel connections help most on high-latency links; keep the default unless bandwidth caps apply.",
      "Never trust an unverified file even if it opens - the SHA256 gate exists because truncated models fail in confusing ways mid-generation.",
    ],
  },
  "agent.terminal": {
    scenario:
      "Your coder agent must run the project's test suite and read failures itself, instead of asking you to paste output back.",
    steps: [
      "Enable the terminal module in the session notebook (note its token overhead).",
      "The agent issues commands through agent.terminal; output returns into its context within budget.",
      "Long output truncates with pointers, so the agent can request sections deliberately.",
    ],
    sampleOutput: [
      "{ cmd:'bun scripts/store-smoke.ts', exit:0,",
        "  outTail: '842 passed, 0 failed', ms: 9120 }",
    ],
    tips: [
      "Terminal access is powerful by design - approval gates can require human sign-off for destructive commands.",
      "Prefer agents reading their own test output; it closes the fix-verify loop without you as middleman.",
    ],
  },
  "agent.kanban": {
    scenario:
      "You want visibility into what a swarm is doing right now without interrupting it.",
    steps: [
      "Open the board bound to the run; stories appear as cards with role owners.",
      "Watch transitions develop -> test -> document -> review happen as evidence lands.",
      "Intervene only on blocked cards; they state exactly which criterion lacks evidence.",
    ],
    sampleOutput: [
      "{ columns: { todo:5, doing:2, review:1, blocked:1, done:9 },",
        "  blocked: [{ story:'S12', reason:'docs artifact missing' }] }",
    ],
    tips: [
      "Blocked-with-reason beats stuck-silently; the board text tells you what to unblock.",
      "Boards persist across checkpoints, so state survives reboots during week-long runs.",
    ],
  },
  "doc.extractSteps": {
    scenario:
      "Your help center has two hundred articles. Tutorial Studio needs each one converted into ordered, actionable steps with references to the screens involved.",
    steps: [
      "Crawl or point extractSteps at each article URL.",
      "Review the structured steps: action text, target selectors where present, screenshots when captured alongside.",
      "Feed steps to script generation and narration; store them in the knowledge base for retrieval too.",
    ],
    sampleOutput: [
      "{ title:'Rotating API keys', steps:[",
        "  { n:1, action:'Open Settings > Security', selector:'#security-tab' },",
        "  { n:2, action:'Click Rotate', selector:'[data-action=rotate]' }, ...] }",
    ],
    tips: [
      "Structural parsing survives redesigns far better than regex scraping - headings and lists carry the meaning.",
      "One crawl yields three artifacts: videos, RAG passages, and migration checklists. Plan ingestion once, use thrice.",
    ],
  },
  "video.export": {
    scenario:
      "Your tutorial timeline is finished and needs to ship as files creators can deploy: HTML pages and PDF guides embed video differently than LMS platforms expect.",
    steps: [
      "Choose container and resolution per audience; MP4 remains the safest default everywhere.",
      "Export through video.export; the in-house encoder and muxer handle the pipeline offline.",
      "Verify duration and size in the result, then attach outputs to the guide bundle.",
    ],
    sampleOutput: [
      "{ file:'tutorial-01.mp4', durationSec: 214,",
        "  resolution: '1920x1080', sizeMB: 38.4, encoder: 'stitap-native' }",
    ],
    tips: [
      "No external binary participates, so air-gapped servers export identically to laptops.",
      "Export once per target platform rather than transcoding exports - quality degrades across generations.",
    ],
  },
};

// ─── Family end-to-end tutorials ───────────────────────────────

/** Local block helpers (same shape as manual.ts). */
const b = {
  p: (text: string) => ({ type: "p" as const, text }),
  h2: (text: string) => ({ type: "h2" as const, text }),
  bullet: (text: string) => ({ type: "bullet" as const, text }),
  note: (text: string) => ({ type: "note" as const, text }),
  code: (...lines: string[]) => ({ type: "code" as const, lines }),
};

/** Multi-tool walkthrough chapters placed before the per-family reference. */
export function buildFamilyTutorialChapters(): PdfChapter[] {
  return [
    {
      title: "Browser tools end to end: audit a checkout flow",
      blocks: [
        b.p(
          "This tutorial chains nine browser tools into one realistic task: prove that a checkout flow works, measure it, and produce evidence a reviewer can trust. Follow along on any test site you control.",
        ),
        b.h2("Phase 1 - arrive prepared"),
        b.bullet("browser.navigate opens the storefront with waitUntil 'networkidle' so lazy data settles."),
        b.bullet("browser.storage seeds an authenticated session from sanitized fixtures, skipping manual login forever."),
        b.bullet("browser.state confirms the cart framework state is empty before starting - assertions later compare against this baseline."),
        b.h2("Phase 2 - perform the journey"),
        b.bullet("browser.click adds a product; browser.wait confirms the mini-cart badge updates before proceeding."),
        b.bullet("Network capture runs throughout, recording every API call the flow triggers with statuses and timings."),
        b.h2("Phase 3 - prove what happened"),
        b.code(
          "interact-test : click checkout -> expect #order-confirm < 1500ms",
          "   -> { passed: true, latencyMs: 412 }",
          "network.capture -> POST /api/checkout 200 in 380ms",
          "state.extract   -> order.id present, cart.items === 0",
        ),
        b.p(
          "Three independent evidence sources agree: the interaction test verdict, the network record, and the application state. That triangulation is what makes the evidence trustworthy.",
        ),
        b.h2("Phase 4 - harden for regression"),
        b.bullet("browser.test-suggester proposes additional scenarios from the captured flow: expired payment session, empty cart, double-submit."),
        b.bullet("browser.form-test validates each input's validation rules; browser.api-test replays the checkout endpoint directly at the boundary."),
        b.bullet("browser.visual-regression snapshots the confirmation page so pixel-level surprises surface next release."),
        b.note(
          "The same pattern - navigate, seed, act, triangulate evidence, suggest more tests - applies to any flow, not just checkout.",
        ),
      ],
    },
    {
      title: "Testing and design audits: gate a UI release",
      blocks: [
        b.p(
          "This tutorial produces the evidence pack an enterprise verification gate expects for a user story that changed the interface: functional proof, accessibility conformance, design-rule compliance, and responsive behavior.",
        ),
        b.h2("Functional layer"),
        b.bullet("Run interact-test for each changed interaction with explicit latency thresholds."),
        b.bullet("Run form-test on any modified inputs to verify validation messages and boundary values."),
        b.h2("Accessibility layer"),
        b.bullet("a11y-audit reports violations by severity with offending selectors. Serious violations must reach zero before the story can close."),
        b.bullet("Re-run after fixes and attach both reports; the delta is your proof of remediation."),
        b.h2("Design-rule layer"),
        b.code(
          "design-audit       -> overall score + rule violations by system",
          "typography-check   -> scale/line-height deviations",
          "spacing-check      -> off-grid gaps, misalignments",
          "color-palette      -> contrast-safe palette extraction",
        ),
        b.p(
          "The design family encodes three named methodologies (Vercel guidelines, Fluent guidance, tasteskill). Choose the system your company standard references so findings map to policy language.",
        ),
        b.h2("Responsive layer"),
        b.bullet("responsive-test sweeps breakpoints and flags overflow and layout breakage; layout-analyze explains each break structurally (column collapse, gutter drift)."),
        b.bullet("design.suggest converts remaining violations into concrete fix proposals a coder agent can apply directly."),
        b.note(
          "Attach all four layers' outputs to the story. A gate that can see functional, accessibility, design, and responsive evidence has nothing left to take on faith.",
        ),
      ],
    },
    {
      title: "Vision tools: understand images without the cloud",
      blocks: [
        b.p(
          "This tutorial builds alt text and searchable descriptions for product screenshots using only on-device models - no API keys, no uploads.",
        ),
        b.h2("Per image"),
        b.bullet("visual-understand classifies the scene: element types, layout pattern, notable regions."),
        b.bullet("icon-detect locates iconography and classifies each glyph; layout-analyze measures arrangement when precision matters."),
        b.bullet("OCR contributes exact strings - button labels, prices, error codes."),
        b.bullet("Merge model description plus OCR strings into final alt text; each covers the other's blind spots."),
        b.code(
          "{ description: 'Pricing table, four columns...',",
            "  icons: ['check','info','warning'],",
            "  ocr: ['Basic $9','Pro $29','Enterprise contact'] }",
        ),
        b.h2("Make results searchable"),
        b.bullet("Store merged descriptions into the knowledge base; retrieval now finds screenshots by content ('the pricing table with warning icon')."),
        b.bullet("Capture-time OCR layers already persist for stitaP captures, so library search works there automatically."),
        b.h2("Why no heuristics"),
        b.p(
          "Pixel rules for buttons and menus break on every unusual design system. Detection here comes from a quantized transformer running INT8 inference in pure TypeScript - learned features generalize where hand-written rules cannot.",
        ),
      ],
    },
  ];
}

interface DeepDive {
  scenario: string;
  steps: string[];
  sampleOutput: string[];
  tips: string[];
}

function deepDiveBlocks(d: DeepDive): PdfChapter["blocks"] {
  const out: PdfChapter["blocks"] = [{ type: "h3", text: "Worked example" }];
  out.push({ type: "p", text: d.scenario });
  d.steps.forEach((s, i) => out.push({ type: "bullet", text: `${i + 1}. ${s}` }));
  out.push({ type: "h3", text: "Annotated output" });
  out.push({ type: "code", lines: d.sampleOutput });
  out.push({ type: "h3", text: "Tips" });
  d.tips.forEach((t) => out.push({ type: "bullet", text: t }));
  return out;
}

// ─── Chapter assembly ────────────────────────────────────────────────

const CATEGORY_ORDER: ToolCategory[] = [
  "browser", "capture", "visual", "testing", "design", "inference",
  "agent", "llm", "video", "audio", "document", "data", "security", "export",
];

export function buildToolChapters(startNumber: number): PdfChapter[] {
  const cats = CATEGORY_ORDER.filter((c) => ALL_TOOLS.some((t) => t.category === c));
  // include any category not in the ordered list (future-proofing)
  for (const t of ALL_TOOLS) if (!cats.includes(t.category)) cats.push(t.category);

  let n = startNumber;
  return cats.map((cat) => {
    const title = `${n}. Tool Reference - ${catDoc(cat).label}`;
    n++;
    const doc = catDoc(cat);
    const tools = ALL_TOOLS.filter((t) => t.category === cat);
    const slmCount = tools.filter((t) => t.slmFriendly).length;
    const offlineCount = tools.filter((t) => t.capabilities[0]?.offline).length;

    const blocks: PdfChapter["blocks"] = [];
    blocks.push({
      type: "p",
      text: `${tools.length} tools · ${slmCount} SLM-friendly · ${offlineCount} fully offline.`,
    });
    doc.background.forEach((para) => blocks.push({ type: "p", text: para }));
    if (doc.useCases.length) {
      blocks.push({ type: "h2", text: "Design use cases" });
      doc.useCases.forEach((uc) => blocks.push({ type: "bullet", text: uc }));
    }
    blocks.push({
      type: "note",
      text: `Reference note: everything below is generated from the live registry - these are the exact manifests the runtime executes, not hand-maintained copies.`,
    });
    blocks.push({ type: "h2", text: `Tool reference (${tools.length})` });
    tools.forEach((m) => blocks.push(...toolBlocks(m)));

    return { title, blocks };
  });
}
