/**
 * Locate bundled resources (ui/, skills/, store/) for every packaging:
 * npm package / source checkout (ESM dist), single-file bundle, Node SEA
 * binary (resources next to the executable), and the Python wheel.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
let cached = null;
function here() {
    try {
        return dirname(fileURLToPath(import.meta.url));
    }
    catch {
        return process.cwd();
    }
}
export function resourceRoot() {
    if (cached)
        return cached;
    const h = here();
    const candidates = [
        process.env.STITAP_RESOURCES,
        resolve(h, "..", ".."), // dist/util → package root
        resolve(h, ".."), // bundle in dist-bundle/
        h,
        dirname(process.execPath), // SEA binary with resources alongside
        resolve(dirname(process.execPath), ".."),
        resolve(dirname(process.execPath), "..", "share", "stitap"),
    ].filter(Boolean);
    cached = candidates.find((c) => existsSync(join(c, "ui", "index.html"))) ?? resolve(h, "..", "..");
    return cached;
}
export const resourcePath = (...p) => join(resourceRoot(), ...p);
