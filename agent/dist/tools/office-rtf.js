/**
 * RTF → Markdown, following the "Rich Text Format (RTF) Specification 1.9.1". Pure TypeScript, no dependencies.
 *
 * A tokenizer walks groups / control words / control symbols / text; a group-state stack carries character formatting
 * (bold, italic, \uc skip count, destination kind) and paragraph properties (\intbl, \ls/\ilvl, \outlinelevel, \s).
 * Paragraphs become Markdown blocks; \cell/\row rebuild tables; HYPERLINK fields become links; bookkeeping
 * destinations (font/colour/style tables, pictures, objects, headers, \* destinations…) are skipped.
 */
import { mdTable } from "./office-md.js";
// cp1252 0x80–0x9F (undefined slots map to themselves, as Windows does)
const CP1252_HI = [
    0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
    0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];
export function cp1252Char(b) { return String.fromCharCode(b >= 0x80 && b <= 0x9f ? CP1252_HI[b - 0x80] : b); }
/** Decode single bytes in the document code page. cp1252 natively; other single-byte pages via TextDecoder when the
 *  runtime has them (full-ICU Node), else latin1. Multi-byte (DBCS) pages are decoded pairwise by the caller. */
function byteDecoder(cp) {
    if (cp === 1252 || cp === 0)
        return (bs) => bs.map(cp1252Char).join("");
    const label = cp === 65001 ? "utf-8" : cp === 10000 ? "macintosh" : cp === 932 ? "shift_jis" : cp === 936 ? "gbk" : cp === 949 ? "euc-kr" : cp === 950 ? "big5" : `windows-${cp}`;
    try {
        const td = new TextDecoder(label);
        return (bs) => td.decode(Uint8Array.from(bs));
    }
    catch {
        return (bs) => String.fromCharCode(...bs);
    }
}
// \fcharset → Windows code page (RTF 1.9.1, \fcharset table); 0 = ANSI → the document's \ansicpg
const CHARSET_CP = { 77: 10000, 128: 932, 129: 949, 130: 1361, 134: 936, 136: 950, 161: 1253, 162: 1254, 163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250, 254: 437, 255: 850 };
// destinations whose content is never body text
const SKIP_DEST = new Set([
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "objdata", "header", "headerl", "headerr", "headerf", "footer",
    "footerl", "footerr", "footerf", "xmlnstbl", "listtable", "listoverridetable", "themedata", "datastore", "latentstyles",
    "generator", "fldinst", "filetbl", "revtbl", "rsidtbl", "mmathPr", "pgdsctbl", "listtext", "pntxta", "pntxtb", "author",
    "operator", "title", "subject", "keywords", "comment", "doccomm", "bkmkstart", "bkmkend", "nonshppict", "shppict", "sp",
    "shpinst", "falt", "panose", "fname", "template", "userprops", "docvar", "atnid", "atnauthor", "annotation", "atrfstart",
    "atrfend", "xe", "tc", "txe", "rxe", "background", "colorschememapping", "passwordhash", "wgrffmtfilter", "fchars", "lchars",
    "ftnsep", "ftnsepc", "ftncn", "aftnsep", "aftnsepc", "aftncn", "protusertbl", "pn",
]);
const freshPara = () => ({ intbl: false, ls: 0, ilvl: 0, outline: -1, style: 0, pnlvl: -1, pnBullet: undefined });
/** Merge runs and render bold/italic/links (same conventions as the .docx converter). */
export function renderSegs(segs, brk) {
    let out = "";
    let k = 0;
    const wrap = (t, b, i) => {
        const mk = b && i ? "***" : b ? "**" : i ? "_" : "";
        if (!mk)
            return t;
        return t.split("\n").map((piece) => { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(piece); return m[2] ? `${m[1]}${mk}${m[2]}${mk}${m[3]}` : piece; }).join("\n");
    };
    while (k < segs.length) {
        const href = segs[k].href;
        let inner = "";
        while (k < segs.length && segs[k].href === href) {
            const s = segs[k];
            let t = s.t;
            k++;
            while (k < segs.length && segs[k].href === href && segs[k].b === s.b && segs[k].i === s.i)
                t += segs[k++].t;
            inner += wrap(t, s.b, s.i);
        }
        if (href && inner.trim())
            out += `[${inner.trim()}](${href.replace(/ /g, "%20").replace(/\)/g, "%29")})`;
        else
            out += inner;
    }
    return out.replace(/[ \t]*\n[ \t]*/g, brk).replace(/\t/g, " ");
}
export function joinBlocks(blocks) {
    let out = "";
    blocks.forEach((b, k) => {
        if (!b.text.trim())
            return;
        if (out)
            out += b.kind === "list" && blocks[k - 1]?.kind === "list" ? "\n" : "\n\n";
        out += b.text;
    });
    return out;
}
export function rtfToMarkdown(input) {
    const warnings = [];
    const src = typeof input === "string" ? input : input.toString("latin1");
    if (!/^\s*\{\\rtf/.test(src.slice(0, 64)))
        throw new Error("not an RTF document (missing {\\rtf header)");
    let docDecoder = byteDecoder(1252);
    const fontCp = new Map(); // \fN → code page from \fcharset / \cpg
    let curFont = -1;
    const decoders = new Map();
    const decoderFor = (cp) => { let d = decoders.get(cp); if (!d)
        decoders.set(cp, (d = byteDecoder(cp))); return d; };
    const styleNames = new Map();
    const styleOutline = new Map();
    const listBullet = new Map(); // listid → per-level "is bullet"
    const lsToList = new Map();
    let curList = null;
    let curStyle = null;
    const blocks = [];
    const footnotes = [];
    let segs = [];
    let tableRows = [];
    let row = [];
    let pendingHref; // from the current field's fldinst
    let fldinstText = "";
    let fnSegs = null;
    let noteRef = ""; // "[^n]" to emit once the footnote group has closed
    let st = { b: false, i: false, uc: 1, fs: 24, font: -1, note: false, dest: "text", pp: freshPara() };
    const stack = [];
    let pendingBytes = [];
    let skipChars = 0; // \uN fallback characters still to skip
    let fieldHref; // active hyperlink while inside fldrslt
    const isText = () => st.dest === "text" || st.dest === "fldrslt" || st.dest === "footnote" || st.dest === "pntext";
    const target = () => {
        if (st.note)
            return st.dest === "footnote" || st.dest === "fldrslt" ? fnSegs : null;
        if (st.dest === "text" || st.dest === "fldrslt")
            return segs;
        return null;
    };
    const emit = (t) => {
        if (!t)
            return;
        if (st.dest === "fldinst") {
            fldinstText += t;
            return;
        }
        if (st.dest === "style") {
            if (curStyle)
                curStyle.name += t;
            return;
        }
        const tg = target();
        if (!tg)
            return;
        const href = st.dest === "fldrslt" ? fieldHref : undefined;
        const last = tg[tg.length - 1];
        if (last && last.b === st.b && last.i === st.i && last.href === href && last.fs === st.fs)
            last.t += t;
        else
            tg.push({ t, b: st.b, i: st.i, href, fs: st.fs });
    };
    const decodeBytes = (bs) => { const cp = fontCp.get(st.font); return (cp ? decoderFor(cp) : docDecoder)(bs); };
    const flushBytes = () => {
        if (!pendingBytes.length)
            return;
        const bs = pendingBytes;
        pendingBytes = [];
        emit(decodeBytes(bs));
    };
    const styleHeading = (s) => {
        const name = (styleNames.get(s) ?? "").toLowerCase().replace(/[;\s]+$/, "").trim();
        const m = /^heading\s*([1-9])$/.exec(name);
        if (m)
            return Math.min(6, Number(m[1]));
        if (name === "title")
            return 1;
        const ol = styleOutline.get(s);
        if (ol !== undefined && ol < 9 && name.startsWith("heading"))
            return Math.min(6, ol + 1);
        return 0;
    };
    /** Documents without heading styles (TextEdit/Cocoa RTF, many converters): a short, single-size, bold paragraph in a
     *  large font reads as a heading. 40+ half-points → #, 32+ → ##, 28+ → ###. */
    const sizeHeading = (p) => {
        if (p.ls > 0 || p.pnlvl >= 0)
            return 0;
        const txt = segs.filter((s) => s.t.trim());
        if (!txt.length || txt.some((s) => !s.b || s.href) || segs.some((s) => s.t.includes("\n")))
            return 0;
        const fs = txt[0].fs ?? 24;
        if (txt.some((s) => s.fs !== fs))
            return 0;
        if (txt.map((s) => s.t).join("").trim().length > 150)
            return 0;
        return fs >= 40 ? 1 : fs >= 32 ? 2 : fs >= 28 ? 3 : 0;
    };
    const paraText = (brk) => renderSegs(segs, brk).trim();
    const endPara = (p, kind) => {
        if (kind === "cell") {
            const t = paraText("<br>");
            row.push(t);
            segs = [];
            return;
        }
        if (kind === "row") {
            if (segs.some((s) => s.t.trim())) {
                row.push(paraText("<br>"));
                segs = [];
            }
            if (row.length)
                tableRows.push(row);
            row = [];
            return;
        }
        // a paragraph inside a table cell (not the last of the cell): keep as a line within the cell
        if (p.intbl) {
            segs.push({ t: "\n", b: false, i: false });
            return;
        }
        flushTable();
        let level = 0;
        const sh = styleHeading(p.style);
        if (sh)
            level = sh;
        else if (p.outline >= 0 && p.outline < 9)
            level = Math.min(6, p.outline + 1);
        else if (!styleNames.size || ![...styleNames.keys()].some((k) => styleHeading(k)))
            level = sizeHeading(p);
        const t = level ? renderSegs(segs.map((s) => ({ ...s, b: false, i: false })), " ").trim() : paraText("  \n");
        segs = [];
        if (!t)
            return;
        if (level) {
            blocks.push({ kind: "para", text: `${"#".repeat(level)} ${t}` });
            return;
        }
        if (p.ls > 0 || p.pnlvl >= 0) {
            let bullet = true;
            let lvl = 0;
            if (p.ls > 0) {
                lvl = Math.max(0, Math.min(8, p.ilvl));
                const lid = lsToList.get(p.ls);
                const lv = lid !== undefined ? listBullet.get(lid) : undefined;
                if (lv && lv[lvl] !== undefined)
                    bullet = lv[lvl];
            }
            else {
                lvl = Math.max(0, Math.min(8, p.pnlvl - 1));
                if (p.pnBullet !== undefined)
                    bullet = p.pnBullet;
            }
            const mk = bullet ? "-" : "1.";
            blocks.push({ kind: "list", text: `${" ".repeat(lvl * (bullet ? 2 : 3))}${mk} ${t}` });
            return;
        }
        blocks.push({ kind: "para", text: t });
    };
    const flushTable = () => {
        if (row.length) {
            tableRows.push(row);
            row = [];
        }
        if (tableRows.length)
            blocks.push({ kind: "para", text: mdTable(tableRows) });
        tableRows = [];
    };
    const n = src.length;
    let pos = 0;
    let depth = 0;
    const MAX_DEPTH = 1000;
    let destPending = false; // just saw "\*"
    let groupStart = false; // first token in a new group (destinations are recognised only there)
    while (pos < n) {
        const ch = src[pos];
        if (ch === "{") {
            flushBytes();
            stack.push(st);
            st = { ...st, pp: { ...st.pp } };
            depth++;
            if (depth > MAX_DEPTH)
                throw new Error("RTF nesting too deep");
            pos++;
            groupStart = true;
            destPending = false;
            continue;
        }
        if (ch === "}") {
            flushBytes();
            const closing = st;
            if (closing.dest === "fldinst" && stack.length) {
                const m = /HYPERLINK\s+(?:\\l\s+)?"([^"]*)"|HYPERLINK\s+(\S+)/.exec(fldinstText);
                if (m) {
                    const url = m[1] ?? m[2];
                    pendingHref = /HYPERLINK\s+\\l/.test(fldinstText) ? `#${url}` : url;
                }
            }
            if (closing.dest === "style" && curStyle && stack[stack.length - 1]?.dest !== "style") {
                styleNames.set(curStyle.n, curStyle.name);
                if (curStyle.outline >= 0)
                    styleOutline.set(curStyle.n, curStyle.outline);
                curStyle = null;
            }
            if (closing.dest === "list" && curList && stack[stack.length - 1]?.dest !== "list") {
                listBullet.set(curList.id, curList.levels);
                curList = null;
            }
            if (closing.note && !stack[stack.length - 1]?.note && fnSegs) {
                const t = renderSegs(fnSegs, " ").replace(/\s+/g, " ").trim();
                fnSegs = null;
                if (t) {
                    footnotes.push(t);
                    noteRef = `[^${footnotes.length}]`;
                }
            }
            if (closing.dest === "fldrslt" && stack[stack.length - 1]?.dest !== "fldrslt")
                fieldHref = undefined;
            st = stack.pop() ?? st;
            if (noteRef) {
                emit(noteRef);
                noteRef = "";
            }
            // paragraph properties persist across groups only via \pard; formatting is restored, but keep pp from inner groups
            // (Word frequently writes "{\pard ... \par}" groups — the paragraph ends inside, so restoring is correct).
            depth--;
            pos++;
            groupStart = false;
            continue;
        }
        if (ch === "\\") {
            const c2 = src[pos + 1];
            if (c2 === undefined)
                break;
            // control symbols
            if (!/[a-zA-Z]/.test(c2)) {
                pos += 2;
                if (c2 === "'") {
                    const hex = src.substr(pos, 2);
                    pos += 2;
                    const v = parseInt(hex, 16);
                    if (Number.isNaN(v))
                        continue;
                    if (skipChars > 0) {
                        skipChars--;
                        continue;
                    }
                    if (isText() || st.dest === "fldinst" || st.dest === "style")
                        pendingBytes.push(v);
                    groupStart = false;
                    continue;
                }
                flushBytes();
                if (c2 === "*") {
                    destPending = true;
                    continue;
                }
                groupStart = false;
                if (skipChars > 0) {
                    skipChars--;
                    continue;
                }
                if (c2 === "\\" || c2 === "{" || c2 === "}")
                    emit(c2);
                else if (c2 === "~")
                    emit("\u00a0");
                else if (c2 === "_")
                    emit("\u2011");
                else if (c2 === "-") { /* optional hyphen */ }
                else if (c2 === "\n" || c2 === "\r") {
                    if (st.note)
                        emit(" ");
                    else if (isText())
                        endPara(st.pp, "par");
                }
                else if (c2 === "\t")
                    emit("\t");
                else if (c2 === ":") { /* index subentry */ }
                else if (c2 === "|") { /* formula */ }
                continue;
            }
            // control word
            let e = pos + 1;
            while (e < n && e - pos < 34 && /[a-zA-Z]/.test(src[e]))
                e++;
            const word = src.slice(pos + 1, e);
            let numStr = "";
            if (src[e] === "-" && /[0-9]/.test(src[e + 1] ?? "")) {
                numStr = "-";
                e++;
            }
            while (e < n && /[0-9]/.test(src[e]) && numStr.length < 11)
                numStr += src[e++];
            if (src[e] === " ")
                e++;
            pos = e;
            const hasNum = numStr !== "" && numStr !== "-";
            const num = hasNum ? parseInt(numStr, 10) : NaN;
            const wasGroupStart = groupStart;
            groupStart = false;
            if (word === "bin") {
                flushBytes();
                const len = hasNum && num > 0 ? num : 0;
                pos = Math.min(n, pos + len);
                continue;
            }
            if (skipChars > 0 && st.dest !== "skip") {
                // the fallback after \uN may be a control word (e.g. \'hh counted above, or a whole word); count it as one char
                if (!["par", "cell", "row", "line", "tab"].includes(word)) {
                    skipChars--;
                    continue;
                }
                skipChars = 0;
            }
            // destinations
            if (wasGroupStart || destPending) {
                const starred = destPending;
                destPending = false;
                if (st.dest === "skip")
                    continue;
                if (word === "fldinst") {
                    flushBytes();
                    st.dest = "fldinst";
                    fldinstText = "";
                    pendingHref = undefined;
                    continue;
                }
                if (word === "fldrslt") {
                    flushBytes();
                    st.dest = "fldrslt";
                    fieldHref = pendingHref;
                    continue;
                }
                if (word === "footnote") {
                    flushBytes();
                    if (st.note) {
                        st.dest = "skip";
                        continue;
                    }
                    st.dest = "footnote";
                    st.note = true;
                    fnSegs = [];
                    continue;
                }
                if (word === "stylesheet") {
                    st.dest = "stylesheet";
                    continue;
                }
                if (word === "fonttbl") {
                    st.dest = "fonttbl";
                    continue;
                }
                if (st.dest === "stylesheet" && (word === "s" || word === "cs" || word === "ds" || word === "ts" || word === "tsrowd")) {
                    st.dest = "style";
                    curStyle = { n: word === "s" ? (hasNum ? num : 0) : -1 - (hasNum ? num : 0), name: "", outline: -1 };
                    continue;
                }
                if (word === "listtable") {
                    st.dest = "listtable";
                    continue;
                }
                if (word === "list" && st.dest === "listtable") {
                    st.dest = "list";
                    curList = { id: 0, levels: [] };
                    continue;
                }
                if (word === "listlevel" && st.dest === "list") {
                    st.dest = "listlevel";
                    curList?.levels.push(true);
                    continue;
                }
                if (word === "listoverridetable") {
                    st.dest = "lsover";
                    continue;
                }
                if (word === "listoverride" && st.dest === "lsover") {
                    continue;
                }
                if (word === "pntext" || word === "listtext") {
                    flushBytes();
                    st.dest = "skip";
                    continue;
                }
                if (word === "pn") {
                    st.dest = "pn";
                    continue;
                }
                if (st.dest === "listlevel" || st.dest === "list" || st.dest === "lsover" || st.dest === "style") {
                    // nested groups inside those (leveltext, levelnumbers, listname, …): skip their text but keep reading words
                    if (!["listlevel", "list", "listoverride"].includes(word) && (word === "leveltext" || word === "levelnumbers" || word === "listname" || starred)) {
                        st.dest = "skip";
                        continue;
                    }
                }
                else if (st.dest !== "pn" && (starred || SKIP_DEST.has(word))) {
                    flushBytes();
                    st.dest = "skip";
                    continue;
                }
            }
            if (st.dest === "skip")
                continue;
            if (st.dest === "fonttbl") {
                if (word === "f" && hasNum)
                    curFont = num;
                else if (word === "fcharset" && hasNum && curFont >= 0) {
                    const cp = CHARSET_CP[num];
                    if (cp)
                        fontCp.set(curFont, cp);
                }
                else if (word === "cpg" && hasNum && curFont >= 0 && num > 0)
                    fontCp.set(curFont, num);
                continue;
            }
            // list table / override bookkeeping
            if (st.dest === "list" && word === "listid" && curList) {
                curList.id = num;
                continue;
            }
            if (st.dest === "listlevel" && word === "levelnfc" && curList) {
                curList.levels[curList.levels.length - 1] = num === 23 || num === 255;
                continue;
            }
            if (st.dest === "lsover") {
                if (word === "listid")
                    st.__lid = num;
                else if (word === "ls" && st.__lid !== undefined)
                    lsToList.set(num, st.__lid);
                continue;
            }
            if (st.dest === "listtable" || st.dest === "list" || st.dest === "listlevel")
                continue;
            if (st.dest === "style") {
                if (word === "outlinelevel" && curStyle)
                    curStyle.outline = num;
                continue;
            }
            if (st.dest === "stylesheet")
                continue;
            if (st.dest === "pn") {
                if (word === "pnlvlblt")
                    st.pp.pnBullet = true, st.pp.pnlvl = Math.max(st.pp.pnlvl, 1);
                else if (word === "pnlvl")
                    st.pp.pnlvl = num;
                else if (word === "pnlvlbody")
                    st.pp.pnlvl = Math.max(st.pp.pnlvl, 1);
                else if (/^pn(dec|ucltr|ucrm|lcltr|lcrm|ord|cardtext|ordt)$/.test(word))
                    st.pp.pnBullet = false;
                // pn properties belong to the enclosing paragraph
                const parent = stack[stack.length - 1];
                if (parent) {
                    parent.pp.pnlvl = st.pp.pnlvl;
                    parent.pp.pnBullet = st.pp.pnBullet;
                }
                continue;
            }
            switch (word) {
                case "ansicpg":
                    if (hasNum)
                        docDecoder = decoderFor(num);
                    break;
                case "f":
                    if (hasNum) {
                        flushBytes();
                        st.font = num;
                    }
                    break;
                case "deff":
                    if (hasNum && st.font < 0)
                        st.font = num;
                    break;
                case "mac":
                    docDecoder = decoderFor(10000);
                    break;
                case "pc":
                    docDecoder = decoderFor(437);
                    break;
                case "pca":
                    docDecoder = decoderFor(850);
                    break;
                case "uc":
                    if (hasNum && num >= 0)
                        st.uc = num;
                    break;
                case "u": {
                    flushBytes();
                    if (!hasNum)
                        break;
                    let v = num < 0 ? num + 65536 : num;
                    if (v < 0 || v > 0xffff)
                        v = 0xfffd;
                    if (isText() || st.dest === "fldinst")
                        emit(String.fromCharCode(v));
                    skipChars = st.uc;
                    break;
                }
                case "par":
                case "sect":
                    flushBytes();
                    if (st.note)
                        emit(" ");
                    else if (isText())
                        endPara(st.pp, "par");
                    break;
                case "cell":
                    flushBytes();
                    if (st.note)
                        emit(" ");
                    else if (st.dest === "text" || st.dest === "fldrslt")
                        endPara(st.pp, "cell");
                    break;
                case "row":
                    flushBytes();
                    if (st.note)
                        emit(" ");
                    else if (st.dest === "text" || st.dest === "fldrslt")
                        endPara(st.pp, "row");
                    break;
                // nested tables are flattened into the enclosing cell: inner cells " / ", inner rows on new lines
                case "nestcell":
                    flushBytes();
                    emit(" / ");
                    break;
                case "nestrow":
                    flushBytes();
                    emit("\n");
                    break;
                case "line":
                    flushBytes();
                    emit("\n");
                    break;
                case "page":
                case "column":
                    flushBytes();
                    break;
                case "tab":
                    flushBytes();
                    emit("\t");
                    break;
                case "emdash":
                    emit("\u2014");
                    break;
                case "endash":
                    emit("\u2013");
                    break;
                case "emspace":
                case "enspace":
                case "qmspace":
                    emit(" ");
                    break;
                case "bullet":
                    emit("\u2022");
                    break;
                case "lquote":
                    emit("\u2018");
                    break;
                case "rquote":
                    emit("\u2019");
                    break;
                case "ldblquote":
                    emit("\u201c");
                    break;
                case "rdblquote":
                    emit("\u201d");
                    break;
                case "zwj":
                case "zwnj":
                case "ltrmark":
                case "rtlmark": break;
                case "b":
                    flushBytes();
                    st.b = !hasNum || num !== 0;
                    break;
                case "i":
                    flushBytes();
                    st.i = !hasNum || num !== 0;
                    break;
                case "plain":
                    flushBytes();
                    st.b = false;
                    st.i = false;
                    st.fs = 24;
                    break;
                case "fs":
                    flushBytes();
                    st.fs = hasNum && num > 0 ? num : 24;
                    break;
                case "pard":
                    st.pp = freshPara();
                    break;
                case "intbl":
                    st.pp.intbl = true;
                    break;
                case "itap":
                    st.pp.intbl = hasNum ? num > 0 : true;
                    break;
                case "ls":
                    st.pp.ls = hasNum ? num : 0;
                    break;
                case "ilvl":
                    st.pp.ilvl = hasNum ? num : 0;
                    break;
                case "outlinelevel":
                    st.pp.outline = hasNum ? num : -1;
                    break;
                case "s":
                    st.pp.style = hasNum ? num : 0;
                    break;
                case "pnlvlblt":
                    st.pp.pnBullet = true;
                    st.pp.pnlvl = Math.max(1, st.pp.pnlvl);
                    break;
                case "trowd":
                    flushBytes();
                    break;
                case "lastrow": break;
                default: break;
            }
            continue;
        }
        // plain text
        if (ch === "\r" || ch === "\n") {
            pos++;
            continue;
        }
        if (st.dest === "skip" || !(isText() || st.dest === "fldinst" || st.dest === "style")) {
            pos++;
            groupStart = false;
            continue;
        }
        groupStart = false;
        if (skipChars > 0) {
            skipChars--;
            pos++;
            continue;
        }
        // run of literal characters
        let e = pos;
        while (e < n && src[e] !== "\\" && src[e] !== "{" && src[e] !== "}" && src[e] !== "\r" && src[e] !== "\n")
            e++;
        flushBytes();
        let run = src.slice(pos, e);
        if (typeof input !== "string")
            run = decodeBytes([...run].map((c) => c.charCodeAt(0) & 0xff)); // 8-bit literals in the doc code page
        if (st.dest === "style") {
            if (curStyle)
                curStyle.name += run;
        }
        else
            emit(run);
        pos = e;
    }
    flushBytes();
    if (depth !== 0)
        warnings.push("unbalanced braces (truncated RTF?)");
    // trailing text without a final \par
    if (segs.some((s) => s.t.trim()))
        endPara(st.pp, "par");
    flushTable();
    let md = joinBlocks(blocks);
    if (footnotes.length)
        md += "\n\n" + footnotes.map((t, k) => `[^${k + 1}]: ${t}`).join("\n");
    if (!md.trim())
        warnings.push("no text found in document");
    return { markdown: md, warnings };
}
