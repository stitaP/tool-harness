// Build a single executable (Node SEA): `stitap` / `stitap.exe` with Node embedded.
// Users need NO Node/Python install. Ship it with ui/ and skills/ alongside (the
// MSI/PKG/DEB installer or the Python wheel does this). Sign the result for your org.
//   node scripts/build-sea.mjs            → dist-sea/stitap[.exe]
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const bundle = join(root, "dist-bundle", "stitap.cjs");
if (!existsSync(bundle)) execFileSync(process.execPath, [join(here, "build-bundle.mjs")], { stdio: "inherit" });
const out = join(root, "dist-sea");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const exe = join(out, process.platform === "win32" ? "stitap.exe" : "stitap");
const blob = join(out, "sea-prep.blob");
writeFileSync(join(out, "sea-config.json"), JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false }));
execFileSync(process.execPath, ["--experimental-sea-config", join(out, "sea-config.json")], { stdio: "inherit" });
copyFileSync(process.execPath, exe);
if (process.platform === "darwin") execFileSync("codesign", ["--remove-signature", exe]);
const args = [exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
if (process.platform === "darwin") args.push("--macho-segment-name", "NODE_SEA");
execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "postject@1.0.0-alpha.6", ...args], { stdio: "inherit" });
if (process.platform === "darwin") execFileSync("codesign", ["--sign", "-", exe]);
for (const d of ["ui", "skills"]) cpSync(join(root, d), join(out, d), { recursive: true });
rmSync(blob); rmSync(join(out, "sea-config.json"));
console.log(`single executable: ${exe}  (ship together with ${join(out, "ui")} and ${join(out, "skills")})`);
