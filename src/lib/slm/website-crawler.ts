/* ─── stitaP — Website Crawler for Tutorial Generation ─── */

/**
 * Crawls a website using Chromium DevTools Protocol (CDP),
 * logs in with provided credentials, navigates to help/documentation,
 * and extracts structured content for tutorial generation.
 *
 * All from scratch — no Puppeteer, no Playwright, no external deps.
 */

/* ═══════════════════════════════════════════════════════════
   SECTION 1: Types
   ═══════════════════════════════════════════════════════════ */

export interface CrawlConfig {
  /** Base URL of the website */
  baseUrl: string;
  /** Login credentials */
  credentials?: {
    loginUrl?: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    username: string;
    password: string;
    /** Additional form fields (e.g., 2FA) */
    extraFields?: Array<{ selector: string; value: string }>;
    /** Selector that confirms successful login (e.g., user avatar) */
    successSelector?: string;
    /** Timeout for login in ms */
    timeout?: number;
  };
  /** Help/documentation section */
  helpSection: {
    /** URL path or full URL to the help center */
    url: string;
    /** Selectors for navigation links in help sidebar/nav */
    navSelectors?: string[];
    /** CSS selector for main content area */
    contentSelector?: string;
    /** CSS selector for page title */
    titleSelector?: string;
    /** CSS selectors to ignore (ads, nav, footer) */
    ignoreSelectors?: string[];
    /** Maximum pages to crawl */
    maxPages?: number;
    /** Wait time between page navigations (ms) */
    delay?: number;
  };
  /** Browser viewport */
  viewport?: { width: number; height: number };
}

export interface ExtractedPage {
  url: string;
  title: string;
  /** Raw text content */
  text: string;
  /** Structured content: headings, paragraphs, code blocks, lists */
  structured: ContentBlock[];
  /** Screenshot data URL (if captured) */
  screenshot?: string;
  /** Links to other help pages */
  links: string[];
  /** Page order in navigation */
  order: number;
}

export interface ContentBlock {
  type: "heading" | "paragraph" | "code" | "list" | "image" | "note" | "warning" | "step";
  level?: number;
  text: string;
  items?: string[];
  language?: string;
  src?: string;
  stepNumber?: number;
}

