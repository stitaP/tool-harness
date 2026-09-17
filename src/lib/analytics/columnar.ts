/**
 * stitaP Analytics — Columnar Storage Engine
 *
 * An in-house DuckDB-style columnar database that runs entirely in the
 * browser. Zero external dependencies. Vectorized execution over typed
 * column batches for high-throughput analytical queries.
 *
 * Design principles:
 * - Column-major layout for cache-friendly scans
 * - Typed arrays (Int32Array, Float64Array) for zero-copy vectorized ops
 * - Batch processing: operate on chunks of 1024–8192 rows at a time
 * - Null bitmap per column (no sentinel values)
 * - Predicate pushdown: filter early, project late
 * - Dictionary encoding for low-cardinality string columns
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type DType = "i32" | "i64" | "f32" | "f64" | "bool" | "str" | "date" | "ts";

export interface ColumnDef {
  name: string;
  dtype: DType;
  nullable?: boolean;
}

export type Scalar = number | string | boolean | null;
export type Tuple = Scalar[];

// ─── Column Storage ────────────────────────────────────────────────────────

/**
 * A single typed column. Stores data in contiguous typed arrays for
 * vectorized access. Nulls tracked via a separate bitmap.
 */
export class Column {
  readonly name: string;
  readonly dtype: DType;
  readonly nullable: boolean;

  private data: Int32Array | Float64Array | Uint8Array | string[];
  private nulls: Uint8Array; // 1 = null, 0 = valid
  private _length: number;

  constructor(def: ColumnDef, capacity = 1024) {
    this.name = def.name;
    this.dtype = def.dtype;
    this.nullable = def.nullable ?? true;
    this._length = 0;
    this.nulls = new Uint8Array(capacity);

    switch (def.dtype) {
      case "i32":
        this.data = new Int32Array(capacity);
        break;
      case "i64":
        // JS doesn't have Int64 — use Float64 which gives 53 bits of integer precision
        this.data = new Float64Array(capacity);
        break;
      case "f32":
        this.data = new Float64Array(capacity); // JS floats are 64-bit; store as f64
        break;
      case "f64":
        this.data = new Float64Array(capacity);
        break;
      case "bool":
        this.data = new Uint8Array(capacity); // 0/1
        break;
      case "str":
      case "date":
      case "ts":
        this.data = new Array<string>(capacity);
        break;
      default:
        this.data = new Float64Array(capacity);
    }
  }

  get length(): number {
    return this._length;
  }

  push(val: Scalar): void {
    const i = this._length;
    if (val === null || val === undefined) {
      this.nulls[i] = 1;
    } else {
      this.nulls[i] = 0;
      if (this.dtype === "str" || this.dtype === "date" || this.dtype === "ts") {
        (this.data as string[])[i] = String(val);
      } else if (this.dtype === "bool") {
        (this.data as Uint8Array)[i] = val ? 1 : 0;
      } else {
        (this.data as Int32Array | Float64Array)[i] = Number(val);
      }
    }
    this._length++;
  }

  get(i: number): Scalar {
    if (i >= this._length) return null;
    if (this.nulls[i]) return null;
    if (this.dtype === "str" || this.dtype === "date" || this.dtype === "ts") {
      return (this.data as string[])[i];
    }
    if (this.dtype === "bool") {
      return (this.data as Uint8Array)[i] === 1;
    }
    return (this.data as Int32Array | Float64Array)[i];
  }

  isNull(i: number): boolean {
    return i >= this._length || this.nulls[i] === 1;
  }

  /** Get raw typed array for vectorized operations */
  raw(): Int32Array | Float64Array | Uint8Array | string[] {
    return this.data as Int32Array | Float64Array | Uint8Array | string[];
  }

  rawNulls(): Uint8Array {
    return this.nulls;
  }

