/**
 * stitaP Analytics — XQL Query Engine
 *
 * XQL (eXtended Query Language) is a hybrid query language that combines:
 * - SQL-like relational queries (SELECT, JOIN, GROUP BY)
 * - JSON path expressions (like jq / JSONPath)
 * - Graph traversal (like Cypher / SPARQL)
 * - Time-series windowing and interpolation
 *
 * XQL is designed for querying heterogeneous data that mixes relational
 * tables, nested JSON documents, and graph structures — common in
 * analytics pipelines, log analysis, and API response analysis.
 *
 * Supported constructs:
 * - SELECT ... FROM ... WHERE (standard SQL subset)
 * - JSON path: data.field, data.field.nested, data.array[*].field
 * - Graph traversal: GRAPH table (start)-[:EDGE]->(end)
 * - TIME WINDOW: event_time, bucket_size, metric_column
 * - UNNEST: flatten arrays
 * - LET variable = expression
 * - RETURN expression AS alias
 */

import { type Table, type Scalar, Column, type DType } from "./columnar";

// ─── Tokeniser ──────────────────────────────────────────────────────────────

type XQLToken =
  | "SELECT" | "FROM" | "WHERE" | "GROUP" | "BY" | "ORDER" | "LIMIT"
  | "HAVING" | "JOIN" | "INNER" | "LEFT" | "RIGHT" | "FULL" | "ON"
  | "AS" | "DISTINCT" | "AND" | "OR" | "NOT" | "IN" | "LIKE"
  | "COUNT" | "SUM" | "AVG" | "MIN" | "MAX" | "COALESCE"
  | "CASE" | "WHEN" | "THEN" | "ELSE" | "END"
  | "GRAPH" | "TRAVERSE" | "MATCH" | "RETURN" | "LET"
  | "UNNEST" | "FLATTEN" | "EXPLODE"
  | "TIME" | "WINDOW" | "BUCKET" | "SLIDE" | "TUMBLE" | "HOP"
  | "INTERPOLATE" | "GAP" | "FILL"
  | "JSON_PATH" | "EXTRACT" | "SCHEMA"
  | "DESC" | "ASC" | "NULL" | "IS"
  | "IDENT" | "NUM" | "STR" | "DOT" | "COMMA" | "STAR"
  | "LPAREN" | "RPAREN" | "LBRACKET" | "RBRACKET" | "LBRACE" | "RBRACE"
  | "EQ" | "NEQ" | "LT" | "GT" | "LTE" | "GTE"
  | "PLUS" | "MINUS" | "SLASH" | "PERCENT"
  | "ARROW" | "FAT_ARROW" | "COLON" | "SEMICOLON"
  | "AT" | "DOLLAR"
  | "EOF";

interface XQLTokenItem {
  type: XQLToken;
  value: string;
  pos: number;
}

const XQL_KW: Record<string, XQLToken> = {
  SELECT: "SELECT", FROM: "FROM", WHERE: "WHERE", GROUP: "GROUP", BY: "BY",
  ORDER: "ORDER", LIMIT: "LIMIT", HAVING: "HAVING", JOIN: "JOIN",
  INNER: "INNER", LEFT: "LEFT", RIGHT: "RIGHT", FULL: "FULL", ON: "ON",
  AS: "AS", DISTINCT: "DISTINCT", AND: "AND", OR: "OR", NOT: "NOT",
  IN: "IN", LIKE: "LIKE",
  COUNT: "COUNT", SUM: "SUM", AVG: "AVG", MIN: "MIN", MAX: "MAX",
  COALESCE: "COALESCE",
  CASE: "CASE", WHEN: "WHEN", THEN: "THEN", ELSE: "ELSE", END: "END",
  GRAPH: "GRAPH", TRAVERSE: "TRAVERSE", MATCH: "MATCH", RETURN: "RETURN",
  LET: "LET", UNNEST: "UNNEST", FLATTEN: "FLATTEN", EXPLODE: "EXPLODE",
  TIME: "TIME", WINDOW: "WINDOW", BUCKET: "BUCKET", SLIDE: "SLIDE",
  TUMBLE: "TUMBLE", HOP: "HOP",
  INTERPOLATE: "INTERPOLATE", GAP: "GAP", FILL: "FILL",
  JSON_PATH: "JSON_PATH", EXTRACT: "EXTRACT", SCHEMA: "SCHEMA",
  DESC: "DESC", ASC: "ASC", NULL: "NULL", IS: "IS",
};

