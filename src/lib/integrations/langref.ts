/**
 * Language Reference Library for SLM-Driven Code Generation
 *
 * This module provides a structured, queryable database of API signatures,
 * function prototypes, import statements, and working examples for:
 * - Python 3.12+ (pandas, numpy, scipy, flask, fastapi, requests, sqlite3, csv, json, os, sys)
 * - Java 21+ (java.util, java.io, java.net, java.sql, java.time, java.text)
 * - C++ 20 (STL containers, algorithms, filesystem, iostream, string, vector, map)
 * - C (POSIX, stdio, stdlib, string, math, time)
 * - JavaScript/TypeScript (browser APIs, Node.js fs, path, http, crypto, fetch)
 * - Rust (std::collections, std::fs, std::io, reqwest, serde, tokio)
 *
 * Design principle: SLM-optimized entries. Each entry is compact enough for
 * a 3-4B model to retrieve and use without overwhelming context windows.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProgrammingLanguage = "python" | "java" | "cpp" | "c" | "javascript" | "typescript" | "rust";

export type ApiCategory =
  | "core"
  | "io"
  | "collections"
  | "math"
  | "network"
  | "database"
  | "file-system"
  | "string"
  | "date-time"
  | "testing"
  | "web-framework"
  | "data-processing"
  | "crypto"
  | "concurrency"
  | "json"
  | "csv"
  | "os"
  | "regex"
  | "logging"
  | "cli";

export interface ApiEntry {
  /** Unique identifier like "python.pandas.read_csv" */
  id: string;
  /** Short name like "read_csv" */
  name: string;
  /** Full signature like "pd.read_csv(filepath_or_buffer, sep=',', ...)" */
  signature: string;
  /** Import/required include statement */
  import: string;
  /** Return type description */
  returns: string;
  /** When to use this function */
  whenToUse: string;
  /** Working example that compiles/runs */
  example: string;
  /** Common parameters with types */
  params: Array<{ name: string; type: string; required: boolean; description: string }>;
  /** Common errors or gotchas */
  gotchas?: string[];
  /** Version info */
  since?: string;
  /** Package name for install */
  package?: string;
}

export interface LanguageProfile {
  language: ProgrammingLanguage;
  displayName: string;
  version: string;
  fileExtension: string;
  compileCommand?: string;
  runCommand: string;
  packageManager?: string;
  installCommand?: string;
  entryPoint: string;
  /** Key differences from other languages that trip up SLMs */
  pitfalls: string[];
}

export interface ReferenceQuery {
  language?: ProgrammingLanguage;
  category?: ApiCategory;
  /** Search in name, description, example */
  search?: string;
  /** Get by exact ID */
  id?: string;
}

// ─── Language Profiles ─────────────────────────────────────────────────────────

export const LANGUAGE_PROFILES: Record<ProgrammingLanguage, LanguageProfile> = {
  python: {
    language: "python",
    displayName: "Python",
    version: "3.12+",
    fileExtension: ".py",
    runCommand: "python3 {file}",
    packageManager: "pip",
    installCommand: "pip install {package}",
    entryPoint: "if __name__ == '__main__':",
    pitfalls: [
      "Indentation is significant — use 4 spaces, never tabs",
      "f-strings use curly braces: f\"Hello {name}\"",
      "No semicolons needed (but allowed)",
      "List comprehension: [x for x in range(10)]",
      "Dictionary comprehension: {k: v for k, v in items}",
      "Type hints are optional but help SLMs: def func(x: int) -> str:",
      "async/await: async def fetch(): resp = await client.get(url)",
      "Context managers: with open('f.txt') as f: data = f.read()",
    ],
  },
  java: {
    language: "java",
    displayName: "Java",
    version: "21+",
    fileExtension: ".java",
    compileCommand: "javac {file}",
    runCommand: "java {class}",
    packageManager: "maven/gradle",
    entryPoint: "public static void main(String[] args)",
    pitfalls: [
      "Every file must have a public class matching the filename",
      "Semicolons required at end of statements",
      "All variables must be declared with types",
      "Generics use angle brackets: List<String>",
      "try-with-resources: try (var r = new BufferedReader(...)) {}",
      "Streams: list.stream().filter(x -> x > 0).collect(Collectors.toList())",
      "Records: record Point(int x, int y) {}",
      "Switch expressions: return switch(x) { case 1 -> \"one\"; default -> \"other\"; }",
    ],
  },
  cpp: {
    language: "cpp",
    displayName: "C++",
    version: "20+",
    fileExtension: ".cpp",
    compileCommand: "g++ -std=c++20 {file} -o {out}",
    runCommand: "./{out}",
    entryPoint: "int main()",
    pitfalls: [
      "Include guard or #pragma once for headers",
      "Use #include <iostream> not <iostream.h>",
      "std:: namespace: std::vector, std::string, std::cout",
      "Range-based for: for (const auto& item : container)",
      "Smart pointers: std::unique_ptr, std::shared_ptr",
      "Auto keyword: auto x = 42; deduces type",
      "Structured bindings: auto [key, value] = *map.begin();",
      "std::format for string formatting: std::format(\"{} is {}\", name, age)",
    ],
  },
  c: {
    language: "c",
    displayName: "C",
    version: "C23",
    fileExtension: ".c",
    compileCommand: "gcc -std=c23 {file} -o {out} -lm",
    runCommand: "./{out}",
    entryPoint: "int main(void)",
    pitfalls: [
      "Always include headers: #include <stdio.h>",
      "malloc returns void*, must cast: int *p = malloc(n * sizeof(int))",
      "Free what you malloc: free(p); p = NULL;",
      "String literals are const: const char *s = \"hello\";",
      "Array decay to pointers: void func(int arr[], int len)",
      "Use size_t for sizes: size_t len = strlen(s);",
      "Format specifiers: %d int, %f float, %s string, %p pointer, %zu size_t",
      "Null pointer: NULL (not nullptr like C++)",
    ],
  },
  javascript: {
    language: "javascript",
    displayName: "JavaScript",
    version: "ES2024+",
    fileExtension: ".js",
    runCommand: "node {file}",
    packageManager: "npm",
    installCommand: "npm install {package}",
    entryPoint: "// Top-level code",
    pitfalls: [
      "Use const/let, never var",
      "Template literals: `Hello ${name}`",
      "Destructuring: const {a, b} = obj; const [x, y] = arr;",
      "async/await: const data = await fetch(url).then(r => r.json())",
      "Array methods: .map(), .filter(), .reduce(), .find(), .some(), .every()",
      "Spread operator: [...arr], {...obj}",
      "Optional chaining: obj?.prop?.method()",
      "Nullish coalescing: value ?? defaultValue",
      "Promise.all for parallel: await Promise.all([p1, p2, p3])",
    ],
  },
  typescript: {
    language: "typescript",
    displayName: "TypeScript",
    version: "5.5+",
    fileExtension: ".ts",
    compileCommand: "tsc --noEmit {file}",
    runCommand: "npx tsx {file}",
    packageManager: "npm",
    installCommand: "npm install {package}",
    entryPoint: "// Top-level code",
    pitfalls: [
      "Type annotations after name: let x: number = 42",
      "Interface vs type: interface Foo { x: number } or type Foo = { x: number }",
      "Generic constraints: <T extends keyof Foo>",
      "Utility types: Partial<T>, Required<T>, Pick<T, K>, Omit<T, K>",
      "Type assertion: value as Type (not <Type>value in JSX)",
      "Null check: if (value !== null && value !== undefined)",
      "Discriminated unions: type Result = {ok: true, data: T} | {ok: false, error: string}",
    ],
  },
  rust: {
    language: "rust",
    displayName: "Rust",
    version: "1.75+",
    fileExtension: ".rs",
    compileCommand: "rustc {file} -o {out}",
    runCommand: "./{out}",
    packageManager: "cargo",
    installCommand: "cargo add {package}",
    entryPoint: "fn main()",
    pitfalls: [
      "let x: i32 = 42; // type after name",
      "Immutable by default: let mut x = 42; for mutable",
      "Pattern matching: match value { 1 => \"one\", _ => \"other\" }",
      "Option<T>: Some(value) or None — no null",
      "Result<T, E>: Ok(value) or Err(error) — no exceptions",
      "Vec![1, 2, 3] macro for vectors",
      "String vs &str: owned vs borrowed",
      "impl Block: impl MyStruct { fn new() -> Self { ... } }",
      "Trait bounds: fn func<T: Display + Clone>(x: T)",
    ],
  },
};

