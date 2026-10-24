// The document viewer: /api/file (+ raw, sandboxed HTML pages), /api/docs, /open, the show_document tool, and the web UI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, dist, call } from "./helpers.mjs";

let chromium = null;
try { chromium = createRequire(import.meta.url)("playwright-core").chromium; if (!existsSync(chromium.executablePath())) chromium = null; } catch { chromium = null; }

const blocked = mkdtempSync(join(tmpdir(), "stitap-blocked-"));

async function server(t) {
  const { startServer } = await import(dist("server/http.js"));
  const srv = await startServer(t.rt, { port: 0 });
  const get = (p, auth = true) => fetch(`${srv.url}${p}`, { headers: auth ? { "x-stitap-token": srv.token } : {} });
  return { srv, get };
}

test("api/file: shows documents of the chat's folder, refuses secrets, blocked and outside paths", async () => {
  const t = await setup(`security:\n  blocked_paths: ["${blocked}"]\n`);
  const { srv, get } = await server(t);
  try {
    const s = t.rt.createSession({ source: "web", cwd: t.work });
    mkdirSync(join(t.work, "docs"));
    writeFileSync(join(t.work, "docs", "design.md"), "# Design\n\nSee [the notes](notes.txt).\n");
    writeFileSync(join(t.work, "docs", "notes.txt"), "plain notes");
    writeFileSync(join(t.work, ".env"), "API_KEY=secret");
    writeFileSync(join(blocked, "x.md"), "# no");
    const q = (p) => `/api/file?session=${s.id}&path=${encodeURIComponent(p)}`;

    assert.equal((await get(q("docs/design.md"), false)).status, 401, "token required");
    const r = await (await get(q("docs/design.md"))).json();
    assert.equal(r.kind, "markdown"); assert.match(r.content, /# Design/);
    assert.ok(r.path.endsWith("/docs/design.md") && r.folder.endsWith("/docs"));
    assert.deepEqual(r.siblings.map((x) => x.name), ["design.md", "notes.txt"]);
    const dir = await (await get(q("docs"))).json();
    assert.equal(dir.kind, "dir"); assert.equal(dir.entries.length, 2);
    assert.equal((await get(q("missing.md"))).status, 404);
    assert.equal((await get(q(".env"))).status, 403, ".env is never shown");
    assert.equal((await get(q(join(blocked, "x.md")))).status, 403, "security.blocked_paths");
    assert.equal((await get(q("/etc/hosts"))).status, 403, "outside home and temp");

    const raw = await get(`/api/file/raw?session=${s.id}&path=docs/notes.txt&download=1`);
    assert.equal(raw.status, 200); assert.equal(await raw.text(), "plain notes");
    assert.match(raw.headers.get("content-disposition"), /^attachment; filename="notes.txt"/);
  } finally { await srv.close(); await t.close(); }
});

test("api/file: an HTML page is served sandboxed under a per-folder key that reaches only its own folder", async () => {
  const t = await setup();
  const { srv, get } = await server(t);
  try {
    const s = t.rt.createSession({ source: "web", cwd: t.work });
    mkdirSync(join(t.work, "site"));
    writeFileSync(join(t.work, "site", "index.html"), `<link rel="stylesheet" href="style.css"><h1>Hi</h1>`);
    writeFileSync(join(t.work, "site", "style.css"), "h1{color:red}");
    writeFileSync(join(t.work, "secret.md"), "outside the page folder");
    const r = await (await get(`/api/file?session=${s.id}&path=site/index.html`)).json();
    assert.equal(r.kind, "html"); assert.match(r.site, /^api\/site\/[0-9a-f]{32}\/index\.html$/);
    const base = `${srv.url}/${r.site.replace(/index\.html$/, "")}`;
    const page = await fetch(base + "index.html");          // no token: the key is the permission
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /^sandbox allow-scripts/);
    assert.ok(!(await page.text()).includes(srv.token));
    const css = await fetch(base + "style.css");
    assert.equal(await css.text(), "h1{color:red}"); assert.match(css.headers.get("content-type"), /text\/css/);
    assert.equal((await fetch(base + "..%2Fsecret.md")).status, 403);
    assert.equal((await fetch(`${srv.url}/api/site/${"0".repeat(32)}/index.html`)).status, 404);
  } finally { await srv.close(); await t.close(); }
});

test("api/docs and /open: files the agent wrote and document paths it reported; show_document opens the viewer", async () => {
  const t = await setup();
  const { srv, get } = await server(t);
  try {
    const s = t.rt.createSession({ source: "web", cwd: t.work });
    const report = join(t.work, ".stitap", "design", "run-1", "report.md");
    mkdirSync(join(t.work, ".stitap", "design", "run-1"), { recursive: true }); writeFileSync(report, "# Report\n");
    t.mock.script([
      { tool_calls: [call("write_file", { path: "spec/design.md", content: "# Spec\n" })] },
      { content: `Done. The design report is at ${report}.` },
      { tool_calls: [call("show_document", { path: "spec/design.md" })] },
      { content: "Opened it." },
    ]);
    await t.rt.send(s.id, "write the design doc", { source: "web" }); await t.rt.waitIdle(s.id);
    const docs = (await (await get(`/api/docs?session=${s.id}`)).json()).docs;
    assert.deepEqual(docs.map((d) => d.name).sort(), ["design.md", "report.md"]);

    const { runCommand } = await import(dist("runtime/commands.js"));
    assert.deepEqual(await runCommand("/open", { rt: t.rt, sid: s.id, source: "web" }), { open: "*" });
    const one = await runCommand("/open spec/design.md", { rt: t.rt, sid: s.id, source: "web" });
    assert.ok(one.open.endsWith("/spec/design.md"));
    const list = await runCommand("/docs", { rt: t.rt, sid: s.id, source: "telegram" });
    assert.match(list.text, /1\. .*\.md\n  2\. .*\.md/);
    assert.match((await runCommand("/open 9", { rt: t.rt, sid: s.id, source: "web" })).text, /no document 9/);
    assert.match((await runCommand("/view .env", { rt: t.rt, sid: s.id, source: "web" })).text, /not found|secrets/);

    await t.rt.send(s.id, "show me the design document", { source: "web" }); await t.rt.waitIdle(s.id);
    const ev = t.events.find((e) => e.type === "open_document");
    assert.ok(ev && ev.path.endsWith("/spec/design.md"), "show_document emits open_document");
    const res = t.events.find((e) => e.type === "tool_end" && e.name === "show_document");
    assert.match(res.result, /document viewer/);
  } finally { await srv.close(); await t.close(); }
});

