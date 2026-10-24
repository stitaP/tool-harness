/**
 * convert_document: read any document the agent meets and write it in the format the work needs.
 * In: PDF, Word, Excel, PowerPoint, OpenDocument, RTF, HTML, CSV/TSV, Markdown, text, images, Google Docs/Sheets/Slides
 * links and links to documents. Out (by the output's extension): .md .txt .html .docx .doc .odt .rtf .pdf .csv .tsv
 * .xlsx .json, and image formats (macOS sips). No output: the text comes back to the agent.
 * Nothing to install: Word/RTF/ODT through macOS textutil, PDF through the browser tools' Chromium (cupsfilter as a fallback).
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative } from "node:path";
import { promisify } from "node:util";
import { deflateRawSync } from "node:zlib";
import { convertToMarkdown } from "../rag/convert.js";
import { fetchDocUrl, isUrl } from "../runtime/documents.js";
import { blockedReason, protectedReason, resolvePath } from "../safety/paths.js";
import { htmlToPdf } from "./browser.js";
import { obj, str } from "./types.js";
const run = promisify(execFile);
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".tiff", ".tif", ".bmp", ".heic", ".webp"]);
const TEXTUTIL = { ".docx": "docx", ".doc": "doc", ".odt": "odt", ".rtf": "rtf" };
export const CONVERT_OUT = [".md", ".txt", ".html", ".docx", ".doc", ".odt", ".rtf", ".pdf", ".csv", ".tsv", ".xlsx", ".json", ...IMAGE];
// ── Markdown → HTML (escape first, then a small safe set: headings, lists, tables, code, quotes, bold, italic, links, images) ──
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function inline(s) {
    return s.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, '<img alt="$1" src="$2">')
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
        .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '<a href="$2">$1</a>');
}
const tableRow = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
export function markdownToHtml(src, title = "Document") {
    const out = [];
    const lines = esc(src.replace(/\r\n/g, "\n")).split("\n");
    let i = 0;
    while (i < lines.length) {
        const l = lines[i];
        const fence = /^```/.exec(l);
        if (fence) {
            const buf = [];
            i++;
            while (i < lines.length && !/^```/.test(lines[i]))
                buf.push(lines[i++]);
            i++;
            out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
            continue;
        }
        const h = /^(#{1,6})\s+(.*)/.exec(l);
        if (h) {
            out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
            i++;
            continue;
        }
        if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
            out.push("<hr>");
            i++;
            continue;
        }
        if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
            const head = tableRow(l);
            i += 2;
            const body = [];
            while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]))
                body.push(tableRow(lines[i++]));
            out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
            continue;
        }
        if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
            const ordered = /^\s*\d+\./.test(l);
            const items = [];
            while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i]))
                items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
            out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${inline(t.replace(/^\[( |x)\]\s*/, (_m, x) => (x === "x" ? "☑ " : "☐ ")))}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
            continue;
        }
        if (/^&gt;\s?/.test(l)) {
            const buf = [];
            while (i < lines.length && /^&gt;\s?/.test(lines[i]))
                buf.push(lines[i++].replace(/^&gt;\s?/, ""));
            out.push(`<blockquote>${inline(buf.join("<br>"))}</blockquote>`);
            continue;
        }
        if (!l.trim()) {
            i++;
            continue;
        }
        const para = [];
        while (i < lines.length && lines[i].trim() && !/^```|^#{1,6}\s|^\s*([-*+]|\d+\.)\s+|^&gt;|^\s*\|.*\|\s*$/.test(lines[i]))
            para.push(lines[i++]);
        if (!para.length)
            para.push(lines[i++]);
        out.push(`<p>${inline(para.join("<br>"))}</p>`);
    }
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font:15px/1.55 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#1a1a1a}
h1,h2,h3{line-height:1.25;margin:1.2em 0 .4em}table{border-collapse:collapse;margin:.8em 0}th,td{border:1px solid #bbb;padding:5px 9px;text-align:left;vertical-align:top}
th{background:#f2f2f2}pre{background:#f6f6f6;padding:10px;border-radius:6px;overflow:auto;white-space:pre-wrap}code{font-family:Menlo,Consolas,monospace;font-size:.9em}
blockquote{border-left:3px solid #ccc;margin:.6em 0;padding:2px 12px;color:#555}img{max-width:100%}
</style></head><body>
${out.join("\n")}
</body></html>
`;
}
/** Markdown with the syntax taken off: for .txt. */
const markdownToText = (md) => md.replace(/^```\w*\n?/gm, "").replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/^\s*\|?\s*:?-{2,}[-|: ]*$/gm, "");
/** Every Markdown table, named after the heading above it (a sheet name in a converted workbook). */
export function markdownTables(md) {
    const lines = md.split("\n"), out = [];
    let heading = "";
    for (let i = 0; i < lines.length; i++) {
        const h = /^#{1,6}\s+(.*)/.exec(lines[i]);
        if (h) {
            heading = h[1].trim();
            continue;
        }
        if (/^\s*\|.*\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
            const rows = [tableRow(lines[i])];
            i += 2;
            while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]))
                rows.push(tableRow(lines[i++]));
            i--;
            out.push({ name: heading || `Table ${out.length + 1}`, rows: rows.map((r) => r.map((c) => c.replace(/\\\|/g, "|").replace(/\*\*([^*]+)\*\*/g, "$1"))) });
        }
    }
    return out;
}
export function parseDelimited(text, sep) {
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) {
            if (ch === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else if (ch === '"')
                q = false;
            else
                cell += ch;
            continue;
        }
        if (ch === '"' && !cell)
            q = true;
        else if (ch === sep) {
            row.push(cell);
            cell = "";
        }
        else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n")
                i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        }
        else
            cell += ch;
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c !== ""));
}
const toDelimited = (rows, sep) => rows.map((r) => r.map((c) => (/["\n\r]/.test(c) || c.includes(sep) ? `"${c.replace(/"/g, '""')}"` : c)).join(sep)).join("\n") + "\n";
// ── a minimal .xlsx writer (one sheet per table; numbers stay numbers) ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
} return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b)
    c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
    const parts = [], central = [];
    let off = 0;
    for (const [name, text] of files) {
        const data = Buffer.from(text, "utf8"), comp = deflateRawSync(data), nb = Buffer.from(name), crc = crc32(data);
        const h = Buffer.alloc(30);
        h.writeUInt32LE(0x04034b50, 0);
        h.writeUInt16LE(20, 4);
        h.writeUInt16LE(8, 8);
        h.writeUInt32LE(crc, 14);
        h.writeUInt32LE(comp.length, 18);
        h.writeUInt32LE(data.length, 22);
        h.writeUInt16LE(nb.length, 26);
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0);
        c.writeUInt16LE(20, 4);
        c.writeUInt16LE(20, 6);
        c.writeUInt16LE(8, 10);
        c.writeUInt32LE(crc, 16);
        c.writeUInt32LE(comp.length, 20);
        c.writeUInt32LE(data.length, 24);
        c.writeUInt16LE(nb.length, 28);
        c.writeUInt32LE(off, 42);
        parts.push(h, nb, comp);
        central.push(c, nb);
        off += 30 + nb.length + comp.length;
    }
    const cd = Buffer.concat(central), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(off, 16);
    return Buffer.concat([...parts, cd, end]);
}
const xmlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const colName = (n) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
export function writeXlsx(tables) {
    const used = new Set();
    const names = tables.map((t, i) => { let n = (t.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || `Sheet${i + 1}`; while (used.has(n.toLowerCase()))
        n = `${n.slice(0, 28)} ${i + 1}`; used.add(n.toLowerCase()); return n; });
    const sheet = (t) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${t.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
        const ref = `${colName(ci)}${ri + 1}`;
        return /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim().length < 16 ? `<c r="${ref}"><v>${v.trim()}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join("")}</row>`).join("")}</sheetData></worksheet>`;
    return zip([
        ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
        ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
        ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
        ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`],
        ...tables.map((t, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheet(t)]),
    ]);
}
async function readSource(src) {
    if (src.markdown === undefined) {
        if (src.ext === ".csv" || src.ext === ".tsv") {
            const text = readFileSync(src.path, "utf8").replace(/^\uFEFF/, ""), first = text.split("\n", 1)[0];
            src.rows = parseDelimited(text, src.ext === ".tsv" ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",");
        }
        src.markdown = [".md", ".markdown", ".txt"].includes(src.ext) ? readFileSync(src.path, "utf8") : (await convertToMarkdown(src.name, readFileSync(src.path))).markdown;
    }
    const tables = src.rows ? [{ name: basename(src.name, src.ext), rows: src.rows }] : markdownTables(src.markdown);
    return { markdown: src.markdown, tables };
}
function pickTables(tables, sheet) {
    if (!sheet)
        return tables;
    const n = Number(sheet);
    const t = Number.isInteger(n) && n >= 1 ? tables[n - 1] : tables.find((x) => x.name.toLowerCase() === sheet.toLowerCase()) ?? tables.find((x) => x.name.toLowerCase().includes(sheet.toLowerCase()));
    if (!t)
        throw new Error(`no sheet/table "${sheet}"; found: ${tables.map((x, i) => `${i + 1}. ${x.name}`).join(", ") || "none"}`);
    return [t];
}
async function textutil(html, fmt, out) {
    if (process.platform !== "darwin")
        throw new Error(`writing .${fmt} needs macOS (textutil); write .html or .md instead`);
    const dir = mkdtempSync(join(tmpdir(), "stitap-conv-"));
    try {
        const f = join(dir, "in.html");
        writeFileSync(f, html);
        await run("textutil", ["-convert", fmt, "-format", "html", "-inputencoding", "UTF-8", "-output", out, f], { timeout: 120_000 });
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
async function pdf(html, out, text) {
    try {
        await htmlToPdf(html, out);
        return "Chromium";
    }
    catch (e) {
        if (process.platform !== "darwin")
            throw new Error(`writing PDF needs the browser tools (harness browser setup): ${e.message}`);
        const dir = mkdtempSync(join(tmpdir(), "stitap-conv-"));
        // without Chromium: the text, unformatted (cupsfilter does not read HTML)
        try {
            const f = join(dir, "in.txt");
            writeFileSync(f, text);
            const { stdout } = await run("/usr/sbin/cupsfilter", ["-i", "text/plain", "-m", "application/pdf", f], { encoding: "buffer", maxBuffer: 256 * 1024 * 1024, timeout: 120_000 });
            if (!stdout.length)
                throw new Error("cupsfilter wrote nothing");
            writeFileSync(out, stdout);
            return `cupsfilter, plain text: ${e.message.split("\n")[0].slice(0, 120)}`;
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}
/** Convert `src` into `out` (format from its extension). Returns a one-line note on what was written. */
export async function convertFile(src, out, o = {}) {
    const oext = extname(out).toLowerCase();
    mkdirSync(dirname(out), { recursive: true });
    if (IMAGE.has(oext)) {
        if (!IMAGE.has(src.ext) && src.ext !== ".pdf")
            throw new Error(`only an image or a PDF can become ${oext}`);
        if (process.platform !== "darwin")
            throw new Error("image conversion needs macOS (sips)");
        const fmt = { ".jpg": "jpeg", ".jpeg": "jpeg", ".tif": "tiff" }[oext] ?? oext.slice(1);
        await run("sips", ["-s", "format", fmt, src.path, "--out", out], { timeout: 120_000 });
        return `image (${fmt})`;
    }
    const { markdown, tables } = await readSource(src);
    const title = o.title || basename(src.name, src.ext);
    const html = () => (src.ext === ".html" || src.ext === ".htm" ? readFileSync(src.path, "utf8") : markdownToHtml(markdown, title));
    switch (oext) {
        case ".md":
        case ".markdown":
            writeFileSync(out, markdown);
            return "Markdown";
        case ".txt":
            writeFileSync(out, markdownToText(markdown));
            return "plain text";
        case ".html":
        case ".htm":
            writeFileSync(out, html());
            return "HTML";
        case ".docx":
        case ".doc":
        case ".odt":
        case ".rtf":
            await textutil(html(), TEXTUTIL[oext], out);
            return `${oext.slice(1).toUpperCase()} (textutil)`;
        case ".pdf": return `PDF (${await pdf(html(), out, markdownToText(markdown))})`;
        case ".csv":
        case ".tsv": {
            if (!tables.length)
                throw new Error(`${src.label} has no table to write as ${oext}`);
            const t = pickTables(tables, o.sheet);
            if (t.length > 1 && !o.sheet) {
                writeFileSync(out, toDelimited(t[0].rows, oext === ".tsv" ? "\t" : ","));
                return `${oext.slice(1).toUpperCase()} of "${t[0].name}" (the first of ${t.length} tables: ${t.map((x) => x.name).join(", ")}; pass sheet to pick another)`;
            }
            writeFileSync(out, toDelimited(t[0].rows, oext === ".tsv" ? "\t" : ","));
            return `${oext.slice(1).toUpperCase()} of "${t[0].name}" (${t[0].rows.length} rows)`;
        }
        case ".xlsx": {
            if (!tables.length)
                throw new Error(`${src.label} has no table to write as a workbook`);
            const t = pickTables(tables, o.sheet);
            writeFileSync(out, writeXlsx(t));
            return `Excel workbook: ${t.map((x) => `${x.name} (${x.rows.length} rows)`).join(", ")}`;
        }
        case ".json": {
            if (!tables.length) {
                writeFileSync(out, JSON.stringify({ title, markdown }, null, 2));
                return "JSON (the text; no tables found)";
            }
            const t = pickTables(tables, o.sheet)[0], [head, ...rows] = t.rows;
            writeFileSync(out, JSON.stringify(rows.map((r) => Object.fromEntries(head.map((h, i) => [h || `column${i + 1}`, r[i] ?? ""]))), null, 2));
            return `JSON: ${rows.length} records from "${t.name}"`;
        }
        default: throw new Error(`cannot write ${oext || "a file without an extension"}; outputs: ${CONVERT_OUT.join(" ")}`);
    }
}
export const convertDocumentTool = {
    name: "convert_document", toolset: "files", tier: "slm",
    description: "Read or convert a document (PDF, Word, Excel, PowerPoint, ODF, RTF, HTML, CSV, image, Google Docs/Sheets/Slides or document link). No output: returns it as Markdown. output's extension picks the format: .md .txt .html .docx .odt .rtf .pdf .csv .xlsx .json .png .jpg",
    parameters: obj({ source: str("Path or link"), output: str("File to write"), sheet: str("Sheet name or number (.csv/.xlsx/.json)"), title: str("Title (HTML/Word/PDF)") }, ["source"]),
    async handler(a, ctx) {
        const raw = String(a.source ?? "").trim();
        let src;
        if (isUrl(raw)) {
            const r = await fetchDocUrl(ctx.rt, raw);
            src = { path: r.path, name: basename(r.path), ext: extname(r.path).toLowerCase(), label: `the ${r.kind}` };
        }
        else {
            const p = resolvePath(ctx.cwd, raw);
            const why = blockedReason(p, ctx.rt.cfg.data.security.blocked_paths, false);
            if (why)
                throw new Error(why);
            if (!existsSync(p) || !statSync(p).isFile())
                throw new Error(`not found: ${p}`);
            src = { path: p, name: basename(p), ext: extname(p).toLowerCase(), label: basename(p) };
        }
        if (!a.output) {
            if (IMAGE.has(src.ext))
                return `${src.label} is an image; use vision_analyze to read it.`;
            const { markdown } = await readSource(src);
            const max = 40_000;
            return `${src.label} as Markdown${markdown.length > max ? ` (first ${max} of ${markdown.length} characters; write it to a .md file with output to keep all of it)` : ""}:\n\n${markdown.slice(0, max)}`;
        }
        const out = resolvePath(ctx.cwd, String(a.output));
        const why = blockedReason(out, ctx.rt.cfg.data.security.blocked_paths, true) ?? protectedReason(out, ctx.rt.cfg.data.security.protected_paths);
        if (why)
            throw new Error(why);
        if (out === src.path)
            throw new Error("output must be a different file from the source");
        if (existsSync(out))
            ctx.rt.checkpoints.take(ctx.rt.checkpointRoot(ctx.session.id, out, ctx.cwd), `before convert_document ${relative(ctx.cwd, out)}`, out);
        const what = await convertFile(src, out, { sheet: a.sheet ? String(a.sheet) : undefined, title: a.title ? String(a.title) : undefined });
        return `Wrote ${out} (${what}, ${statSync(out).size.toLocaleString()} bytes) from ${src.label}.`;
    },
};