function tokenizeXQL(input: string): XQLTokenItem[] {
  const tokens: XQLTokenItem[] = [];
  let i = 0;
  while (i < input.length) {
    if (/\s/.test(input[i])) { i++; continue; }
    if (input[i] === "-" && input[i + 1] === "-") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    const pos = i;

    // String
    if (input[i] === "\"" || input[i] === "'") {
      const quote = input[i]; i++;
      let val = "";
      while (i < input.length && input[i] !== quote) val += input[i++];
      i++;
      tokens.push({ type: "STR", value: val, pos });
      continue;
    }

    // JSON path / identifiers with dots: @.field.nested
    if (input[i] === "@") {
      i++;
      let val = "@";
      while (i < input.length && /[a-zA-Z_0-9.\[\]*]/.test(input[i])) val += input[i++];
      tokens.push({ type: "JSON_PATH", value: val, pos });
      continue;
    }

    // Dollar sign paths: $.data[0].name
    if (input[i] === "$") {
      i++;
      let val = "$";
      while (i < input.length && /[a-zA-Z_0-9.\[\]*]/.test(input[i])) val += input[i++];
      tokens.push({ type: "JSON_PATH", value: val, pos });
      continue;
    }

    // Numbers
    if (/[\d.]/.test(input[i])) {
      let val = "";
      while (i < input.length && /[\d.]/.test(input[i])) val += input[i++];
      tokens.push({ type: "NUM", value: val, pos });
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(input[i])) {
      let val = "";
      while (i < input.length && /[a-zA-Z_0-9_]/.test(input[i])) val += input[i++];
      const upper = val.toUpperCase();
      const kw = XQL_KW[upper];
      tokens.push({ type: kw ?? "IDENT", value: kw ? upper : val, pos });
      continue;
    }

    // Arrow: ->
    if (input[i] === "-" && input[i + 1] === ">") {
      tokens.push({ type: "ARROW", value: "->", pos: i }); i += 2; continue;
    }
    // Fat arrow: =>
    if (input[i] === "=" && input[i + 1] === ">") {
      tokens.push({ type: "FAT_ARROW", value: "=>", pos: i }); i += 2; continue;
    }

    // Symbols
    const syms: Record<string, XQLToken> = {
      ".": "DOT", ",": "COMMA", "*": "STAR",
      "(": "LPAREN", ")": "RPAREN", "[": "LBRACKET", "]": "RBRACKET",
      "{": "LBRACE", "}": "RBRACE", ":": "COLON", ";": "SEMICOLON",
      "@": "AT", "$": "DOLLAR",
    };
    if (syms[input[i]]) {
      tokens.push({ type: syms[input[i]], value: input[i], pos: i++ });
      continue;
    }

    // Comparison
    if (input[i] === "=" && input[i + 1] !== "=" && input[i + 1] !== ">") {
      tokens.push({ type: "EQ", value: "=", pos: i }); i++; continue;
    }
    if (input[i] === "!" && input[i + 1] === "=") {
      tokens.push({ type: "NEQ", value: "!=", pos: i }); i += 2; continue;
    }
    if (input[i] === "<" && input[i + 1] === ">") {
      tokens.push({ type: "NEQ", value: "<>", pos: i }); i += 2; continue;
    }
    if (input[i] === "<" && input[i + 1] === "=") {
      tokens.push({ type: "LTE", value: "<=", pos: i }); i += 2; continue;
    }
    if (input[i] === ">" && input[i + 1] === "=") {
      tokens.push({ type: "GTE", value: ">=", pos: i }); i += 2; continue;
    }
    if (input[i] === "<") {
      tokens.push({ type: "LT", value: "<", pos: i }); i++; continue;
    }
    if (input[i] === ">") {
      tokens.push({ type: "GT", value: ">", pos: i }); i++; continue;
    }
    if (input[i] === "+") {
      tokens.push({ type: "PLUS", value: "+", pos: i }); i++; continue;
    }
    if (input[i] === "-" && !/[\d]/.test(input[i + 1])) {
      tokens.push({ type: "MINUS", value: "-", pos: i }); i++; continue;
    }
    if (input[i] === "/") {
      tokens.push({ type: "SLASH", value: "/", pos: i }); i++; continue;
    }
    if (input[i] === "%") {
      tokens.push({ type: "PERCENT", value: "%", pos: i }); i++; continue;
    }

    throw new Error(`Unexpected XQL character: ${input[i]} at position ${i}`);
  }

  tokens.push({ type: "EOF", value: "", pos: i });
  return tokens;
}