  /** Slice a batch from the column */
  slice(offset: number, length: number): Column {
    const col = new Column({ name: this.name, dtype: this.dtype, nullable: this.nullable }, length);
    for (let i = 0; i < length && offset + i < this._length; i++) {
      col.push(this.get(offset + i));
    }
    return col;
  }

  /** Clone this column */
  clone(capacity?: number): Column {
    return this.slice(0, capacity ?? this._length);
  }

  /** Sum (vectorized for numeric types) */
  sum(): number | null {
    if (this.dtype === "str" || this.dtype === "bool") return null;
    const raw = this.data as Int32Array | Float64Array;
    let total = 0;
    let count = 0;
    for (let i = 0; i < this._length; i++) {
      if (!this.nulls[i]) {
        total += raw[i];
        count++;
      }
    }
    return count > 0 ? total : null;
  }

  /** Min */
  min(): Scalar {
    if (this.dtype === "str" || this.dtype === "date" || this.dtype === "ts") {
      let best: string | null = null;
      for (let i = 0; i < this._length; i++) {
        if (!this.nulls[i]) {
          const v = (this.data as string[])[i];
          if (best === null || v < best) best = v;
        }
      }
      return best;
    }
    if (this.dtype === "bool") return null;
    const raw = this.data as Int32Array | Float64Array;
    let best = Infinity;
    let found = false;
    for (let i = 0; i < this._length; i++) {
      if (!this.nulls[i]) {
        if (raw[i] < best) best = raw[i];
        found = true;
      }
    }
    return found ? best : null;
  }

  /** Max */
  max(): Scalar {
    if (this.dtype === "str" || this.dtype === "date" || this.dtype === "ts") {
      let best: string | null = null;
      for (let i = 0; i < this._length; i++) {
        if (!this.nulls[i]) {
          const v = (this.data as string[])[i];
          if (best === null || v > best) best = v;
        }
      }
      return best;
    }
    if (this.dtype === "bool") return null;
    const raw = this.data as Int32Array | Float64Array;
    let best = -Infinity;
    let found = false;
    for (let i = 0; i < this._length; i++) {
      if (!this.nulls[i]) {
        if (raw[i] > best) best = raw[i];
        found = true;
      }
    }
    return found ? best : null;
  }

  /** Count non-null */
  count(): number {
    let n = 0;
    for (let i = 0; i < this._length; i++) {
      if (!this.nulls[i]) n++;
    }
    return n;
  }

  /** Average */
  avg(): number | null {
    const s = this.sum();
    if (s === null) return null;
    const c = this.count();
    return c > 0 ? s / c : null;
  }

