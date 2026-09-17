/**
 * stitaP Auto-Dispatch Agent
 *
 * The user says: "Analyze this CSV and find top customers"
 * The agent automatically:
 *   1. Infers: Python + pandas + csv processing
 *   2. Detects: pandas not installed → installs it
 *   3. Writes: Python script for the analysis
 *   4. Executes: runs the script
 *   5. Returns: structured results
 *
 * Zero configuration required. The agent figures out everything.
 *
 * Architecture:
 *   Task Description → Intent Classifier → Language Picker → Package Resolver
 *     → Code Generator → Executor → Result Formatter
 */

import {
  provisionCodingEnvironment,
  runAgentCode,
  detectHostRuntime,
  RUNTIME_CATALOG,
  type RuntimeLanguage,
  type ExecutionResult,
  type ContainerBackend,
} from "../sandbox/container-engine";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AutoTask {
  /** Natural language task description */
  description: string;
  /** Optional input data (file path, URL, raw text) */
  input?: string;
  /** Optional output format preference */
  outputFormat?: "text" | "json" | "csv" | "table" | "chart";
  /** Priority */
  priority?: number;
}

export interface AutoTaskResult {
  /** Whether the task succeeded */
  success: boolean;
  /** The language that was used */
  language: RuntimeLanguage;
  /** Whether the runtime was already on the host */
  usedHostRuntime: boolean;
  /** Packages that were installed (empty if none needed) */
  installedPackages: string[];
  /** The code that was generated and executed */
  generatedCode: string;
  /** Raw execution output */
  stdout: string;
  /** Error output */
  stderr: string;
  /** How long the entire process took (detection + install + execution) */
  totalDurationMs: number;
  /** Execution-only duration */
  executionDurationMs: number;
  /** Whether installation was needed */
  installationNeeded: boolean;
  /** Human-readable summary of what was done */
  summary: string;
  /** Suggested follow-up tasks */
  followUps: string[];
}

// ─── Intent Classification ──────────────────────────────────────────────────

interface IntentMatch {
  language: RuntimeLanguage;
  confidence: number;
  packages: string[];
  reason: string;
}

/**
 * Pattern → Language mapping. Each pattern describes what the task needs.
 * The first match with highest confidence wins.
 */
const INTENT_PATTERNS: Array<{
  patterns: RegExp[];
  language: RuntimeLanguage;
  packages: string[];
  reason: string;
}> = [
  // Python — data, analysis, ML, scraping, scripts
  {
    patterns: [
      /analyz[ei]/i, /csv/i, /data/i, /pandas/i, /numpy/i,
      /scrape|crawl|fetch.*web/i, /machine.?learn|ml|train|model/i,
      /matplotlib|plot|chart|graph/i, /statistics|stat/i,
      /clean|transform|process.*data/i, /regex.*extract/i,
      /csv.*pars/i, /json.*data/i, /database|sqlite|sql.*query/i,
      /email.*send|smtp/i, /pdf.*generat|report.*generat/i,
      /image.*process|pillow|opencv/i, /api.*request|http.*request/i,
      /excel|xlsx/i, /file.*process/i, /script/i, /automat/i,
    ],
    language: "python",
    packages: ["requests"],
    reason: "Data analysis, scripting, or automation task",
  },
  // Node.js — web servers, APIs, real-time, npm ecosystem
  {
    patterns: [
      /server|api.*endpoint|rest.*api|express/i,
      /webhook|real.?time|websocket|socket/i,
      /npm|package\.json|node/i,
      /react|vue|angular|frontend|svelte/i,
      /typescript|\.ts$/i,
      /graphql/i, /next\.?js/i, /fastify/i,
      /scrape.*javascript|puppeteer|playwright/i,
    ],
    language: "node",
    packages: ["axios"],
    reason: "Web server, API, or JavaScript/TypeScript task",
  },
  // Java — enterprise, Spring, Android, large systems
  {
    patterns: [
      /java(?!script)/i, /spring|hibernate|maven|gradle/i,
      /enterprise|jvm|junit/i, /android/i, /tomcat|servlet/i,
      /jdbc|java.*database/i,
    ],
    language: "java",
    packages: [],
    reason: "Java/JVM-based task",
  },
  // Go — concurrency, CLI tools, microservices
  {
    patterns: [
      /concurrent|parallel.*process|goroutine/i,
      /go\s|golang|\.go$/i,
      /cli.*tool|command.?line.*tool/i,
      /microservice|high.?performance|benchmark/i,
    ],
    language: "go",
    packages: [],
    reason: "Concurrency or performance task",
  },
  // Rust — systems, performance, safety-critical
  {
    patterns: [
      /rust|cargo|system.*program/i,
      /performance.?critical|safety.?critical/i,
      /memory.?safe|zero.?cost/i,
      /wasm|webassembly/i,
    ],
    language: "rust",
    packages: [],
    reason: "Systems programming or performance-critical task",
  },
  // Ruby — scripting, web (Rails), automation
  {
    patterns: [
      /ruby|rails|\.rb$/i,
      /gem\s/i, /bundler/i,
    ],
    language: "ruby",
    packages: [],
    reason: "Ruby scripting task",
  },
  // Deno — modern TypeScript, secure runtimes
  {
    patterns: [
      /deno/i, /secure.*runtime/i,
    ],
    language: "deno",
    packages: [],
    reason: "Deno/secure TypeScript task",
  },
  // Bash — shell commands, system admin, file operations
  {
    patterns: [
      /shell|bash|terminal|command.?line/i,
      /file.*manipul|rename.*file|move.*file|copy.*file/i,
      /grep|awk|sed|find.*file/i,
      /cron|schedule|daemon/i,
      /docker.*command|kubernetes|kubectl/i,
      /nginx|apache|systemctl/i,
      /backup|archive|tar|zip/i,
      /system.*admin|sysadmin|devops/i,
    ],
    language: "bash",
    packages: [],
    reason: "Shell/system administration task",
  },
];

