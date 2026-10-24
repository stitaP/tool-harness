import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { setup, dist } from "./helpers.mjs";

test("projects: each board works in its own folder; clear and archive touch one board only", async () => {
  const t = await setup("kanban:\n  enforce_commit_keys: false\n");
  try {
    const K = t.rt.kanban, B = K.boards;
    const pa = join(t.work, "alpha"), pb = join(t.work, "beta"); mkdirSync(pa); mkdirSync(pb);
    const a = B.create("Alpha", undefined, pa); B.use(a.id);
    const ca = K.create({ title: "alpha task" });
    const b = B.create("Beta", undefined, pb); B.use(b.id);
    const cb = K.create({ title: "beta task" });
    const own = K.create({ title: "own folder", cwd: t.work });
    assert.equal(K.cwdOf(K.get(ca.key)), pa);
    assert.equal(K.cwdOf(K.get(cb.key)), pb);
    assert.equal(K.cwdOf(K.get(own.key)), t.work);   // a ticket's own cwd wins
    assert.match(K.describeBoards(), /Alpha .*project .*alpha/);
    assert.equal(B.setProject("Alpha", "").project, undefined);
    B.setProject("Alpha", pa);

    const tool = (await import(dist("kanban/board.js"))).kanbanTool;
    const ctx = { rt: t.rt, signal: new AbortController().signal };
    assert.match(await tool.handler({ action: "board_clear", board: "Beta" }, ctx), /confirm=true/);
    assert.match(await tool.handler({ action: "board_clear", board: "Beta", confirm: true }, ctx), /Removed 2 ticket/);
    assert.equal(K.get(ca.key).title, "alpha task");   // the other project is untouched
    assert.match(await tool.handler({ action: "board_archive", board: "Alpha" }, ctx), /Archived "Alpha"/);
    assert.match(await tool.handler({ action: "board_project", board: "Beta", project: pa }, ctx), /now works in/);

    const { buildSystemPrompt } = await import(dist("prompt/builder.js"));
    assert.match(buildSystemPrompt(t.rt, { cwd: t.work, source: "cli" }), /## Projects and boards[\s\S]*board_clear/);
  } finally { await t.close(); }
});

test("projects: folders, boards, ticket folders, archive and delete", async () => {
  const t = await setup("kanban:\n  enforce_commit_keys: false\n");
  try {
    const K = t.rt.kanban, P = K.projects, B = K.boards;
    const code = join(t.work, "pt-v3"), docs = join(t.work, "idea"), old = join(t.work, "pt-v2");
    for (const d of [code, docs, old]) mkdirSync(d);
    const old1 = B.create("PT v2", undefined, old);
    const p = P.create("PrakritTattva", { description: "shop", folders: [{ name: "code", path: code }, { name: "old", path: old }], boards: ["PT v2"] });
    assert.equal(p.folders.find((f) => f.primary).name, "code");
    assert.throws(() => P.create("prakrittattva"), /already exists/);
    assert.throws(() => P.addFolder(p.id, { name: "code", path: docs }), /already has a folder/);
    P.addFolder(p.id, { name: "docs", path: docs });

    // a new board inside a project folder joins it by itself; using the project opens one of its boards
    const v3 = B.create("PT v3", "third try", code);
    assert.equal(B.get("PT v3").project_id, p.id);
    const used = P.use("PrakritTattva");
    assert.equal(P.active().id, p.id);
    assert.ok([old1.id, v3.id].includes(used.board.id));
    B.use(v3.id);

    // where tickets run: own cwd > project folder > board folder > project main folder
    const a = K.create({ title: "write docs", folder: "docs" });
    const b = K.create({ title: "code" });
    assert.equal(K.cwdOf(K.get(a.key)), docs);
    assert.equal(K.cwdOf(K.get(b.key)), code);
    assert.throws(() => K.create({ title: "x", folder: "nope" }), /no folder named nope/);
    B.setProject(v3.id, ""); assert.equal(K.cwdOf(K.get(b.key)), code);   // falls back to the project's main folder
    P.updateFolder(p.id, "docs", { primary: true }); assert.equal(K.cwdOf(K.get(b.key)), docs);

    // folders: rename carries the tickets along; removing one in use is refused
    P.updateFolder(p.id, "docs", { new_name: "spec" });
    assert.equal(K.get(a.key).folder, "spec");
    assert.throws(() => P.removeFolder(p.id, "spec"), /work in spec/);
    P.removeFolder(p.id, "old");
    assert.deepEqual(P.need(p.id).folders.map((f) => f.name).sort(), ["code", "spec"]);

    // board CRUD
    const bu = B.update("PT v3", { name: "PT v3 board", description: "now" });
    assert.equal(bu.name, "PT v3 board"); assert.match(B.show(bu.id), /Project: PrakritTattva/);

    // archive takes the boards along; unarchive brings back only those
    B.archive(old1.id);
    P.archive(p.id);
    assert.ok(B.get(bu.id).archived);
    P.unarchive(p.id);
    assert.ok(!B.get(bu.id).archived); assert.ok(B.get(old1.id).archived);   // archived before: stays archived

    // delete keeps the boards unless asked
    const r = P.delete(p.id);
    assert.deepEqual(r.boards.sort(), ["PT v2", "PT v3 board"]);
    assert.equal(B.get(bu.id).project_id, undefined);
    assert.equal(K.get(a.key).title, "write docs");
    assert.match(P.describe(), /No projects yet|no project/);
  } finally { await t.close(); }
});

test("projects: kanban tool and HTTP CRUD", async () => {
  const t = await setup("kanban:\n  enforce_commit_keys: false\n");
  const { startServer } = await import(dist("index.js"));
  const srv = await startServer(t.rt, { port: 0 });
  try {
    const K = t.rt.kanban, dir = join(t.work, "app"); mkdirSync(dir);
    const tool = (await import(dist("kanban/board.js"))).kanbanTool, ctx = { rt: t.rt, signal: new AbortController().signal };
    const call = (a) => tool.handler(a, ctx);
    assert.match(await call({ action: "project_new", project_name: "App", folder_path: dir }), /Created project "App"/);
    assert.match(await call({ action: "project_use", project_name: "App" }), /Active project: "App"/);
    assert.match(await call({ action: "folder_add", folder: "api", folder_path: join(t.work, "api") }), /api=/);
    assert.match(await call({ action: "projects" }), /▶ App .*api=/);
    assert.match(await call({ action: "create", title: "endpoint", folder: "api" }), /Created/);
    const card = K.list().find((c) => c.title === "endpoint");
    assert.equal(card.folder, "api");
    assert.match(await call({ action: "board_update", description: "the app board" }), /Project: App/);
    assert.match(await call({ action: "delete", id: card.key }), /confirm=true/);
    assert.match(await call({ action: "delete", id: card.key, confirm: true }), /Deleted/);
    assert.equal(K.get(card.key), null);
    assert.match(await call({ action: "project_delete", project_name: "App" }), /confirm=true/);

    const H = { "content-type": "application/json", "x-stitap-token": srv.token };
    const post = async (path, body, method = "POST") => { const r = await fetch(`${srv.url}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json() }; };
    let r = await post("/api/kanban/projects", { action: "new", name: "Web", path: join(t.work, "web") });
    assert.equal(r.status, 200); assert.equal(r.j.board.project_id, r.j.project.id);
    r = await post("/api/kanban/cards", { title: "home page", body: "build it", acceptance: "loads\nhas title" });
    assert.equal(r.status, 200); assert.equal(r.j.card.status, "backlog"); assert.deepEqual(r.j.card.acceptance, ["loads", "has title"]);
    const key = r.j.card.key;
    r = await post("/api/kanban/projects", { action: "folder_add", project: "Web", folder: "assets", path: join(t.work, "assets") });
    assert.equal(r.status, 200);
    r = await post(`/api/kanban/card/${key}`, { folder: "assets" }, "PATCH"); assert.equal(r.status, 200);
    assert.equal(K.get(key).folder, "assets");
    const g = await (await fetch(`${srv.url}/api/kanban/projects`, { headers: H })).json();
    assert.deepEqual(g.projects.map((p) => p.name).sort(), ["App", "Web"]);
    const sum = await (await fetch(`${srv.url}/api/kanban/board`, { headers: H })).json();
    assert.ok(sum.board.project_id); assert.equal(sum.projects.length, 2);
    r = await post("/api/kanban/projects", { action: "delete", project: "Web", confirm: "nope" }); assert.equal(r.status, 400);
    r = await post(`/api/kanban/card/${key}`, null, "DELETE"); assert.equal(r.status, 200); assert.equal(K.get(key), null);
    r = await post("/api/kanban/projects", { action: "delete", project: "Web", confirm: "Web" }); assert.equal(r.status, 200);
  } finally { await srv.close(); await t.close(); }
});

test("defaults: import numbers main features MF001 / stories US0011 and makes a draft that waits for approval", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const t = await setup("kanban:\n  enforce_commit_keys: false\n");
  try {
    const K = t.rt.kanban;
    const plan = mkdtempSync(join(tmpdir(), "plan-")), proj = join(t.work, "shop");
    writeFileSync(join(plan, "phase-00.md"), "# Phase 00: Setup\n\n**Goal:** g.\n\n## 1. `a.js`\nx\n\n## 2. `b.js`\ny\n");
    writeFileSync(join(plan, "phase-01.md"), "# Phase 01: Cart\n\n**Goal:** g.\n\n## 1. `cart.js`\nz\n");
    const { importPlan } = await import(dist("kanban/plan.js"));
    const out = importPlan(K, { planDir: plan, projectDir: proj, board: "Shop" });
    assert.match(out, /DRAFT/);
    const all = K.list(), epics = all.filter((c) => c.type === "epic").map((c) => c.key).sort();
    assert.deepEqual(epics, ["MF001", "MF002"]);
    const kids = all.filter((c) => c.type !== "epic");
    assert.ok(kids.every((c) => /^US00[12]\d+$/.test(c.key)), kids.map((c) => c.key).join(" "));
    assert.ok(kids.every((c) => c.status === "backlog"));
    assert.equal(K.boards.active().draft, true);
    assert.deepEqual(K.ready(), []);                       // nothing can run before review
    const r = K.boards.approve("Shop");
    assert.equal(r.approved.length, kids.length);
    assert.ok(K.ready().length > 0);
    // a hand-made epic follows the same numbering; an explicit prefix keeps the old style
    assert.equal(K.create({ title: "Payments", type: "epic" }).key, "MF003");
    assert.equal(K.create({ title: "Legacy", type: "epic", key_prefix: "PT" }).key, "PT-1");
    const { buildSystemPrompt } = await import(dist("prompt/builder.js"));
    assert.match(buildSystemPrompt(t.rt, { cwd: t.work, source: "web" }), /kanban action=design with that path/);
  } finally { await t.close(); }
});
