---
name: code-review
description: Review a diff or files for bugs, security issues, and maintainability; report prioritized findings. Use when asked to review code or a PR.
version: 1.0.0
---

# Code review

1. Get the diff: `git diff <base>...HEAD` or the files the user named.
2. For each change check: correctness (edge cases, nulls, off-by-one, error paths), security (injection, secrets, authz, path traversal, SSRF), concurrency, performance hot paths, API compatibility, tests covering the change.
3. Verify suspicions by reading surrounding code or running a quick test — don't report guesses as facts.
4. Report findings ordered by severity: **Blocker / Should fix / Nit**, each with file:line, the problem, a concrete fix.
5. End with what looks good and what wasn't reviewed.
