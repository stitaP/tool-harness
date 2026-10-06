---
name: desktop-ui-testing
description: Test a native desktop app with desktop actions, window screenshots, a recording, and a report. Use to QA a macOS/Windows/Linux app, not a web page.
version: 1.0.0
---

# Desktop UI testing

## 0. Permissions (check first)
- **macOS**: System Settings → Privacy & Security → enable **Accessibility** and **Screen Recording** for the app running the agent (Terminal, iTerm, VS Code, or `node`). Quit and reopen that app after granting. First use may also ask to allow control of "System Events" — allow it.
- **Windows**: no extra permission; run in a normal logged-in desktop session (not as a service or over a locked screen). Elevated (admin) apps can only be driven from an elevated terminal.
- **Linux**: X11 needs `xdotool`, `wmctrl`, `xclip`; Wayland needs `ydotool`, `grim`, `wl-copy`. `ui_tree` needs `python3` + `pyatspi` (package `python3-pyatspi`/`at-spi2-core`) and accessibility enabled.
- Quick check: `desktop action=screen_size` and `desktop action=ui_tree`. If ui_tree is empty or errors, fix permissions before continuing.

## 1. Plan
1. Ask: app name, version, what to test, test data. Note OS.
2. Write the plan with `todo_list action=write` (phase per feature). Each step = action + expected result.
3. Create the run folder: `test-results/<app>-<YYYYMMDD-HHMM>/`.

## 2. Start
1. `desktop action=open_app app="<App>"` (e.g. `TextEdit`, `Calculator`, `notepad`, `gnome-calculator`).
2. `desktop action=focus_app app="<App>"`.
3. `screen_record action=start path="test-results/<run>/run.mp4" fps=15` (user approves; optional `region` to limit to the app area).
4. `screen_capture target=window window="<App>" path="test-results/<run>/00-start.png"`.

## 3. Map controls
- `desktop action=ui_tree limit=200` → lines like `button 'Save' at (512,340)`. Coordinates are the control centre, in screen points.
- No useful tree (custom-drawn UI, games, some Electron apps)? Use `desktop action=screenshot` + `vision_analyze image=<png> question="List clickable controls with approximate x,y"`.
- Re-run `ui_tree` after every window change; coordinates go stale when windows move or resize.

## 4. Execute each step
1. Act:
   - `desktop action=click x=512 y=340` (also `double_click`, `right_click`, `move`, `drag` with `to_x,to_y`)
   - `desktop action=type text="hello"` · `desktop action=key keys="cmd+s"` (Windows/Linux: `ctrl+s`; `Enter`, `Tab`, `alt+F4`)
   - `desktop action=scroll direction=down amount=5`
   - `desktop action=clipboard_read` to verify copied text.
2. Capture: `screen_capture target=window window="<App>" delay=1 path="test-results/<run>/<NN>-<step>-after.png"`.
3. Verify (both if possible):
   - Text: `desktop action=ui_tree` — expected label/value present?
   - Visual: `vision_analyze image=<png> question="Does the window show <expected>? Quote any error dialog."`
4. Record expected vs actual and PASS/FAIL. Update the todo item.
5. On FAIL: capture an extra `-error.png`, note the error text, continue with independent steps; stop only if the app crashed.

## 5. Finish
1. `screen_record action=stop`.
2. Restore state: close test documents without saving (`key keys="cmd+w"` → choose "Don't Save"), or quit the app only if you started it.
3. Write `test-results/<run>/report.md`: `skill_view name=desktop-ui-testing file=templates/report-template.md`.

## Pitfalls
- Typing goes to whichever window is focused: `focus_app` before `type`/`key`.
- Retina/HiDPI: ui_tree and click use points, screenshots are in pixels (often 2×). Do not take click coordinates from screenshot pixels without dividing by the scale.
- Dialogs and sheets open asynchronously: wait (`delay`) then re-read `ui_tree`.
- Don't click system dialogs (passwords, permission prompts) on the user's behalf — ask.
- Every changing action needs approval unless allowed; batch your plan so the user knows what is coming.

## Done when
- [ ] Every planned step has expected, actual, PASS/FAIL and a screenshot link.
- [ ] `run.mp4` (or the path reported by screen_record) exists.
- [ ] `report.md` written; failures have repro steps and error text.
- [ ] App left in its original state.
