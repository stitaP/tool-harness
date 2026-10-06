# Desktop UI test report: <App> <version>

- Date: <YYYY-MM-DD HH:MM> · OS: <macOS 15.1 / Windows 11 / Ubuntu 24.04> · Screen: <WxH>
- Scope: <features tested>
- Result: **<PASS | FAIL>** — <n> steps, <n> passed, <n> failed, <n> blocked
- Recording: [run.mp4](run.mp4)

## Steps

| # | Step | Expected | Actual | Result | Screenshot |
|---|------|----------|--------|--------|------------|
| 01 | Open app | Main window shown | Main window shown | PASS | [01](01-open-after.png) |
| 02 | Type "hello" in editor | Text appears | Text appears | PASS | [02](02-type-after.png) |
| 03 | cmd+s | Save dialog opens | Nothing happened | FAIL | [03](03-save-after.png) · [error](03-save-error.png) |

## Defects

### D1 — <title> (severity: <critical|major|minor>)
- Steps to reproduce: 1. … 2. … 3. …
- Expected: …
- Actual: … (error text: `…`)
- Evidence: ![D1](03-save-error.png)

## Environment notes
- Permissions granted: <Accessibility, Screen Recording>
- Verification method per step: <ui_tree | vision_analyze | both>
- Blocked steps and why: …