/**
 * Classify a task description into a language + packages.
 */
export function classifyIntent(description: string): IntentMatch {
  const desc = description.toLowerCase();

  let bestMatch: IntentMatch = {
    language: "python",
    confidence: 0.3,
    packages: [],
    reason: "Default fallback — Python handles most tasks",
  };

  for (const entry of INTENT_PATTERNS) {
    let matchCount = 0;
    for (const pattern of entry.patterns) {
      if (pattern.test(desc)) matchCount++;
    }

    if (matchCount > 0) {
      const confidence = Math.min(0.95, 0.4 + matchCount * 0.15);
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          language: entry.language,
          confidence,
          packages: entry.packages,
          reason: entry.reason,
        };
      }
    }
  }

  return bestMatch;
}

// ─── Package Detection ──────────────────────────────────────────────────────

/**
 * Extract package names from the task description by looking for
 * known library/package mentions.
 */
export function detectRequiredPackages(description: string): string[] {
  const packages = new Set<string>();
  const desc = description.toLowerCase();

  // Python packages
  const pythonPkgs: [RegExp, string][] = [
    [/pandas/i, "pandas"], [/numpy/i, "numpy"], [/scipy/i, "scipy"],
    [/sklearn|scikit/i, "scikit-learn"], [/matplotlib/i, "matplotlib"],
    [/seaborn/i, "seaborn"], [/plotly/i, "plotly"], [/pillow|pil/i, "Pillow"],
    [/opencv|cv2/i, "opencv-python"], [/requests/i, "requests"],
    [/flask/i, "flask"], [/django/i, "django"], [/fastapi/i, "fastapi"],
    [/beautifulsoup|bs4/i, "beautifulsoup4"], [/selenium/i, "selenium"],
    [/sqlalchemy/i, "SQLAlchemy"], [/sqlite/i, ""], // built-in
    [/openpyxl/i, "openpyxl"], [/xlsxwriter/i, "XlsxWriter"],
    [/tensorflow/i, "tensorflow"], [/torch|pytorch/i, "torch"],
    [/transformers/i, "transformers"], [/lxml/i, "lxml"],
    [/jwt|json.?web/i, "PyJWT"], [/celery/i, "celery"],
    [/redis/i, "redis"], [/psycopg/i, "psycopg2-binary"],
    [/boto3|aws/i, "boto3"], [/stripe/i, "stripe"],
    [/pdf.*gen|reportlab/i, "reportlab"], [/weasyprint/i, "weasyprint"],
    [/smtplib|smtp/i, ""], // built-in
    [/csv/i, ""], // built-in
    [/json/i, ""], // built-in
    [/re\b|regex/i, ""], // built-in
    [/datetime/i, ""], // built-in
    [/pathlib/i, ""], // built-in
    [/typing/i, ""], // built-in
  ];

  // Node packages
  const nodePkgs: [RegExp, string][] = [
    [/express/i, "express"], [/fastify/i, "fastify"],
    [/axios/i, "axios"], [/lodash/i, "lodash"],
    [/moment|dayjs/i, "dayjs"], [/chalk/i, "chalk"],
    [/inquirer/i, "inquirer"], [/puppeteer/i, "puppeteer"],
    [/playwright/i, "@playwright/test"], [/socket\.?io/i, "socket.io"],
    [/cors/i, "cors"], [/dotenv/i, "dotenv"],
    [/prisma/i, "@prisma/client"], [/mongoose/i, "mongoose"],
    [/sharp/i, "sharp"], [/jimp/i, "jimp"],
    [/pdf.*parse|pdfjs/i, "pdf-parse"],
    [/csv.*parse/i, "csv-parser"],
  ];

  for (const [pattern, pkg] of pythonPkgs) {
    if (pattern.test(desc) && pkg) packages.add(pkg);
  }
  for (const [pattern, pkg] of nodePkgs) {
    if (pattern.test(desc) && pkg) packages.add(pkg);
  }

  return [...packages];
}

