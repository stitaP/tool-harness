import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setup, call } from "./helpers.mjs";

const sh = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" });

test("git tool: status, add, commit, diff, log, branch inside a repo; refuses outside one", async () => {
  const t = await setup("approvals:\n  mode: yolo\n");
  try {
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    const ctx = t.rt.toolContext(s.id, undefined, "yolo");
    const git = t.rt.tools.get("git");
    assert.match(await git.handler({ action: "status" }, ctx), /not inside a git repository/);
    sh(t.work, "init", "-q", "-b", "main");
    sh(t.work, "config", "user.email", "t@example.com"); sh(t.work, "config", "user.name", "T");
    writeFileSync(join(t.work, "a.txt"), "one\n");
    assert.match(await git.handler({ action: "status" }, ctx), /\?\? a\.txt/);
    assert.match(await git.handler({ action: "add", paths: ["a.txt"] }, ctx), /A {2}a\.txt/);
    assert.match(await git.handler({ action: "commit", message: "first" }, ctx), /first/);
    writeFileSync(join(t.work, "a.txt"), "two\n");
    assert.match(await git.handler({ action: "diff" }, ctx), /\+two/);
    assert.match(await git.handler({ action: "log" }, ctx), /first/);
    assert.match(await git.handler({ action: "branch", name: "feature/x" }, ctx), /feature\/x/);
    assert.match(await git.handler({ action: "branch" }, ctx), /\* feature\/x/);
    assert.match(await git.handler({ action: "restore_file", paths: ["a.txt"] }, ctx), /done|\(done\)/);
    assert.match(await git.handler({ action: "diff" }, ctx), /no changes/);
    assert.match(await git.handler({ action: "show", ref: "--output=x" }, ctx), /invalid ref/);
    assert.match(await git.handler({ action: "commit" }, ctx), /needs a message/);
  } finally { await t.close(); }
});

test("git tool: mutating actions need approval (denied in deny mode)", async () => {
  const t = await setup("approvals:\n  mode: deny\n");
  try {
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    sh(t.work, "init", "-q"); writeFileSync(join(t.work, "b.txt"), "x");
    const ctx = t.rt.toolContext(s.id, undefined, "deny");
    assert.match(await t.rt.tools.get("git").handler({ action: "add", all: true }, ctx), /declined/);
    assert.match(await t.rt.tools.get("git").handler({ action: "status" }, ctx), /\?\? b\.txt/);
  } finally { await t.close(); }
});
