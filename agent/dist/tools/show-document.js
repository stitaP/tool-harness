/** show_document: open a file the agent made (a design document, report, page, PDF, image) in the user's document viewer. */
import { chatDocuments, fetchDocUrl, isUrl, resolveDoc, showDocument } from "../runtime/documents.js";
import { obj, str } from "./types.js";
export const showDocumentTool = {
    name: "show_document", toolset: "files", tier: "slm",
    description: "Open a file, folder or document link (Google Docs/Sheets too) in the user's document viewer when they ask to see it. No path: list this chat's documents.",
    parameters: obj({ path: str("Path or link") }),
    async handler(a, ctx) {
        const sid = ctx.session.id;
        if (!String(a.path ?? "").trim()) {
            const docs = chatDocuments(ctx.rt, sid);
            return docs.length ? `Documents of this chat (newest first):\n${docs.map((d) => `- ${d.path}`).join("\n")}\nCall show_document with one of these paths to open it.` : "This chat has not made any documents yet.";
        }
        if (isUrl(a.path)) { // Google Docs / Sheets / Slides or a link to a document: check it can be read, then show it
            const r = await fetchDocUrl(ctx.rt, a.path);
            ctx.rt.emitEvent(sid, { type: "open_document", path: r.source });
            return `Opened the ${r.kind} in the chat's document viewer (a copy is at ${r.path}).`;
        }
        const abs = resolveDoc(ctx.rt, sid, a.path);
        return showDocument(ctx.rt, sid, abs, ctx.session.source);
    },
};