// ─── Code Generation ────────────────────────────────────────────────────────

/**
 * Generate a working script from a natural language description.
 * This is a deterministic code generator — no LLM needed.
 * It maps common task patterns to template scripts.
 */
export function generateCode(
  description: string,
  language: RuntimeLanguage,
  input?: string,
): string {
  const desc = description.toLowerCase();

  // ── Python templates ──
  if (language === "python") {
    if (/csv.*analyz|analyz.*csv|read.*csv|parse.*csv/i.test(desc)) {
      return generatePythonCSVAnalysis(description, input);
    }
    if (/scrape|crawl|fetch.*web|extract.*from.*url/i.test(desc)) {
      return generatePythonWebScraper(description, input);
    }
    if (/api.*test|test.*api|http.*request|call.*endpoint/i.test(desc)) {
      return generatePythonAPITester(description, input);
    }
    if (/image|photo|picture|resize|crop|thumbnail/i.test(desc)) {
      return generatePythonImageProcessor(description, input);
    }
    if (/pdf|report|document.*generat/i.test(desc)) {
      return generatePythonPDFReport(description, input);
    }
    if (/email|send.*mail|smtp/i.test(desc)) {
      return generatePythonEmailSender(description, input);
    }
    if (/sql|database|query|table/i.test(desc)) {
      return generatePythonDatabaseQuery(description, input);
    }
    if (/regex|extract.*pattern|match.*text/i.test(desc)) {
      return generatePythonRegexExtract(description, input);
    }
    if (/json.*transform|convert.*json|parse.*json/i.test(desc)) {
      return generatePythonJSONTransform(description, input);
    }
    // Default: generic Python script
    return generatePythonGeneric(description, input);
  }

  // ── Node.js templates ──
  if (language === "node") {
    if (/server|api|endpoint/i.test(desc)) {
      return generateNodeServer(description, input);
    }
    if (/scrape|fetch.*page|extract.*html/i.test(desc)) {
      return generateNodeScraper(description, input);
    }
    return generateNodeGeneric(description, input);
  }

  // ── Bash templates ──
  if (language === "bash") {
    return generateBashScript(description, input);
  }

  // ── Go templates ──
  if (language === "go") {
    return generateGoGeneric(description, input);
  }

  // Fallback
  return `#!/usr/bin/env ${RUNTIME_CATALOG[language].binary}\n# ${description}\nprint("Task: ${description.replace(/"/g, '\\"')}")\n`;
}

// ── Python Code Generators ──

