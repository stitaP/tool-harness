# Testing & QA

How to run every suite, what each one covers, and what it needs.

## Agent runtime (`agent/`)

```bash
npm run agent:test          # build, then every agent suite against a scripted mock model (no real model needed)
npm run agent:test:store    # every Tool Store executor (367 tools), with expected-failure accounting
npm run agent:catalog       # regenerate docs/tool-catalog.md from the store after changing tools
```

`node:test` suites in `agent/test/` (about 190 tests; a few skip themselves when Playwright's Chromium is missing —
install it with `node agent/node_modules/playwright-core/cli.js install chromium`):

| File | Covers |
| --- | --- |
| `agent.test.mjs` | the agent loop end to end: tool calls, approvals, goals, loops, compaction, repeats and loop guards, pipelines (order, stuck/retry, regression gate, visual gate, stop from another chat), script-write guard, re-read short-circuit, `file_history`, `run_tests`, on-demand tools |
| `unit.test.mjs` | parsers and pure functions: YAML, cron, JSON repair, patch matching and closest-match hints, redaction (logs vs tool output), write guards, `@folder` tree, test-output summaries, site-template catalog integrity (pinned, permissive licenses, patches present), `finance_calc`, Strapi field shorthand |
| `surfaces.test.mjs` | HTTP API + SSE, chat archive/restore/delete, stats (sub-chats, cached tokens), OpenAI-compatible endpoint, MCP server ↔ client, gateway, CLI |
| `local-model.test.mjs` | llama.cpp specifics: long prefill timeouts, keep-alive, invalid tool-call recovery, server timings |
| `store.test.mjs` | the Tool Store bridge (`tool_search`, `use_tool`, aliases, approvals) |
| `desktop-browser.test.mjs`, `capture.test.mjs`, `webtest.test.mjs` | browser backends (Safari/Chromium), screen/camera capture, Playwright scenarios |
| `office*.test.mjs` | Word/Excel/PowerPoint/OpenDocument and legacy `.doc` `.xls` `.ppt` `.rtf` readers |

Run one file with `cd agent && node --test test/unit.test.mjs`. Tip: when running a *single test* with
`--test-name-pattern`, add `--test-reporter=tap` to see its result immediately.

## Web app suites

These scripts live in the hosted workspace's `scripts/` folder, which is not part of this repository snapshot
(see the README's repository notes); the commands below work where that folder is present.

## One-liner

```bash
bun run test        # capture + NLP + perf + convex suites (no browser)
bun run test:e2e    # Playwright browser tests (needs Chrome; see below)
```

The suites are dependency-free Bun scripts with a tiny check harness — no test
framework required. Each exits non-zero on failure.

## Suites

| Suite | Command | Covers |
| --- | --- | --- |
| Capture | `bun run scripts/capture-smoke.ts` | 425 pure-logic cases: capture engine, extension protocol, tiled planning, encrypted replay, hybrid SVG, OCR-at-capture, magnifier/grouping, `.vcap` round-trips, export slicing, ZIP writer, redirect re-validation, DTD guard, readiness strategies, library-input sanitizer |
| NLP | `bun run scripts/nlp-smoke.ts` | 108 cases: PII scan, embeddings, NER merge, OCR offsets, STR layout detection, step guides, alt text, registry, error catalogue, capability tiers, vision feedback, capture replay |
| Perf | `bun run scripts/perf-smoke.ts` | Timing + scale guards: 100k-px tile planning, 720k-px export slicing, big-SVG build + heap growth, STR line detection on a 3000×2000 image, 2000-doc embedding ranking |
| Convex | `bun run scripts/convex-smoke.ts` | **Live deployment**: unauthenticated read paths return `[]`, no-arg mutations throw `Unauthenticated`, arg-validated mutations reject garbage. Skips (exit 0) when no deployment is linked |
| Browser | `bun run scripts/browser-e2e.ts` | **Needs Playwright + Chromium**: landing CTA, guest sign-in, workspace, demo capture end-to-end, editor tabs, extension popup (env-gated). Skips when Playwright isn't installed |

## Convex function tests

`scripts/convex-smoke.ts` exercises the **deployed** functions through the CLI
(`convex run`), the same ones the platform pushes with `convex dev --once`:

- Read paths (`captures:list`, `captures:getCaptureEmbeddings`,
  `captures:searchByEmbedding`) must return `[]` for an unauthenticated caller.
  `searchByEmbedding` proves the auth gate runs *before* argument validation.
- No-arg mutations (`captures:getUploadUrl`, `captures:createExtensionUpload`)
  must throw `Unauthenticated`.
- Arg-validated mutations (`saveCapture`, `saveExtensionCapture`, `remove`,
  `setCaptureEmbedding`) must reject garbage arguments with
  `ArgumentValidationError`.

The mutations' storage sanitization (`sanitizeLibraryFields` in
`src/lib/capture/libraryInput.ts` — title/description/tag/url caps, width &
height clamps, non-finite coercion, blank-title default) is unit-tested
in-process in the capture suite (§5b), so it runs without a deployment.

**Not scriptable here:** ownership checks and storage cleanup (the `remove`
mutation deleting the storage file) need an authenticated CLI session — the
CLI can't fabricate Convex ids or an auth token. These are verified by code
review; if you have an authenticated dev environment, exercise them through
the app (create a capture, delete it in the library, confirm the storage file
is gone in the dashboard).

## Browser tests

The dev environment has no Chrome, so the spec is written for a machine that
does. Set up:

```bash
bun add -d playwright
bunx playwright install chromium
bun run dev                      # terminal 1
E2E_BASE_URL=http://localhost:5173 bun run test:e2e
```

Environment variables:

- `E2E_BASE_URL` — dev server URL (default `http://localhost:5173`).
- `E2E_SKIP_AUTH=1` — skip the signed-in sections (guest sign-in needs the
  deployment's Anonymous provider configured).
- `E2E_EXTENSION_PATH` — set to run the extension popup structural check
  (loads the built unpacked extension in Chromium).

The demo capture assertion waits up to 90s for `[data-stitap-editor] svg`.

## Performance tests

Bounds are deliberately generous (2–4 s) to catch accidental quadratic
blowups, not to benchmark. If a bound trips, check the operation's complexity
before tightening the bound — and if timings drift on faster/slower hardware,
recalibrate with the printed values.
