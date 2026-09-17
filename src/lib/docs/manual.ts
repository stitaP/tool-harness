/**
 * stitaP Platform Manual - documentation content.
 *
 * Written to Microsoft Style for technical writing: active voice, present
 * tense, second person, one idea per sentence, sentence-case headings,
 * imperative bullets, and a narrative flow that builds each chapter on
 * the previous one.
 *
 * Positioning: stitaP is an agentic AI tool harness. Media capture,
 * recording and editing are tool families that agents call - not the
 * product's identity.
 *
 * Consumed by src/lib/docs/pdf.ts; per-category tool reference chapters
 * are appended from tool-docs.ts.
 */

import type { PdfChapter } from "./pdf";
import { buildPdf } from "./pdf";
import { buildToolChapters, buildFamilyTutorialChapters } from "./tool-docs";
import { FOUNDATIONS_CHAPTERS, buildGlossaryChapter } from "./foundations";

export const MANUAL_TITLE = "stitaP Agent Harness";
export const MANUAL_SUBTITLE =
  "Technical reference for every module, tool, and engine - with design background and procedures";

const b = {
  p: (text: string) => ({ type: "p" as const, text }),
  h2: (text: string) => ({ type: "h2" as const, text }),
  h3: (text: string) => ({ type: "h3" as const, text }),
  bullet: (text: string) => ({ type: "bullet" as const, text }),
  note: (text: string) => ({ type: "note" as const, text }),
  code: (...lines: string[]) => ({ type: "code" as const, lines }),
};