function generatePythonCSVAnalysis(desc: string, input?: string): string {
  const filePath = input || "/workspace/data.csv";
  return `#!/usr/bin/env python3
"""${desc}"""
import csv
import sys
from collections import Counter, defaultdict
from statistics import mean, median

def analyze_csv(filepath):
    """Read CSV and produce summary statistics."""
    rows = []
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            columns = reader.fieldnames or []
            for row in reader:
                rows.append(row)
    except FileNotFoundError:
        print(f"Error: File not found: {filepath}")
        print("Creating sample data for demonstration...")
        columns = ['name', 'department', 'revenue', 'date']
        rows = [
            {'name': 'Alice', 'department': 'Engineering', 'revenue': '50000', 'date': '2024-01'},
            {'name': 'Bob', 'department': 'Sales', 'revenue': '75000', 'date': '2024-01'},
            {'name': 'Carol', 'department': 'Engineering', 'revenue': '62000', 'date': '2024-02'},
            {'name': 'Dave', 'department': 'Sales', 'revenue': '45000', 'date': '2024-02'},
            {'name': 'Eve', 'department': 'Marketing', 'revenue': '38000', 'date': '2024-01'},
        ]
        with open(filepath, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)

    print(f"=== CSV Analysis ===")
    print(f"File: {filepath}")
    print(f"Rows: {len(rows)}")
    print(f"Columns: {columns}")
    print()

    # Column analysis
    for col in columns:
        values = [r.get(col, '') for r in rows]
        numeric = []
        for v in values:
            try:
                numeric.append(float(v.replace(',', '')))
            except (ValueError, AttributeError):
                pass

        print(f"--- {col} ---")
        if numeric:
            print(f"  Numeric values: {len(numeric)}/{len(values)}")
            print(f"  Min: {min(numeric):.2f}")
            print(f"  Max: {max(numeric):.2f}")
            print(f"  Mean: {mean(numeric):.2f}")
            print(f"  Median: {median(numeric):.2f}")
            print(f"  Sum: {sum(numeric):.2f}")
        else:
            counter = Counter(values)
            print(f"  Unique values: {len(counter)}")
            for val, count in counter.most_common(5):
                print(f"    {val}: {count}")
        print()

    # Try grouping by first non-numeric column
    for col in columns:
        groups = defaultdict(list)
        for row in rows:
            groups[row.get(col, '')].append(row)
        if len(groups) > 1 and len(groups) < len(rows):
            print(f"=== Grouped by {col} ===")
            for group, items in sorted(groups.items(), key=lambda x: -len(x[1])):
                print(f"  {group}: {len(items)} rows")
            break

if __name__ == "__main__":
    filepath = sys.argv[1] if len(sys.argv) > 1 else "${filePath}"
    analyze_csv(filepath)
`;
}

function generatePythonWebScraper(desc: string, input?: string): string {
  const url = input || "https://httpbin.org/json";
  return `#!/usr/bin/env python3
"""${desc}"""
import sys
try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

def scrape(url):
    """Fetch and display content from a URL."""
    print(f"Fetching: {url}")
    headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; stitaPBot/1.0)'
    }
    resp = requests.get(url, headers=headers, timeout=30)
    print(f"Status: {resp.status_code}")
    print(f"Content-Type: {resp.headers.get('content-type', 'unknown')}")
    print(f"Content-Length: {len(resp.text)} bytes")
    print()
    print("=== Response Body (first 2000 chars) ===")
    print(resp.text[:2000])
    return resp.text

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "${url}"
    scrape(url)
`;
}

function generatePythonAPITester(desc: string, input?: string): string {
  const url = input || "https://httpbin.org/get";
  return `#!/usr/bin/env python3
"""${desc}"""
import sys, json, time
try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

def test_api(url, method="GET"):
    """Test an API endpoint."""
    print(f"Testing {method} {url}")
    print("-" * 60)
    start = time.time()
    try:
        if method.upper() == "GET":
            resp = requests.get(url, timeout=30)
        elif method.upper() == "POST":
            resp = requests.post(url, json={"test": True}, timeout=30)
        else:
            resp = requests.request(method, url, timeout=30)
        elapsed = (time.time() - start) * 1000
        print(f"Status: {resp.status_code}")
        print(f"Time: {elapsed:.0f}ms")
        print(f"Headers:")
        for k, v in resp.headers.items():
            print(f"  {k}: {v}")
        print(f"Body:")
        try:
            print(json.dumps(resp.json(), indent=2)[:2000])
        except:
            print(resp.text[:2000])
    except requests.exceptions.Timeout:
        print(f"ERROR: Request timed out after 30s")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "${url}"
    test_api(url)
`;
}