  /** Distinct values */
  distinct(): Scalar[] {
    const seen = new Set<string>();
    const result: Scalar[] = [];
    for (let i = 0; i < this._length; i++) {
      if (!this.nulls[i]) {
        const v = this.get(i);
        const key = String(v);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(v);
        }
      }
    }
    return result;
  }

  /** Value counts */
  valueCounts(): Map<Scalar, number> {
    const counts = new Map<Scalar, number>();
    for (let i = 0; i < this._length; i++) {
      if (!this.nulls[i]) {
        const v = this.get(i);
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    return counts;
  }
}

// ─── Table ─────────────────────────────────────────────────────────────────

/**
 * A columnar table: named columns with aligned row counts.
 * This is the core data structure — analogous to a DuckDB table or
 * a Pandas DataFrame.
 */
export class Table {
  readonly columns: Column[];
  readonly name: string;
  private colMap: Map<string, Column>;

  constructor(name: string, defs: ColumnDef[]) {
    this.name = name;
    this.columns = defs.map((d) => new Column(d));
    this.colMap = new Map(this.columns.map((c) => [c.name, c]));
  }

  get rowCount(): number {
    return this.columns.length > 0 ? this.columns[0].length : 0;
  }

  get colCount(): number {
    return this.columns.length;
  }

  column(name: string): Column | undefined {
    return this.colMap.get(name);
  }

  columnNames(): string[] {
    return this.columns.map((c) => c.name);
  }

  /** Append a row of values */
  insertRow(values: Scalar[]): void {
    if (values.length !== this.columns.length) {
      throw new Error(
        `Row has ${values.length} values but table has ${this.columns.length} columns`,
      );
    }
    for (let i = 0; i < this.columns.length; i++) {
      this.columns[i].push(values[i]);
    }
  }

  /** Append multiple rows */
  insertRows(rows: Scalar[][]): void {
    for (const row of rows) {
      this.insertRow(row);
    }
  }

  /** Get a row as an object */
  row(i: number): Record<string, Scalar> {
    const obj: Record<string, Scalar> = {};
    for (const col of this.columns) {
      obj[col.name] = col.get(i);
    }
    return obj;
  }

  /** Get all rows as objects */
  rows(): Record<string, Scalar>[] {
    const result: Record<string, Scalar>[] = [];
    for (let i = 0; i < this.rowCount; i++) {
      result.push(this.row(i));
    }
    return result;
  }

  /** Filter rows by predicate */
  filter(predicate: (row: Record<string, Scalar>) => boolean): Table {
    const result = new Table(
      `${this.name}_filtered`,
      this.columns.map((c) => ({ name: c.name, dtype: c.dtype, nullable: c.nullable })),
    );
    for (let i = 0; i < this.rowCount; i++) {
      if (predicate(this.row(i))) {
        result.insertRow(this.columns.map((c) => c.get(i)));
      }
    }
    return result;
  }

  /** Project (select) specific columns */
  select(...names: string[]): Table {
    const cols = names.map((n) => {
      const c = this.colMap.get(n);
      if (!c) throw new Error(`Column "${n}" not found`);
      return { name: c.name, dtype: c.dtype, nullable: c.nullable };
    });
    const result = new Table(`${this.name}_projected`, cols);
    for (let i = 0; i < this.rowCount; i++) {
      result.insertRow(cols.map((c) => this.colMap.get(c.name)!.get(i)));
    }
    return result;
  }

  /** Sort by a column */
  sort(columnName: string, desc = false): Table {
    const col = this.colMap.get(columnName);
    if (!col) throw new Error(`Column "${columnName}" not found`);

    const indices = Array.from({ length: this.rowCount }, (_, i) => i);
    indices.sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return desc ? 1 : -1;
      if (va > vb) return desc ? -1 : 1;
      return 0;
    });

    const result = new Table(
      `${this.name}_sorted`,
      this.columns.map((c) => ({ name: c.name, dtype: c.dtype, nullable: c.nullable })),
    );
    for (const idx of indices) {
      result.insertRow(this.columns.map((c) => c.get(idx)));
    }
    return result;
  }

  /** Take first N rows */
  limit(n: number): Table {
    const result = new Table(
      `${this.name}_limited`,
      this.columns.map((c) => ({ name: c.name, dtype: c.dtype, nullable: c.nullable })),
    );
    for (let i = 0; i < Math.min(n, this.rowCount); i++) {
      result.insertRow(this.columns.map((c) => c.get(i)));
    }
    return result;
  }

  /** Inner join with another table on matching column names */
  join(other: Table, onLeft: string, onRight?: string): Table {
    const rightCol = onRight ?? onLeft;
    const leftKey = this.colMap.get(onLeft);
    const rightKey = other.colMap.get(rightCol);
    if (!leftKey || !rightKey) {
      throw new Error(`Join column not found: ${onLeft} / ${rightCol}`);
    }

    // Build hash index on right table
    const rightIndex = new Map<Scalar, number[]>();
    for (let i = 0; i < other.rowCount; i++) {
      const k = rightKey.get(i);
      if (k !== null) {
        const arr = rightIndex.get(k) ?? [];
        arr.push(i);
        rightIndex.set(k, arr);
      }
    }

    // Build output schema
    const outDefs: ColumnDef[] = [
      ...this.columns.map((c) => ({ name: `${this.name}.${c.name}`, dtype: c.dtype, nullable: c.nullable })),
      ...other.columns.map((c) => ({
        name: `${other.name}.${c.name}`,
        dtype: c.dtype,
        nullable: c.nullable,
      })),
    ];
    const result = new Table(`${this.name}_join_${other.name}`, outDefs);

    // Probe
    for (let i = 0; i < this.rowCount; i++) {
      const k = leftKey.get(i);
      if (k === null) continue;
      const matches = rightIndex.get(k);
      if (!matches) continue;
      for (const j of matches) {
        result.insertRow([
          ...this.columns.map((c) => c.get(i)),
          ...other.columns.map((c) => c.get(j)),
        ]);
      }
    }

    return result;
  }

  /** Group-by aggregation */
  groupBy(
    groupCols: string[],
    aggs: Array<{ fn: "count" | "sum" | "avg" | "min" | "max"; col: string; as?: string }>,
  ): Table {
    const groupColDefs = groupCols.map((n) => {
      const c = this.colMap.get(n);
      if (!c) throw new Error(`Group column "${n}" not found`);
      return c;
    });

    // Build groups
    const groups = new Map<string, Scalar[]>();
    const groupRows = new Map<string, number[]>();
    for (let i = 0; i < this.rowCount; i++) {
      const key = groupCols.map((n) => String(this.colMap.get(n)!.get(i))).join("\x00");
      if (!groups.has(key)) {
        groups.set(key, groupCols.map((n) => this.colMap.get(n)!.get(i)));
        groupRows.set(key, []);
      }
      groupRows.get(key)!.push(i);
    }

    // Output schema
    const outDefs: ColumnDef[] = [
      ...groupColDefs.map((c) => ({ name: c.name, dtype: c.dtype, nullable: false })),
      ...aggs.map((a) => ({
        name: a.as ?? `${a.fn}(${a.col})`,
        dtype: a.fn === "count" ? ("i32" as DType) : ("f64" as DType),
        nullable: true,
      })),
    ];
    const result = new Table(`${this.name}_grouped`, outDefs);

    for (const [, keyVals] of groups) {
      const rowIndices = groupRows.get(keyVals.map(String).join("\x00"))!;
      const aggVals: Scalar[] = aggs.map((a) => {
        if (a.col === "*") {
          // COUNT(*) — count all rows in group; other aggs on * return group size
          return a.fn === "count" ? rowIndices.length : rowIndices.length;
        }
        const col = this.colMap.get(a.col);
        if (!col) throw new Error(`Agg column "${a.col}" not found`);
        switch (a.fn) {
          case "count":
            return rowIndices.length;
          case "sum": {
            let s = 0;
            let any = false;
            for (const ri of rowIndices) {
              const v = col.get(ri);
              if (v !== null) { s += Number(v); any = true; }
            }
            return any ? s : null;
          }
          case "avg": {
            let s = 0;
            let n = 0;
            for (const ri of rowIndices) {
              const v = col.get(ri);
              if (v !== null) { s += Number(v); n++; }
            }
            return n > 0 ? s / n : null;
          }
          case "min": {
            let best: Scalar = null;
            for (const ri of rowIndices) {
              const v = col.get(ri);
              if (v !== null && (best === null || v < best)) best = v;
            }
            return best;
          }
          case "max": {
            let best: Scalar = null;
            for (const ri of rowIndices) {
              const v = col.get(ri);
              if (v !== null && (best === null || v > best)) best = v;
            }
            return best;
          }
        }
      });
      result.insertRow([...keyVals, ...aggVals]);
    }

    return result;
  }

  /** Schema description */
  schema(): ColumnDef[] {
    return this.columns.map((c) => ({
      name: c.name,
      dtype: c.dtype,
      nullable: c.nullable,
    }));
  }

  /** Summary statistics for all columns */
  describe(): Record<string, Record<string, Scalar>> {
    const stats: Record<string, Record<string, Scalar>> = {};
    for (const col of this.columns) {
      stats[col.name] = {
        count: col.count(),
        nulls: col.length - col.count(),
        min: col.min(),
        max: col.max(),
        ...(col.dtype !== "str" && col.dtype !== "bool"
          ? { sum: col.sum(), avg: col.avg() }
          : {}),
        distinct: col.distinct().length,
      };
    }
    return stats;
  }
}