const BASE_CHAPTERS: PdfChapter[] = [
  // ─── 1 ─────────────────────────────────────────────────────────
  {
    title: "1. About this manual",
    blocks: [
      b.p("This manual is the complete technical reference for stitaP. It explains what each module does, how to use it, and why it was built that way."),
      b.h2("Who should read this"),
      b.bullet("Engineers who deploy stitaP and want to understand what runs where."),
      b.bullet("Agent developers who compose sessions, build swarms, or write tools."),
      b.bullet("Operators who run long-lived autonomous projects and need to trust the gates around them."),
      b.h2("How the manual is organized"),
      b.p("Chapters follow the order in which you will typically meet the system. Chapters 2 and 3 define the product and its architecture. Chapters 4 through 7 explain how agents get intelligence: routing, models, throughput, and old hardware. Chapters 8 through 13 explain the harness itself: sessions, tools, orchestration, swarms, enterprise runs, and operations. Chapters 14 through 20 cover knowledge, security, integrations, agent perception, media tools, testing, and deployment."),
      b.p("Chapters 21 onward form the tool reference. A chapter exists for each tool family, and every deployed tool is documented with its parameters, defaults, and invocation. The reference is generated from the live registry at build time, so it always matches what the runtime executes."),
      b.h2("Conventions"),
      b.p("This manual uses second person and active voice. Procedures list steps in the order you perform them. Code samples come from the repository, and file paths such as src/lib/agent/swarm.ts point to real source files."),
      b.h2("Verify your installation"),
      b.p("All verification is offline and deterministic. To confirm that your environment works, run these commands from the repository root:"),
      b.code(
        "bun tsc -b --noEmit            # strict typecheck over the whole project",
        "bun scripts/store-smoke.ts     # tool registry and executors (800+ checks)",
        "bun scripts/hermes-smoke.ts    # agent ops and long-running runner",
        "bun scripts/pdf-smoke.ts       # validates the generator that made this document",
      ),
      b.note("Each suite exits nonzero if any check fails. New engines land only when their suite passes and the full typecheck is clean."),
    ],
  },
  // ─── 2 ─────────────────────────────────────────────────────────
  {
    title: "2. What stitaP is",
    blocks: [
      b.p("stitaP is an agentic AI tool harness. You compose agents from modules and tools, run them singly or in swarms, and let them execute for minutes or weeks on hardware you own. The harness routes inference to the fastest backend available on your machine, keeps every output inside token budgets that small models can handle, and never requires an external dependency, cloud service, or API key."),
      b.h2("What the harness provides"),
      b.p("The harness consists of five cooperating systems. Each has its own chapters later in this manual."),
      b.bullet("Session modules: 30 toggleable capabilities that define what a chat session can do (chapter 8)."),
      b.bullet("Tool store: 106 registered tools with declared permissions and sandboxed execution (chapter 9)."),
      b.bullet("Orchestration engines: chains for sequences and graphs for loops and state machines (chapters 10 and 11)."),
      b.bullet("Swarm and enterprise engines: multi-agent groups and week-long governed runs (chapters 11 and 12)."),
      b.bullet("Inference router: measured backend selection across CPUs, GPUs, and NPUs (chapter 4)."),
      b.h2("What stitaP is not"),
      b.p("stitaP began as a website-capture tool. Capture, recording, and editing still exist, but they are now tool families that agents call - one category among fourteen. If you are looking for those features specifically, see chapter 18. If you want to understand the platform as a whole, keep reading in order."),
      b.h2("Design rules"),
      b.p("Three rules shaped every module in this repository. They explain most of the decisions documented later."),
      b.bullet("Self-contained by default. Every dependency is written in-house so the system runs air-gapped."),
      b.bullet("One module per purpose. Where a well-known library exists, this repository ships exactly one equivalent built from first principles."),
      b.bullet("Fail soft. A missing device, driver, or model degrades capability with a plain-language reason; it never crashes the host."),
    ],
  },
  // ─── 3 ─────────────────────────────────────────────────────────
  {
    title: "3. Architecture",
    blocks: [
      b.p("The platform is layered. Each layer depends only on the layers below it, so you can test, replace, or run any layer headless without the others."),
      b.code(
        "Product surfaces   /editor  /recorder  /capture  /tools   (UI)",
        "Agent platform     /agents  /modules  /store              (UI + APIs)",
        "----------------------------------------------------------------",
        "Enterprise         guideline packs · migrations · LongRunningRunner",
        "Orchestration      stitap-chains · stitap-graph (StateGraph)",
        "Agent systems      swarm · kanban · memory · scheduler · RAG ·",
        "                   notifications · tracing · approvals",
        "Inference          router · prober · quantizer · downloader",
        "Store              manifests · executors · sandbox enforcement",
      ),
      b.h2("Where things live"),
      b.bullet("src/lib/store holds the tool registry. Every capability is a manifest plus an executor."),
      b.bullet("src/lib/inference decides how tokens get generated on your hardware."),
      b.bullet("src/lib/chains and src/lib/graph provide orchestration primitives."),
      b.bullet("src/lib/agent provides memory, kanban, scheduler, RAG, tracing, and approvals."),
      b.bullet("src/lib/session composes modules into chat sessions and computes their token budgets."),
      b.bullet("src/lib/workflow implements enterprise guideline packs and long-running projects."),
      b.h2("Trust boundaries"),
      b.p("Captured content and spawned tools are untrusted. The store enforces permissions at the executor boundary: a tool that does not declare network access cannot make network calls, regardless of what its code attempts. Capture workers run under configurable isolation with time and memory limits. When something fails a boundary check, the caller receives a typed error, not a crash."),
    ],
  },
  // ─── 4 ─────────────────────────────────────────────────────────
  {
    title: "4. Inference router",
    blocks: [
      b.p("Every agent action eventually becomes token generation. The router decides which backend performs that generation on your machine. It never uses a hardcoded preference list; it measures."),
      b.h2("How the router chooses"),
      b.p("To select a backend, the router follows these steps:"),
      b.code(
        "1. Probe     which backends are usable right now, without elevation.",
        "2. Benchmark each available backend with a short generation test.",
        "3. Score     results against the current workload mode.",
        "4. Pick      the fastest measured winner and cache the decision.",
        "5. Invalidate the cache when OS, drivers, or available devices change.",
      ),
      b.h2("Privilege-free probing"),
      b.p("Nothing in the runtime path requests elevated permissions. Probing reads only what the OS exposes to an ordinary process:"),
      b.bullet("OpenVINO enumerates CPU, integrated GPU, and NPU devices through a read-only query."),
      b.bullet("On Linux, GPU and NPU access depends on group membership for /dev/dri and /dev/accel. If the group is missing, the device is marked unavailable for this session."),
      b.bullet("On Windows, a missing or mismatched NPU driver means 'NPU unavailable', not a crash."),
      b.bullet("llama.cpp always works because user-space CPU inference needs no special privileges anywhere."),
      b.h2("Workload modes"),
      b.p("Scoring depends on what the session needs. Throughput mode favors sustained tokens per second for many concurrent agents. Latency mode favors time to first token for interactive sessions. Prompt-heavy mode weights prefill speed for long-context ingestion. The session budget from chapter 8 supplies this mode automatically."),
      b.h2("Backends probed"),
      b.code(
        "llamacpp-cpu | llamacpp-vulkan | llamacpp-metal | llamacpp-cuda",
        "openvino-cpu | openvino-igpu | openvino-npu",
        "qnn-snapdragon | coreml-apple | apu-mediatek",
      ),
      b.p("Every decision carries its evidence. A tool's status card can answer 'why am I running on CPU?' with measured numbers rather than assumptions."),
    ],
  },
  // ─── 5 ─────────────────────────────────────────────────────────
  {
    title: "5. Model acquisition and quantization",
    blocks: [
      b.p("Models reach tens of gigabytes, so how they arrive and which precision level they use determines your experience more than any other choice. This chapter explains the download machinery and the decisions the quantization menu makes visible."),
      b.h2("Resumable downloads"),
      b.p("A single-connection download that restarts from byte zero after any disconnect is unacceptable at model sizes. The downloader instead:"),
      b.bullet("Splits the file into chunks and hashes each chunk independently."),
      b.bullet("Resumes from the last verified offset by using HTTP Range requests."),
      b.bullet("Fetches chunks in parallel over multiple connections."),
      b.bullet("Verifies the assembled file against the published SHA256 digest."),
      b.code(
        "idle -> downloading(chunk i/n, parallel) -> verifying(chunks)",
        "     -> assembling -> sha256(full file) -> ready",
        "any failure -> resume from last verified offset",
      ),
      b.h2("Requantization: avoid quantizing twice"),
      b.p("Quantizing an already-quantized model compounds error. Precision discarded in the first pass cannot be recovered, so a Q4 produced from a Q8 file is not real Q4 quality. Follow this decision tree:"),
      b.bullet("If original weights are available, quantize directly from them to the target level."),
      b.bullet("If an existing quant matches the device's requirement, use it untouched."),
      b.bullet("Otherwise, fetch the correct pre-made quant or the originals. Treat local requantization as a labeled last resort, never a silent default."),
      b.h2("GGUF and AWQ/GPTQ trade-offs"),
      b.p("GGUF quants such as Q4_K_M are weight-only and calibration-free. They produce quickly and run everywhere in the llama.cpp ecosystem. AWQ and GPTQ INT4 builds use calibration data and often deliver better quality per bit, but they need compatible runtimes. The menu presents both options with honest trade-offs rather than picking silently."),
      b.h2("Sub-4-bit levels: IQ quants and born-quantized models"),
      b.p("Below 4 bits, ordinary quantization degrades sharply because rounding errors stop canceling. Two usable exceptions exist. First, IQ2/IQ3 GGUF formats use importance-matrix quantization: a calibration pass identifies which weights matter most, and the scarce bits protect those weights. Build them only from original weights, and verify against a Q4 build before trusting one. Second, BitNet b1.58 models are trained with ternary weights from the first step, so the quantization is baked in rather than inflicted afterward; a 2 GB b1.58 build outperforms a squeezed 2-bit build of the same size. The menu labels every sub-4-bit row with what degrades and never pre-selects one silently. Part I, chapter F6 explains the full procedure."),
      b.h2("Hardware-aware quantization menu"),
      b.p("After probing RAM, cores, and workload, the menu lists viable levels. Each option shows an estimated footprint, projected speed where measurable, and a plain-language quality note. Memory footprint follows one formula:"),
      b.code(
        "GB = params(B) x bitsPerWeight / 8 x 1.2   # ~1.2 overhead factor",
        "7B @ Q4_K_M (~4.8 bits): 7 x 4.8/8 x 1.2 = ~5.0 GB",
      ),
      b.p("The highest quality level that fits with headroom for the OS is pre-selected. You can override it at any time, and the menu re-offers choices whenever hardware changes."),
      b.h2("The full memory bill"),
      b.p("The formula covers weights only. A running session also holds the KV cache, which grows with the conversation and is not shrunk by weight quantization, plus a few hundred megabytes of working space. On tight machines a long conversation can therefore push a model that loaded cleanly into swapping, where generation slows by orders of magnitude. The sizer accounts for all three components, and the session budget warns before context growth can trigger it. Part I chapter F6 gives the beginner-level walkthrough with worked tables per machine size."),
    ],
  },
  // ─── 6 ─────────────────────────────────────────────────────────
  {
    title: "6. The Notebook: from hardware scan to running agents",
    blocks: [
      b.p("The Notebook is the front door of the suite: one chat interface with a Configure panel that takes you from \"I have no idea what my machine can run\" to a working chat or agent session. This chapter documents each step and the engine behind it."),
      b.h2("Step 1: Evaluate the hardware"),
      b.p("One button probes the machine locally: total and available RAM, CPU threads, and which inference backends are accessible without elevation. Nothing is sent anywhere. The results feed every later step, so the suggestions you see are sized to YOUR machine rather than to a generic profile."),
      b.h2("Step 2: Pick a model family"),
      b.p("The wizard offers families with honest notes: Qwen2.5 (ungated, strong tool calling), Llama 3.2 and Gemma 2 (license-gated), and BitNet b1.58 (born-quantized ternary, the smallest usable builds). Choosing a family and your free RAM produces a BUILD PLAN: how many builds to create, which levels, and which are refused."),
      b.h2("Step 3: Download with resumable chunks and Hugging Face authentication"),
      b.p("Downloads run like a torrent client: the file splits into chunks fetched in parallel, each chunk resumes independently after any disconnect, and the assembled file verifies against the published SHA256. Gated models (Llama, Gemma) need a Hugging Face access token: paste it once, the request carries a Bearer header, and the token is never persisted with the download state. A 401 or 403 returns plain-language guidance: accept the license on the model page, then retry."),
      b.h2("Step 4: Create and verify small-bit builds"),
      b.p("The in-house quantizer converts original weights into Q8_0, Q4_K_M, Q3_K, Q2_K, importance-weighted IQ2/IQ3, and b1.58 ternary builds using the GGUF block scheme. The build planner encodes the platform's rules: never requantize an already-quantized file, never convert a dense model to ternary (download the official BitNet instead), and refuse IQ builds without a calibration pass. Every build is verified by measuring relative error against tolerance for its bit level before the interface offers it."),
      b.h2("Step 5: Choose the interface"),
      b.p("Three ways to use the downloaded model:"),
      b.bullet("Chat - the notebook itself, wired to the router with session budgets and callable tools."),
      b.bullet("Agents playground - the swarm sizer reads your hardware and answers \"how many agents are possible\" with the arithmetic shown: physical cores bound compute, RAM bounds model slots, and a shared batched instance is preferred over duplicated processes when the model fits twice."),
      b.bullet("API keys - for frontier quality without local hardware, covered next."),
      b.h2("API keys: does one key run my swarm?"),
      b.p("The key analyzer answers with numbers. A key's ceiling is the minimum of three per-key limits divided by per-agent demand: requests per minute, tokens per minute, and maximum concurrent requests. Four concurrent agents fit one OpenRouter key with room to spare; sixty-four need several keys, rotated across agents rather than assigned per agent. The analyzer ranks all major providers by agents-per-key and suggests the hybrid path: run planner and reviewer roles locally on GGUF, spend API calls on coder and tester roles."),
      b.h2("Free providers and automatic failover"),
      b.p("Nine providers offer permanent free tiers: Groq, Cerebras, OpenRouter's free models, Google AI Studio, Mistral's Experiment tier, GitHub Models, Cloudflare Workers AI, NVIDIA NIM, and Cohere's trial key. Paste one or several keys into the notebook's free-provider panel and the failover router takes over. When a vendor rate-limits, exhausts its day, or goes down, the router shifts to the next healthy provider IN THE BACKGROUND: chat APIs are stateless, so the conversation is simply resent and the session never interrupts. Each provider runs a circuit breaker - failures open it with an escalating cooldown, a half-open probe closes it on recovery - and an invalid key disables only that key, not the provider. Daily quotas are tracked locally, so an exhausted tier is skipped proactively instead of burning a failed request. Every shift is recorded and shown after the fact; the user is never prompted mid-task."),
      b.note("Free tiers have real trade-offs, and the panel shows them: request caps, context limits, and which providers train on your prompts (Google outside the EU/UK, Mistral's Experiment tier). Privacy-sensitive work should pin local GGUF models; free tiers are for experimentation and overflow."),
    ],
  },
  {
    title: "7. The Agent Studio: defining, scoping, and supervising agents",
    blocks: [
      b.p("The Agent Studio is where agents are DEFINED. The Notebook runs an agent; the Studio decides what an agent is, what it may know, which tools it may touch, and who supervises it. This chapter documents each concept and the procedure for using it."),
      b.h2("Where agent roles are defined"),
      b.p("Every agent takes one of the eight swarm roles, and each role carries fixed responsibilities. The planner decomposes goals and re-plans failed branches. The coder implements one story at a time and commits to the internal git. The tester executes acceptance criteria as repeatable checks. The reviewer approves only against the loaded guideline pack. The documenter keeps procedures in Microsoft Style. The verifier owns final acceptance: no story closes because a model said so. The researcher gathers external context within the agent's internet policy. The coordinator runs the blackboard and escalates to humans. A role's default context budget matches its reading load; your configuration can narrow or extend it, but the responsibilities stay fixed so that supervision has a stable baseline."),
      b.h2("Concept: knowledge scope and the internet policy"),
      b.p("Each agent receives a document list, like a notebook: PDFs, web links, notes, and online material, each enabled or disabled with a checkbox. Alongside the list sits the policy decision: may the agent browse the internet when the provided material is insufficient, or must it confine itself to the provided material only? The two settings are enforced together. A confined agent with enabled web sources is a configuration error that the Studio refuses at save time - it is never a silent behavior. A web-allowed agent must cite its sources. This single checkbox is how you keep regulated or proprietary work inside known material while letting research agents roam."),
      b.h2("Procedure: scope an agent's knowledge"),
      b.bullet("1. Pick the role and write the scope statement - one sentence naming what this agent owns and what it must not touch."),
      b.bullet("2. Add documents: choose the kind (PDF, web link, note, online material), enter the reference, and select Add. The list behaves like a notebook shelf."),
      b.bullet("3. Multiselect the material for THIS agent: check the entries in scope, uncheck the rest. Disabled entries stay on the shelf for other agents."),
      b.bullet("4. Set the internet checkbox. Leave it unchecked for confined work; check it only for research roles that need the live web."),
      b.bullet("5. Save. The Studio validates the combination and renders the exact system-prompt fragment the agent will receive, so you can read what the agent will be told."),
      b.h2("Concept: tool scope with per-tool principles"),
      b.p("Agents act through the harness tool store, and every tool must be granted explicitly. You multiselect from the same registry the store runs on - browser, capture, testing, vision, document, terminal families - filtered by name or category. Each selected tool takes a BASIC PRINCIPLE: one sentence the agent must follow when using it, such as \"read-only unless the story says write\" for browser tools or \"never capture regions containing credentials\" for capture tools. Principles ride into the system prompt, so scoping is auditable: the rendered prompt lists every granted tool with its principle."),
      b.h2("Concept: solution templates"),
      b.p("A solution template is a reusable accomplishment recipe: WHEN this happens, DO that, USING this tool. The flagship template is Capture & attach to ticket: after each story's acceptance criteria pass, the agent captures the relevant screen region, annotates it with the story ID and check verdict, and attaches it to its assigned Jira ticket as evidence; when all stories finish, it posts the evidence pack and requests verification. Other templates cover the implement-verify-commit loop, the audit-and-report flow that compiles the four-layer evidence pack, and docs-from-diff that updates documentation after merged work. Templates compose with tool scope: a template's tool hints only work if you granted those tools."),
      b.h2("The team workspace: many users, many agents"),
      b.p("The workspace is where supervision happens. Users with owner, lead, member, or observer roles create tasks, assign DEFINED agents to them, and read the agent's live state on each card. Feedback is structured, not freeform-only: approve closes the task and marks the agent done; request-changes sends the task and the agent back to work with your comment attached; comment records context without changing state. Agents appear on the board with state colors: green while working, sky while planning, violet while in review, amber while awaiting a human approval gate, rose when blocked, teal when done, red on error - the legend sits at the top of the Studio, and every dot explains its meaning on hover."),
      b.h2("Concept: internal-first git synchronization"),
      b.p("Every agent checkin lands on the INTERNAL git, always. External platforms - GitHub or GitLab - and ticketing systems receive content ONLY when your preferences enable them, at the cadence you choose: manual, on milestones, or daily. An agent checkin is never a side effect that reaches a public remote. The Studio shows the current destinations line at all times - for example, \"internal git (always) · github (on milestones) · jira evidence attachments\" - so you always know where work lands. Evidence attachments to tickets follow the same rule: they flow only when auto-attach is enabled."),
      b.h2("Procedure: run a supervised task end to end"),
      b.bullet("1. Define the agent in the Studio: role, scope sentence, documents, internet policy, tools with principles, and a solution template."),
      b.bullet("2. Create the task in the workspace and assign the agent from the roster. The card shows the agent's state dot immediately."),
      b.bullet("3. Watch the state: green working means tools are running; amber means a risk gate needs you; rose means something is missing - read the trace, fix the cause, and the agent resumes."),
      b.bullet("4. Review the outcome: evidence lands on the task per the template. Approve to close, or request changes to send the agent back with your comments."),
      b.bullet("5. Let sync do only what you chose: internal commits always; external pushes and ticket updates at your cadence, never automatically."),
    ],
  },
  {
    title: "8. Token throughput optimization",
    blocks: [
      b.p("Once you choose a model and quantization level, the harness applies backend tuning automatically. These levers do not trade quality against anything you need to decide."),
      b.h2("OpenVINO targets"),
      b.bullet("Use INT8 on CPU and integrated GPU; use INT4 group-wise on NPU, where memory bandwidth limits speed."),
      b.bullet("Choose the performance hint per workload: maximum throughput for concurrent agents, minimum latency for interactive sessions."),
      b.bullet("Persist the KV cache across turns with stateful models so only new tokens are processed."),
      b.bullet("Match thread count to physical cores, not logical cores; oversubscribing hyperthreads reduces throughput."),
      b.h2("llama.cpp targets"),
      b.bullet("Load GGUF files through memory mapping so the OS page cache serves repeated loads."),
      b.bullet("Enable speculative decoding with a small draft model; expect 1.5x to 2.5x on predictable output such as JSON tool calls."),
      b.bullet("Enable flash attention on Metal, CUDA, and Vulkan backends to shrink KV-cache memory as context grows."),
      b.bullet("Tune batch size per tool profile: larger batches for prompt-heavy tools, smaller for latency-sensitive ones."),
      b.h2("Mobile targets"),
      b.p("Validate full-graph NPU placement before shipping a mobile tool. Partial fallbacks move data between CPU and NPU constantly and erase most gains. Verify Apple Neural Engine placement empirically, because Core ML falls back silently when a model exceeds device limits. Treat vendor benchmark numbers as cold-start best cases; re-measure under thermal load."),
      b.note("Benchmarking beats priority lists everywhere in this chapter. Relative performance depends on the model, quantization, context length, thermals, and co-load. Measure, cache per device fingerprint, and invalidate on change."),
    ],
  },
  // ─── 7 ─────────────────────────────────────────────────────────
  {
    title: "7. Legacy servers",
    blocks: [
      b.p("'Old operating systems cannot run modern models' bundles three separate problems together. Only one of them is hard, and none require upgrading the host."),
      b.h2("The three compatibility layers"),
      b.bullet("Kernel syscalls. Rarely a problem: Linux keeps decades of syscall backward compatibility."),
      b.bullet("Userspace libraries. The usual blocker: old glibc and libstdc++ versus modern C++ requirements. Solve it by statically linking, or building against musl, so the binary carries its own runtime and the host's ancient libraries are never used."),
      b.bullet("Model format support. Recent GGUF revisions need a recent llama.cpp build regardless of OS age. The same static binary solves this layer too."),
      b.h2("Instruction sets"),
      b.p("A CPU without AVX2 silently falls back to scalar matrix kernels that run several times slower. The profiler checks actual instruction-set support and recommends the correct target flags. Compile for the CPU you have, not for generic x86-64."),
      b.h2("NUMA topology"),
      b.p("Multi-socket servers report impressive core counts and RAM totals, then disappoint unless placement respects sockets. Pin threads and memory to the same socket; otherwise traffic crosses the inter-socket link and throughput drops far below spec."),
      b.h2("Worked example"),
      b.p("Consider a typical 2011 dual-socket server: two eight-core CPUs, 128 GB RAM, no AVX2, glibc 2.13. The profiler produces this recommendation automatically:"),
      b.bullet("Deploy a musl-static llama.cpp build targeted at the actual CPU generation."),
      b.bullet("Bind processes to socket-local memory."),
      b.bullet("Expect K-quants to run on scalar paths until AVX2-class silicon is available."),
      b.bullet("Size six to eight concurrent 7B Q4 workers; RAM capacity is plentiful, but scalar matmul rate sets throughput."),
      b.h2("Decision path"),
      b.p("Try a static musl binary first. Verify which instruction set actually executes at runtime. Check socket topology before trusting spec sheets. Compile natively with the aged toolchain only as a last resort."),
    ],
  },
  // ─── 8 ─────────────────────────────────────────────────────────
  {
    title: "8. Session modules",
    blocks: [
      b.p("A chat session is composed from modules. Each module contributes tools, instructions, and a known context overhead. You check modules on and off per session on the /modules page; enabling one resolves its dependencies automatically, and disabling one cascades safely to dependents."),
      b.h2("Presets"),
      b.p("Four presets cover common profiles. Choose one, then adjust individual modules."),
      b.bullet("SLM Minimal. Keeps total overhead near 1.2K tokens for models up to about 3B parameters."),
      b.bullet("Balanced. Default mix for capable local models."),
      b.bullet("Full Power. Everything enabled; suitable for large models with big windows."),
      b.bullet("Air-Gapped. Offline-only modules exclusively."),
      b.h2("Budget arithmetic"),
      b.p("Enabled modules sum their context-overhead costs. The remaining window is what stays available for conversation and retrieval. On a 3B model with a 4K window, SLM Minimal preserves roughly 70 percent of the window for useful content; Full Power on the same model would starve generation. The UI shows exactly this trade."),
      b.code(
        "const state = createSessionState('balanced');",
        "setModuleEnabled(state, 'agent.swarms', true);   // pulls dependencies",
        "setModuleEnabled(state, 'video.editor', false);  // cascades dependents",
        "computeBudget(state);",
        "// -> { overheadTokens, recommendedContextWindow, workload }",
      ),
      b.h2("Router synchronization"),
      b.p("The computed budget feeds the inference router two values: the recommended context window and the workload mode from chapter 4. Sessions therefore generate tokens on a backend tuned for exactly what they loaded - nothing more, nothing less."),
      b.h2("Disabled behavior"),
      b.p("Disabling a module never breaks a session. Its tools report 'module disabled' and the planner routes around them."),
    ],
  },
  // ─── 9 ─────────────────────────────────────────────────────────
  {
    title: "9. Tool store concepts",
    blocks: [
      b.p("Every capability in the harness registers as a tool. A tool is a manifest plus an executor: the manifest declares inputs, outputs, permissions, supported backends, and cost; the executor is a pure function over the declared inputs. There is no hidden I/O."),
      b.h2("Manifest anatomy"),
      b.code(
        "{ id: 'knowledge.search', category: 'agent-systems',",
        "  permissions: ['fs:read'], backends: ['llamacpp-*','openvino-*'],",
        "  slmFriendly: true, parameters: [...], ... }",
        "",
        "execute: async (input) => kb.retrieve(input.query, budget)",
      ),
      b.h2("Registration"),
      b.p("Registering a tool is one line in the registry. The /store UI, the /modules budget math, permission enforcement, and the API reference all derive from the same manifests. A tool exists in exactly one place."),
      b.h2("Permissions and sandboxing"),
      b.p("Tools declare capabilities: network access, filesystem access, browser session, or none. Enforcement sits in the executor boundary, so undeclared calls fail deterministically. Sandboxed execution applies resource limits chosen per isolation level."),
      b.h2("Transparent performance"),
      b.p("The store UI shows which backend serves each tool and roughly how many tokens per second it delivers. Performance differences stay visible instead of hidden in settings."),
      b.p("Chapter 21 documents every deployed tool individually. To find a tool there, look up its family by category, then its entry by ID."),
    ],
  },
  // ─── 10 ────────────────────────────────────────────────────────
  {
    title: "10. Orchestration: chains",
    blocks: [
      b.p("stitap-chains, in src/lib/chains, provides sequence orchestration. It follows the pipe-composition pattern popularized by LangChain but is written fresh in this repository, with no external code or dependency risk."),
      b.h2("Building blocks"),
      b.bullet("PromptTemplate composes roles, few-shot examples, and constraints with typed variables."),
      b.bullet("LLMChain pipes prompt, model, and output parser into one unit."),
      b.bullet("SequentialChain passes variables between steps."),
      b.bullet("AgentExecutor runs a ReAct loop that binds store tools into model-driven decisions."),
      b.h2("Runs without a model"),
      b.p("The model interface routes through the inference router when a backend exists. When none does, a deterministic rule-based responder answers, so every chain executes even on hardware with no model installed. Tests rely on this property."),
      b.h2("Example"),
      b.code(
        "const chain = new LLMChain({",
        "  prompt: new PromptTemplate('Summarize: {{text}}'),",
        "  model: defaultModel(),",
        "  parser: stringParser(),",
        "});",
        "const out = await chain.invoke({ text });",
      ),
    ],
  },
  // ─── 11 ────────────────────────────────────────────────────────
  {
    title: "11. Orchestration: graphs and swarms",
    blocks: [
      b.p("stitap-graph, in src/lib/graph/state-graph.ts, provides graph orchestration. State machines with conditional edges and cycles maintain groups of agents better than linear chains because loops enable verification and retry, shared state prevents drift, and conditional routing recovers failed branches without restarting a run."),
      b.h2("StateGraph essentials"),
      b.code(
        "const g = new StateGraph<WorkflowState>({ channels });",
        "g.addNode('plan', planNode);",
        "g.addNode('execute', executeNode);",
        "g.addConditionalEdge('execute', route, { ok: 'END', retry: 'plan' });",
        "const app = g.compile();",
        "const out = await app.invoke(initialState);",
      ),
      b.bullet("Channels carry typed state; reducers merge concurrent updates."),
      b.bullet("Conditional edges route on computed predicates, including cycles for critique loops."),
      b.bullet("Checkpoints persist mid-flight so long graphs resume instead of restart."),
      b.h2("Swarm orchestration"),
      b.p("The swarm orchestrator, in src/lib/agent/swarm.ts, sizes multi-agent execution to your machine. Worker count derives from physical cores and usable RAM; each worker reserves memory estimated by the formula in chapter 5. When the model fits once, one shared batched instance serves all workers, because batched serving outperforms duplicated processes."),
      b.h2("Topologies"),
      b.bullet("Hierarchical. A supervisor delegates; best default for plan-execute-verify work."),
      b.bullet("Mesh. Peers coordinate directly; best for exploratory tasks."),
      b.bullet("Pipeline. Strict stage ordering; best for linear delivery."),
      b.bullet("Star. One coordinator routes everything; cheapest context overhead."),
      b.bullet("Ring. Work circulates until a verifier accepts; natural for refinement cycles."),
      b.h2("Communication: blackboard digests"),
      b.code(
        "{ seq: 42, from: 'coder', type: 'artifact',",
        "  summary: 'auth module ported, 14 tests green',",
        "  refs: ['kanban:story-7', 'git:abc123'] }",
      ),
      b.p("Workers read strictly ordered digests, never raw transcripts. A reviewer joining mid-run reconstructs state from recent digests in a few hundred tokens. Digest-based communication is the single biggest lever for keeping swarm context inside small-model windows."),
      b.p("For long horizons, combine four properties: bounded worker contexts, digests instead of transcripts, explicit verification gates before hand-off, and checkpointed graph state. Chapter 12 shows these same properties applied to company-scale projects."),
    ],
  },
  // ─── 12 ────────────────────────────────────────────────────────
  {
    title: "12. Enterprise long-running runs",
    blocks: [
      b.p("Some work takes days or weeks. The enterprise engine, in src/lib/workflow/enterprise.ts, governs such work with guideline packs, migration planning, and a checkpointed runner."),
      b.h2("Guideline packs"),
      b.p("Load your company standards once: coding, testing, review, documentation, security, and delivery rules. Each swarm role receives only the sections relevant to its role, truncated to a token cap. A coder gets coding and testing rules; a reviewer gets review and security rules. Guidelines shape behavior without consuming small-model context."),
      b.h2("Migration projects"),
      b.p("Language ports and version upgrades become dependency trees of user stories. Planning orders the stories onto a board, commits the plan to git, and opens an epic ticket."),
      b.h2("LongRunningRunner pipeline"),
      b.p("To execute a project, the runner processes each story through six gated phases:"),
      b.code(
        "01 Plan     decompose goal into dependency-ordered stories on kanban",
        "02 Commit   push plan to git/GitHub; open epic ticket in Jira",
        "03 Develop  coder implements the story under guideline packs",
        "04 Test     tester runs suites and attaches evidence",
        "05 Document documenter publishes docs required by the gate",
        "06 Verify   acceptance criteria checked against evidence;",
        "            Jira commented with trace waterfall; checkpoint saved",
      ),
      b.h2("Checkpoints and approvals"),
      b.p("The runner persists a checkpoint at every phase transition, so reboots and crashes resume at phase granularity without losing board state or git history. Approval gates pause specific stories by risk level: pending requests wait in review without executing, policy-blocked risks move tasks to blocked and skip cleanly, and stale requests expire so queues never clog."),
      b.code(
        "new LongRunningRunner(project, pack, ports, {",
        "  tracer, notify, approvals,  // optional integrations",
        "  storyRisk: 'medium',        // omit for ungated runs",
        "})",
      ),
      b.note("No story closes because a model said it was done. Acceptance criteria must match delivered evidence - tests green, docs published - or the story loops back."),
    ],
  },
  // ─── 13 ────────────────────────────────────────────────────────
  {
    title: "13. Agent operations",
    blocks: [
      b.p("Long-lived agents need operational support: schedules, alerts, traces, and human oversight. Five modules supply it, all registered in the notebook and all optional per session."),
      b.h2("Scheduler"),
      b.p("The scheduler, in src/lib/agent/scheduler.ts, runs interval and cron-style automations. It supports failure budgets that disable flapping jobs automatically and once-only jobs for migrations."),
      b.h2("Notifications"),
      b.p("The dispatcher, in src/lib/agent/notifications.ts, delivers alerts through pluggable channels: in-app, webhook, or log. Severity rules apply quiet hours, except for critical alerts. Dedupe windows collapse a swarm failure storm into one alert. A retrying queue prevents loss during outages."),
      b.h2("Run tracing"),
      b.p("The tracer, in src/lib/agent/tracing.ts, records span trees per run with token accounting, closes dangling spans automatically, and exports waterfall postmortems. The enterprise runner opens a span per story, so every Jira comment links to a timeline."),
      b.h2("Approval gate"),
      b.p("The gate, in src/lib/agent/approvals.ts, enforces human-in-the-loop policies per risk level: balanced, strict, or autonomous. Requests expire after a TTL so approval queues never deadlock a run. Policy-blocked actions raise BLOCKED_BY_POLICY as an ordinary error that callers handle."),
      b.h2("Runner synchronization"),
      b.p("These modules integrate additively into the LongRunningRunner described in chapter 12. Tracing spans wrap each story phase, notifications announce plan commits and blocked stories with dedupe keys, and approval gates pause risky stories before execution. Omit any integration and existing runs behave identically."),
    ],
  },
  // ─── 14 ────────────────────────────────────────────────────────
  {
    title: "14. Knowledge and retrieval",
    blocks: [
      b.p("Agents need project knowledge in context. The knowledge base, in src/lib/agent/knowledge.ts, provides retrieval-augmented generation fully locally: embeddings, chunking, storage, and scoring run in-process with no model download and no network."),
      b.h2("How embedding works here"),
      b.p("Embeddings use two independent hash functions over word stems, producing 384-dimension vectors. Because hashing is deterministic, identical text always embeds identically, and unrelated text scores near zero. Light stemming lets 'reviewed' match 'review'. Retrieval filters below a threshold calibrated so noise stays out while relevant hits clear comfortably."),
      b.h2("Chunking and budgets"),
      b.p("Documents split into overlapping chunks along structural boundaries. retrieve(query, budget) returns chunks that fit a stated token budget, sized for the session window from chapter 8."),
      b.code(
        "const kb = new KnowledgeBase(384);",
        "kb.ingest(helpDocHtml);",
        "const ctx = kb.retrieve('how to rotate API keys', 600);",
      ),
      b.h2("Why deterministic embeddings"),
      b.p("Neural retrievers score slightly better on benchmarks but demand a model download and runtime compute. Deterministic hashing scores worse on paraphrase yet wins on three properties that matter operationally: zero setup, zero drift between index and query, and auditable scoring. For small-model sessions that ingest internal documentation, the trade-off favors determinism."),
    ],
  },
  // ─── 15 ────────────────────────────────────────────────────────
  {
    title: "15. Security model",
    blocks: [
      b.p("This chapter describes the three security mechanisms that protect captures and tool execution: sandboxing, capture encryption, and SVG sanitization."),
      b.h2("Sandbox isolation"),
      b.p("Capture operations and store tools run under configurable isolation levels - none, basic, or full - enforced by the Rust engine with time and memory limits. Per-operating-system scenarios are registered in the store so isolation behavior is testable rather than assumed."),
      b.h2("Encrypted captures"),
      b.p("Captures can be sealed so only stitaP decrypts them. The serialized payload compresses, then encrypts with keys derived inside the application. Other programs see opaque bytes. Use this when captures embed internal system details that must not feed someone else's automation."),
      b.h2("SVG sanitization"),
      b.p("Every exported SVG passes the sanitizer before delivery. The sanitizer removes script elements, event-handler attributes, external references, and foreign objects; validates the XML; and requires the file to render through a bare img tag. Captured websites are untrusted input, and the export path treats them that way."),
    ],
  },
  // ─── 16 ────────────────────────────────────────────────────────
  {
    title: "16. Integrations: git, GitHub, Jira, SVN",
    blocks: [
      b.p("Integrations follow the self-containment rule: protocol-level clients written in-house, with no vendor SDKs. Git support implements the object model directly - blobs, trees, commits, refs - and maintains an internal commit chain for history safety. Adapters connect to external git providers and SVN checkouts. Jira tickets are created and commented through REST with the in-house HTTP client."),
      b.h2("What syncs automatically"),
      b.p("The enterprise runner integrates at each phase boundary:"),
      b.bullet("Plan phase: ordered stories commit to git; the epic ticket opens."),
      b.bullet("Story phases: branch work happens; kanban transitions record progress; test evidence attaches; docs publish."),
      b.bullet("Close: after the verification gate passes, the ticket receives a comment linking the trace waterfall."),
      b.h2("Skills, prompts, and commands"),
      b.p("Reusable prompts, command definitions, skills, and integration configurations register as first-class store entries. Teams package their own conventions the same way tools are packaged, and sessions consume them through the module notebook."),
    ],
  },
  // ─── 17 ────────────────────────────────────────────────────────
  {
    title: "17. Agent perception: browser tools",
    blocks: [
      b.p("The largest tool family gives agents perception of web applications. Fifty tools cover acting on pages and inspecting them deeply. All were designed around one bet: an agent that sees the API contract behind every action needs far fewer reasoning tokens than one that sees only pixels."),
      b.h2("Acting"),
      b.p("Navigation, clicking, typing, scrolling, waiting, and form handling behave like playwright-style automation but run inside stitaP's sandboxed engine. No external drivers download at runtime."),
      b.h2("Inspecting"),
      b.p("Inspection depth distinguishes this family from ordinary automation. Tools return compact structured data for:"),
      b.bullet("DOM details: full attributes, computed styles, shadow DOM piercing, iframe traversal."),
      b.bullet("Network activity: every API call with headers, bodies, and timing, paired with the action that triggered it."),
      b.bullet("Storage: cookies, localStorage, sessionStorage, IndexedDB."),
      b.bullet("Framework state: React, Vue, and Redux trees for asserting on application state."),
      b.h2("Token economy"),
      b.p("Outputs are structured and compact rather than raw HTML dumps, because these results feed SLM context windows. A raw page costs ten thousand or more tokens; the extracted contract often costs hundreds."),
      b.p("Chapter 22 documents each browser tool individually, including parameter tables and invocation examples."),
    ],
  },
  // ─── 18 ────────────────────────────────────────────────────────
  {
    title: "18. Media tool families",
    blocks: [
      b.p("Capture, recording, editing, speech, and vision exist as tool families that agents call. This chapter summarizes what each family guarantees; the tool reference chapters list every callable entry point."),
      b.h2("Website capture (SVG)"),
      b.p("The capture family makes three separate output promises and never blurs them:"),
      b.bullet("Portable Image SVG. Production mode: the rendered page becomes PNG or WebP inside an SVG image element. Annotations ride above as native SVG. Highest fidelity, predictable across browsers."),
      b.bullet("Hybrid Editable SVG. Supported elements convert to vectors: headings become measured text lines that wrap like the browser, buttons become rect plus text, gradients and shadows map to native definitions, photographs stay raster. Semantic group elements preserve layer boundaries."),
      b.bullet("Native Vector attempt. Experimental near-total vector reconstruction. Never presented as pixel-perfect, because fonts, filters, and canvas internals vary across engines."),
      b.p("Scroll capture freezes fixed elements, waits for lazy content, stitches tiles offscreen, and normalizes device pixel ratio. OCR runs at capture time and persists searchable text layers."),
      b.h2("Screen recording"),
      b.p("Recording selects screen, window, or region; acquires frames; overlays cursor and click highlights; mixes microphone and system audio; encodes; and muxes. Desktop platforms use native backends - BitBlt, CGWindowList, XGetImage, MediaProjection - behind one cross-platform interface."),
      b.h2("Video editing and rendering"),
      b.p("The editor supports multi-track timelines, cuts, transitions, text overlays, stickers, and templates. Encoding, muxing, and playback are implemented in-house: DEFLATE-based frame pipelines plus first-party MP4 and WebM muxers. No external binary participates, so offline servers export video."),
      b.h2("Speech and audio"),
      b.p("Synthesis is template-driven by default: deterministic prosody works everywhere, and neural voices slot in through the router when available locally. Resampling and mixing are first-party DSP."),
      b.h2("Vision"),
      b.p("On-device vision uses a quantized transformer running INT8 inference in pure TypeScript. Agents detect UI elements, read layout structure, and describe regions without heuristics or cloud calls. OCR complements the model where exact text matters."),
      b.h2("Tutorial studio"),
      b.p("Tutorial Studio converts help documentation into videos. Steps parse structurally from docs, narration synthesizes per step, and screen segments assemble on the timeline. Small models handle bounded subtasks - scripting, alt text, error explanation - and every task has a deterministic fallback so production works with no model installed."),
    ],
  },
  // ─── 19 ────────────────────────────────────────────────────────
  {
    title: "19. Testing and quality assurance",
    blocks: [
      b.p("Quality rests on offline smoke suites that exercise every engine deterministically. Run them with bun scripts/<name>.ts; each exits nonzero on failure."),
      b.code(
        "bun scripts/pdf-smoke.ts           # PDF writer and manual integrity",
        "bun scripts/hermes-smoke.ts        # scheduler/RAG/tracing/approvals/runner",
        "bun scripts/session-swarm-smoke.ts # modules, budgets, swarm sizing",
        "bun scripts/orchestration-smoke.ts # chains and graph engines",
        "bun scripts/inference-smoke.ts     # router/probe/quant/download/legacy",
        "bun scripts/store-smoke.ts         # manifests and executors (800+ checks)",
      ),
      b.h2("What the suites catch"),
      b.p("These suites have caught real defects, not just regressions: hash-collision noise in RAG embeddings, non-monotonic timestamps breaking blackboard filters, verification gates that could never pass stories lacking criteria, and cron day-of-month semantics. The pattern generalizes: every engine ships with a suite that fails loudly before users can."),
      b.h2("Website testing tools"),
      b.p("Separate from the QA suites, the store includes testing tools agents call against live sites: functional response checks after interactions, backend-to-frontend latency measurement with breakdowns, accessibility audits, and improvement suggestions. Chapter 23 documents them."),
    ],
  },
  // ─── 20 ────────────────────────────────────────────────────────
  {
    title: "20. Deployment",
    blocks: [
      b.p("One project builds for every target: the web application, a Tauri v2 desktop shell for Windows, macOS, and Linux embedding the Rust engine, and Android via Tauri mobile. Native screen-capture backends make the desktop shell a complete replacement for the browser extension. Installer downloads appear on the Downloads page."),
      b.h2("Deploying air-gapped"),
      b.p("Because nothing phones home, deployment reduces to four steps:"),
      b.code(
        "1. Copy the build to the target machine.",
        "2. Provision model files if needed; deterministic fallbacks keep",
        "   every feature functional without them.",
        "3. Point integrations at your git/Jira endpoints.",
        "4. Run the smoke suites to verify the environment.",
      ),
      b.p("Air-gapped servers, personal laptops, and old multi-socket machines are all first-class targets. Chapter 7 covers the legacy path; chapters 4 through 6 cover sizing and tuning for whatever silicon the machine has."),
    ],
  },
];

