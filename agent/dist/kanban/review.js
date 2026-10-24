const isPerson = (c) => c.by === "user";
/** A person's comments that have no answer (a reply to them) yet. */
export const openFeedback = (c) => c.comments.filter((x) => isPerson(x) && x.id && !c.comments.some((y) => y.reply_to === x.id));
function story(c) {
    return {
        key: c.key ?? c.id, title: c.title, status: c.status, approved: c.status !== "backlog", locked: !["backlog", "ready"].includes(c.status),
        summary: c.summary ?? "", body: (c.body ?? "").slice(0, 6000), acceptance: c.acceptance ?? [], test_cases: c.test_cases ?? [],
        flags: c.review_flags ?? [], comments: c.comments.map((x) => ({ id: x.id, by: x.by, text: x.text, at: x.at, reply_to: x.reply_to ?? null })),
        open: openFeedback(c).length,
    };
}
export function reviewData(rt, boardRef) {
    const K = rt.kanban;
    // no board named: the active one, unless it has nothing to review and a draft board does
    const drafts = K.boards.list({ archived: false }).filter((b) => b.draft && K.list("backlog", b.id).length);
    const board = (boardRef && K.boards.get(boardRef)) || (!K.list("backlog", K.boards.activeId()).length && drafts[0] ? K.boards.get(drafts[0].id) : K.boards.active());
    const cards = K.list(undefined, board.id);
    const order = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created_at - b.created_at || (a.key ?? "").localeCompare(b.key ?? "", undefined, { numeric: true });
    const epics = cards.filter((c) => c.type === "epic").sort(order);
    const ofEpic = (e) => cards.filter((c) => c.type !== "epic" && (c.parent === e.key || c.parent === e.id)).sort(order);
    const inEpic = new Set(epics.flatMap((e) => ofEpic(e).map((c) => c.id)));
    const loose = cards.filter((c) => c.type !== "epic" && !inEpic.has(c.id)).sort(order);
    const groups = epics.map((e) => ({ ...story(e), stories: ofEpic(e).map(story) }));
    if (loose.length)
        groups.push({ ...story({ id: "", key: "", title: "Not in a main feature", status: "backlog", comments: [], body: "" }), key: "", stories: loose.map(story) });
    const all = groups.flatMap((g) => g.stories);
    return {
        board: { id: board.id, name: board.name, draft: !!board.draft, design: board.design ?? "", active: board.id === K.boards.activeId() },
        boards: K.boards.list({ archived: false }).map((b) => ({ id: b.id, name: b.name, draft: !!b.draft, cards: b.cards })),
        epics: groups,
        counts: { stories: all.length, approved: all.filter((s) => s.approved).length, flagged: all.filter((s) => s.flags.length).length, open: all.reduce((n, s) => n + s.open, 0) + groups.reduce((n, g) => n + g.open, 0) },
    };
}
/** Approve (backlog → ready) or un-approve (ready → backlog) stories; started work is left alone. */
export function setApproval(rt, boardRef, keys, approve) {
    const K = rt.kanban;
    const b = K.boards.get(boardRef);
    if (!b)
        throw new Error(`no board "${boardRef}"`);
    const changed = [];
    if (approve) {
        if (!keys.length)
            return { changed, board: b.name };
        // the board does not become the active one here: that is the reviewer's "Approve & run" choice
        const r = K.boards.approve(b.id, { keys, use: false });
        return { changed: r.approved, board: r.board.name };
    }
    for (const k of keys) {
        const c = K.get(k);
        if (!c || c.board !== b.id || c.type === "epic" || c.status !== "ready")
            continue;
        K.update(c.id, { status: "backlog" }, { by: "user", reason: "approval taken back in review" });
        changed.push(c.key ?? c.id);
    }
    return { changed, board: b.name };
}
/** Start a chat that rewrites the tickets with open feedback and answers each comment; returns its session id. */
export async function applyFeedback(rt, boardRef) {
    const K = rt.kanban;
    const b = K.boards.get(boardRef);
    if (!b)
        throw new Error(`no board "${boardRef}"`);
    const withFb = K.list(undefined, b.id).map((c) => ({ c, fb: openFeedback(c) })).filter((x) => x.fb.length);
    if (!withFb.length)
        throw new Error("there are no unanswered comments on this board");
    const lines = withFb.map(({ c, fb }) => `- ${c.key ?? c.id}${c.type === "epic" ? " (main feature)" : ""} "${c.title}":\n${fb.map((f) => `  - comment ${f.id}: ${f.text.replace(/\n+/g, " ")}`).join("\n")}`);
    const prompt = [
        `I reviewed the stories on the kanban board "${b.name}" and left comments. Apply each comment:`,
        ...lines,
        "",
        `For each ticket: read it (kanban action=show), change it with kanban action=update (title, body, acceptance, test cases) so it does what the comment asks — for a main feature, change the stories under it the comment is about — then answer the comment with kanban action=comment, reply_to = the comment id, saying in one or two sentences what you changed (or why you did not). Use board "${b.name}".`,
        "Do not approve, dispatch or run any ticket, do not create files or write code. When every comment is answered, list the changed tickets.",
    ].join("\n");
    const s = rt.createSession({ source: "web", cwd: K.cwdOf({ board: b.id }) });
    rt.db.updateSession(s.id, { title: `Review: apply comments on ${b.name}` });
    void rt.send(s.id, prompt, { source: "web" });
    return { session: s.id, tickets: withFb.length };
}
