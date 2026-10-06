# Tool Store — executors, credentials and safety

The Tool Store (`src/lib/store`) holds **367 tools**, and **every one of them has an executor**.
The agent reaches them through `tool_search` → `use_tool("store:<id>", {...})` without adding
them to its prompt. The web app uses the same executors through `getStore()`.

```
src/lib/store/
  tools/*-tools.ts          manifests (+ older executors that lived next to them)
  executors/
    util.ts                 execs(), coercion, persisted state, secret(), Node built-ins
    hooks.ts                callLlm() / setLlmCaller(), setAgentHost()
    legacy.ts               adapts the older tool functions (positional or object args, type coercion)
    analytics.ts            analytics.*, ml.*, fault.*, text.*, math.* calculus
    business.ts             fin.calc.*, microfinance ledger, chit funds, real estate
    integrations.ts         database, email, SMS, voice, payments, storage, maps, collab, hardware, os
    devtools.ts             diagram.*, viking.*, harness.*, codegen.*, server.*
    ai.ts                   huggingface.*, llm.*, ocr.indic.*, doc.*
    media.ts                video.*, media.*  (ffmpeg)
    runtime.ts              env.*, sandbox.*, agent.*
    ecommerce.ts            ecom.*  (local store or your backend)
    design.ts               design.*, typography.*
    browser.ts, browser-qa.ts   browser.*  (Playwright)
```

Run every tool: `npm --prefix agent run test:store` (scenario suites per domain, then every
remaining tool with arguments synthesised from its manifest; fails on any missing executor or
crash). Last run: 367/367 executors, 0 unexpected failures; the only errors are tools whose
service is unreachable or not configured on the test machine.

## What runs where

| Needs | Tools |
|---|---|
| Nothing (pure computation, works offline) | analytics, ml, math, fin, chit, re, diagram, viking, harness, codegen, typography, design (except PNG export), doc, payment.invoice, email.template, maps.geofence, collab, ecom (local mode), color-palette generate/tokens |
| Node agent runtime | os.*, env.*, sandbox.*, agent.*, database (SQLite built in), storage provider `local`, huggingface downloads, server.hardware-detect |
| A CLI on the machine | `psql` / `mysql` / `duckdb` / `mongosh` (other databases) · `ffmpeg` (video.*, media.*) · `tesseract` with language packs, or the tesseract.js package (ocr.*) · `espeak-ng` on Linux (speech; macOS/Windows use the built-in voices) · Docker/Podman (strongest sandbox isolation) · gcc/javac/rustc/python (codegen.validate uses them when present) |
| Playwright + Chromium | browser.*, design.export `png` (`npm i -g playwright && npx playwright install chromium`, or set `STITAP_CHROMIUM` to an installed Chrome/Edge) |
| A model | llm.call, llm.generateScript, browser.design-generate. Inside the agent the configured model is used automatically (vision tools use `vision_model` if set); several other tools (codegen.generate, doc.generateScript, ecom.auto_reply, ecom.optimize_listing, browser vision tools) use it when available and fall back to rules/DOM analysis otherwise, saying so in the result. |
| Network | maps (Nominatim/OSRM, or your own `NOMINATIM_URL` / `OSRM_URL`), huggingface.search/download, viking.webbuilder_audit on remote URLs |

Tools never return invented data. When something is missing they fail with the exact fix, e.g.
`ffmpeg is not installed — install it (macOS: brew install ffmpeg …)` or
`Resend is not configured: set RESEND_API_KEY (agent: harness secret set RESEND_API_KEY …)`.

## Credentials

Set with `harness secret set NAME value` (stored in `~/.stitap/.env`, never in config files).

