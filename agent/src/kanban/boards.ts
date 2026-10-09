/**
 * Named boards for the kanban tracker.
 *   • many boards, one ACTIVE (the one the UI shows, `import` fills and the workers serve); archived boards are hidden and idle;
 *   • save a board to a JSON file, restore it later as a new board; clearing a board snapshots it first (undo = restore);
 *   • Jira-style typed links between tickets, across boards: "relates to", "blocks", "is blocked by", "duplicates", "clones".
 *     A blocking link is also a scheduling dependency, so a ticket on one board really waits for a ticket on another.
 *     A link may name a ticket that does not exist yet (a future board): it is kept as pending and resolves when that key appears;
 *   • move tickets (an epic takes its tickets along) from one board to another, e.g. carry unfinished work to the next board.
 * Ticket keys are unique across all boards, so a link is just "PT-12".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Runtime } from "../runtime/runtime.js";
import { shortId } from "../util/misc.js";
import type { Card, KanbanBoard } from "./board.js";

export interface BoardInfo { id: string; name: string; description?: string; created_at: number; archived?: boolean; archived_at?: number }
export type LinkType = "relates to" | "blocks" | "is blocked by" | "duplicates" | "clones";
export const LINK_TYPES: LinkType[] = ["relates to", "blocks", "is blocked by", "duplicates", "clones"];
export const LINK_INVERSE: Record<LinkType, string> = { "relates to": "relates to", blocks: "is blocked by", "is blocked by": "blocks", duplicates: "is duplicated by", clones: "is cloned by" };
export interface CardRef { key: string; type: LinkType; at: number; pending?: boolean }
export interface LinkView { type: string; direction: "out" | "in"; key: string; title: string; status: string; board: string | null; boardName: string | null; pending: boolean }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "board";
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

export function normalizeLinkType(t: string): LinkType {
  const x = t.toLowerCase().replace(/[_-]/g, " ").trim();
  const map: Record<string, LinkType> = { relates: "relates to", "relates to": "relates to", relate: "relates to", related: "relates to", blocks: "blocks", block: "blocks", "is blocked by": "is blocked by", "blocked by": "is blocked by", blockedby: "is blocked by", "depends on": "is blocked by",
    duplicates: "duplicates", duplicate: "duplicates", "is duplicated by": "duplicates", clones: "clones", clone: "clones" };
  const r = map[x];
  if (!r) throw new Error(`unknown link type "${t}" (use: ${LINK_TYPES.join(", ")})`);
  return r;
}

export class Boards {
  private inited = false;
  constructor(private rt: Runtime, private K: KanbanBoard) {}

  private get home() { return this.rt.home; }
  private cards(): Card[] { return this.rt.db.listRecords<Card>("kanban"); }
  private putCard(c: Card) { c.updated_at = Date.now(); this.rt.db.putRecord("kanban", c.id, c); }
  private all(): BoardInfo[] { return this.rt.db.listRecords<BoardInfo>("kanban_board"); }

  /** Make sure a default board exists and that every ticket belongs to a board (tickets made before boards existed are adopted). */
  private ensure(): void {
    if (this.inited) return;
    this.inited = true;
    let boards = this.all();
    if (!boards.length) { const b: BoardInfo = { id: "b_main", name: this.rt.cfg.data.kanban.default_board ?? "Main", created_at: Date.now() }; this.rt.db.putRecord("kanban_board", b.id, b); this.rt.db.setMeta("kanban_active", b.id); boards = [b]; }
    const first = boards.find((b) => b.id === this.rt.db.getMeta<string>("kanban_active")) ?? boards.find((b) => !b.archived) ?? boards[0];
    this.rt.db.setMeta("kanban_active", first.id);
    for (const c of this.cards()) if (!c.board) { c.board = first.id; this.rt.db.putRecord("kanban", c.id, c); }
  }

  activeId(): string { this.ensure(); return this.rt.db.getMeta<string>("kanban_active") as string; }
  active(): BoardInfo { return this.get(this.activeId())!; }

  get(ref: string): BoardInfo | null {
    this.ensure();
    if (!ref) return null;
    const all = this.all(), r = ref.trim().toLowerCase();
    return all.find((b) => b.id === ref) ?? all.find((b) => b.name.toLowerCase() === r) ?? all.find((b) => slug(b.name) === slug(ref)) ?? null;
  }
  private need(ref: string): BoardInfo { const b = this.get(ref); if (!b) throw new Error(`no board "${ref}" (boards: ${this.all().map((x) => x.name).join(", ") || "none"})`); return b; }

  list(o: { archived?: boolean | "all" } = {}): (BoardInfo & { cards: number; done: number; active: boolean })[] {
    this.ensure();
    const act = this.activeId(), cards = this.cards().filter((c) => c.type !== "epic");
    return this.all().filter((b) => o.archived === "all" || !!b.archived === !!o.archived).sort((a, b) => a.created_at - b.created_at)
      .map((b) => { const mine = cards.filter((c) => c.board === b.id); return { ...b, cards: mine.length, done: mine.filter((c) => c.status === "done").length, active: b.id === act }; });
  }

  create(name: string, description?: string): BoardInfo {
    this.ensure();
    const n = name.trim();
    if (!n) throw new Error("a board needs a name");
    if (this.get(n)) throw new Error(`a board named "${n}" already exists`);
    const b: BoardInfo = { id: shortId("b_"), name: n, ...(description ? { description } : {}), created_at: Date.now() };
    this.rt.db.putRecord("kanban_board", b.id, b);
    return b;
  }
  /** Make a board the active one: what the UI shows, what import fills and what the workers serve. */
  use(ref: string): BoardInfo {
    const b = this.need(ref);
    if (b.archived) throw new Error(`"${b.name}" is archived: unarchive it first`);
    this.rt.db.setMeta("kanban_active", b.id);
    this.rt.emitEvent("*", { type: "kanban_board", board: b });
    return b;
  }
  rename(ref: string, name: string): BoardInfo {
    const b = this.need(ref), n = name.trim();
    if (!n) throw new Error("a board needs a name");
    const clash = this.get(n); if (clash && clash.id !== b.id) throw new Error(`a board named "${n}" already exists`);
    b.name = n; this.rt.db.putRecord("kanban_board", b.id, b);
    return b;
  }
  archive(ref: string): BoardInfo {
    const b = this.need(ref);
    const busy = this.cards().filter((c) => c.board === b.id && c.status === "running" && this.K.isActive(c.id));
    if (busy.length) throw new Error(`"${b.name}" has ${busy.length} ticket(s) being worked on right now; wait or stop the workers first`);
    b.archived = true; b.archived_at = Date.now(); this.rt.db.putRecord("kanban_board", b.id, b);
    if (this.activeId() === b.id) {   // the active board cannot be archived: hand over to another one (or make a fresh one)
      const next = this.all().find((x) => !x.archived && x.id !== b.id) ?? this.create("Main");
      this.rt.db.setMeta("kanban_active", next.id);
    }
    return b;
  }
  unarchive(ref: string): BoardInfo { const b = this.need(ref); delete b.archived; delete b.archived_at; this.rt.db.putRecord("kanban_board", b.id, b); return b; }

  // ── save / restore / clear ──────────────────────────────────
  private snapshot(b: BoardInfo): { board: BoardInfo; cards: Card[]; saved_at: number; version: 1 } {
    return { version: 1, saved_at: Date.now(), board: b, cards: this.cards().filter((c) => c.board === b.id) };
  }
  /** Write the board to a JSON file (default: <home>/kanban/saved/<name>.json). The board itself stays where it is. */
  save(ref: string, file?: string): string {
    const b = this.need(ref);
    const path = file ?? join(this.home, "kanban", "saved", `${slug(b.name)}.json`);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(this.snapshot(b), null, 1));
    return path;
  }
  /** Load a saved board file as a NEW board. Ticket ids are always new; keys are kept unless they clash, then renumbered. */
  restore(file: string, name?: string): BoardInfo {
    if (!existsSync(file)) throw new Error(`file not found: ${file}`);
    const snap = JSON.parse(readFileSync(file, "utf8"));
    if (!snap || !Array.isArray(snap.cards) || !snap.board) throw new Error("not a saved kanban board");
    let nm = (name ?? snap.board.name ?? "Restored").trim(), i = 2; const base = nm;
    while (this.get(nm)) nm = `${base} (${i++})`;
    const b = this.create(nm, snap.board.description);
    const old: Card[] = snap.cards, idMap = new Map<string, string>(), keyMap = new Map<string, string>();
    const taken = new Set(this.cards().map((c) => (c.key ?? "").toUpperCase()));
    const clash = old.some((c) => c.key && taken.has(c.key.toUpperCase()));
    for (const c of old) idMap.set(c.id, shortId("k_"));
    if (clash) { for (const c of [...old].sort((a, b2) => (a.created_at ?? 0) - (b2.created_at ?? 0))) if (c.key) { const pre = c.key.replace(/-\d+$/, ""); keyMap.set(c.key, this.nextFree(pre, taken)); } }
    const K = (k?: string) => (k ? keyMap.get(k) ?? k : k);
    for (const c of old) {
      const n: Card = { ...c, id: idMap.get(c.id)!, board: b.id, key: K(c.key), parent: K(c.parent), depends_on: (c.depends_on ?? []).map((d) => idMap.get(d)).filter((d): d is string => !!d),
        status: c.status === "running" ? "ready" : c.status, session_id: undefined, updated_at: Date.now() };
      if (c.refs) n.refs = c.refs.map((r) => ({ ...r, key: K(r.key) ?? r.key }));
      if (c.links) n.links = c.links.map((l) => K(l) ?? l);
      this.rt.db.putRecord("kanban", n.id, n);
    }
    return b;
  }
  private nextFree(prefix: string, taken: Set<string>): string {
    const re = new RegExp(`^${prefix}-(\\d+)$`, "i"); let max = 0;
    for (const k of taken) { const m = k.match(re); if (m) max = Math.max(max, Number(m[1])); }
    const key = `${prefix}-${max + 1}`; taken.add(key.toUpperCase()); return key;
  }
  /** Remove every ticket of a board. A snapshot is written first (restore it to undo). */
  clear(ref: string, o: { snapshot?: boolean } = {}): { removed: number; snapshot?: string } {
    const b = this.need(ref);
    const busy = this.cards().filter((c) => c.board === b.id && this.K.isActive(c.id));
    if (busy.length) throw new Error(`"${b.name}" has tickets being worked on right now; stop the workers first`);
    let snap: string | undefined;
    if (o.snapshot !== false) { snap = join(this.home, "kanban", "snapshots", `${slug(b.name)}-${stamp()}.json`); mkdirSync(join(snap, ".."), { recursive: true }); writeFileSync(snap, JSON.stringify(this.snapshot(b), null, 1)); }
    const mine = this.cards().filter((c) => c.board === b.id);
    for (const c of mine) this.K.removeCard(c.id);
    return { removed: mine.length, ...(snap ? { snapshot: snap } : {}) };
  }
  /** Permanently delete a board and its tickets (snapshot first). */
  delete(ref: string): { removed: number; snapshot?: string } {
    const b = this.need(ref);
    if (this.all().length === 1) throw new Error("the last board cannot be deleted; clear it instead");
    const r = this.clear(b.id);
    this.rt.db.deleteRecord("kanban_board", b.id);
    if (this.activeId() === b.id) this.rt.db.setMeta("kanban_active", (this.all().find((x) => !x.archived) ?? this.all()[0]).id);
    return r;
  }

  /** Move tickets to another board. An epic takes its tickets with it. Dependencies and links keep working across boards. */
  move(refs: string[], toRef: string): number {
    const to = this.need(toRef);
    if (to.archived) throw new Error(`"${to.name}" is archived`);
    const ids = new Set<string>();
    for (const r of refs) {
      const c = this.K.get(r); if (!c) throw new Error(`no ticket ${r}`);
      ids.add(c.id);
      if (c.type === "epic") for (const k of this.cards()) if (k.parent === c.key) ids.add(k.id);
    }
    let n = 0;
    for (const id of ids) {
      const c = this.rt.db.getRecord<Card>("kanban", id)!;
      if (c.board === to.id) continue;
      if (this.K.isActive(c.id)) throw new Error(`${c.key} is being worked on right now`);
      const from = this.all().find((b) => b.id === c.board)?.name ?? "?";
      c.comments = [...(c.comments ?? []), { id: shortId("c_"), at: Date.now(), by: "system", text: `Moved from board "${from}" to "${to.name}".` }];
      c.board = to.id; this.putCard(c); n++;
    }
    this.rt.emitEvent("*", { type: "kanban_board", board: to });
    return n;
  }

  // ── links ───────────────────────────────────────────────────
  /** Link a ticket to another, on any board. `to` may be a key that does not exist yet (kept pending until it appears). */
  link(fromRef: string, typeIn: string, toRef: string): CardRef {
    this.ensure();
    const type = normalizeLinkType(typeIn);
    const from = this.K.get(fromRef); if (!from) throw new Error(`no ticket ${fromRef}`);
    const target = this.K.get(toRef);
    const key = (target?.key ?? toRef).trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(key)) throw new Error(`"${toRef}" is not a ticket key (like PT-12)`);
    if (from.key?.toUpperCase() === key) throw new Error("a ticket cannot be linked to itself");
    from.refs = from.refs ?? [];
    let ref = from.refs.find((r) => r.key === key && r.type === type);
    if (!ref) { ref = { key, type, at: Date.now(), ...(target ? {} : { pending: true }) }; from.refs.push(ref); }
    this.putCard(from);
    if (target) this.applyBlocking(from, ref, target);
    return ref;
  }
  unlink(fromRef: string, toRef: string, typeIn?: string): number {
    const from = this.K.get(fromRef); if (!from) throw new Error(`no ticket ${fromRef}`);
    const target = this.K.get(toRef), key = (target?.key ?? toRef).toUpperCase(), type = typeIn ? normalizeLinkType(typeIn) : null;
    const gone = (from.refs ?? []).filter((r) => r.key === key && (!type || r.type === type));
    from.refs = (from.refs ?? []).filter((r) => !gone.includes(r)); this.putCard(from);
    if (target) for (const r of gone) this.releaseBlocking(from, r, target);
    return gone.length;
  }
  /** "is blocked by" / "blocks" are real scheduling dependencies. */
  private applyBlocking(from: Card, ref: CardRef, target: Card) {
    if (ref.type === "is blocked by") { if (!from.depends_on.includes(target.id)) { from.depends_on = [...from.depends_on, target.id]; this.putCard(from); } }
    else if (ref.type === "blocks") { if (!target.depends_on.includes(from.id)) { target.depends_on = [...target.depends_on, from.id]; this.putCard(target); } }
  }
  private releaseBlocking(from: Card, ref: CardRef, target: Card) {
    if (ref.type === "is blocked by") { from.depends_on = from.depends_on.filter((d) => d !== target.id); this.putCard(from); }
    else if (ref.type === "blocks") { target.depends_on = target.depends_on.filter((d) => d !== from.id); this.putCard(target); }
  }
  /** A new ticket may be the target of links made earlier to its (then unknown) key. */
  resolvePending(created: Card): void {
    if (!created.key) return;
    const key = created.key.toUpperCase();
    for (const c of this.cards()) {
      const hit = (c.refs ?? []).filter((r) => r.pending && r.key === key);
      if (!hit.length) continue;
      const fresh = this.rt.db.getRecord<Card>("kanban", c.id)!;
      for (const r of fresh.refs ?? []) if (r.pending && r.key === key) { delete r.pending; this.applyBlocking(fresh, r, created.id === fresh.id ? fresh : this.rt.db.getRecord<Card>("kanban", created.id)!); }
      this.putCard(fresh);
    }
  }
  /** Outgoing links of a ticket plus links other tickets (on any board) make to it. */
  linksOf(card: Card): LinkView[] {
    this.ensure();
    const boards = new Map(this.all().map((b) => [b.id, b.name])), all = this.cards(), byKey = new Map(all.map((c) => [(c.key ?? "").toUpperCase(), c]));
    const out: LinkView[] = [];
    for (const r of card.refs ?? []) {
      const t = byKey.get(r.key);
      out.push({ type: r.type, direction: "out", key: r.key, title: t?.title ?? "(not created yet)", status: t?.status ?? "pending", board: t?.board ?? null, boardName: t?.board ? boards.get(t.board) ?? null : null, pending: !t });
    }
    const me = (card.key ?? "").toUpperCase();
    for (const c of all) for (const r of c.refs ?? []) if (r.key === me && !r.pending) out.push({ type: LINK_INVERSE[r.type], direction: "in", key: c.key ?? c.id, title: c.title, status: c.status, board: c.board ?? null, boardName: c.board ? boards.get(c.board) ?? null : null, pending: false });
    return out;
  }
}
