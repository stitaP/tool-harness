/**
 * Executors for analytics.* (columnar DB: SQL/XQL/MDX, exports), ml.*, fault.*, text.*
 * and the numerical math.* tools declared in ml-tools.ts.
 * Tables live in a process-wide registry so tools can be chained in one session.
 */
import { Table, readCSV, toCSV, toJSON, fromJSON, type ColumnDef, type DType, type Scalar } from "@/lib/analytics/columnar";
import { executeQuery } from "@/lib/analytics/sql";
import { executeXQLQuery } from "@/lib/analytics/xql-engine";
import { executeMDXQuery } from "@/lib/analytics/mdx-engine";
import { exportTable } from "@/lib/analytics/export";
import {
  createModel, trainTestSplit, KMeans, PCA, ExponentialSmoothing, MovingAverage,
  LinearRegression, LogisticRegression, KNN, RandomForest, GradientBoosting, mean, stdDev, min, max,
  type MLModel, type Matrix, type Vector,
} from "@/lib/ml/engine";
import {
  zScoreDetector, madDetector, mahalanobisDistance, isolationForest, changePointDetector,
  spcXBarChart, ewmaChart, cusumChart, classifyFaults, summarizeFaults, DEFAULT_FAULT_RULES,
  type FaultEvent, type DiagnosticRule,
} from "@/lib/ml/fault-detection";
import {
  trainNaiveBayes, predictNaiveBayes, trainKNNClassifier, predictKNN, classifyByRules,
  extractKeywords, scoreSentiment, bm25Score, buildVocabulary,
} from "@/lib/ml/text-classifier";
import {
  polyFit, polyEval, polyDerivative, polySecondDerivative, polyToString, numericalGradient,
  simpson, trapezoidal, solveODE_Euler, solveODE_RK4, solveODE_System_RK4,
  solveHeatEquation1D, solveWaveEquation1D, solveLaplaceEquation2D, bisection, newtonRaphson, secant,
} from "@/lib/ml/numerical";
import { parse as parseExpr, evaluate as evalExpr, diff as diffExpr } from "@/lib/math/symbolic";
import { execs, json, num, str, bool, list, numList, r2, type ExecMap } from "./util";

// ─── table registry ──────────────────────────────────────────────────────────

const TABLES = new Map<string, Table>();
const getTable = (name: unknown): Table => {
  const n = str(name);
  const t = TABLES.get(n);
  if (!t) throw new Error(`table "${n}" not found. Available: ${[...TABLES.keys()].join(", ") || "(none — import data first with analytics.csv_import or analytics.json_import)"}`);
  return t;
};
const put = (name: string, t: Table): Table => { TABLES.set(name, t); return t; };
const preview = (t: Table, n = 20) => ({ table: t.name, rows: t.rowCount, columns: t.schema(), preview: t.rows().slice(0, n) });
const resultRows = (t: Table, n = 200) => ({ columns: t.columnNames(), rowCount: t.rowCount, rows: t.rows().slice(0, n), truncated: t.rowCount > n });

/** Register a table from other code (e.g. microfinance analytics). */
export function registerAnalyticsTable(name: string, t: Table): void { TABLES.set(name, t); }
export function analyticsTables(): Map<string, Table> { return TABLES; }

const DTYPES: DType[] = ["i32", "i64", "f32", "f64", "bool", "str", "date", "ts"];
const DTYPE_ALIASES: Record<string, DType> = { int: "i32", integer: "i32", bigint: "i64", float: "f64", double: "f64", number: "f64", string: "str", text: "str", varchar: "str", boolean: "bool", timestamp: "ts", datetime: "ts" };

function parseColumns(spec: unknown): ColumnDef[] {
  if (Array.isArray(spec)) return spec.map((c: any) => ({ name: String(c.name), dtype: (DTYPE_ALIASES[c.dtype ?? c.type] ?? c.dtype ?? c.type ?? "str") as DType }));
  return str(spec).split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [name, t = "str"] = p.split(":").map((x) => x.trim());
    const dtype = (DTYPES.includes(t as DType) ? t : DTYPE_ALIASES[t.toLowerCase()] ?? "str") as DType;
    return { name, dtype };
  });
}

