#!/usr/bin/env node
// Minimal stand-in for llama-server: /health, /props, /v1/chat/completions. Used by the router tests.
import { createServer } from "node:http";
const a = process.argv.slice(2);
const arg = (k) => a[a.indexOf(k) + 1];
const port = Number(arg("--port")), alias = arg("--alias");
const ctx = alias.includes("big") ? 40192 : 126976;
createServer((req, res) => {
  const j = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  if (req.url === "/health") return j({ status: "ok" });
  if (req.url === "/props") return j({ model_alias: alias, default_generation_settings: { n_ctx: ctx } });
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => j({ id: "x", model: alias, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `served by ${alias}` } }], usage: { prompt_tokens: 5, completion_tokens: 3 } }));
}).listen(port, "127.0.0.1");