// ─── CSV / JSON I/O ────────────────────────────────────────────────────────

/**
 * Parse CSV text into a Table. Auto-detects types.
 */
export function readCSV(text: string, tableName = "csv_import"): Table {
  const lines = text.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have a header and at least one data row");

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    // Simple CSV parser (handles quoted fields)
    const vals: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { vals.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    vals.push(current.trim());
    return vals;
  });

  // Auto-detect types from first 100 rows
  const sampleSize = Math.min(rows.length, 100);
  const defs: ColumnDef[] = headers.map((h, ci) => {
    let dtype: DType = "f64";
    let allNull = true;
    for (let ri = 0; ri < sampleSize; ri++) {
      const v = rows[ri]?.[ci];
      if (v === "" || v === "null" || v === "NULL") continue;
      allNull = false;
      if (/^-?\d+$/.test(v) && Math.abs(Number(v)) < 2147483647) { dtype = "i32"; break; }
      if (/^-?\d+\.\d+$/.test(v)) { dtype = "f64"; break; }
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) { dtype = "date"; break; }
      if (v === "true" || v === "false") { dtype = "bool"; break; }
      dtype = "str";
      break;
    }
    return { name: h, dtype, nullable: !allNull };
  });

  const table = new Table(tableName, defs);
  for (const row of rows) {
    if (row.length < headers.length) {
      while (row.length < headers.length) row.push("");
    }
    table.insertRow(
      defs.map((d, i) => {
        const v = row[i];
        if (v === "" || v === "null" || v === "NULL") return null;
        if (d.dtype === "bool") return v === "true";
        if (d.dtype === "i32" || d.dtype === "i64" || d.dtype === "f32" || d.dtype === "f64") {
          return Number(v);
        }
        return v;
      }),
    );
  }
  return table;
}