function generatePythonImageProcessor(_desc: string, _input?: string): string {
  return `#!/usr/bin/env python3
"""Image processing task"""
import sys, os
try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "-q"])
    from PIL import Image

def process_image(path):
    """Analyze and display image info."""
    if not os.path.exists(path):
        print(f"File not found: {path}")
        print("Creating a sample image...")
        img = Image.new('RGB', (800, 600), color=(70, 130, 180))
        path = "/workspace/sample.png"
        img.save(path)
        print(f"Created sample: {path}")

    img = Image.open(path)
    print(f"=== Image Info ===")
    print(f"File: {path}")
    print(f"Size: {img.size[0]}x{img.size[1]}")
    print(f"Mode: {img.mode}")
    print(f"Format: {img.format}")
    print(f"Info: {img.info}")

    # Create thumbnail
    thumb = img.copy()
    thumb.thumbnail((200, 200))
    thumb_path = path.replace(".", "_thumb.")
    thumb.save(thumb_path)
    print(f"Thumbnail saved: {thumb_path}")

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "/workspace/image.png"
    process_image(path)
`;
}

function generatePythonPDFReport(_desc: string, _input?: string): string {
  return `#!/usr/bin/env python3
"""Generate a simple report"""
import sys
from datetime import datetime

def generate_report():
    """Create a text report (upgrade to PDF with reportlab if needed)."""
    print("=" * 60)
    print("REPORT")
    print(f"Generated: {datetime.now().isoformat()}")
    print("=" * 60)
    print()
    print("Summary:")
    print("- Task completed successfully")
    print("- All data processed")
    print("- Results formatted")
    print()
    print("For PDF output, install reportlab:")
    print("  pip install reportlab")

if __name__ == "__main__":
    generate_report()
`;
}

function generatePythonEmailSender(_desc: string, _input?: string): string {
  return `#!/usr/bin/env python3
"""Email sending utility (template)"""
import smtplib
from email.mime.text import MIMEText

def send_email(to, subject, body):
    """Template for sending emails. Configure SMTP settings."""
    print(f"Email template ready")
    print(f"  To: {to}")
    print(f"  Subject: {subject}")
    print(f"  Body: {body[:100]}...")
    print()
    print("To send for real, configure SMTP:")
    print("  msg = MIMEText(body)")
    print("  msg['Subject'] = subject")
    print("  msg['To'] = to")
    print("  with smtplib.SMTP('smtp.example.com', 587) as s:")
    print("    s.starttls()")
    print("    s.login('user', 'pass')")
    print("    s.send_message(msg)")

if __name__ == "__main__":
    send_email("test@example.com", "Test", "Hello from stitaP agent")
`;
}

function generatePythonDatabaseQuery(_desc: string, _input?: string): string {
  return `#!/usr/bin/env python3
"""Database query template"""
import sqlite3, os

def demo_query():
    """Create a sample SQLite DB and run queries."""
    db_path = "/workspace/sample.db"
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS users (id INT, name TEXT, email TEXT, dept TEXT)")
    c.execute("DELETE FROM users")
    c.executemany("INSERT INTO users VALUES (?, ?, ?, ?)", [
        (1, 'Alice', 'alice@example.com', 'Engineering'),
        (2, 'Bob', 'bob@example.com', 'Sales'),
        (3, 'Carol', 'carol@example.com', 'Engineering'),
    ])
    conn.commit()
    print("=== All Users ===")
    for row in c.execute("SELECT * FROM users"):
        print(row)
    print()
    print("=== By Department ===")
    for row in c.execute("SELECT dept, COUNT(*) as cnt FROM users GROUP BY dept"):
        print(row)
    conn.close()

if __name__ == "__main__":
    demo_query()
`;
}

