import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockLLM } from "./mock-llm.mjs";

const emit = process.emitWarning;
process.emitWarning = (w, ...r) => (/SQLite is an experimental/.test(String(w?.message ?? w)) ? undefined : emit.call(process, w, ...r));

export const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;

/** Fresh home + workdir + mock model + runtime. */
export async function setup(extraConfig = "", mockOpts = {}) {
  const mock = await startMockLLM(mockOpts);
  const home = mkdtempSync(join(tmpdir(), "stitap-home-"));
  const work = mkdtempSync(join(tmpdir(), "stitap-work-"));
  writeFileSync(join(home, "config.yaml"), `model:\n  provider: openai\n  base_url: ${mock.url}\n  name: mock\n  context_window: 32000\ncurator:\n  enabled: false\n${extraConfig}`);
  const { Runtime } = await import(dist("index.js"));
  const rt = await Runtime.create({ home, cwd: work });
  const events = [];
  rt.on("event", (e) => events.push(e));
  return { rt, mock, home, work, events, async close() { await rt.shutdown(); await mock.close(); } };
}

export const call = (name, args) => ({ name, arguments: args });
