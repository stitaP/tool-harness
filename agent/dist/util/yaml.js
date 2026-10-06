/**
 * Minimal YAML subset parser/serializer (zero dependencies).
 *
 * Supports what config files need: nested mappings by indentation, block
 * lists of scalars or mappings, inline `[a, b]` / `{}` collections, quoted and
 * plain scalars, numbers, booleans, null, `#` comments and `|` block strings.
 * Anchors, tags and multi-document streams are intentionally unsupported.
 */
export class YamlError extends Error {
}
function stripComment(s) {
    let inS = false, inD = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "'" && !inD)
            inS = !inS;
        else if (c === '"' && !inS)
            inD = !inD;
        else if (c === "#" && !inS && !inD && (i === 0 || /\s/.test(s[i - 1])))
            return s.slice(0, i);
    }
    return s;
}
function splitInline(s) {
    const out = [];
    let depth = 0, cur = "", inS = false, inD = false;
    for (const c of s) {
        if (c === "'" && !inD)
            inS = !inS;
        if (c === '"' && !inS)
            inD = !inD;
        if (!inS && !inD) {
            if (c === "[" || c === "{")
                depth++;
            if (c === "]" || c === "}")
                depth--;
            if (c === "," && depth === 0) {
                out.push(cur.trim());
                cur = "";
                continue;
            }
        }
        cur += c;
    }
    if (cur.trim())
        out.push(cur.trim());
    return out;
}
export function parseScalar(raw) {
    const s = raw.trim();
    if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL")
        return null;
    if (s === "true" || s === "True" || s === "TRUE" || s === "yes")
        return true;
    if (s === "false" || s === "False" || s === "FALSE" || s === "no")
        return false;
    if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
        try {
            return JSON.parse(s);
        }
        catch {
            return s.slice(1, -1);
        }
    }
    if (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
        return s.slice(1, -1).replace(/''/g, "'");
    if (s.startsWith("[") && s.endsWith("]"))
        return splitInline(s.slice(1, -1)).map(parseScalar);
    if (s.startsWith("{") && s.endsWith("}")) {
        const o = {};
        for (const part of splitInline(s.slice(1, -1))) {
            const i = findKeyColon(part);
            if (i < 0)
                throw new YamlError(`bad inline map entry: ${part}`);
            o[unquoteKey(part.slice(0, i))] = parseScalar(part.slice(i + 1));
        }
        return o;
    }
    if (/^[-+]?\d+$/.test(s))
        return Number(s);
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s))
        return Number(s);
    return s;
}
function unquoteKey(k) {
    const t = k.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
        return t.slice(1, -1);
    return t;
}
/** index of the `:` that separates key and value (followed by space or EOL), outside quotes */
function findKeyColon(s) {
    let inS = false, inD = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "'" && !inD)
            inS = !inS;
        else if (c === '"' && !inS)
            inD = !inD;
        else if (c === ":" && !inS && !inD && (i + 1 === s.length || s[i + 1] === " "))
            return i;
    }
    return -1;
}
export function parseYaml(src) {
    const raw = src.replace(/\r\n/g, "\n").split("\n");
    const lines = [];
    for (let i = 0; i < raw.length; i++) {
        const l = raw[i];
        if (/^\s*(---|\.\.\.)\s*$/.test(l))
            continue;
        const t = stripComment(l);
        if (!t.trim()) {
            lines.push({ indent: -1, text: "", no: i + 1 });
            continue;
        }
        lines.push({ indent: t.length - t.trimStart().length, text: t.trimEnd().trimStart(), no: i + 1 });
    }
    let pos = 0;
    const next = () => { while (pos < lines.length && lines[pos].indent < 0)
        pos++; return lines[pos]; };
    function blockString(parentIndent, folded) {
        const out = [];
        let ind = -1;
        while (pos < lines.length) {
            const rawLine = raw[lines[pos].no - 1];
            const curIndent = rawLine.length - rawLine.trimStart().length;
            if (rawLine.trim() && curIndent <= parentIndent)
                break;
            if (rawLine.trim() && ind < 0)
                ind = curIndent;
            out.push(rawLine.trim() ? rawLine.slice(ind) : "");
            pos++;
        }
        while (out.length && out[out.length - 1] === "")
            out.pop();
        return folded ? out.join(" ") + "\n" : out.join("\n") + "\n";
    }
    function parseNode(indent) {
        const first = next();
        if (!first || first.indent < indent)
            return null;
        if (first.text.startsWith("- ") || first.text === "-")
            return parseList(first.indent);
        return parseMap(first.indent);
    }
    function parseValue(rest, lineIndent) {
        const v = rest.trim();
        if (v === "|" || v === "|-" || v === ">" || v === ">-") {
            const s = blockString(lineIndent, v.startsWith(">"));
            return v.endsWith("-") ? s.replace(/\n$/, "") : s;
        }
        if (v === "") {
            const n = next();
            if (n && n.indent > lineIndent)
                return parseNode(n.indent);
            if (n && n.indent === lineIndent && n.text.startsWith("- "))
                return parseList(n.indent);
            return null;
        }
        return parseScalar(v);
    }
    function parseMap(indent) {
        const obj = {};
        for (;;) {
            const l = next();
            if (!l || l.indent < indent)
                break;
            if (l.indent > indent)
                throw new YamlError(`unexpected indentation at line ${l.no}`);
            if (l.text.startsWith("- "))
                break;
            const i = findKeyColon(l.text);
            if (i < 0)
                throw new YamlError(`expected "key: value" at line ${l.no}: ${l.text}`);
            const key = unquoteKey(l.text.slice(0, i));
            pos++;
            obj[key] = parseValue(l.text.slice(i + 1), indent);
        }
        return obj;
    }
    function parseList(indent) {
        const arr = [];
        for (;;) {
            const l = next();
            if (!l || l.indent !== indent || !(l.text.startsWith("- ") || l.text === "-"))
                break;
            const body = l.text === "-" ? "" : l.text.slice(2);
            pos++;
            if (!body.trim()) {
                arr.push(parseValue("", indent));
                continue;
            }
            const ci = findKeyColon(body);
            const looksMap = ci > 0 && !body.trim().startsWith("[") && !body.trim().startsWith("{") && !/^["']/.test(body.trim());
            if (looksMap) {
                // "- key: v" starts an inline map whose further keys are indented by indent+2
                const childIndent = indent + 2;
                const obj = {};
                obj[unquoteKey(body.slice(0, ci))] = parseValue(body.slice(ci + 1), childIndent);
                const n = next();
                if (n && n.indent === childIndent && !n.text.startsWith("- "))
                    Object.assign(obj, parseMap(childIndent));
                arr.push(obj);
            }
            else {
                arr.push(parseScalar(body));
            }
        }
        return arr;
    }
    const n = next();
    if (!n)
        return {};
    return parseNode(n.indent) ?? {};
}
function needsQuote(s) {
    return s === "" || /^[\s]|[\s]$/.test(s) || /[:#\[\]{},&*!|>'"%@`]/.test(s) ||
        /^(true|false|null|yes|no|~|-?\d+(\.\d+)?)$/i.test(s) || s.startsWith("- ");
}
function scalarOut(v) {
    if (v === null || v === undefined)
        return "null";
    if (typeof v === "boolean" || typeof v === "number")
        return String(v);
    const s = String(v);
    return needsQuote(s) ? JSON.stringify(s) : s;
}
export function stringifyYaml(v, indent = 0) {
    const pad = " ".repeat(indent);
    if (Array.isArray(v)) {
        if (!v.length)
            return "[]";
        return v.map((item) => {
            if (item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length) {
                const inner = stringifyYaml(item, indent + 2).split("\n");
                return `${pad}- ${inner[0].trimStart()}\n${inner.slice(1).join("\n")}`.replace(/\n$/, "");
            }
            return `${pad}- ${typeof item === "object" ? JSON.stringify(item) : scalarOut(item)}`;
        }).join("\n");
    }
    if (v && typeof v === "object") {
        const keys = Object.keys(v);
        if (!keys.length)
            return "{}";
        return keys.map((k) => {
            const val = v[k];
            const key = needsQuote(k) ? JSON.stringify(k) : k;
            if (val && typeof val === "object" && (Array.isArray(val) ? val.length : Object.keys(val).length)) {
                return `${pad}${key}:\n${stringifyYaml(val, indent + 2)}`;
            }
            if (typeof val === "string" && val.includes("\n")) {
                return `${pad}${key}: |\n${val.replace(/\n$/, "").split("\n").map((l) => `${pad}  ${l}`).join("\n")}`;
            }
            return `${pad}${key}: ${Array.isArray(val) ? "[]" : val && typeof val === "object" ? "{}" : scalarOut(val)}`;
        }).join("\n");
    }
    return pad + scalarOut(v);
}
