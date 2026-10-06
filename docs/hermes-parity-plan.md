# stitaP Tool Harness → Hermes-Agent Parity Plan

_Prepared 2 Oct 2026 from a side-by-side read of `stitaP/tool-harness` (commit 46db156) and `NousResearch/hermes-agent` (main, shallow clone)._

---

## 0. The one-paragraph diagnosis

The harness has **breadth** (350+ deterministic tools, CAR guardrails, inference routing, SLM-friendly profiles) but no **engine**. Everything runs inside a Vite browser tab:

| Symptom you see | Root cause in the code |
|---|---|
| "No chat interface" | There is no `/chat` route. `AgentExecutor` exists (`src/lib/chains/agent-executor.ts`) but nothing drives it from a conversation UI. |
| "Doesn't run code" | `src/lib/agent/terminal.ts` executes via `new Function(...)` and *simulates* `ls`, `git`, `curl`, `npm` (lines ~209, 442–510). `shell-runtime.ts` returns simulated file content. Python is Pyodide (WASM). `sandbox/container-engine.ts` uses `child_process` but can't run in the browser. |
| "Stops instead of working until done" | `AgentExecutor` is a text-ReAct loop capped at `maxIterations = 8`, no native tool calling, no goal judge, no continuation, no context compression, no persistence. Default model is a rule-based responder that answers `"OK — …"`. |
| "Lots of agent modules but nothing happens" | `memory.ts`, `skills.ts`, `scheduler.ts`, `kanban.ts`, `approvals.ts`, `swarm.ts` are in-memory `Map`s in the tab — they vanish on reload, and the scheduler only *returns due jobs* for a "host runner" that doesn't exist. |
| AGENTS.md blocks it | Agency layer lists `shell_exec` and `file_system_write` as **blocked tools**. |

**Hermes' shape:** one long-lived **agent process** (Python) with a narrow core loop + ~40 core tools, persisted state (SQLite + FTS5), and many thin **clients** (CLI, TUI, desktop, web dashboard, messaging gateway, API server, ACP). The plan below gives the harness the same shape in TypeScript compiled to plain JavaScript on Node.js LTS (see §7 for enterprise runtime/distribution), reusing your existing modules rather than rewriting them.

---

## 1. Target architecture

```
                 ┌───────────────── clients ──────────────────┐
  Web chat (/chat)   TUI (`harness`)   Telegram/Discord/…   OpenAI-compatible API   ACP (VS Code/Zed)
        │                 │                 │                     │                    │
        └────── JSON-RPC / WebSocket / HTTP (one protocol) ───────┴────────────────────┘
                                     │
                       ┌─────────────▼──────────────┐
                       │  harnessd (Node.js daemon) │  ← NEW: the missing engine
                       │  ┌──────────────────────┐  │
                       │  │ AgentLoop (turns)    │  │  native tool calls, streaming,
                       │  │  + goal/loop/heartbeat│ │  interrupt, budgets, compression
                       │  └─────────┬────────────┘  │
                       │  Tool registry (existing 350 tools + new core tools)
                       │  Terminal backends: local │ docker │ ssh   (real processes)
                       │  State: SQLite (sessions, messages FTS5, cron, kanban, memory)
                       │  Cron ticker · Gateway adapters · MCP client · Plugins/hooks
                       └────────────────────────────┘
                                     │
                    Providers: llama.cpp / Ollama / LM Studio / OpenAI-compatible /
                    OpenRouter / Anthropic  (+ wllama in-browser stays for offline demo)
```

Design rules to borrow verbatim from Hermes' AGENTS.md:
1. **Narrow core, capability at the edges.** Every core tool schema is sent on every call — for SLMs this matters even more. Core ≈ 15–20 tools; the 350 store tools are reached via `tool_search` / session profiles / skills, not dumped into the prompt.
2. **System prompt is byte-stable for the life of a conversation** (prompt-cache friendly). Toolset/memory/skill changes take effect next session unless `--now`.
3. **Strict role alternation** — never two same-role messages; never inject a synthetic user message mid-tool-loop (continuations go *between* turns).
4. **`config.yaml` for behaviour, `.env` for secrets only.**

---

## 2. Gap matrix (Hermes feature → harness status)

Legend: ❌ missing · 🟡 partial / simulated / browser-only · ✅ present · Priority P0 (must, blocks "works like Hermes") → P3 (nice).

### 2.1 Agent core & "keeps working until done"

