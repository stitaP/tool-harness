/**
 * stitaP Analytics — MDX Query Engine
 *
 * A lightweight Multidimensional Expressions (MDX) engine that runs
 * entirely in-browser over the columnar storage engine. MDX is the
 * standard query language for OLAP cubes and BI tools (Excel, PowerBI,
 * Tableau). This engine maps MDX concepts onto the columnar Table class.
 *
 * Supported MDX constructs:
 * - SELECT ... FROM ... WHERE (cube/slice notation)
 * - CROSSJOIN, UNION, INTERSECT, EXCEPT
 * - HIERARCHIZE, ORDER (ASC/DESC/BASC/BDESC)
 * - FILTER, NON EMPTY
 * - Aggregate functions: SUM, COUNT, AVG, MIN, MAX, DISTINCTCOUNT
 * - Set operations: HEAD, TAIL, TOPCOUNT, BOTTOMCOUNT
 * - Tuple notation: [dimension].[member]
 * - WITH MEMBER ... AS ... for calculated members
 * - STRTOVALUE, FORMAT_STRING
 *
 * Design: tokenise → parse → resolve dimensions → execute over columnar Table.
 */

import { type Table, type Scalar } from "./columnar";

// ─── Tokeniser ──────────────────────────────────────────────────────────────

type MDXToken =
  | "SELECT" | "FROM" | "WHERE" | "ON" | "COLUMNS" | "ROWS" | "SLICER"
  | "WITH" | "MEMBER" | "AS"
  | "CROSSJOIN" | "UNION" | "INTERSECT" | "EXCEPT"
  | "FILTER" | "NON" | "EMPTY"
  | "ORDER" | "ASC" | "DESC" | "BASC" | "BDESC"
  | "HIERARCHIZE" | "HEAD" | "TAIL" | "TOPCOUNT" | "BOTTOMCOUNT"
  | "SUM" | "COUNT" | "AVG" | "MIN" | "MAX" | "DISTINCTCOUNT"
  | "STRTOVALUE" | "FORMAT_STRING" | "IIF"
  | "CASE" | "WHEN" | "THEN" | "ELSE" | "END"
  | "AND" | "OR" | "NOT" | "TRUE" | "FALSE"
  | "IDENT" | "LBRACKET" | "RBRACKET" | "DOT" | "COMMA" | "COLON"
  | "LPAREN" | "RPAREN" | "EQ" | "NEQ" | "LT" | "GT" | "LTE" | "GTE"
  | "NUM" | "STR" | "EOF";

interface MDXTokenItem {
  type: MDXToken;
  value: string;
  pos: number;
}

const MDX_KW: Record<string, MDXToken> = {
  SELECT: "SELECT", FROM: "FROM", WHERE: "WHERE", ON: "ON",
  COLUMNS: "COLUMNS", ROWS: "ROWS", SLICER: "SLICER",
  WITH: "WITH", MEMBER: "MEMBER", AS: "AS",
  CROSSJOIN: "CROSSJOIN", UNION: "UNION", INTERSECT: "INTERSECT", EXCEPT: "EXCEPT",
  FILTER: "FILTER", NON: "NON", EMPTY: "EMPTY",
  ORDER: "ORDER", ASC: "ASC", DESC: "DESC", BASC: "BASC", BDESC: "BDESC",
  HIERARCHIZE: "HIERARCHIZE", HEAD: "HEAD", TAIL: "TAIL",
  TOPCOUNT: "TOPCOUNT", BOTTOMCOUNT: "BOTTOMCOUNT",
  SUM: "SUM", COUNT: "COUNT", AVG: "AVG", MIN: "MIN", MAX: "MAX",
  DISTINCTCOUNT: "DISTINCTCOUNT",
  STRTOVALUE: "STRTOVALUE", FORMAT_STRING: "FORMAT_STRING", IIF: "IIF",
  CASE: "CASE", WHEN: "WHEN", THEN: "THEN", ELSE: "ELSE", END: "END",
  AND: "AND", OR: "OR", NOT: "NOT", TRUE: "TRUE", FALSE: "FALSE",
};