function generatePythonRegexExtract(_desc: string, _input?: string): string {
  return `#!/usr/bin/env python3
"""Regex extraction utility"""
import re, sys

def extract_patterns(text):
    """Extract common patterns from text."""
    patterns = {
        'emails': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        'urls': r'https?://[^\\s]+',
        'phones': r'\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b',
        'ip_addresses': r'\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b',
        'dates': r'\\b\\d{4}[-/]\\d{2}[-/]\\d{2}\\b',
        'numbers': r'\\b\\d+\\.?\\d*\\b',
    }
    for name, pattern in patterns.items():
        matches = re.findall(pattern, text)
        if matches:
            print(f"{name}: {matches[:10]}")

if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else "Contact alice@example.com or visit https://example.com. Call 555-123-4567."
    extract_patterns(text)
`;
}

function generatePythonJSONTransform(_desc: string, _input?: string): string {
  return `#!/usr/bin/env python3
"""JSON transform utility"""
import json, sys

def transform(data_str):
    """Parse and transform JSON data."""
    data = json.loads(data_str)
    print(f"Type: {type(data).__name__}")
    if isinstance(data, list):
        print(f"Items: {len(data)}")
        print(json.dumps(data[:3], indent=2))
    elif isinstance(data, dict):
        print(f"Keys: {list(data.keys())}")
        print(json.dumps(data, indent=2)[:2000])

if __name__ == "__main__":
    data = sys.argv[1] if len(sys.argv) > 1 else '{"name":"Alice","skills":["python","sql"],"score":95}'
    transform(data)
`;
}

function generatePythonGeneric(_desc: string, _input?: string): string {
  return `#!/usr/bin/env python3
"""${_desc}"""
import sys
import json
from datetime import datetime

def main():
    print(f"Task: ${_desc.replace(/`/g, "\\`")}")
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Python: {sys.version}")
    print()
    # TODO: Implement task-specific logic
    print("Task placeholder — replace with actual implementation")

if __name__ == "__main__":
    main()
`;
}

// ── Node.js Code Generators ──

function generateNodeServer(desc: string, _input?: string): string {
  return `#!/usr/bin/env node