| Hermes feature | Hermes location | Harness today | Status | Pri |
|---|---|---|---|---|
| Long-lived agent process / daemon | `run_agent.py`, `agent/conversation_loop.py` | Browser tab only; `persistent-executor.ts` is a design, not a running process | ❌ | P0 |
| Native function-calling loop (OpenAI `tool_calls`, Anthropic `tool_use`) | `agent/turn_*.py`, `anthropic_adapter.py` | Text ReAct (`Thought/Action/…`) only | 🟡 | P0 |
| Iteration budget (default ~90, shared with subagents) | `agent/iteration_budget.py` | `maxIterations = 8` | 🟡 | P0 |
| Streaming tokens + streaming tool output | `stream_delivery.py` | none | ❌ | P0 |
| Interrupt / steer mid-turn (`Ctrl+C`, `/stop`, `/steer`, queue next msg) | `interrupt_control.py`, `/steer`, `/queue` | none | ❌ | P0 |
| Retry, error classification, provider fallback chain | `turn_recovery*.py`, `error_classifier.py`, `fallback_cooldown.py` | `inference/failover.ts` (not wired to an agent loop) | 🟡 | P0 |
| Context compression (preflight at ~50%, summary + archive) | `context_compressor*.py`, `micro_compaction.py`, `/compress` | none | ❌ | P0 |
| **Persistent goals `/goal`** (judge model checks completion after each turn, auto-continues, completion contract, turn budget) | `gateway/run_goals.py`, `goal_command.py` | none | ❌ | **P0** |
| **`/loop`** (recurring wakeups in-session, `--until`, `--times`, `LOOP_COMPLETE`) | `/loop`, `loops.max_ticks` | none | ❌ | P1 |
| **`/heartbeat`** (idle-only periodic prompt, coalescing, survives restart) | heartbeat docs, `state_meta` | none | ❌ | P1 |
| Verification-stop gates (don't declare done without evidence) | `verification_stop.py`, `verify_hooks.py`, `turn_stop_gates.py` | CAR "evaluation gates" exist but aren't enforced on a loop | 🟡 | P1 |
| `todo_list` tool (agent-maintained plan visible to user) | `tools/todo_*` | none | ❌ | P0 |
| `clarify` tool (ask user a structured question, then resume) | `tools/clarify_*` | none | ❌ | P1 |
| Empty-response / repetition guards | `empty_response_guard.py`, `repetition_guard.py` | none | ❌ | P1 (crucial for SLMs) |
| Plan mode / `/plan`, `/subgoal`, `/review`, `/refine` | slash commands | none | ❌ | P2 |
| Mixture-of-Agents (`/moa`) | `moa_loop.py` | `swarm.ts` blackboard (in-memory) | 🟡 | P3 |

### 2.2 Real execution tools

| Hermes feature | Harness today | Status | Pri |
|---|---|---|---|
| `terminal` — real shell, cwd persistence, timeouts, output spill to file | simulated in `terminal.ts` | 🟡→❌ | **P0** |
| `process_manage` — background processes, poll/wait/log/kill, completion notifications | simulated | ❌ | P0 |
| Terminal backends: local, Docker, SSH, Singularity, Modal, Daytona, Vercel | `container-engine.ts` (Docker via execSync, unused) | 🟡 | P0 local+docker · P1 ssh · P3 cloud |
| `read_file` / `write_file` / `patch` (fuzzy diff) / `search_files` (ripgrep) | VirtualFS only (`sandbox/virtual-fs.ts`) | ❌ | **P0** |
| Checkpoints before writes/destructive commands + `/rollback`, `/undo`, `/diff` | `.vcap` undo is capture-only | ❌ | P1 |
| `execute_code` — script calls tools via RPC (collapses multi-step into one turn) | Pyodide/JS runtimes, no tool RPC | 🟡 | P1 |
| Dangerous-command approval (`/approve`, `/deny`, `/yolo`, batch approval) | `approvals.ts` + CAR policies (not attached to a real shell) | 🟡 | P0 |
| Git worktrees per task (`/worktree`, `/branch`) | `git-provider.ts`, `github-agent.ts` | 🟡 | P2 |
| LSP integration (diagnostics after edits) | none | ❌ | P3 |

### 2.3 Web, browser, media

| Hermes feature | Harness today | Status | Pri |
|---|---|---|---|
| `web_search` + `web_extract` (pluggable providers) | `website-crawler.ts`; no search provider | 🟡 | P0 |
| Browser tools (`navigate/snapshot/click/type/scroll/vision/console/cdp/dialog`), backends: local CDP, Browserbase, Browser Use | `browser-automation.ts` (in-tab session objects) + Playwright devDep + Rust CDP engine | 🟡 | P1 |
| Browser vault (saved logins, 2FA code entry) | none | ❌ | P3 |
| `vision_analyze`, image paste | `lib/vision/*`, VLM gating | 🟡 | P1 |
| `computer_use` | none | ❌ | P3 |
| Image / video generation providers | none | ❌ | P3 |
| TTS, STT (voice memos), voice mode, wake word | `audio-tutorial.ts` only | ❌ | P3 |
| Document extraction (pdf/docx/xlsx) | `doc-parser.ts`, office engine | ✅ | — |

### 2.4 Learning loop (memory, skills, recall)

| Hermes feature | Harness today | Status | Pri |
|---|---|---|---|
| `MEMORY.md` + `USER.md` bounded memory in system prompt, `memory` tool, periodic nudges, flush before compression | `memory.ts` in-memory with decay/merge | 🟡 | **P0** |
| `session_search` — FTS5 over all past sessions + LLM summarization | none (Convex vector index is for captures) | ❌ | P1 |
| Skills: `SKILL.md` progressive disclosure (`skills_list` → `skill_view`), agentskills.io format, `/skill-name` invocation | `skills.ts` in-memory Map | 🟡 | P0 |
| Autonomous skill creation after complex tasks (`skill_manage`), self-improving skills | `self-improve.ts` (metrics only) | 🟡 | P1 |
| Curator (background review of memory/skills on a cheap aux model) | none | ❌ | P2 |
| Skills Hub / install from registry, bundles | Tool Store UI (tools, not skills) | 🟡 | P2 |
| Context files auto-loaded (`AGENTS.md`, `CLAUDE.md`, `.hermes.md`, `.cursorrules`, subdirectory hints) | AGENTS.md exists but isn't loaded into any prompt | ❌ | P0 |
| `@file`, `@folder`, `@diff`, `@url` context references | none | ❌ | P1 |
| `SOUL.md` / `/personality` presets | none | ❌ | P2 |
| Pluggable memory providers (Honcho, Mem0, OpenViking, …) | `viking/context-store.ts` (L0/L1/L2 tiers) | 🟡 | P2 (Viking = your first provider) |
| `tool_search` (defer rarely used tool schemas) | session profiles (`/modules`) — static | 🟡 | P0 (critical for 350 tools + SLMs) |

### 2.5 Orchestration & automation

| Hermes feature | Harness today | Status | Pri |
|---|---|---|---|
| `delegate_task` — isolated subagents, restricted toolsets, parallel batch (3 default), structured `output_schema`, shared iteration budget | `supervisor-router.ts`, `swarm.ts`, `teamwork/runner.ts` (no real child agents) | 🟡 | P1 |
| Cron scheduler daemon: NL/cron schedules, attach skills, deliver to any platform, pause/resume/edit, `cronjob_manage` tool | `scheduler.ts` (cron-lite parser, no ticker) | 🟡 | P1 |
| Kanban board with worker processes per card, dependencies, review, heartbeats, goal-mode cards | `kanban.ts` (in-memory) | 🟡 | P2 |
| Event hooks (pre/post tool, on message, on session end) + shell hooks | `extensions.ts` | 🟡 | P2 |
| Background-task completion notifications | `notifications.ts` (in-memory) | 🟡 | P1 |
| Batch runner + trajectory export (ShareGPT) + trajectory compression | none | ❌ | P3 (great for fine-tuning your SLMs) |

### 2.6 Interfaces & reach

| Hermes feature | Harness today | Status | Pri |
|---|---|---|---|
| **Chat UI** with streaming, tool-call cards, interrupt, slash-command palette, session sidebar | none (Playground runs tools, not conversations) | ❌ | **P0** |
| Terminal UI (multiline, autocomplete, history, interrupt-and-redirect) | none | ❌ | P1 |
| Sessions: `/new`, `/resume`, `/sessions`, `/retry`, `/undo`, `/branch`, `/title`, `/export`, `/history` | none | ❌ | P0 |
| `/model` switch at runtime, `/reasoning`, `/fast`, `/usage`, `/insights` | `/agent-config` page (static) | 🟡 | P1 |
| OpenAI-compatible API server (Open WebUI, LibreChat…) | Rust capture API only | ❌ | P1 |
| Messaging gateway: Telegram, Discord, Slack, WhatsApp, Signal, Email, Matrix, Teams… (~30 adapters), DM pairing, `/sethome` | `communication.ts`, `messaging.ts` (in-process bus) | ❌ | P1 (Telegram+Discord), P2 (Slack/WhatsApp/Email), P3 rest |
| MCP client (stdio + HTTP, per-server tool filters, OAuth, `/reload-mcp`) | none | ❌ | **P0** (gives you every external tool for free) |
| MCP server (expose harness tools to other agents) | none | ❌ | P1 (high value: your 350 tools to Claude/Hermes/Cursor) |
| ACP adapter (VS Code / Zed / JetBrains) | none | ❌ | P3 |
| Desktop app | Tauri README only | 🟡 | P3 (wrap the web chat) |
| Web dashboard (sessions, cron, kanban, usage, logs) | many pages exist (`ExecutionDashboard`, `Reports`) — not backed by real state | 🟡 | P2 |

### 2.7 Config, providers, ops, security

| Hermes feature | Harness today | Status | Pri |
|---|---|---|---|
| `harness setup` wizard, `harness model`, `harness tools`, `config get/set` | UI pages only | ❌ | P0 (minimal) |
| Providers: OpenAI-compatible, Anthropic, OpenRouter, Ollama, llama.cpp, LM Studio, vLLM | `backend-router.ts`, `provider-keys.ts`, `catalog.ts`, wllama | 🟡 | P0 |
| Credential pools / key rotation on 429 | `provider-keys.ts` | 🟡 | P2 |
| Aux model for cheap side tasks (judge, compression, titles, curator) | none | ❌ | P0 (goal judge needs it — can be the same SLM) |
| Profiles (isolated homes: config + secrets + memory) | `profile.ts` | 🟡 | P2 |
| Logs (`agent.log`, `errors.log`), `harness logs --follow`, `harness doctor` | `mdlog.ts`, `otel.ts`, `tracing.ts` | 🟡 | P1 |
| Secret redaction in outputs/logs, egress allowlist, webhook-safe toolset | SSRF guard (capture), `network-policy.ts` | 🟡 | P1 |
| Usage/cost tracking, `/insights` | CAR spend rails | 🟡 | P1 |
| Plugins (tools/hooks/memory/context-engine/platform), `harness plugins` | Tool Store manifests | 🟡 | P2 |
| Update/backup/import (`hermes claw migrate` equivalent) | none | ❌ | P3 |

---

## 3. Phased build plan

Each phase ends in something you can **use**, with explicit acceptance tests.

### Phase 0 — Engine skeleton (≈1–2 weeks) · P0

Goal: a real process that holds a conversation and calls tools with real side effects.

1. **New package `agent/` (Node.js LTS, runs outside the browser; pure-JS deps only — no native addons, no Bun)**
   - `agent/loop/` — `AgentLoop.runConversation({sessionId, userMessage})`:
     native tool-calling (OpenAI `tools`/`tool_calls`; Anthropic adapter), streaming callbacks (`onToken`, `onToolStart`, `onToolOutput`, `onToolEnd`), `AbortController` interrupt, iteration budget (config, default 60), retries with error classification, fallback provider list (reuse `inference/failover.ts`).
   - **Keep ReAct as a fallback mode** (`api_mode: react`) for models without tool-calling — move `chains/agent-executor.ts` parsing in as `ReactAdapter`. Also add a **JSON-grammar mode** for llama.cpp (GBNF constrained tool calls) — this is your edge over Hermes for 0.5–3B models.
   - `agent/providers/` — `openai-compatible` (covers llama.cpp server, Ollama, LM Studio, vLLM, OpenRouter), `anthropic`. Reuse `inference/catalog.ts` + `provider-keys.ts`.
   - `agent/state/` — SQLite (`node:sqlite` on Node 22.13+/24, `sql.js` WASM fallback — no compiler needed): `sessions`, `messages` (+ FTS5 virtual table), `state_meta`, `usage`. Home dir `~/.stitap/` with `config.yaml`, `.env`, `logs/`, `memories/`, `skills/`.
2. **Core tool set (real implementations)** in `agent/tools/`, registered through the existing `ToolManifest` registry so the Store/Docs pages still list them:
   `terminal`, `process_manage`, `read_file`, `write_file`, `patch`, `search_files`, `todo_list`, `web_search`, `web_extract`, `memory`, `skills_list`, `skill_view`, `tool_search`, `call_store_tool` (bridge into any of the 350 store tools by id).
3. **Terminal backends:** `local` (`child_process.spawn`; shell = bash/zsh on macOS/Linux, **PowerShell/cmd on Windows**; with persistent cwd/env, timeout, output spill >N KB to file) and `docker` (port `container-engine.ts`). Backend chosen in `config.yaml`.
4. **Safety:** port CAR Control layer to wrap tool dispatch — dangerous-command regex (rm -rf, sudo, curl|sh, git push --force…) → approval request; `approval_mode: ask | smart | yolo`. Update root `AGENTS.md` (remove `shell_exec` / `file_system_write` from blocked; gate them via approval instead).
5. **Prompt builder:** stable system prompt = SOUL/identity + tool guidance + `MEMORY.md` + `USER.md` + context files (`AGENTS.md`, `CLAUDE.md`, `.stitap.md`) discovered from cwd upward; built once per session.
6. **CLI v0:** `harness` (REPL with streaming), `harness -q "…"` one-shot, `harness model`, `harness config get|set`, `harness doctor`.

**Acceptance:** `harness -q "create a python script that prints the first 20 primes, run it, and show the output"` writes a real file, runs real Python, returns real output, using a local Ollama/llama.cpp Qwen2.5-7B-Instruct. Session survives restart and is searchable.

### Phase 1 — Chat interface + "work until done" (≈2 weeks) · P0

1. **Server mode `harnessd`**: WebSocket JSON-RPC (`session.create/list/resume`, `turn.send`, `turn.interrupt`, `turn.steer`, `approval.respond`, `clarify.respond`, events stream). Same protocol for web, TUI, desktop.
2. **Web `/chat` route** (reuse shadcn components): session sidebar, streaming markdown, collapsible tool-call cards with live terminal output, todo panel, approval/clarify dialogs, Stop button, slash-command palette (`cmdk` is already a dependency), model picker, token/cost footer.
3. **Slash commands (shared registry, table-driven):** `/new /resume /sessions /retry /undo /title /model /compress /usage /stop /steer /queue /goal /help /tools /skills /memory`.
4. **Context compression:** preflight when history > 50% of context window → summarize middle turns with aux model, keep head/tail, archive original; memory flush before compressing. Essential for small-context SLMs (4k–32k).
5. **`/goal` (Ralph loop):** store goal + optional completion contract in `state_meta`; after each turn an aux "judge" call returns `{done, reason}`; if not done, enqueue continuation prompt as a normal next user turn; stop on done / `/goal pause|clear` / `goals.max_turns`. Judge fails open.
6. **Guards for SLMs:** empty-response retry, repetition detector, malformed tool-call repair (fuzzy JSON parse already exists in ReAct parser), tool-name fuzzy match.

**Acceptance:** In the web chat: `/goal Make all tests in ./demo pass` → the agent edits, runs tests, iterates over multiple turns without you typing, shows a todo list, stops with judge-verified completion; you can interrupt and steer at any point.

### Phase 2 — Learning loop (≈1–2 weeks) · P0/P1

1. `memory` tool on `MEMORY.md` / `USER.md` with char caps (2.2k / 1.4k), add/replace/remove actions, nudge every N turns, flush on session end/compression (port decay/merge from `memory.ts`).
2. `session_search` over FTS5 with aux-model summarization of hits.
3. Skills: `~/.stitap/skills/<category>/<name>/SKILL.md` (agentskills.io frontmatter), progressive disclosure, `/skill-name` invocation, `skill_manage` (create/patch after a complex task, prompted by a post-task reflection step). Ship 10–15 starter skills converted from your verticals (microfinance, chit-fund, capture audit, CFD, Indic OCR…).
4. `@file / @folder / @diff / @url` references expanded inline.
5. `SOUL.md` + `/personality`.
6. OpenViking context store as first `MemoryProvider` implementation behind an interface.

**Acceptance:** Tell it a preference in session A; session B (after restart) respects it. After solving a multi-step task it proposes/saves a skill, and a later similar request loads that skill.

### Phase 3 — Parallelism, automation, checkpoints (≈2 weeks) · P1

1. `delegate_task`: child `AgentLoop` with isolated history, restricted toolset, own terminal session, shared iteration budget, `max_concurrent` (3), batch mode, `output_schema`.
2. `execute_code`: run a Python/TS script in the terminal backend with a local RPC socket exposing the tool registry (`from stitap_tools import web_search, read_file …`).
3. Cron daemon: ticker in `harnessd`, jobs table in SQLite, NL → cron parsing (port `scheduler.ts`), each run = fresh session, delivery to chat/notification/messaging, `cronjob_manage` tool, `harness cron list|add|pause|resume|rm`.
4. `/loop` and `/heartbeat` on the same ticker.
5. Checkpoints: shadow git repo snapshot before `write_file`/`patch`/destructive terminal commands → `/rollback`, `/diff`.
6. Background process completion notifications injected between turns.
7. `clarify` tool; verification-stop gate (agent must cite command output/test evidence before claiming done — reuse CAR evaluation gates).

### Phase 4 — Reach (≈2–3 weeks) · P1/P2

1. **MCP client** (stdio + streamable HTTP, per-server include/exclude, `/reload-mcp`) — do this early in the phase; it multiplies capability with zero core growth.
2. **MCP server** exposing the harness store tools (filtered by session profile).
3. **OpenAI-compatible API server** (`/v1/chat/completions`, `/v1/models`) backed by the agent loop.
4. **Messaging gateway** with a `PlatformAdapter` interface: Telegram → Discord → Slack → WhatsApp → Email; DM pairing/allowlist, per-chat sessions, `/sethome`, voice-memo transcription later, webhook-safe toolset for untrusted inputs.
5. TUI (Ink) on the same JSON-RPC protocol.

### Phase 5 — Ops, plugins, polish (ongoing) · P2/P3

Profiles · plugin loader (tools, hooks, memory providers, platform adapters) · hooks (pre/post tool, on_session_end) · curator · kanban with worker processes · credential pools · `/insights` + usage dashboard on real data · logs/`doctor` · secret redaction + egress allowlist · Tauri desktop wrapping `/chat` · browser tool backends (Playwright local, CDP, cloud) · vision/TTS/STT/image-gen providers · batch runner + trajectory export for fine-tuning your own SLMs · ACP adapter · import from Hermes/OpenClaw.

---

## 4. Proposed repo layout additions

```
agent/                       # NEW – Node.js runtime (no React, no DOM)
  loop/        conversation.ts turn-*.ts budget.ts interrupt.ts compression.ts goal.ts loop.ts heartbeat.ts
  providers/   openai-compatible.ts anthropic.ts react-adapter.ts gbnf.ts fallback.ts
  tools/       terminal.ts process.ts files.ts patch.ts search.ts todo.ts web.ts memory.ts skills.ts
               tool-search.ts store-bridge.ts delegate.ts execute-code.ts clarify.ts cron.ts
  backends/    local.ts docker.ts ssh.ts
  state/       db.ts sessions.ts messages-fts.ts meta.ts usage.ts
  prompt/      builder.ts context-files.ts references.ts soul.ts
  safety/      approvals.ts dangerous.ts redact.ts checkpoints.ts   (wraps src/lib/harness/car-framework.ts)
  server/      rpc.ts ws.ts openai-api.ts mcp-server.ts
  mcp/         client.ts
  gateway/     adapter.ts telegram.ts discord.ts slack.ts …
  cli/         main.ts repl.ts commands/*.ts slash-registry.ts
src/pages/Chat.tsx           # NEW – web chat client
src/lib/rpc-client.ts        # NEW – shared JSON-RPC client (web, desktop, TUI)
```

Pure modules in `src/lib/**` (financial, math, capture, nlp, inference, harness) are imported by `agent/` directly — they are already DOM-free TypeScript.

---

## 5. Suggested build order (first 10 PRs)

1. `agent/state` SQLite + config home + logs.
2. `openai-compatible` provider with streaming + native tool calls; ReAct adapter fallback.
3. `AgentLoop` with budget, interrupt, retries; unit tests with a scripted fake model.
4. Real `terminal` (local) + `read_file`/`write_file`/`patch`/`search_files` + approval gate.
5. `harness` CLI REPL + one-shot mode → **first end-to-end demo**.
6. `harnessd` WebSocket RPC + `src/pages/Chat.tsx`.
7. `todo_list`, slash-command registry, sessions commands.
8. Context compression + aux model config.
9. `/goal` judge loop.
10. `memory` + context files + `tool_search` / `call_store_tool` bridge.

---

## 6. Risks & decisions to make

- **Runtime:** decided — Node.js LTS core, shipped as a self-contained signed binary so end users need no language at all. See §7.
- **SLM reliability:** Hermes assumes frontier-ish models. For 0.5–8B you need: constrained decoding (GBNF/JSON schema), small core toolset (≤12 tools visible), `tool_search` for the rest, aggressive compression, and a stronger aux model optional for the judge.
- **Browser-only mode:** keep the current in-tab demo (wllama + simulated runtimes) as an explicit "offline demo" profile; label simulated tools as such so users aren't misled.
- **Security:** a real shell changes the threat model — approval defaults to `ask`, Docker backend recommended for unattended `/goal` and cron runs, never execute tools for webhook/messaging input from unpaired users.
- **License:** Hermes is MIT, so porting ideas and code is permitted with attribution; your repo is PolyForm Noncommercial — keep MIT notices on any copied files.

---

## 7. Enterprise runtime & distribution strategy (replaces Bun)

**Principle:** one core, one protocol, many packagings. The user's machine should never *need* a programming language; languages are an optional bonus the agent detects and uses.

### 7.1 Core decision
- **Core = TypeScript compiled to plain JavaScript, targeting Node.js LTS (22/24).** Node is the most widely approved runtime in enterprises (VS Code, Teams, Slack all ship it). The 350 existing tools are TypeScript, so nothing is rewritten.
- **Dependency rules:** pure-JS/WASM packages only (no `node-gyp`, no native addons) so installs never need a compiler; all deps pinned with upper bounds + lockfile; SBOM (CycloneDX) generated per release for security review.
- **Speed:** agent latency is dominated by model inference, not the host runtime. Node cold start ≈ 50–100 ms; the SEA binary below starts the same. Keep the core tool set small and lazy-load store tools.

### 7.2 Packaging tiers (same core, same config, same protocol)

| Tier | User's machine | What they install | What they get |
|---|---|---|---|
| **A. No language** (default for locked-down desktops) | Nothing — only IT-approved installers | Signed **MSI / PKG / DEB** (Intune, Jamf, SCCM-deployable). Contains the core as a **Node Single Executable Application** (`stitap.exe`, Node embedded) + desktop app (Tauri shell over the `/chat` UI). | Full product. Terminal tool uses PowerShell/cmd/bash already on the OS. |
| **B. Python only** | Python 3.9+, `pip` from internal mirror | `pip install stitap-harness` — a platform wheel that **bundles the same SEA binary** (the Playwright-for-Python / ruff model) plus a thin Python launcher (`stitap` CLI) and a Python SDK (`from stitap import Agent`). | Full product. Python is also auto-detected for `execute_code`. No Node install. |
| **B′. Python only, binaries forbidden** (only interpreted code allowed) | Python stdlib only | `pip install stitap-lite` (pure Python, **zero dependencies**: `sqlite3`, `subprocess`, `urllib`, `asyncio`, `http.server`) | **Lite core:** same agent loop, same JSON-RPC protocol, same `~/.stitap` layout, ~15 core tools (terminal, files, patch, search, web, todo, memory, skills, goal, delegate). The 350 TS store tools are unavailable unless Node appears later; the most-used ones get Python ports. |
| **C. JavaScript / npm** | Node 18+/npm | `npm i -g @stitap/harness` or `npx @stitap/harness` | Full product; easiest for developers and CI. |
| **D. Anything allowed** | Can install standard software | Any of the above + optional extras: Docker backend, Playwright browsers, llama.cpp/Ollama, uv-managed Python for data tools | Everything incl. sandboxed execution and browser automation. |

### 7.3 What keeps the variants consistent
- **Protocol first:** a versioned JSON-RPC spec (`protocol/`) and a JSON-Schema tool manifest. Web UI, desktop, TUI, Python SDK and messaging adapters talk only to the protocol, so they work with either core.
- **Shared state format:** identical SQLite schema, `config.yaml`, `MEMORY.md`/`USER.md`, `skills/**/SKILL.md` — a user can move between lite and full without migration.
- **Conformance test suite** (language-neutral, drives the protocol) run against both cores in CI. Lite stays deliberately small to keep this cheap.

### 7.4 Runtime detection (makes "multiple options" automatic)
On startup the core probes PATH and records capabilities in `doctor` output: `python`, `node`, `powershell`/`pwsh`, `bash`, `git`, `docker`, `rg`, model servers (Ollama/llama.cpp/LM Studio ports), corporate proxy/CA. Tools adapt: `execute_code` picks Python → Node → PowerShell; `search_files` uses `rg` else a built-in walker; terminal backend falls back to local when Docker is absent. Missing capabilities hide their tools instead of failing.

### 7.5 Enterprise hardening checklist
Code-signed binaries (Authenticode, Apple notarization) · offline install bundles · no auto-update unless enabled (or via IT channel) · respects `HTTPS_PROXY` and corporate CA store · all model endpoints configurable (Azure OpenAI, internal gateway, local llama.cpp) · telemetry off by default · admin policy file (`/etc/stitap/policy.yaml` / registry key) that locks approval mode, allowed tools, egress allowlist — built on the existing CAR framework · per-user data under the user profile only.

### 7.6 Revised build order impact
PR 1 adds `protocol/` (spec + JSON Schemas) before any core code. SEA packaging + Python wheel wrapper land right after the first end-to-end demo (PR 5). The pure-Python lite core starts only after the full core's protocol is stable (after Phase 1).

---

## 8. Implementation status (2 Oct 2026)

Built in `agent/` (Node.js, zero runtime dependencies), `python/` (launcher, SDK, pure-Python
lite core) and `src/pages/Chat.tsx`. Verified by 96 Node tests (end-to-end against the mock model plus unit tests) and 8 Python tests
against a scripted OpenAI-compatible mock model (real shell, files, SQLite, HTTP, MCP, browser).
**Not yet verified against a live LLM** in this environment (model downloads were blocked) —
run `harness doctor` with your model server first.

| Phase | Item | Status |
|---|---|---|
| 0 | Long-lived runtime, sessions in SQLite + FTS5 (JSON fallback), config.yaml/.env/profiles | ✅ |
| 0 | Native tool calling (OpenAI-compatible, Anthropic), streaming, ReAct fallback, `<tool_call>` + JSON + name repair | ✅ |
| 0 | Iteration budget, interrupt, steer, retries, fallback models, error classification | ✅ |
| 0 | Real terminal (bash/zsh/sh, PowerShell, cmd; local/docker/ssh), cwd persistence, background processes | ✅ |
| 0 | read_file / write_file / patch (whitespace-tolerant) / search_files (ripgrep or built-in) / list_dir | ✅ |
| 0 | Dangerous-command approvals (once/session/always), blocked paths, admin policy file | ✅ |
| 0 | System prompt built once per session: SOUL, rules, environment, memory, skills index, AGENTS.md/CLAUDE.md/.cursorrules | ✅ |
| 0 | CLI: chat, one-shot (`--json`), setup wizard, doctor, config/secret/model | ✅ |
| 1 | Daemon: JSON API + SSE, token auth, DNS-rebinding guard, CORS allow-list | ✅ |
| 1 | Web chat (`agent/ui`, no build) + React `/chat` page | ✅ |
| 1 | 39 slash commands incl. /new /resume /retry /undo /branch /model /compress /usage /insights /export | ✅ |
| 1 | Context compression (preflight + on provider overflow, archive originals) | ✅ |
| 1 | `/goal` with judge, completion contracts (`/goal draft`), turn budget, pause/resume | ✅ |
| 1 | SLM guards: empty-response retry, repetition guard, slm tool profile | ✅ |
| 2 | MEMORY.md / USER.md + memory tool + nudges | ✅ |
| 2 | session_search (FTS5, optional summary) | ✅ |
| 2 | Skills: SKILL.md, progressive disclosure, `/skill-name`, skill_manage, 13 bundled skills | ✅ |
| 2 | Curator (background memory + skill extraction after complex turns) | ✅ |
| 2 | @file / @folder / @diff / @staged / @url references, SOUL.md, /personality | ✅ |
| 2 | Pluggable memory providers (Honcho/Mem0/OpenViking) | ❌ not started (OpenViking store not wired as a provider) |
| 3 | delegate_task (parallel subagents, shared budget, output_schema) | ✅ |
| 3 | execute_code (Python/JS scripts calling tools over local RPC) | ✅ |
| 3 | Cron (NL schedules, delivery to log/Telegram/Discord/Slack/webhook), `/loop`, `/heartbeat` | ✅ |
| 3 | Checkpoints (shadow git) + /rollback /diff; background-exit notifications; clarify | ✅ |
| 3 | Verification gate | 🟡 via the goal judge (evidence required); no separate stop-gate |
| 4 | MCP client (stdio + Streamable HTTP, include/exclude, /reload-mcp) and MCP server | ✅ |
| 4 | OpenAI-compatible `/v1/chat/completions` + `/v1/models` | ✅ |
| 4 | Gateway: Telegram, Discord, Slack, webhooks, DM pairing, /sethome | ✅ (live platforms untested here — need bot tokens) |
| 4 | Gateway: WhatsApp, Signal, Email, Matrix, Teams and the other ~25 Hermes adapters | ❌ |
| 4 | Ink TUI | 🟡 readline terminal chat with streaming, autocomplete, inline approvals (no full-screen TUI) |
| 4 | ACP adapter (VS Code / Zed / JetBrains) | ❌ |
| 5 | Plugins (tools + hooks), shell hooks, profiles, kanban workers, insights, logs, redaction, egress guard | ✅ |
| 5 | Browser tools (Playwright, optional) | ✅ |
| 5 | Tool Store bridge (`tool_search` / `use_tool`) | ✅ 367 tools, **all with executors** (agent secrets, model and memory wired in; side-effecting tools approval-gated) — see [tool-store.md](tool-store.md); `npm --prefix agent run test:store` runs every tool |
| 5 | Batch runner + ShareGPT trajectory export | ✅ |
| 5 | Credential pools / key rotation | 🟡 fallback model chain only |
| 5 | Computer use | 🟡 `desktop` tool: screenshots, UI tree, mouse, keyboard, apps, clipboard (macOS, Windows, Linux) |
| 5 | Voice/TTS/STT, image generation, wake word | ❌ |
| 5 | Desktop app (Tauri) | ❌ `harness ui` opens the web chat in the browser |
| §7 | Node SEA single executable (store embedded), single-file bundle | ✅ built and run in CI here (Linux x64); signing/notarization is a release step |
| §7 | Python wheel: pure (JS engine + lite) and platform (embedded executable), engine auto-selection | ✅ |
| §7 | Pure-Python lite core (terminal, files, web, todo, memory, skills, search, execute_code, approvals, compression, /goal, web UI) | ✅ |
| 6 | Local-model operation (4 Oct 2026): cross-platform launcher (`start-local.mjs`, context sized to GPU memory), autocompact sized to the window with state re-attached, large phased plans, `/schedule` long tasks, agents + per-tool settings UI, working-folder picker, `docs_lookup` (official docs, with consent), Safari backend, loop/repeat guards, size-limited checkpoints | ✅ |
| §7 | Corporate proxy support | ✅ re-launch with `NODE_USE_ENV_PROXY=1` when HTTPS_PROXY is set |
| §7 | Versioned `protocol/` spec + cross-engine conformance suite | 🟡 both engines serve the same API and share the schema/UI; no formal spec file yet |
