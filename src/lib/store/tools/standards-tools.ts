/**
 * ISO Standards & QA Compliance Tools
 * ─────────────────────────────────────
 * Agent-callable tools for running compliance audits against
 * ISO 25010, ISO 9001, ISO 27001, OWASP, WCAG, QA, and documentation standards.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import { runAudit, formatAuditReport, type AuditContext } from "../../standards/engine";

// ─── 1. Compliance Audit ───────────────────────────────────────────────────

export const AUDIT_MANIFEST: ToolManifest = {
  id: "standards.audit",
  name: "Standards Compliance Audit",
  description: "Run a comprehensive compliance audit against ISO 25010, ISO 9001, ISO 27001, OWASP Top 10, WCAG 2.2, QA standards, and documentation standards. Analyzes source code, tests, configs, and documentation.",
  category: "math",
  version: "1.0.0",
  tags: ["iso", "compliance", "audit", "security", "accessibility", "quality", "owasp", "wcag"],
  author: "stitaP", license: "MIT", icon: "ShieldCheck", color: "#059669",
  parameters: [
    { name: "standard", type: "enum", description: "Standard to audit against", required: true, enum: ["iso-25010", "iso-9001", "iso-27001", "owasp", "wcag", "qa", "docs", "all"] },
    { name: "files", type: "array", description: "Source files to audit [{path, content, language}]", required: true },
    { name: "tests", type: "array", description: "Test files [{path, content, passing}]", required: false },
    { name: "packageJson", type: "object", description: "package.json contents", required: false },
  ],
  capabilities: [{ name: "compliance-audit", description: "Run ISO/OWASP/WCAG/QA compliance audits", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function standardsAudit(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const standard = (cfg.standard as string) || "all";

  const context: AuditContext = {
    files: (cfg.files as Array<{ path: string; content: string; language?: string }>) || [],
    tests: (cfg.tests as Array<{ path: string; content: string; passing?: boolean }>) || [],
    packageJson: cfg.packageJson as Record<string, unknown> | undefined,
    config: {},
  };

  try {
    const report = runAudit(standard, context);
    return {
      success: true,
      data: {
        standard: report.standard,
        version: report.version,
        overallScore: report.overallScore,
        passed: report.passed,
        summary: report.summary,
        report: formatAuditReport(report),
      },
    };
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 2. Quick Security Scan ────────────────────────────────────────────────

export const SECURITY_SCAN_MANIFEST: ToolManifest = {
  id: "standards.security",
  name: "Quick Security Scan",
  description: "Rapid security scan checking for hardcoded secrets, XSS vectors, SQL injection, deprecated crypto, missing auth, and common vulnerabilities.",
  category: "math",
  version: "1.0.0",
  tags: ["security", "scan", "vulnerability", "secrets", "xss"],
  author: "stitaP", license: "MIT", icon: "ShieldAlert", color: "#dc2626",
  parameters: [
    { name: "files", type: "array", description: "Source files to scan [{path, content}]", required: true },
  ],
  capabilities: [{ name: "security-scan", description: "Rapid security vulnerability scanning", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function securityScan(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const context: AuditContext = {
    files: (cfg.files as Array<{ path: string; content: string }>) || [],
  };

  try {
    const report = runAudit("iso-27001", context);
    const owaspReport = runAudit("owasp", context);

    return {
      success: true,
      data: {
        critical: report.summary.critical + owaspReport.summary.critical,
        major: report.summary.major + owaspReport.summary.major,
        minor: report.summary.minor + owaspReport.summary.minor,
        totalChecks: report.summary.totalChecks + owaspReport.summary.totalChecks,
        passed: report.summary.passed + owaspReport.summary.passed,
        report: formatAuditReport(report) + "\n\n" + formatAuditReport(owaspReport),
      },
    };
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 3. Accessibility Check ────────────────────────────────────────────────

export const ACCESSIBILITY_MANIFEST: ToolManifest = {
  id: "standards.accessibility",
  name: "Accessibility Audit (WCAG 2.2)",
  description: "Audit web content against WCAG 2.2 guidelines: alt text, color contrast, keyboard navigation, semantic HTML, ARIA attributes, focus management.",
  category: "math",
  version: "1.0.0",
  tags: ["accessibility", "wcag", "a11y", "aria", "keyboard"],
  author: "stitaP", license: "MIT", icon: "Eye", color: "#2563eb",
  parameters: [
    { name: "files", type: "array", description: "HTML/React files to audit [{path, content}]", required: true },
  ],
  capabilities: [{ name: "accessibility-audit", description: "WCAG 2.2 compliance checking", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function accessibilityAudit(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const context: AuditContext = {
    files: (cfg.files as Array<{ path: string; content: string }>) || [],
  };

  try {
    const report = runAudit("wcag", context);
    return {
      success: true,
      data: {
        overallScore: report.overallScore,
        passed: report.passed,
        summary: report.summary,
        report: formatAuditReport(report),
      },
    };
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 4. Code Quality Check ────────────────────────────────────────────────

export const CODE_QUALITY_MANIFEST: ToolManifest = {
  id: "standards.quality",
  name: "Code Quality Audit (ISO 25010)",
  description: "Audit code against ISO 25010 quality characteristics: functional suitability, performance, reliability, security, maintainability, portability.",
  category: "math",
  version: "1.0.0",
  tags: ["quality", "iso-25010", "maintainability", "reliability"],
  author: "stitaP", license: "MIT", icon: "CheckCircle", color: "#059669",
  parameters: [
    { name: "files", type: "array", description: "Source files to audit [{path, content, language}]", required: true },
    { name: "tests", type: "array", description: "Test files [{path, content, passing}]", required: false },
    { name: "packageJson", type: "object", description: "package.json contents", required: false },
  ],
  capabilities: [{ name: "code-quality", description: "ISO 25010 code quality auditing", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function codeQualityAudit(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const context: AuditContext = {
    files: (cfg.files as Array<{ path: string; content: string; language?: string }>) || [],
    tests: (cfg.tests as Array<{ path: string; content: string; passing?: boolean }>) || [],
    packageJson: cfg.packageJson as Record<string, unknown> | undefined,
  };

  try {
    const report = runAudit("iso-25010", context);
    return {
      success: true,
      data: {
        overallScore: report.overallScore,
        passed: report.passed,
        categories: report.categories.map((c) => ({ name: c.name, score: c.score, passed: c.passed })),
        summary: report.summary,
        report: formatAuditReport(report),
      },
    };
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const STANDARDS_TOOLS: ToolManifest[] = [
  AUDIT_MANIFEST,
  SECURITY_SCAN_MANIFEST,
  ACCESSIBILITY_MANIFEST,
  CODE_QUALITY_MANIFEST,
];

export const STANDARDS_EXECUTORS: Record<string, (input: ToolInput) => ToolOutput> = {
  "standards.audit": standardsAudit,
  "standards.security": securityScan,
  "standards.accessibility": accessibilityAudit,
  "standards.quality": codeQualityAudit,
};