| Area | Secrets |
|---|---|
| Email | `RESEND_API_KEY` · `SENDGRID_API_KEY` · `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` (`MAILGUN_REGION=eu`) · `POSTMARK_SERVER_TOKEN` · SES via `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` · SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` · default sender `EMAIL_FROM` |
| SMS / voice | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` · `VONAGE_API_KEY`, `VONAGE_API_SECRET` · `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` · SNS via AWS keys · `ELEVENLABS_API_KEY` · `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| WhatsApp | `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (otherwise a wa.me link is returned) |
| Payments | `STRIPE_SECRET_KEY` · `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` · `PADDLE_API_KEY` (`PADDLE_ENV=sandbox`) · `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_ID` |
| Storage | S3/R2/GCS: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_ENDPOINT` (`R2_ACCOUNT_ID` for R2) · Azure: `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_SAS` · local folder: `STITAP_STORAGE_DIR` |
| Databases | `DB_PASSWORD_<CONNECTION_ID>`, `PGPASSWORD`, `MYSQL_PWD` (passwords given to database.connect stay in memory only) |
| E-commerce | `ECOM_BASE_URL`, `ECOM_API_KEY` (remote backend) · `EASYPOST_API_KEY`, `ECOM_WAREHOUSE_ADDRESS` (labels/tracking) · options `ECOM_CURRENCY`, `ECOM_TAX_RATE`, `ECOM_REFUND_WINDOW_DAYS`, `ECOM_MIN_MARGIN`, `ECOM_MAX_PRICE_CHANGE`, `ECOM_SECURITY_EMAIL` |
| Models (outside the agent) | `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` (+`OPENAI_BASE_URL`) · `OPENROUTER_API_KEY` · `OLLAMA_HOST` · Hugging Face `HF_TOKEN` |
| Paths / binaries | `STITAP_DATA_DIR` (tool state, default `~/.stitap/store-data`), `STITAP_MODELS_DIR`, `FFMPEG_PATH`, `FFPROBE_PATH`, `STITAP_CHROMIUM`, `STITAP_FONT`, `TESSDATA_URL` |

## Approvals

Side-effecting store calls go through the same approval flow as the terminal
(`approvals.mode: ask | deny | yolo`, admin policy can enforce it):

- sending email, SMS, WhatsApp messages or placing calls
- creating checkouts or creating/updating/cancelling subscriptions
- refunds, order cancellations, price changes, bulk ticket replies
- database writes (`INSERT/UPDATE/DELETE/DROP/ALTER…`) and non-dry-run migrations
- uploads/shares to cloud storage, deleting downloaded models
- `os.execute` / `agent.terminal` / `env.run` with dangerous commands, sleeping/locking the computer, writes to shell profiles or credential files

Read-only and local-only calls (queries, reports, invoices, local storage, diagrams, audits) run
without prompts. Sandboxes report the isolation they actually achieved — `docker`/`podman`
container, or a process with Node's permission model, a network guard, Linux network namespace
or macOS `sandbox-exec` — in every `sandbox.exec` result.

## State

Stateful tools (ledgers, e-commerce store, canvases, Viking projects, harness rails, env and
sandbox records, contexts) keep JSON under `STITAP_DATA_DIR`; outputs (exports, screenshots,
media, models, diagrams) are written there too and returned as file paths.

## Names used in AGENTS.md

`AGENTS.md` (the CAR-framework guidelines) refers to capabilities by short names. They are aliases: `use_tool` accepts
them and `tool_search` lists the matching store tool first.

| Name in AGENTS.md | Store tool |
|---|---|
| `browser_use` | `browser.navigate` (the agent's own `browser_*` tools cover full automation) |
| `dom_inspect` | `browser.extract` |
| `screenshot` | `browser.screenshot` |
| `network_intercept` | `browser.network` |
| `viking_store`, `viking_index` | `viking.index_resource` (create a project first with `viking.create_project`) |
| `viking_query` | `viking.query` (`viking.build_context` for an SLM-sized context block) |
| `agent_memory`, `memory_store`, `memory_query`, `memory_decay` | `agent.memory` (`action`: add, query, remove, stats, summarise, to-prompt) |
| `webbuilder_audit` | `viking.webbuilder_audit` |
| `standards_check` | `standards.audit` (also `standards.accessibility`, `standards.security`, `standards.quality`) |
| `performance_measure` | `browser.performance` |
| `knowledge_base` | `knowledge.search` |
| `harness_check` | `harness.action_check` |
| `spend_verify` | `harness.spend_check` |
| `gate_evaluate` | `harness.gate_evaluate` |
| `diagram_design`, `diagram_generate` | one of `diagram.architecture`, `diagram.user_journey`, `diagram.component_tree`, `diagram.data_flow`, `diagram.er_diagram`, `diagram.route_map`, `diagram.state_machine` (calling the generic name lists them) |

`diagram_render` and `diagram_export` have no separate tool: the diagram tools return Mermaid source, which renders
in Markdown viewers and can be saved with `write_file`.

