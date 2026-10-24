/**
 * Projects for the kanban tracker: the level above boards.
 *   • a project has a name, a description, any number of named WORKING FOLDERS (one is primary) and any number of boards
 *     (e.g. "PrakritTattva": folders code → ~/x/PrakritTattva-v3, docs → ~/x/Idea_plan; boards "v2" (archived) and "v3");
 *   • a ticket works in: its own cwd, else the project folder it names (`folder: "docs"`), else its board's folder,
 *     else the project's primary folder, else the default;
 *   • the active project is the project of the active board; using a project opens one of its boards;
 *   • archiving a project archives its boards (unarchive brings back the ones it archived); deleting a project keeps its
 *     boards (they become unassigned) unless asked to delete them too, which snapshots each first. Folders on disk are never touched.
 */
import { isAbsolute, resolve, sep } from "node:path";
import { existsSync } from "node:fs";
import type { Runtime } from "../runtime/runtime.js";
import { expandHome } from "../safety/paths.js";
import { shortId } from "../util/misc.js";
import type { BoardInfo } from "./boards.js";
import type { Card, KanbanBoard } from "./board.js";

export interface ProjectFolder { name: string; path: string; primary?: boolean; note?: string }
export interface ProjectInfo { id: string; name: string; description?: string; folders: ProjectFolder[]; created_at: number; updated_at?: number; archived?: boolean; archived_at?: number }
export type ProjectView = ProjectInfo & { boards: { id: string; name: string; archived: boolean; active: boolean; cards: number; done: number }[]; cards: number; done: number; active: boolean };

export const folderPath = (p: string) => { const x = expandHome(String(p ?? "").trim()); if (!x) throw new Error("a folder needs a path"); return isAbsolute(x) ? x : resolve(x); };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const folderName = (s: string) => { const n = String(s ?? "").trim(); if (!/^[A-Za-z0-9][\w.-]{0,40}$/.test(n)) throw new Error(`"${s}" is not a folder name (letters, digits, - _ . ; like code, docs, api)`); return n; };
const inside = (child: string, dir: string) => child === dir || child.startsWith(dir.endsWith(sep) ? dir : dir + sep);

export class Projects {
  constructor(private rt: Runtime, private K: KanbanBoard) {}

  private all(): ProjectInfo[] { return this.rt.db.listRecords<ProjectInfo>("kanban_project").map((p) => ({ ...p, folders: p.folders ?? [] })); }
  private put(p: ProjectInfo): ProjectInfo { p.updated_at = Date.now(); this.rt.db.putRecord("kanban_project", p.id, p); this.rt.emitEvent("*", { type: "kanban_project", project: p }); return p; }
  private boardsRaw(): BoardInfo[] { this.K.boards.activeId(); return this.rt.db.listRecords<BoardInfo>("kanban_board"); }
  private putBoard(b: BoardInfo) { this.rt.db.putRecord("kanban_board", b.id, b); }

  get(ref: string): ProjectInfo | null {
    if (!ref?.trim()) return null;
    const all = this.all(), r = ref.trim().toLowerCase();
    return all.find((p) => p.id === ref) ?? all.find((p) => p.name.toLowerCase() === r) ?? all.find((p) => slug(p.name) === slug(ref)) ?? null;
  }
  need(ref: string): ProjectInfo { const p = this.get(ref); if (!p) throw new Error(`no project "${ref}" (projects: ${this.all().map((x) => x.name).join(", ") || "none"})`); return p; }

  /** Every project with its boards and progress. Archived ones only with archived: true / "all". */
  list(o: { archived?: boolean | "all" } = {}): ProjectView[] {
    return this.all().filter((p) => o.archived === "all" || !!p.archived === !!o.archived).sort((a, b) => a.created_at - b.created_at).map((p) => this.view(p));
  }
  private view(p: ProjectInfo): ProjectView {
    const boards = this.K.boards.list({ archived: "all" }).filter((b) => b.project_id === p.id);
    return { ...p, boards: boards.map((b) => ({ id: b.id, name: b.name, archived: !!b.archived, active: b.active, cards: b.cards, done: b.done })),
      cards: boards.reduce((n, b) => n + b.cards, 0), done: boards.reduce((n, b) => n + b.done, 0), active: boards.some((b) => b.active) };
  }
  /** The project of the active board, if it has one. */
  active(): ProjectInfo | null { const b = this.K.boards.active(); return b?.project_id ? this.all().find((p) => p.id === b.project_id) ?? null : null; }
  /** The project a board belongs to. */
  ofBoard(boardId?: string): ProjectInfo | null {
    const b = boardId ? this.boardsRaw().find((x) => x.id === boardId) : undefined;
    return b?.project_id ? this.all().find((p) => p.id === b.project_id) ?? null : null;
  }
  /** The project that owns a path (the one with the deepest folder containing it). */
  forPath(path: string): ProjectInfo | null {
    const abs = folderPath(path); let best: ProjectInfo | null = null, depth = -1;
    for (const p of this.all()) if (!p.archived) for (const f of p.folders) if (inside(abs, f.path) && f.path.length > depth) { best = p; depth = f.path.length; }
    return best;
  }

