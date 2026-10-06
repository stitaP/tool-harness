# Evidence: <scenario or suite name>

- Run: <YYYY-MM-DD HH:MM> · Tester: agent · Environment: <URL / app + version> · OS/Browser: <macOS 15 / chromium>
- Result: **<PASS | FAIL>** — <n> steps, <n> passed, <n> failed
- Video: [flow.webm](flow.webm) · Trace: [trace.zip](trace.zip) (`npx playwright show-trace trace.zip`) · Report: [report.md](report.md)

## Steps

| # | Action | Expected | Actual | Result | Evidence |
|---|--------|----------|--------|--------|----------|
| 01 | Open /login | Login form visible | Form visible | PASS | [before](login-01-before.png) · [after](login-01-after.png) |
| 02 | Submit empty form | "Email is required" | Message shown | PASS | [after](login-02-after.png) |
| 03 | Submit valid credentials | Dashboard heading | 500 error page | FAIL | [after](login-03-after.png) · [error](login-03-error.png) |

## Failures

### Step 03 — <short title>
- Error text: `<copied error / assertion message>`
- Screenshot: ![step 03 error](login-03-error.png)
- Likely cause: <bug in app | selector | timing | data>
- Repro: <minimal steps>

## Notes
- <anything unusual: flaky retries, environment issues, masked regions>
