---
name: git-workflow
description: Safe git operations: branches, commits, diffs, rebasing, resolving conflicts, preparing a PR. Use for any version-control task.
version: 1.0.0
---

# Git workflow

- Inspect first: `git status`, `git branch -vv`, `git log --oneline -15`, `git diff --stat`.
- Never commit to main/master directly when asked to make changes — create a branch: `git switch -c <type>/<short-name>`.
- Commit messages: imperative subject ≤72 chars, body explains why.
- Before pushing: run tests; `git diff origin/main...HEAD --stat` to review scope.
- Conflicts: `git status` to list, open each file, resolve markers, `git add`, continue the rebase/merge. Re-run tests.
- Destructive ops (`reset --hard`, `push --force`, `clean -f`) require user approval — explain why first; prefer `--force-with-lease`.
- PR text: summary, motivation, testing done, risks.
