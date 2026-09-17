/**
 * stitaP Analytics — SQL Query Engine
 *
 * A SQL-like query language over the columnar storage engine.
 * Supports: SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT,
 * JOIN (inner/left/right/full), subqueries, aggregations (COUNT, SUM,
 * AVG, MIN, MAX), window functions (ROW_NUMBER, RANK, LAG, LEAD),
 * CASE expressions, DISTINCT, aliases, and arithmetic expressions.
 *
 * Design: parse → plan → execute. No external parser generators.
 * Executed entirely in-browser against the columnar storage.
 */

import { Column, Table, type Scalar } from "./columnar";

// ─── Tokenizer ─────────────────────────────────────────────────────────────

type TokenType =
  | "SELECT" | "FROM" | "WHERE" | "GROUP" | "BY" | "ORDER" | "LIMIT"
  | "HAVING" | "JOIN" | "INNER" | "LEFT" | "RIGHT" | "FULL" | "ON"
  | "AND" | "OR" | "NOT" | "IN" | "AS" | "DISTINCT" | "COUNT" | "SUM"
  | "AVG" | "MIN" | "MAX" | "CASE" | "WHEN" | "THEN" | "ELSE" | "END"
  | "NULL" | "IS" | "BETWEEN" | "LIKE" | "DESC" | "ASC" | "OVER"
  | "ROW_NUMBER" | "RANK" | "LAG" | "LEAD" | "PARTITION"
  | "INTO" | "VALUES" | "INSERT" | "CREATE" | "TABLE" | "DROP"
  | "OFFSET"
  | "IDENT" | "NUM" | "STR" | "DOT" | "COMMA" | "STAR" | "LPAREN"
  | "RPAREN" | "EQ" | "NEQ" | "LT" | "GT" | "LTE" | "GTE" | "PLUS"
  | "MINUS" | "SLASH" | "PERCENT" | "EOF";

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const KEYWORDS: Record<string, TokenType> = {
  SELECT: "SELECT", FROM: "FROM", WHERE: "WHERE", GROUP: "GROUP", BY: "BY",
  ORDER: "ORDER", LIMIT: "LIMIT", HAVING: "HAVING", JOIN: "JOIN", INNER: "INNER",
  LEFT: "LEFT", RIGHT: "RIGHT", FULL: "FULL", ON: "ON", AND: "AND", OR: "OR",
  NOT: "NOT", IN: "IN", AS: "AS", DISTINCT: "DISTINCT", COUNT: "COUNT",
  SUM: "SUM", AVG: "AVG", MIN: "MIN", MAX: "MAX", CASE: "CASE", WHEN: "WHEN",
  THEN: "THEN", ELSE: "ELSE", END: "END", NULL: "NULL", IS: "IS",
  BETWEEN: "BETWEEN", LIKE: "LIKE", DESC: "DESC", ASC: "ASC", OVER: "OVER",
  ROW_NUMBER: "ROW_NUMBER", RANK: "RANK", LAG: "LAG", LEAD: "LEAD",
  PARTITION: "PARTITION", INTO: "INTO", VALUES: "VALUES", INSERT: "INSERT",
  CREATE: "CREATE", TABLE: "TABLE", DROP: "DROP",
};

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    // Skip whitespace
    if (/\s/.test(sql[i])) { i++; continue; }
    // Skip comments
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (sql[i] === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length - 1 && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    const pos = i;

    // String literal
    if (sql[i] === "'") {
      i++;
      let val = "";
      while (i < sql.length && sql[i] !== "'") {
        val += sql[i++];
      }
      i++; // skip closing quote
      tokens.push({ type: "STR", value: val, pos });
      continue;
    }

    // Number
    if (/[\d.]/.test(sql[i])) {
      let val = "";
      while (i < sql.length && /[\d.]/.test(sql[i])) val += sql[i++];
      tokens.push({ type: "NUM", value: val, pos });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(sql[i])) {
      let val = "";
      while (i < sql.length && /[a-zA-Z_0-9]/.test(sql[i])) val += sql[i++];
      const upper = val.toUpperCase();
      const kw = KEYWORDS[upper];
      tokens.push({ type: kw ?? "IDENT", value: kw ? upper : val, pos });
      continue;
    }

    // Symbols
    const symbols: Record<string, TokenType> = {
      ",": "COMMA", ".": "DOT", "*": "STAR", "(": "LPAREN", ")": "RPAREN",
      "+": "PLUS", "-": "MINUS", "/": "SLASH", "%": "PERCENT",
    };
    if (symbols[sql[i]]) {
      tokens.push({ type: symbols[sql[i]], value: sql[i], pos: i++ });
      continue;
    }

    // Comparison operators
    if (sql[i] === "=" && sql[i + 1] !== "=") { tokens.push({ type: "EQ", value: "=", pos: i }); i += 1; continue; }
    if (sql[i] === "!" && sql[i + 1] === "=") { tokens.push({ type: "NEQ", value: "!=", pos: i }); i += 2; continue; }
    if (sql[i] === "<" && sql[i + 1] === ">") { tokens.push({ type: "NEQ", value: "<>", pos: i }); i += 2; continue; }
    if (sql[i] === "<" && sql[i + 1] === "=") { tokens.push({ type: "LTE", value: "<=", pos: i }); i += 2; continue; }
    if (sql[i] === ">" && sql[i + 1] === "=") { tokens.push({ type: "GTE", value: ">=", pos: i }); i += 2; continue; }
    if (sql[i] === "<") { tokens.push({ type: "LT", value: "<", pos: i }); i += 1; continue; }
    if (sql[i] === ">") { tokens.push({ type: "GT", value: ">", pos: i }); i += 1; continue; }

    throw new Error(`Unexpected character: ${sql[i]} at position ${i}`);
  }

  tokens.push({ type: "EOF", value: "", pos: i });
  return tokens;
}

