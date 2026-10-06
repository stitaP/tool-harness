#!/usr/bin/env node
// Corporate proxies: Node's fetch only honours HTTPS_PROXY when NODE_USE_ENV_PROXY=1 is set at
// startup, so re-launch once with it (respects NO_PROXY; uses the system CA store when NODE_EXTRA_CA_CERTS is set).
if ((process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) && !process.env.NODE_USE_ENV_PROXY && !process.env.STITAP_NO_PROXY_REEXEC) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1", STITAP_PROXY_REEXEC: "1" } });
  process.exit(r.status ?? 1);
}
// Node reads NODE_USE_ENV_PROXY once at startup, so drop the flag we added: otherwise every command the
// agent runs inherits it and every child `node` prints an experimental-proxy warning into tool output.
if (process.env.STITAP_PROXY_REEXEC === "1") { delete process.env.NODE_USE_ENV_PROXY; delete process.env.STITAP_PROXY_REEXEC; }
// Silence experimental-feature notices (node:sqlite, proxy agent) — they are expected.
const emit = process.emitWarning;
process.emitWarning = function (w, ...rest) {
  const msg = typeof w === "string" ? w : w?.message ?? "";
  if (/SQLite is an experimental feature|EnvHttpProxyAgent is experimental/.test(msg)) return;
  return emit.call(process, w, ...rest);
};
const { main } = await import("../dist/cli/main.js");
await main(process.argv.slice(2));