  create(name: string, o: { description?: string; folders?: { name: string; path: string; primary?: boolean; note?: string }[]; boards?: string[] } = {}): ProjectInfo {
    const n = String(name ?? "").trim();
    if (!n) throw new Error("a project needs a name");
    if (this.get(n)) throw new Error(`a project named "${n}" already exists`);
    const p: ProjectInfo = { id: shortId("p_"), name: n, ...(o.description ? { description: o.description } : {}), folders: [], created_at: Date.now() };
    for (const f of o.folders ?? []) this.withFolder(p, f);
    this.put(p);
    for (const b of o.boards ?? []) this.attach(b, p.id);
    return this.need(p.id);
  }
  update(ref: string, patch: { name?: string; description?: string }): ProjectInfo {
    const p = this.need(ref);
    if (patch.name !== undefined) {
      const n = patch.name.trim(); if (!n) throw new Error("a project needs a name");
      const clash = this.get(n); if (clash && clash.id !== p.id) throw new Error(`a project named "${n}" already exists`);
      p.name = n;
    }
    if (patch.description !== undefined) { if (patch.description.trim()) p.description = patch.description.trim(); else delete p.description; }
    return this.put(p);
  }

  // ── folders ─────────────────────────────────────────────────
  private withFolder(p: ProjectInfo, f: { name: string; path: string; primary?: boolean; note?: string }) {
    const name = folderName(f.name);
    if (p.folders.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new Error(`"${p.name}" already has a folder named ${name}`);
    const nf: ProjectFolder = { name, path: folderPath(f.path), ...(f.note ? { note: f.note } : {}) };
    if (f.primary || !p.folders.length) { for (const x of p.folders) delete x.primary; nf.primary = true; }
    p.folders.push(nf);
  }
  addFolder(ref: string, f: { name: string; path: string; primary?: boolean; note?: string }): ProjectInfo { const p = this.need(ref); this.withFolder(p, f); return this.put(p); }
  updateFolder(ref: string, name: string, patch: { path?: string; new_name?: string; primary?: boolean; note?: string }): ProjectInfo {
    const p = this.need(ref), f = this.folderOf(p, name);
    if (!f) throw new Error(`"${p.name}" has no folder named ${name} (folders: ${p.folders.map((x) => x.name).join(", ") || "none"})`);
    if (patch.new_name !== undefined && patch.new_name !== f.name) {
      const nn = folderName(patch.new_name);
      if (p.folders.some((x) => x !== f && x.name.toLowerCase() === nn.toLowerCase())) throw new Error(`"${p.name}" already has a folder named ${nn}`);
      for (const c of this.cardsOf(p)) if (c.folder?.toLowerCase() === f.name.toLowerCase()) this.K.update(c.id, { folder: nn }, { by: "user", reason: `folder renamed to ${nn}` });
      f.name = nn;
    }
    if (patch.path !== undefined) f.path = folderPath(patch.path);
    if (patch.note !== undefined) { if (patch.note.trim()) f.note = patch.note.trim(); else delete f.note; }
    if (patch.primary) { for (const x of p.folders) delete x.primary; f.primary = true; }
    return this.put(p);
  }
  /** Remove a folder from the project (the folder on disk stays). Refused while tickets still name it. */
  removeFolder(ref: string, name: string): ProjectInfo {
    const p = this.need(ref), f = this.folderOf(p, name);
    if (!f) throw new Error(`"${p.name}" has no folder named ${name}`);
    const users = this.cardsOf(p).filter((c) => c.folder?.toLowerCase() === f.name.toLowerCase());
    if (users.length) throw new Error(`${users.length} ticket(s) work in ${f.name} (${users.slice(0, 6).map((c) => c.key).join(", ")}); move them to another folder first`);
    p.folders = p.folders.filter((x) => x !== f);
    if (f.primary && p.folders.length) p.folders[0].primary = true;
    return this.put(p);
  }
  private folderOf(p: ProjectInfo, name?: string): ProjectFolder | undefined { const n = (name ?? "").trim().toLowerCase(); return n ? p.folders.find((x) => x.name.toLowerCase() === n) : undefined; }
  primary(p: ProjectInfo | null): ProjectFolder | undefined { return p ? p.folders.find((f) => f.primary) ?? p.folders[0] : undefined; }
  /** Path of a named folder of the project a board belongs to (undefined when either is missing). */
  folderFor(boardId: string | undefined, name: string | undefined): string | undefined { return name ? this.folderOf(this.ofBoard(boardId) ?? ({ folders: [] } as any), name)?.path : undefined; }
  /** Check a ticket's folder name against its board's project; returns the canonical name. */
  checkFolder(boardId: string | undefined, name: string): string {
    const p = this.ofBoard(boardId);
    if (!p) throw new Error(`folder "${name}" needs a board that belongs to a project (kanban action=board_update project_name=…)`);
    const f = this.folderOf(p, name);
    if (!f) throw new Error(`project "${p.name}" has no folder named ${name} (folders: ${p.folders.map((x) => x.name).join(", ") || "none"})`);
    return f.name;
  }

  // ── boards ──────────────────────────────────────────────────
  /** Put a board in a project (projectRef "" takes it out). */
  attach(boardRef: string, projectRef: string): BoardInfo {
    const b = this.K.boards.get(boardRef); if (!b) throw new Error(`no board "${boardRef}"`);
    const n: BoardInfo = { ...b };
    if (projectRef.trim()) { const p = this.need(projectRef); if (p.archived) throw new Error(`project "${p.name}" is archived`); n.project_id = p.id; } else delete n.project_id;
    this.putBoard(n);
    this.rt.emitEvent("*", { type: "kanban_board", board: n });
    return n;
  }
  /** Make a project active: open its active board, else its newest unarchived board, else a new board named after it. */
  use(ref: string): { project: ProjectInfo; board: BoardInfo } {
    const p = this.need(ref);
    if (p.archived) throw new Error(`project "${p.name}" is archived: unarchive it first`);
    const mine = this.boardsRaw().filter((b) => b.project_id === p.id && !b.archived).sort((a, b) => b.created_at - a.created_at);
    const cur = this.K.boards.active();
    let board = mine.find((b) => b.id === cur.id) ?? mine[0];
    if (!board) { board = this.K.boards.create(this.K.boards.get(p.name) ? `${p.name} board` : p.name); board = this.attach(board.id, p.id); }
    return { project: p, board: this.K.boards.use(board.id) };
  }
  archive(ref: string): ProjectInfo {
    const p = this.need(ref);
    const mine = this.boardsRaw().filter((b) => b.project_id === p.id && !b.archived);
    for (const b of mine) { this.K.boards.archive(b.id); const x = this.boardsRaw().find((y) => y.id === b.id)!; this.putBoard({ ...x, archived_by_project: true }); }
    p.archived = true; p.archived_at = Date.now();
    return this.put(p);
  }
  unarchive(ref: string): ProjectInfo {
    const p = this.need(ref);
    for (const b of this.boardsRaw().filter((x) => x.project_id === p.id && x.archived_by_project)) { const n: BoardInfo = { ...b }; delete n.archived; delete n.archived_at; delete n.archived_by_project; this.putBoard(n); }
    delete p.archived; delete p.archived_at;
    return this.put(p);
  }
  /** Delete the project record. Its boards stay (unassigned) unless deleteBoards, which deletes each with a snapshot. */
  delete(ref: string, o: { deleteBoards?: boolean } = {}): { boards: string[]; snapshots: string[] } {
    const p = this.need(ref);
    const mine = this.boardsRaw().filter((b) => b.project_id === p.id);
    const snapshots: string[] = [];
    for (const b of mine) {
      if (o.deleteBoards && this.boardsRaw().length > 1) { const r = this.K.boards.delete(b.id); if (r.snapshot) snapshots.push(r.snapshot); }
      else { const n: BoardInfo = { ...b }; delete n.project_id; delete n.archived_by_project; this.putBoard(n); }
    }
    this.rt.db.deleteRecord("kanban_project", p.id);
    this.rt.emitEvent("*", { type: "kanban_project", project: { ...p, deleted: true } });
    return { boards: mine.map((b) => b.name), snapshots };
  }

  private cardsOf(p: ProjectInfo): Card[] { const ids = new Set(this.boardsRaw().filter((b) => b.project_id === p.id).map((b) => b.id)); return this.K.listAll().filter((c) => c.board && ids.has(c.board)); }

  // ── text ────────────────────────────────────────────────────
  show(ref: string): string {
    const v = this.view(this.need(ref));
    return [`Project: ${v.name}${v.archived ? " (archived)" : ""}${v.active ? " ▶ active" : ""} — ${v.done}/${v.cards} tickets done`, v.description ? v.description : "",
      `Folders:${v.folders.length ? "" : " (none: tickets use their board's folder or the default)"}`, ...v.folders.map((f) => `  ${f.primary ? "★" : "-"} ${f.name}: ${f.path}${existsSync(f.path) ? "" : " (missing on disk)"}${f.note ? ` — ${f.note}` : ""}`),
      `Boards:${v.boards.length ? "" : " (none yet: project_use makes one)"}`, ...v.boards.map((b) => `  ${b.active ? "▶" : "-"} ${b.name}${b.archived ? " (archived)" : ""} — ${b.done}/${b.cards} done`)].filter(Boolean).join("\n");
  }
  describe(): string {
    const l = this.list({ archived: "all" });
    const loose = this.K.boards.list({ archived: "all" }).filter((b) => !b.project_id || !l.some((p) => p.id === b.project_id));
    const lines = l.map((p) => `${p.active ? "▶" : " "} ${p.name}${p.archived ? " (archived)" : ""} — ${p.boards.length} board(s), ${p.done}/${p.cards} tickets done — folders: ${p.folders.map((f) => `${f.primary ? "★" : ""}${f.name}=${f.path}`).join(", ") || "none"}`);
    if (loose.length) lines.push(`  (no project) boards: ${loose.map((b) => `${b.name}${b.archived ? " (archived)" : ""}`).join(", ")}`);
    return lines.join("\n") || "No projects yet. Create one with project_new (name, path = main folder).";
  }
}
