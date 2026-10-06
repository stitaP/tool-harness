---
name: test-evidence-capture
description: Capture consistent test evidence (named screenshots, video, traces, recordings) plus an index. Use when a test run or bug report needs proof.
version: 1.0.0
---

# Test evidence capture

## 1. Naming and folders
- File name: `<scenario>-<step>-<state>.png` — lowercase, dashes, step as 2 digits.
  Examples: `login-valid-03-before.png`, `login-valid-03-after.png`, `checkout-07-error.png`.
- States: `before`, `after`, `error`, `final`, `expected`, `actual`.
- Folder per run: `test-results/<scenario>-<YYYYMMDD-HHMM>/`. Native-app runs: same pattern.
- Playwright empties its `outputDir` at the start of every `npx playwright test` / `webtest action=run`. Suites made by `webtest init` use `test-results/artifacts/` (scenario folders are safe); other projects default to all of `test-results/`. To keep evidence, copy it to `evidence/<run>/` (`terminal`: `cp -R test-results/<dir> evidence/`).

## 2. Pick the right capture
| Need | Tool |
|---|---|
| Web flow, step by step | `webtest action=scenario ... screenshot_each_step=true video=true trace=true` |
| One web page now | `browser_screenshot full_page=true path="test-results/<run>/<name>.png"` |
| One element | Playwright: `await page.getByTestId('cart').screenshot({ path })` |
| Native window | `screen_capture target=window window="<App name>" path="<file>.png"` |
| Part of screen | `screen_capture target=region x=0 y=0 width=800 height=600 path=...` |
| Whole flow as video | `screen_record action=start` → steps → `screen_record action=stop` |
| Debug a failure | Playwright trace: `npx playwright show-trace <trace.zip>` |
| Physical device / camera | `camera_capture` — only if the user explicitly asks |

## 3. Procedure for each step
1. Screenshot **before** the action (`-before`).
2. Do the action.
3. Wait for the result (text/selector appears — not a fixed sleep; `browser_wait text="..."` or `delay=1` on `screen_capture`).
4. Screenshot **after** (`-after`). On failure also save `-error` and the error text.
5. Check the image: `vision_analyze image=<png> question="Is <expected thing> visible? Quote any error text."`

Full-page vs element: full page for layout and context; element shot for a specific widget (smaller, stable for comparison). Use `full_page=true` on long pages.

## 4. Video and screen recording
- Playwright video: `video=true` on `webtest scenario` (or `video: 'retain-on-failure'` in config) → `.webm` in the run folder.
- Whole-desktop flow: `screen_record action=start path="test-results/<run>/flow.mp4" fps=15` (optional `region`). The user must approve. Without `duration` it records in the background: run the steps, then `screen_record action=stop`. With `duration` (seconds) it stops by itself — only for short, fixed-length clips. `screen_record action=status` shows whether it is running.
- Keep recordings short (one flow each). No audio unless asked (`audio` off).

## 5. Privacy
- Do not capture passwords, tokens, personal data. Close unrelated windows before `screen_capture target=screen` or `screen_record`.
- Prefer `target=window` over full screen.
- Camera: never without an explicit request; say what will be recorded and for how long.

## 6. Evidence index
Write `test-results/<run>/EVIDENCE.md` (or `evidence/<run>/EVIDENCE.md`):
`skill_view name=test-evidence-capture file=templates/EVIDENCE.md` and fill it in. Use relative links so the folder can be zipped and shared.

## Pitfalls
- Screenshot taken before the page settled → blank or spinner. Wait for a visible element first.
- Same file name reused → evidence overwritten. Always include step number and state.
- Huge full-screen PNGs from multi-monitor setups: use `target=window` or `display=1`.
- Videos are only kept on failure with `retain-on-failure`; use `video=true` when you need proof of a pass.

## Done when
- [ ] Every step has before/after (and error) images with the naming pattern.
- [ ] Videos/traces exist for each flow that needed them and paths are valid.
- [ ] `EVIDENCE.md` lists every file with step, expected, actual, pass/fail.
- [ ] Evidence copied out of `test-results/` if more test runs follow.
