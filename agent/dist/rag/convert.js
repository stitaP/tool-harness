/**
 * Turn any shared file into markdown for the RAG bot. Office/OpenDocument/RTF go through the Office converters,
 * HTML through the HTML reader, PDF through pdftotext (if installed) or macOS PDFKit, plain text and code as-is,
 * CSV/TSV as tables. Anything that cannot be read is reported, never guessed at.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { officeToMarkdown, SUPPORTED_EXTENSIONS } from "../tools/office.js";
import { mdTable } from "../tools/office-md.js";
import { htmlToText, htmlTitle } from "../util/html.js";
const run = promisify(execFile);
const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".text", ".log", ".rst", ".adoc", ".org"]);
const CODE_LANG = { ".json": "json", ".xml": "xml", ".yml": "yaml", ".yaml": "yaml", ".toml": "toml", ".ini": "ini", ".js": "js", ".mjs": "js", ".ts": "ts", ".py": "python", ".java": "java", ".c": "c", ".cpp": "cpp", ".h": "c", ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php", ".sh": "bash", ".sql": "sql", ".css": "css", ".swift": "swift", ".kt": "kotlin" };
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".heic", ".svg"]);
export const RAG_EXTENSIONS = [...SUPPORTED_EXTENSIONS, ".pdf", ".html", ".htm", ".csv", ".tsv", ...TEXT_EXT, ...Object.keys(CODE_LANG)];
const looksBinary = (b) => b.subarray(0, 4096).includes(0);
const text = (b) => b.toString("utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
function parseCsv(src, sep) {
    const rows = [];
    let row = [], cur = "", q = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (q) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    cur += '"';
                    i++;
                }
                else
                    q = false;
            }
            else
                cur += ch;
        }
        else if (ch === '"')
            q = true;
        else if (ch === sep) {
            row.push(cur);
            cur = "";
        }
        else if (ch === "\n") {
            row.push(cur);
            rows.push(row);
            row = [];
            cur = "";
        }
        else
            cur += ch;
    }
    if (cur || row.length) {
        row.push(cur);
        rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim()));
}
async function pdfToMarkdown(path, warnings) {
    try { // poppler, when present, keeps columns readable
        const { stdout } = await run("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
        if (stdout.trim())
            return stdout;
    }
    catch { /* not installed or failed: try PDFKit */ }
    if (process.platform === "darwin") {
        const jxa = `ObjC.import('PDFKit'); ObjC.import('Foundation');
const a = $.NSProcessInfo.processInfo.arguments; const p = ObjC.unwrap(a.objectAtIndex(a.count - 1));
const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(p));
if (d.isNil()) { 'ERR:cannot open' } else { let out = []; for (let i = 0; i < d.pageCount; i++) { const s = d.pageAtIndex(i).string; out.push('\\n\\n<!--page ' + (i + 1) + '-->\\n' + (s.isNil() ? '' : ObjC.unwrap(s))); } out.join('') }`;
        const { stdout } = await run("osascript", ["-l", "JavaScript", "-e", jxa, path], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
        if (stdout.startsWith("ERR:"))
            throw new Error("this PDF cannot be opened (encrypted or damaged)");
        if (!stdout.replace(/<!--page \d+-->/g, "").trim())
            throw new Error("this PDF has no text layer (a scan); it needs OCR, which is not available");
        warnings.push("PDF text was extracted without layout: tables and columns may be flattened.");
        return stdout.replace(/<!--page (\d+)-->/g, (_m, n) => `\n\n--- page ${n} ---\n`);
    }
    throw new Error("PDF reading needs `pdftotext` (poppler) on this machine");
}
/** Convert one uploaded file. Throws with a clear reason when the format cannot be read. */
export async function convertToMarkdown(name, buf) {
    const ext = extname(name).toLowerCase();
    const warnings = [];
    if (!buf.length)
        throw new Error("the file is empty");
    if (IMAGE_EXT.has(ext))
        throw new Error("images are not supported (no OCR); share a text-based document instead");
    if (SUPPORTED_EXTENSIONS.includes(ext) || ext === ".pdf") {
        const dir = mkdtempSync(join(tmpdir(), "stitap-rag-"));
        try {
            const p = join(dir, `file${ext}`);
            writeFileSync(p, buf);
            if (ext === ".pdf")
                return { markdown: (await pdfToMarkdown(p, warnings)).replace(/\n{3,}/g, "\n\n").trim() + "\n", format: "pdf", warnings };
            const r = await officeToMarkdown(p);
            return { markdown: r.markdown, format: r.format || ext.slice(1), warnings: [...warnings, ...r.warnings] };
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
    if (looksBinary(buf))
        throw new Error(`"${ext || name}" looks like a binary file that cannot be converted`);
    const src = text(buf);
    if (ext === ".html" || ext === ".htm") {
        const t = htmlTitle(src);
        return { markdown: `${t ? `# ${t}\n\n` : ""}${htmlToText(src)}\n`, format: "html", warnings };
    }
    if (ext === ".csv" || ext === ".tsv") {
        const rows = parseCsv(src, ext === ".tsv" ? "\t" : (src.split("\n", 1)[0].split(";").length > src.split("\n", 1)[0].split(",").length ? ";" : ","));
        if (!rows.length)
            throw new Error("no rows found");
        const MAX = 5000;
        if (rows.length > MAX + 1)
            warnings.push(`only the first ${MAX} rows were kept`);
        return { markdown: mdTable(rows.slice(0, MAX + 1)) + "\n", format: ext.slice(1), warnings };
    }
    if (CODE_LANG[ext])
        return { markdown: `# ${name}\n\n\`\`\`${CODE_LANG[ext]}\n${src.trimEnd()}\n\`\`\`\n`, format: ext.slice(1), warnings };
    if (TEXT_EXT.has(ext) || !ext)
        return { markdown: src.trimEnd() + "\n", format: ext ? ext.slice(1) : "text", warnings };
    warnings.push(`unknown extension "${ext}": read as plain text`);
    return { markdown: src.trimEnd() + "\n", format: "text", warnings };
}
