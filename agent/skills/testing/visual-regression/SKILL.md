---
name: visual-regression
description: Compare baseline vs current screenshots (store visual-regression or toHaveScreenshot) with masks and thresholds. Use for visual/pixel regression checks.
version: 1.0.0
---

# Visual regression

## 1. Decide what to compare
- List pages/states (e.g. `home`, `login-error`, `cart-3-items`) and viewports (`1280x800`, `375x812`).
- One baseline name per page+state+viewport: `<page>-<state>-<width>` → `home-default-1280`.
- Freeze dynamic content first: test data fixed, animations off, same browser + OS + fonts as the baseline.

## 2. Capture baselines (from a known-good build)
Store under `visual-baselines/` in the repo (commit them).
- Web, quick: `use_tool name="store:browser.visual-regression" arguments={"currentUrl":"<url>","baselineName":"home-default-1280","viewportWidth":1280,"viewportHeight":800,"fullPage":true}`
  First call saves the baseline and returns `baselineCreated: true` and `baselineFile`. Copy that file to `visual-baselines/home-default-1280.png` (`terminal`: `cp <baselineFile> visual-baselines/`).
- Web, multi-step state: `webtest action=scenario ... screenshot_each_step=true` → copy the step PNG you need to `visual-baselines/<name>.png`.
- Native app: `screen_capture target=window window="<App>" path="visual-baselines/<name>.png"`.

## 3. Compare
- Same URL later: `use_tool name="store:browser.visual-regression" arguments={"currentUrl":"<url>","baselineName":"home-default-1280","viewportWidth":1280,"viewportHeight":800,"fullPage":true,"tolerance":16,"threshold":0.1}`
- Two environments: `{"baselineUrl":"https://prod.example.com/","currentUrl":"https://staging.example.com/","baselineName":"home-prod-vs-staging"}`
- Result fields: `passed`, `diffPercent`, `diffPixels`, `sizeChanged`, `changedRegion` (bounding box), `diffImage` (PNG path).
- Always look at the diff: `vision_analyze image=<diffImage> question="Which UI elements changed?"`.
- Two image files (e.g. native app shots): with ImageMagick, `terminal`: `compare -metric AE -fuzz 5% visual-baselines/a.png current/a.png diff/a.png` (prints changed pixel count). Or pass `baselineB64`/`currentB64` to the store tool (only for small images).

## 4. Thresholds
- `tolerance` = per-pixel colour difference ignored (0–255). 10–20 absorbs anti-aliasing.
- `threshold` = allowed changed area. Start strict (`0.1`), raise only with a reason. See note in Pitfalls.
- `sizeChanged: true` always fails — page height or viewport differs; check layout first.

## 5. Mask dynamic regions
Dates, clocks, ads, avatars, carousels, maps, random recommendations.
- Store tool: `"ignoreRegions":"[{\"x\":0,\"y\":0,\"w\":1280,\"h\":60}]"` (JSON string, image pixels; use `changedRegion` from a noisy run to find boxes).
- Playwright: `mask: [page.getByTestId('clock'), page.locator('.ad')]` (see template).
- Better still: stub the data (fixed date, seeded content) so nothing needs masking.

## 6. Playwright-native alternative (recommended inside a test suite)
`skill_view name=visual-regression file=templates/visual.spec.ts`
- `await expect(page).toHaveScreenshot('home.png', { fullPage: true, mask: [...], maxDiffPixelRatio: 0.01 })`.
- First run fails and writes the baseline into `tests/<spec>.spec.ts-snapshots/`; run again to pass.
- Update deliberately: `npx playwright test tests/visual.spec.ts --update-snapshots` (only the changed tests: add `-g "home"`).
- Baselines are per browser + OS (file name includes e.g. `-chromium-darwin`). Generate CI baselines on CI (or in the Playwright Docker image), not on a laptop.

## 7. Updating baselines (deliberate only)
1. Confirm the change is intended (ticket, user confirmation, or design update).
2. Update only affected baselines: store tool with `"updateBaseline":true`, copy the new file to `visual-baselines/`; or `--update-snapshots -g "<test>"`.
3. Commit baselines separately with a message saying why they changed.
Never bulk-update to make a failing run green.

## Pitfalls
- Fonts/OS/GPU differences cause noise: compare like with like.
- Lazy images and web fonts: wait for them (`await page.waitForLoadState('networkidle')`, `document.fonts.ready`) before capturing.
- Scrollbars and cursors: Playwright hides the caret by default; use `cursor=false` with `screen_capture`.
- In this runtime the store tool's `threshold` is the **maximum changed area in percent** (default 0.1); older catalog text calls it "minimum similarity %". If results look inverted, check the returned `thresholdPercent`.
- The store tool also keeps its own baseline copy (the `baselineFile` path); `visual-baselines/` is the reviewed, committed copy.

## Done when
- [ ] Every page/state/viewport has a baseline in `visual-baselines/` (or `*-snapshots/`).
- [ ] Comparison run done; each failure has a diff image reviewed with vision_analyze.
- [ ] Each diff classified: bug (report) / intended (baseline updated with reason) / noise (masked or stabilised).
- [ ] Report lists baseline name, diffPercent, pass/fail, diff image path.
