---
name: browser-e2e-testing
description: Build and run a Playwright E2E suite (page objects, screenshots, video, CI) for a web app. Use when asked to test a website or set up Playwright.
version: 1.0.0
---

# Browser E2E testing with Playwright

## 1. Confirm scope (ask if unknown)
- App URL (e.g. `http://localhost:3000` or `https://staging.example.com`). For a local app, make sure it is running (`terminal`: `curl -sI <url>`).
- Test folder (default `./e2e`). Browsers (default `chromium`).
- Never test production with real accounts or payments unless the user says so.

## 2. Install and scaffold
1. `webtest action=install browsers=["chromium"]`
2. `webtest action=init dir="e2e" url="<url>" browsers=["chromium"] install_deps=true`
   Creates `playwright.config.ts` (screenshot on, video + trace retain-on-failure, json + html reporters), `tests/example.spec.ts`, `tests/pages/BasePage.ts`.
3. `webtest action=run dir="e2e"` once — the example must pass before you add tests.

## 3. Explore the app
- `browser_navigate url="<url>"` then `browser_snapshot` — note pages, nav links, forms, buttons ([ref] numbers).
- Optional: `use_tool name="store:browser.test-suggester" arguments={"url":"<url>","scope":"all","maxScenarios":20,"includeCode":true}` — gives scenarios + starter code.
- Prefer stable selectors: `getByRole`, `getByLabel`, `getByTestId`, then CSS. Avoid nth-child and generated class names.

## 4. Plan with phases
`todo_list action=write todos=[...]`, one item per scenario, grouped by `phase`:
- `Smoke` — home loads, title, no console errors
- `Critical paths` — login, search, checkout, main CRUD
- `Forms` — required, invalid, valid submit
- `Errors` — 404, server error message, empty states
- `Responsive` — mobile viewport `{"width":375,"height":812}`
- `Accessibility` — `use_tool name="store:standards.accessibility"` or axe (see `templates/home.spec.ts`)
Keep exactly one item `in_progress`.

## 5. Record each scenario
```
webtest action=scenario dir="e2e" url="<url>" name="login-valid" browser="chromium"
  video=true trace=true screenshot_each_step=true
  steps=[
    {"action":"goto","url":"/login"},
    {"action":"fill","selector":"#email","value":"user@example.com"},
    {"action":"fill","selector":"#password","value":"secret"},
    {"action":"click","selector":"button[type=submit]"},
    {"action":"expect_url","url":"/dashboard"},
    {"action":"expect_text","selector":"h1","text":"Welcome"}
  ]
```
Output: `e2e/test-results/<name>-<ts>/` (step-NN-*.png, .webm, trace.zip, report.md) and `e2e/tests/<name>.spec.ts` (pass `dir="e2e"` so both land in the suite). Mobile: add `viewport={"width":375,"height":812}`. Slow app: `step_timeout_ms=20000`.
If a step fails, open its screenshot with `vision_analyze image=<png> question="Why could step N fail?"`, fix the selector, re-run.

## 6. Refactor into page objects
1. `skill_view name=browser-e2e-testing file=templates/BasePage.ts` — compare with the scaffolded `tests/pages/BasePage.ts`; keep one.
2. `skill_view name=browser-e2e-testing file=templates/HomePage.ts` — one class per page: locators as fields, actions as methods.
3. `skill_view name=browser-e2e-testing file=templates/home.spec.ts` — specs call page methods; assertions stay in specs.
4. Move each generated `tests/<name>.spec.ts` into this style. Delete duplicates. Use `test.describe` per feature.

## 7. Run and triage
1. `webtest action=run dir="e2e"` (filter: `grep="login"`, project: `project="chromium"`).
2. For each failure read the summary, then the attached screenshot (`vision_analyze`) and error.
3. Classify: real bug (report it, do not "fix" the test) / bad selector / timing (use web-first `await expect(...)`, never `waitForTimeout`) / test data.
4. Debug deeper: `terminal`: `npx playwright show-trace test-results/artifacts/<test>/trace.zip` or `npx playwright show-report`.
5. `webtest action=report dir="e2e"` for the final summary.

## 8. CI
`skill_view name=browser-e2e-testing file=templates/playwright.yml` → write to `.github/workflows/playwright.yml` (adjust `working-directory`). It installs browsers with `npx playwright install --with-deps`, runs `npx playwright test`, uploads `test-results/` and `playwright-report/`.

## Pitfalls
- Hard sleeps make flaky tests. Use `await expect(locator).toBeVisible()`.
- Tests must be independent: no order dependence; create data in each test or in `beforeEach`.
- Set `baseURL` in config and use relative `page.goto('/path')`.
- Secrets: read from `process.env`, never commit passwords.
- Do not weaken assertions just to make a test green.

## Done when
- [ ] Every planned todo is completed or cancelled with a reason.
- [ ] `webtest action=run` passes **twice in a row** with no retries needed.
- [ ] Evidence attached: report path, screenshots/videos for key flows (see skill `test-evidence-capture`).
- [ ] Final answer lists: test count, pass/fail, bugs found, how to run (`npx playwright test`).