/**
 * Full manual, in reading order:
 *   Part I   - Foundations (plain language, from scratch)
 *   Part II  - Core systems
 *   Part III - Per-category tool reference (generated from the registry)
 *   Appendix - Glossary
 *
 * Chapter numbers are assigned here, so inserting a chapter never requires
 * renumbering anything by hand.
 */
const stripNumber = (c: PdfChapter): PdfChapter => ({
  ...c,
  title: c.title.replace(/^\d+\.\s*/, ""),
});

const ordered: PdfChapter[] = [
  ...FOUNDATIONS_CHAPTERS.map(stripNumber),
  ...BASE_CHAPTERS.map(stripNumber),
  ...buildFamilyTutorialChapters(),
  ...buildToolChapters(1).map(stripNumber),
  buildGlossaryChapter(),
];

export const MANUAL_CHAPTERS: PdfChapter[] = ordered.map((c, i) => ({
  title: `${i + 1}. ${c.title}`,
  blocks: c.blocks,
}));

/** Build the complete manual PDF bytes. */
export function buildManualPdf(): Uint8Array {
  return buildPdf(MANUAL_TITLE, MANUAL_SUBTITLE, MANUAL_CHAPTERS).bytes;
}

/** Trigger a browser download of the full manual. */
export async function downloadManual(): Promise<void> {
  const { bytes } = buildPdf(MANUAL_TITLE, MANUAL_SUBTITLE, MANUAL_CHAPTERS);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "stitap-agent-harness-manual.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
