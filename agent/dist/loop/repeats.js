const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** True when two long replies are the same text (ignoring case, punctuation and whitespace) or nearly so. */
export function sameReply(a, b) {
    const x = norm(a), y = norm(b);
    if (x.length < 120 || y.length < 120)
        return false;
    if (x === y)
        return true;
    if (Math.abs(x.length - y.length) / Math.max(x.length, y.length) > 0.15)
        return false;
    const wa = new Set(x.split(" ")), wb = new Set(y.split(" "));
    let inter = 0;
    for (const w of wa)
        if (wb.has(w))
            inter++;
    return inter / Math.max(wa.size, wb.size) >= 0.9;
}
export const REPEAT_PLACEHOLDER = "[repeated an earlier reply word for word — omitted]";
/** History as sent to the model: a long assistant reply that repeats an earlier one becomes a one-line placeholder. */
export function collapseRepeats(msgs) {
    const seen = [];
    return msgs.map((m) => {
        if (m.role !== "assistant" || !m.content || m.content.length < 300)
            return m;
        if (seen.some((s) => sameReply(s, m.content)))
            return { ...m, content: REPEAT_PLACEHOLDER };
        seen.push(m.content);
        return m;
    });
}
