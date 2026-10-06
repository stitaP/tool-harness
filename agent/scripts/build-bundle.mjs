// Build dist-bundle/stitap.cjs: the whole runtime (+ Tool Store) as ONE CommonJS file.
// Used by the Node SEA binary and the Python wheel. Build-time only (needs esbuild from the repo).
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(root, "dist-bundle");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, "bundle-entry.mjs")],
  bundle: true, platform: "node", format: "cjs", target: "node20",
  outfile: join(out, "stitap.cjs"),
  define: { "import.meta.url": "__stitap_meta_url" },
  banner: { js: "const __stitap_meta_url = require('url').pathToFileURL(__filename).href;" },
  external: ["playwright", "playwright-core", "@huggingface/transformers", "tesseract.js", "@wllama/wllama", "convex", "convex/*"],
  logLevel: "warning", legalComments: "none",
});
// resources travel next to the bundle
for (const d of ["ui", "skills"]) cpSync(join(root, d), join(out, d), { recursive: true });
console.log(`bundle written to ${join(out, "stitap.cjs")}`);
