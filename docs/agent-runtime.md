# stitaP Agent Runtime — Guide

The agent runtime (`agent/`, command `harness`) is the long-lived process that makes the
harness behave like an autonomous agent: you chat with it, it runs real commands and edits
real files, and it keeps working until the task is done. The browser app (`/chat`) and every
other surface are clients of this process.

---

## 1. Install — pick what your machine allows

| Your machine | Install | Engine |
|---|---|---|
| **No programming language allowed** | IT deploys the signed single executable `stitap` / `stitap.exe` (built with `npm run build:sea`) together with its `ui/` and `skills/` folders | full |
| **Only Python 3.8+** | `pip install stitap-harness` (platform wheel built with `python build_wheel.py --with-binary`) | full (bundled executable) |
| **Only Python, binaries forbidden** | `pip install stitap-harness` (pure wheel) with `STITAP_ENGINE=lite` or no Node present | lite (pure Python, zero deps) |
| **Node.js 20.3+ / npm** | `npm i -g @stitap/harness`, or run `node agent/bin/harness.mjs` from this repo | full |
| **Anything allowed** | any of the above + Docker (sandboxed terminal), Playwright (`npx playwright install chromium`), Ollama/llama.cpp | full + extras |

**Running a local model on your own machine** (macOS, Windows, Linux desktop or server): follow
[install-local.md](install-local.md) — one launcher, `node agent/scripts/start-local.mjs <model.gguf>`, starts llama.cpp
and the web chat with the context sized to your GPU memory.

`python -m stitap engine` tells you which engine was picked. All engines share `~/.stitap`
(config, secrets, memory, skills, `state.db`), so a user can move between them freely.

Runtime dependencies: **none**. Node built-ins only (`node:sqlite` on Node 22.13+ for state and
full-text search; a JSON-file fallback on Node 20). The Python lite core uses only the stdlib.

## 2. First run

```bash
harness setup      # model server, approvals, terminal backend, optional Telegram
harness doctor     # checks Node, state store, model reachability, tool calling, store, browser
harness            # terminal chat
harness ui         # web chat → http://127.0.0.1:7420
```

### Model servers

Anything OpenAI-compatible works (`model.provider: openai`): Ollama
(`http://localhost:11434/v1`), llama.cpp server (`:8080/v1`), LM Studio (`:1234/v1`), vLLM,
LiteLLM, OpenRouter, OpenAI, Azure/enterprise gateways. Native Anthropic: `provider: anthropic`.

Small models (0.5B–8B):
- `agent.tool_profile: slm` sends 16 tools on every call (`terminal`, `read_file`, `write_file`, `patch`, `search_files`,
  `run_tests`, `page_check`, `file_history`, `todo_list`, `memory`, `skill_view`, `web_search`, `web_extract`,
  `docs_lookup`, `tool_search`, `use_tool`) and a shorter system prompt; everything else is reached through `tool_search`.
- With a local llama.cpp server the agent reads the **real** context size from the server (`/props`), so `--fit` /
  `CTX` choices are what autocompaction and the stats use, whatever `model.context_window` says.
- `model.tool_mode: auto` uses native tool calls and permanently switches to the ReAct text
  protocol if the server rejects tools; `react` forces it.
- `<tool_call>{…}</tool_call>` text (Qwen/Hermes style), malformed JSON and misspelled tool
  names are repaired automatically; repeated identical calls get flagged.
- Put a stronger model in `aux:` for the goal judge, compression, titles and curator — or leave
  it empty to reuse the main model.
- `fallback_models:` lists models tried in order when the main one fails.

## 3. Using it