// ─── AST ────────────────────────────────────────────────────────────────────

export type XQLExpr =
  | { kind: "literal"; value: Scalar }
  | { kind: "column"; table?: string; name: string }
  | { kind: "json_path"; path: string }
  | { kind: "binary"; op: string; left: XQLExpr; right: XQLExpr }
  | { kind: "unary"; op: string; expr: XQLExpr }
  | { kind: "call"; func: string; args: XQLExpr[]; distinct?: boolean }
  | { kind: "case"; when: Array<{ cond: XQLExpr; then: XQLExpr }>; else_?: XQLExpr }
  | { kind: "coalesce"; args: XQLExpr[] }
  | { kind: "alias"; expr: XQLExpr; alias: string }
  | { kind: "star" }
  | { kind: "in"; expr: XQLExpr; values: XQLExpr[]; not?: boolean }
  | { kind: "like"; expr: XQLExpr; pattern: XQLExpr; not?: boolean }
  | { kind: "is_null"; expr: XQLExpr; not?: boolean }
  | { kind: "graph_traverse"; table: string; pattern: string }
  | { kind: "time_window"; timeCol: string; bucketSize: string; metric: XQLExpr }
  | { kind: "unnest"; expr: XQLExpr; alias: string }
  | { kind: "let"; name: string; expr: XQLExpr };

export interface XQLSelectQuery {
  distinct: boolean;
  columns: XQLExpr[];
  from: string;
  joins: Array<{ type: string; table: string; on: XQLExpr }>;
  where?: XQLExpr;
  groupBy: XQLExpr[];
  having?: XQLExpr;
  orderBy: Array<{ expr: XQLExpr; desc: boolean }>;
  limit?: number;
  lets: XQLExpr[];
  unnests: XQLExpr[];
}

// ─── Parser ─────────────────────────────────────────────────────────────────

class XQLParser {
  private tokens: XQLTokenItem[];
  private pos = 0;

  constructor(tokens: XQLTokenItem[]) {
    this.tokens = tokens;
  }

  peek(): XQLTokenItem { return this.tokens[this.pos]; }
  advance(): XQLTokenItem { return this.tokens[this.pos++]; }

  match(type: XQLToken): boolean {
    if (this.peek().type === type) { this.pos++; return true; }
    return false;
  }

