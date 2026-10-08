# stitaP agent runtime (`harness`)

The engine that turns the tool harness into an autonomous agent: a long-lived process that
chats with you, **runs real commands, edits real files, and keeps working until the task is
done** — with memory, skills, schedules, MCP, messaging gateways and a web chat UI.

Zero runtime dependencies. TypeScript compiled to plain JavaScript on Node.js 20.3+ (22 LTS
recommended), or a single signed executable with Node embedded, or `pip install` for
Python-only machines. See [docs/agent-runtime.md](../docs/agent-runtime.md) for the full guide.

## Install and run locally

Runs fully on your machine: a local model served by [llama.cpp](https://github.com/ggml-org/llama.cpp) plus the agent's
web chat — on **macOS, Windows and Linux** (desktops and headless servers). This section is the short version; the full
guide with GPU options, servers, services and troubleshooting is **[docs/install-local.md](../docs/install-local.md)**.

### 1. Install the prerequisites (once)

| System | Commands |
|---|---|
| macOS (Apple silicon) | `brew install node llama.cpp git` ([Homebrew](https://brew.sh)) |
| Windows 10/11 (PowerShell) | `winget install OpenJS.NodeJS.LTS` · `winget install Git.Git` · `winget install llama.cpp` — then reopen PowerShell |
| Linux | Node.js 22 LTS ([nodejs.org/en/download](https://nodejs.org/en/download)), `git`, and llama.cpp: `brew install llama.cpp`, a [prebuilt release](https://github.com/ggml-org/llama.cpp/releases), or a CUDA/Vulkan build — see [install-local.md §4](../docs/install-local.md#4-linux-desktop) |

Check with `node -v` (v20.3 or newer) and `llama-server --version`. If llama.cpp is not on your PATH, set
`LLAMA_SERVER` to the full path of `llama-server` (Windows: `llama-server.exe`).

### 2. Get the code and build the agent (once)

```bash
git clone https://github.com/stitaP/tool-harness.git
cd tool-harness
npm install              # TypeScript and other dev tools
npm run agent:build      # compiles agent/src → agent/dist
```

### 3. Download a model (once)

Pick one that fits your GPU memory (Apple unified memory or your graphics card's VRAM). Speeds were measured inside the
agent's chat on an M4 Mac.

| GPU memory | Model | File size | Speed |
|---|---|---|---|
| 4 GB+ (or CPU only) | Qwen3-4B-Instruct-2507 Q4_0 — fast, good for simple tasks | 2.4 GB | ~30 tok/s |
| 12 GB+ | Qwen3-Coder-30B-A3B UD-IQ2_M — much stronger at coding | 10.8 GB | ~39 tok/s |

macOS / Linux:

```bash
mkdir -p ~/models
curl -L -C - --retry 5 -o ~/models/Qwen3-4B-Instruct-2507-Q4_0.gguf \
  https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_0.gguf
```

Windows (PowerShell — type `curl.exe`, not `curl`):

```powershell
mkdir $HOME\models -Force
curl.exe -L -C - --retry 5 -o $HOME\models\Qwen3-4B-Instruct-2507-Q4_0.gguf `
  https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_0.gguf
```

For the 30B model use `…/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF/resolve/main/Qwen3-Coder-30B-A3B-Instruct-UD-IQ2_M.gguf`.
If a download stops part-way, run the same command again — `-C -` resumes it.

**Mac with the 30B model:** macOS lets the GPU use only about two thirds of RAM by default. Raise the limit once
after every restart of the Mac (13312 MB suits a 16 GB Mac): `sudo sysctl iogpu.wired_limit_mb=13312`.

### 4. Start stitaP agent

From the `tool-harness` folder — the same command on every system:

```bash
node agent/scripts/start-local.mjs ~/models/Qwen3-4B-Instruct-2507-Q4_0.gguf          # macOS / Linux
node agent\scripts\start-local.mjs $HOME\models\Qwen3-4B-Instruct-2507-Q4_0.gguf     # Windows PowerShell
node agent/scripts/start-local.mjs ~/models/…gguf --no-open                           # Linux server: then connect with
                                                                                      #   ssh -N -L 7420:127.0.0.1:7420 user@server
```

It starts the model server, sizes the context to the free GPU memory, runs a short speed test, then opens the web
chat at **http://127.0.0.1:7420**. Leave the terminal window open while you work.

**Example:** keep chats and settings in your own folder and run the 30B coding model with all tools:

```bash
STITAP_ROOT=~/AgenticAI/harness-home PROFILE=standard node agent/scripts/start-local.mjs ~/models/Qwen3-Coder-30B-A3B-Instruct-UD-IQ2_M.gguf
```

**Stop:** press `Ctrl-C` in that terminal. **Restart:** run the same command again. From another terminal:
`pkill llama-server; pkill -f "harness.mjs serve"` stops both (also stop `bench/moe-stream` runs first if you use them:
`pkill -f run-gguf-2bit.sh; pkill -INT -f "ggufcache.py run"`).

Useful options (macOS/Linux: put them before `node`; PowerShell: `$env:PROFILE = "standard"` first):

```bash
PROFILE=standard node agent/scripts/start-local.mjs ~/models/Qwen3-Coder-30B-A3B-Instruct-UD-IQ2_M.gguf   # all tools (stronger models)
CTX=16384 node agent/scripts/start-local.mjs ~/models/…gguf           # fixed context instead of "as big as fits" (the agent reads the real size from the server)
FIT_MARGIN_MB=3072 node agent/scripts/start-local.mjs ~/models/…gguf  # leave more memory for other apps
```

All settings, running as a systemd service, and Windows/Linux specifics: [docs/install-local.md](../docs/install-local.md).

Your chats, settings, memory and skills are kept in `~/.stitap` (change with `STITAP_ROOT=…`).

### 5. First steps in the web chat

1. Click **📁** in the top bar and choose your project folder (tick *make this the default* to use it for every new chat).
   The agent reads and writes files there.
2. Type a task, e.g. `Create a small Express app with a /health route and a test, then run the test`.
3. For long work, start with `/goal <what done looks like>` — the agent keeps going until it is verified.
4. **⚙ Settings** has agents, every tool (on/off and options) and general settings; the left sidebar has your
   chats, **Skills** and **MCP** servers. Hover a chat for **Archive** or **Delete**; *Show archived chats* at the
   bottom of the list brings archived ones back.
5. Working on a whole project? Don't paste it — choose it with **📁** (or `/cwd <folder>`), or mention
   `@folder:path` to show the agent its file tree; the agent reads the files it needs.
6. Many spec documents to build one after another: `/pipeline start docs/phase-*.md --from 1 --to 20` — each
   document's `**Test:**` command decides when it is done, and earlier documents' tests and pages must keep passing.

Handy commands: `/help` · `/goal` · `/compact` (free up context) · `/schedule in 2h | <task>` · `/stop` · `/cwd <folder>` · `/agent <name>` · `/pipeline status` (works from any chat).

### Ready-made sites

Ask for a site and the agent starts from a maintained open-source template instead of writing it:

```text
create an online store for PrakritTattva in green          → site_template id=ecommerce-next (+ ecommerce-nuxt)
set up a Strapi CMS with products and categories           → site_template id=cms-strapi, strapi_cms create_type
a lending portal for my NBFC with WhatsApp reminders       → site_template id=lending-portal-nuxt (Apache Fineract)
EMI on ₹5 lakh at 12% for 3 years                          → finance_calc
```

Catalog (e-commerce, CMS, lending/core banking, docs, dashboards, landing/SaaS, chat, streaming, IoT, EV chargers,
remote desktop), licenses and examples: [docs/site-templates.md](../docs/site-templates.md).

### Other ways to run

```bash
cd agent
node bin/harness.mjs setup        # use another model server: Ollama, LM Studio, OpenRouter, OpenAI, Anthropic, company gateway
node bin/harness.mjs doctor       # check the model and tool calling
node bin/harness.mjs              # terminal chat instead of the web chat
node bin/harness.mjs ui           # web chat only (model server already running)
node bin/harness.mjs -q "Write a script that prints the first 20 primes and run it"   # one-shot task
```

`npm link` (in `agent/`) once gives you a global `harness` command.

### Let the agent use Safari (macOS, optional)

The browser tools drive Safari on a Mac. Allow it once:

1. `safaridriver --enable` (asks for your password)
2. Safari ▸ Settings ▸ Advanced ▸ tick **Show features for web developers**
3. Safari menu bar ▸ **Develop ▸ Allow Remote Automation**

Then **⚙ Settings ▸ Tools ▸ browser ▸ Test**. Other installed browsers (Chrome, Edge, Brave…) can be picked there too.

### Troubleshooting

| Message | Fix |
|---|---|
| `port 8081 is in use` / `port 7420 is in use` | Another copy is running — press `Ctrl-C` in its terminal, or `pkill llama-server; pkill -f "harness.mjs serve"` (Windows: end `llama-server.exe` / `node.exe` in Task Manager) |
| `llama-server was not found` | Install llama.cpp (step 1) or set `LLAMA_SERVER` to its full path |
| `the agent is not built yet` | Run `npm install && npm run agent:build` in the `tool-harness` folder |
| The model server stops right after starting | Not enough GPU memory: use the smaller model, raise the limit (step 3), or close other apps |
| Replies are very slow | Check the **Model stats** panel (right sidebar); keep the context small with `/compact`, or use the 4B model |
| Token counts look huge | The model re-reads the whole conversation every call; the stats split *new* tokens from tokens *reused from cache* (no compute) |
| Can't find the chat running a pipeline | `/pipeline status` / `stop` work from any chat; `/pipeline list` shows every pipeline and the chat that started it |
| A pipeline phase broke earlier work | The regression and visual gates send such a phase back automatically; `file_history` (or `/rollback`) restores earlier file versions |
| Can't remove a chat | Hover it in the left sidebar: **Archive** or **Delete** |
| `Safari is not set up for automation` | Do the three Safari steps above |

## What's inside

52 built-in tools (16 sent to small models on every call, the rest by profile or on demand through `tool_search`), 367 Tool Store tools, 19 bundled skills, 40 slash commands.

| Area | Highlights |
|---|---|
| Agent loop | native tool calling (OpenAI-compatible + Anthropic), ReAct text fallback for models without tools, `<tool_call>` recovery, JSON repair, tool-name repair, streaming, interrupt & steer, retries + fallback models, iteration budget, context compression |
| Work until done | `/goal` (judge-verified continuation), `/loop` (interval or back-to-back, `--until`, `--times`), `/heartbeat`, `todo_list`, background-process notifications |
| Real execution | `terminal` (bash/zsh/sh, PowerShell, cmd; local · docker · ssh), `process_manage`, `read_file`, `write_file`, `patch` (whitespace-tolerant), `search_files` (ripgrep or built-in), `execute_code` (Python/JS scripts calling tools over local RPC), `delegate_task` (parallel subagents), browser (Safari on macOS or Chromium browsers via Playwright), `vision_analyze`, web search/extract, `docs_lookup` (official documentation only) |
| Safety | dangerous-command approvals (ask / yolo / deny; once / session / always), checkpoints + `/rollback` `/diff` + `file_history`, blocked and protected paths (`.stitap-protected`), write guards (no wiping files, no `[REDACTED]` placeholders written into code), egress guard (no private-network fetches), secret redaction that leaves code readable, admin policy file that locks settings |
| Learning | `MEMORY.md` + `USER.md`, `session_search` (SQLite FTS5), skills (`SKILL.md`, agentskills.io format, 19 bundled), `skill_manage`, background curator that saves memories and new skills |
| Automation | cron scheduler with natural-language schedules and delivery (log, Telegram, Discord, Slack, webhook), kanban board with dependency-aware worker agents, batch runner → ShareGPT trajectories |
| Reach | web chat UI (chat archive/delete, live model stats: tokens incl. sub-chats, cache reuse, speed, real context size, GPU memory), terminal chat, JSON API + SSE, OpenAI-compatible `/v1/chat/completions`, MCP client (stdio + HTTP), MCP server (`harness mcp serve`), Telegram / Discord / Slack / webhook gateway with DM pairing |
| Pipelines | `/pipeline` runs spec documents one after another with a regression gate (earlier tests must keep passing), a visual gate (pages must still render), no-wipe file guards, and stop/status from any chat |
| Sites, CMS & finance | `site_template` (pinned open-source templates: e-commerce on Next.js + Payload or Nuxt, Strapi CMS, Fineract lending portal with WhatsApp updates, docs, dashboards, …), `strapi_cms` (content types + entries), `finance_calc` (EMI, schedules, prepayment, eligibility) — [docs/site-templates.md](../docs/site-templates.md) |
| Testing & capture | `run_tests` (counts + failing assertions only), `page_check` (every page in headless Chromium), `file_history` (restore earlier file versions), `webtest` (Playwright: scaffold a suite, run recorded scenarios with a screenshot per step, video, trace, report and generated spec, run suites), `screen_capture` (screen/region/window/display), `screen_record` (screen video), `camera_capture`, skills for browser E2E, desktop UI, visual-regression, API/form testing and evidence capture |
| Documents | `office_to_markdown`: Word, Excel, PowerPoint, OpenDocument and legacy `.doc` `.xls` `.ppt` `.rtf` → Markdown, all read natively (no LibreOffice, no external tools) |
| Tool Store | `tool_search` + `use_tool` reach all 367 store tools (every one runs) without bloating the prompt — credentials, requirements and approvals in [docs/tool-store.md](../docs/tool-store.md); every tool with its parameters in [docs/tool-catalog.md](../docs/tool-catalog.md) |
| Extensibility | plugins (`~/.stitap/plugins/*.mjs`: tools + hooks), shell hooks, profiles (`-p work`) |

## Layout

```
agent/
  bin/harness.mjs          CLI entry
  src/                     TypeScript sources (compiled to dist/)
    loop/                  turn loop, compression, goal/loop/heartbeat, curator
    providers/             OpenAI-compatible, Anthropic, ReAct adapter, fallback
    tools/                 terminal, files, web, browser, delegate, execute_code, …
    runtime/               Runtime, sessions, slash commands, hooks/plugins, store bridge
    server/                HTTP API, SSE, OpenAI-compatible endpoint
    gateway/               Telegram, Discord, Slack, webhooks
    mcp/                   MCP client + server
    cron/ kanban/ memory/ skills/ safety/ state/ prompt/ cli/ batch/
  ui/index.html            web chat (no build step)
  skills/                  bundled skills
  templates/               site_template catalog (catalog.json) and our patches to upstream templates (packs/)
  store/store.mjs          Tool Store bundled for Node (npm run build:store)
  scripts/                 start-local (model server + agent), build-store, gen-tool-catalog, build-bundle (single file), build-sea (single executable)
  test/                    node:test suites + scripted mock model
```

## Develop

```bash
npm install            # at the repo root (TypeScript + esbuild are dev-only)
npm run agent:build    # tsc → agent/dist
npm run agent:test     # end-to-end tests against a scripted mock model
cd agent && npm run build:bundle && npm run build:sea   # single file / single executable
```