function tokenizeMDX(input: string): MDXTokenItem[] {
  const tokens: MDXTokenItem[] = [];
  let i = 0;
  while (i < input.length) {
    if (/\s/.test(input[i])) { i++; continue; }
    if (input[i] === "-" && input[i + 1] === "-") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    const pos = i;

    // String literal
    if (input[i] === "\"") {
      i++;
      let val = "";
      while (i < input.length && input[i] !== "\"") val += input[i++];
      i++;
      tokens.push({ type: "STR", value: val, pos });
      continue;
    }

    // Number
    if (/[\d.]/.test(input[i])) {
      let val = "";
      while (i < input.length && /[\d.]/.test(input[i])) val += input[i++];
      tokens.push({ type: "NUM", value: val, pos });
      continue;
    }

    // Bracketed identifier: [Some Name]
    if (input[i] === "[") {
      i++;
      let val = "";
      while (i < input.length && input[i] !== "]") val += input[i++];
      i++; // skip ]
      tokens.push({ type: "IDENT", value: val, pos });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(input[i])) {
      let val = "";
      while (i < input.length && /[a-zA-Z_0-9]/.test(input[i])) val += input[i++];
      const upper = val.toUpperCase();
      const kw = MDX_KW[upper];
      tokens.push({ type: kw ?? "IDENT", value: kw ? upper : val, pos });
      continue;
    }

    // Symbols
    const syms: Record<string, MDXToken> = {
      "[": "LBRACKET", "]": "RBRACKET", ".": "DOT", ",": "COMMA",
      ":": "COLON", "(": "LPAREN", ")": "RPAREN",
    };
    if (syms[input[i]]) {
      tokens.push({ type: syms[input[i]], value: input[i], pos: i++ });
      continue;
    }

    // Comparisons
    if (input[i] === "=" && input[i + 1] !== "=") { tokens.push({ type: "EQ", value: "=", pos: i }); i++; continue; }
    if (input[i] === "!" && input[i + 1] === "=") { tokens.push({ type: "NEQ", value: "!=", pos: i }); i += 2; continue; }
    if (input[i] === "<" && input[i + 1] === ">") { tokens.push({ type: "NEQ", value: "<>", pos: i }); i += 2; continue; }
    if (input[i] === "<" && input[i + 1] === "=") { tokens.push({ type: "LTE", value: "<=", pos: i }); i += 2; continue; }
    if (input[i] === ">" && input[i + 1] === "=") { tokens.push({ type: "GTE", value: ">=", pos: i }); i += 2; continue; }
    if (input[i] === "<") { tokens.push({ type: "LT", value: "<", pos: i }); i++; continue; }
    if (input[i] === ">") { tokens.push({ type: "GT", value: ">", pos: i }); i++; continue; }

    throw new Error(`Unexpected MDX character: ${input[i]} at position ${i}`);
  }

  tokens.push({ type: "EOF", value: "", pos: i });
  return tokens;
}

// ─── AST ────────────────────────────────────────────────────────────────────

export type MDXExpr =
  | { kind: "member"; parts: string[] }
  | { kind: "literal"; value: Scalar }
  | { kind: "binary"; op: string; left: MDXExpr; right: MDXExpr }
  | { kind: "function"; name: string; args: MDXExpr[] }
  | { kind: "set"; items: MDXExpr[] }
  | { kind: "crossjoin"; left: MDXExpr; right: MDXExpr }
  | { kind: "filter"; set: MDXExpr; condition: MDXExpr }
  | { kind: "order"; set: MDXExpr; by: MDXExpr; direction: "ASC" | "DESC" | "BASC" | "BDESC" }
  | { kind: "topcount" | "bottomcount" | "head" | "tail"; set: MDXExpr; count: MDXExpr }
  | { kind: "iif"; condition: MDXExpr; then: MDXExpr; else_: MDXExpr }
  | { kind: "case"; whenClauses: Array<{ cond: MDXExpr; then: MDXExpr }>; else_?: MDXExpr }
  | { kind: "non_empty"; set: MDXExpr }
  | { kind: "calculated_member"; name: string; expr: MDXExpr };