test("web UI: a path in a reply, the tool card's View button and /open show the document in the viewer", { skip: !chromium && "Chromium is not installed", timeout: 90000 }, async () => {
  const t = await setup();
  const { srv } = await server(t);
  const br = await chromium.launch({ headless: true });
  try {
    const s = t.rt.createSession({ source: "web", cwd: t.work });
    mkdirSync(join(t.work, "img"));
    writeFileSync(join(t.work, "img", "dot.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>`);
    t.mock.script([
      { tool_calls: [call("write_file", { path: "design.md", content: "# Payment design\n\n![dot](img/dot.svg)\n\nSee [the API notes](api.md).\n" })] },
      { tool_calls: [call("write_file", { path: "api.md", content: "## API notes\n" })] },
      { content: "Wrote the design document `design.md`." },
    ]);
    await t.rt.send(s.id, "write a design doc", { source: "web" }); await t.rt.waitIdle(s.id);
    const pg = await br.newPage({ viewport: { width: 1300, height: 850 } });
    const errs = [];
    pg.on("pageerror", (e) => errs.push(e.message));
    pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await pg.goto(`${srv.url}/#s=${s.id}`);
    await pg.waitForSelector("#msgs a.flink");
    // the path in the reply
    await pg.click("#msgs a.flink");
    await pg.waitForFunction(() => /Payment design/.test(document.querySelector("#docv.on .dvbody h1")?.textContent ?? ""));
    await pg.waitForFunction(() => { const i = document.querySelector("#docv .dvbody img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
    assert.match(await pg.textContent("#dvList"), /design\.md[\s\S]*api\.md|api\.md[\s\S]*design\.md/);
    // a relative link inside the document
    await pg.click("#docv .dvbody a.flink");
    await pg.waitForFunction(() => /API notes/.test(document.querySelector("#docv .dvbody h2")?.textContent ?? ""));
    await pg.click('#dvMode button[data-m="src"]');
    assert.match(await pg.textContent("#docv .dvbody pre"), /## API notes/);
    await pg.keyboard.press("Escape");
    await pg.waitForFunction(() => !document.querySelector("#docv.on"));
    // the View button on the write_file card
    await pg.click("#msgs .tool .viewbtn");
    await pg.waitForFunction(() => /Payment design/.test(document.querySelector("#docv.on .dvbody")?.textContent ?? ""));
    await pg.click("#dvClose");
    // /open lists the chat's documents
    await pg.fill("#input", "/open"); await pg.keyboard.press("Enter"); await pg.keyboard.press("Enter"); // the first Enter picks it from the palette
    await pg.waitForFunction(() => /Documents of this chat/.test(document.querySelector("#docv.on .dvbody")?.textContent ?? ""));
    assert.equal(await pg.$$eval("#docv .dvbody tbody tr", (r) => r.length), 2);
    await pg.click("#dvClose");
    // the 📄 button, on a phone
    await pg.setViewportSize({ width: 390, height: 800 });
    await pg.click("#docsBtn");
    await pg.waitForFunction(() => document.querySelector("#docv.on.listopen #dvList button"));
    await pg.click("#dvList button[data-p$='design.md']");
    await pg.waitForFunction(() => /Payment design/.test(document.querySelector("#docv.on:not(.listopen) .dvbody h1")?.textContent ?? ""));
    assert.deepEqual(errs, []);
  } finally { await br.close(); await srv.close(); await t.close(); }
});

test("api/file with a link: the document is downloaded and shown (a Google file the same way, via its export)", async () => {
  const t = await setup("web:\n  allow_private: true\n");
  const { srv, get } = await server(t);
  const { createServer } = await import("node:http");
  const web = createServer((req, res) => {
    if (req.url === "/gone") { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "text/csv", "content-disposition": 'attachment; filename="stock list.csv"' }); res.end("item,qty\nRice,2\n");
  });
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${web.address().port}`;
  try {
    const r = await (await get(`/api/file?path=${encodeURIComponent(base + "/export?id=1")}`)).json();
    assert.equal(r.kind, "table"); assert.match(r.markdown, /\| Rice \| 2 \|/);
    assert.equal(r.source, base + "/export?id=1"); assert.match(r.name, /^stock_list-[0-9a-f]{8}\.csv$/);
    assert.deepEqual(r.siblings, [], "a download's folder is not listed");
    const bad = await get(`/api/file?path=${encodeURIComponent(base + "/gone")}`);
    assert.equal(bad.status, 502); assert.match((await bad.json()).error, /answered 404/);
  } finally { web.close(); await srv.close(); await t.close(); }
});