/** The SQL engine has no FROM shortcut — support `tableName` by rewriting `FROM ?`/missing FROM. */
function sqlWithTable(q: string, tableName?: string): string {
  if (!tableName) return q;
  if (/\bfrom\b/i.test(q)) return q;
  return q.replace(/^\s*select\s+([\s\S]*?)(\s+(where|group|order|limit)\b|$)/i, (_m, cols, rest) => `SELECT ${cols} FROM ${tableName}${rest}`);
}

// ─── ML helpers ──────────────────────────────────────────────────────────────

function toXY(data: unknown, target = "target"): { X: Matrix; y: Vector; features: string[]; labels?: string[] } {
  const rows = json<Record<string, unknown>[]>(data);
  if (!Array.isArray(rows) || !rows.length) throw new Error("data must be a non-empty JSON array of objects");
  const features = Object.keys(rows[0]).filter((k) => k !== target);
  let labels: string[] | undefined;
  const rawY = rows.map((r) => r[target]);
  let y: Vector;
  if (rawY.some((v) => typeof v === "string" && Number.isNaN(Number(v)))) {
    labels = [...new Set(rawY.map(String))];
    y = rawY.map((v) => labels!.indexOf(String(v)));
  } else y = rawY.map((v) => num(v, NaN));
  const X = rows.map((r) => features.map((f) => num(r[f], 0)));
  return { X, y, features, labels };
}

function toMatrix(data: unknown): { X: Matrix; features: string[] } {
  const rows = json<any[]>(data);
  if (!Array.isArray(rows) || !rows.length) throw new Error("data must be a non-empty JSON array");
  if (Array.isArray(rows[0])) return { X: rows.map((r: any[]) => r.map((v) => num(v))), features: rows[0].map((_: unknown, i: number) => `x${i}`) };
  const features = Object.keys(rows[0]).filter((k) => k !== "target");
  return { X: rows.map((r) => features.map((f) => num(r[f], 0))), features };
}

const MODEL_CLASSES: Record<string, { deserialize(s: string): MLModel }> = {
  linear_regression: LinearRegression, logistic_regression: LogisticRegression, knn: KNN,
  random_forest: RandomForest, gradient_boosting: GradientBoosting,
};

/** modelJson = engine-serialized model, optionally wrapped with feature/label metadata by ml.train. */
function loadModel(modelJson: unknown): { model: MLModel; features?: string[]; labels?: string[] } {
  const raw = typeof modelJson === "string" ? modelJson : JSON.stringify(modelJson);
  const parsed = JSON.parse(raw);
  const inner = parsed.model ? (typeof parsed.model === "string" ? parsed.model : JSON.stringify(parsed.model)) : raw;
  const kind = JSON.parse(inner).kind;
  const C = MODEL_CLASSES[kind];
  if (!C) throw new Error(`unsupported model kind "${kind}"`);
  return { model: C.deserialize(inner), features: parsed.features, labels: parsed.labels };
}

function roundMetrics(m: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) out[k] = typeof v === "number" ? r2(v, 4) : v;
  return out;
}

/** Compile a user math expression (x / t / y / y0..yN) safely via the symbolic parser. */
function compile(expr: string) {
  const ast = parseExpr(expr);
  return (vars: Record<string, number>) => evalExpr(ast, vars);
}

// ─── text model (de)serialization: NaiveBayes uses Maps ────────────────────────

function nbToJSON(m: any) {
  return {
    labelLogProbs: [...m.labelLogProbs].map(([l, mp]: [string, Map<string, number>]) => [l, [...mp]]),
    logPriors: [...m.logPriors], labelWordCounts: [...m.labelWordCounts], vocabSize: m.vocabSize, terms: [...m.terms],
  };
}
function nbFromJSON(o: any) {
  return {
    labelLogProbs: new Map(o.labelLogProbs.map(([l, e]: [string, [string, number][]]) => [l, new Map(e)])),
    logPriors: new Map(o.logPriors), labelWordCounts: new Map(o.labelWordCounts), vocabSize: o.vocabSize, terms: new Set(o.terms),
  };
}
function vocabToJSON(v: any) { return JSON.parse(JSON.stringify(v, (_k, val) => (val instanceof Map ? { __map: [...val] } : val instanceof Set ? { __set: [...val] } : val))); }
function vocabFromJSON(v: any) { return JSON.parse(JSON.stringify(v), (_k, val) => (val && val.__map ? new Map(val.__map) : val && val.__set ? new Set(val.__set) : val)); }

