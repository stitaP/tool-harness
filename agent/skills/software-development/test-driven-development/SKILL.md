---
name: test-driven-development
description: Implement a feature or fix with tests first (red → green → refactor). Use when adding behavior to a codebase that has or should have tests.
version: 1.0.0
---

# Test-driven development

1. Find the test setup: look for `pytest.ini`, `pyproject.toml`, `package.json` scripts, `tests/`, `*_test.go`. Run the existing suite once to get a baseline.
2. Write a failing test that describes the desired behavior (one behavior per test). Run it and confirm it fails for the right reason.
3. Implement the minimum code to pass. Run the single test, then the full suite.
4. Refactor with tests green. Keep diffs small.
5. Report: tests added, command used, pass counts.

Commands: `pytest -q path::test`, `npm test -- -t "name"`, `go test ./... -run Name`, `cargo test name`.
