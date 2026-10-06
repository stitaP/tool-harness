// Single-file entry: embeds the Tool Store and starts the CLI.
import * as store from "../store/store.mjs";
import { main } from "../dist/cli/main.js";
import { spawnSync } from "node:child_process";
globalThis.__stitapStore = store;
if ((process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) && !process.env.NODE_USE_ENV_PROXY && !process.env.STITAP_NO_PROXY_REEXEC) {
  // plain node: argv = [node, stitap.cjs, ...args]; single executable: argv = [exe, exe, ...args]
  const self = process.argv[1] && process.argv[1] !== process.execPath ? [process.argv[1]] : [];
  const r = spawnSync(process.execPath, [...self, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}
const emit = process.emitWarning;
process.emitWarning = function (w, ...rest) {
  const msg = typeof w === "string" ? w : w?.message ?? "";
  if (/SQLite is an experimental feature|Single executable application|EnvHttpProxyAgent is experimental/.test(msg)) return;
  return emit.call(process, w, ...rest);
};
main(process.argv.slice(2)).catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