// ─── executors ───────────────────────────────────────────────────────────────

export const ANALYTICS_EXECUTORS: ExecMap = execs({
  "analytics.csv_import": (i) => {
    const name = str(i.tableName, "csv_import");
    return preview(put(name, readCSV(str(i.csv), name)));
  },
  "analytics.json_import": (i) => {
    const name = str(i.tableName, "json_import");
    const data = json<Record<string, unknown>[]>(i.data);
    if (!Array.isArray(data)) throw new Error("data must be a JSON array of objects");
    return preview(put(name, fromJSON(data, name)));
  },
  "analytics.sql": (i) => resultRows(executeQuery(sqlWithTable(str(i.query), i.tableName ? str(i.tableName) : undefined), (n) => TABLES.get(n))),
  "analytics.window": (i) => resultRows(executeQuery(str(i.query), (n) => TABLES.get(n))),
  "analytics.xql": (i) => { const r = executeXQLQuery(str(i.query), (n) => TABLES.get(n)); return { columns: r.columns, rowCount: r.rows.length, rows: r.rows.slice(0, 200), meta: r.meta }; },
  "analytics.mdx": (i) => { const r = executeMDXQuery(str(i.query), TABLES); return { columns: r.columns, rowCount: r.rows.length, rows: r.rows.slice(0, 200), meta: r.meta }; },
  "analytics.describe": (i) => { const t = getTable(i.tableName); return { table: t.name, rows: t.rowCount, schema: t.schema(), stats: t.describe() }; },
  "analytics.csv_export": (i) => ({ filename: `${str(i.tableName)}.csv`, mimeType: "text/csv", content: toCSV(getTable(i.tableName)) }),
  "analytics.json_export": (i) => ({ filename: `${str(i.tableName)}.json`, rows: toJSON(getTable(i.tableName)) }),
  "analytics.export_powerbi": (i) => exportTable(getTable(i.tableName), "powerbi"),
  "analytics.export_excel": (i) => exportTable(getTable(i.tableName), str(i.format, "csv") === "xml" ? "excel-xml" : "excel"),
  "analytics.export_sheets": (i) => exportTable(getTable(i.tableName), "sheets"),
  "analytics.export_tableau": (i) => exportTable(getTable(i.tableName), "tableau"),
  "analytics.join": (i) => {
    const l = getTable(i.leftTable), r = getTable(i.rightTable);
    const name = str(i.resultName, "joined");
    return preview(put(name, l.join(r, str(i.onColumn))));
  },
  "analytics.groupby": (i) => {
    const t = getTable(i.tableName);
    const aggs = list(i.aggregations).map((a) => {
      const m = /^(count|sum|avg|mean|min|max)\s*\(\s*([^)]*)\s*\)(?:\s+as\s+(\w+))?$/i.exec(a.trim());
      if (!m) throw new Error(`bad aggregation "${a}" — use e.g. count(*), sum(amount), avg(price) as avg_price`);
      const fn = (m[1].toLowerCase() === "mean" ? "avg" : m[1].toLowerCase()) as "count" | "sum" | "avg" | "min" | "max";
      const col = m[2] === "*" || !m[2] ? t.columnNames()[0] : m[2];
      return { fn, col, as: m[3] };
    });
    const res = t.groupBy(list(i.groupBy), aggs);
    return preview(put(str(i.resultName, `${t.name}_grouped`), res), 50);
  },
  "analytics.sort": (i) => { const t = getTable(i.tableName); const s = put(t.name, t.sort(str(i.column), bool(i.descending))); return preview(s); },
  "analytics.filter": (i) => {
    const t = getTable(i.tableName);
    const col = str(i.column), op = str(i.op).toLowerCase(), raw = i.value;
    const cmp = (v: Scalar): boolean => {
      const n = Number(raw), vn = Number(v);
      const numeric = v !== null && v !== "" && !Number.isNaN(vn) && !Number.isNaN(n);
      switch (op) {
        case "eq": case "=": case "==": return numeric ? vn === n : String(v) === String(raw);
        case "neq": case "!=": case "<>": return numeric ? vn !== n : String(v) !== String(raw);
        case "gt": case ">": return numeric ? vn > n : String(v) > String(raw);
        case "lt": case "<": return numeric ? vn < n : String(v) < String(raw);
        case "gte": case ">=": return numeric ? vn >= n : String(v) >= String(raw);
        case "lte": case "<=": return numeric ? vn <= n : String(v) <= String(raw);
        case "contains": return String(v ?? "").toLowerCase().includes(String(raw).toLowerCase());
        case "startswith": return String(v ?? "").toLowerCase().startsWith(String(raw).toLowerCase());
        default: throw new Error(`unknown op "${op}" (eq, neq, gt, lt, gte, lte, contains, startswith)`);
      }
    };
    const res = t.filter((row) => cmp(row[col] ?? null));
    return preview(put(`${t.name}_filtered`, res), 50);
  },
  "analytics.create_table": (i) => { const name = str(i.tableName); return preview(put(name, new Table(name, parseColumns(i.columns)))); },
  "analytics.insert_rows": (i) => {
    const t = getTable(i.tableName);
    const rows = json<unknown[]>(i.rows);
    const names = t.columnNames();
    const arr = rows.map((r) => (Array.isArray(r) ? r : names.map((n) => (r as any)[n] ?? null)) as Scalar[]);
    t.insertRows(arr);
    return { table: t.name, inserted: arr.length, rows: t.rowCount };
  },
  "analytics.schema_export": (i) => {
    const t = getTable(i.tableName);
    const sqlType: Record<string, string> = { i32: "INTEGER", i64: "BIGINT", f32: "REAL", f64: "DOUBLE PRECISION", bool: "BOOLEAN", str: "TEXT", date: "DATE", ts: "TIMESTAMP" };
    return { schema: t.schema(), ddl: `CREATE TABLE ${t.name} (\n${t.schema().map((c) => `  ${c.name} ${sqlType[c.dtype] ?? "TEXT"}`).join(",\n")}\n);` };
  },

  // ── ML ──
  "ml.train": (i) => {
    const algo = str(i.algorithm);
    const { X, y, features, labels } = toXY(i.data);
    const hp = json<Record<string, unknown>>(i.hyperparams, {});
    const classification = algo === "logistic_regression" || !!labels || (algo !== "linear_regression" && y.every((v) => Number.isInteger(v)) && new Set(y).size <= Math.max(2, Math.sqrt(y.length)));
    const mode = (hp.mode as string) ?? (classification ? "classification" : "regression");
    const model = createModel(algo, { ...hp, mode }) as MLModel;
    if (typeof (model as any).fit !== "function" || typeof (model as any).serialize !== "function") throw new Error(`"${algo}" is not a supervised model`);
    const split = X.length >= 10 ? trainTestSplit(X, y, num(i.testSplit, 0.2)) : { X_train: X, y_train: y, X_test: X, y_test: y };
    model.fit(split.X_train, split.y_train);
    const metrics = roundMetrics(model.evaluate(split.X_test, split.y_test) as any);
    const modelJson = JSON.stringify({ model: JSON.parse(model.serialize()), features, labels });
    return { algorithm: algo, mode, trainRows: split.X_train.length, testRows: split.X_test.length, features, labels, metrics, modelJson };
  },
  "ml.predict": (i) => {
    const { model, features, labels } = loadModel(i.modelJson);
    const rows = json<any[]>(i.data);
    const X = rows.map((r) => (Array.isArray(r) ? r.map((v: unknown) => num(v)) : (features ?? Object.keys(r).filter((k) => k !== "target")).map((f) => num(r[f], 0))));
    const preds = model.predict(X);
    return { predictions: preds.map((p) => (labels ? labels[Math.round(p)] ?? p : r2(p, 4))) };
  },
  "ml.evaluate": (i) => {
    const { model, features, labels } = loadModel(i.modelJson);
    const rows = json<any[]>(i.data);
    const f = features ?? Object.keys(rows[0]).filter((k) => k !== "target");
    const X = rows.map((r) => f.map((k) => num(r[k], 0)));
    const y = rows.map((r) => (labels ? labels.indexOf(String(r.target)) : num(r.target)));
    return { rows: X.length, metrics: roundMetrics(model.evaluate(X, y) as any) };
  },
  "ml.cluster": (i) => {
    const { X, features } = toMatrix(i.data);
    const km = new KMeans(num(i.k), num(i.maxIter, 100));
    km.fit(X);
    const assignments = km.predict(X);
    const sil = km.silhouettes(X);
    const sizes: Record<number, number> = {};
    for (const a of assignments) sizes[a] = (sizes[a] ?? 0) + 1;
    return { features, assignments, clusterSizes: sizes, centroids: (km as any).centroids?.map((c: number[]) => c.map((v) => r2(v, 4))), inertia: r2(km.inertia(X), 4), meanSilhouette: r2(mean(sil), 4) };
  },
  "ml.pca": (i) => {
    const { X, features } = toMatrix(i.data);
    const res = new PCA(num(i.nComponents, 2)).fitTransform(X);
    return { features, nComponents: res.nComponents, explainedVariance: res.explainedVariance.map((v) => r2(v, 4)), loadings: res.loadings.map((r) => r.map((v) => r2(v, 4))), transformed: res.transformed.slice(0, 200).map((r) => r.map((v) => r2(v, 4))) };
  },
  "ml.forecast": (i) => {
    const series = numList(i.series);
    const h = num(i.horizon);
    if (str(i.method, "holt_winters") === "moving_average") {
      const ma = new MovingAverage(Math.min(20, series.length));
      const preds = ma.predict(series, h);
      const sd = stdDev(series.slice(-20));
      return { method: "moving_average", predictions: preds.map((v) => r2(v, 4)), confidence_lower: preds.map((v) => r2(v - 1.96 * sd, 4)), confidence_upper: preds.map((v) => r2(v + 1.96 * sd, 4)) };
    }
    const season = num(i.seasonLength, Math.min(12, Math.max(2, Math.floor(series.length / 2))));
    const es = new ExponentialSmoothing(0.3, 0.1, 0.1, season);
    es.fit(series);
    const f = es.forecast(h);
    return { method: "holt_winters", seasonLength: season, predictions: f.predictions.map((v) => r2(v, 4)), confidence_lower: f.confidence_lower.map((v) => r2(v, 4)), confidence_upper: f.confidence_upper.map((v) => r2(v, 4)) };
  },
  "ml.feature_importance": (i) => {
    const { model, features } = loadModel(i.modelJson);
    if (!(model instanceof RandomForest) && !("featureImportance" in (model as any))) throw new Error("feature importance needs a random_forest model");
    const names = i.featureNames ? list(i.featureNames) : features ?? [];
    const n = names.length || (model as any).maxFeatures || 0;
    const imp: number[] = (model as any).featureImportance(n);
    return { importance: imp.map((v, k) => ({ feature: names[k] ?? `x${k}`, score: r2(v, 4) })).sort((a, b) => b.score - a.score) };
  },
  "ml.preprocess": (i) => {
    let rows = json<Record<string, any>[]>(i.data);
    const ops = list(i.operations);
    const target = str(i.targetColumn, "target");
    const cols = Object.keys(rows[0] ?? {}).filter((c) => c !== target);
    const report: string[] = [];
    for (const op of ops) {
      if (op === "drop_missing") { const before = rows.length; rows = rows.filter((r) => Object.values(r).every((v) => v !== null && v !== undefined && v !== "")); report.push(`drop_missing: removed ${before - rows.length} rows`); }
      else if (op === "fill_missing") { for (const c of cols) { const vals = rows.map((r) => Number(r[c])).filter(Number.isFinite); const m = vals.length ? mean(vals) : 0; for (const r of rows) if (r[c] === null || r[c] === undefined || r[c] === "") r[c] = m; } report.push("fill_missing: numeric columns filled with mean"); }
      else if (op === "encode_categoricals") {
        for (const c of cols) if (rows.some((r) => typeof r[c] === "string" && Number.isNaN(Number(r[c])))) { const cats = [...new Set(rows.map((r) => String(r[c])))]; for (const r of rows) r[c] = cats.indexOf(String(r[c])); report.push(`encode_categoricals: ${c} → ${cats.length} codes`); }
      } else if (op === "normalize" || op === "standardize") {
        for (const c of cols) {
          const vals = rows.map((r) => Number(r[c]));
          if (vals.some((v) => !Number.isFinite(v))) continue;
          const lo = min(vals), hi = max(vals), mu = mean(vals), sd = stdDev(vals) || 1;
          for (const r of rows) r[c] = op === "normalize" ? (hi === lo ? 0 : r2((Number(r[c]) - lo) / (hi - lo), 6)) : r2((Number(r[c]) - mu) / sd, 6);
        }
        report.push(`${op}: numeric feature columns`);
      } else throw new Error(`unknown operation "${op}" (normalize, standardize, drop_missing, fill_missing, encode_categoricals)`);
    }
    return { rows: rows.length, report, data: rows };
  },

  // ── fault detection ──
  "fault.detect_anomalies": (i) => {
    const data = json<any[]>(i.data);
    const method = str(i.method, "z-score");
    const multi = Array.isArray(data[0]);
    const vec = multi ? (data as number[][]).map((r) => mean(r)) : (data as unknown[]).map((v) => num(v));
    const X = multi ? (data as number[][]) : vec.map((v) => [v]);
    const res = method === "mad" ? madDetector(vec, num(i.threshold, 3.5))
      : method === "mahalanobis" ? mahalanobisDistance(X, num(i.threshold, 3))
      : method === "isolation_forest" ? isolationForest(X, 100, Math.min(256, X.length), num(i.threshold, 0.1))
      : method === "change_point" ? changePointDetector(vec, num(i.windowSize, 20), num(i.threshold, 2.5))
      : zScoreDetector(vec, num(i.threshold, 3));
    return { summary: summarizeFaults(res), anomalies: res.filter((r) => r.isAnomaly).map((r) => ({ index: r.index, score: r2(r.score, 4), value: multi ? X[r.index] : vec[r.index] })) };
  },
  "fault.spc_chart": (i) => {
    const data = numList(i.data);
    const method = str(i.method, "xbar");
    if (method === "ewma") return ewmaChart(data, num(i.lambda, 0.2));
    if (method === "cusum") return cusumChart(data, mean(data), 0.5 * (stdDev(data) || 1), num(i.threshold, 5));
    // X̄ chart from consecutive subgroups of 5
    const size = 5, means: number[] = [], ranges: number[] = [];
    for (let k = 0; k + size <= data.length; k += size) { const g = data.slice(k, k + size); means.push(mean(g)); ranges.push(max(g) - min(g)); }
    if (means.length < 2) throw new Error("X̄ chart needs at least 10 measurements (subgroups of 5)");
    return { subgroupSize: size, ...spcXBarChart(means, ranges) };
  },
  "fault.classify": (i) => {
    const events = json<any[]>(i.events).map((e) => ({ timestamp: num(e.timestamp, Date.now()), faultType: str(e.faultType, "unknown"), severity: e.severity ?? "medium", source: str(e.source), details: e.details ?? {} })) as FaultEvent[];
    const custom = json<any[]>(i.rules, []);
    const rules: DiagnosticRule[] = custom.length
      ? custom.map((r) => {
          const kw = list(r.keywords).map((k) => k.toLowerCase());
          return {
            name: str(r.name, "rule"), severity: r.severity ?? "medium", diagnosis: str(r.diagnosis, r.name), recommendation: str(r.recommendation, "Investigate"),
            condition: (ev: FaultEvent) => { const hay = `${ev.faultType} ${ev.source} ${JSON.stringify(ev.details)}`.toLowerCase(); return kw.some((k) => hay.includes(k)); },
          };
        })
      : DEFAULT_FAULT_RULES;
    return { classified: classifyFaults(events, rules) };
  },

  // ── text ──
  "text.train_classifier": (i) => {
    const docs = list(i.documents), labels = list(i.labels);
    if (docs.length !== labels.length) throw new Error("documents and labels must have the same length");
    const method = str(i.method, "naive_bayes");
    if (method === "knn") { const m = trainKNNClassifier(docs, labels, num(i.k, 3)); return { method, classes: [...new Set(labels)], modelJson: JSON.stringify({ method, vocab: vocabToJSON(m.vocab), documents: m.documents, labels: m.labels, k: m.k }) }; }
    if (method === "keyword_rules") {
      const byLabel = new Map<string, string[]>();
      docs.forEach((d, k) => byLabel.set(labels[k], [...(byLabel.get(labels[k]) ?? []), d]));
      const rules = [...byLabel].map(([label, ds]) => ({ label, keywords: extractKeywords(ds.join(" "), 8).map((x: any) => x.keyword ?? x.term ?? x.word ?? String(x)), matchThreshold: 0.1 }));
      return { method, classes: rules.map((r) => r.label), rules, modelJson: JSON.stringify({ method, rules }) };
    }
    const nb = trainNaiveBayes(docs, labels);
    return { method: "naive_bayes", classes: [...nb.logPriors.keys()], vocabularySize: nb.vocabSize, modelJson: JSON.stringify({ method: "naive_bayes", model: nbToJSON(nb) }) };
  },
  "text.classify": (i) => {
    const m = json<any>(i.modelJson);
    const text = str(i.text);
    if (m.method === "knn") return predictKNN({ vocab: vocabFromJSON(m.vocab), documents: m.documents, labels: m.labels, k: m.k }, text);
    if (m.method === "keyword_rules") return classifyByRules(text, m.rules);
    return predictNaiveBayes(nbFromJSON(m.model) as any, text);
  },
  "text.extract_keywords": (i) => ({ keywords: extractKeywords(str(i.text), num(i.topN, 10)) }),
  "text.sentiment": (i) => scoreSentiment(str(i.text)),
  "text.bm25_rank": (i) => {
    const docs = list(i.documents);
    const scored = (bm25Score(str(i.query), docs) as any[]).sort((a, b) => b.score - a.score);
    return { results: scored.slice(0, num(i.topN, 5)).map((s: any) => ({ ...s, score: r2(s.score, 4), document: docs[s.docIndex] })) };
  },

  // ── numerical math (ml-tools) ──
  "math.poly_fit": (i) => { const r = polyFit(numList(i.x), numList(i.y), num(i.degree)); return { ...r, coefficients: r.coefficients.map((c) => r2(c, 6)), r2: r2(r.r2, 6), equation: polyToString(r.coefficients.map((c) => r2(c, 4))) }; },
  "math.derivative": (i) => {
    const type = str(i.functionType, "polynomial");
    if (i.expression) {
      const ast = parseExpr(str(i.expression));
      const d = diffExpr(ast, str(i.variable, "x"));
      const at = i.x !== undefined ? numList(Array.isArray(i.x) || String(i.x).startsWith("[") ? i.x : [i.x]) : [];
      return { derivative: d, values: at.map((x) => ({ x, value: r2(evalExpr(d, { x }), 8) })) };
    }
    const c = numList(i.coefficients);
    if (type === "second_polynomial") { const d = polySecondDerivative(c); return { coefficients: d, equation: polyToString(d) }; }
    if (type === "numerical_gradient") { const xs = numList(i.x); return { gradient: numericalGradient((v) => polyEval(c, v[0]), [xs[0] ?? 0]), at: xs }; }
    const d = polyDerivative(c);
    return { coefficients: d, equation: polyToString(d) };
  },
  "math.integrate": (i) => {
    const f = i.expression ? ((fx) => (x: number) => fx({ x }))(compile(str(i.expression))) : ((c) => (x: number) => polyEval(c, x))(numList(i.coefficients));
    const a = num(i.a), b = num(i.b), n = num(i.steps, 1000);
    const val = str(i.method, "simpson") === "trapezoidal" ? trapezoidal(f, a, b, n) : simpson(f, a, b, n % 2 ? n + 1 : n);
    return { integral: r2(val, 10), method: str(i.method, "simpson"), a, b, steps: n };
  },
  "math.solve_ode": (i) => {
    const expr = str(i.expression ?? i.f ?? "");
    if (!expr) throw new Error('provide expression, e.g. "-2*y + t" (dy/dt in terms of t and y; for systems use ";"-separated expressions in t, y0, y1, …)');
    const t0 = num(i.t0, 0), tEnd = num(i.tEnd), dt = num(i.dt, 0.01);
    const every = Math.max(1, Math.round((tEnd - t0) / dt / 100));
    if (str(i.type, "scalar") === "system") {
      const fs = expr.split(";").map((e) => compile(e.trim()));
      const y0 = numList(i.y0);
      const sol = solveODE_System_RK4((t, y) => fs.map((fn) => fn({ t, ...Object.fromEntries(y.map((v, k) => [`y${k}`, v])) })), t0, y0, tEnd, dt);
      const s: any = sol;
      return { method: "rk4", steps: s.t.length, t: s.t.filter((_: number, k: number) => k % every === 0).map((v: number) => r2(v, 6)), y: (s.y ?? s.Y).filter((_: number[], k: number) => k % every === 0).map((r: number[]) => r.map((v) => r2(v, 6))), final: (s.y ?? s.Y)[(s.y ?? s.Y).length - 1] };
    }
    const fn = compile(expr);
    const f = (t: number, y: number) => fn({ t, y, x: t });
    const sol = str(i.method, "rk4") === "euler" ? solveODE_Euler(f, t0, num(i.y0), tEnd, dt) : solveODE_RK4(f, t0, num(i.y0), tEnd, dt);
    const ys = sol.y.map((v: any) => (Array.isArray(v) ? v[0] : v));
    return { method: sol.method, steps: sol.t.length, t: sol.t.filter((_, k) => k % every === 0).map((v) => r2(v, 6)), y: ys.filter((_: number, k: number) => k % every === 0).map((v: number) => r2(v, 6)), final: { t: sol.t[sol.t.length - 1], y: ys[ys.length - 1] } };
  },
  "math.solve_pde": (i) => {
    const eq = str(i.equation, "heat");
    const L = num(i.L, 1), T = num(i.T, 1), nx = num(i.nx, 50), nt = num(i.nt, 1000);
    const u0 = i.initial ? ((fn) => (x: number) => fn({ x, L }))(compile(str(i.initial))) : (x: number) => Math.sin((Math.PI * x) / L);
    if (eq === "laplace") { const r = solveLaplaceEquation2D(nx, num(i.ny, nx)); return { equation: eq, iterations: r.iterations, converged: r.converged, grid: r.grid.map((row) => row.map((v) => r2(v, 4))) }; }
    const r = eq === "wave" ? solveWaveEquation1D(num(i.alpha, 1), L, T, nx, nt, u0) : solveHeatEquation1D(num(i.alpha, 0.01), L, T, nx, nt, u0);
    const final = r.grid[r.grid.length - 1] ?? [];
    return { equation: eq, nx, nt, x: r.x.map((v) => r2(v, 4)), final: final.map((v: number) => r2(v, 6)), maxValue: r2(Math.max(...final), 6) };
  },
  "math.find_root": (i) => {
    const expr = i.expression ? str(i.expression) : "";
    let f: (x: number) => number, df: (x: number) => number;
    if (expr) { const ast = parseExpr(expr); const d = diffExpr(ast, "x"); f = (x) => evalExpr(ast, { x }); df = (x) => evalExpr(d, { x }); }
    else if (i.coefficients) { const c = numList(i.coefficients); const dc = polyDerivative(c); f = (x) => polyEval(c, x); df = (x) => polyEval(dc, x); }
    else throw new Error('provide expression (e.g. "x^3 - 2*x - 5") or coefficients');
    const a = num(i.a), b = num(i.b, a + 1), tol = num(i.tolerance, 1e-8);
    const method = str(i.method, "bisection");
    const r = method === "newton_raphson" ? newtonRaphson(f, df, a, tol) : method === "secant" ? secant(f, a, b, tol) : bisection(f, a, b, tol);
    return { method, root: r2(r.root, 12), iterations: r.iterations, converged: r.converged, residual: f(r.root) };
  },
});

void buildVocabulary;