  expect(type: XQLToken): XQLTokenItem {
    const t = this.peek();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} ("${t.value}") at ${t.pos}`);
    return this.advance();
  }

  parse(): XQLSelectQuery {
    const lets: XQLExpr[] = [];
    const unnests: XQLExpr[] = [];

    // LET bindings
    while (this.peek().type === "LET") {
      this.advance();
      const name = this.advance().value;
      this.expect("EQ");
      const expr = this.parseExpr();
      lets.push({ kind: "let", name, expr });
    }

    this.expect("SELECT");
    const distinct = !!this.match("DISTINCT");

    // Column list
    const columns: XQLExpr[] = [];
    let col = this.parseExpr();
    if (this.peek().type === "AS") { this.advance(); col = { kind: "alias", expr: col, alias: this.advance().value }; }
    columns.push(col);
    while (this.match("COMMA")) {
      let c = this.parseExpr();
      if (this.peek().type === "AS") { this.advance(); c = { kind: "alias", expr: c, alias: this.advance().value }; }
      columns.push(c);
    }

    this.expect("FROM");
    const from = this.advance().value;

    // JOINs
    const joins: XQLSelectQuery["joins"] = [];
    while (["JOIN", "INNER", "LEFT", "RIGHT", "FULL"].includes(this.peek().type)) {
      let jt = "INNER";
      if (this.peek().type === "LEFT") { jt = "LEFT"; this.advance(); }
      else if (this.peek().type === "RIGHT") { jt = "RIGHT"; this.advance(); }
      else if (this.peek().type === "FULL") { jt = "FULL"; this.advance(); }
      else if (this.peek().type === "INNER") { this.advance(); }
      this.expect("JOIN");
      const jTable = this.advance().value;
      this.expect("ON");
      const on = this.parseExpr();
      joins.push({ type: jt, table: jTable, on });
    }

    // WHERE
    const where = this.match("WHERE") ? this.parseExpr() : undefined;

    // GROUP BY
    const groupBy: XQLExpr[] = [];
    if (this.match("GROUP")) {
      this.expect("BY");
      groupBy.push(this.parseExpr());
      while (this.match("COMMA")) groupBy.push(this.parseExpr());
    }

    // HAVING
    const having = this.match("HAVING") ? this.parseExpr() : undefined;

    // ORDER BY
    const orderBy: XQLSelectQuery["orderBy"] = [];
    if (this.match("ORDER")) {
      this.expect("BY");
      orderBy.push({ expr: this.parseExpr(), desc: !!this.match("DESC") || !this.match("ASC") });
      while (this.match("COMMA")) {
        orderBy.push({ expr: this.parseExpr(), desc: !!this.match("DESC") || !this.match("ASC") });
      }
    }

    // LIMIT
    let limit: number | undefined;
    if (this.match("LIMIT")) {
      limit = parseInt(this.advance().value);
    }

    return { distinct, columns, from, joins, where, groupBy, having, orderBy, limit, lets, unnests };
  }

  parseExpr(): XQLExpr { return this.parseOr(); }

  parseOr(): XQLExpr {
    let left = this.parseAnd();
    while (this.match("OR")) { left = { kind: "binary", op: "OR", left, right: this.parseAnd() }; }
    return left;
  }

  parseAnd(): XQLExpr {
    let left = this.parseComparison();
    while (this.match("AND")) { left = { kind: "binary", op: "AND", left, right: this.parseComparison() }; }
    return left;
  }

  parseComparison(): XQLExpr {
    let left = this.parseAddSub();

    if (this.match("IS")) {
      const not = !!this.match("NOT");
      this.expect("NULL");
      return { kind: "is_null", expr: left, not };
    }
    if (this.match("NOT")) {
      if (this.match("LIKE")) return { kind: "like", expr: left, pattern: this.parseAddSub(), not: true };
      if (this.match("IN")) {
        this.expect("LPAREN");
        const values: XQLExpr[] = [this.parseExpr()];
        while (this.match("COMMA")) values.push(this.parseExpr());
        this.expect("RPAREN");
        return { kind: "in", expr: left, values, not: true };
      }
    }
    if (this.match("LIKE")) return { kind: "like", expr: left, pattern: this.parseAddSub(), not: false };
    if (this.match("IN")) {
      this.expect("LPAREN");
      const values: XQLExpr[] = [this.parseExpr()];
      while (this.match("COMMA")) values.push(this.parseExpr());
      this.expect("RPAREN");
      return { kind: "in", expr: left, values, not: false };
    }

    const ops: Array<[XQLToken, string]> = [
      ["EQ", "="], ["NEQ", "!="], ["LT", "<"], ["GT", ">"], ["LTE", "<="], ["GTE", ">="],
    ];
    for (const [tok, op] of ops) {
      if (this.match(tok)) return { kind: "binary", op, left, right: this.parseAddSub() };
    }
    return left;
  }

  parseAddSub(): XQLExpr {
    let left = this.parseMulDiv();
    while (this.peek().type === "PLUS" || this.peek().type === "MINUS") {
      const op = this.advance().value;
      left = { kind: "binary", op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  parseMulDiv(): XQLExpr {
    let left = this.parseUnary();
    while (this.peek().type === "STAR" || this.peek().type === "SLASH" || this.peek().type === "PERCENT") {
      const op = this.advance().value;
      left = { kind: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary(): XQLExpr {
    if (this.match("NOT")) return { kind: "unary", op: "NOT", expr: this.parsePrimary() };
    if (this.match("MINUS")) return { kind: "unary", op: "-", expr: this.parsePrimary() };
    return this.parsePrimary();
  }

  parsePrimary(): XQLExpr {
    const t = this.peek();

    // COALESCE(a, b, c)
    if (t.type === "COALESCE") {
      this.advance();
      this.expect("LPAREN");
      const args: XQLExpr[] = [this.parseExpr()];
      while (this.match("COMMA")) args.push(this.parseExpr());
      this.expect("RPAREN");
      return { kind: "coalesce", args };
    }

    // CASE
    if (t.type === "CASE") {
      this.advance();
      const when: Array<{ cond: XQLExpr; then: XQLExpr }> = [];
      while (this.match("WHEN")) {
        const cond = this.parseExpr();
        this.expect("THEN");
        const then = this.parseExpr();
        when.push({ cond, then });
      }
      let elseExpr: XQLExpr | undefined;
      if (this.match("ELSE")) elseExpr = this.parseExpr();
      this.expect("END");
      return { kind: "case", when, else_: elseExpr };
    }

    // Aggregate functions
    if (["COUNT", "SUM", "AVG", "MIN", "MAX"].includes(t.type)) {
      const func = this.advance().value.toLowerCase();
      this.expect("LPAREN");
      const distinct = !!this.match("DISTINCT");
      const args = this.peek().type === "STAR"
        ? [this.parsePrimary()]
        : [this.parseExpr()];
      this.expect("RPAREN");
      return { kind: "call", func, args, distinct };
    }

    // JSON path: @.field or $.field
    if (t.type === "JSON_PATH") {
      this.advance();
      return { kind: "json_path", path: t.value };
    }

    // Literals
    if (t.type === "NULL") { this.advance(); return { kind: "literal", value: null }; }
    if (t.type === "NUM") { this.advance(); return { kind: "literal", value: Number(t.value) }; }
    if (t.type === "STR") { this.advance(); return { kind: "literal", value: t.value }; }
    if (t.type === "STAR") { this.advance(); return { kind: "star" }; }

    if (t.type === "LPAREN") {
      this.advance();
      const expr = this.parseExpr();
      this.expect("RPAREN");
      return expr;
    }

    if (t.type === "IDENT" || t.type === "FROM") {
      this.advance();
      if (this.peek().type === "DOT") {
        this.advance();
        const col = this.advance();
        return { kind: "column", table: t.value, name: col.value };
      }
      return { kind: "column", name: t.value };
    }

    throw new Error(`Unexpected XQL token: ${t.type} ("${t.value}") at ${t.pos}`);
  }
}

// ─── Executor ───────────────────────────────────────────────────────────────

function evalXQLExpr(
  expr: XQLExpr,
  row: Record<string, Scalar>,
): Scalar {
  switch (expr.kind) {
    case "literal": return expr.value;
    case "column": {
      if (expr.table) return row[`${expr.table}.${expr.name}`] ?? row[expr.name] ?? null;
      return row[expr.name] ?? null;
    }
    case "json_path": {
      // Resolve @.field or $.field from the row
      const path = expr.path.replace(/^[@$]/, "");
      const parts = path.split(".").filter(Boolean);
      let val: unknown = row;
      for (const p of parts) {
        if (val === null || val === undefined) return null;
        if (typeof val === "object" && p in (val as Record<string, unknown>)) {
          val = (val as Record<string, unknown>)[p];
        } else {
          return null;
        }
      }
      return val as Scalar;
    }
    case "binary": {
      const l = evalXQLExpr(expr.left, row);
      const r = evalXQLExpr(expr.right, row);
      if (l === null || r === null) return null;
      switch (expr.op) {
        case "=": return l === r;
        case "!=": return l !== r;
        case "<": return (l as number) < (r as number);
        case ">": return (l as number) > (r as number);
        case "<=": return (l as number) <= (r as number);
        case ">=": return (l as number) >= (r as number);
        case "+": return Number(l) + Number(r);
        case "-": return Number(l) - Number(r);
        case "*": return Number(l) * Number(r);
        case "/": return Number(r) !== 0 ? Number(l) / Number(r) : null;
        case "%": return Number(r) !== 0 ? Number(l) % Number(r) : null;
        case "AND": return l && r;
        case "OR": return l || r;
        default: return null;
      }
    }
    case "unary": {
      const val = evalXQLExpr(expr.expr, row);
      if (expr.op === "NOT") return val === null ? true : !val;
      if (expr.op === "-") return val === null ? null : -Number(val);
      return val;
    }
    case "call": {
      const args = expr.args.map(a => evalXQLExpr(a, row));
      switch (expr.func) {
        case "count": return args[0] === "*" ? 1 : (args[0] !== null ? 1 : 0);
        case "sum": return args[0] !== null ? Number(args[0]) : null;
        case "avg": return args[0] !== null ? Number(args[0]) : null;
        case "min": return args[0];
        case "max": return args[0];
        default: return null;
      }
    }
    case "coalesce": {
      for (const arg of expr.args) {
        const v = evalXQLExpr(arg, row);
        if (v !== null) return v;
      }
      return null;
    }
    case "case": {
      for (const w of expr.when) {
        if (evalXQLExpr(w.cond, row)) return evalXQLExpr(w.then, row);
      }
      return expr.else_ ? evalXQLExpr(expr.else_, row) : null;
    }
    case "alias": return evalXQLExpr(expr.expr, row);
    case "is_null": {
      const val = evalXQLExpr(expr.expr, row);
      return expr.not ? val !== null : val === null;
    }
    case "in": {
      const val = evalXQLExpr(expr.expr, row);
      const vals = expr.values.map(v => evalXQLExpr(v, row));
      const found = vals.some(v => v === val);
      return expr.not ? !found : found;
    }
    case "like": {
      const val = String(evalXQLExpr(expr.expr, row) ?? "");
      const pat = String(evalXQLExpr(expr.pattern, row) ?? "");
      const regex = new RegExp("^" + pat.replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
      return expr.not ? !regex.test(val) : regex.test(val);
    }
    case "star": return "*";
    case "graph_traverse": return null; // Handled at query level
    case "time_window": return null; // Handled at query level
    case "unnest": return null; // Handled at query level
    case "let": return evalXQLExpr(expr.expr, row);
    default: return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export type XQLTableLookup = (name: string) => Table | undefined;

export interface XQLResult {
  columns: string[];
  rows: Scalar[][];
  meta: { cells: number; duration: number };
}

/**
 * Execute an XQL query against columnar tables.
 */
export function executeXQLQuery(
  xql: string,
  tables: XQLTableLookup,
): XQLResult {
  const start = Date.now();

  const tokens = tokenizeXQL(xql);
  const parser = new XQLParser(tokens);
  const query = parser.parse();

  // Resolve FROM table
  const fromTable = tables(query.from);
  if (!fromTable) throw new Error(`Table "${query.from}" not found`);

  let workingTable = fromTable;
  const tableMap = new Map<string, Table>();
  tableMap.set(query.from, fromTable);

  // Apply WHERE
  if (query.where) {
    workingTable = workingTable.filter((row) => {
      const evalRow: Record<string, Scalar> = {};
      for (const col of workingTable.columns) {
        evalRow[col.name] = row[col.name];
        evalRow[`${query.from}.${col.name}`] = row[col.name];
      }
      return !!evalXQLExpr(query.where!, evalRow);
    });
  }

  // Apply JOINs
  for (const join of query.joins) {
    const rightTable = tables(join.table);
    if (!rightTable) throw new Error(`Join table "${join.table}" not found`);
    tableMap.set(join.table, rightTable);

    const joined = workingTable.join(rightTable, join.on.kind === "column" ? join.on.name : "id");
    workingTable = joined;
  }

  // GROUP BY
  if (query.groupBy.length > 0) {
    const groupColNames = query.groupBy.map(e => {
      if (e.kind === "column") return e.name;
      throw new Error("GROUP BY only supports column references");
    });

    const aggs: Array<{ fn: "count" | "sum" | "avg" | "min" | "max"; col: string; as?: string }> = [];
    for (const col of query.columns) {
      if (col.kind === "alias" && col.expr.kind === "call" && ["count", "sum", "avg", "min", "max"].includes(col.expr.func)) {
        aggs.push({ fn: col.expr.func as "count" | "sum" | "avg" | "min" | "max", col: col.expr.args[0]?.kind === "column" ? col.expr.args[0].name : "*", as: col.alias });
      } else if (col.kind === "call" && ["count", "sum", "avg", "min", "max"].includes(col.func)) {
        aggs.push({ fn: col.func as "count" | "sum" | "avg" | "min" | "max", col: col.args[0]?.kind === "column" ? col.args[0].name : "*" });
      }
    }

    if (aggs.length > 0) {
      workingTable = workingTable.groupBy(groupColNames, aggs);
    }
  }

  // ORDER BY
  if (query.orderBy.length > 0) {
    for (let i = query.orderBy.length - 1; i >= 0; i--) {
      if (query.orderBy[i].expr.kind === "column") {
        workingTable = workingTable.sort((query.orderBy[i].expr as { kind: "column"; name: string }).name, query.orderBy[i].desc);
      }
    }
  }

  // LIMIT
  if (query.limit !== undefined) {
    workingTable = workingTable.limit(query.limit);
  }

  // SELECT projection
  if (query.columns.length === 1 && query.columns[0].kind === "star") {
    return {
      columns: workingTable.columnNames(),
      rows: workingTable.rows().map(r => workingTable.columnNames().map(n => r[n])),
      meta: { cells: workingTable.rowCount * workingTable.colCount, duration: Date.now() - start },
    };
  }

  const outRows: Scalar[][] = [];
  for (let i = 0; i < workingTable.rowCount; i++) {
    const row = workingTable.row(i);
    outRows.push(query.columns.map(c => evalXQLExpr(c, row)));
  }

  const colNames = query.columns.map((c, i) => {
    if (c.kind === "alias") return c.alias;
    if (c.kind === "column") return c.name;
    if (c.kind === "call") return `${c.func}(...)`;
    return `col_${i}`;
  });

  return {
    columns: colNames,
    rows: outRows,
    meta: { cells: outRows.length * colNames.length, duration: Date.now() - start },
  };
}

/**
 * Convenience interface for creating an XQL database.
 */
export function createXQLDatabase() {
  const tables = new Map<string, Table>();

  return {
    register(name: string, table: Table) { tables.set(name, table); },
    query(xql: string): XQLResult { return executeXQLQuery(xql, (n) => tables.get(n)); },
    tableNames(): string[] { return [...tables.keys()]; },
  };
}