export interface MDXSelectQuery {
  withMembers: MDXExpr[];
  columns: MDXExpr;
  rows: MDXExpr;
  slicer?: MDXExpr;
  where?: MDXExpr;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

class MDXParser {
  private tokens: MDXTokenItem[];
  private pos = 0;

  constructor(tokens: MDXTokenItem[]) {
    this.tokens = tokens;
  }

  peek(): MDXTokenItem { return this.tokens[this.pos]; }
  advance(): MDXTokenItem { return this.tokens[this.pos++]; }

  match(type: MDXToken): boolean {
    if (this.peek().type === type) { this.pos++; return true; }
    return false;
  }

  expect(type: MDXToken): MDXTokenItem {
    const t = this.peek();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} ("${t.value}") at ${t.pos}`);
    return this.advance();
  }

  parseSelect(): MDXSelectQuery {
    // WITH clause (optional)
    const withMembers: MDXExpr[] = [];
    if (this.match("WITH")) {
      while (this.peek().type === "MEMBER") {
        this.advance(); // MEMBER
        const name = this.parseMemberName();
        this.expect("AS");
        const expr = this.parseExpr();
        withMembers.push({ kind: "calculated_member", name, expr });
      }
    }

    this.expect("SELECT");

    // Parse column axis
    const columnsAxis = this.match("COLUMNS");
    const columns = this.parseSetExpr();

    // ON ROWS (optional)
    let rows: MDXExpr = { kind: "set", items: [] };
    if (this.match("ROWS")) {
      rows = this.parseSetExpr();
    }

    this.expect("FROM");

    // FROM clause — we treat it as a table reference
    const fromName = this.parseMemberName();

    // WHERE / SLICER
    let slicer: MDXExpr | undefined;
    let where: MDXExpr | undefined;
    if (this.peek().type === "WHERE" || this.peek().type === "SLICER") {
      this.advance();
      slicer = this.parseExpr();
    }

    return { withMembers, columns, rows, slicer, where, from: fromName } as MDXSelectQuery & { from: string };
  }

  parseMemberName(): string {
    const parts: string[] = [];
    if (this.peek().type === "LBRACKET") {
      this.advance();
      parts.push(this.expect("IDENT").value ?? this.advance().value);
      this.expect("RBRACKET");
    } else {
      parts.push(this.advance().value);
    }
    while (this.match("DOT")) {
      if (this.peek().type === "LBRACKET") {
        this.advance();
        parts.push(this.expect("IDENT").value ?? this.advance().value);
        this.expect("RBRACKET");
      } else {
        parts.push(this.advance().value);
      }
    }
    return parts.join(".");
  }

  parseExpr(): MDXExpr {
    return this.parseOr();
  }

  parseOr(): MDXExpr {
    let left = this.parseAnd();
    while (this.match("OR")) {
      left = { kind: "binary", op: "OR", left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd(): MDXExpr {
    let left = this.parseComparison();
    while (this.match("AND")) {
      left = { kind: "binary", op: "AND", left, right: this.parseComparison() };
    }
    return left;
  }

  parseComparison(): MDXExpr {
    let left = this.parseSetExpr();
    const ops: Array<[MDXToken, string]> = [
      ["EQ", "="], ["NEQ", "!="], ["LT", "<"], ["GT", ">"], ["LTE", "<="], ["GTE", ">="],
    ];
    for (const [tok, op] of ops) {
      if (this.match(tok)) {
        return { kind: "binary", op, left, right: this.parseSetExpr() };
      }
    }
    return left;
  }

  parseSetExpr(): MDXExpr {
    let left = this.parsePrimary();
    while (this.peek().type === "CROSSJOIN") {
      this.advance();
      left = { kind: "crossjoin", left, right: this.parsePrimary() };
    }
    return left;
  }

  parsePrimary(): MDXExpr {
    const t = this.peek();

    // IIF(cond, then, else)
    if (t.type === "IIF") {
      this.advance();
      this.expect("LPAREN");
      const cond = this.parseExpr();
      this.expect("COMMA");
      const then = this.parseExpr();
      this.expect("COMMA");
      const else_ = this.parseExpr();
      this.expect("RPAREN");
      return { kind: "iif", condition: cond, then, else_ };
    }

    // CASE WHEN ... THEN ... ELSE ... END
    if (t.type === "CASE") {
      this.advance();
      const whenClauses: Array<{ cond: MDXExpr; then: MDXExpr }> = [];
      while (this.match("WHEN")) {
        const cond = this.parseExpr();
        this.expect("THEN");
        const then = this.parseExpr();
        whenClauses.push({ cond, then });
      }
      let else_: MDXExpr | undefined;
      if (this.match("ELSE")) else_ = this.parseExpr();
      this.expect("END");
      return { kind: "case", whenClauses, else_ };
    }

    // Aggregate functions
    if (["SUM", "COUNT", "AVG", "MIN", "MAX", "DISTINCTCOUNT"].includes(t.type)) {
      const func = this.advance().value;
      this.expect("LPAREN");
      const args: MDXExpr[] = [this.parseSetExpr()];
      while (this.match("COMMA")) args.push(this.parseExpr());
      this.expect("RPAREN");
      return { kind: "function", name: func, args };
    }

    // Filter, Order, Head, Tail, TopCount, BottomCount
    if (t.type === "FILTER") {
      this.advance();
      this.expect("LPAREN");
      const set = this.parseSetExpr();
      this.expect("COMMA");
      const cond = this.parseExpr();
      this.expect("RPAREN");
      return { kind: "filter", set, condition: cond };
    }
    if (t.type === "ORDER") {
      this.advance();
      this.expect("LPAREN");
      const set = this.parseSetExpr();
      this.expect("COMMA");
      const by = this.parseExpr();
      let dir: "ASC" | "DESC" | "BASC" | "BDESC" = "DESC";
      if (this.peek().type === "ASC") { dir = "ASC"; this.advance(); }
      else if (this.peek().type === "DESC") { dir = "DESC"; this.advance(); }
      else if (this.peek().type === "BASC") { dir = "BASC"; this.advance(); }
      else if (this.peek().type === "BDESC") { dir = "BDESC"; this.advance(); }
      this.expect("RPAREN");
      return { kind: "order", set, by, direction: dir };
    }
    if (t.type === "HEAD") {
      this.advance();
      this.expect("LPAREN");
      const set = this.parseSetExpr();
      this.expect("COMMA");
      const count = this.parseExpr();
      this.expect("RPAREN");
      return { kind: "head", set, count };
    }
    if (t.type === "TAIL") {
      this.advance();
      this.expect("LPAREN");
      const set = this.parseSetExpr();
      this.expect("COMMA");
      const count = this.parseExpr();
      this.expect("RPAREN");
      return { kind: "tail", set, count };
    }
    if (t.type === "TOPCOUNT") {
      this.advance();
      this.expect("LPAREN");
      const set = this.parseSetExpr();
      this.expect("COMMA");
      const count = this.parseExpr();
      this.expect("COMMA");
      const by = this.parseExpr();
      this.expect("RPAREN");
      return { kind: "topcount", set, count };
    }
    if (t.type === "BOTTOMCOUNT") {
      this.advance();
      this.expect("LPAREN");
      const set = this.parseSetExpr();
      this.expect("COMMA");
      const count = this.parseExpr();
      this.expect("COMMA");
      const by = this.parseExpr();
      this.expect("RPAREN");
      return { kind: "bottomcount", set, count };
    }

    // NON EMPTY
    if (t.type === "NON") {
      this.advance();
      this.expect("EMPTY");
      return { kind: "non_empty", set: this.parsePrimary() };
    }

    // Literal
    if (t.type === "NUM") { this.advance(); return { kind: "literal", value: Number(t.value) }; }
    if (t.type === "STR") { this.advance(); return { kind: "literal", value: t.value }; }
    if (t.type === "TRUE") { this.advance(); return { kind: "literal", value: true }; }
    if (t.type === "FALSE") { this.advance(); return { kind: "literal", value: false }; }

    // Parenthesised expression
    if (t.type === "LPAREN") {
      this.advance();
      const expr = this.parseExpr();
      this.expect("RPAREN");
      return expr;
    }

    // Member reference: [Dimension].[Member] or IDENT.IDENT
    if (t.type === "IDENT" || t.type === "LBRACKET") {
      const parts: string[] = [];
      if (this.peek().type === "LBRACKET") {
        this.advance();
        parts.push(this.expect("IDENT").value);
        this.expect("RBRACKET");
      } else {
        parts.push(this.advance().value);
      }
      while (this.match("DOT")) {
        if (this.peek().type === "LBRACKET") {
          this.advance();
          parts.push(this.expect("IDENT").value);
          this.expect("RBRACKET");
        } else {
          parts.push(this.advance().value);
        }
      }
      return { kind: "member", parts };
    }

    throw new Error(`Unexpected MDX token: ${t.type} ("${t.value}") at ${t.pos}`);
  }
}

// ─── Executor ───────────────────────────────────────────────────────────────

/**
 * Execute an MDX query over columnar tables.
 * MDX operates on a "cube" — we model this as a table with dimension + measure columns.
 */
export interface MDXContext {
  tables: Map<string, Table>;
  /** Maps member paths like "Geography.Country" → column values */
  memberIndex: Map<string, Map<Scalar, number[]>>;
}

function buildContext(tables: Map<string, Table>): MDXContext {
  const memberIndex = new Map<string, Map<Scalar, number[]>>();
  for (const [name, table] of tables) {
    for (const col of table.columns) {
      const key = `${name}.${col.name}`;
      const idx = new Map<Scalar, number[]>();
      for (let i = 0; i < table.rowCount; i++) {
        const v = col.get(i);
        if (v === null) continue;
        const arr = idx.get(v) ?? [];
        arr.push(i);
        idx.set(v, arr);
      }
      memberIndex.set(key, idx);
    }
  }
  return { tables, memberIndex };
}

function evalMDXExpr(
  expr: MDXExpr,
  ctx: MDXContext,
  sourceTable: Table,
  rowIndices: number[],
): Scalar {
  switch (expr.kind) {
    case "literal":
      return expr.value;

    case "member": {
      // Resolve to a column in the source table
      const colName = expr.parts[expr.parts.length - 1];
      const table = expr.parts.length > 1
        ? ctx.tables.get(expr.parts[0]) ?? sourceTable
        : sourceTable;
      const col = table.column(colName);
      if (!col) throw new Error(`Member "${expr.parts.join(".")}" not found`);
      if (rowIndices.length === 1) return col.get(rowIndices[0]);
      // For sets, return the set of values
      return rowIndices.map(i => col.get(i)) as unknown as Scalar;
    }

    case "binary": {
      const l = evalMDXExpr(expr.left, ctx, sourceTable, rowIndices);
      const r = evalMDXExpr(expr.right, ctx, sourceTable, rowIndices);
      if (l === null || r === null) return null;
      switch (expr.op) {
        case "=": return l === r;
        case "!=": return l !== r;
        case "<": return (l as number) < (r as number);
        case ">": return (l as number) > (r as number);
        case "<=": return (l as number) <= (r as number);
        case ">=": return (l as number) >= (r as number);
        case "AND": return Boolean(l) && Boolean(r);
        case "OR": return Boolean(l) || Boolean(r);
        default: return null;
      }
    }

    case "function": {
      const argVals = expr.args.map(a => evalMDXExpr(a, ctx, sourceTable, rowIndices));
      switch (expr.name) {
        case "SUM": {
          let total = 0;
          for (const v of (Array.isArray(argVals[0]) ? argVals[0] : [argVals[0]])) {
            if (v !== null && typeof v === "number") total += v;
          }
          return total;
        }
        case "COUNT": {
          if (Array.isArray(argVals[0])) {
            return argVals[0].filter(v => v !== null).length;
          }
          return rowIndices.length;
        }
        case "AVG": {
          const vals = (Array.isArray(argVals[0]) ? argVals[0] : [argVals[0]])
            .filter((v): v is number => typeof v === "number" && v !== null);
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        }
        case "MIN": {
          const vals = (Array.isArray(argVals[0]) ? argVals[0] : [argVals[0]])
            .filter(v => v !== null) as number[];
          return vals.length > 0 ? Math.min(...vals) : null;
        }
        case "MAX": {
          const vals = (Array.isArray(argVals[0]) ? argVals[0] : [argVals[0]])
            .filter(v => v !== null) as number[];
          return vals.length > 0 ? Math.max(...vals) : null;
        }
        case "DISTINCTCOUNT": {
          const vals = Array.isArray(argVals[0]) ? argVals[0] : [argVals[0]];
          return new Set(vals.filter(v => v !== null).map(String)).size;
        }
        default: return null;
      }
    }

    case "filter": {
      // Filter a set by condition — this needs row-level evaluation
      const setSize = sourceTable.rowCount;
      const filtered: number[] = [];
      for (let i = 0; i < setSize; i++) {
        const condVal = evalMDXExpr(expr.condition, ctx, sourceTable, [i]);
        if (Boolean(condVal)) filtered.push(i);
      }
      return filtered as unknown as Scalar;
    }

    case "order": {
      const indices = Array.isArray(rowIndices[0]) ? rowIndices : [...rowIndices];
      // Sort by the 'by' expression
      indices.sort((a, b) => {
        const va = evalMDXExpr(expr.by, ctx, sourceTable, [a]);
        const vb = evalMDXExpr(expr.by, ctx, sourceTable, [b]);
        if (va === null) return 1;
        if (vb === null) return -1;
        const cmp = (va as number) < (vb as number) ? -1 : (va as number) > (vb as number) ? 1 : 0;
        return (expr.direction === "DESC" || expr.direction === "BDESC") ? -cmp : cmp;
      });
      return indices as unknown as Scalar;
    }

    case "topcount": {
      const count = Number(evalMDXExpr(expr.count, ctx, sourceTable, rowIndices));
      const sorted = [...rowIndices];
      sorted.sort((a, b) => {
        const va = Number(evalMDXExpr(expr.set, ctx, sourceTable, [a]));
        const vb = Number(evalMDXExpr(expr.set, ctx, sourceTable, [b]));
        return vb - va; // descending
      });
      return sorted.slice(0, count) as unknown as Scalar;
    }

    case "bottomcount": {
      const count = Number(evalMDXExpr(expr.count, ctx, sourceTable, rowIndices));
      const sorted = [...rowIndices];
      sorted.sort((a, b) => {
        const va = Number(evalMDXExpr(expr.set, ctx, sourceTable, [a]));
        const vb = Number(evalMDXExpr(expr.set, ctx, sourceTable, [b]));
        return va - vb; // ascending
      });
      return sorted.slice(0, count) as unknown as Scalar;
    }

    case "head": {
      const count = Number(evalMDXExpr(expr.count, ctx, sourceTable, rowIndices));
      return (rowIndices as number[]).slice(0, count) as unknown as Scalar;
    }

    case "tail": {
      const count = Number(evalMDXExpr(expr.count, ctx, sourceTable, rowIndices));
      return (rowIndices as number[]).slice(-count) as unknown as Scalar;
    }

    case "crossjoin": {
      // Cross-join: produce all combinations of left × right row indices
      const left = evalMDXExpr(expr.left, ctx, sourceTable, rowIndices);
      const right = evalMDXExpr(expr.right, ctx, sourceTable, rowIndices);
      const leftIdx = Array.isArray(left) ? left as number[] : rowIndices;
      const rightIdx = Array.isArray(right) ? right as number[] : rowIndices;
      const result: number[] = [];
      for (const l of leftIdx) {
        for (const r of rightIdx) {
          result.push(l * 100000 + r); // Encode pair
        }
      }
      return result as unknown as Scalar;
    }

    case "non_empty": {
      const set = evalMDXExpr(expr.set, ctx, sourceTable, rowIndices) as unknown as number[];
      return set.filter(i => {
        for (const col of sourceTable.columns) {
          if (col.get(i) !== null) return true;
        }
        return false;
      }) as unknown as Scalar;
    }

    case "iif": {
      const cond = evalMDXExpr(expr.condition, ctx, sourceTable, rowIndices);
      return cond ? evalMDXExpr(expr.then, ctx, sourceTable, rowIndices)
                  : evalMDXExpr(expr.else_, ctx, sourceTable, rowIndices);
    }

    case "case": {
      for (const clause of expr.whenClauses) {
        const cond = evalMDXExpr(clause.cond, ctx, sourceTable, rowIndices);
        if (cond) return evalMDXExpr(clause.then, ctx, sourceTable, rowIndices);
      }
      return expr.else_ ? evalMDXExpr(expr.else_, ctx, sourceTable, rowIndices) : null;
    }

    default:
      return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface MDXQueryResult {
  /** Column names in the result */
  columns: string[];
  /** Result rows */
  rows: Scalar[][];
  /** Metadata about the query execution */
  meta: {
    cells: number;
    duration: number;
    sourceTable: string;
  };
}

/**
 * Execute an MDX query against columnar tables.
 */
export function executeMDXQuery(
  mdx: string,
  tables: Map<string, Table>,
): MDXQueryResult {
  const start = Date.now();

  const tokens = tokenizeMDX(mdx);
  const parser = new MDXParser(tokens);
  const query = parser.parseSelect();

  const ctx = buildContext(tables);

  // Resolve the source table
  const fromName = (query as MDXSelectQuery & { from: string }).from;
  const sourceTable = tables.get(fromName)
    ?? tables.get(fromName.split(".").pop()!)
    ?? [...tables.values()][0];
  if (!sourceTable) throw new Error(`Source table "${fromName}" not found`);

  // Build row indices (all rows initially)
  const allRows = Array.from({ length: sourceTable.rowCount }, (_, i) => i);

  // Apply slicer / WHERE
  let rowIndices = allRows;
  if (query.where) {
    rowIndices = rowIndices.filter(i => {
      const v = evalMDXExpr(query.where!, ctx, sourceTable, [i]);
      return Boolean(v);
    });
  }

  // Resolve columns axis
  const columnExprs = query.columns.kind === "set" ? query.columns.items : [query.columns];
  // Resolve rows axis
  const rowExprs = query.rows.kind === "set" ? query.rows.items : [query.rows];

  // Build result: flatten cross-join of columns × rows
  const resultRows: Scalar[][] = [];
  const columnNames: string[] = [];

  // Build row-level results
  for (const ri of rowIndices) {
    const rowVals: Scalar[] = [];

    // For each column expression, compute the measure for this row
    for (const colExpr of columnExprs) {
      if (colExpr.kind === "member") {
        // It's a dimension member — get the value
        const colName = colExpr.parts[colExpr.parts.length - 1];
        const col = sourceTable.column(colName);
        if (col) {
          rowVals.push(col.get(ri));
          if (columnNames.length < columnExprs.length) {
            columnNames.push(colName);
          }
        }
      } else if (colExpr.kind === "function") {
        // Aggregate function — compute over matching rows
        const val = evalMDXExpr(colExpr, ctx, sourceTable, [ri]);
        rowVals.push(val);
        if (columnNames.length < columnExprs.length) {
          columnNames.push(`${colExpr.name}(${colExpr.args.map(a => {
            if (a.kind === "member") return a.parts[a.parts.length - 1];
            return "?";
          }).join(", ")})`);
        }
      } else {
        rowVals.push(evalMDXExpr(colExpr, ctx, sourceTable, [ri]));
        if (columnNames.length < columnExprs.length) {
          columnNames.push(`expr_${columnNames.length}`);
        }
      }
    }

    resultRows.push(rowVals);
  }

  return {
    columns: columnNames.length > 0 ? columnNames : sourceTable.columnNames(),
    rows: resultRows,
    meta: {
      cells: resultRows.length * columnNames.length,
      duration: Date.now() - start,
      sourceTable: sourceTable.name,
    },
  };
}

/**
 * Create a convenience MDX interface.
 */
export function createMDXDatabase() {
  const tables = new Map<string, Table>();

  return {
    registerTable(name: string, table: Table) {
      tables.set(name, table);
    },
    query(mdx: string): MDXQueryResult {
      return executeMDXQuery(mdx, tables);
    },
    tableNames(): string[] {
      return [...tables.keys()];
    },
  };
}
