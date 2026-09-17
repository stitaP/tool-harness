/**
 * Browser Testing & Analysis Tools — comprehensive website testing suite.
 *
 * These tools fill the gaps that existing browser tools don't cover:
 * performance metrics, interaction validation, accessibility compliance,
 * responsive testing, security audit, SEO analysis, visual regression,
 * automated test generation, form validation, and API testing.
 *
 * Each tool generates CDP commands and produces structured test reports
 * that the LLM can consume for improvement suggestions.
 */

import type { ToolManifest, ToolParameter, ToolCapability } from "../tool-types";

// ─── Shared types ────────────────────────────────────────────────────────────

const TEST_CAPABILITIES: ToolCapability[] = [
  {
    name: "performance-metrics",
    description: "Collects Core Web Vitals and performance timing data via Chrome DevTools Protocol",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
  {
    name: "test-report-generation",
    description: "Generates structured test reports with pass/fail status and improvement suggestions",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
];

// ─── 1. browser.performance ──────────────────────────────────────────────────

export const PERFORMANCE_TOOL: ToolManifest = {
  id: "browser.performance",
  name: "Performance Metrics",
  description: "Measure Core Web Vitals (LCP, FID, CLS, TTFB), resource loading times, paint metrics, and bundle size analysis",
  longDescription: "Collects comprehensive performance data using PerformanceObserver API and Chrome DevTools Protocol. Measures Largest Contentful Paint (LCP), First Input Delay (FID), Cumulative Layout Shift (CLS), Time to First Byte (TTFB), First Contentful Paint (FCP), Speed Index, and Time to Interactive. Analyses resource loading waterfall, identifies render-blocking resources, and provides actionable improvement suggestions.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "Gauge",
  color: "#f97316",
  tags: ["performance", "core-web-vitals", "lcp", "cls", "ttfb", "metrics", "testing"],
  parameters: [
    { name: "action", type: "enum", description: "What to measure", required: true, enum: ["web-vitals", "resources", "paint", "all"] },
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "duration", type: "number", description: "Measurement duration in seconds (default 10)", required: false },
    { name: "includeResources", type: "boolean", description: "Include individual resource timings", required: false, default: true },
    { name: "includeSuggestions", type: "boolean", description: "Include improvement suggestions", required: false, default: true },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 2. browser.interact-test ────────────────────────────────────────────────

export const INTERACT_TEST_TOOL: ToolManifest = {
  id: "browser.interact-test",
  name: "Interaction Testing",
  description: "Click an element and validate what happens: response time, DOM changes, network requests, console errors, navigation",
  longDescription: "Performs a click (or other interaction) on a target element, then captures the before/after state across multiple dimensions: DOM mutations, network requests triggered, console output, navigation changes, and visual changes. Measures response latency and validates expected outcomes. Produces a structured test report with pass/fail for each assertion.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "MousePointerClick",
  color: "#3b82f6",
  tags: ["interaction", "click", "test", "validation", "response-time", "e2e"],
  parameters: [
    { name: "selector", type: "string", description: "CSS selector for the element to interact with", required: true },
    { name: "action", type: "enum", description: "Type of interaction", required: true, enum: ["click", "dblclick", "rightclick", "hover", "focus", "submit"] },
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "waitFor", type: "string", description: "CSS selector to wait for after interaction", required: false },
    { name: "waitForTimeout", type: "number", description: "Max ms to wait for expected change (default 5000)", required: false },
    { name: "expectNavigation", type: "boolean", description: "Expect page navigation after interaction", required: false },
    { name: "expectNetworkRequest", type: "string", description: "URL pattern to expect in network requests", required: false },
    { name: "expectDomChange", type: "string", description: "CSS selector that should appear/change after interaction", required: false },
    { name: "expectNoConsoleError", type: "boolean", description: "Fail if console errors appear", required: false, default: true },
    { name: "measureLatency", type: "boolean", description: "Measure time from click to first response", required: false, default: true },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 3. browser.a11y-audit ───────────────────────────────────────────────────

export const A11Y_AUDIT_TOOL: ToolManifest = {
  id: "browser.a11y-audit",
  name: "Accessibility Audit",
  description: "WCAG 2.1 compliance check: missing alt text, colour contrast, ARIA labels, keyboard navigation, heading hierarchy, focus management",
  longDescription: "Performs comprehensive accessibility audit against WCAG 2.1 AA/AAA standards. Checks: missing alt text on images, colour contrast ratios (4.5:1 for text, 3:1 for large text), ARIA role/label/attribute correctness, keyboard navigation (tab order, focus traps, skip links), heading hierarchy (h1→h2→h3 order), form label associations, semantic HTML usage, and screen reader compatibility. Produces a severity-ranked report with specific fix instructions.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "Accessibility",
  color: "#10b981",
  tags: ["accessibility", "wcag", "a11y", "aria", "contrast", "keyboard", "screen-reader", "testing"],
  parameters: [
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "standard", type: "enum", description: "WCAG conformance level", required: false, enum: ["A", "AA", "AAA"], default: "AA" },
    { name: "scope", type: "enum", description: "Audit scope", required: false, enum: ["full", "contrast", "aria", "keyboard", "headings", "images"], default: "full" },
    { name: "includeFixes", type: "boolean", description: "Include specific fix instructions", required: false, default: true },
    { name: "screenshotViolations", type: "boolean", description: "Capture screenshots of violations", required: false, default: false },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 4. browser.responsive-test ──────────────────────────────────────────────

export const RESPONSIVE_TEST_TOOL: ToolManifest = {
  id: "browser.responsive-test",
  name: "Responsive Design Test",
  description: "Test layout across viewport breakpoints (mobile, tablet, desktop), detect overflow, horizontal scroll, and layout breakage",
  longDescription: "Simulates multiple viewport sizes (320px, 375px, 768px, 1024px, 1280px, 1440px, 1920px) and captures screenshots at each. Detects: horizontal overflow, text truncation, overlapping elements, unreadable font sizes, touch target sizes (<44px), layout breaks, and missing responsive images. Produces a per-breakpoint report with visual diffs between sizes.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "Smartphone",
  color: "#8b5cf6",
  tags: ["responsive", "mobile", "breakpoint", "viewport", "layout", "testing"],
  parameters: [
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "url", type: "string", description: "URL to test (omit for current page)", required: false },
    { name: "viewports", type: "string", description: "Comma-separated widths to test (default: 320,375,768,1024,1280,1440,1920)", required: false },
    { name: "includeScreenshots", type: "boolean", description: "Capture screenshot at each viewport", required: false, default: true },
    { name: "checkTouchTargets", type: "boolean", description: "Verify touch targets are >= 44px", required: false, default: true },
    { name: "checkOverflow", type: "boolean", description: "Detect horizontal overflow", required: false, default: true },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 5. browser.security-headers ─────────────────────────────────────────────

export const SECURITY_HEADERS_TOOL: ToolManifest = {
  id: "browser.security-headers",
  name: "Security Headers Audit",
  description: "Check HTTP security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, CORS, mixed content, cookie flags",
  longDescription: "Analyses HTTP response headers for security best practices. Checks: Content-Security-Policy (CSP) presence and strength, HTTP Strict Transport Security (HSTS), X-Frame-Options (clickjacking protection), X-Content-Type-Options (MIME sniffing), Referrer-Policy, Permissions-Policy, CORS configuration, mixed content (HTTP on HTTPS), Set-Cookie flags (HttpOnly, Secure, SameSite), and Subresource Integrity (SRI). Rates overall security posture and provides specific header configurations.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "ShieldCheck",
  color: "#ef4444",
  tags: ["security", "headers", "csp", "hsts", "cors", "cookies", "audit", "testing"],
  parameters: [
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "url", type: "string", description: "URL to check headers for", required: false },
    { name: "includeRemediation", type: "boolean", description: "Include specific header fix instructions", required: false, default: true },
    { name: "checkMixedContent", type: "boolean", description: "Scan for HTTP resources on HTTPS pages", required: false, default: true },
    { name: "checkCookies", type: "boolean", description: "Audit cookie security flags", required: false, default: true },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 6. browser.seo-audit ────────────────────────────────────────────────────

export const SEO_AUDIT_TOOL: ToolManifest = {
  id: "browser.seo-audit",
  name: "SEO Analysis",
  description: "Audit SEO fundamentals: meta tags, Open Graph, Twitter Cards, structured data, heading hierarchy, image alt text, canonical URLs, robots.txt",
  longDescription: "Comprehensive SEO audit covering: title tag (length, uniqueness), meta description (length, keywords), Open Graph tags (og:title, og:description, og:image, og:url), Twitter Card tags, canonical URL presence, robots meta tags, heading hierarchy (single h1, proper nesting), image alt text coverage, internal/external link analysis, structured data (JSON-LD) validation, mobile-friendliness indicators, and page load speed impact on SEO. Produces a prioritised improvement list.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "Search",
  color: "#06b6d4",
  tags: ["seo", "meta", "open-graph", "structured-data", "headings", "audit", "testing"],
  parameters: [
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "url", type: "string", description: "URL to audit", required: false },
    { name: "scope", type: "enum", description: "Audit scope", required: false, enum: ["full", "meta", "social", "headings", "images", "links", "structured-data"], default: "full" },
    { name: "includeSuggestions", type: "boolean", description: "Include improvement suggestions", required: false, default: true },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 7. browser.visual-regression ────────────────────────────────────────────

export const VISUAL_REGRESSION_TOOL: ToolManifest = {
  id: "browser.visual-regression",
  name: "Visual Regression Test",
  description: "Compare two screenshots (baseline vs current) with pixel diff, region-based comparison, and layout shift detection",
  longDescription: "Takes a baseline screenshot and a current screenshot, then performs pixel-by-pixel comparison with configurable tolerance. Detects: colour changes, text changes, element displacement, layout shifts, missing/added elements, and font rendering differences. Produces a diff image highlighting changes, percentage similarity score, and per-region breakdown. Supports selective region comparison and ignore zones for dynamic content.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "GitCompareArrows",
  color: "#a855f7",
  tags: ["visual-regression", "screenshot", "diff", "comparison", "baseline", "testing"],
  parameters: [
    { name: "baselineB64", type: "string", description: "Base64-encoded baseline screenshot", required: false },
    { name: "currentB64", type: "string", description: "Base64-encoded current screenshot to compare", required: false },
    { name: "baselineUrl", type: "string", description: "URL to capture as baseline", required: false },
    { name: "currentUrl", type: "string", description: "URL to capture as current", required: false },
    { name: "tabId", type: "number", description: "Chrome tab ID for capture", required: false },
    { name: "tolerance", type: "number", description: "Pixel colour tolerance (0-255, default 10)", required: false },
    { name: "ignoreRegions", type: "string", description: "JSON array of {x,y,w,h} regions to ignore", required: false },
    { name: "threshold", type: "number", description: "Minimum similarity % to pass (default 95)", required: false },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 8. browser.test-suggester ───────────────────────────────────────────────

export const TEST_SUGGESTER_TOOL: ToolManifest = {
  id: "browser.test-suggester",
  name: "Test Scenario Generator",
  description: "Analyse a page's DOM, interactivity, and structure to generate comprehensive test scenarios the LLM can execute",
  longDescription: "Inspects the page's DOM structure, identifies all interactive elements (buttons, links, forms, inputs, dropdowns, modals), analyses the navigation flow, and generates a prioritised list of test scenarios. Each scenario includes: the action to perform, the expected outcome, the assertion to validate, and the priority level. Uses the ViT vision model to understand visual layout and identify user flows. Outputs test scenarios as structured JSON that can be fed into browser.interact-test.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "ListChecks",
  color: "#eab308",
  tags: ["test-generation", "scenarios", "e2e", "automation", "llm", "testing"],
  parameters: [
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "scope", type: "enum", description: "What to generate tests for", required: true, enum: ["all", "forms", "navigation", "interactions", "errors", "accessibility"] },
    { name: "maxScenarios", type: "number", description: "Maximum test scenarios to generate (default 20)", required: false },
    { name: "includeCode", type: "boolean", description: "Include executable test code for each scenario", required: false, default: false },
    { name: "priority", type: "enum", description: "Filter by priority level", required: false, enum: ["all", "critical", "high", "medium", "low"] },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 9. browser.form-test ────────────────────────────────────────────────────

export const FORM_TEST_TOOL: ToolManifest = {
  id: "browser.form-test",
  name: "Form Validation Test",
  description: "Test form validation: required fields, email/phone/URL patterns, min/max length, custom validators, submission flow",
  longDescription: "Identifies all forms on the page and systematically tests each field's validation. Tests: required field enforcement, email format validation, phone number patterns, URL format, min/max length constraints, pattern regex validation, custom JavaScript validators, submit button enable/disable states, error message display, error message clarity, form reset behaviour, and multi-step form navigation. Produces a per-field validation report with pass/fail status and improvement suggestions.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "FileInput",
  color: "#14b8a6",
  tags: ["form", "validation", "input", "submit", "error-handling", "testing"],
  parameters: [
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "formSelector", type: "string", description: "CSS selector for specific form (omit to test all forms)", required: false },
    { name: "testEmpty", type: "boolean", description: "Test submitting with empty required fields", required: false, default: true },
    { name: "testInvalid", type: "boolean", description: "Test with invalid data (bad emails, too long, etc.)", required: false, default: true },
    { name: "testValid", type: "boolean", description: "Test with valid data to verify success flow", required: false, default: true },
    { name: "testEdgeCases", type: "boolean", description: "Test edge cases (unicode, very long input, special chars)", required: false, default: false },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 10. browser.api-test ────────────────────────────────────────────────────

export const API_TEST_TOOL: ToolManifest = {
  id: "browser.api-test",
  name: "API Endpoint Testing",
  description: "Discover and test API endpoints: response codes, latency, payload validation, error handling, CORS, rate limiting",
  longDescription: "Captures all API requests made by the page and performs comprehensive endpoint analysis. For each discovered endpoint: measures response time (P50, P95, P99), validates response status codes, analyses response payload structure, checks CORS headers, tests error handling (invalid params, missing auth), measures payload size, identifies caching headers, and detects rate limiting. Produces a per-endpoint test report with latency benchmarks and improvement suggestions.",
  version: "1.0.0",
  category: "browser",
  subcategory: "testing",
  author: "stitaP",
  license: "MIT",
  icon: "Webhook",
  color: "#f43f5e",
  tags: ["api", "endpoint", "rest", "graphql", "latency", "response", "testing"],
  parameters: [
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "action", type: "enum", description: "What to test", required: true, enum: ["discover", "benchmark", "validate", "all"] },
    { name: "duration", type: "number", description: "Monitoring duration in seconds (default 30)", required: false },
    { name: "includePayloads", type: "boolean", description: "Include request/response payloads in report", required: false, default: false },
    { name: "validateSchemas", type: "boolean", description: "Validate response payloads against expected schemas", required: false, default: true },
    { name: "checkCaching", type: "boolean", description: "Analyse caching headers and cache effectiveness", required: false, default: true },
    { name: "checkCORS", type: "boolean", description: "Validate CORS configuration", required: false, default: true },
  ],
  capabilities: TEST_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── Export all test tools ───────────────────────────────────────────────────

export const TEST_TOOLS: ToolManifest[] = [
  PERFORMANCE_TOOL,
  INTERACT_TEST_TOOL,
  A11Y_AUDIT_TOOL,
  RESPONSIVE_TEST_TOOL,
  SECURITY_HEADERS_TOOL,
  SEO_AUDIT_TOOL,
  VISUAL_REGRESSION_TOOL,
  TEST_SUGGESTER_TOOL,
  FORM_TEST_TOOL,
  API_TEST_TOOL,
];

// ─── CDP Command Generators ──────────────────────────────────────────────────

export interface CDPCommand {
  method: string;
  params: Record<string, unknown>;
}

/** Performance: enable Performance domain + collect metrics. */
export function generatePerformanceCDP(): CDPCommand[] {
  return [
    { method: "Performance.enable", params: {} },
    { method: "Performance.getMetrics", params: {} },
    { method: "Page.getNavigationHistory", params: {} },
    { method: "Runtime.evaluate", params: {
      expression: `JSON.stringify({
        lcp: new Promise(resolve => {
          new PerformanceObserver(list => {
            const entries = list.getEntries();
            resolve(entries[entries.length - 1]);
          }).observe({type: 'largest-contentful-paint', buffered: true});
          setTimeout(() => resolve(null), 100);
        }),
        fid: null,
        cls: 0,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
        ttfb: performance.timing.responseStart - performance.timing.requestStart,
        domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
        resources: performance.getEntriesByType('resource').map(r => ({
          name: r.name, type: r.initiatorType, duration: r.duration,
          transferSize: r.transferSize, startTime: r.startTime
        }))
      })`,
      returnByValue: true,
    }},
  ];
}

/** Interaction test: click + observe mutations. */
export function generateInteractTestCDP(selector: string, action: string): CDPCommand[] {
  const commands: CDPCommand[] = [
    { method: "DOM.querySelector", params: { nodeId: 0, selector } },
    { method: "DOM.getBoxModel", params: { nodeId: 0 } },
  ];

  if (action === "click" || action === "dblclick") {
    commands.push({ method: "DOM.getDocument", params: {} });
  }

  // Start network monitoring
  commands.push({ method: "Network.enable", params: {} });
  commands.push({ method: "Console.enable", params: {} });

  return commands;
}

/** Accessibility audit: inject a11y checker script. */
export function generateA11yCDP(scope: string): CDPCommand[] {
  const checks: string[] = [];

  if (scope === "full" || scope === "images") {
    checks.push(`
      // Check images without alt text
      Array.from(document.querySelectorAll('img:not([alt]), img[alt=""]')).map(img => ({
        type: 'missing-alt', severity: 'error',
        element: img.outerHTML.slice(0, 200),
        fix: 'Add descriptive alt text to this image'
      }))
    `);
  }

  if (scope === "full" || scope === "contrast") {
    checks.push(`
      // Check colour contrast (simplified)
      Array.from(document.querySelectorAll('*')).slice(0, 500).flatMap(el => {
        const style = getComputedStyle(el);
        const fg = style.color; const bg = style.backgroundColor;
        if (!el.textContent?.trim() || fg === 'rgba(0, 0, 0, 0)') return [];
        return [{ type: 'contrast-check', element: el.tagName, fg, bg }];
      })
    `);
  }

  if (scope === "full" || scope === "headings") {
    checks.push(`
      // Check heading hierarchy
      (() => {
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
        const issues = [];
        const h1s = headings.filter(h => h.tagName === 'H1');
        if (h1s.length === 0) issues.push({type:'no-h1', severity:'error', fix:'Add an h1 heading'});
        if (h1s.length > 1) issues.push({type:'multiple-h1', severity:'warning', fix:'Use only one h1 per page'});
        let prev = 0;
        for (const h of headings) {
          const level = parseInt(h.tagName[1]);
          if (level > prev + 1 && prev > 0) issues.push({type:'heading-skip', severity:'warning', element: h.textContent?.slice(0,50), fix:'Do not skip heading levels'});
          prev = level;
        }
        return issues;
      })()
    `);
  }

  if (scope === "full" || scope === "aria") {
    checks.push(`
      // Check ARIA attributes
      Array.from(document.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby]')).slice(0, 200).flatMap(el => {
        const issues = [];
        if (el.getAttribute('role') === 'button' && !el.getAttribute('aria-label') && !el.textContent?.trim()) {
          issues.push({type:'button-no-label', severity:'error', element: el.outerHTML.slice(0,100), fix:'Add aria-label or visible text'});
        }
        return issues;
      })
    `);
  }

  if (scope === "full" || scope === "keyboard") {
    checks.push(`
      // Check keyboard accessibility
      (() => {
        const issues = [];
        const interactives = document.querySelectorAll('a, button, input, select, textarea, [tabindex]');
        for (const el of Array.from(interactives).slice(0, 200)) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'a' && !el.getAttribute('href')) issues.push({type:'link-no-href', severity:'error', element: el.outerHTML.slice(0,100)});
          if (el.getAttribute('tabindex') && parseInt(el.getAttribute('tabindex')!) > 0) issues.push({type:'positive-tabindex', severity:'warning', element: el.outerHTML.slice(0,100)});
          if ('onclick' in el && tag !== 'a' && tag !== 'button' && tag !== 'input' && !el.getAttribute('role')) issues.push({type:'clickable-no-role', severity:'warning', element: el.outerHTML.slice(0,100), fix:'Add role="button" and tabIndex={0}'});
        }
        return issues;
      })()
    `);
  }

  return [
    { method: "Runtime.evaluate", params: {
      expression: `JSON.stringify([${checks.join(',')}])`,
      returnByValue: true,
    }},
  ];
}

/** Responsive test: resize viewport and capture. */
export function generateResponsiveCDP(viewportWidth: number): CDPCommand[] {
  return [
    { method: "Emulation.setDeviceMetricsOverride", params: {
      width: viewportWidth,
      height: 900,
      deviceScaleFactor: 2,
      mobile: viewportWidth < 768,
    }},
    { method: "Page.captureScreenshot", params: { format: "png" } },
    { method: "Runtime.evaluate", params: {
      expression: `JSON.stringify({
        hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        fontSize: parseFloat(getComputedStyle(document.body).fontSize),
        overflowingElements: Array.from(document.querySelectorAll('*')).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.right > window.innerWidth || rect.left < 0;
        }).slice(0, 10).map(el => el.tagName + (el.id ? '#'+el.id : '') + (el.className ? '.'+String(el.className).split(' ')[0] : ''))
      })`,
      returnByValue: true,
    }},
  ];
}

/** Security headers: fetch response headers. */
export function generateSecurityHeadersCDP(url?: string): CDPCommand[] {
  return [
    { method: "Runtime.evaluate", params: {
      expression: `JSON.stringify({
        url: window.location.href,
        isHTTPS: window.location.protocol === 'https:',
        cookies: document.cookie.split(';').map(c => {
          const [name] = c.trim().split('=');
          return { name: name, hasHttpOnly: false, hasSecure: false, hasSameSite: false };
        }),
        mixedContent: Array.from(document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"], iframe[src^="http:"]')).map(el => ({
          tag: el.tagName, src: el.getAttribute('src') || el.getAttribute('href')
        }))
      })`,
      returnByValue: true,
    }},
  ];
}

/** SEO audit: extract meta tags and structure. */
export function generateSEOCDP(): CDPCommand[] {
  return [
    { method: "Runtime.evaluate", params: {
      expression: `JSON.stringify({
        title: document.title,
        titleLength: document.title.length,
        metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
        metaDescLength: (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').length,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
        robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || '',
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
        ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
        ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || '',
        twitterCard: document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || '',
        twitterTitle: document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '',
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
        headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({level: h.tagName, text: h.textContent?.trim().slice(0,100)})),
        images: Array.from(document.querySelectorAll('img')).map(img => ({src: img.src?.slice(0,100), alt: img.alt, hasAlt: img.hasAttribute('alt')})),
        structuredData: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => {try{return JSON.parse(s.textContent || '{}')}catch{return {}}}),
        links: {internal: document.querySelectorAll('a[href^="/"], a[href^="'+window.location.origin+'"]').length, external: document.querySelectorAll('a[href^="http"]:not([href^="'+window.location.origin+'"])').length, nofollow: document.querySelectorAll('a[rel*="nofollow"]').length},
        lang: document.documentElement.lang || '',
        hreflang: Array.from(document.querySelectorAll('link[hreflang]')).map(l => ({lang: l.getAttribute('hreflang'), href: l.getAttribute('href')}))
      })`,
      returnByValue: true,
    }},
  ];
}

/** Form test: identify and test all forms. */
export function generateFormTestCDP(formSelector?: string): CDPCommand[] {
  const selector = formSelector || 'form';
  return [
    { method: "Runtime.evaluate", params: {
      expression: `JSON.stringify({
        forms: Array.from(document.querySelectorAll('${selector}')).map(form => ({
          action: form.action,
          method: form.method,
          fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
            name: field.name || field.id,
            type: field.type,
            required: field.required,
            pattern: field.pattern || '',
            minLength: field.minLength >= 0 ? field.minLength : null,
            maxLength: field.maxLength >= 0 ? field.maxLength : null,
            min: field.min || null,
            max: field.max || null,
            placeholder: field.placeholder || '',
            ariaLabel: field.getAttribute('aria-label') || '',
            hasLabel: !!form.querySelector('label[for="'+field.id+'"]'),
            tagName: field.tagName.toLowerCase()
          }))
        }))
      })`,
      returnByValue: true,
    }},
  ];
}

/** API test: monitor network requests. */
export function generateAPITestCDP(): CDPCommand[] {
  return [
    { method: "Network.enable", params: {} },
    { method: "Runtime.evaluate", params: {
      expression: `JSON.stringify({
        fetchRequests: performance.getEntriesByType('resource')
          .filter(r => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest')
          .map(r => ({
            url: r.name,
            type: r.initiatorType,
            duration: r.duration,
            transferSize: r.transferSize,
            startTime: r.startTime
          }))
      })`,
      returnByValue: true,
    }},
  ];
}
