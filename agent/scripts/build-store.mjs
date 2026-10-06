// Bundle the browser-app Tool Store (src/lib/store) into a Node module the agent can call.
// Build-time only (needs the repo's devDependencies); end users get the prebuilt file.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
await build({
  entryPoints: [join(here, "store-entry.ts")],
  bundle: true, platform: "node", format: "esm", target: "node20",
  outfile: join(here, "..", "store", "store.mjs"),
  alias: { "@": join(repo, "src") },
  // heavy optional ML/browser libs are loaded lazily by individual tools only
  external: ["@huggingface/transformers", "tesseract.js", "@wllama/wllama", "playwright", "convex", "convex/*", "@zumer/snapdom", "html-to-image"],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: "warning", legalComments: "none",
});
console.log("store bundle written to agent/store/store.mjs");