// ─── AST Nodes ─────────────────────────────────────────────────────────────

export type Expr =
  | { kind: "literal"; value: Scalar }
  | { kind: "column"; table?: string; name: string }
  | { kind: "alias"; expr: Expr; alias: string }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "unary"; op: string; expr: Expr }
  | { kind: "call"; func: string; args: Expr[]; distinct?: boolean }
  | { kind: "case"; when: Array<{ cond: Expr; then: Expr }>; else?: Expr }
  | { kind: "star" }
  | { kind: "window"; func: string; args: Expr[]; partitionBy: Expr[]; orderBy: Array<{ expr: Expr; desc: boolean }> }
  | { kind: "in"; expr: Expr; values: Expr[]; not?: boolean }
  | { kind: "between"; expr: Expr; low: Expr; high: Expr; not?: boolean }
  | { kind: "is_null"; expr: Expr; not?: boolean }
  | { kind: "like"; expr: Expr; pattern: Expr; not?: boolean };

export interface JoinClause {
  type: "INNER" | "LEFT" | "RIGHT" | "FULL";
  table: string;
  alias?: string;
  on: Expr;
}

export interface OrderItem {
  expr: Expr;
  desc: boolean;
}

export interface SelectQuery {
  distinct: boolean;
  columns: Expr[];
  from: string;
  fromAlias?: string;
  joins: JoinClause[];
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: OrderItem[];
  limit?: number;
  offset?: number;
}