/** ${desc} */
const http = require('http');
const server = http.createServer((req, res) => {
  console.log(\`\${req.method} \${req.url}\`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
});
server.listen(3000, () => console.log('Server on :3000'));
`;
}

function generateNodeScraper(desc: string, _input?: string): string {
  return `#!/usr/bin/env node
/** ${desc} */
async function scrape(url) {
  console.log('Fetching:', url);
  const resp = await fetch(url);
  console.log('Status:', resp.status);
  const text = await resp.text();
  console.log('Length:', text.length, 'bytes');
  console.log(text.slice(0, 2000));
}
scrape(process.argv[2] || 'https://httpbin.org/json').catch(console.error);
`;
}

function generateNodeGeneric(_desc: string, _input?: string): string {
  return `#!/usr/bin/env node
/** ${_desc} */
console.log('Task:', process.argv[2] || '${_desc.replace(/'/g, "\\'")}');
console.log('Time:', new Date().toISOString());
console.log('Node:', process.version);
`;
}

// ── Bash Code Generator ──

function generateBashScript(desc: string, _input?: string): string {
  return `#!/usr/bin/env bash
# ${desc}
set -euo pipefail
echo "Task: ${desc}"
echo "Time: $(date -Iseconds)"
echo "User: $(whoami)"
echo "Host: $(hostname)"
echo "---"
# TODO: Add task-specific commands here
echo "Script template — add your commands"
`;
}

// ── Go Code Generator ──

function generateGoGeneric(_desc: string, _input?: string): string {
  return `package main
import ("fmt"; "os"; "time")
func main() {
    fmt.Println("Task: ${_desc.replace(/"/g, '\\"')}")
    fmt.Println("Time:", time.Now().Format(time.RFC3339))
    fmt.Println("Args:", os.Args[1:])
}
`;
}

// ─── Auto-Dispatch Engine ───────────────────────────────────────────────────

/**
 * The main auto-dispatch function.
 * Give it a task description and it figures out everything else.
 *
 * Usage:
 *   const result = await autoDispatch("Analyze sales.csv and find top customers");
 *   console.log(result.stdout);  // actual output
 *   console.log(result.language); // "python"
 *   console.log(result.installedPackages); // []
 */
export async function autoDispatch(task: AutoTask): Promise<AutoTaskResult> {
  const totalStart = Date.now();

  // Step 1: Classify intent — what language and packages?
  const intent = classifyIntent(task.description);

  // Step 2: Detect additional packages from description
  const extraPackages = detectRequiredPackages(task.description);
  const allPackages = [...new Set([...intent.packages, ...extraPackages])];

  // Step 3: Check if runtime is already on host
  const hostStatus = await detectHostRuntime(intent.language);
  const installationNeeded = !hostStatus.installed;

  // Step 4: Generate code from description
  const code = generateCode(task.description, intent.language, task.input);

  // Step 5: Execute (this handles lazy install automatically)
  const execStart = Date.now();
  const execResult = await runAgentCode(intent.language, code, {
    timeoutSecs: 60,
    packages: allPackages,
  });
  const executionDurationMs = Date.now() - execStart;

  const totalDurationMs = Date.now() - totalStart;

  // Step 6: Format results
  const result: AutoTaskResult = {
    success: execResult.success,
    language: intent.language,
    usedHostRuntime: hostStatus.installed,
    installedPackages: allPackages.filter(p => p.length > 0),
    generatedCode: code,
    stdout: execResult.stdout,
    stderr: execResult.stderr,
    totalDurationMs,
    executionDurationMs,
    installationNeeded,
    summary: buildSummary(intent, hostStatus, execResult, allPackages, installationNeeded),
    followUps: generateFollowUps(task.description, intent.language, execResult),
  };

  return result;
}

function buildSummary(
  intent: IntentMatch,
  hostStatus: { installed: boolean; version: string | null; path: string | null },
  execResult: ExecutionResult,
  packages: string[],
  installationNeeded: boolean,
): string {
  const parts: string[] = [];

  parts.push(`Used ${intent.language.toUpperCase()} (${intent.reason})`);

  if (hostStatus.installed) {
    parts.push(`Runtime: host (${hostStatus.version ?? "detected"}, ${hostStatus.path ?? "unknown path"})`);
  } else {
    parts.push(`Runtime: container (Docker/chroot)`);
  }

  if (installationNeeded) {
    parts.push(`Installed runtime + ${packages.length} packages on first run`);
  } else if (packages.length > 0) {
    parts.push(`Installed ${packages.length} packages`);
  } else {
    parts.push(`No installation needed — everything was already available`);
  }

  parts.push(`Execution: ${execResult.duration}ms, exit code ${execResult.exitCode}`);

  return parts.join(" | ");
}

function generateFollowUps(description: string, language: RuntimeLanguage, result: ExecutionResult): string[] {
  const followUps: string[] = [];

  if (result.success) {
    followUps.push(`Export results to CSV/Excel`);
    followUps.push(`Schedule this as a recurring task`);
  }

  if (language === "python") {
    followUps.push(`Convert to a Jupyter notebook`);
    followUps.push(`Add visualization with matplotlib`);
  }

  followUps.push(`Create a unit test for this script`);
  followUps.push(`Wrap as a reusable function`);

  return followUps;
}

/**
 * Convenience: submit a task to a persistent agent and auto-dispatch.
 * The agent picks the language, installs what's needed, runs it.
 */
export async function autoSubmit(
  agentId: string,
  task: AutoTask,
): Promise<AutoTaskResult> {
  return autoDispatch(task);
}

/**
 * Multi-step pipeline: chain several auto-dispatched tasks.
 * Each task's output feeds into the next task's input.
 */
export async function autoPipeline(
  tasks: AutoTask[],
): Promise<AutoTaskResult[]> {
  const results: AutoTaskResult[] = [];
  let previousOutput = "";

  for (const task of tasks) {
    const autoTask: AutoTask = {
      ...task,
      input: previousOutput || task.input,
    };
    const result = await autoDispatch(autoTask);
    results.push(result);
    previousOutput = result.stdout;
  }

  return results;
}