export interface CrawlResult {
  pages: ExtractedPage[];
  /** Flattened list of all navigation links */
  allLinks: string[];
  /** Total crawl time in ms */
  crawlTimeMs: number;
  /** Any errors encountered */
  errors: string[];
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: Content Extraction (HTML → Structured)
   ═══════════════════════════════════════════════════════════ */

/** Extract structured content blocks from HTML string */
export function extractContent(html: string, contentSelector?: string, ignoreSelectors?: string[]): ContentBlock[] {
  // Parse HTML in a sandboxed way (no DOM needed — regex-based extraction)
  const blocks: ContentBlock[] = [];

  // Remove ignored elements
  let cleaned = html;
  if (ignoreSelectors) {
    for (const sel of ignoreSelectors) {
      const tag = sel.replace(/[.#].*/,"");
      const re = new RegExp(`<${tag}[^>]*class="[^"]*${sel.replace(/^[.#]/,"")}[^"]*"[^>]*>[\\s\\S]*?</${tag}>`, "gi");
      cleaned = cleaned.replace(re, "");
    }
  }

  // Extract content within a selector if specified
  if (contentSelector) {
    const tag = contentSelector.replace(/[.#].*/,"");
    const cls = contentSelector.replace(/^[a-z]+/,"");
    const re = new RegExp(`<${tag}[^>]*class="[^"]*${cls.replace(/^\./,"")}[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    const m = re.exec(cleaned);
    if (m) cleaned = m[1];
  }

  // Split into lines and process
  const lines = cleaned.replace(/<[^>]+>/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
  let stepNum = 0;

  for (const line of lines) {
    // Skip empty, script, style content
    if (!line || line.startsWith("//") || line.length < 2) continue;

    // Code blocks
    if (line.startsWith("```") || line.match(/^<code|<pre/)) {
      const codeMatch = line.match(/```(\w+)?/);
      if (codeMatch) {
        blocks.push({ type: "code", text: "", language: codeMatch[1] || "" });
      }
      continue;
    }

    // Headings (detect by common patterns)
    if (line.match(/^#{1,6}\s/) || line.match(/^<h[1-6]/i)) {
      const level = (line.match(/^(#{1,6})/)?.[1]?.length) || 1;
      blocks.push({ type: "heading", level, text: line.replace(/^#{1,6}\s*/, "").replace(/<[^>]+>/g, "") });
      continue;
    }

    // Lists
    if (line.match(/^[-*+]\s|^\d+\.\s|^<li/i)) {
      const item = line.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").replace(/<[^>]+>/g, "").trim();
      const last = blocks[blocks.length - 1];
      if (last?.type === "list") {
        last.items!.push(item);
      } else {
        blocks.push({ type: "list", text: "", items: [item] });
      }
      continue;
    }

    // Notes and warnings
    if (line.match(/note:|warning:|important:|tip:|caution:/i)) {
      const type = line.match(/warning:|caution:/i) ? "warning" : "note";
      blocks.push({ type, text: line.replace(/^(note|warning|important|tip|caution):\s*/i, "") });
      continue;
    }

    // Step numbers (1. Do this, Step 1:, etc.)
    const stepMatch = line.match(/^(?:step\s*)?(\d+)[.):]\s*(.+)/i);
    if (stepMatch) {
      stepNum = parseInt(stepMatch[1]);
      blocks.push({ type: "step", stepNumber: stepNum, text: stepMatch[2] });
      continue;
    }

    // Images
    const imgMatch = line.match(/<img[^>]+src="([^"]+)"[^>]*(?:alt="([^"]*)")?/i) || line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      blocks.push({ type: "image", text: imgMatch[1] || imgMatch[2] || "", src: imgMatch[2] || imgMatch[1] });
      continue;
    }

    // Regular paragraph
    if (line.length > 10) {
      blocks.push({ type: "paragraph", text: line.replace(/<[^>]+>/g, "") });
    }
  }

  return blocks;
}

/** Extract navigation links from HTML */
export function extractNavLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();

  // Match <a href="..."> tags
  const re = /<a[^>]+href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (href.startsWith("/")) {
      href = new URL(href, baseUrl).href;
    } else if (href.startsWith("http")) {
      // Only include links to the same domain
      try {
        const url = new URL(href);
        const base = new URL(baseUrl);
        if (url.hostname === base.hostname) links.add(href);
      } catch {}
    }
  }

  return Array.from(links);
}

/** Extract page title from HTML */
export function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  return titleMatch ? titleMatch[1].trim() : "Untitled";
}

/** Convert ContentBlock[] to plain text (for LLM input) */
export function blocksToText(blocks: ContentBlock[]): string {
  return blocks.map((b) => {
    switch (b.type) {
      case "heading": return `${"#".repeat(b.level || 1)} ${b.text}`;
      case "paragraph": return b.text;
      case "code": return `\`\`\`${b.language || ""}\n${b.text}\n\`\`\``;
      case "list": return (b.items || []).map((item, i) => `${i + 1}. ${item}`).join("\n");
      case "step": return `Step ${b.stepNumber}: ${b.text}`;
      case "note": return `📝 Note: ${b.text}`;
      case "warning": return `⚠️ Warning: ${b.text}`;
      case "image": return `[Image: ${b.text}]`;
      default: return b.text;
    }
  }).join("\n\n");
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: Login Handler
   ═══════════════════════════════════════════════════════════ */

/** Generate CDP commands for login sequence */
export function generateLoginCommands(config: CrawlConfig): Array<{
  description: string;
  actions: Array<{
    type: string;
    selector?: string;
    text?: string;
    url?: string;
    timeout?: number;
  }>;
}> {
  if (!config.credentials) return [];

  const { credentials: c } = config;
  const cmds: Array<{ description: string; actions: Array<{ type: string; selector?: string; text?: string; url?: string; timeout?: number }> }> = [{
    description: "Navigate to login page",
    actions: [
      { type: "navigate", url: c.loginUrl || `${config.baseUrl}/login` },
      { type: "waitSelector", selector: c.usernameSelector, timeout: c.timeout || 10000 },
    ],
  }];

  // Fill username
  cmds.push({
    description: "Enter username",
    actions: [
      { type: "click", selector: c.usernameSelector },
      { type: "type", selector: c.usernameSelector, text: c.username },
    ],
  });

  // Fill password
  cmds.push({
    description: "Enter password",
    actions: [
      { type: "click", selector: c.passwordSelector },
      { type: "type", selector: c.passwordSelector, text: c.password },
    ],
  });

  // Extra fields (2FA, etc.)
  if (c.extraFields) {
    for (const field of c.extraFields) {
      cmds.push({
        description: `Fill extra field: ${field.selector}`,
        actions: [
          { type: "click", selector: field.selector },
          { type: "type", selector: field.selector, text: field.value },
        ],
      });
    }
  }

  // Submit
  cmds.push({
    description: "Submit login form",
    actions: [
      { type: "click", selector: c.submitSelector },
    ],
  });

  // Wait for success
  if (c.successSelector) {
    cmds.push({
      description: "Wait for login success",
      actions: [
        { type: "waitSelector", selector: c.successSelector, timeout: c.timeout || 10000 },
      ],
    });
  }

  return cmds;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: Crawl Orchestrator
   ═══════════════════════════════════════════════════════════ */

/** Generate the full crawl plan (URLs to visit in order) */
export function planCrawl(config: CrawlConfig): {
  loginCommands: ReturnType<typeof generateLoginCommands>;
  pagesToVisit: string[];
  contentSelector: string;
  ignoreSelectors: string[];
  delay: number;
} {
  return {
    loginCommands: generateLoginCommands(config),
    pagesToVisit: [config.helpSection.url],
    contentSelector: config.helpSection.contentSelector || "main, article, .content, .help-content",
    ignoreSelectors: config.helpSection.ignoreSelectors || ["nav", "footer", ".sidebar", ".breadcrumb", "header"],
    delay: config.helpSection.delay || 1000,
  };
}

/** Process raw crawled HTML into ExtractedPage objects */
export function processCrawledPages(
  rawPages: Array<{ url: string; html: string; order: number }>,
  config: CrawlConfig,
): ExtractedPage[] {
  return rawPages.map((raw, i) => ({
    url: raw.url,
    title: extractTitle(raw.html),
    text: raw.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    structured: extractContent(raw.html, config.helpSection.contentSelector, config.helpSection.ignoreSelectors),
    links: extractNavLinks(raw.html, config.baseUrl),
    order: raw.order,
  }));
}

/** Deduplicate pages by URL */
export function deduplicatePages(pages: ExtractedPage[]): ExtractedPage[] {
  const seen = new Set<string>();
  return pages.filter((p) => {
    const normalized = p.url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