**Terminal chat:** type a task. `Ctrl+C` interrupts the running turn; typing while it works
queues your message; `/steer <text>` injects guidance into the running turn. Multi-line input:
end lines with `\` or wrap in `"""`. Attach context with `@file:path`, `@file:path:10-40`,
`@folder:dir`, `@diff`, `@staged`, `@url:https://…` (images become vision input).

**Whole folders.** Don't paste a project into the chat — point the agent at it. `@folder:dir` gives the agent a tree
of the folder with file sizes (up to 400 entries, four levels; `node_modules`, `.git`, build output skipped), never
the contents; the agent then reads what it needs with `read_file` (paged) and `search_files`. Everything referenced in
one message shares about a third of the model's context, so a big `@file` is cut with a note to page through the
rest instead of overflowing the context. To work in a folder, make it the chat's working folder (📁 or `/cwd`).

**Web chat:** sessions sidebar, streaming answers, live tool cards, approval and clarify cards,
plan + goal panel, image paste, slash-command palette. Hover a chat in the left sidebar for **Archive** (hidden from
the list; *Show archived chats* at the bottom lists them with **Restore**) and **Delete** (asks first; also removes the
pipeline documents and sub-chats it started, and stops a running pipeline). The right sidebar's **Model stats**:
tokens for the chat *including its sub-chats* (pipeline documents, subagents), split into *new* input and input
*reused from the server's prompt cache* (llama.cpp re-reads the conversation every call; only new tokens cost compute),
generation speed, context used of the **real** context size (read from llama-server, so `--fit` sizes show correctly
and autocompaction uses them) and GPU memory. Figures survive restarts. The React app has the same experience at
`/chat` once `harness serve` is running (it pairs with the daemon automatically for origins in
`server.cors_origins`).

**Slash commands** (terminal, web and chat platforms): `/new /sessions /resume /title /retry
/undo /branch /history /export /compress /usage /insights /model /tools /skills /memory
/personality /goal /loop /heartbeat /stop /steer /queue /approve /deny /yolo /rollback /diff
/cwd /cron /kanban /mcp /reload-mcp /reload /plugins /status /help /compact /schedule /agent /pipeline` and `/<skill-name>`
(aliases: `/reset` = `/new`, `/fork` = `/branch`, `/cd` = `/cwd`, `/compact` = `/compress`). A message that only
*starts* with `/` because it is a path (`/Users/me/plan.md do this`) goes to the agent, not the command parser.

**Claude Code-style commands.**

| | |
|---|---|
| `/plan <task>` | plan mode: the agent may only read (file reads, search, `git status/diff/log`, read-only shell commands such as `ls`, `cat`, `grep`); any write is refused with a note. It answers with a `## Plan`. `/plan approve [changes]` turns plan mode off and carries the plan out; `/plan on\|off\|show`. |
| `/review [PR# \| ref \| --staged] [paths] [focus]` | read-only code review of the uncommitted changes and new files (or the last commit when the tree is clean, a branch since `ref`, or a GitHub PR through `gh`): verified findings, most severe first. `/security-review` does the same for exploitable vulnerabilities; `/simplify` cleans the changed code (reuse, dead code, efficiency) without changing behaviour and re-runs the tests. |
| `/init [notes]` | explore the project and write `AGENTS.md` (or improve an existing `AGENTS.md` / `CLAUDE.md`): commands, architecture, conventions. |
| `/context` | where the context window goes: system prompt sections, tool schemas (largest first), your messages, replies, tool calls and results, free space, and when compaction starts. |
| `/hooks` | list, `add <event> [--match <tool regex>] <command>`, `remove <event> <n>`, `test <event> [tool]`. Shell hooks get the event as JSON on stdin; a `pre_tool_call` hook that exits **2** blocks the call and its stderr is what the model sees. |
| `/permissions` | approval mode, allow rules, per-chat approvals, denied tools, blocked and protected paths; `allow <pattern>`, `remove <n>`, `deny <tool>`, `undeny <tool>`, `mode ask\|deny\|yolo`, `block <path>`, `protect <glob>`. `/fewer-permission-prompts [apply [n,…]]` suggests allow rules from the commands you keep approving (never a prefix rule for `rm`, `sudo`, `curl`, `--force`, …). |
| `/add-dir <path>` | add another folder to the chat: it is named in the instructions (with its `AGENTS.md`/`CLAUDE.md`) and edits there are checkpointed in that folder (`/diff`, `/rollback <id> --dir <folder>`). `list`, `remove <path>`. |
| `/worktree new [name]` | move the chat into a git worktree on branch `stitap/<name>` (in `<repo>/.stitap-worktrees/`, git-excluded); `status`, `list`, `merge [message]` (commit, merge into the original branch, remove), `exit [--remove [--force]]`, `remove <name>`. `delegate_task isolation=worktree` gives each subagent its own worktree and returns the branch to merge; `kanban.worktrees: true` runs each card's worker in a worktree on `kanban/<KEY>` and merges it when the card is done (a merge conflict sends the card to review; `/kanban merge <KEY>` retries). Cards run in the main checkout when it has uncommitted changes. |
| `/effort off\|low\|medium\|high\|xhigh\|max\|default` | reasoning effort for this chat (`agent.effort` for new chats). Claude: `output_config.effort` with adaptive thinking (a thinking budget on pre-4.6 models); local servers: `enable_thinking` + `reasoning_effort`; other OpenAI-compatible servers: `reasoning_effort`. |
| `/output-style [name]` | `concise`, `explanatory`, `learning` (leaves small `TODO(human)` parts for you), `report`, any `.md` file in `<home>/output-styles/` (optional first line `description: …`), or free text. `agent.output_style` sets the default. |
| `/statusline` | the line shown above the terminal prompt and in the web chat footer: model and router tier, context use, git branch (`*` = uncommitted), folder, worktree, plan mode, effort, style, YOLO. `on\|off`, `command <cmd>` (your script gets the fields as JSON on stdin, its first output line is shown; `/statusline json` shows them), `reset`. |
| `/todos [clear]` · `/tasks` (`/bashes`) | the chat's todo list · background processes: `/tasks all`, `log <id>`, `kill <id>`. |
| `/vim [on\|off]` · `/keybindings` · `/terminal-setup` | vim keys in the terminal chat (Esc = normal mode; motions, `x d c r ~ p u`, `dd cc dw cw`, `j/k` history) · list keys and bind `ctrl+<key>` / `alt+<key>` to a slash command (`/keybindings set ctrl+g /status`) · how to make Option/Alt+Enter insert a new line in your terminal. |
| `/release-notes` · `/bug <what happened>` | recent harness changes · write a bug report (session, model, recent log, secrets redacted) to `<home>/bugs/`. |
| `convert_document` (tool) | the agent reads or converts documents as its work needs: PDF, Word, Excel, PowerPoint, OpenDocument, RTF, HTML, CSV, Markdown, images and Google/document links in; `.md .txt .html .docx .doc .odt .rtf .pdf .csv .tsv .xlsx .json` and image formats out (the output's extension picks it; `sheet` picks one sheet or table). Without `output` it returns the content as Markdown. Nothing to install: Word/RTF/ODT through macOS `textutil`, PDF through the browser tools' Chromium (plain-text `cupsfilter` without it), images through `sips`. PowerPoint cannot be written. |
| `/open [path \| number \| link]` (`/view`, `/docs`) | the document viewer; a link may be a Google Doc, Sheet or Slides file or a Drive file shared as "Anyone with the link" (shown from a fresh Word / Excel / PowerPoint export kept in `<home>/downloads`), or a URL to a PDF, Word, Excel … file. In the web chat (also on a phone through stitaP Control) it opens the file full screen: Markdown rendered (relative links and images work), HTML pages in a sandbox, PDFs, Word/Excel/PowerPoint/OpenDocument/RTF/CSV converted to Markdown, images, text and code; ☰ Files lists this chat's documents and the files next to the open one. Without a path: the documents this chat wrote or named (e.g. a design run's `report.md`). Paths in replies, 👁 View buttons on file tools and the 📄 button open it too, and the agent opens it with the `show_document` tool when asked to show a document. Never shown: `security.blocked_paths`, `.env` files, private keys, the state database, anything outside the home and temp folders. The terminal opens the desktop viewer instead. |
| `!<command>` | run a shell command yourself in the chat's folder (terminal and web chat); the output is shown and goes to the agent with your next message. |
| `#<note>` · `#user <fact>` | save a note to memory, or a fact about you to the user profile (also from messaging apps). New chats see it. |

**Working folder.** Every chat has one; the agent reads, writes and runs commands there. Pick it with **📁** in the web
chat's top bar (browse, create, recent folders) or `/cwd <path>`; set the folder new chats start in with
`agent.default_cwd` (⚙ Settings ▸ General, or "make this the default" in the picker). Scheduled tasks inherit the
folder they were scheduled from.

**Settings and agents (web chat ⚙).** *Agents*: named setups (instructions added to the system prompt, tool profile or
exact tools, optional own model, step budget) stored under `agents:` in `config.yaml`; start a chat with one from the
picker next to *New chat*, switch with `/agent <name>`, or let the main agent delegate to one
(`delegate_task agent=<name>`). *Tools*: every tool with a state — Auto (by profile), Always on, On demand
(`tool_search` only), Off — plus each group's options (terminal backend, browser, web search, files, memory, …).
*General*: model, context, output limit, approvals, compaction, budgets, scheduling. Left sidebar: chats, **Skills**
(browse, use, add skill folders such as `~/.claude/skills`) and **MCP** (status, add, reconnect, remove).

**Official documentation lookup.** `docs_lookup` searches only official documentation sites (MDN, python.org,
nodejs.org, react.dev, Apple, Microsoft, … — extend with `web.docs_domains`) and returns cited excerpts. The user is
asked first (*Allow for this chat / Allow once / Don't allow*); unattended runs never browse unless
`web.docs_lookup: always`.

**Browser.** The `browser_*` tools drive Safari on macOS (via `safaridriver`; enable *Allow Remote Automation* once) or
an installed Chromium browser (Chrome, Edge, Brave, …) through Playwright; pick and test it in ⚙ Settings ▸ Tools ▸ browser.

### Keep working until done

| | |
|---|---|
| `/goal <done looks like…>` | after every turn a judge model checks for evidence of completion; if not done, the agent continues automatically (up to `goals.max_turns`, default 20; a goal pauses if the agent keeps repeating itself). `/goal draft <text>` writes acceptance criteria first. `/goal pause|resume|clear|status`. |
| `/loop [every 10m] <prompt> [--times N] [--until <condition>]` | re-run a prompt on an interval or back-to-back until `LOOP_COMPLETE`, N runs, or the condition is judged true. |
| `/heartbeat every 30m <prompt>` | idle-only periodic check-in on this session; silent when nothing changed. |
| `harness -q "…" --goal true` | one-shot in goal mode (CI / scripts). |
| Background processes | `terminal(background=true)` + `process_manage`; the agent is notified when they exit. |
| `/pipeline start <docs or glob> [--from N] [--to N]` | work through many spec/requirement documents **one after another, continuously**: each runs as a goal in its own fresh chat in the current folder; if a document has a `**Test:** \`cmd\`` line (or `--check "cmd {name}"` is given) the pipeline runs it itself — pass = done, fail = retry with the output, then **stuck**; stuck documents are skipped and retried once at the end; the chat's plan shows every document with its own steps; one report arrives at the end. `/pipeline status \| list \| pause \| resume \| skip \| retry \| stop \| report` work **from any chat** (they find the running pipeline); the chat that started it is titled *Pipeline: first → last* and keeps a one-line note per document. The agent can start one itself (`pipeline_manage`) when asked in plain words. Survives restarts. Options: `--turns` (goal turns per doc, 500), `--timeout` (minutes per doc, 90), `--attempts` (2). |
| `/schedule <when> \| <task>` | run a long task later as a goal in its own chat (in the current working folder), reporting back to this chat. `when`: `now`, `in 2h`, `at 23:30`, `tonight at 11`, `tomorrow at 9`, or a repeating phrase (`daily at 9:00`). `/schedule list`. |

**Pipeline safeguards** (so a later document cannot quietly undo an earlier one):

- *Regression gate* — before a document starts, the pipeline notes which earlier documents' tests pass; a document is
  done only when its own test passes **and** those still pass (each earlier test gets 3 minutes).
- *Visual gate* — for a static site, every page is opened in headless Chromium before and after; a document whose
  tests pass but leaves a page that used to render (or a page it added) empty, erroring or missing files goes back with
  the page problems listed.
- *No wiping files* — `write_file` refuses to replace more than half of an existing file of 20+ lines (unattended runs
  can't override it; elsewhere `replace_whole=true` after being told); in pipeline runs a `terminal`/`execute_code`
  script that cuts a project file by more than half or deletes it gets that file put back, and the agent is told to use
  `patch`. Provided tests can be locked with a `.stitap-protected` file (e.g. `tests/**`).
- *Recovery tools* — `file_history` shows and restores earlier versions of a file from the automatic checkpoints;
  `run_tests` returns only counts and failing assertions; a failed `patch` shows the closest matching lines.
- *Code stays readable* — secret redaction in tool output hides only real secret formats (API keys, private keys,
  values from `.env`), not ordinary code such as `token = header.slice(7)`, and the file tools refuse to write the
  `[REDACTED]` placeholder back into code.

**Plans.** `todo_list` holds up to 500 items, optionally grouped by `phase`; the agent adds items (`action=add`) and
changes their status (`action=update`) without resending the list, and big plans are shown compactly (progress per
phase, current item, next items). `/goal` continuations name the next plan items, and the judge does not accept a goal
while plan items are still pending.

**Autocompact.** When a chat reaches `compression.threshold` of the context window (default 0.6, ⚙ Settings ▸
General), older turns are summarised and recent ones kept verbatim — or run `/compact [focus]`. The summary call
is sized to the window, leads with the latest request and marks finished work as done, and is followed by a block
taken straight from state: plan progress, active goal, files touched and the working folder. The right sidebar shows
context used and where compaction will trigger.

**Small-model guards.** Besides JSON/tool-name repair: a reply cut off by the output limit is never executed (the model
is told to split the work; `write_file append=true` builds big files in parts), invalid tool-call arguments in history
are sent as valid placeholders, repeated replies or tool-call cycles are warned once and then stopped, a new request
answered with an old reply is retried once, duplicate long replies are collapsed in what the model sees, and the
output limit follows the room left in the context (`model.max_output_tokens: 0` = auto).

### Testing, capture and documents

| Tool | What it does |
|---|---|
| `webtest` | Playwright: `install` browsers · `init` a Playwright Test project (config with screenshots on, video/trace on failure, JSON + HTML reports, page-object base) · `scenario` runs steps (goto/click/fill/select/check/hover/press/wait/expect_text/expect_visible/expect_url/expect_title/screenshot) now, saving a screenshot per step, `video.webm`, `trace.zip`, `report.md` and a generated `tests/<name>.spec.ts` · `run` an existing suite and summarise failures with their attachments · `report` |
| `screen_capture` | screenshot of the screen, a region, a window (by app or title) or a display, with delay/cursor — macOS `screencapture`, Windows PowerShell, Linux grim/scrot/ImageMagick/ffmpeg |
| `screen_record` | screen video: `start` (timed or until `stop`), `stop`, `status` — macOS `screencapture -v` or ffmpeg; asks for approval |
| `camera_capture` | photo or short video from a camera (`device=list` lists them) — needs ffmpeg; asks for approval every time |
| `run_tests` | runs a test command (default `npm test`) and returns `PASS/FAIL: n/m passed` plus each failing test's name, location and assertion — stack traces removed, full output saved to a file |
| `page_check` | opens every HTML page of a site in headless Chromium and lists broken ones: script errors, missing CSS/JS/image files, empty pages |
| `file_history` | earlier versions of a file (saved before every edit): `list` with line counts, `show`, `restore` |
| `office_to_markdown` | Word, Excel, PowerPoint and OpenDocument files (or a folder of them) → Markdown: headings, lists, tables, links, sheets, slides with notes; legacy `.doc`, `.xls`, `.ppt` and `.rtf` read natively (built-in MS-CFB/MS-DOC/MS-XLS/MS-PPT/RTF readers — nothing to install); the real type is detected from the contents |

Skills that walk the agent through whole jobs: `browser-e2e-testing` (a Playwright suite with page objects, evidence and CI),
`test-evidence-capture`, `desktop-ui-testing` (native apps with the `desktop` tool, window screenshots and a recording),
`visual-regression`, `api-and-form-testing`, `office-to-markdown`. Load one with `/<skill-name>` or let the agent pick it.

Requirements: macOS needs **Screen Recording** permission for the app that runs the agent (System Settings ▸ Privacy &
Security) — without it macOS returns images with every window hidden, so the capture tools stop with instructions
instead; video on Windows/Linux and all camera capture need ffmpeg; `webtest` needs Playwright browsers
(`webtest action=install`). Details per system: [install-local.md](install-local.md#optional-extras).

### Sites, CMS and finance

`site_template` creates ready-made websites from pinned open-source templates (e-commerce on Next.js + Payload or Nuxt,
Strapi CMS, a Fineract lending portal with WhatsApp updates, docs portals, dashboards, landing/SaaS sites, streaming,
IoT, EV chargers, remote desktop); `strapi_cms` adds content types and manages entries; `finance_calc` does loan maths
exactly. Catalog, licensing and examples: [site-templates.md](site-templates.md).

## 4. Automation

```bash
harness cron add "weekdays at 9:00" "Summarize open GitHub issues for repo X" --deliver telegram:<chat_id>
harness cron list | run <id> | pause <id> | resume <id> | rm <id>
# in a chat: /cron add "every 30m" check the build   (or: /cron add daily at 9:00 | summarise new issues)
harness kanban add "Port the parser" --goal "tests in tests/parser pass"   # cards can depend on each other
harness batch prompts.jsonl --out trajectories.jsonl --concurrency 4        # ShareGPT data for fine-tuning
```

The agent can also schedule jobs itself (`cronjob_manage`). Jobs run in fresh headless sessions
with `cron.approval_mode` (default `deny` for dangerous commands). Schedules accept cron syntax
or phrases: `every 30m`, `hourly`, `daily at 7:00`, `weekdays at 8:30`, `every monday at 10`.
`harness serve` runs the scheduler; without a daemon, call `harness cron tick` from Task
Scheduler / launchd / cron.

### Projects, working folders and boards

A **project** groups boards and named **working folders**; one folder is the main one (★). For example "PrakritTattva"
has folders `code` and `docs` and boards "v2" (archived) and "v3". The active project is the project of the active
board, and the workers serve the active board. A ticket runs in its own `cwd`, else in the project folder it names
(`folder: docs`), else in its board's folder, else in the project's main folder. A board created, imported or designed
into a folder that belongs to a project joins that project by itself.

```bash
# projects
harness kanban projects                                              # every project: boards, progress, folders
harness kanban project new PrakritTattva --path ~/x/PT-v3 [--folder code] [--desc ".."] [--board "PT v2"]
harness kanban project show|use|archive|unarchive PrakritTattva     # use opens its board (makes one if none)
harness kanban project update PrakritTattva [--to "New name"] [--desc ".."]
harness kanban project delete PrakritTattva [--with-boards] --yes    # boards are kept, unassigned, unless --with-boards
# working folders
harness kanban project folder add PrakritTattva docs ~/x/Idea_plan [--primary]
harness kanban project folder set PrakritTattva docs [--path <dir>] [--to <new name>] [--primary]
harness kanban project folder rm  PrakritTattva docs                 # refused while tickets still use it
harness kanban project attach "PT v2" PrakritTattva                  # put a board in a project ("" takes it out)
# boards
harness kanban boards | board show [name]
harness kanban board new "PT v3" [--in PrakritTattva] [--project <dir>] [--desc ".."]
harness kanban board update "PT v3" [--to <new name>] [--desc ..] [--project <dir>] [--in <project>]
harness kanban board use|archive|unarchive|save "PT v3"
harness kanban board clear|delete "PT v3" --yes                      # snapshot first; board restore <file> undoes it
# tickets
harness kanban add "Write the README" [--folder docs] [--type task|bug|epic] [--parent MF001]
harness kanban show US0011 | update US0011 [--title ..] [--goal ..] [--status ready] [--folder code] | rm US0011 --yes
```

Archiving a project archives its boards; unarchiving brings back only the boards it archived. Deleting a project,
removing a folder, or clearing or deleting a board never deletes files on disk. Board clears and deletes write a
snapshot to `<home>/kanban/snapshots/` first.

The same operations are kanban tool actions in chat (`projects`, `project_new|show|update|use|archive|unarchive|delete`,
`folder_add|update|remove`, `board_new|show|update|use|archive|clear|delete|restore`, `create|update|delete` for tickets).
The system prompt names the active project and its folders and tells the agent to use these actions instead of refusing.
HTTP: `GET/POST /api/kanban/projects`, `POST /api/kanban/boards` (`update` and the other actions), `POST /api/kanban/cards`,
and `PATCH/DELETE /api/kanban/card/:key`. Dashboard: the project picker beside the board picker, and in the board menu (⋯)
"Projects and folders…", "New ticket…" and "Board details…". "Delete ticket" is in the ticket's review block.

### Design document → kanban board

Numbering and review apply to every board, not only design boards. Epic first, then its stories: every main feature
(epic) is MF001, MF002 … and every story or bug must sit under one and is numbered after it (US0011, US0012 …, BG0011 …),
in `kanban import`, the chat tool, `/kanban add epic <title>` / `/kanban add MF001 <title>`, the CLI (`--parent MF001`) and
the dashboard. A story without a main feature is refused with the board's MF keys, so the model creates the epic first;
the old PT-12 keys and key prefixes are gone (existing PT tickets keep their keys). Stories are written as "As a <user>,
I want <goal> so that <benefit>" with Given/When/Then acceptance criteria. A chat cannot mark a ticket done when nothing can
check it (no test_cmd, no files, no commits); a worker or the user can. `kanban import` makes a draft
too (`kanban.import_draft: true`): its tickets wait in backlog until `kanban approve`. In chat, "plan / create a board
from these design documents" goes to `design` (research, checked stories, new board, new project folder), not `import`.

Give the agent any design (Markdown, text, HTML, PDF, Word/RTF/ODT, a web page, or a folder of them) and it plans the
build for you to review:

```bash
harness kanban design ~/specs/design.md --project ~/work/app [--board "App v1"] [--searches 12] [--stories 8] [--no-research] [--no-prior-art]
harness kanban approve "App v1" [US0101 US0102]   # after review: tickets → ready, board becomes active
harness kanban run                                 # or press "Run workers" in the UI
```

1. **Read**: the document is split by headings into parts that fit the model's context; each part's goals, components,
   requirements, constraints, technologies and open questions are noted. PDFs are read with `pdftotext` when installed,
   otherwise with macOS PDFKit; Word/RTF/ODT with the built-in office readers.
2. **Research**: the sources the design cites are read first; then the technologies and open questions become web
   searches (the configured `web.search_provider`, falling back to DuckDuckGo lite and Wikipedia when one is blocked).
   Official documentation is read before blogs, relevant PDFs are downloaded (kept in `sources/`) and read, and while
   the model says an answer is incomplete it searches again with new words (`research_rounds`, default 2). Every
   finding keeps its source URL.
3. **Prior art**: GitHub is searched for projects that already do the same thing. Only free-licensed (MIT, Apache,
   BSD, GPL …; repos without a license are never used), unarchived repos under `max_repo_mb` are shallow-cloned into
   `prior-art/`. Nothing in them is run (no hooks, no LFS, no install). The model judges each one: fork, library,
   reference or skip; copyleft licenses are flagged. The stories then build on the useful ones. `GITHUB_TOKEN` in
   `.env` raises GitHub's search limit.
4. **Plan**: epics in build order, then 2–8 one-day stories per epic in a fixed card shape (context capsule, steps,
   how to check it works, test cases, how to undo, references).
5. **Check**: every story is checked by rules (at least 2 steps, acceptance a tester can verify, enough test cases, a
   check command whose tool is installed and that is not destructive, relative file paths, one-day size), every
   reference link is opened (dead ones are dropped), and the model reviews each epic like a tech lead. Failing stories
   are rewritten once; requirements no story covers get new stories; whatever is still wrong is flagged on the ticket
   ("⚑ needs review", with a comment) for you to decide.
6. **Board**: a new board marked *draft*; every ticket waits in backlog, so no worker starts anything. Each epic is a
   main feature numbered across all boards (`MF010` = the 10th feature) and its stories follow it (`US0101`,
   `US0102` …; bugs `BG0101`). Prefixes and digits are set in `kanban.numbering`. In the UI (board menu → "New board
   from a design document…") open a ticket to read, edit, resolve its flags or approve it, or approve the whole board.
   Only approved tickets run, and the normal done checks apply (dependencies done, real content, committed under the
   key, check command passing).

Everything a run produced stays in `<project>/.stitap/design/<name>-<date>/`: `source.md` (the spec the tickets point
at; workers may not edit it), `outline.json`, `research.md`, `sources/` (PDFs), `prior-art/` and `prior-art.md`,
`plan.json` and `report.md`. In chat, the agent uses
`kanban action=design` / `design_status` / `approve`, and approves only when you ask. Settings: `kanban.design`
(`max_searches`, `max_cited`, `pages_per_question`, `pdfs_per_question`, `research_rounds`, `max_pdf_mb`, `prior_art`,
`max_repos`, `max_repo_mb`, `check_references`, `stories_per_epic`, `search_delay_ms`). Planning quality follows the
model: route it to the strong tier when the router is on.


**Reviewing stories from a phone (Kanban tab › ✅ Review stories, or `?kb=review`).** Every main feature with its
stories, newest draft board first. Tick a story to approve it (backlog → ready; untick to take it back while no worker
has started it); the feature's tick approves all its stories. Tap a story for its summary, details, acceptance criteria,
test cases, the checks the design run flagged, and its comments; write a comment (quick replies: "Looks good", "Split
this story" …) on a story or on a whole feature. Filters: to approve, ⚠ flagged, 💬 open comments, approved.
**💬 Apply my comments** starts a chat in which the agent rewrites the commented tickets and answers each comment
(nothing is approved or run); a comment counts as open until it has an answer. **▶ Run approved** makes the board the
active one and starts workers on the ticked stories only. Workers also see every comment in their prompt.

## 5. Integrations

**Messaging gateway** (`harness gateway`): Telegram (long polling), Discord (gateway
websocket), Slack (Socket Mode) — no public URL needed — plus inbound webhooks
(`POST /webhook/<name>`, payload treated as untrusted, restricted toolset). Unknown users get
a pairing code that the owner approves with `harness pairing approve <code>`; or list
`allowed_users`. Tokens go in `~/.stitap/.env`.

**MCP client** — add servers to `config.yaml`:

```yaml
mcp_servers:
  github: { command: npx, args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } }
  intranet: { url: https://mcp.example.com/mcp, headers: { Authorization: "Bearer ${INTRANET_TOKEN}" }, include: [search] }
```

Servers can also be added, reconnected and removed from the web chat's **MCP** tab (saved to `config.yaml`).

**MCP server** — `harness mcp serve` exposes the harness (files, web, memory, skills, the Tool
Store and a full `stitap_agent` task runner) to Claude Desktop, Cursor, VS Code, Hermes or any
MCP host.

**OpenAI-compatible API** — `POST /v1/chat/completions` (stream or not) on the daemon, for Open
WebUI / LibreChat / your own apps. Authenticate with the token in `~/.stitap/server.token` or
`STITAP_API_KEY`; send `X-Session-Id` for a persistent agent session.

**Python SDK** — `from stitap import Harness; Harness().run(sid, "task")`.

**Tool Store** — all 367 store tools (finance, analytics, databases, email/SMS/payments,
storage, maps, OCR, media, design, browser QA, sandboxes, e-commerce …) are reachable with
`tool_search` / `use_tool`. They use the agent's secrets and model automatically; the
credentials each integration needs are listed in [tool-store.md](tool-store.md).
Names used in `AGENTS.md` (`viking_query`, `memory_store`, `spend_verify`, `diagram_generate`, …) work as aliases of the
store tools that implement them — table in [tool-store.md](tool-store.md#names-used-in-agentsmd).

**Plugins** — `~/.stitap/plugins/<name>.mjs` exporting `register(ctx)`; `ctx.registerTool(...)`,
`ctx.on("pre_tool_call" | "post_tool_call" | "on_turn_end" | "on_session_start" | "on_message", fn)`.
A `pre_tool_call` handler returning a string blocks the call. Shell hooks: `hooks: { post_tool_call: ["cmd"] }`.

### Developer integrations (git, code search, language servers, router, benchmarks, MCP presets)

| Feature | What it gives the agent | Use it |
|---|---|---|
| `git` / `github` tools | Typed git (status, diff, log, add, commit, branch, stash, push…) and `gh` (PRs, issues, CI checks). Changes ask for approval; nothing is forced. `github` appears only when `gh` is installed. | automatic |
| `code_search` | Ranked, symbol-aware search of the working folder (BM25 over code chunks + definitions for TS/JS/Python/Go/Rust/Swift/Java/C/Ruby/shell/Markdown). No model, no dependencies, re-reads only changed files. Actions: `search`, `symbols`, `outline`, `refresh`. | automatic (also in the `slm` profile) |
| `lsp` | Diagnostics, go-to-definition, references, hover and outline from the project's language server, started on first use and stopped after 5 idle minutes. Built in: `typescript-language-server`, `pyright-langserver`, `gopls`, `rust-analyzer`, `clangd`, `sourcekit-lsp`. Add or override under `lsp.servers`. | install the server you need; the tool's error names the command |
| Tool planner | On a small context window the chat starts with a compact core (17 tools) instead of all 51 (~12K tokens). Per task, the model reads the task plus a one-line catalog of the other tools (~1K tokens), picks what it needs and up to 2 search queries (store/MCP tools); only those schemas are loaded, big ones abbreviated (`tool_search <exact name>` returns the full parameter docs), and a short suggested plan is appended to the request. Picks stay for the chat (max 10). | `agent.tool_selection: auto` (default: only when the full tool set would take >55% of the window) · `on` · `off`; a tool can set `summary` for its catalog line |
| Model router | The harness starts, restarts and stops `llama-server` itself and serves a fast model for simple turns and a strong one for hard turns (engineering keywords, code blocks, several files, long or failing turns, goals). Up-switches are immediate; down-switches wait `router.min_dwell` (600 s) and the end of the turn; a model is skipped if the conversation does not fit its context window or the GPU limit is too low. `/route` shows the loaded model and why, `/route fast\|strong\|auto` pins it. | `router.enabled: true` and `router.models.fast/strong` (`file`, `name`, `fit_margin_mb`, `min_wired_mb`), or run `start-router-chat.sh` |
| Benchmarks | Every model call and finished goal is folded into per-day aggregates by model × tool profile × prompt size: generation and prefill speed, cache hit rate, goals done vs paused. | `/bench [days]`, Settings → Benchmarks, `GET /api/bench` |
| MCP presets | One-line setup for `filesystem`, `fetch`, `sqlite`, `postgres`, `memory` MCP servers. | `harness mcp presets`, `harness mcp add sqlite ./app.db`, `POST /api/mcp {"preset": "filesystem"}` |

## 6. Security & enterprise controls

- **Approvals.** Dangerous commands (recursive deletes, sudo, `curl | sh`, force-push, disk/
  service/registry operations, publishing, destructive SQL — bash, PowerShell and cmd forms)
  require approval: once / this session / always (saved to `approvals.allow_patterns`).
  `approvals.mode: ask | deny | yolo`.
- **Tool Store approvals.** Store tools that send messages, take payments or refunds, change
  prices, write to databases, upload to cloud storage or run dangerous commands use the same
  approval flow (list in [tool-store.md](tool-store.md#approvals)).
- **Checkpoints.** Writes and mutating commands snapshot the working directory into a shadow
  git repo under `~/.stitap/checkpoints` (never your own `.git`). `/rollback`, `/diff`. Files over 10 MB, model
  weights, archives, media and databases are never snapshotted, nor is the harness's own home; a folder with more than
  1 GB of other files gets a per-file backup of the file being written instead.
- **Network.** The daemon binds to `127.0.0.1`, requires a per-install token, rejects foreign
  `Host` headers (DNS rebinding) and only allows CORS from `server.cors_origins`. Web tools
  refuse private-network addresses unless `web.allow_private: true`; `web.egress_allowlist`
  restricts domains.
- **Secrets** live only in `~/.stitap/.env` (0600). Logs and outbound messages are redacted broadly (including
  `password=…`/`token=…` assignments); tool output the model reads hides only unmistakable secrets (API-key formats,
  private keys, values from `.env`) so code stays intact, and file tools refuse to write a `[REDACTED]` placeholder
  into code. Generated projects (`site_template`, `strapi_cms setup`) get their `.env` set to 0600 too.
- **Paths.** `security.blocked_paths` (default `~/.ssh`, `~/.aws`, `~/.gnupg`) can't be read or written;
  `security.protected_paths` or a `.stitap-protected` file in a project (glob lines such as `tests/**`) can be read
  but never written by the agent — use it for provided tests and vendored code.
- **Write guards.** `write_file` won't replace more than half of an existing file of 20+ lines (unattended runs can't
  override; elsewhere the model must pass `replace_whole=true`); in pipeline runs a script that wipes or deletes a
  project file gets it restored.
- **Admin policy.** `/etc/stitap/policy.yaml`, `/Library/Application Support/stitap/policy.yaml`
  or `%ProgramData%\stitap\policy.yaml` (or `STITAP_POLICY_FILE`):

  ```yaml
  enforce:
    approvals.mode: ask
    web.allow_private: false
    web.egress_allowlist: [github.com, internal.example.com]
    terminal.backend: docker
  disable_tools: [execute_code, browser_eval]
  message: "Managed by IT — contact helpdesk for changes"
  ```

  Enforced keys cannot be changed by users (`harness config set` fails, `/yolo` is refused).
- **No telemetry.** Nothing leaves the machine except calls to the model server you configure
  and tools the agent uses.

## 7. Packaging

```bash
cd agent
npm run build           # TypeScript → dist/ (committed, so a plain `node bin/harness.mjs` works)
npm run build:store     # Tool Store → store/store.mjs (needs repo devDependencies)
npm run build:bundle    # dist-bundle/stitap.cjs — one file, store embedded (~1.4 MB)
npm run build:sea       # dist-sea/stitap[.exe] — Node single executable (~120 MB) + ui/ + skills/
cd ../python
python build_wheel.py                 # pure wheel (JS engine + lite core)
python build_wheel.py --with-binary   # platform wheel with the executable embedded
```

Sign the executable (Authenticode / `codesign` + notarization) and wrap it in your MSI/PKG/DEB
for Intune, Jamf or SCCM. Plugins and Playwright need the npm/Node install (the executable cannot
load external ES modules).

## 8. Architecture

```
clients: terminal chat · web chat (ui/ and /chat) · Telegram/Discord/Slack/webhooks · /v1 API · MCP · Python SDK
                                        │  events (SSE) + JSON API
Runtime ── sessions (FIFO queue, interrupt, steer) ── runTurn loop ── providers (native | ReAct | fallback)
   │                                                        └── tools (registry, approvals, checkpoints, write guards, redaction)
   ├── state.db (sessions, messages + FTS5, meta, usage, records)    ├── memory (MEMORY.md, USER.md)
   ├── autonomy (/goal judge, /loop, /heartbeat, curator)           ├── skills (SKILL.md)
   ├── cron scheduler · kanban workers · background processes       ├── MCP client · plugins/hooks · Tool Store bridge
   ├── pipelines (per-document goal chats, test + regression + visual gates)   └── site templates (catalog + packs)
```

Design rules borrowed from Hermes Agent: the system prompt and tool list are fixed for a
session's life (prompt-cache friendly; `--now` to rebuild); strict role alternation is preserved
through interrupts and errors; new capability prefers skills, plugins and MCP over new core tools.

## 9. Status vs. the Hermes parity plan

See [hermes-parity-plan.md](hermes-parity-plan.md) §8 for the per-item implementation status.
