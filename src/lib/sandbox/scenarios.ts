/**
 * Sandbox Scenarios
 *
 * Pre-built configuration templates for common sandbox use cases.
 * Each scenario defines isolation level, policies, initial files,
 * and setup scripts for a specific purpose.
 */

import type { SandboxScenario, SandboxPolicy } from "./types";

// ─── Scenario Definitions ────────────────────────────────────────────────────

export const SCENARIOS: SandboxScenario[] = [
  // ── Testing Scenarios ──
  {
    id: "test-unit",
    name: "Unit Test Runner",
    description: "Isolated environment for running unit tests with captured output and assertions",
    category: "testing",
    isolationLevel: "basic",
    policyOverrides: {
      network: { allowAll: false, allowPatterns: [], blockPatterns: ["*"], allowWebSockets: false, allowFetch: false, maxConcurrentRequests: 0, requestTimeoutMs: 5000 },
      allowEval: true,
      allowParentAccess: true,
      allowLocalStorage: false,
      allowSessionStorage: false,
      allowIndexedDB: false,
      allowCookies: false,
    },
    initialFiles: [
      { path: "/test/runner.ts", content: `// Unit test runner\ninterface TestResult { name: string; passed: boolean; duration: number; error?: string; }\nconst results: TestResult[] = [];\nfunction test(name: string, fn: () => void | Promise<void>) {\n  const start = performance.now();\n  try {\n    const result = fn();\n    if (result instanceof Promise) {\n      return result.then(() => {\n        results.push({ name, passed: true, duration: performance.now() - start });\n      }).catch(e => {\n        results.push({ name, passed: false, duration: performance.now() - start, error: String(e) });\n      });\n    }\n    results.push({ name, passed: true, duration: performance.now() - start });\n  } catch (e) {\n    results.push({ name, passed: false, duration: performance.now() - start, error: String(e) });\n  }\n}\nfunction expect(actual: unknown) {\n  return {\n    toBe: (expected: unknown) => { if (actual !== expected) throw new Error(\`Expected \${expected}, got \${actual}\`); },\n    toEqual: (expected: unknown) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(\`Expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`); },\n    toBeTruthy: () => { if (!actual) throw new Error(\`Expected truthy, got \${actual}\`); },\n    toBeFalsy: () => { if (actual) throw new Error(\`Expected falsy, got \${actual}\`); },\n    toContain: (item: unknown) => { if (!(actual as any)?.includes?.(item)) throw new Error(\`Expected to contain \${item}\`); },\n    toThrow: () => { try { (actual as any)(); throw new Error('Expected to throw'); } catch(e) { if (e instanceof Error && e.message === 'Expected to throw') throw e; } },\n  };\n}\nfunction getResults() { return results; }\n` },
    ],
    setupScripts: [],
    envVars: { NODE_ENV: "test" },
    tags: ["testing", "unit", "isolated"],
    icon: "FlaskConical",
    color: "#10b981",
  },
  {
    id: "test-integration",
    name: "Integration Test Sandbox",
    description: "Sandboxed environment for testing API integrations with network policy control",
    category: "testing",
    isolationLevel: "full",
    policyOverrides: {
      network: {
        allowAll: false,
        allowPatterns: ["https://api.stripe.com/*", "https://api.sendgrid.com/*", "https://api.example.com/*"],
        blockPatterns: [],
        allowWebSockets: false,
        allowFetch: true,
        maxConcurrentRequests: 5,
        requestTimeoutMs: 15000,
      },
      allowEval: false,
      allowParentAccess: true,
      allowLocalStorage: true,
      allowSessionStorage: false,
      allowIndexedDB: false,
      allowCookies: false,
    },
    initialFiles: [
      { path: "/test/integration.ts", content: "// Integration test setup\n// Network access is limited to configured API endpoints\n" },
    ],
    setupScripts: [],
    envVars: { NODE_ENV: "test", TEST_TYPE: "integration" },
    tags: ["testing", "integration", "api"],
    icon: "Link",
    color: "#3b82f6",
  },
  {
    id: "test-e2e",
    name: "E2E Test Sandbox",
    description: "Full isolation for end-to-end tests with network access and browser simulation",
    category: "testing",
    isolationLevel: "full",
    policyOverrides: {
      network: {
        allowAll: true,
        allowPatterns: [],
        blockPatterns: ["http://localhost:*"],
        allowWebSockets: true,
        allowFetch: true,
        maxConcurrentRequests: 10,
        requestTimeoutMs: 30000,
      },
      allowEval: false,
      allowParentAccess: true,
      allowLocalStorage: true,
      allowSessionStorage: true,
      allowIndexedDB: true,
      allowCookies: false,
    },
    initialFiles: [],
    setupScripts: [],
    envVars: { NODE_ENV: "test", TEST_TYPE: "e2e" },
    tags: ["testing", "e2e", "browser"],
    icon: "Monitor",
    color: "#8b5cf6",
  },

  // ── Development Scenarios ──
  {
    id: "dev-sandbox",
    name: "Development Sandbox",
    description: "Full-featured development environment with network access and all storage APIs",
    category: "development",
    isolationLevel: "full",
    policyOverrides: {
      network: {
        allowAll: true,
        allowPatterns: [],
        blockPatterns: [],
        allowWebSockets: true,
        allowFetch: true,
        maxConcurrentRequests: 20,
        requestTimeoutMs: 30000,
      },
      allowEval: true,
      allowParentAccess: true,
      allowLocalStorage: true,
      allowSessionStorage: true,
      allowIndexedDB: true,
      allowCookies: false,
    },
    initialFiles: [
      { path: "/workspace/index.ts", content: "// Development workspace\nconsole.log('Sandbox ready');\n" },
      { path: "/workspace/README.md", content: "# Development Sandbox\n\nThis sandbox has full network access and development tools." },
    ],
    setupScripts: [],
    envVars: { NODE_ENV: "development" },
    tags: ["development", "full-access"],
    icon: "Code",
    color: "#eab308",
  },
  {
    id: "dev-preview",
    name: "Preview Sandbox",
    description: "Preview environment with limited network access for testing UI changes",
    category: "development",
    isolationLevel: "basic",
    policyOverrides: {
      network: {
        allowAll: true,
        allowPatterns: [],
        blockPatterns: ["https://api.stripe.com/*", "https://api.paypal.com/*"],
        allowWebSockets: true,
        allowFetch: true,
        maxConcurrentRequests: 10,
        requestTimeoutMs: 15000,
      },
      allowEval: true,
      allowParentAccess: true,
      allowLocalStorage: true,
      allowSessionStorage: true,
      allowIndexedDB: true,
      allowCookies: true,
    },
    initialFiles: [],
    setupScripts: [],
    envVars: { NODE_ENV: "preview" },
    tags: ["development", "preview"],
    icon: "Eye",
    color: "#06b6d4",
  },

  // ── Production Simulation ──
  {
    id: "prod-sim",
    name: "Production Simulator",
    description: "Simulates production environment restrictions: no eval, limited storage, monitored network",
    category: "production",
    isolationLevel: "paranoid",
    policyOverrides: {
      network: {
        allowAll: false,
        allowPatterns: ["https://api.yourservice.com/*"],
        blockPatterns: [],
        allowWebSockets: true,
        allowFetch: true,
        maxConcurrentRequests: 5,
        requestTimeoutMs: 10000,
      },
      allowEval: false,
      allowParentAccess: false,
      allowLocalStorage: true,
      allowSessionStorage: false,
      allowIndexedDB: true,
      allowCookies: true,
    },
    initialFiles: [],
    setupScripts: [],
    envVars: { NODE_ENV: "production" },
    tags: ["production", "restricted", "monitored"],
    icon: "Server",
    color: "#ef4444",
  },

  // ── Security Scenarios ──
  {
    id: "security-audit",
    name: "Security Audit Sandbox",
    description: "Maximum isolation for running untrusted code: no network, no storage, time-limited",
    category: "security",
    isolationLevel: "paranoid",
    policyOverrides: {
      network: {
        allowAll: false,
        allowPatterns: [],
        blockPatterns: ["*"],
        allowWebSockets: false,
        allowFetch: false,
        maxConcurrentRequests: 0,
        requestTimeoutMs: 5000,
      },
      allowEval: false,
      allowParentAccess: false,
      allowLocalStorage: false,
      allowSessionStorage: false,
      allowIndexedDB: false,
      allowCookies: false,
    },
    initialFiles: [],
    setupScripts: [],
    envVars: {},
    tags: ["security", "untrusted", "air-gapped"],
    icon: "Shield",
    color: "#dc2626",
  },
  {
    id: "security-sandbox-code",
    name: "Untrusted Code Runner",
    description: "For executing user-submitted or AI-generated code safely",
    category: "security",
    isolationLevel: "paranoid",
    policyOverrides: {
      network: {
        allowAll: false,
        allowPatterns: [],
        blockPatterns: ["*"],
        allowWebSockets: false,
        allowFetch: false,
        maxConcurrentRequests: 0,
        requestTimeoutMs: 5000,
      },
      allowEval: false,
      allowParentAccess: false,
      allowLocalStorage: false,
      allowSessionStorage: false,
      allowIndexedDB: false,
      allowCookies: false,
    },
    initialFiles: [],
    setupScripts: [],
    envVars: {},
    tags: ["security", "code-execution", "untrusted"],
    icon: "Lock",
    color: "#991b1b",
  },

  // ── Performance Scenarios ──
  {
    id: "perf-stress",
    name: "Stress Test Sandbox",
    description: "High-limit sandbox for performance testing and load simulation",
    category: "performance",
    isolationLevel: "basic",
    policyOverrides: {
      network: {
        allowAll: true,
        allowPatterns: [],
        blockPatterns: [],
        allowWebSockets: true,
        allowFetch: true,
        maxConcurrentRequests: 50,
        requestTimeoutMs: 60000,
      },
      allowEval: true,
      allowParentAccess: true,
      allowLocalStorage: true,
      allowSessionStorage: true,
      allowIndexedDB: true,
      allowCookies: true,
    },
    initialFiles: [],
    setupScripts: [],
    envVars: { NODE_ENV: "test", PERF_TEST: "true" },
    tags: ["performance", "stress", "load-test"],
    icon: "Zap",
    color: "#f59e0b",
  },

  // ── Demo Scenarios ──
  {
    id: "demo-showcase",
    name: "Demo Showcase",
    description: "Limited sandbox for demonstrating features to clients or stakeholders",
    category: "demo",
    isolationLevel: "full",
    policyOverrides: {
      network: {
        allowAll: false,
        allowPatterns: ["https://httpbin.org/*"],
        blockPatterns: [],
        allowWebSockets: false,
        allowFetch: true,
        maxConcurrentRequests: 3,
        requestTimeoutMs: 10000,
      },
      allowEval: false,
      allowParentAccess: true,
      allowLocalStorage: false,
      allowSessionStorage: false,
      allowIndexedDB: false,
      allowCookies: false,
    },
    initialFiles: [
      { path: "/demo/index.ts", content: "// Demo workspace\nconsole.log('Welcome to the demo sandbox!');\n" },
    ],
    setupScripts: [],
    envVars: { MODE: "demo" },
    tags: ["demo", "showcase", "client"],
    icon: "Presentation",
    color: "#a855f7",
  },
  {
    id: "demo-tutorial",
    name: "Tutorial Sandbox",
    description: "Guided sandbox for teaching concepts with pre-loaded examples",
    category: "demo",
    isolationLevel: "basic",
    policyOverrides: {
      network: {
        allowAll: false,
        allowPatterns: ["https://jsonplaceholder.typicode.com/*"],
        blockPatterns: [],
        allowWebSockets: false,
        allowFetch: true,
        maxConcurrentRequests: 3,
        requestTimeoutMs: 10000,
      },
      allowEval: true,
      allowParentAccess: true,
      allowLocalStorage: false,
      allowSessionStorage: false,
      allowIndexedDB: false,
      allowCookies: false,
    },
    initialFiles: [
      { path: "/tutorial/step1.ts", content: "// Step 1: Variables and types\nconst greeting: string = 'Hello, sandbox!';\nconsole.log(greeting);\n" },
      { path: "/tutorial/step2.ts", content: "// Step 2: Functions\nfunction add(a: number, b: number): number {\n  return a + b;\n}\nconsole.log(add(2, 3));\n" },
      { path: "/tutorial/step3.ts", content: "// Step 3: Async/Await\nasync function fetchData() {\n  const response = await fetch('https://jsonplaceholder.typicode.com/todos/1');\n  const data = await response.json();\n  console.log(data);\n}\nfetchData();\n" },
    ],
    setupScripts: [],
    envVars: { MODE: "tutorial" },
    tags: ["demo", "tutorial", "learning"],
    icon: "GraduationCap",
    color: "#14b8a6",
  },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

/** Get scenario by ID */
export function getScenario(id: string): SandboxScenario | undefined {
  return SCENARIOS.find(s => s.id === id);
}

/** Get scenarios by category */
export function getScenariosByCategory(category: SandboxScenario["category"]): SandboxScenario[] {
  return SCENARIOS.filter(s => s.category === category);
}

/** Get scenarios by isolation level */
export function getScenariosByIsolation(level: SandboxScenario["isolationLevel"]): SandboxScenario[] {
  return SCENARIOS.filter(s => s.isolationLevel === level);
}

/** Search scenarios by tag */
export function searchScenarios(query: string): SandboxScenario[] {
  const q = query.toLowerCase();
  return SCENARIOS.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.tags.some(t => t.includes(q))
  );
}

/** Build a full SandboxPolicy from a scenario */
export function buildPolicyFromScenario(scenario: SandboxScenario): SandboxPolicy {
  return {
    network: {
      allowAll: false,
      allowPatterns: [],
      blockPatterns: ["*"],
      allowWebSockets: false,
      allowFetch: true,
      maxConcurrentRequests: 5,
      requestTimeoutMs: 10000,
      ...scenario.policyOverrides.network,
    },
    resources: {
      maxMemoryMB: 128,
      maxTimeSecs: 30,
      maxFileCount: 500,
      maxFileSizeMB: 50,
      maxCpuTimeSecs: 30,
    },
    allowParentAccess: true,
    allowLocalStorage: false,
    allowSessionStorage: false,
    allowIndexedDB: false,
    allowCookies: false,
    allowEval: false,
    envVars: { ...scenario.envVars },
    ...scenario.policyOverrides,
  } as SandboxPolicy;
}
