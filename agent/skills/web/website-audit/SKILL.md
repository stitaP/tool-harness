---
name: website-audit
description: Audit a website: routes, components, performance, accessibility, SEO, and produce a report with diagrams. Use for WebBuilder requirement analysis or site reviews.
version: 1.0.0
---

# Website audit

1. Discover routes: fetch `/sitemap.xml` and `/robots.txt` with `web_extract`; browse the home page (`browser_navigate`) and collect internal links.
2. For each key route: `browser_snapshot` (structure + interactive elements), note forms/modals/tabs; `browser_screenshot` for visual reference.
3. Checks: title/meta/OpenGraph/JSON-LD (SEO), headings order, alt text, labels, contrast hints (a11y), console errors (`browser_console`), obvious performance issues (large images, many requests).
4. Diagrams: produce Mermaid for route map and a user-journey sequence.
5. Report: summary, per-route findings (severity), diagrams, prioritized fixes. Save as markdown in the working directory.
