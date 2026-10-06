---
name: api-and-form-testing
description: Test web forms and HTTP APIs with store form/api tools and Playwright's request fixture. Use for form validation, REST endpoints, or a page's API.
version: 1.0.0
---

# API and form testing

## 1. Scope
Ask for: page URL with the form, API base URL, auth method (cookie, bearer token in env var), and which environment is safe to write to. Never submit forms that send real emails, payments, or orders on production.

## 2. Quick form audit (store tool)
`use_tool name="store:browser.form-test" arguments={"url":"<page url>","formSelector":"#signup","testEmpty":true,"testInvalid":true,"testValid":false,"testEdgeCases":true}`
- Omit `formSelector` to test every form. Keep `testValid:false` on production (it submits).
- Read the per-field results: required enforced? email/phone/URL patterns? min/max length? error messages shown and clear?
- Screenshot problem fields: `browser_navigate url=<page url>` → `browser_screenshot path="test-results/forms/<field>-error.png"`.

## 3. Quick API audit (store tool)
`use_tool name="store:browser.api-test" arguments={"url":"<page url>","action":"all","duration":30,"checkCORS":true,"checkCaching":true}`
- `action`: `discover` (list endpoints the page calls), `benchmark` (latency), `validate` (status + payload), `all`.
- Note endpoints, status codes, p95 latency, CORS/caching findings. Use them to plan step 5.

## 4. Plan
`todo_list action=write` with phases `Forms` and `API`. Per form: empty submit, each invalid field, valid submit, edge cases (unicode, 1000 chars, leading spaces, script tags). Per endpoint: happy path, missing/invalid params (400/422), no auth (401/403), not found (404), schema of the body.

## 5. Make it repeatable in Playwright
Set up the suite first (skill `browser-e2e-testing`), then:
- Forms: `skill_view name=api-and-form-testing file=templates/form.spec.ts`
- API: `skill_view name=api-and-form-testing file=templates/api.spec.ts` — uses the `request` fixture (no browser needed, fast).
- Run: `webtest action=run dir="e2e" grep="api|form"`.

## 6. Report
Table per field / endpoint: case, expected, actual, PASS/FAIL, evidence (screenshot or response excerpt). Put latency numbers in their own table.

## Pitfalls
- Client-side validation can hide missing server-side validation: also POST invalid data directly with `request` and expect 4xx.
- Use unique test data (`test+${Date.now()}@example.com`) so reruns do not collide.
- Tokens go in env vars (`process.env.API_TOKEN`); never print them in reports.
- `toBeOK()` only checks 2xx; also assert the body.
- Clean up created records (DELETE in `afterEach`) when the API allows it.

## Done when
- [ ] Each form field has empty/invalid/valid results; each endpoint has success + error cases.
- [ ] Specs pass twice in a row via `webtest action=run`.
- [ ] Report lists defects with request/response excerpts or screenshots.
