---
name: codebase-onboarding
description: Quickly understand an unfamiliar repository: structure, stack, entry points, how to build/test/run. Use before changing code you haven't seen.
version: 1.0.0
---

# Codebase onboarding

1. `list_dir` depth 2 at the repo root. Read README, AGENTS.md/CLAUDE.md, and the manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`).
2. Identify: language/framework, entry points (main, server, CLI), test command, build command, lint command.
3. `search_files` for the feature area the user cares about; read the 2–3 central files.
4. Run the tests/build once to know the baseline (note pre-existing failures).
5. Save durable facts (build/test commands, conventions) with the `memory` tool so future sessions start faster.
6. Summarize for the user in ≤10 bullets: what it is, how it's laid out, how to run/test, risks.