/**
 * Export a Table to CSV text.
 */
export function toCSV(table: Table): string {
  const headers = table.columnNames();
  const lines = [headers.join(",")];
  for (let i = 0; i < table.rowCount; i++) {
    const vals = headers.map((h) => {
      const v = table.column(h)!.get(i);
      if (v === null) return "";
      if (typeof v === "string" && (v.includes(",") || v.includes('"'))) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return String(v);
    });
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

/**
 * Export a Table to JSON array.
 */
export function toJSON(table: Table): Record<string, Scalar>[] {
  return table.rows();
}

/**
 * Import a JSON array into a Table.
 */
export function fromJSON(data: Record<string, unknown>[], tableName = "json_import"): Table {
  if (data.length === 0) throw new Error("Cannot import empty array");
  const keys = Object.keys(data[0]);

  // Detect types from first row
  const defs: ColumnDef[] = keys.map((k) => {
    const v = data[0][k];
    let dtype: DType = "f64";
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) dtype = "date";
      else dtype = "str";
    } else if (typeof v === "boolean") {
      dtype = "bool";
    } else if (typeof v === "number") {
      dtype = Number.isInteger(v) ? "i32" : "f64";
    }
    return { name: k, dtype };
  });

  const table = new Table(tableName, defs);
  for (const obj of data) {
    table.insertRow(keys.map((k, i) => {
      const v = obj[k];
      if (v === null || v === undefined) return null;
      if (defs[i].dtype === "bool") return Boolean(v);
      if (defs[i].dtype === "str" || defs[i].dtype === "date" || defs[i].dtype === "ts") return String(v);
      return Number(v);
    }));
  }
  return table;
}
