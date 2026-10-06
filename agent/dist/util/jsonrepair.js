/**
 * Forgiving JSON parsing for tool arguments produced by small models:
 * code fences, single quotes, trailing commas, unquoted keys, Python literals,
 * truncated objects, and plain strings for single-parameter tools.
 */
export function extractJsonBlock(s) {
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    if (fence)
        return fence[1].trim();
    const start = s.search(/[{\[]/);
    if (start < 0)
        return null;
    const open = s[start], close = open === "{" ? "}" : "]";
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (esc)
                esc = false;
            else if (c === "\\")
                esc = true;
            else if (c === '"')
                inStr = false;
            continue;
        }
        if (c === '"')
            inStr = true;
        else if (c === open)
            depth++;
        else if (c === close && --depth === 0)
            return s.slice(start, i + 1);
    }
    return s.slice(start); // truncated — let repair try to close it
}
function closeBrackets(s) {
    const stack = [];
    let inStr = false, esc = false;
    for (const c of s) {
        if (inStr) {
            if (esc)
                esc = false;
            else if (c === "\\")
                esc = true;
            else if (c === '"')
                inStr = false;
            continue;
        }
        if (c === '"')
            inStr = true;
        else if (c === "{")
            stack.push("}");
        else if (c === "[")
            stack.push("]");
        else if (c === "}" || c === "]")
            stack.pop();
    }
    let out = s;
    if (inStr)
        out += '"';
    return out + stack.reverse().join("");
}
export function repairJson(input) {
    let s = input.trim();
    try {
        return JSON.parse(s);
    }
    catch { /* repair */ }
    const block = extractJsonBlock(s);
    if (block)
        s = block;
    try {
        return JSON.parse(s);
    }
    catch { /* continue */ }
    let t = s
        .replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'")
        .replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null")
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, g) => JSON.stringify(g.replace(/\\'/g, "'")))
        .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_\-]*)\s*:/g, '$1"$2":')
        .replace(/,\s*([}\]])/g, "$1");
    try {
        return JSON.parse(t);
    }
    catch { /* continue */ }
    t = closeBrackets(t.replace(/,\s*$/, ""));
    return JSON.parse(t);
}
/**
 * Parse tool arguments. If parsing fails and the tool has exactly one required
 * string parameter, treat the raw text as that parameter's value.
 */
export function parseToolArgs(raw, schema) {
    if (raw && typeof raw === "object")
        return raw;
    const text = (raw ?? "").toString().trim();
    if (!text)
        return {};
    try {
        const v = repairJson(text);
        if (v && typeof v === "object" && !Array.isArray(v))
            return v;
        const only = singleParam(schema);
        if (only)
            return { [only]: v };
    }
    catch { /* fall through */ }
    const only = singleParam(schema);
    if (only)
        return { [only]: text.replace(/^["']|["']$/g, "") };
    throw new Error(`could not parse tool arguments as JSON: ${text.slice(0, 200)}`);
}
function singleParam(schema) {
    const props = schema?.properties ? Object.keys(schema.properties) : [];
    const req = schema?.required ?? [];
    if (req.length === 1)
        return req[0];
    if (props.length === 1)
        return props[0];
    return null;
}
