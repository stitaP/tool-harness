---
name: systematic-debugging
description: Find and fix the root cause of a bug methodically (reproduce, isolate, hypothesize, verify). Use when something fails, crashes, or behaves unexpectedly.
version: 1.0.0
---

# Systematic debugging

## When to use
A test fails, a command errors, output is wrong, or the user reports a bug.

## Steps
1. **Reproduce** — run the exact failing command/test with `terminal`. Save the error text. No reproduction → ask for exact steps or inputs.
2. **Read the error fully** — file, line, exception type. Open that code with `read_file` (use offset to jump to the line).
3. **Isolate** — `search_files` for the failing symbol; check recent changes (`git log -p -5 -- <file>`, `git diff`).
4. **Hypothesize** — write down 1–3 concrete causes in your todo list. Test the cheapest one first (add a print/log, run a tiny script, inspect values).
5. **Fix the cause, not the symptom** — smallest change with `patch`. Fix sibling call paths with the same bug.
6. **Verify** — re-run the original failing command AND the broader test suite. Paste the passing output in your answer.
7. **Prevent** — add a regression test if the project has tests.

## Pitfalls
- Don't change several things at once.
- Don't "fix" by catching and ignoring the exception.
- If the same attempt fails twice, step back and re-read the error/assumptions.