// ─── Reference Database ────────────────────────────────────────────────────────

export const LANGUAGE_REFERENCES: ApiEntry[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // PYTHON
  // ═══════════════════════════════════════════════════════════════════════════════

  // --- Python: pandas ---
  {
    id: "python.pandas.read_csv",
    name: "read_csv",
    signature: "pd.read_csv(filepath_or_buffer, sep=',', header=0, index_col=None, dtype=None, nrows=None, usecols=None)",
    import: "import pandas as pd",
    returns: "pd.DataFrame",
    whenToUse: "Read a CSV file into a DataFrame for data analysis",
    example: `import pandas as pd
df = pd.read_csv("data.csv")
print(df.head())
print(df.describe())`,
    params: [
      { name: "filepath_or_buffer", type: "str | Path | IO", required: true, description: "File path, URL, or file-like object" },
      { name: "sep", type: "str", required: false, description: "Field delimiter, default ','" },
      { name: "header", type: "int | None", required: false, description: "Row number for column names, default 0" },
      { name: "nrows", type: "int", required: false, description: "Number of rows to read" },
    ],
    gotchas: ["Use encoding='utf-8' or 'latin-1' for non-ASCII files", "Use na_values=['NA', ''] for missing data"],
    package: "pandas",
  },
  {
    id: "python.pandas.read_sql",
    name: "read_sql",
    signature: "pd.read_sql(sql, con, index_col=None, params=None)",
    import: "import pandas as pd",
    returns: "pd.DataFrame",
    whenToUse: "Execute SQL query and return results as DataFrame",
    example: `import pandas as pd
import sqlite3
conn = sqlite3.connect("db.sqlite")
df = pd.read_sql("SELECT * FROM users WHERE age > ?", conn, params=(25,))
print(df)`,
    params: [
      { name: "sql", type: "str", required: true, description: "SQL query string" },
      { name: "con", type: "sqlite3.Connection | sqlalchemy.Engine", required: true, description: "Database connection" },
      { name: "params", type: "tuple | dict", required: false, description: "Query parameters for parameterized queries" },
    ],
    package: "pandas",
  },
  {
    id: "python.pandas.to_csv",
    name: "to_csv",
    signature: "df.to_csv(path_or_buf=None, index=True, sep=',', encoding=None)",
    import: "import pandas as pd",
    returns: "None | str",
    whenToUse: "Write DataFrame to CSV file",
    example: `import pandas as pd
df = pd.DataFrame({"name": ["Alice", "Bob"], "age": [30, 25]})
df.to_csv("output.csv", index=False)`,
    params: [
      { name: "path_or_buf", type: "str | Path", required: false, description: "File path to write to" },
      { name: "index", type: "bool", required: false, description: "Write row names, default True" },
    ],
    package: "pandas",
  },
  {
    id: "python.pandas.DataFrame.groupby",
    name: "groupby",
    signature: "df.groupby(by, axis=0, as_index=True, sort=True)",
    import: "import pandas as pd",
    returns: "DataFrameGroupBy",
    whenToUse: "Group rows by column values and aggregate (sum, mean, count, etc.)",
    example: `import pandas as pd
df = pd.read_csv("sales.csv")
summary = df.groupby("region")["revenue"].sum().reset_index()
print(summary)`,
    params: [
      { name: "by", type: "str | list[str]", required: true, description: "Column(s) to group by" },
    ],
    package: "pandas",
  },
  {
    id: "python.pandas.DataFrame.merge",
    name: "merge",
    signature: "pd.merge(left, right, on=None, left_on=None, right_on=None, how='inner')",
    import: "import pandas as pd",
    returns: "pd.DataFrame",
    whenToUse: "Join two DataFrames on common columns (like SQL JOIN)",
    example: `import pandas as pd
orders = pd.read_csv("orders.csv")
customers = pd.read_csv("customers.csv")
result = pd.merge(orders, customers, on="customer_id", how="left")`,
    params: [
      { name: "left", type: "pd.DataFrame", required: true, description: "Left DataFrame" },
      { name: "right", type: "pd.DataFrame", required: true, description: "Right DataFrame" },
      { name: "on", type: "str | list[str]", required: false, description: "Column names to join on" },
      { name: "how", type: "str", required: false, description: "'inner', 'left', 'right', 'outer'" },
    ],
    package: "pandas",
  },

  // --- Python: numpy ---
  {
    id: "python.numpy.array",
    name: "array",
    signature: "np.array(object, dtype=None, copy=True, order='K', subok=False)",
    import: "import numpy as np",
    returns: "np.ndarray",
    whenToUse: "Create an n-dimensional array from a list or nested list",
    example: `import numpy as np
arr = np.array([1, 2, 3, 4, 5])
matrix = np.array([[1, 2, 3], [4, 5, 6]])
print(arr.shape, matrix.shape)`,
    params: [
      { name: "object", type: "list | tuple", required: true, description: "Data to convert to array" },
      { name: "dtype", type: "np.dtype", required: false, description: "Data type (np.float64, np.int32, etc.)" },
    ],
    package: "numpy",
  },
  {
    id: "python.numpy.linspace",
    name: "linspace",
    signature: "np.linspace(start, stop, num=50, endpoint=True, retstep=False)",
    import: "import numpy as np",
    returns: "np.ndarray",
    whenToUse: "Create evenly spaced numbers over a specified interval",
    example: `import numpy as np
# 100 points from 0 to 2π
x = np.linspace(0, 2 * np.pi, 100)
y = np.sin(x)`,
    params: [
      { name: "start", type: "float", required: true, description: "Start value" },
      { name: "stop", type: "float", required: true, description: "End value" },
      { name: "num", type: "int", required: false, description: "Number of points, default 50" },
    ],
    package: "numpy",
  },
  {
    id: "python.numpy.einsum",
    name: "einsum",
    signature: "np.einsum(subscripts, *operands, optimize=False)",
    import: "import numpy as np",
    returns: "np.ndarray",
    whenToUse: "Einstein summation for tensor operations (dot product, matrix multiply, transpose, trace)",
    example: `import numpy as np
A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])
# Matrix multiply
C = np.einsum('ij,jk->ik', A, B)
# Dot product
d = np.einsum('i,i->', np.array([1,2,3]), np.array([4,5,6]))`,
    params: [
      { name: "subscripts", type: "str", required: true, description: "Einstein summation notation" },
      { name: "operands", type: "np.ndarray...", required: true, description: "Arrays to operate on" },
    ],
    package: "numpy",
  },

  // --- Python: scipy ---
  {
    id: "python.scipy.integrate.solve_ivp",
    name: "solve_ivp",
    signature: "solve_ivp(fun, t_span, y0, method='RK45', t_eval=None, dense_output=False)",
    import: "from scipy.integrate import solve_ivp",
    returns: "OdeResult (object with .t, .y, .success, .message)",
    whenToUse: "Solve initial value problems for ODEs (ordinary differential equations)",
    example: `from scipy.integrate import solve_ivp
import numpy as np
# dy/dt = -2y, y(0) = 1
def ode(t, y):
    return [-2 * y[0]]
sol = solve_ivp(ode, [0, 5], [1.0], t_eval=np.linspace(0, 5, 100))
print(sol.t, sol.y[0])`,
    params: [
      { name: "fun", type: "callable(t, y) -> array_like", required: true, description: "ODE right-hand side" },
      { name: "t_span", type: "(float, float)", required: true, description: "Interval of integration (t0, tf)" },
      { name: "y0", type: "array_like", required: true, description: "Initial state" },
      { name: "method", type: "str", required: false, description: "'RK45', 'RK23', 'Radau', 'BDF', 'LSODA'" },
    ],
    package: "scipy",
  },
  {
    id: "python.scipy.optimize.minimize",
    name: "minimize",
    signature: "minimize(fun, x0, args=(), method='BFGS', jac=None, bounds=None, constraints=None)",
    import: "from scipy.optimize import minimize",
    returns: "OptimizeResult (with .x, .fun, .success, .message)",
    whenToUse: "Minimize a scalar function (find optimal parameters)",
    example: `from scipy.optimize import minimize
import numpy as np
# Minimize f(x,y) = (x-1)^2 + (y-2)^2
def objective(params):
    x, y = params
    return (x - 1)**2 + (y - 2)**2
result = minimize(objective, [0, 0])
print(result.x)  # [1., 2.]`,
    params: [
      { name: "fun", type: "callable(x, *args) -> float", required: true, description: "Objective function to minimize" },
      { name: "x0", type: "array_like", required: true, description: "Initial guess" },
      { name: "method", type: "str", required: false, description: "'BFGS', 'Nelder-Mead', 'L-BFGS-B', 'SLSQP'" },
    ],
    package: "scipy",
  },
  {
    id: "python.scipy.interpolate.interp1d",
    name: "interp1d",
    signature: "interp1d(x, y, kind='linear', fill_value='extrapolate', bounds_error=False)",
    import: "from scipy.interpolate import interp1d",
    returns: "interp1d object (callable)",
    whenToUse: "Interpolate 1D data (linear, cubic, etc.)",
    example: `from scipy.interpolate import interp1d
import numpy as np
x = np.array([0, 1, 2, 3, 4])
y = np.array([0, 2, 1, 3, 0])
f = interp1d(x, y, kind='cubic')
print(f(1.5))  # interpolated value at 1.5`,
    params: [
      { name: "x", type: "array_like", required: true, description: "x-coordinates of data points" },
      { name: "y", type: "array_like", required: true, description: "y-coordinates of data points" },
      { name: "kind", type: "str | int", required: false, description: "'linear', 'nearest', 'zero', 'slinear', 'quadratic', 'cubic'" },
    ],
    package: "scipy",
  },

  // --- Python: sqlite3 ---
  {
    id: "python.sqlite3.connect",
    name: "connect",
    signature: "sqlite3.connect(database, timeout=5.0, detect_types=0, isolation_level='DEFERRED')",
    import: "import sqlite3",
    returns: "sqlite3.Connection",
    whenToUse: "Open a connection to a SQLite database (creates file if not exists)",
    example: `import sqlite3
conn = sqlite3.connect("app.db")
cursor = conn.cursor()
cursor.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)")
cursor.execute("INSERT INTO users (name, age) VALUES (?, ?)", ("Alice", 30))
conn.commit()
conn.close()`,
    params: [
      { name: "database", type: "str | Path", required: true, description: "Database file path or ':memory:'" },
    ],
    gotchas: ["Always use parameterized queries (?) to prevent SQL injection", "Call conn.commit() after INSERT/UPDATE/DELETE"],
  },

  // --- Python: requests ---
  {
    id: "python.requests.get",
    name: "get",
    signature: "requests.get(url, params=None, headers=None, timeout=None, auth=None)",
    import: "import requests",
    returns: "requests.Response",
    whenToUse: "Make HTTP GET request to an API or website",
    example: `import requests
response = requests.get("https://api.github.com/users/octocat")
data = response.json()
print(data["name"])`,
    params: [
      { name: "url", type: "str", required: true, description: "URL to send request to" },
      { name: "params", type: "dict", required: false, description: "Query parameters" },
      { name: "headers", type: "dict", required: false, description: "HTTP headers" },
      { name: "timeout", type: "int", required: false, description: "Seconds to wait for response" },
    ],
    gotchas: ["Always check response.status_code before using response.json()", "Use timeout to avoid hanging"],
    package: "requests",
  },
  {
    id: "python.requests.post",
    name: "post",
    signature: "requests.post(url, data=None, json=None, headers=None, timeout=None)",
    import: "import requests",
    returns: "requests.Response",
    whenToUse: "Make HTTP POST request (send JSON body, form data, etc.)",
    example: `import requests
response = requests.post(
    "https://httpbin.org/post",
    json={"name": "Alice", "age": 30},
    headers={"Authorization": "Bearer token123"}
)
print(response.json())`,
    params: [
      { name: "url", type: "str", required: true, description: "URL to send request to" },
      { name: "json", type: "dict", required: false, description: "JSON body (auto-sets Content-Type)" },
      { name: "data", type: "str | bytes | dict", required: false, description: "Form data or raw body" },
    ],
    package: "requests",
  },

  // --- Python: flask ---
  {
    id: "python.flask.app",
    name: "Flask",
    signature: "Flask(__name__, static_folder=None, template_folder=None)",
    import: "from flask import Flask, request, jsonify",
    returns: "Flask app instance",
    whenToUse: "Create a simple web server or REST API",
    example: `from flask import Flask, request, jsonify
app = Flask(__name__)

@app.route("/api/users", methods=["GET"])
def get_users():
    return jsonify({"users": ["Alice", "Bob"]})

@app.route("/api/users", methods=["POST"])
def create_user():
    data = request.get_json()
    return jsonify({"created": data}), 201

if __name__ == "__main__":
    app.run(port=8080)`,
    params: [
      { name: "__name__", type: "str", required: true, description: "Module name, always __name__" },
    ],
    package: "flask",
  },

  // --- Python: fastapi ---
  {
    id: "python.fastapi.app",
    name: "FastAPI",
    signature: "FastAPI(title=None, description=None, version=None)",
    import: "from fastapi import FastAPI",
    returns: "FastAPI app instance",
    whenToUse: "Create a modern async REST API with automatic OpenAPI docs",
    example: `from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="My API")

class User(BaseModel):
    name: str
    age: int

@app.get("/users")
async def get_users():
    return {"users": ["Alice", "Bob"]}

@app.post("/users")
async def create_user(user: User):
    return {"created": user.dict()}`,
    params: [
      { name: "title", type: "str", required: false, description: "API title shown in docs" },
    ],
    package: "fastapi",
  },

  // --- Python: os/sys ---
  {
    id: "python.os.path.join",
    name: "join",
    signature: "os.path.join(path, *paths)",
    import: "import os",
    returns: "str",
    whenToUse: "Join path components in a portable way (works on Windows/Mac/Linux)",
    example: `import os
base = os.path.expanduser("~")
full_path = os.path.join(base, "documents", "data.csv")
print(full_path)  # /home/user/documents/data.csv`,
    params: [
      { name: "path", type: "str", required: true, description: "Base path" },
      { name: "paths", type: "str...", required: false, description: "Additional path components" },
    ],
  },
  {
    id: "python.os.listdir",
    name: "listdir",
    signature: "os.listdir(path='.')",
    import: "import os",
    returns: "list[str]",
    whenToUse: "List files and directories in a folder",
    example: `import os
files = os.listdir("/tmp")
python_files = [f for f in files if f.endswith(".py")]`,
    params: [
      { name: "path", type: "str", required: false, description: "Directory path, default current dir" },
    ],
  },
  {
    id: "python.sys.argv",
    name: "argv",
    signature: "sys.argv",
    import: "import sys",
    returns: "list[str]",
    whenToUse: "Get command-line arguments passed to a Python script",
    example: `import sys
if len(sys.argv) < 2:
    print("Usage: python script.py <filename>")
    sys.exit(1)
filename = sys.argv[1]
print(f"Processing {filename}")`,
    params: [],
  },

  // --- Python: json ---
  {
    id: "python.json.loads",
    name: "loads",
    signature: "json.loads(s, cls=None, object_hook=None, parse_float=None, parse_int=None)",
    import: "import json",
    returns: "Any (dict, list, str, int, float, bool, None)",
    whenToUse: "Parse a JSON string into a Python object",
    example: `import json
data = json.loads('{"name": "Alice", "scores": [95, 87, 92]}')
print(data["name"], data["scores"][0])`,
    params: [
      { name: "s", type: "str | bytes", required: true, description: "JSON string to parse" },
    ],
  },
  {
    id: "python.json.dumps",
    name: "dumps",
    signature: "json.dumps(obj, indent=None, ensure_ascii=True, default=None)",
    import: "import json",
    returns: "str",
    whenToUse: "Serialize a Python object to a JSON string",
    example: `import json
result = {"users": [{"name": "Alice", "age": 30}]}
print(json.dumps(result, indent=2))`,
    params: [
      { name: "obj", type: "Any", required: true, description: "Python object to serialize" },
      { name: "indent", type: "int", required: false, description: "Pretty-print with indentation" },
    ],
  },

  // --- Python: csv ---
  {
    id: "python.csv.reader",
    name: "reader",
    signature: "csv.reader(csvfile, dialect='excel', delimiter=',')",
    import: "import csv",
    returns: "csv.reader object (iterates rows as lists)",
    whenToUse: "Read CSV file row by row (lighter than pandas for small files)",
    example: `import csv
with open("data.csv", "r") as f:
    reader = csv.reader(f)
    header = next(reader)
    for row in reader:
        print(row)`,
    params: [
      { name: "csvfile", type: "file object", required: true, description: "File opened in text mode" },
    ],
  },

  // --- Python: datetime ---
  {
    id: "python.datetime.now",
    name: "datetime.now",
    signature: "datetime.datetime.now(tz=None)",
    import: "from datetime import datetime",
    returns: "datetime",
    whenToUse: "Get current date and time",
    example: `from datetime import datetime
now = datetime.now()
print(now.strftime("%Y-%m-%d %H:%M:%S"))`,
    params: [
      { name: "tz", type: "tzinfo", required: false, description: "Timezone, default local time" },
    ],
  },

  // --- Python: subprocess ---
  {
    id: "python.subprocess.run",
    name: "run",
    signature: "subprocess.run(args, capture_output=False, text=False, timeout=None, check=False)",
    import: "import subprocess",
    returns: "CompletedProcess",
    whenToUse: "Run a shell command and optionally capture output",
    example: `import subprocess
result = subprocess.run(["ls", "-la", "/tmp"], capture_output=True, text=True)
print(result.stdout)`,
    params: [
      { name: "args", type: "list[str] | str", required: true, description: "Command and arguments" },
      { name: "capture_output", type: "bool", required: false, description: "Capture stdout and stderr" },
      { name: "text", type: "bool", required: false, description: "Decode output as text" },
      { name: "check", type: "bool", required: false, description: "Raise CalledProcessError on non-zero exit" },
    ],
    gotchas: ["Use list form ['ls', '-la'] not string 'ls -la' for security"],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // JAVA
  // ═══════════════════════════════════════════════════════════════════════════════

  {
    id: "java.util.ArrayList",
    name: "ArrayList",
    signature: "new ArrayList<>(initialCapacity)",
    import: "import java.util.ArrayList;",
    returns: "ArrayList<E>",
    whenToUse: "Dynamic resizable array (like Python list or C++ vector)",
    example: `import java.util.ArrayList;
import java.util.List;

List<String> names = new ArrayList<>();
names.add("Alice");
names.add("Bob");
names.remove(0);
System.out.println(names.size()); // 1`,
    params: [
      { name: "initialCapacity", type: "int", required: false, description: "Initial capacity, default 10" },
    ],
  },
  {
    id: "java.util.HashMap",
    name: "HashMap",
    signature: "new HashMap<>(initialCapacity)",
    import: "import java.util.HashMap;",
    returns: "HashMap<K, V>",
    whenToUse: "Key-value storage (like Python dict or C++ map)",
    example: `import java.util.HashMap;
import java.util.Map;

Map<String, Integer> scores = new HashMap<>();
scores.put("Alice", 95);
scores.put("Bob", 87);
int aliceScore = scores.getOrDefault("Alice", 0);
scores.merge("Alice", 5, Integer::sum); // 100`,
    params: [
      { name: "initialCapacity", type: "int", required: false, description: "Initial capacity" },
    ],
  },
  {
    id: "java.util.stream.Stream",
    name: "stream",
    signature: "collection.stream() / Arrays.stream(array) / Stream.of(values)",
    import: "import java.util.stream.*;",
    returns: "Stream<T>",
    whenToUse: "Functional-style data processing (filter, map, reduce, collect)",
    example: `import java.util.*;
import java.util.stream.*;

List<Integer> numbers = List.of(1, 2, 3, 4, 5, 6, 7, 8);
List<Integer> evens = numbers.stream()
    .filter(n -> n % 2 == 0)
    .map(n -> n * n)
    .collect(Collectors.toList());
System.out.println(evens); // [4, 16, 36, 64]`,
    params: [],
  },
  {
    id: "java.io.Files.readAllLines",
    name: "readAllLines",
    signature: "Files.readAllLines(path, charset)",
    import: "import java.nio.file.Files;\nimport java.nio.file.Paths;",
    returns: "List<String>",
    whenToUse: "Read all lines from a file into a List",
    example: `import java.nio.file.*;
import java.util.List;

List<String> lines = Files.readAllLines(Paths.get("data.txt"));
for (String line : lines) {
    System.out.println(line);
}`,
    params: [
      { name: "path", type: "Path", required: true, description: "Path to the file" },
      { name: "charset", type: "Charset", required: false, description: "Character encoding, default UTF-8" },
    ],
  },
  {
    id: "java.net.http.HttpClient",
    name: "HttpClient",
    signature: "HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()",
    import: "import java.net.http.HttpClient;\nimport java.net.http.HttpRequest;\nimport java.net.http.HttpResponse;",
    returns: "HttpClient",
    whenToUse: "Make HTTP requests (Java 11+ built-in, no external deps)",
    example: `import java.net.URI;
import java.net.http.*;

HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("https://httpbin.org/get"))
    .header("Accept", "application/json")
    .GET()
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
    params: [],
  },
  {
    id: "java.sql.DriverManager",
    name: "getConnection",
    signature: "DriverManager.getConnection(url, user, password)",
    import: "import java.sql.*;",
    returns: "Connection",
    whenToUse: "Connect to a relational database (SQLite, MySQL, PostgreSQL)",
    example: `import java.sql.*;

Connection conn = DriverManager.getConnection("jdbc:sqlite:app.db");
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery("SELECT * FROM users");
while (rs.next()) {
    System.out.println(rs.getString("name") + ": " + rs.getInt("age"));
}
conn.close();`,
    params: [
      { name: "url", type: "String", required: true, description: "JDBC URL like jdbc:sqlite:db.sqlite" },
      { name: "user", type: "String", required: false, description: "Username" },
      { name: "password", type: "String", required: false, description: "Password" },
    ],
  },
  {
    id: "java.time.LocalDateTime",
    name: "LocalDateTime",
    signature: "LocalDateTime.now() / LocalDateTime.of(year, month, day, hour, minute)",
    import: "import java.time.LocalDateTime;\nimport java.time.format.DateTimeFormatter;",
    returns: "LocalDateTime",
    whenToUse: "Date and time without timezone (Java 8+ replacement for Date/Calendar)",
    example: `import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

LocalDateTime now = LocalDateTime.now();
String formatted = now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
System.out.println(formatted);`,
    params: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // C++
  // ═══════════════════════════════════════════════════════════════════════════════

  {
    id: "cpp.std.vector",
    name: "std::vector",
    signature: "std::vector<T> v; / std::vector<T> v(n, initial_value); / std::vector<T> v = {1, 2, 3};",
    import: "#include <vector>",
    returns: "std::vector<T>",
    whenToUse: "Dynamic array (like Python list). Most common container in C++.",
    example: `#include <vector>
#include <iostream>

int main() {
    std::vector<int> nums = {3, 1, 4, 1, 5, 9};
    nums.push_back(2);
    nums.pop_back();
    for (const auto& n : nums) {
        std::cout << n << " ";
    }
    // Output: 3 1 4 1 5
}`,
    params: [],
    gotchas: ["Use .emplace_back() instead of .push_back() for complex objects", "Use .reserve() to pre-allocate memory"],
  },
  {
    id: "cpp.std.map",
    name: "std::map / std::unordered_map",
    signature: "std::unordered_map<std::string, int> m; / std::map<std::string, int> m;",
    import: "#include <unordered_map>  // hash map\n#include <map>  // sorted map",
    returns: "std::map<K,V> or std::unordered_map<K,V>",
    whenToUse: "Key-value storage. unordered_map is faster (O(1) vs O(log n)).",
    example: `#include <unordered_map>
#include <string>
#include <iostream>

int main() {
    std::unordered_map<std::string, int> scores;
    scores["Alice"] = 95;
    scores["Bob"] = 87;
    
    if (scores.contains("Alice")) {  // C++20
        std::cout << scores["Alice"] << std::endl;
    }
}`,
    params: [],
  },
  {
    id: "cpp.std.filesystem",
    name: "std::filesystem",
    signature: "namespace fs = std::filesystem; / fs::path, fs::exists, fs::read_file, fs::create_directories",
    import: "#include <filesystem>\nnamespace fs = std::filesystem;",
    returns: "Various (path, bool, directory_iterator)",
    whenToUse: "File system operations: list dirs, check existence, copy, create dirs",
    example: `#include <filesystem>
#include <iostream>
namespace fs = std::filesystem;

int main() {
    for (const auto& entry : fs::directory_iterator("/tmp")) {
        std::cout << entry.path() << " " 
                  << entry.file_size() << " bytes" << std::endl;
    }
    fs::create_directories("output/subdir");
}`,
    params: [],
  },
  {
    id: "cpp.std.string",
    name: "std::string",
    signature: "std::string s = \"hello\"; / std::string::npos, .substr(), .find(), .append()",
    import: "#include <string>",
    returns: "std::string",
    whenToUse: "String manipulation in C++",
    example: `#include <string>
#include <iostream>

int main() {
    std::string s = "Hello, World!";
    size_t pos = s.find("World");
    std::string sub = s.substr(0, 5);
    s += " C++20";
    std::cout << sub << std::endl; // Hello
}`,
    params: [],
  },
  {
    id: "cpp.std.algorithm",
    name: "std::algorithm",
    signature: "std::sort(v.begin(), v.end()) / std::find(v.begin(), v.end(), val) / std::transform() / std::accumulate()",
    import: "#include <algorithm>\n#include <numeric>",
    returns: "Various",
    whenToUse: "Sort, search, transform, accumulate on containers",
    example: `#include <algorithm>
#include <vector>
#include <numeric>
#include <iostream>

int main() {
    std::vector<int> v = {5, 3, 1, 4, 2};
    std::sort(v.begin(), v.end());
    auto it = std::find(v.begin(), v.end(), 4);
    int sum = std::accumulate(v.begin(), v.end(), 0);
    std::cout << "Sum: " << sum << std::endl; // 15
}`,
    params: [],
  },
  {
    id: "cpp.std.iostream",
    name: "std::iostream",
    signature: "std::cin >> x; / std::cout << x << std::endl; / std::getline(cin, line)",
    import: "#include <iostream>\n#include <string>",
    returns: "Various",
    whenToUse: "Standard input/output in C++",
    example: `#include <iostream>
#include <string>

int main() {
    std::string line;
    std::cout << "Enter name: ";
    std::getline(std::cin, line);
    std::cout << "Hello, " << line << "!" << std::endl;
}`,
    params: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // C
  // ═══════════════════════════════════════════════════════════════════════════════

  {
    id: "c.stdio.printf",
    name: "printf",
    signature: "printf(const char *format, ...)",
    import: "#include <stdio.h>",
    returns: "int (number of characters printed)",
    whenToUse: "Formatted output to stdout",
    example: `#include <stdio.h>

int main() {
    int age = 30;
    double pi = 3.14159;
    const char *name = "Alice";
    printf("Name: %s, Age: %d, Pi: %.2f\\n", name, age, pi);
    return 0;
}`,
    params: [
      { name: "format", type: "const char *", required: true, description: "Format string with %specifiers" },
    ],
    gotchas: ["%d int, %f float, %s string, %p pointer, %zu size_t, %ld long"],
  },
  {
    id: "c.stdio.fopen",
    name: "fopen",
    signature: "FILE *fopen(const char *filename, const char *mode)",
    import: "#include <stdio.h>",
    returns: "FILE * (NULL on failure)",
    whenToUse: "Open a file for reading/writing",
    example: `#include <stdio.h>
#include <stdlib.h>

int main() {
    FILE *fp = fopen("data.txt", "r");
    if (fp == NULL) {
        perror("Error opening file");
        return 1;
    }
    char line[256];
    while (fgets(line, sizeof(line), fp) != NULL) {
        printf("%s", line);
    }
    fclose(fp);
    return 0;
}`,
    params: [
      { name: "filename", type: "const char *", required: true, description: "File path" },
      { name: "mode", type: "const char *", required: true, description: "\"r\" read, \"w\" write, \"a\" append, \"r+\" read-write" },
    ],
  },
  {
    id: "c.stdlib.malloc",
    name: "malloc",
    signature: "void *malloc(size_t size)",
    import: "#include <stdlib.h>",
    returns: "void * (pointer to allocated memory, NULL on failure)",
    whenToUse: "Allocate dynamic memory on the heap",
    example: `#include <stdlib.h>
#include <stdio.h>

int main() {
    int n = 100;
    int *arr = malloc(n * sizeof(int));
    if (arr == NULL) {
        fprintf(stderr, "malloc failed\\n");
        return 1;
    }
    for (int i = 0; i < n; i++) arr[i] = i * i;
    free(arr);
    return 0;
}`,
    params: [
      { name: "size", type: "size_t", required: true, description: "Number of bytes to allocate" },
    ],
    gotchas: ["Always check for NULL return", "Always free() what you malloc()", "Cast not needed in C: int *p = malloc(...)"],
  },
  {
    id: "c.string.strlen",
    name: "strlen",
    signature: "size_t strlen(const char *s)",
    import: "#include <string.h>",
    returns: "size_t",
    whenToUse: "Get length of a C string (null-terminated)",
    example: `#include <string.h>
#include <stdio.h>

int main() {
    const char *s = "Hello, World!";
    printf("Length: %zu\\n", strlen(s)); // 13
    return 0;
}`,
    params: [
      { name: "s", type: "const char *", required: true, description: "Null-terminated string" },
    ],
  },
  {
    id: "c.math.sqrt",
    name: "sqrt",
    signature: "double sqrt(double x)",
    import: "#include <math.h>",
    returns: "double",
    whenToUse: "Calculate square root",
    example: `#include <math.h>
#include <stdio.h>

int main() {
    double x = 144.0;
    printf("sqrt(%.1f) = %.1f\\n", x, sqrt(x)); // 12.0
    printf("pow(2,10) = %.0f\\n", pow(2, 10)); // 1024
    return 0;
}`,
    params: [
      { name: "x", type: "double", required: true, description: "Non-negative value" },
    ],
    gotchas: ["Link with -lm: gcc file.c -o file -lm"],
  },
  {
    id: "c.time.time",
    name: "time",
    signature: "time_t time(time_t *timer)",
    import: "#include <time.h>",
    returns: "time_t (seconds since Unix epoch)",
    whenToUse: "Get current time or measure elapsed time",
    example: `#include <time.h>
#include <stdio.h>

int main() {
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    char buf[64];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", t);
    printf("Current time: %s\\n", buf);
    return 0;
}`,
    params: [
      { name: "timer", type: "time_t *", required: false, description: "NULL or pointer to store time" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // JAVASCRIPT / TYPESCRIPT
  // ═══════════════════════════════════════════════════════════════════════════════

  {
    id: "js.fetch",
    name: "fetch",
    signature: "fetch(url, options?)",
    import: "// Built-in in Node.js 18+ and all browsers",
    returns: "Promise<Response>",
    whenToUse: "Make HTTP requests (GET, POST, PUT, DELETE)",
    example: `// GET
const res = await fetch("https://api.github.com/users/octocat");
const data = await res.json();
console.log(data.name);

// POST with JSON body
const created = await fetch("https://httpbin.org/post", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Alice", age: 30 }),
});
const result = await created.json();`,
    params: [
      { name: "url", type: "string | URL", required: true, description: "URL to fetch" },
      { name: "options", type: "RequestInit", required: false, description: "Method, headers, body, etc." },
    ],
  },
  {
    id: "js.fs.readFile",
    name: "fs.readFile",
    signature: "fs.readFile(path, options?, callback?) / fs.promises.readFile(path, options?)",
    import: "const fs = require('fs'); // or import * as fs from 'fs/promises'",
    returns: "Promise<Buffer> | Promise<string>",
    whenToUse: "Read file contents from disk (Node.js)",
    example: `const fs = require('fs/promises');
async function main() {
  const text = await fs.readFile('data.txt', 'utf-8');
  console.log(text);
  const binary = await fs.readFile('image.png');
  console.log(binary.length);
}
main();`,
    params: [
      { name: "path", type: "string | URL", required: true, description: "File path" },
      { name: "options", type: "string | object", required: false, description: "'utf-8' or { encoding: 'utf-8' }" },
    ],
  },
  {
    id: "js.fs.writeFile",
    name: "fs.writeFile",
    signature: "fs.writeFile(path, data, options?, callback?) / fs.promises.writeFile(path, data, options?)",
    import: "const fs = require('fs/promises');",
    returns: "Promise<void>",
    whenToUse: "Write data to a file (creates or overwrites)",
    example: `const fs = require('fs/promises');
await fs.writeFile('output.json', JSON.stringify(data, null, 2));`,
    params: [
      { name: "path", type: "string", required: true, description: "File path" },
      { name: "data", type: "string | Buffer", required: true, description: "Data to write" },
    ],
  },
  {
    id: "js.path.join",
    name: "path.join",
    signature: "path.join(...segments)",
    import: "const path = require('path');",
    returns: "string",
    whenToUse: "Join path segments (cross-platform safe)",
    example: `const path = require('path');
const fullPath = path.join(__dirname, 'data', 'input.csv');
console.log(fullPath);`,
    params: [
      { name: "segments", type: "string...", required: true, description: "Path segments to join" },
    ],
  },
  {
    id: "js.JSON.parse",
    name: "JSON.parse",
    signature: "JSON.parse(text, reviver?)",
    import: "// Built-in",
    returns: "any",
    whenToUse: "Parse JSON string into JavaScript object",
    example: `const data = JSON.parse('{"name": "Alice", "scores": [95, 87]}');
console.log(data.name, data.scores[0]);`,
    params: [
      { name: "text", type: "string", required: true, description: "JSON string" },
    ],
  },
  {
    id: "js.Array.map",
    name: "map",
    signature: "array.map(callback(currentValue, index, array))",
    import: "// Built-in Array method",
    returns: "Array",
    whenToUse: "Transform each element of an array",
    example: `const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log(doubled); // [2, 4, 6, 8, 10]`,
    params: [
      { name: "callback", type: "Function", required: true, description: "Transformation function" },
    ],
  },
  {
    id: "js.Array.filter",
    name: "filter",
    signature: "array.filter(callback(element, index, array))",
    import: "// Built-in Array method",
    returns: "Array",
    whenToUse: "Select elements matching a condition",
    example: `const users = [{name: "Alice", age: 30}, {name: "Bob", age: 25}];
const adults = users.filter(u => u.age >= 18);
console.log(adults.length); // 2`,
    params: [
      { name: "callback", type: "Function", required: true, description: "Predicate function (return true to keep)" },
    ],
  },
  {
    id: "js.crypto.randomUUID",
    name: "randomUUID",
    signature: "crypto.randomUUID()",
    import: "const crypto = require('crypto'); // or: const { randomUUID } = require('crypto');",
    returns: "string (UUID v4)",
    whenToUse: "Generate a cryptographically random UUID",
    example: `const { randomUUID } = require('crypto');
const id = randomUUID();
console.log(id); // "3b241101-e2bb-4d7a-8702-..."`,
    params: [],
  },
  {
    id: "js.child_process.exec",
    name: "exec",
    signature: "child_process.exec(command, options?, callback?)",
    import: "const { exec } = require('child_process');",
    returns: "ChildProcess",
    whenToUse: "Run a shell command and capture output",
    example: `const { execSync } = require('child_process');
const output = execSync('ls -la /tmp', { encoding: 'utf-8' });
console.log(output);`,
    params: [
      { name: "command", type: "string", required: true, description: "Shell command" },
    ],
    gotchas: ["Use execSync for synchronous, exec for async", "Use execFileSync for better security (no shell injection)"],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // RUST
  // ═══════════════════════════════════════════════════════════════════════════════

  {
    id: "rust.std.fs.read_to_string",
    name: "read_to_string",
    signature: "std::fs::read_to_string(path)",
    import: "use std::fs;",
    returns: "Result<String, io::Error>",
    whenToUse: "Read entire file contents to a String",
    example: `use std::fs;

fn main() {
    let content = fs::read_to_string("data.txt").expect("Failed to read file");
    println!("{}", content);
}`,
    params: [
      { name: "path", type: "impl AsRef<Path>", required: true, description: "File path" },
    ],
  },
  {
    id: "rust.std.fs.write",
    name: "write",
    signature: "std::fs::write(path, contents)",
    import: "use std::fs;",
    returns: "Result<(), io::Error>",
    whenToUse: "Write bytes or string to a file (creates or overwrites)",
    example: `use std::fs;

fn main() {
    fs::write("output.txt", "Hello, World!").expect("Failed to write");
}`,
    params: [
      { name: "path", type: "impl AsRef<Path>", required: true, description: "File path" },
      { name: "contents", type: "impl AsRef<[u8]>", required: true, description: "Data to write" },
    ],
  },
  {
    id: "rust.std.collections.HashMap",
    name: "HashMap",
    signature: "HashMap::new() / HashMap::from([(k1, v1), (k2, v2)])",
    import: "use std::collections::HashMap;",
    returns: "HashMap<K, V>",
    whenToUse: "Key-value storage (like Python dict or C++ unordered_map)",
    example: `use std::collections::HashMap;

fn main() {
    let mut scores: HashMap<String, i32> = HashMap::new();
    scores.insert("Alice".to_string(), 95);
    scores.insert("Bob".to_string(), 87);
    
    if let Some(alice) = scores.get("Alice") {
        println!("Alice: {}", alice);
    }
}`,
    params: [],
  },
  {
    id: "rust.reqwest.get",
    name: "get",
    signature: "reqwest::get(url).await",
    import: "use reqwest;",
    returns: "Result<Response, reqwest::Error>",
    whenToUse: "Make HTTP requests in Rust (async)",
    example: `#[tokio::main]
async fn main() -> Result<(), reqwest::Error> {
    let resp = reqwest::get("https://httpbin.org/get").await?;
    let body = resp.text().await?;
    println!("{}", body);
    Ok(())
}`,
    params: [
      { name: "url", type: "&str", required: true, description: "URL to fetch" },
    ],
    package: "reqwest",
  },
  {
    id: "rust.serde.deserialize",
    name: "serde::Deserialize",
    signature: "#[derive(Deserialize)] struct MyStruct { ... }",
    import: "use serde::Deserialize;",
    returns: "Deserialized struct",
    whenToUse: "Deserialize JSON/TOML/YAML into Rust structs",
    example: `use serde::Deserialize;
use std::fs;

#[derive(Deserialize, Debug)]
struct User {
    name: String,
    age: u32,
}

fn main() {
    let data = r#"{"name": "Alice", "age": 30}"#;
    let user: User = serde_json::from_str(data).unwrap();
    println!("{:?}", user);
}`,
    params: [],
    package: "serde",
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // CROSS-LANGUAGE: Common Patterns
  // ═══════════════════════════════════════════════════════════════════════════════

  {
    id: "pattern.http_server",
    name: "HTTP Server Pattern",
    signature: "Create a simple REST API that responds to GET/POST",
    import: "// Varies by language",
    returns: "Running HTTP server",
    whenToUse: "Build a simple API endpoint",
    example: `# Python Flask
from flask import Flask, request, jsonify
app = Flask(__name__)

@app.route("/api/data", methods=["GET", "POST"])
def data():
    if request.method == "POST":
        body = request.get_json()
        return jsonify({"received": body}), 201
    return jsonify({"message": "GET endpoint"})

app.run(port=8080)`,
    params: [],
  },
  {
    id: "pattern.file_processor",
    name: "File Processing Pipeline",
    signature: "Read → Process → Write pattern",
    import: "// Varies by language",
    returns: "Processed file",
    whenToUse: "Batch process files (CSV→JSON, transform data, etc.)",
    example: `# Python: CSV to JSON
import csv, json

with open("input.csv") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

with open("output.json", "w") as f:
    json.dump(rows, f, indent=2)`,
    params: [],
  },
  {
    id: "pattern.database_crud",
    name: "Database CRUD Pattern",
    signature: "Create, Read, Update, Delete operations",
    import: "// Varies by language",
    returns: "CRUD operations",
    whenToUse: "Standard database operations for any entity",
    example: `# Python SQLite CRUD
import sqlite3

conn = sqlite3.connect("app.db")
c = conn.cursor()
c.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)")

# Create
c.execute("INSERT INTO users (name, email) VALUES (?, ?)", ("Alice", "a@b.com"))
# Read
c.execute("SELECT * FROM users WHERE name = ?", ("Alice",))
row = c.fetchone()
# Update
c.execute("UPDATE users SET email = ? WHERE name = ?", ("new@b.com", "Alice"))
# Delete
c.execute("DELETE FROM users WHERE name = ?", ("Alice",))
conn.commit()
conn.close()`,
    params: [],
  },
  {
    id: "pattern.async_concurrent",
    name: "Async/Concurrent Execution Pattern",
    signature: "Run multiple tasks concurrently",
    import: "// Varies by language",
    returns: "Concurrent results",
    whenToUse: "Parallel HTTP requests, concurrent file processing",
    example: `# Python asyncio + aiohttp
import asyncio
import aiohttp

async def fetch_url(session, url):
    async with session.get(url) as resp:
        return await resp.json()

async def main():
    urls = ["https://httpbin.org/delay/1"] * 5
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_url(session, u) for u in urls]
        results = await asyncio.gather(*tasks)
        print(f"Fetched {len(results)} URLs concurrently")

asyncio.run(main())`,
    params: [],
  },
  {
    id: "pattern.cli_tool",
    name: "CLI Tool Pattern",
    signature: "Command-line argument parsing with help",
    import: "// Varies by language",
    returns: "CLI application",
    whenToUse: "Build command-line tools",
    example: `# Python argparse
import argparse

def main():
    parser = argparse.ArgumentParser(description="Process files")
    parser.add_argument("input", help="Input file path")
    parser.add_argument("-o", "--output", default="output.txt", help="Output file")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    
    if args.verbose:
        print(f"Processing {args.input}")

if __name__ == "__main__":
    main()`,
    params: [],
  },
  {
    id: "pattern.json_api_client",
    name: "JSON API Client Pattern",
    signature: "Call REST API, parse JSON response, handle errors",
    import: "// Varies by language",
    returns: "API response data",
    whenToUse: "Integrate with any REST API",
    example: `# Python requests
import requests

def call_api(url, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e.response.status_code}")
    except requests.exceptions.ConnectionError:
        print("Connection failed")
    except requests.exceptions.Timeout:
        print("Request timed out")
    return None

data = call_api("https://api.example.com/users")`,
    params: [],
  },
];

// ─── Reference Engine ──────────────────────────────────────────────────────────

/**
 * Search the language reference database.
 * Designed to be called by SLMs to find the right API for a task.
 */
export function searchReferences(query: ReferenceQuery): ApiEntry[] {
  let results = [...LANGUAGE_REFERENCES];

  if (query.language) {
    results = results.filter((r) => r.id.startsWith(query.language! + "."));
  }

  if (query.category) {
    results = results.filter((r) => {
      const profile = LANGUAGE_PROFILES[r.id.split(".")[0] as ProgrammingLanguage];
      return profile !== undefined;
    });
  }

  if (query.id) {
    results = results.filter((r) => r.id === query.id);
  }

  if (query.search) {
    const term = query.search.toLowerCase();
    results = results.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.whenToUse.toLowerCase().includes(term) ||
        r.signature.toLowerCase().includes(term) ||
        r.id.toLowerCase().includes(term) ||
        r.example.toLowerCase().includes(term),
    );
  }

  return results;
}

/**
 * Get a compact, SLM-friendly reference card for an API.
 * Returns only what the model needs: signature, import, example, gotchas.
 */
export function getReferenceCard(id: string): string | null {
  const entry = LANGUAGE_REFERENCES.find((r) => r.id === id);
  if (!entry) return null;

  return [
    `### ${entry.name} (${entry.id})`,
    ``,
    `**When:** ${entry.whenToUse}`,
    `**Import:** \`${entry.import}\``,
    `**Signature:** \`${entry.signature}\``,
    `**Returns:** ${entry.returns}`,
    ``,
    `**Example:**`,
    "```" + entry.id.split(".")[0],
    entry.example,
    "```",
    ...(entry.gotchas ? [`**Gotchas:** ${entry.gotchas.join("; ")}`] : []),
    ...(entry.package ? [`**Package:** \`pip install ${entry.package}\` / \`npm install ${entry.package}\``] : []),
  ].join("\n");
}

/**
 * Get the full language profile for an SLM to understand the language.
 */
export function getLanguageProfile(lang: ProgrammingLanguage): LanguageProfile {
  return LANGUAGE_PROFILES[lang];
}

/**
 * Get all APIs for a specific language, in a compact format.
 * Useful for giving an SLM an overview of what's available.
 */
export function getLanguageOverview(lang: ProgrammingLanguage): string {
  const profile = LANGUAGE_PROFILES[lang];
  const apis = searchReferences({ language: lang });

  const lines = [
    `# ${profile.displayName} ${profile.version} Reference`,
    ``,
    `**File extension:** ${profile.fileExtension}`,
    `**Run:** \`${profile.runCommand}\``,
    ...(profile.compileCommand ? [`**Compile:** \`${profile.compileCommand}\``] : []),
    ...(profile.installCommand ? [`**Install:** \`${profile.installCommand}\``] : []),
    ``,
    `## Key Pitfalls`,
    ...profile.pitfalls.map((p) => `- ${p}`),
    ``,
    `## Available APIs (${apis.length} entries)`,
    ``,
    `| ID | Name | Purpose |`,
    `|----|------|---------|`,
    ...apis.map((a) => `| ${a.id} | ${a.name} | ${a.whenToUse} |`),
  ].join("\n");

  return lines;
}

/**
 * Generate a complete starter file for a given language and task.
 * This is what the SLM calls to get a working template.
 */
export function generateStarter(
  lang: ProgrammingLanguage,
  task: string,
): { code: string; imports: string[]; runCommand: string } {
  const profile = LANGUAGE_PROFILES[lang];
  const apis = searchReferences({ language: lang, search: task });

  // Collect unique imports
  const imports = [...new Set(apis.map((a) => a.import).filter(Boolean))];

  // Build starter code
  const examples = apis.slice(0, 3).map((a) => `// ${a.whenToUse}\n${a.example}`);

  let code = "";
  switch (lang) {
    case "python":
      code = [...imports, "", `# Task: ${task}`, ...examples, "", 'if __name__ == "__main__":', "    pass"].join("\n");
      break;
    case "java":
      code = [
        "import java.util.*;",
        ...imports,
        "",
        "public class Main {",
        "    public static void main(String[] args) {",
        `        // Task: ${task}`,
        `        System.out.println("TODO: Implement ${task}");`,
        "    }",
        "}",
      ].join("\n");
      break;
    case "cpp":
      code = [
        ...imports,
        "",
        `// Task: ${task}`,
        "int main() {",
        `    // TODO: Implement ${task}`,
        "    return 0;",
        "}",
      ].join("\n");
      break;
    case "c":
      code = [
        ...imports,
        "",
        `/* Task: ${task} */`,
        "int main(void) {",
        `    /* TODO: Implement ${task} */`,
        "    return 0;",
        "}",
      ].join("\n");
      break;
    case "javascript":
    case "typescript":
      code = [
        ...imports,
        "",
        `// Task: ${task}`,
        ...examples,
        "",
        "async function main() {",
        `  // TODO: Implement ${task}`,
        "}",
        "",
        "main().catch(console.error);",
      ].join("\n");
      break;
    case "rust":
      code = [
        ...imports,
        "",
        `// Task: ${task}`,
        "fn main() {",
        `    // TODO: Implement ${task}`,
        "}",
      ].join("\n");
      break;
  }

  return {
    code,
    imports,
    runCommand: profile.runCommand,
  };
}

/**
 * Count total references by language.
 */
export function getReferenceStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const entry of LANGUAGE_REFERENCES) {
    const lang = entry.id.split(".")[0];
    stats[lang] = (stats[lang] || 0) + 1;
  }
  return stats;
}
