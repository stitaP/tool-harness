# Testing & QA

How to run every suite, what each one covers, and what it needs.

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
