export const newVimState = () => ({ mode: "insert", pending: "", yank: "", undo: [] });
const isW = (ch) => /\w/.test(ch);
function nextWord(l, i) {
    const n = l.length;
    if (i >= n)
        return n;
    if (l[i] !== " ") {
        const w = isW(l[i]);
        while (i < n && l[i] !== " " && isW(l[i]) === w)
            i++;
    }
    while (i < n && l[i] === " ")
        i++;
    return i;
}
function prevWord(l, i) {
    if (i <= 0)
        return 0;
    i--;
    while (i > 0 && l[i] === " ")
        i--;
    const w = isW(l[i]);
    while (i > 0 && l[i - 1] !== " " && isW(l[i - 1]) === w)
        i--;
    return i;
}
function endWord(l, i) {
    const n = l.length;
    if (i >= n - 1)
        return Math.max(0, n - 1);
    i++;
    while (i < n - 1 && l[i] === " ")
        i++;
    const w = isW(l[i]);
    while (i < n - 1 && l[i + 1] !== " " && isW(l[i + 1]) === w)
        i++;
    return i;
}
/** One key in normal mode (or Esc in insert mode). `ch` is the typed character, `name` readline's key name. */
export function vimKey(st, line, cursor, ch, name) {
    const last = Math.max(0, line.length - 1);
    if (st.mode === "insert") {
        if (name === "escape") {
            st.mode = "normal";
            return { line, cursor: Math.max(0, Math.min(cursor - 1, last)) };
        }
        return { line, cursor, action: "passthrough" };
    }
    const save = () => { st.undo.push({ line, cursor }); if (st.undo.length > 50)
        st.undo.shift(); };
    const insert = (l, c) => { st.mode = "insert"; return { line: l, cursor: c }; };
    const key = name === "left" ? "h" : name === "right" ? "l" : name === "up" ? "k" : name === "down" ? "j" : ch;
    if (st.pending) {
        const op = st.pending;
        st.pending = "";
        if (op === "r") {
            if (!key || key.length !== 1 || !line.length)
                return { line, cursor };
            save();
            return { line: line.slice(0, cursor) + key + line.slice(cursor + 1), cursor };
        }
        if (op === "d" || op === "c") {
            let from = cursor, to = cursor;
            if (key === op) {
                from = 0;
                to = line.length;
            }
            else if (key === "w")
                to = op === "c" ? endWord(line, cursor) + 1 : nextWord(line, cursor);
            else if (key === "e")
                to = endWord(line, cursor) + 1;
            else if (key === "b")
                from = prevWord(line, cursor);
            else if (key === "$")
                to = line.length;
            else if (key === "0")
                from = 0;
            else
                return { line, cursor };
            save();
            st.yank = line.slice(from, to);
            const l = line.slice(0, from) + line.slice(to);
            return op === "c" ? insert(l, from) : { line: l, cursor: Math.min(from, Math.max(0, l.length - 1)) };
        }
        return { line, cursor };
    }
    switch (key) {
        case "h": return { line, cursor: Math.max(0, cursor - 1) };
        case "l": return { line, cursor: Math.min(last, cursor + 1) };
        case "0": return { line, cursor: 0 };
        case "^": return { line, cursor: Math.max(0, line.search(/\S/)) };
        case "$": return { line, cursor: last };
        case "w": return { line, cursor: Math.min(last, nextWord(line, cursor)) };
        case "b": return { line, cursor: prevWord(line, cursor) };
        case "e": return { line, cursor: endWord(line, cursor) };
        case "i": return insert(line, cursor);
        case "a": return insert(line, Math.min(line.length, cursor + 1));
        case "I": return insert(line, Math.max(0, line.search(/\S/)));
        case "A": return insert(line, line.length);
        case "x": {
            if (!line.length)
                return { line, cursor };
            save();
            st.yank = line[cursor] ?? "";
            const l = line.slice(0, cursor) + line.slice(cursor + 1);
            return { line: l, cursor: Math.min(cursor, Math.max(0, l.length - 1)) };
        }
        case "X": {
            if (cursor === 0)
                return { line, cursor };
            save();
            st.yank = line[cursor - 1];
            return { line: line.slice(0, cursor - 1) + line.slice(cursor), cursor: cursor - 1 };
        }
        case "D": {
            save();
            st.yank = line.slice(cursor);
            const l = line.slice(0, cursor);
            return { line: l, cursor: Math.max(0, l.length - 1) };
        }
        case "C": {
            save();
            st.yank = line.slice(cursor);
            return insert(line.slice(0, cursor), cursor);
        }
        case "S": {
            save();
            st.yank = line;
            return insert("", 0);
        }
        case "~": {
            if (!line.length)
                return { line, cursor };
            save();
            const c = line[cursor];
            const t = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
            return { line: line.slice(0, cursor) + t + line.slice(cursor + 1), cursor: Math.min(last, cursor + 1) };
        }
        case "p": {
            if (!st.yank)
                return { line, cursor };
            save();
            const at = Math.min(line.length, cursor + 1);
            return { line: line.slice(0, at) + st.yank + line.slice(at), cursor: at + st.yank.length - 1 };
        }
        case "P": {
            if (!st.yank)
                return { line, cursor };
            save();
            return { line: line.slice(0, cursor) + st.yank + line.slice(cursor), cursor: cursor + st.yank.length - 1 };
        }
        case "u": {
            const u = st.undo.pop();
            return u ? { line: u.line, cursor: u.cursor } : { line, cursor };
        }
        case "d":
        case "c":
        case "r":
            st.pending = key;
            return { line, cursor };
        case "k": return { line, cursor, action: "history_prev" };
        case "j": return { line, cursor, action: "history_next" };
        default: return { line, cursor };
    }
}