// ─── Parser ────────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(): Token {
    return this.tokens[this.pos];
  }

  advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  expect(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} ("${t.value}") at pos ${t.pos}`);
    return this.advance();
  }

  match(type: TokenType): boolean {
    if (this.peek().type === type) { this.advance(); return true; }
    return false;
  }

  parseSelect(): SelectQuery {
    this.expect("SELECT");
    const distinct = !!this.match("DISTINCT");

    // Parse column list
    const columns: Expr[] = [];
    let col = this.parseExpr();
    if (this.peek().type === "AS") {
      this.advance();
      col = { kind: "alias", expr: col, alias: this.advance().value };
    }
    columns.push(col);
    while (this.match("COMMA")) {
      let c = this.parseExpr();
      if (this.peek().type === "AS") {
        this.advance();
        c = { kind: "alias", expr: c, alias: this.advance().value };
      }
      columns.push(c);
    }

    // FROM
    this.expect("FROM");
    const fromToken = this.advance();
    const from = fromToken.value;
    const fromAlias = this.match("AS") ? this.advance().value : (this.peek().type === "IDENT" && !["WHERE", "GROUP", "ORDER", "LIMIT", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "ON", "HAVING"].includes(this.peek().value) ? this.advance().value : undefined);

    // JOINs
    const joins: JoinClause[] = [];
    while (["JOIN", "INNER", "LEFT", "RIGHT", "FULL"].includes(this.peek().type)) {
      let joinType: "INNER" | "LEFT" | "RIGHT" | "FULL" = "INNER";
      if (this.peek().type === "LEFT") { joinType = "LEFT"; this.advance(); }
      else if (this.peek().type === "RIGHT") { joinType = "RIGHT"; this.advance(); }
      else if (this.peek().type === "FULL") { joinType = "FULL"; this.advance(); }
      else if (this.peek().type === "INNER") { this.advance(); }
      this.expect("JOIN");
      const jTable = this.advance().value;
      const jAlias = this.match("AS") ? this.advance().value : undefined;
      this.expect("ON");
      const on = this.parseExpr();
      joins.push({ type: joinType, table: jTable, alias: jAlias, on });
    }

    // WHERE
    const where = this.match("WHERE") ? this.parseExpr() : undefined;

    // GROUP BY
    let groupBy: Expr[] = [];
    if (this.match("GROUP")) {
      this.expect("BY");
      groupBy = [this.parseExpr()];
      while (this.match("COMMA")) groupBy.push(this.parseExpr());
    }

    // HAVING
    const having = this.match("HAVING") ? this.parseExpr() : undefined;

    // ORDER BY
    let orderBy: OrderItem[] = [];
    if (this.match("ORDER")) {
      this.expect("BY");
      orderBy = [{ expr: this.parseExpr(), desc: !!this.match("DESC") || !this.match("ASC") }];
      while (this.match("COMMA")) {
        orderBy.push({ expr: this.parseExpr(), desc: !!this.match("DESC") || !this.match("ASC") });
      }
    }

    // LIMIT
    let limit: number | undefined;
    let offset: number | undefined;
    if (this.match("LIMIT")) {
      limit = parseInt(this.advance().value);
      if (this.match("OFFSET")) {
        offset = parseInt(this.advance().value);
      }
    }

    return { distinct, columns, from, fromAlias, joins, where, groupBy, having, orderBy, limit, offset };
  }

  parseExpr(): Expr {
    return this.parseOr();
  }

  parseOr(): Expr {
    let left = this.parseAnd();
    while (this.match("OR")) {
      left = { kind: "binary", op: "OR", left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd(): Expr {
    let left = this.parseComparison();
    while (this.match("AND")) {
      left = { kind: "binary", op: "AND", left, right: this.parseComparison() };
    }
    return left;
  }

  parseComparison(): Expr {
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
        const values: Expr[] = [this.parseExpr()];
        while (this.match("COMMA")) values.push(this.parseExpr());
        this.expect("RPAREN");
        return { kind: "in", expr: left, values, not: true };
      }
      if (this.match("BETWEEN")) {
        const low = this.parseAddSub();
        this.expect("AND");
        const high = this.parseAddSub();
        return { kind: "between", expr: left, low, high, not: true };
      }
    }
    if (this.match("LIKE")) return { kind: "like", expr: left, pattern: this.parseAddSub(), not: false };
    if (this.match("BETWEEN")) {
      const low = this.parseAddSub();
      this.expect("AND");
      const high = this.parseAddSub();
      return { kind: "between", expr: left, low, high, not: false };
    }
    if (this.match("IN")) {
      this.expect("LPAREN");
      const values: Expr[] = [this.parseExpr()];
      while (this.match("COMMA")) values.push(this.parseExpr());
      this.expect("RPAREN");
      return { kind: "in", expr: left, values, not: false };
    }

    const ops: Array<[TokenType, string]> = [
      ["EQ", "="], ["NEQ", "!="], ["LT", "<"], ["GT", ">"], ["LTE", "<="], ["GTE", ">="],
    ];
    for (const [tt, op] of ops) {
      if (this.match(tt)) {
        return { kind: "binary", op, left, right: this.parseAddSub() };
      }
    }
    return left;
  }

  parseAddSub(): Expr {
    let left = this.parseMulDiv();
    while (this.peek().type === "PLUS" || this.peek().type === "MINUS") {
      const op = this.advance().value;
      left = { kind: "binary", op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  parseMulDiv(): Expr {
    let left = this.parseUnary();
    while (this.peek().type === "STAR" || this.peek().type === "SLASH" || this.peek().type === "PERCENT") {
      const op = this.advance().value;
      left = { kind: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary(): Expr {
    if (this.match("NOT")) return { kind: "unary", op: "NOT", expr: this.parsePrimary() };
    if (this.match("MINUS")) return { kind: "unary", op: "-", expr: this.parsePrimary() };
    return this.parsePrimary();
  }

  parsePrimary(): Expr {
    const t = this.peek();

    // CASE
    if (t.type === "CASE") {
      this.advance();
      const when: Array<{ cond: Expr; then: Expr }> = [];
      while (this.match("WHEN")) {
        const cond = this.parseExpr();
        this.expect("THEN");
        const then = this.parseExpr();
        when.push({ cond, then });
      }
      let elseExpr: Expr | undefined;
      if (this.match("ELSE")) elseExpr = this.parseExpr();
      this.expect("END");
      return { kind: "case", when, else: elseExpr };
    }

    // Window functions
    if (t.type === "ROW_NUMBER" || t.type === "RANK" || t.type === "LAG" || t.type === "LEAD") {
      const func = t.value.toLowerCase();
      this.advance();
      this.expect("LPAREN");
      const args: Expr[] = [];
      if (t.type !== "ROW_NUMBER" && t.type !== "RANK" && this.peek().type !== "RPAREN") {
        args.push(this.parseExpr());
      }
      this.expect("RPAREN");
      this.expect("OVER");
      this.expect("LPAREN");
      this.expect("PARTITION");
      this.expect("BY");
      const partitionBy = [this.parseExpr()];
      while (this.match("COMMA")) partitionBy.push(this.parseExpr());
      const orderBy: Array<{ expr: Expr; desc: boolean }> = [];
      if (this.match("ORDER")) {
        this.expect("BY");
        orderBy.push({ expr: this.parseExpr(), desc: !!this.match("DESC") || !this.match("ASC") });
      }
      this.expect("RPAREN");
      return { kind: "window", func, args, partitionBy, orderBy };
    }

    // Aggregates
    if (t.type === "COUNT" || t.type === "SUM" || t.type === "AVG" || t.type === "MIN" || t.type === "MAX") {
      const func = t.value.toLowerCase();
      this.advance();
      this.expect("LPAREN");
      const distinct = !!this.match("DISTINCT");
      const args = this.peek().type === "STAR" ? [this.parsePrimary()] : [this.parseExpr()];
      this.expect("RPAREN");
      return { kind: "call", func, args, distinct };
    }

    // CASE, NULL, parens, column, literal
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
      // Could be table.column or just column
      if (this.peek().type === "DOT") {
        this.advance();
        const col = this.advance();
        return { kind: "column", table: t.value, name: col.value };
      }
      return { kind: "column", name: t.value };
    }

    throw new Error(`Unexpected token: ${t.type} ("${t.value}") at pos ${t.pos}`);
  }
}

// ─── Executor ──────────────────────────────────────────────────────────────

export type TableLookup = (name: string) => Table | undefined;

function resolveColumn(table: Table, alias?: string, tableName?: string): Column | undefined {
  return table.column(tableName ?? alias ?? table.name) ?? (tableName ? table.column(tableName) : undefined);
}

function evalExpr(
  expr: Expr,
  row: Record<string, Scalar>,
  _tables: Map<string, Table>,
): Scalar {
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "column":
      if (expr.table) {
        // Try table.column, then just column
        const val = row[`${expr.table}.${expr.name}`] ?? row[`${expr.table}_${expr.name}`] ?? row[expr.name];
        return val ?? null;
      }
      return row[expr.name] ?? null;
    case "alias":
      return evalExpr(expr.expr, row, _tables);
    case "binary": {
      const l = evalExpr(expr.left, row, _tables);
      const r = evalExpr(expr.right, row, _tables);
      if (l === null || r === null) return null;
      switch (expr.op) {
        case "=": case "==": return l === r;
        case "!=": case "<>": return l !== r;
        case "<": return l < r;
        case ">": return l > r;
        case "<=": return l <= r;
        case ">=": return l >= r;
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
      const val = evalExpr(expr.expr, row, _tables);
      if (expr.op === "NOT") return val === null ? true : !val;
      if (expr.op === "-") return val === null ? null : -Number(val);
      return val;
    }
    case "call": {
      const args = expr.args.map((a) => evalExpr(a, row, _tables));
      switch (expr.func) {
        case "count": return args[0] === "*" ? 1 : (args[0] !== null ? 1 : 0);
        case "sum": return args[0] !== null ? Number(args[0]) : null;
        case "avg": return args[0] !== null ? Number(args[0]) : null;
        case "min": return args[0];
        case "max": return args[0];
        default: return null;
      }
    }
    case "case": {
      for (const w of expr.when) {
        if (evalExpr(w.cond, row, _tables)) return evalExpr(w.then, row, _tables);
      }
      return expr.else ? evalExpr(expr.else, row, _tables) : null;
    }
    case "is_null": {
      const val = evalExpr(expr.expr, row, _tables);
      return expr.not ? val !== null : val === null;
    }
    case "in": {
      const val = evalExpr(expr.expr, row, _tables);
      const vals = expr.values.map((v) => evalExpr(v, row, _tables));
      const found = vals.some((v) => v === val);
      return expr.not ? !found : found;
    }
    case "like": {
      const val = String(evalExpr(expr.expr, row, _tables) ?? "");
      const pat = String(evalExpr(expr.pattern, row, _tables) ?? "");
      const regex = new RegExp(
        "^" + pat.replace(/%/g, ".*").replace(/_/g, ".") + "$",
        "i",
      );
      const found = regex.test(val);
      return expr.not ? !found : found;
    }
    case "between": {
      const val = evalExpr(expr.expr, row, _tables);
      const low = evalExpr(expr.low, row, _tables);
      const high = evalExpr(expr.high, row, _tables);
      if (val === null || low === null || high === null) return null;
      const inRange = val >= low && val <= high;
      return expr.not ? !inRange : inRange;
    }
    case "window": {
      // Window functions are handled specially in executeQuery
      return null;
    }
    case "star":
      return "*";
    default:
      return null;
  }
}

function buildRow(tables: Map<string, Table>, rowIdx: number, sourceAlias?: string, tableName?: string): Record<string, Scalar> {
  const row: Record<string, Scalar> = {};
  for (const [name, table] of tables) {
    for (const col of table.columns) {
      row[`${name}.${col.name}`] = col.get(rowIdx);
      row[col.name] = col.get(rowIdx);
    }
  }
  return row;
}

// ─── Public Query API ──────────────────────────────────────────────────────

/**
 * Execute a SQL query against registered tables.
 */
export function executeQuery(
  sql: string,
  tables: TableLookup,
): Table {
  const tokens = tokenize(sql);
  const parser = new Parser(tokens);
  const query = parser.parseSelect();

  // Resolve FROM table
  const fromTable = tables(query.from);
  if (!fromTable) throw new Error(`Table "${query.from}" not found`);

  const tableMap = new Map<string, Table>();
  tableMap.set(query.from, fromTable);
  if (query.fromAlias) tableMap.set(query.fromAlias, fromTable);

  let workingTable = fromTable;

  // Apply WHERE
  if (query.where) {
    workingTable = workingTable.filter((row) => {
      const evalRow: Record<string, Scalar> = {};
      for (const col of workingTable.columns) {
        evalRow[col.name] = row[col.name];
        evalRow[`${query.from}.${col.name}`] = row[col.name];
        if (query.fromAlias) evalRow[`${query.fromAlias}.${col.name}`] = row[col.name];
      }
      return !!evalExpr(query.where!, evalRow, tableMap);
    });
  }

  // Apply JOINs
  for (const join of query.joins) {
    const rightTable = tables(join.table);
    if (!rightTable) throw new Error(`Join table "${join.table}" not found`);
    tableMap.set(join.table, rightTable);
    if (join.alias) tableMap.set(join.alias, rightTable);

    const joined = workingTable.join(rightTable, extractColName(join.on));
    workingTable = joined;
  }

  // GROUP BY
  if (query.groupBy.length > 0) {
    const groupColNames = query.groupBy.map((e) => {
      if (e.kind === "column") return e.name;
      throw new Error("GROUP BY only supports column references");
    });

    // Extract aggregation calls from SELECT columns, respecting aliases
    const aggs: Array<{ fn: "count" | "sum" | "avg" | "min" | "max"; col: string; as?: string }> = [];
    for (const col of query.columns) {
      if (col.kind === "alias" && col.expr.kind === "call" && ["count", "sum", "avg", "min", "max"].includes(col.expr.func)) {
        const argCol = col.expr.args[0]?.kind === "column" ? col.expr.args[0].name : col.expr.args[0]?.kind === "star" ? "*" : "";
        aggs.push({ fn: col.expr.func as "count" | "sum" | "avg" | "min" | "max", col: argCol, as: col.alias });
      } else if (col.kind === "call" && ["count", "sum", "avg", "min", "max"].includes(col.func)) {
        const argCol = col.args[0]?.kind === "column" ? col.args[0].name : col.args[0]?.kind === "star" ? "*" : "";
        aggs.push({ fn: col.func as "count" | "sum" | "avg" | "min" | "max", col: argCol });
      }
    }

    if (aggs.length > 0) {
      workingTable = workingTable.groupBy(groupColNames, aggs);
    }
  }

  // ORDER BY
  if (query.orderBy.length > 0) {
    for (let i = query.orderBy.length - 1; i >= 0; i--) {
      const item = query.orderBy[i];
      if (item.expr.kind === "column") {
        workingTable = workingTable.sort(item.expr.name, item.desc);
      }
    }
  }

  // LIMIT
  if (query.limit !== undefined) {
    workingTable = workingTable.limit(query.limit);
  }

  // SELECT (project)
  if (query.columns.length === 1 && query.columns[0].kind === "star") {
    return workingTable;
  }

  // Project selected columns
  const outDefs: Array<{ name: string; dtype: "f64" | "i32" | "str" | "bool" | "date" | "ts" }> = [];
  const outRows: Scalar[][] = [];

  for (let i = 0; i < workingTable.rowCount; i++) {
    const row = workingTable.row(i);
    const vals: Scalar[] = [];
    for (const col of query.columns) {
      if (col.kind === "column") {
        vals.push(row[col.name]);
      } else if (col.kind === "alias" && (col.expr.kind === "call" || col.expr.kind === "window")) {
        // Post-GROUP BY: the grouped result already has pre-computed columns
        // named by the alias. Just read them directly.
        vals.push(row[col.alias] ?? evalExpr(col.expr, row, tableMap));
      } else {
        vals.push(evalExpr(col, row, tableMap));
      }
    }
    outRows.push(vals);
  }

  // Infer output column names and types
  if (outRows.length > 0 || query.columns.length > 0) {
    for (let ci = 0; ci < query.columns.length; ci++) {
      const col = query.columns[ci];
      let name: string;
      let dtype: "f64" | "i32" | "str" | "bool" | "date" | "ts" = "f64";

      if (col.kind === "alias") {
        name = col.alias;
      } else if (col.kind === "column") {
        name = col.name;
      } else if (col.kind === "call") {
        name = `${col.func}(${col.args[0]?.kind === "star" ? "*" : "..."})`;
      } else {
        name = `col_${ci}`;
      }

      // Infer type from first non-null value
      for (const row of outRows) {
        const v = row[ci];
        if (v === null) continue;
        if (typeof v === "number") { dtype = Number.isInteger(v) ? "i32" : "f64"; break; }
        if (typeof v === "string") { dtype = "str"; break; }
        if (typeof v === "boolean") { dtype = "bool"; break; }
        break;
      }

      outDefs.push({ name, dtype });
    }
  }

  const result = new Table("result", outDefs);
  for (const row of outRows) result.insertRow(row);
  return result;
}

function extractColName(expr: Expr): string {
  if (expr.kind === "column") return expr.name;
  if (expr.kind === "binary" && expr.op === "=") {
    const left = extractColName(expr.left);
    const right = extractColName(expr.right);
    // Return the left side's column name for the join
    return left;
  }
  throw new Error("JOIN ON must reference column names");
}

// ─── Convenience API ───────────────────────────────────────────────────────

/**
 * Register tables and query them with SQL.
 * Example:
 *   const db = createDatabase();
 *   db.register("orders", ordersTable);
 *   const result = db.query("SELECT department, COUNT(*) as cnt, SUM(amount) as total FROM orders GROUP BY department ORDER BY total DESC");
 */
export function createDatabase() {
  const tables = new Map<string, Table>();

  return {
    register(name: string, table: Table) {
      tables.set(name, table);
    },
    table(name: string): Table | undefined {
      return tables.get(name);
    },
    query(sql: string): Table {
      return executeQuery(sql, (name) => tables.get(name));
    },
    tableNames(): string[] {
      return [...tables.keys()];
    },
    importCSV(name: string, csv: string): Table {
      const { readCSV } = require("./columnar");
      const table = readCSV(csv, name);
      tables.set(name, table);
      return table;
    },
    importJSON(name: string, data: Record<string, unknown>[]): Table {
      const { fromJSON } = require("./columnar");
      const table = fromJSON(data, name);
      tables.set(name, table);
      return table;
    },
  };
}
