# stitaP Tool Harness — Complete Tool Catalog

> **267 Tools Across 48 Domains** | SLM-Powered Agent Orchestration Platform
> Generated: September 2026 | Version 1.0.0

---

## Enterprise Use Cases

These 267 tools power **20 enterprise-grade business solutions** where every tool is tested and working. See the full catalog with workflows, tool chains, and reference product mappings:

**[→ Enterprise Use Cases Documentation](enterprise-use-cases.md)**

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Tools | **267** |
| Domains | **48** |
| SLM-Friendly | **221** (82%) |
| Offline-Capable | **170+** (70%+) |
| Token Cost (majority) | **Zero** (pure computation) |

---

## Table of Contents

- [Agent Orchestration](#agent-orchestration) (5 tools)
- [Analytics & Database](#analytics--database) (20 tools)
- [Audio & Speech Processing](#audio--speech-processing) (6 tools)
- [Browser Automation & Testing](#browser-automation--testing) (42 tools)
- [CAR Governance Framework](#car-governance-framework) (6 tools)
- [Catalog](#catalog) (1 tools)
- [Chains](#chains) (2 tools)
- [Cloud Storage](#cloud-storage) (4 tools)
- [Computational Fluid Dynamics](#computational-fluid-dynamics) (6 tools)
- [Database Connectors](#database-connectors) (4 tools)
- [Design System & Canvas](#design-system--canvas) (12 tools)
- [Diagram & Architecture](#diagram--architecture) (7 tools)
- [Document Parsing](#document-parsing) (6 tools)
- [Email Communication](#email-communication) (2 tools)
- [Engineering Mathematics](#engineering-mathematics) (16 tools)
- [Enterprise Workflow](#enterprise-workflow) (1 tools)
- [Environment Management](#environment-management) (4 tools)
- [Fault Detection & Quality](#fault-detection--quality) (3 tools)
- [Fractal Analysis](#fractal-analysis) (5 tools)
- [Governance](#governance) (1 tools)
- [Graph Execution](#graph-execution) (1 tools)
- [Graphs & Visualization](#graphs--visualization) (3 tools)
- [Hugging Face Hub](#hugging-face-hub) (6 tools)
- [Indic Typography Engine](#indic-typography-engine) (7 tools)
- [Inference & Model Management](#inference--model-management) (5 tools)
- [Knowledge Base](#knowledge-base) (1 tools)
- [LLM Integration & Prompting](#llm-integration--prompting) (6 tools)
- [Legacy Server Revival](#legacy-server-revival) (4 tools)
- [Machine Learning](#machine-learning) (8 tools)
- [Maps & Geolocation](#maps--geolocation) (5 tools)
- [Mobile Hardware](#mobile-hardware) (5 tools)
- [Notifications](#notifications) (1 tools)
- [OCR & Text Recognition](#ocr--text-recognition) (4 tools)
- [OS & Desktop Integration](#os--desktop-integration) (10 tools)
- [Observability & Tracing](#observability--tracing) (1 tools)
- [Office Document Generation](#office-document-generation) (5 tools)
- [OpenViking Context Store](#openviking-context-store) (5 tools)
- [Payment Processing](#payment-processing) (4 tools)
- [Real-time Collaboration](#real-time-collaboration) (4 tools)
- [SMS Communication](#sms-communication) (1 tools)
- [Sandbox Execution](#sandbox-execution) (8 tools)
- [Session & Swarm Management](#session--swarm-management) (1 tools)
- [Standards](#standards) (4 tools)
- [Swarm Intelligence](#swarm-intelligence) (1 tools)
- [Task Scheduling](#task-scheduling) (1 tools)
- [Text Analysis & NLP](#text-analysis--nlp) (5 tools)
- [Video Editing & Rendering](#video-editing--rendering) (7 tools)
- [Voice & Text-to-Speech](#voice--text-to-speech) (1 tools)

---

## Agent Orchestration
> 5 tools

### `agent.kanban`

**Kanban Board** | ✅ SLM

Multi-agent task orchestration: create boards, add tasks with dependencies, assign workers, track progress

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `boardId` | string | No |
| `taskId` | string | No |
| `status` | enum | No |
| `title` | string | No |
| `description` | string | No |
| `priority` | enum | No |
| `dependsOn` | string | No |
| `assignee` | string | No |
| `workerName` | string | No |
| `workerType` | enum | No |
| `workerId` | string | No |
| `author` | string | No |
| `comment` | string | No |
| `subtasks` | string | No |
| `boardName` | string | No |

**Tags:** kanban, board, tasks, multi-agent, orchestration


### `agent.memory`

**Agent Memory** | ✅ SLM

Store and retrieve persistent memories across sessions: user preferences, project facts, workflow patterns

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `type` | enum | No |
| `key` | string | No |
| `content` | string | No |
| `importance` | number | No |
| `tags` | string | No |
| `search` | string | No |
| `limit` | number | No |
| `format` | enum | No |

**Tags:** memory, persistent, cross-session, knowledge, agent


### `agent.self-improve`

**Self-Improvement** | ✅ SLM

Track performance, detect patterns, and get improvement suggestions based on task history

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `taskData` | string | No |
| `format` | enum | No |

**Tags:** self-improve, performance, patterns, optimization, agent


### `agent.skills`

**Agent Skills** | ✅ SLM

Create, list, search, refine, and execute reusable skills extracted from completed tasks

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `skillId` | string | No |
| `name` | string | No |
| `description` | string | No |
| `category` | enum | No |
| `steps` | string | No |
| `tags` | string | No |
| `search` | string | No |
| `format` | enum | No |

**Tags:** skills, procedures, reuse, learning, agent


### `agent.terminal`

**Real Terminal** | ✅ SLM

Execute shell commands with process management: background jobs, output capture, timeout enforcement

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `command` | string | No |
| `action` | enum | No |
| `processId` | string | No |
| `background` | boolean | No |
| `timeoutSecs` | number | No |
| `cwd` | string | No |

**Tags:** terminal, shell, command, process, background


---

## Analytics & Database
> 20 tools

### `analytics.create_table`

**Create Empty Table** | ✅ SLM

Create a new empty table with a defined schema. Useful for building datasets incrementally.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |
| `columns` | string | Yes |

**Tags:** create, schema


### `analytics.csv_export`

**Export CSV** | ✅ SLM

Export a table to CSV text format. Use after querying to get downloadable results.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |

**Tags:** csv, export


### `analytics.csv_import`

**Import CSV** | ✅ SLM

Parse CSV text into a columnar table with auto-detected types (int, float, bool, string, date). Returns row count and schema.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `csv` | string | Yes |
| `tableName` | string | No |

**Tags:** csv, import, data


### `analytics.describe`

**Describe Table** | ✅ SLM

Show schema and summary statistics (count, nulls, min, max, sum, avg, distinct) for all columns in a table.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |

**Tags:** schema, stats, metadata


### `analytics.export_excel`

**Export for Excel** | 🔴 LLM Only

Export a table as an Excel-compatible file — CSV with BOM and formatting, or XML Spreadsheet (SSML) with styles and typed cells.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |
| `format` | string | No |

**Tags:** excel, spreadsheet, export


### `analytics.export_powerbi`

**Export for Power BI** | 🔴 LLM Only

Export a table as a Power BI-compatible CSV with metadata header, plus auto-generated DAX measure templates for numeric columns.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |

**Tags:** powerbi, dax, export, bi


### `analytics.export_sheets`

**Export for Google Sheets** | 🔴 LLM Only

Export a table as Google Sheets-compatible CSV with schema metadata, plus auto-generated Sheets formulas for analysis.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |

**Tags:** google-sheets, export, formulas


### `analytics.export_tableau`

**Export for Tableau** | 🔴 LLM Only

Export a table as a Tableau-compatible TSV with typed columns, plus auto-generated Tableau workbook manifest (.twb) for auto-import.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |

**Tags:** tableau, export, twb, tsv


### `analytics.filter`

**Filter Rows** | ✅ SLM

Keep only rows matching a condition. Returns a new table with matching rows.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |
| `column` | string | Yes |
| `op` | string | Yes |
| `value` | string | Yes |

**Tags:** filter, where


### `analytics.groupby`

**Group By Aggregation** | ✅ SLM

Group rows by one or more columns and compute aggregations (count, sum, avg, min, max) on specified columns.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |
| `groupBy` | string | Yes |
| `aggregations` | string | Yes |
| `resultName` | string | No |

**Tags:** groupby, aggregation, statistics


### `analytics.insert_rows`

**Insert Rows** | ✅ SLM

Append one or more rows to an existing table. Values must match the table

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |
| `rows` | string | Yes |

**Tags:** insert, data


### `analytics.join`

**Join Tables** | ✅ SLM

Inner join two tables on a matching column. Returns a combined table with columns from both.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `leftTable` | string | Yes |
| `rightTable` | string | Yes |
| `onColumn` | string | Yes |
| `resultName` | string | No |

**Tags:** join, relational


### `analytics.json_export`

**Export JSON** | ✅ SLM

Export a table to a JSON array of row objects.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |

**Tags:** json, export


### `analytics.json_import`

**Import JSON** | ✅ SLM

Import a JSON array of objects into a columnar table with auto-detected types.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `data` | string | Yes |
| `tableName` | string | No |

**Tags:** json, import, data


### `analytics.mdx`

**MDX Query** | ✅ SLM

Execute an MDX (Multidimensional Expressions) query for OLAP-style analytics. Supports CROSSJOIN, FILTER, ORDER, TOPCOUNT/BOTTOMCOUNT, HEAD/TAIL, aggregate functions, calculated members (WITH MEMBER), IIF, CASE, and NON EMPTY.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `query` | string | Yes |

**Tags:** mdx, olap, cubes, bi


### `analytics.schema_export`

**Export Schema** | ✅ SLM

Export the schema of a table as JSON — column names, types, nullable flags. Useful for documentation and cross-platform compatibility.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |

**Tags:** schema, export, metadata


### `analytics.sort`

**Sort Table** | ✅ SLM

Sort a table by a column in ascending or descending order.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tableName` | string | Yes |
| `column` | string | Yes |
| `descending` | boolean | No |

**Tags:** sort, order


### `analytics.sql`

**SQL Query** | ✅ SLM

Execute a SQL-like query against registered tables. Supports SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, JOIN, aggregations (COUNT, SUM, AVG, MIN, MAX), CASE expressions, and arithmetic.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `query` | string | Yes |
| `tableName` | string | No |

**Tags:** sql, query, database


### `analytics.window`

**Window Function Query** | ✅ SLM

Execute SQL with DuckDB-style window functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, FIRST_VALUE, LAST_VALUE, NTILE, SUM/AVG/COUNT OVER PARTITION BY ... ORDER BY ...).

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `query` | string | Yes |

**Tags:** window, analytics, rank


### `analytics.xql`

**XQL Query** | ✅ SLM

Execute an XQL (eXtended Query Language) query — a hybrid SQL+JSON path+graph traversal language. Supports relational queries, JSON path expressions (@.field, $.data.nested), graph traversal, time-series windowing, UNNEST, LET bindings, COALESCE.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `query` | string | Yes |

**Tags:** xql, query, hybrid, json-path


---

## Audio & Speech Processing
> 6 tools

### `media.composeAudio`

**Compose Audio Track** | ✅ SLM

Compose a multi-layer audio track with music, SFX, and narration

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `layers` | array | No |
| `duration` | number | No |
| `sampleRate` | number | No |
| `fadeIn` | number | No |
| `fadeOut` | number | No |

**Tags:** compose, mix, audio, music, sfx


### `media.generateSticker`

**Generate Sticker** | ✅ SLM

Generate an SVG sticker for video overlays

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `variant` | string | No |
| `size` | number | No |
| `color` | string | No |
| `backgroundColor` | string | No |
| `label` | string | No |

**Tags:** sticker, svg, emoji, shape, arrow


### `media.generateThumbnail`

**Generate Thumbnail** | ✅ SLM

Generate a video thumbnail with text and styling

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `title` | string | Yes |
| `width` | number | No |
| `height` | number | No |
| `background` | enum | No |
| `backgroundImage` | string | No |
| `titleColor` | string | No |
| `titleSize` | number | No |
| `gradientColors` | array | No |

**Tags:** thumbnail, preview, image, cover, poster


### `media.generateWaveform`

**Generate Waveform** | ✅ SLM

Generate a visual waveform visualization for audio

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `samples` | array | Yes |
| `width` | number | No |
| `height` | number | No |
| `color` | string | No |
| `style` | enum | No |

**Tags:** waveform, audio, visualization, svg, bars


### `media.renderVideo`

**Render Video** | ✅ SLM

Render a sequence of scenes into a video

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `scenes` | array | No |
| `width` | number | No |
| `height` | number | No |
| `fps` | number | No |
| `format` | enum | No |

**Tags:** render, video, canvas, composite, export


### `media.synthesizeSpeech`

**Synthesize Speech** | ✅ SLM

Generate speech audio from text using formant synthesis

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `text` | string | Yes |
| `voice` | enum | No |
| `speed` | number | No |
| `pitch` | number | No |
| `volume` | number | No |

**Tags:** tts, speech, synthesis, voice, audio


---

## Browser Automation & Testing
> 42 tools

### `browser.a11y-audit`

**Accessibility Audit** | ✅ SLM

WCAG 2.1 compliance check: missing alt text, colour contrast, ARIA labels, keyboard navigation, heading hierarchy, focus management

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `standard` | enum | No |
| `scope` | enum | No |
| `includeFixes` | boolean | No |
| `screenshotViolations` | boolean | No |

**Tags:** accessibility, wcag, a11y, aria, contrast


### `browser.api-test`

**API Endpoint Testing** | ✅ SLM

Discover and test API endpoints: response codes, latency, payload validation, error handling, CORS, rate limiting

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `action` | enum | Yes |
| `duration` | number | No |
| `includePayloads` | boolean | No |
| `validateSchemas` | boolean | No |
| `checkCaching` | boolean | No |
| `checkCORS` | boolean | No |

**Tags:** api, endpoint, rest, graphql, latency


### `browser.click`

**Click** | ✅ SLM

Click an element on the page

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `selector` | string | Yes |
| `clickType` | enum | No |
| `offsetX` | number | No |
| `offsetY` | number | No |
| `timeout` | number | No |

**Tags:** click, interaction, button, link, cdp


### `browser.color-analyze`

**Colour Analysis** | ✅ SLM

Extract dominant colour palette from a screenshot — analysis feeds into the ViT model preprocessing pipeline

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `screenshotB64` | string | No |
| `tabId` | number | No |
| `sampleSize` | number | No |

**Tags:** colour, palette, design, analysis, pixel


### `browser.color-palette`

**Color Palette Generator** | ✅ SLM

Generate accessible color palettes with WCAG contrast validation, brand integration, and Fluent 4px-compatible design tokens

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `brandColor` | string | No |
| `tabId` | number | No |
| `contrastStandard` | enum | No |
| `includeDarkMode` | boolean | No |
| `outputFormat` | enum | No |


### `browser.component-qa`

**Component QA** | ✅ SLM

Validate buttons, inputs, cards, modals, navigation, and other components against all three guideline sets

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `components` | string | No |
| `includeFixes` | boolean | No |


### `browser.console`

**Console Log Capture** | ✅ SLM

Capture all console.log, warn, error, info, and debug messages with stack traces

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | No |
| `levels` | array | No |
| `maxEntries` | number | No |
| `includeStackTrace` | boolean | No |

**Tags:** console, logs, errors, warnings, debug


### `browser.cookies`

**Full Cookie Jar** | ✅ SLM

Read all cookies including HttpOnly via CDP with full metadata: domain, path, expiry, SameSite, Secure flags

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `urls` | array | No |
| `filter` | string | No |
| `groupedByDomain` | boolean | No |

**Tags:** cookies, httpOnly, session, auth, tracking


### `browser.design-audit`

**Design Audit** | ✅ SLM

Audit a page against Vercel, Fluent 2, and TasteSkill guidelines — accessibility, spacing, typography, animation, color, copy, and anti-slop rules

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `scope` | enum | No |
| `source` | enum | No |
| `includeCodeExamples` | boolean | No |


### `browser.design-generate`

**Design Code Generator** | ✅ SLM

Generate production-ready HTML/CSS/Tailwind components following Vercel + Fluent + TasteSkill guidelines

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `component` | string | Yes |
| `framework` | enum | No |
| `theme` | enum | No |
| `responsive` | boolean | No |
| `accessibility` | boolean | No |
| `animations` | boolean | No |
| `style` | enum | No |


### `browser.design-suggest`

**Design Suggestions** | ✅ SLM

Analyse a page and generate prioritised improvement suggestions with before/after code examples

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `focusArea` | enum | No |
| `maxSuggestions` | number | No |
| `framework` | enum | No |


### `browser.domevents`

**DOM Event Capture** | ✅ SLM

Capture all DOM events with target, phase, bubbles, timestamp, and propagation path

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | No |
| `eventTypes` | array | No |
| `maxEntries` | number | No |
| `includeMutationObserver` | boolean | No |

**Tags:** events, dom-events, clicks, inputs, mutation-observer


### `browser.drag`

**Drag & Drop** | ✅ SLM

Drag an element to a target position or element

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sourceSelector` | string | Yes |
| `targetSelector` | string | No |
| `targetX` | number | No |
| `targetY` | number | No |
| `method` | enum | No |

**Tags:** drag, drop, move, reorder, interaction


### `browser.extensions`

**Extensions Inspector** | ✅ SLM

List installed browser extensions, their permissions, content scripts, and injected code

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `includeContentScripts` | boolean | No |
| `includePermissions` | boolean | No |

**Tags:** extensions, plugins, permissions, content-scripts, addons


### `browser.extract`

**Extract Content** | ✅ SLM

Extract text, links, or structured data from the page

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `mode` | enum | No |
| `selector` | string | No |
| `attributes` | array | No |
| `includeHidden` | boolean | No |
| `maxDepth` | number | No |

**Tags:** extract, scrape, text, links, data


### `browser.extract-visual-context`

**Extract Visual Context** | ✅ SLM

Run ViT model on a specific page region to understand what that area depicts — combines model inference with DOM context

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `selector` | string | No |
| `screenshotB64` | string | No |
| `tabId` | number | No |
| `bboxX` | number | No |
| `bboxY` | number | No |
| `bboxW` | number | No |
| `bboxH` | number | No |

**Tags:** vision, context, region, model, ai


### `browser.form-test`

**Form Validation Test** | ✅ SLM

Test form validation: required fields, email/phone/URL patterns, min/max length, custom validators, submission flow

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `formSelector` | string | No |
| `testEmpty` | boolean | No |
| `testInvalid` | boolean | No |
| `testValid` | boolean | No |
| `testEdgeCases` | boolean | No |

**Tags:** form, validation, input, submit, error-handling


### `browser.hover`

**Hover** | ✅ SLM

Hover over an element

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `selector` | string | Yes |
| `delay` | number | No |
| `holdDuration` | number | No |

**Tags:** hover, mouseover, tooltip, dropdown


### `browser.icon-detect`

**Icon Detection (ViT)** | ✅ SLM

Run ViT model inference to identify icon types and their semantic meaning from a screenshot region

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `screenshotB64` | string | No |
| `tabId` | number | No |
| `selector` | string | No |

**Tags:** icon, vision, classification, model, semantic


### `browser.inspect`

**Deep DOM Inspector** | ✅ SLM

Inspect every DOM element with attributes, computed styles, shadow DOM, iframes, and accessibility tree

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `selector` | string | No |
| `depth` | number | No |
| `includeHidden` | boolean | No |
| `includeShadowDOM` | boolean | No |
| `includeIframes` | boolean | No |
| `includeStyles` | boolean | No |
| `includeA11y` | boolean | No |
| `maxNodes` | number | No |
| `attributeFilter` | array | No |

**Tags:** inspect, dom, shadow-dom, iframe, accessibility


### `browser.interact-test`

**Interaction Testing** | ✅ SLM

Click an element and validate what happens: response time, DOM changes, network requests, console errors, navigation

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `selector` | string | Yes |
| `action` | enum | Yes |
| `tabId` | number | No |
| `waitFor` | string | No |
| `waitForTimeout` | number | No |
| `expectNavigation` | boolean | No |
| `expectNetworkRequest` | string | No |
| `expectDomChange` | string | No |
| `expectNoConsoleError` | boolean | No |
| `measureLatency` | boolean | No |

**Tags:** interaction, click, test, validation, response-time


### `browser.layout-analyze`

**Layout Analysis (ViT)** | ✅ SLM

Detect layout zones (header, sidebar, main, footer, form, overlay) using ViT model inference on the screenshot

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `screenshotB64` | string | No |
| `tabId` | number | No |

**Tags:** layout, structure, zones, model, architecture


### `browser.navigate`

**Navigate** | ✅ SLM

Navigate the browser to a URL

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `url` | string | Yes |
| `timeout` | number | No |
| `waitForSelector` | string | No |

**Tags:** navigation, url, page-load, cdp


### `browser.network`

**Network Traffic Capture** | ✅ SLM

Capture every HTTP request and response: URLs, methods, headers, bodies, status codes, timing, and cookies

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | No |
| `filter` | object | No |
| `maxEntries` | number | No |
| `includeBodies` | boolean | No |
| `includeCookies` | boolean | No |

**Tags:** network, api, fetch, xhr, requests


### `browser.performance`

**Performance Metrics** | ✅ SLM

Measure Core Web Vitals (LCP, FID, CLS, TTFB), resource loading times, paint metrics, and bundle size analysis

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `tabId` | number | No |
| `duration` | number | No |
| `includeResources` | boolean | No |
| `includeSuggestions` | boolean | No |

**Tags:** performance, core-web-vitals, lcp, cls, ttfb


### `browser.responsive-test`

**Responsive Design Test** | ✅ SLM

Test layout across viewport breakpoints (mobile, tablet, desktop), detect overflow, horizontal scroll, and layout breakage

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `viewports` | string | No |
| `includeScreenshots` | boolean | No |
| `checkTouchTargets` | boolean | No |
| `checkOverflow` | boolean | No |

**Tags:** responsive, mobile, breakpoint, viewport, layout


### `browser.screenshot`

**Screenshot** | ✅ SLM

Capture a screenshot of the page or element

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `mode` | enum | No |
| `selector` | string | No |
| `region` | object | No |
| `format` | enum | No |
| `quality` | number | No |
| `clipToViewport` | boolean | No |

**Tags:** screenshot, capture, image, png, cdp


### `browser.screenshot-to-llm`

**Screenshot to LLM** | ✅ SLM

Capture a screenshot and immediately generate an optimised LLM prompt via ViT model inference — ready to paste into any LLM

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `goal` | enum | Yes |
| `codeLang` | string | No |
| `viewportWidth` | number | No |
| `viewportHeight` | number | No |

**Tags:** screenshot, llm, prompt, vision, one-click


### `browser.scroll`

**Scroll** | ✅ SLM

Scroll the page or an element

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `mode` | enum | No |
| `deltaY` | number | No |
| `selector` | string | No |
| `y` | number | No |
| `behavior` | enum | No |

**Tags:** scroll, viewport, page, infinite-scroll


### `browser.security-headers`

**Security Headers Audit** | ✅ SLM

Check HTTP security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, CORS, mixed content, cookie flags

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `includeRemediation` | boolean | No |
| `checkMixedContent` | boolean | No |
| `checkCookies` | boolean | No |

**Tags:** security, headers, csp, hsts, cors


### `browser.seo-audit`

**SEO Analysis** | ✅ SLM

Audit SEO fundamentals: meta tags, Open Graph, Twitter Cards, structured data, heading hierarchy, image alt text, canonical URLs, robots.txt

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `scope` | enum | No |
| `includeSuggestions` | boolean | No |

**Tags:** seo, meta, open-graph, structured-data, headings


### `browser.source`

**Source Code Extractor** | ✅ SLM

Extract all inline scripts, external script contents, stylesheets, and source maps

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `types` | array | No |
| `includeInline` | boolean | No |
| `includeExternal` | boolean | No |
| `maxContentLength` | number | No |
| `fetchExternal` | boolean | No |

**Tags:** source, scripts, styles, css, javascript


### `browser.spacing-check`

**Spacing & Grid Audit** | ✅ SLM

Validate spacing rhythm against Fluent 4px grid, check grid alignment, responsive breakpoint compliance

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `tolerance` | number | No |
| `checkGrid` | boolean | No |
| `checkResponsive` | boolean | No |


### `browser.state`

**Framework State Extractor** | ✅ SLM

Extract application state from React, Vue, Angular, Redux, MobX, and Zustand

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `frameworks` | array | No |
| `selector` | string | No |
| `maxComponents` | number | No |
| `includeHooks` | boolean | No |
| `includeStore` | boolean | No |

**Tags:** react, vue, angular, redux, state


### `browser.storage`

**Browser Storage Inspector** | ✅ SLM

Read cookies, localStorage, sessionStorage, and IndexedDB with full metadata

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `types` | array | No |
| `filter` | string | No |
| `includeValues` | boolean | No |
| `maxValueLength` | number | No |
| `origin` | string | No |

**Tags:** storage, cookies, localstorage, sessionstorage, indexeddb


### `browser.test-suggester`

**Test Scenario Generator** | ✅ SLM

Analyse a page

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `scope` | enum | Yes |
| `maxScenarios` | number | No |
| `includeCode` | boolean | No |
| `priority` | enum | No |

**Tags:** test-generation, scenarios, e2e, automation, llm


### `browser.type`

**Type Text** | ✅ SLM

Type text into an input field

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `selector` | string | Yes |
| `text` | string | Yes |
| `clear` | boolean | No |
| `delay` | number | No |
| `pressEnter` | boolean | No |

**Tags:** type, input, form, text, cdp


### `browser.typography-check`

**Typography Audit** | ✅ SLM

Validate fonts, sizes, line-heights, letter-spacing, and text hierarchy against Vercel + Fluent type scales

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `tabId` | number | No |
| `url` | string | No |
| `scale` | enum | No |
| `checkHierarchy` | boolean | No |
| `checkLoading` | boolean | No |


### `browser.visual-regression`

**Visual Regression Test** | ✅ SLM

Compare two screenshots (baseline vs current) with pixel diff, region-based comparison, and layout shift detection

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `baselineB64` | string | No |
| `currentB64` | string | No |
| `baselineUrl` | string | No |
| `currentUrl` | string | No |
| `tabId` | number | No |
| `tolerance` | number | No |
| `ignoreRegions` | string | No |
| `threshold` | number | No |

**Tags:** visual-regression, screenshot, diff, comparison, baseline


### `browser.visual-understand`

**Visual Scene Understanding** | ✅ SLM

Run ViT model inference on a screenshot to classify UI elements, detect layout zones, extract colours, and generate an LLM-readable scene description

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `screenshotB64` | string | No |
| `tabId` | number | No |
| `goal` | enum | No |
| `includeRaw` | boolean | No |
| `maxElements` | number | No |

**Tags:** vision, ai, scene, ui-detection, model


### `browser.wait`

**Wait** | ✅ SLM

Wait for a condition before continuing

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `condition` | enum | No |
| `selector` | string | No |
| `text` | string | No |
| `timeout` | number | No |
| `expression` | string | No |

**Tags:** wait, pause, condition, timeout, flow


### `browser.websocket`

**WebSocket Capture** | ✅ SLM

Intercept and log all WebSocket frames sent and received

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | No |
| `maxFrames` | number | No |

**Tags:** websocket, ws, realtime, socket, protocol


---

## CAR Governance Framework
> 6 tools

### `harness.action_check`

**Check Action Policy** | ✅ SLM

Verify if an action is allowed by the control policy

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | string | Yes |

**Tags:** harness, policy, permission, approval, control


### `harness.car_config`

**CAR Configuration** | ✅ SLM

Configure the Control-Agency-Runtime harness for agent governance

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `name` | string | Yes |
| `autonomyLevel` | enum | No |
| `tokenBudget` | number | No |
| `costCap` | number | No |

**Tags:** harness, car, governance, control, agency


### `harness.gate_evaluate`

**Evaluate Gates** | ✅ SLM

Run verification gates to check analysis completeness

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `context` | string | No |

**Tags:** harness, gates, evaluation, verification, completeness


### `harness.generate_agents_md`

**Generate AGENTS.md** | ✅ SLM

Generate the AGENTS.md governance file from the current harness configuration

**Tags:** harness, agents-md, governance, documentation, config


### `harness.register_agent`

**Register Agent** | ✅ SLM

Register a new agent in the harness with capabilities and budgets

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `name` | string | Yes |
| `role` | string | Yes |
| `autonomyLevel` | enum | No |
| `tokenBudget` | number | No |

**Tags:** harness, agent, register, capabilities, budget


### `harness.spend_check`

**Check Spend Rails** | ✅ SLM

Verify resource usage is within limits before executing actions

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `resource` | enum | Yes |
| `amount` | number | Yes |

**Tags:** harness, spend, budget, limits, rail


---

## Catalog
> 1 tools

### `catalog.browse`

**Harness Catalog** | ✅ SLM

Browse, search, and get details on all tools in the harness catalog — orchestration, memory, browser, coding, serving, observability, animation, scraping

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | No |
| `category` | string | No |
| `query` | string | No |
| `toolId` | string | No |

**Tags:** catalog, store, tools, browse, search


---

## Chains
> 2 tools

### `chains.agent`

**ReAct Agent** | ✅ SLM

Run the ReAct-style agent executor: reason → act → observe loop over registered tools until a final answer

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `question` | string | Yes |
| `maxIterations` | number | No |

**Tags:** agent, react, tools, loop, reasoning


### `chains.run`

**Chains Run** | ✅ SLM

Execute an LLM chain (prompt → model → parser) or multi-step sequential chain using the in-house stitap-chains engine

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `mode` | enum | No |
| `template` | string | No |
| `system` | string | No |
| `variables` | object | No |
| `parser` | enum | No |
| `steps` | array | No |

**Tags:** chain, prompt, llm, pipeline, sequential


---

## Cloud Storage
> 4 tools

### `storage.download`

**Download File** | ✅ SLM

Download files from cloud storage

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `bucket` | string | Yes |
| `key` | string | Yes |

**Tags:** storage, download


### `storage.list`

**List Files** | ✅ SLM

List files in a bucket with prefix filtering

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `bucket` | string | Yes |
| `prefix` | string | No |
| `maxKeys` | number | No |

**Tags:** storage, list, browse


### `storage.share`

**Generate Share Link** | ✅ SLM

Generate a presigned URL for secure file sharing

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `bucket` | string | Yes |
| `key` | string | Yes |
| `expiresInMinutes` | number | No |

**Tags:** storage, share, presigned


### `storage.upload`

**Upload File** | ✅ SLM

Upload files to S3, GCS, Azure Blob, or local storage

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `bucket` | string | Yes |
| `key` | string | Yes |
| `content` | string | Yes |
| `contentType` | string | No |

**Tags:** storage, upload, s3, cloud


---

## Computational Fluid Dynamics
> 6 tools

### `cfd.auto-dispatch`

**CFD Auto-Dispatch** | ✅ SLM

Intelligent auto-selection of solver type, grid resolution, boundary conditions, and convergence parameters from a natural language problem description. The agent describes the problem in plain English and this tool decides everything.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `description` | string | Yes |
| `maxGridCells` | number | No |
| `solve` | boolean | No |

**Tags:** cfd, auto, dispatch, intelligent, solver-selection


### `cfd.benchmark`

**CFD Benchmark** | 🔴 LLM Only

Run standard CFD benchmarks (lid-driven cavity, channel flow, backward-facing step) at specified Reynolds numbers and grid resolutions. Returns convergence metrics for comparison against published data.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `benchmarks` | array | No |

**Tags:** cfd, benchmark, validation, lid-driven-cavity, reynolds


### `cfd.mesh.create`

**Create CFD Mesh** | 🔴 LLM Only

Generate a structured 2D Cartesian mesh for CFD simulations with configurable domain size, grid resolution, and boundary conditions.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `problem` | enum | No |
| `domainWidth` | number | No |
| `domainHeight` | number | No |
| `ni` | number | No |
| `nj` | number | No |
| `reynoldsNumber` | number | No |

**Tags:** cfd, mesh, grid, finite-volume, simulation


### `cfd.pipeflow.thermal`

**Pipe Flow Thermal Solver** | ✅ SLM

Solve pipe flow with coupled momentum and energy equations. Handles convective heat transfer from external sources (sun, ambient). Returns velocity profile, temperature distribution, Nusselt number, and pressure drop.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `diameter` | number | No |
| `length` | number | No |
| `flowRateLPM` | number | No |
| `sunTempC` | number | No |
| `inletTempC` | number | No |
| `hSun` | number | No |
| `wallThickness` | number | No |
| `wallConductivity` | number | No |
| `ni` | number | No |
| `nj` | number | No |
| `outputs` | array | No |

**Tags:** cfd, pipe-flow, thermal, heat-transfer, convection


### `cfd.postprocess`

**CFD Post-Processing** | 🔴 LLM Only

Generate convergence charts, contour data, velocity vector fields, streamlines, and centerline profiles from solver results.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `problem` | enum | No |
| `reynoldsNumber` | number | No |
| `ni` | number | No |
| `nj` | number | No |
| `outputs` | array | No |

**Tags:** cfd, visualization, contour, streamlines, postprocess


### `cfd.solve.navier-stokes`

**Solve Navier-Stokes** | 🔴 LLM Only

Run an incompressible 2D Navier-Stokes simulation using the SIMPLE (Semi-Implicit Method for Pressure-Linked Equations) algorithm. Returns velocity fields, pressure field, convergence history, and diagnostics.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `problem` | enum | No |
| `reynoldsNumber` | number | No |
| `ni` | number | No |
| `nj` | number | No |
| `maxIterations` | number | No |
| `tolerance` | number | No |
| `alphaP` | number | No |
| `alphaU` | number | No |
| `convectionScheme` | enum | No |

**Tags:** cfd, navier-stokes, simple, pressure-velocity, solver


---

## Database Connectors
> 4 tools

### `database.connect`

**Database Connect** | ✅ SLM

Create a persistent connection with pooling

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `host` | string | No |
| `port` | number | No |
| `database` | string | Yes |
| `username` | string | No |
| `password` | string | No |
| `ssl` | boolean | No |

**Tags:** database, connection, pool


### `database.migrate`

**Database Migration** | 🔴 LLM Only

Run schema migrations with rollback support

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `connectionId` | string | Yes |
| `operations` | array | Yes |
| `dryRun` | boolean | No |

**Tags:** database, migration, schema


### `database.query`

**Database Query** | ✅ SLM

Execute SQL queries against PostgreSQL, MySQL, SQLite, or MongoDB

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `query` | string | Yes |
| `params` | array | No |
| `connectionId` | string | No |

**Tags:** database, sql, nosql, query


### `database.schema`

**Schema Inspector** | ✅ SLM

Inspect tables, columns, indexes, and relationships

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `connectionId` | string | Yes |
| `table` | string | No |
| `includeIndexes` | boolean | No |

**Tags:** database, schema, introspection


---

## Design System & Canvas
> 12 tools

### `design.artboard.add`

**Add Artboard** | ✅ SLM

Add a responsive artboard (mobile/tablet/desktop/wide)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `breakpoint` | enum | No |
| `name` | string | No |
| `width` | number | No |
| `height` | number | No |
| `backgroundColor` | string | No |

**Tags:** design, artboard, frame, responsive, breakpoint


### `design.canvas.create`

**Create Design Canvas** | ✅ SLM

Create a new blank design canvas with tokens

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `name` | string | No |
| `description` | string | No |
| `tokens` | object | No |

**Tags:** design, canvas, figma, visual, layout


### `design.element.add`

**Add Design Element** | ✅ SLM

Add an element (rect, text, button, card, nav, hero, grid, image, etc.)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `artboardId` | string | Yes |
| `kind` | enum | Yes |
| `name` | string | No |
| `x` | number | No |
| `y` | number | No |
| `width` | number | Yes |
| `height` | number | Yes |
| `text` | string | No |
| `src` | string | No |
| `icon` | string | No |
| `href` | string | No |
| `backgroundColor` | string | No |
| `color` | string | No |
| `fontSize` | string | No |
| `fontWeight` | string | No |
| `borderRadius` | string | No |
| `padding` | string | No |
| `textAlign` | enum | No |

**Tags:** design, element, rect, text, button


### `design.element.group`

**Group Elements** | ✅ SLM

Group multiple elements into a container

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `artboardId` | string | Yes |
| `elementIds` | array | Yes |
| `name` | string | No |

**Tags:** design, group, container, layers, organization


### `design.element.remove`

**Remove Element** | ✅ SLM

Remove an element (and its children) from the canvas

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `elementId` | string | Yes |

**Tags:** design, remove, delete, cleanup


### `design.element.update`

**Update Element** | ✅ SLM

Update an element

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `elementId` | string | Yes |
| `patch` | object | Yes |

**Tags:** design, update, edit, style, position


### `design.export`

**Export Design to Code** | ✅ SLM

Export canvas as React+Tailwind, HTML+CSS, SVG, or Figma JSON

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `format` | enum | No |
| `artboardId` | string | No |

**Tags:** design, export, react, tailwind, html


### `design.indic.create`

**Create Indic Design** | ✅ SLM

Create a complete design canvas pre-configured for an Indic script

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `script` | enum | Yes |
| `name` | string | No |
| `layout` | enum | No |

**Tags:** design, indic, template, one-shot, newspaper


### `design.landing.create`

**Create Full Landing Page** | ✅ SLM

Auto-generate a complete landing page (navbar + hero + cards + footer)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `title` | string | No |
| `subtitle` | string | No |
| `cta` | string | No |
| `brand` | string | No |

**Tags:** design, landing-page, template, full-page, one-shot


### `design.layer.reorder`

**Reorder Layer** | ✅ SLM

Move an element up/down/top/bottom in the layer stack

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `elementId` | string | Yes |
| `direction` | enum | Yes |

**Tags:** design, layer, z-order, reorder, stacking


### `design.layout.auto`

**Auto-Layout** | ✅ SLM

Auto-arrange elements in flex row/column or center them

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `artboardId` | string | Yes |
| `mode` | enum | No |
| `gap` | number | No |
| `align` | enum | No |
| `padding` | number | No |

**Tags:** design, layout, flex, auto-layout, alignment


### `design.preset.add`

**Add Component Preset** | ✅ SLM

Add a pre-built component (hero, navbar, cards, pricing, footer)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `canvasId` | string | Yes |
| `artboardId` | string | Yes |
| `preset` | enum | Yes |
| `offsetY` | number | No |

**Tags:** design, preset, template, hero, navbar


---

## Diagram & Architecture
> 7 tools

### `diagram.architecture`

**System Architecture** | ✅ SLM

Generate a layered system architecture diagram

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `layers` | string | Yes |
| `title` | string | No |

**Tags:** diagram, mermaid, architecture, system, layers


### `diagram.component_tree`

**UI Component Tree** | ✅ SLM

Generate a component hierarchy diagram

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `components` | string | Yes |
| `title` | string | No |

**Tags:** diagram, mermaid, component, hierarchy, tree


### `diagram.data_flow`

**Data Flow Diagram** | ✅ SLM

Generate a data flow diagram showing how data moves through the system

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `nodes` | string | Yes |
| `edges` | string | Yes |
| `title` | string | No |

**Tags:** diagram, mermaid, data-flow, system, integration


### `diagram.er_diagram`

**ER Diagram** | ✅ SLM

Generate an Entity-Relationship diagram for data models

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `entities` | string | Yes |
| `relationships` | string | Yes |
| `title` | string | No |

**Tags:** diagram, mermaid, er, database, data-model


### `diagram.route_map`

**Route Navigation Map** | ✅ SLM

Generate a route navigation map showing all routes and relationships

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `routes` | string | Yes |
| `title` | string | No |

**Tags:** diagram, mermaid, routes, navigation, sitemap


### `diagram.state_machine`

**State Machine Diagram** | ✅ SLM

Generate a state machine diagram for interactive flows

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `states` | string | Yes |
| `transitions` | string | Yes |
| `title` | string | No |

**Tags:** diagram, mermaid, state-machine, workflow, transitions


### `diagram.user_journey`

**User Journey Diagram** | ✅ SLM

Generate a user journey sequence diagram from route data

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `routes` | string | Yes |
| `title` | string | No |

**Tags:** diagram, mermaid, sequence, user-journey, flow


---

## Document Parsing
> 6 tools

### `doc.detectTutorial`

**Detect Tutorial** | ✅ SLM

Detect if a page is a tutorial and extract its structure

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `html` | string | Yes |
| `url` | string | No |
| `title` | string | No |

**Tags:** detect, tutorial, classify, analyze, structure


### `doc.extractAPI`

**Extract API Reference** | ✅ SLM

Extract API documentation into structured schemas

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `html` | string | Yes |
| `format` | enum | No |
| `includeExamples` | boolean | No |

**Tags:** api, reference, extract, schema, endpoints


### `doc.extractSteps`

**Extract Steps** | ✅ SLM

Extract step-by-step instructions from documentation

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `html` | string | Yes |
| `maxSteps` | number | No |
| `includeCodeBlocks` | boolean | No |
| `includeImages` | boolean | No |

**Tags:** extract, steps, instructions, tutorial, parse


### `doc.generateNarration`

**Generate Narration** | ✅ SLM

Generate natural narration text for tutorial steps

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `step` | string | Yes |
| `context` | string | No |
| `style` | enum | No |
| `audienceLevel` | enum | No |

**Tags:** narration, generate, tts, voice, text


### `doc.generateScript`

**Generate Tutorial Script** | ✅ SLM

Generate a video tutorial script from parsed documentation

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `steps` | array | Yes |
| `title` | string | No |
| `audienceLevel` | enum | No |
| `narrationStyle` | enum | No |
| `includeIntros` | boolean | No |
| `estimatedDuration` | number | No |

**Tags:** script, generate, tutorial, narration, scenes


### `doc.parseFAQ`

**Parse FAQ** | ✅ SLM

Extract question-answer pairs from FAQ pages

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `html` | string | Yes |
| `maxPairs` | number | No |
| `includeMetadata` | boolean | No |

**Tags:** faq, questions, answers, parse, extract


---

## Email Communication
> 2 tools

### `email.send`

**Send Email** | ✅ SLM

Send emails via SMTP, SendGrid, Resend, or Postmark

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `to` | array | Yes |
| `from` | string | Yes |
| `subject` | string | Yes |
| `text` | string | No |
| `html` | string | No |

**Tags:** email, send, smtp, notification


### `email.template`

**Email Template** | ✅ SLM

Render HTML email templates with variables

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `template` | string | No |
| `variables` | object | Yes |
| `format` | string | No |

**Tags:** email, template, render


---

## Engineering Mathematics
> 16 tools

### `math.beam.analysis`

**Beam & Column Analysis** | ✅ SLM

Compute beam deflection, moment, and shear diagrams for simply-supported or cantilever beams with point loads. Also computes Euler buckling load for columns.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `analysis` | enum | Yes |
| `E` | number | Yes |
| `I` | number | Yes |
| `L` | number | Yes |
| `loads` | array | No |
| `supportType` | enum | No |
| `effectiveLengthFactor` | number | No |

**Tags:** beam, deflection, moment, shear, buckling


### `math.derivative`

**Symbolic Differentiation** | 🔴 LLM Only

Compute the derivative of a polynomial or numeric function. Returns derivative coefficients or gradient vector.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `coefficients` | string | No |
| `functionType` | enum | No |
| `x` | string | No |

**Tags:** math, derivative, differentiation, gradient, calculus


### `math.fea.solve`

**FEA Structural Solver** | 🔴 LLM Only

Finite Element Analysis solver for 2D structural problems. Supports truss, beam, CST triangle, and Q4 quad elements. Meshes rectangular domains, applies loads and boundary conditions, and solves for displacements, stresses, and von Mises stress.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `problemType` | enum | Yes |
| `width` | number | No |
| `height` | number | No |
| `nx` | number | No |
| `ny` | number | No |
| `E` | number | Yes |
| `nu` | number | No |
| `thickness` | number | No |
| `loads` | array | No |
| `fixedEdges` | array | No |

**Tags:** fea, finite-element, structural, stress, displacement


### `math.find_root`

**Root Finding** | 🔴 LLM Only

Find roots of equations using Bisection, Newton-Raphson, or Secant methods. Returns root value, convergence status, and iteration count.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `method` | enum | No |
| `a` | number | Yes |
| `b` | number | Yes |
| `tolerance` | number | No |

**Tags:** math, root, bisection, newton, secant


### `math.heat.transfer`

**2D Heat Conduction Solver** | ✅ SLM

Solve 2D steady-state heat conduction with Dirichlet and convection boundary conditions. Returns temperature field, heat flux, and max/min temperatures.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `width` | number | Yes |
| `height` | number | Yes |
| `nx` | number | No |
| `ny` | number | No |
| `k` | number | Yes |
| `Q` | number | No |
| `TLeft` | number | No |
| `TRight` | number | No |
| `TTop` | number | No |
| `TBottom` | number | No |
| `convectionSide` | enum | No |
| `h_conv` | number | No |
| `Tinf` | number | No |

**Tags:** heat, thermal, conduction, temperature, convection


### `math.integrate`

**Numerical Integration** | 🔴 LLM Only

Compute definite integrals using Simpson

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `coefficients` | string | Yes |
| `a` | number | Yes |
| `b` | number | Yes |
| `method` | enum | No |
| `steps` | number | No |

**Tags:** math, integration, integral, simpson, trapezoidal


### `math.linalg.solve`

**Linear Algebra Solver** | ✅ SLM

Solve linear systems Ax=b using LU, Cholesky, QR, or iterative (CG, BiCGSTAB) methods. Also computes eigenvalues, matrix inverse, determinant, and condition number.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `operation` | enum | Yes |
| `A` | array | Yes |
| `b` | array | No |
| `method` | enum | No |

**Tags:** linear-algebra, matrix, eigenvalue, LU, Cholesky


### `math.matrix`

**Matrix Calculator** | ✅ SLM

Compute matrix determinant, inverse, eigenvalues, trace, rank. Supports arbitrary NxN matrices.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `operation` | enum | Yes |
| `matrix` | array | Yes |

**Tags:** matrix, determinant, inverse, eigenvalue, linear-algebra


### `math.optimize`

**Engineering Optimizer** | ✅ SLM

Solve optimization problems: gradient descent, Newton

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `method` | enum | Yes |
| `x0` | array | Yes |
| `maxIter` | number | No |
| `tolerance` | number | No |
| `learningRate` | number | No |

**Tags:** optimization, gradient-descent, newton, BFGS, linear-programming


### `math.poly_fit`

**Polynomial Regression** | 🔴 LLM Only

Fit a polynomial of given degree to (x, y) data using least-squares. Returns coefficients, degree, and R² goodness-of-fit.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `x` | string | Yes |
| `y` | string | Yes |
| `degree` | number | Yes |

**Tags:** math, polynomial, regression, fit, least-squares


### `math.science.solve`

**Science Formula Solver** | ✅ SLM

Solve physics, chemistry, and engineering formulas: Newton

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `formula` | string | Yes |
| `variables` | object | No |

**Tags:** science, physics, chemistry, engineering, formula


### `math.solve_ode`

**ODE Solver** | 🔴 LLM Only

Solve ordinary differential equations using Euler or 4th-order Runge-Kutta methods. Supports scalar and system ODEs.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | No |
| `y0` | string | Yes |
| `t0` | number | Yes |
| `tEnd` | number | Yes |
| `dt` | number | No |
| `method` | enum | No |

**Tags:** math, ode, differential, runge-kutta, euler


### `math.solve_pde`

**PDE Solver** | 🔴 LLM Only

Solve partial differential equations using finite-difference methods. Supports 1D heat equation, 1D wave equation, and 2D Laplace equation.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `equation` | enum | Yes |
| `alpha` | number | No |
| `L` | number | Yes |
| `T` | number | Yes |
| `nx` | number | No |
| `nt` | number | No |

**Tags:** math, pde, partial-differential, heat, wave


### `math.stress.analysis`

**Stress Analysis** | ✅ SLM

Compute principal stresses, von Mises stress, Mohr

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sx` | number | Yes |
| `sy` | number | Yes |
| `txy` | number | Yes |
| `E` | number | No |
| `nu` | number | No |

**Tags:** stress, strain, von-mises, mohr, principal


### `math.symbolic.solve`

**Symbolic Math Solver** | ✅ SLM

Solve math problems: evaluate expressions, differentiate, integrate, solve equations, compute Taylor series, limits, matrix operations. Supports standard math notation.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `problem` | string | Yes |
| `expression` | string | No |
| `variable` | string | No |
| `a` | number | No |
| `b` | number | No |
| `center` | number | No |
| `order` | number | No |
| `guesses` | array | No |
| `variables` | array | No |
| `equations` | array | No |
| `initialGuess` | array | No |

**Tags:** symbolic, calculus, algebra, equation, derivative


### `math.transform`

**Transform Calculator** | 🔴 LLM Only

Compute Laplace transform, Fourier transform, inverse Laplace, inverse Fourier. Useful for signals, control systems, and differential equations.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `expression` | string | Yes |
| `variable` | string | No |
| `s` | number | No |
| `signal` | array | No |
| `sampleRate` | number | No |

**Tags:** laplace, fourier, transform, signal, control


---

## Enterprise Workflow
> 1 tools

### `enterprise.project`

**Enterprise Project** | ✅ SLM

Company guideline packs + migration projects with long-running kanban execution (plan → commit → develop/test/document → verify)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `orgName` | string | No |
| `role` | string | No |
| `sections` | object | No |
| `stories` | array | No |
| `fromStack` | string | No |
| `toStack` | string | No |

**Tags:** enterprise, guidelines, migration, long-running, kanban


---

## Environment Management
> 4 tools

### `env.create`

**Create Environment** | ✅ SLM

Create an isolated virtual environment for a specific programming language with resource limits

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `name` | string | Yes |
| `language` | enum | Yes |
| `memoryLimitMB` | number | No |
| `timeoutMs` | number | No |
| `envVars` | string | No |

**Tags:** environment, sandbox, code, execution, runtime


### `env.destroy`

**Destroy Environment** | ✅ SLM

Destroy an environment and free its resources (memory, file system, packages)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `environmentId` | string | Yes |

**Tags:** destroy, cleanup, environment, resource


### `env.list`

**List Environments** | ✅ SLM

List all active environments with their language, status, package count, and execution history

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `language` | enum | No |

**Tags:** list, environments, status, management


### `env.run`

**Run Code** | ✅ SLM

Execute code in an existing environment, capturing stdout, stderr, return value, and execution time

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `environmentId` | string | Yes |
| `code` | string | Yes |
| `stdin` | string | No |
| `timeoutMs` | number | No |
| `workDir` | string | No |

**Tags:** run, execute, code, output, result


---

## Fault Detection & Quality
> 3 tools

### `fault.classify`

**Rule-Based Fault Classifier** | 🔴 LLM Only

Classify fault events using configurable diagnostic rules. Supports custom rules with condition matching, severity assignment, and recommendations.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `events` | string | No |
| `rules` | string | No |

**Tags:** fault, classify, rules, diagnostic, severity


### `fault.detect_anomalies`

**Anomaly / Fault Detection** | 🔴 LLM Only

Detect anomalies and faults in time-series or multivariate data using Z-score, Mahalanobis distance, Isolation Forest, or change-point detection. Returns per-point anomaly scores and flags.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `data` | string | Yes |
| `method` | enum | No |
| `threshold` | number | No |
| `windowSize` | number | No |

**Tags:** fault, anomaly, detection, outlier, isolation-forest


### `fault.spc_chart`

**Statistical Process Control (SPC)** | 🔴 LLM Only

Generate SPC control charts (X̄ chart, EWMA, CUSUM) for process monitoring. Detects out-of-control signals, trends, and shifts.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `data` | string | Yes |
| `method` | enum | No |
| `lambda` | number | No |
| `threshold` | number | No |

**Tags:** fault, spc, control-chart, ewma, cusum


---

## Fractal Analysis
> 5 tools

### `fractal.chaos`

**Chaos & Dynamical Systems** | ✅ SLM

Generate chaos theory visualizations: logistic map bifurcation, Hénon phase space, Lorenz attractor, cobweb diagrams. Analyze period-doubling routes to chaos.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `r` | number | No |
| `x0` | number | No |
| `iterations` | number | No |
| `sigma` | number | No |
| `rho` | number | No |
| `beta` | number | No |

**Tags:** chaos, bifurcation, lorenz, attractor, dynamical-systems


### `fractal.dimension`

**Fractal Dimension Analyzer** | 🔴 LLM Only

Compute fractal dimension using box-counting, Minkowski-Bouligand, lacunarity analysis, and multifractal spectrum f(α). Works on any binary or grayscale image/data.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `method` | enum | Yes |
| `data` | array | Yes |
| `threshold` | number | No |

**Tags:** fractal, dimension, box-counting, lacunarity, multifractal


### `fractal.generate`

**Fractal Generator** | 🔴 LLM Only

Generate any fractal: Mandelbrot, Julia, Burning Ship, Newton, Tricorn, Sierpinski, Koch, Cantor, Dragon, Hilbert, IFS (Barnsley fern, etc.), L-systems, orbit trap, distance estimation. Returns pixel data or line data for rendering.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `width` | number | No |
| `height` | number | No |
| `zoom` | number | No |
| `centerX` | number | No |
| `centerY` | number | No |
| `cReal` | number | No |
| `cImag` | number | No |
| `maxIter` | number | No |
| `iterations` | number | No |
| `seed` | number | No |
| `octaves` | number | No |

**Tags:** fractal, mandelbrot, julia, sierpinski, koch


### `fractal.ifs`

**IFS Fractal Generator** | 🔴 LLM Only

Generate Iterated Function System fractals: Barnsley fern, Sierpinski gasket, Cantor dust, tree, spiral. Supports custom affine transformations.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `preset` | enum | No |
| `functions` | array | No |
| `iterations` | number | No |
| `seed` | number | No |

**Tags:** ifs, fractal, barnsley, fern, attractor


### `fractal.lsystem`

**L-System Generator** | ✅ SLM

Generate L-system fractals: Koch curve, Sierpinski arrow, Dragon, plant, tree, Gosper curve, Penrose tiling. Supports custom axiom and production rules.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `preset` | enum | No |
| `axiom` | string | No |
| `rules` | array | No |
| `angle` | number | No |
| `iterations` | number | No |

**Tags:** l-system, fractal, plant, tree, koch


---

## Governance
> 1 tools

### `approvals.gate`

**Approval Gate** | ✅ SLM

Human-in-the-loop risk gate for autonomous agents: submit, decide, expire, configure policy

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `title` | string | No |
| `toolId` | string | No |
| `risk` | enum | No |
| `requestId` | string | No |
| `decision` | enum | No |
| `by` | string | No |
| `preset` | enum | No |

**Tags:** approvals, human-in-the-loop, policy, risk, autonomy


---

## Graph Execution
> 1 tools

### `graph.run`

**Graph Run** | ✅ SLM

Define and invoke a stateful graph (nodes, edges, conditional routing) using the in-house stitap-graph engine

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `name` | string | No |
| `channels` | array | Yes |
| `recursionLimit` | number | No |

**Tags:** graph, state, workflow, routing, checkpointing


---

## Graphs & Visualization
> 3 tools

### `chart.fractal-viz`

**Fractal Visualization** | ✅ SLM

Generate recharts-compatible visualizations for fractal analysis: dimension plot, multifractal spectrum, convergence history, escape-time heatmaps.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `data` | object | Yes |

**Tags:** fractal, visualization, dimension, spectrum, heatmap


### `chart.generate`

**Chart Generator** | ✅ SLM

Generate recharts-compatible chart data for 35+ chart types: line, bar, scatter, area, histogram, box plot, violin, density, contour, heatmap, vector field, streamlines, phase portrait, bifurcation, radar, treemap, waterfall, funnel, gauge, sparkline, Pareto, Q-Q, autocorrelation, spectrum, fractal dimension, multifractal, convergence.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `title` | string | No |
| `xLabel` | string | No |
| `yLabel` | string | No |
| `data` | object | Yes |

**Tags:** chart, visualization, graph, recharts, dashboard


### `chart.stats`

**Quick Statistics** | ✅ SLM

Compute and visualize descriptive statistics: mean, median, std, percentiles, skewness, kurtosis, IQR, with histogram and box plot.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `values` | array | Yes |
| `name` | string | No |

**Tags:** statistics, histogram, box-plot, descriptive, analysis


---

## Hugging Face Hub
> 6 tools

### `huggingface.delete`

**Delete Downloaded Model** | ✅ SLM

Delete a downloaded HuggingFace model from local storage to free up disk space.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `modelId` | string | Yes |
| `filename` | string | Yes |

**Tags:** huggingface, delete, cleanup


### `huggingface.download`

**Download HuggingFace Model** | ✅ SLM

Download a GGUF model file from HuggingFace Hub. Supports progress tracking, pause/resume, and automatic quantization selection.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `modelId` | string | Yes |
| `quant` | string | No |
| `maxRAMGB` | number | No |

**Tags:** huggingface, download, gguf, model


### `huggingface.list_downloaded`

**List Downloaded Models** | ✅ SLM

List all HuggingFace models that have been downloaded and are available locally.

**Tags:** huggingface, models, local


### `huggingface.quant_info`

**Get Quantization Info** | ✅ SLM

Get detailed information about a quantization level including bits per weight, quality score, speed score, and RAM requirements.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `quant` | string | No |

**Tags:** huggingface, quantization, info


### `huggingface.recommend`

**Recommend Model** | ✅ SLM

Get a recommended model and quantization level based on available RAM and use case.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `ramGB` | number | Yes |
| `category` | string | No |

**Tags:** huggingface, recommend, model


### `huggingface.search`

**Search HuggingFace Models** | ✅ SLM

Search the HuggingFace Hub for AI models. Supports filtering by GGUF files, parameter count, RAM requirements, and tags.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `query` | string | Yes |
| `ggufOnly` | boolean | No |
| `maxRAMGB` | number | No |
| `limit` | number | No |

**Tags:** huggingface, models, search, gguf


---

## Indic Typography Engine
> 7 tools

### `typography.indic.css`

**Generate Indic CSS** | ✅ SLM

Generate CSS that follows W3C Indic Layout Requirements

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `script` | enum | Yes |
| `selector` | string | No |
| `includeFonts` | boolean | No |

**Tags:** typography, css, generation, google-fonts, responsive


### `typography.indic.detect`

**Detect Indic Script** | ✅ SLM

Detect which Indic script a text sample uses

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `text` | string | Yes |

**Tags:** typography, indic, script-detection, telugu, hindi


### `typography.indic.newspaper`

**Newspaper Layout Preset** | ✅ SLM

Get a proven newspaper-style column layout for an Indic script

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `script` | enum | Yes |
| `preset` | enum | No |

**Tags:** typography, newspaper, columns, layout, editorial


### `typography.indic.rules`

**Get Indic Typography Rules** | ✅ SLM

Get W3C-compliant typography rules for an Indic script

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `script` | enum | Yes |

**Tags:** typography, rules, w3c, line-height, fonts


### `typography.indic.tokens`

**Generate Indic Design Tokens** | ✅ SLM

Generate Tailwind-compatible design tokens for an Indic script

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `script` | enum | Yes |

**Tags:** typography, tokens, tailwind, design-system, config


### `typography.indic.validate`

**Validate Indic Typography** | ✅ SLM

Check CSS against W3C Indic Layout Requirements

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `script` | enum | Yes |
| `css` | object | No |

**Tags:** typography, validation, audit, w3c, accessibility


### `typography.south-indian.compare`

**South Indian Language Comparison** | ✅ SLM

Compare typography rules across Telugu, Kannada, Tamil, Malayalam

**Tags:** typography, south-indian, comparison, telugu, kannada


---

## Inference & Model Management
> 5 tools

### `inference.download`

**Model Download** | ✅ SLM

Download model files with resumable chunked transfer, parallel connections, and SHA256 integrity verification

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `url` | string | Yes |
| `filename` | string | Yes |
| `sha256` | string | No |
| `action` | enum | No |
| `parallelism` | number | No |

**Tags:** download, resumable, chunked, sha256, model


### `inference.legacy`

**Legacy Server Support** | ✅ SLM

Detect legacy server hardware and provide actionable guidance for running GGUF inference on old systems

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | No |

**Tags:** legacy, server, numa, static-link, cross-compile


### `inference.probe`

**Hardware Probe** | ✅ SLM

Detect all available inference backends on this device — no privilege elevation required

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `includeBenchmark` | boolean | No |

**Tags:** hardware, detection, probe, capabilities


### `inference.quant`

**Quantization Menu** | ✅ SLM

Show viable quantization levels for a model on this device with memory, throughput, and quality estimates

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `modelSource` | string | Yes |
| `originalWeightsAvailable` | boolean | No |
| `currentFormat` | string | No |
| `availableFormats` | array | No |

**Tags:** quantization, gguf, memory, quality, optimization


### `inference.router`

**Inference Router** | ✅ SLM

Select the fastest available backend for the current device — benchmarks each backend, picks the winner, caches the decision

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `mode` | enum | No |
| `workloadType` | enum | No |
| `forceRebenchmark` | boolean | No |

**Tags:** inference, routing, hardware, benchmarking, openvino


---

## Knowledge Base
> 1 tools

### `knowledge.search`

**Knowledge Base (RAG)** | ✅ SLM

Ingest documents into a local vector store and retrieve budgeted context for prompts

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `name` | string | No |
| `text` | string | No |
| `query` | string | No |
| `topK` | number | No |
| `tokenBudget` | number | No |

**Tags:** rag, vector, search, context, offline


---

## LLM Integration & Prompting
> 6 tools

### `llm.buildPrompt`

**Build Prompt** | ✅ SLM

Build a structured prompt for an LLM from templates and context

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `template` | string | No |
| `variables` | object | No |
| `systemPrompt` | string | No |
| `fewShot` | array | No |
| `maxTokens` | number | No |
| `temperature` | number | No |

**Tags:** prompt, template, llm, few-shot, system


### `llm.call`

**Call LLM** | ✅ SLM

Make a direct API call to any configured LLM provider

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `model` | string | Yes |
| `messages` | array | No |
| `endpoint` | string | No |
| `maxTokens` | number | No |
| `temperature` | number | No |
| `stream` | boolean | No |
| `timeout` | number | No |

**Tags:** call, api, inference, openai, ollama


### `llm.generateScript`

**Generate Tutorial Script** | ✅ SLM

Generate a complete video tutorial script using an LLM

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `content` | string | Yes |
| `title` | string | Yes |
| `provider` | string | No |
| `model` | string | No |
| `audienceLevel` | enum | No |
| `maxScenes` | number | No |
| `style` | enum | No |

**Tags:** script, generate, tutorial, video, scenes


### `llm.manageContext`

**Manage Context** | ✅ SLM

Manage conversation context window for LLM interactions

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `messages` | array | No |
| `maxTokens` | number | No |
| `strategy` | enum | No |

**Tags:** context, window, token, history, truncation


### `llm.parseResponse`

**Parse Response** | ✅ SLM

Parse LLM response into structured data

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `response` | string | Yes |
| `format` | enum | No |
| `schema` | object | No |

**Tags:** parse, response, json, extract, structured


### `llm.routeModel`

**Route to Model** | ✅ SLM

Route a request to the best available LLM based on task type

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `taskType` | enum | Yes |
| `complexity` | enum | No |
| `preferredProvider` | string | No |
| `maxLatencyMs` | number | No |
| `offlineOnly` | boolean | No |

**Tags:** route, model, select, provider, fallback


---

## Legacy Server Revival
> 4 tools

### `server.build-optimizer`

**llama.cpp Build Optimizer** | 🔴 LLM Only

Generates exact cmake flags, compile options, quantization, and runtime config to build llama.cpp for pre-AVX hardware. Solves SIGILL crashes on SSE-only machines.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `serverModel` | string | No |

**Tags:** llama.cpp, build, optimization, compile, legacy


### `server.hardware-detect`

**Hardware Detection** | ✅ SLM

Detect CPU features (ISA, cores, cache), memory (size, type, speed), and storage on the current machine or a remote server via SSH probe. Generates a complete hardware profile for build optimization.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `probeOutput` | string | No |

**Tags:** hardware, cpuid, memory, detection


### `server.legacy-hardware-db`

**Legacy Server Database** | ✅ SLM

Query the database of pre-2008 enterprise servers (Dell PowerEdge, HP ProLiant, IBM xSeries, Sun Fire, Supermicro). ~3 million estimated in the field.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `maxYear` | number | No |
| `minRAMGB` | number | No |
| `manufacturer` | string | No |

**Tags:** legacy, hardware, database, servers


### `server.rag-deploy`

**RAG Server Deployment Kit** | 🔴 LLM Only

Complete deployment plan: OS selection, llama.cpp build, vector DB, document ingestion, nginx, systemd services, and monitoring for pre-2008 servers.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `serverModel` | string | No |

**Tags:** rag, deployment, chatbot, legacy, server


---

## Machine Learning
> 8 tools

### `ml.cluster`

**K-Means Clustering** | 🔴 LLM Only

Group unlabeled data into K clusters. Returns cluster assignments, centroids, inertia, and silhouette scores.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `data` | string | Yes |
| `k` | number | Yes |
| `maxIter` | number | No |

**Tags:** ml, clustering, kmeans, unsupervised


### `ml.evaluate`

**Evaluate Model** | 🔴 LLM Only

Evaluate a trained model against test data. Returns MSE, RMSE, MAE, R-squared, accuracy, precision, recall, F1, confusion matrix.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `modelJson` | string | Yes |
| `data` | string | Yes |

**Tags:** ml, evaluate, metrics, accuracy


### `ml.feature_importance`

**Feature Importance** | 🔴 LLM Only

Get feature importance scores from tree-based models (random forest, gradient boosting).

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `modelJson` | string | Yes |
| `featureNames` | string | No |

**Tags:** ml, feature, importance, explainability


### `ml.forecast`

**Time Series Forecast** | 🔴 LLM Only

Forecast future values from a time series using Holt-Winters exponential smoothing or moving average. Returns predictions with confidence intervals.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `series` | string | Yes |
| `horizon` | number | Yes |
| `method` | enum | No |
| `seasonLength` | number | No |

**Tags:** ml, forecast, time-series, smoothing


### `ml.pca`

**PCA (Dimensionality Reduction)** | 🔴 LLM Only

Reduce feature dimensions via Principal Component Analysis. Returns transformed data, explained variance ratios, and loadings.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `data` | string | Yes |
| `nComponents` | number | No |

**Tags:** ml, pca, dimensionality, reduction


### `ml.predict`

**Predict** | 🔴 LLM Only

Run predictions using a previously trained model on new data points.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `modelJson` | string | Yes |
| `data` | string | Yes |

**Tags:** ml, predict, inference


### `ml.preprocess`

**Preprocess Data** | 🔴 LLM Only

Clean and prepare data for ML: normalize, standardize, handle missing values, encode categoricals, split train/test.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `data` | string | Yes |
| `operations` | string | Yes |
| `targetColumn` | string | No |

**Tags:** ml, preprocess, clean, normalize


### `ml.train`

**Train Model** | 🔴 LLM Only

Train a machine learning model on labeled data. Supports linear/logistic regression, KNN, random forest, gradient boosting. Returns trained model + metrics.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `algorithm` | enum | Yes |
| `data` | string | Yes |
| `testSplit` | number | No |
| `hyperparams` | string | No |

**Tags:** ml, train, supervised, regression, classification


---

## Maps & Geolocation
> 5 tools

### `maps.geocode`

**Geocode Address** | ✅ SLM

Convert address text to GPS coordinates

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `address` | string | Yes |
| `limit` | number | No |
| `countryCode` | string | No |
| `provider` | string | No |

**Tags:** maps, geocode, location


### `maps.geofence`

**Geofence** | ✅ SLM

Create and check geographic boundary zones

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | string | Yes |
| `fence` | object | No |
| `point` | object | No |

**Tags:** maps, geofence, boundary


### `maps.isochrone`

**Isochrone** | ✅ SLM

Areas reachable within N minutes from a point

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `lat` | number | Yes |
| `lng` | number | Yes |
| `ranges` | array | Yes |
| `profile` | string | No |

**Tags:** maps, isochrone, accessibility


### `maps.reverse-geocode`

**Reverse Geocode** | ✅ SLM

Convert GPS coordinates to an address

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `lat` | number | Yes |
| `lng` | number | Yes |
| `provider` | string | No |

**Tags:** maps, reverse-geocode


### `maps.route`

**Calculate Route** | ✅ SLM

Driving, cycling, or walking route between waypoints

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `waypoints` | array | No |
| `profile` | string | No |
| `steps` | boolean | No |

**Tags:** maps, route, navigation


---

## Mobile Hardware
> 5 tools

### `hardware.camera`

**Capture Photo** | ✅ SLM

Capture photo from device camera (mobile/web)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `facingMode` | string | No |
| `width` | number | No |
| `height` | number | No |
| `quality` | number | No |

**Tags:** hardware, camera, photo, mobile


### `hardware.clipboard`

**Clipboard** | ✅ SLM

Read/write text or images to system clipboard

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | string | Yes |
| `text` | string | No |

**Tags:** hardware, clipboard


### `hardware.gps`

**Get GPS Location** | ✅ SLM

Get current GPS position from the device

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `highAccuracy` | boolean | No |
| `timeout` | number | No |

**Tags:** hardware, gps, location, mobile


### `hardware.motion`

**Accelerometer** | 🔴 LLM Only

Read device motion sensors (accelerometer + gyroscope)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `duration` | number | No |

**Tags:** hardware, accelerometer, gyroscope, mobile


### `hardware.speech`

**Text-to-Speech** | ✅ SLM

Speak text using device speech synthesis

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `text` | string | Yes |
| `lang` | string | No |
| `rate` | number | No |
| `pitch` | number | No |

**Tags:** hardware, speech, tts, audio


---

## Notifications
> 1 tools

### `notify.send`

**Notifications** | ✅ SLM

Dispatch agent notifications through severity-filtered channels with quiet hours and dedupe

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `severity` | enum | No |
| `title` | string | No |
| `body` | string | No |
| `dedupeKey` | string | No |
| `kind` | enum | No |
| `target` | string | No |
| `minSeverity` | enum | No |

**Tags:** notifications, alerts, webhook, quiet-hours, dedupe


---

## OCR & Text Recognition
> 4 tools

### `ocr.indic.batch`

**Indic Batch OCR** | ✅ SLM

OCR multiple images in Indian languages

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `images` | array | Yes |
| `language` | enum | No |

**Tags:** ocr, indic, batch, multi-image, document-scanning


### `ocr.indic.detect`

**Indic Script Detector** | ✅ SLM

Detect the dominant Indian script in an image

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `image` | string | Yes |

**Tags:** ocr, indic, script-detection, hindi, bengali


### `ocr.indic.postprocess`

**Indic Text Normalizer** | ✅ SLM

Normalize and fix Indic OCR output text

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `text` | string | Yes |
| `scriptFamily` | enum | No |

**Tags:** ocr, indic, normalization, unicode, post-processing


### `ocr.indic.recognize`

**Indic Text Recognition** | ✅ SLM

Recognize text in Indian languages from images

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `image` | string | Yes |
| `language` | enum | No |
| `profile` | enum | No |
| `additionalLanguages` | array | No |

**Tags:** ocr, indic, text-recognition, hindi, bengali


---

## OS & Desktop Integration
> 10 tools

### `os.execute`

**Execute Command** | 🔴 LLM Only

Execute a shell command (sandboxed)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `command` | string | Yes |
| `cwd` | string | No |
| `timeout` | number | No |

**Tags:** os, shell, execute


### `os.file.list`

**List Directory** | ✅ SLM

List files and subdirectories in a path

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `path` | string | Yes |
| `recursive` | boolean | No |

**Tags:** os, filesystem, list


### `os.file.read`

**Read File** | ✅ SLM

Read a file from the local filesystem

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `path` | string | Yes |

**Tags:** os, filesystem, read


### `os.file.watch`

**Watch File** | 🔴 LLM Only

Watch a file or directory for changes

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `path` | string | Yes |
| `recursive` | boolean | No |

**Tags:** os, filesystem, watch


### `os.file.write`

**Write File** | ✅ SLM

Write content to a local file

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `path` | string | Yes |
| `content` | string | Yes |

**Tags:** os, filesystem, write


### `os.notify`

**Desktop Notification** | ✅ SLM

Send native desktop or browser notification

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `title` | string | Yes |
| `body` | string | No |
| `icon` | string | No |

**Tags:** os, notification, alert


### `os.power`

**Power Management** | 🔴 LLM Only

Check power source and prevent display sleep

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | string | Yes |

**Tags:** os, power, battery


### `os.process.list`

**List Processes** | 🔴 LLM Only

List running system processes

**Tags:** os, process, monitoring


### `os.system-info`

**System Information** | ✅ SLM

Get platform, CPUs, memory, screen, locale info

**Tags:** os, system, info


### `os.tray`

**System Tray** | 🔴 LLM Only

Create or update a system tray icon (Electron)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `title` | string | Yes |
| `icon` | string | No |
| `menu` | array | No |

**Tags:** os, tray, electron, desktop


---

## Observability & Tracing
> 1 tools

### `trace.runs`

**Run Tracing** | ✅ SLM

Trace agent runs as span trees with token accounting and waterfall postmortems

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `name` | string | No |
| `runId` | string | No |
| `spanIndex` | number | No |
| `status` | enum | No |
| `tokensIn` | number | No |
| `tokensOut` | number | No |
| `error` | string | No |

**Tags:** tracing, observability, spans, tokens, postmortem


---

## Office Document Generation
> 5 tools

### `office.doc`

**Document Generator** | ✅ SLM

Generate structured documents (Word alternative): headings, paragraphs, tables, images, page breaks. Convert Markdown to styled documents. Export as HTML for rendering.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `title` | string | No |
| `markdown` | string | No |
| `content` | array | No |
| `author` | string | No |
| `attendees` | array | No |
| `agenda` | array | No |
| `actionItems` | array | No |

**Tags:** document, word, docx, report, markdown


### `office.email`

**Email Generator** | ✅ SLM

Generate email messages with proper headers, formatting, attachments, and HTML templates.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `from` | string | Yes |
| `to` | array | Yes |
| `subject` | string | Yes |
| `body` | string | Yes |
| `cc` | array | No |
| `priority` | enum | No |
| `html` | boolean | No |

**Tags:** email, outlook, mail, message


### `office.pdf`

**PDF Generator** | ✅ SLM

Generate PDF content from Markdown or structured data. Produces renderable HTML that can be printed to PDF.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `title` | string | No |
| `markdown` | string | Yes |

**Tags:** pdf, document, export


### `office.sheet`

**Spreadsheet Generator** | ✅ SLM

Generate spreadsheets (Excel alternative): populate sheets from CSV/JSON, create pivot tables, add formulas. Export as CSV.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `name` | string | No |
| `csv` | string | No |
| `json` | string | No |
| `sheetName` | string | No |
| `groupBy` | string | No |
| `valueField` | string | No |
| `aggFunc` | enum | No |

**Tags:** spreadsheet, excel, csv, pivot, data


### `office.slide`

**Presentation Generator** | ✅ SLM

Generate presentations (PowerPoint alternative): title slides, content slides, two-column layouts. Convert Markdown to presentations. Export as HTML.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `title` | string | No |
| `markdown` | string | No |
| `layout` | enum | No |
| `slideTitle` | string | No |

**Tags:** presentation, powerpoint, slides, pptx


---

## OpenViking Context Store
> 5 tools

### `viking.build_context`

**Build LLM Context** | ✅ SLM

Generate an SLM-friendly context block from indexed resources

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `query` | string | Yes |
| `tokenBudget` | number | No |

**Tags:** viking, context, llm, prompt, rag


### `viking.create_project`

**Create Viking Project** | ✅ SLM

Initialize a new viking:
    longDescription: 

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `name` | string | Yes |
| `baseUrl` | string | Yes |

**Tags:** viking, context, tiered, storage, openviking


### `viking.index_resource`

**Index Resource** | ✅ SLM

Store a crawled resource in the appropriate tier (L0/L1/L2)

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `projectId` | string | Yes |
| `path` | string | Yes |
| `tier` | enum | Yes |
| `summary` | string | Yes |

**Tags:** viking, index, tiered, L0, L1


### `viking.query`

**Query Context** | ✅ SLM

Search and retrieve resources from the viking:
    longDescription: 

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `projectId` | string | Yes |
| `search` | string | No |
| `tier` | enum | No |
| `tokenBudget` | number | No |

**Tags:** viking, query, search, budget-aware, retrieval


### `viking.webbuilder_audit`

**WebBuilder Audit** | ✅ SLM

Run requirement analysis audit across 6 functional pillars

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `url` | string | Yes |
| `depth` | enum | No |

**Tags:** viking, audit, webbuilder, requirements, analysis


---

## Payment Processing
> 4 tools

### `payment.create_checkout`

**Create Checkout** | ✅ SLM

Create Stripe checkout for one-time or subscription payments

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `amount` | number | Yes |
| `currency` | string | Yes |
| `productName` | string | Yes |
| `mode` | string | No |

**Tags:** payment, stripe, checkout


### `payment.invoice`

**Generate Invoice** | ✅ SLM

Generate PDF invoices with line items and taxes

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `items` | array | Yes |
| `currency` | string | Yes |
| `tax` | number | No |
| `notes` | string | No |

**Tags:** invoice, pdf, billing


### `payment.subscription`

**Manage Subscription** | 🔴 LLM Only

Create, update, or cancel recurring subscriptions

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `action` | string | Yes |
| `customerId` | string | No |
| `priceId` | string | No |

**Tags:** subscription, billing, recurring


### `payment.verify`

**Verify Payment** | ✅ SLM

Verify a completed payment by session or transaction ID

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `sessionId` | string | Yes |

**Tags:** payment, verify, webhook


---

## Real-time Collaboration
> 4 tools

### `collab.channel.create`

**Create Channel** | ✅ SLM

Create a messaging channel in a session

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sessionId` | string | Yes |
| `name` | string | Yes |
| `type` | string | No |

**Tags:** collaboration, channel, chat


### `collab.ot.transform`

**Operational Transform** | 🔴 LLM Only

Resolve concurrent editing conflicts via OT

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `document` | string | Yes |
| `operations` | array | Yes |
| `strategy` | string | No |

**Tags:** collaboration, ot, conflict-resolution


### `collab.session.create`

**Create Session** | ✅ SLM

Create a real-time collaboration session

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `name` | string | Yes |
| `ownerId` | string | Yes |
| `maxUsers` | number | No |

**Tags:** collaboration, session, realtime


### `collab.session.join`

**Join Session** | ✅ SLM

Join an existing session with presence tracking

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sessionId` | string | Yes |
| `userId` | string | Yes |
| `name` | string | Yes |

**Tags:** collaboration, join, presence


---

## SMS Communication
> 1 tools

### `sms.send`

**Send SMS** | ✅ SLM

Send SMS messages via Twilio, Vonage, or AWS SNS

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `to` | string | Yes |
| `from` | string | No |
| `body` | string | Yes |

**Tags:** sms, twilio, notification


---

## Sandbox Execution
> 8 tools

### `sandbox.create`

**Create Sandbox** | ✅ SLM

Create a new isolated execution sandbox from a scenario template or custom configuration

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `scenarioId` | string | No |
| `name` | string | No |
| `description` | string | No |
| `isolationLevel` | enum | No |
| `tags` | string | No |

**Tags:** sandbox, create, isolation, environment, worker


### `sandbox.destroy`

**Destroy Sandbox** | ✅ SLM

Terminate and clean up an isolated sandbox, freeing its worker, file system, and network logs

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sandboxId` | string | Yes |

**Tags:** sandbox, destroy, cleanup, terminate


### `sandbox.exec`

**Execute in Sandbox** | ✅ SLM

Execute JavaScript/TypeScript code inside an isolated sandbox with network policy enforcement and timeout

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sandboxId` | string | Yes |
| `code` | string | Yes |
| `language` | enum | No |
| `timeoutMs` | number | No |

**Tags:** sandbox, execute, run, code, isolate


### `sandbox.files`

**Manage Sandbox Files** | ✅ SLM

List, read, or write files in a sandbox

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sandboxId` | string | Yes |
| `action` | enum | Yes |
| `path` | string | No |
| `content` | string | No |

**Tags:** sandbox, files, virtual-fs, read, write


### `sandbox.list`

**List Sandboxes** | ✅ SLM

List all active sandboxes with their status, resource usage, and configuration

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `filter` | enum | No |
| `scenarioId` | string | No |
| `tag` | string | No |

**Tags:** sandbox, list, status, monitor


### `sandbox.network`

**Sandbox Network Monitor** | ✅ SLM

View network traffic log and policy status for a sandbox

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sandboxId` | string | Yes |
| `action` | enum | Yes |
| `limit` | number | No |

**Tags:** sandbox, network, monitor, traffic, policy


### `sandbox.scenarios`

**Browse Sandbox Scenarios** | ✅ SLM

List all available sandbox scenarios: unit testing, integration, security audit, development, demo, performance

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `category` | enum | No |
| `search` | string | No |

**Tags:** sandbox, scenarios, templates, browse


### `sandbox.snapshot`

**Snapshot Sandbox State** | ✅ SLM

Capture a snapshot of a sandbox

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `sandboxId` | string | Yes |

**Tags:** sandbox, snapshot, backup, restore, state


---

## Session & Swarm Management
> 1 tools

### `session.modules`

**Session Modules** | ✅ SLM

List, enable or disable harness modules for the current chat session and get the synchronized token budget

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `moduleId` | string | No |
| `preset` | enum | No |
| `modelContextWindow` | number | No |

**Tags:** session, modules, configuration, budget, notebook


---

## Standards
> 4 tools

### `standards.accessibility`

**Accessibility Audit (WCAG 2.2)** | ✅ SLM

Audit web content against WCAG 2.2 guidelines: alt text, color contrast, keyboard navigation, semantic HTML, ARIA attributes, focus management.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `files` | array | No |

**Tags:** accessibility, wcag, a11y, aria, keyboard


### `standards.audit`

**Standards Compliance Audit** | ✅ SLM

Run a comprehensive compliance audit against ISO 25010, ISO 9001, ISO 27001, OWASP Top 10, WCAG 2.2, QA standards, and documentation standards. Analyzes source code, tests, configs, and documentation.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `standard` | enum | Yes |
| `files` | array | No |
| `tests` | array | No |
| `packageJson` | object | No |

**Tags:** iso, compliance, audit, security, accessibility


### `standards.quality`

**Code Quality Audit (ISO 25010)** | ✅ SLM

Audit code against ISO 25010 quality characteristics: functional suitability, performance, reliability, security, maintainability, portability.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `files` | array | No |
| `tests` | array | No |
| `packageJson` | object | No |

**Tags:** quality, iso-25010, maintainability, reliability


### `standards.security`

**Quick Security Scan** | ✅ SLM

Rapid security scan checking for hardcoded secrets, XSS vectors, SQL injection, deprecated crypto, missing auth, and common vulnerabilities.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `files` | array | No |

**Tags:** security, scan, vulnerability, secrets, xss


---

## Swarm Intelligence
> 1 tools

### `swarm.configure`

**Swarm Configure** | ✅ SLM

Size and build a multi-agent swarm for this machine: topology, roles, memory slots, router workload sync

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `name` | string | Yes |
| `topology` | enum | No |
| `count` | number | No |
| `modelName` | string | No |
| `paramBillions` | number | Yes |
| `bitsPerWeight` | number | Yes |
| `physicalCores` | number | Yes |
| `usableRamBytes` | number | Yes |

**Tags:** swarm, multi-agent, topology, sizing, gguf


---

## Task Scheduling
> 1 tools

### `scheduler.jobs`

**Task Scheduler** | ✅ SLM

Create and inspect scheduled agent automations using intervals or cron expressions

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `name` | string | No |
| `kind` | enum | No |
| `spec` | string | No |
| `toolId` | string | No |
| `jobId` | string | No |
| `ok` | boolean | No |
| `durationMs` | number | No |

**Tags:** scheduler, cron, automation, recurring, long-running


---

## Text Analysis & NLP
> 5 tools

### `text.bm25_rank`

**BM25 Document Ranking** | 🔴 LLM Only

Rank documents by relevance to a query using BM25 (Okapi). Returns documents sorted by relevance score.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `query` | string | Yes |
| `documents` | string | Yes |
| `topN` | number | No |

**Tags:** text, bm25, rank, search, retrieval


### `text.classify`

**Classify Text** | 🔴 LLM Only

Classify a text document using a previously trained model. Returns predicted label, confidence score, and class probabilities.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `modelJson` | string | Yes |
| `text` | string | Yes |

**Tags:** text, classify, predict, label


### `text.extract_keywords`

**Extract Keywords** | 🔴 LLM Only

Extract top keywords and keyphrases from a document using RAKE-inspired scoring. Returns ranked keywords with scores and frequency.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `text` | string | Yes |
| `topN` | number | No |

**Tags:** text, keyword, extract, rake, phrase


### `text.sentiment`

**Sentiment Analysis** | 🔴 LLM Only

Lexicon-based sentiment scoring. Returns score (-1 to +1), label (positive/negative/neutral), and matched sentiment words.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `text` | string | Yes |

**Tags:** text, sentiment, nlp, positive, negative


### `text.train_classifier`

**Train Text Classifier** | 🔴 LLM Only

Train a keyword-based text classifier using Naive Bayes, KNN, or rule-based methods on labeled documents. Returns trained model for prediction.

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `documents` | string | Yes |
| `labels` | string | Yes |
| `method` | enum | No |
| `k` | number | No |

**Tags:** text, classify, naive-bayes, keyword, tfidf


---

## Video Editing & Rendering
> 7 tools

### `video.addCaption`

**Add Caption** | ✅ SLM

Add subtitles or captions to the video

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `text` | string | Yes |
| `startTime` | number | Yes |
| `endTime` | number | Yes |
| `position` | enum | No |
| `fontSize` | number | No |
| `bgColor` | string | No |
| `textColor` | string | No |
| `style` | enum | No |

**Tags:** caption, subtitle, text, timed, accessibility


### `video.addOverlay`

**Add Overlay** | ✅ SLM

Add an image, text, or sticker overlay to the video

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `content` | string | No |
| `imageUrl` | string | No |
| `x` | number | No |
| `y` | number | No |
| `scale` | number | No |
| `opacity` | number | No |
| `startTime` | number | No |
| `endTime` | number | No |
| `animation` | enum | No |

**Tags:** overlay, sticker, logo, watermark, text


### `video.addTransition`

**Add Transition** | ✅ SLM

Add a transition between two clips or scenes

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `duration` | number | No |
| `atTime` | number | Yes |

**Tags:** transition, fade, dissolve, wipe, slide


### `video.annotate`

**Annotate Frame** | ✅ SLM

Add annotations to the current video frame

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `type` | enum | Yes |
| `x` | number | Yes |
| `y` | number | Yes |
| `content` | string | No |
| `width` | number | No |
| `height` | number | No |
| `color` | string | No |
| `endX` | number | No |
| `endY` | number | No |
| `fontSize` | number | No |
| `startTime` | number | No |
| `endTime` | number | No |

**Tags:** annotate, overlay, text, arrow, highlight


### `video.captureFrame`

**Capture Frame** | ✅ SLM

Capture a single frame from the video as an image

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `timestamp` | number | No |
| `format` | enum | No |
| `quality` | number | No |
| `scale` | number | No |

**Tags:** frame, capture, thumbnail, preview, extract


### `video.export`

**Export Video** | ✅ SLM

Export the edited video to a file

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `format` | enum | No |
| `quality` | number | No |
| `startFrame` | number | No |
| `endFrame` | number | No |
| `fps` | number | No |
| `width` | number | No |
| `height` | number | No |

**Tags:** export, video, webm, mp4, gif


### `video.record`

**Record Screen** | ✅ SLM

Start or stop screen recording

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `action` | enum | Yes |
| `includeAudio` | boolean | No |
| `includeWebcam` | boolean | No |
| `frameRate` | number | No |
| `maxDuration` | number | No |

**Tags:** record, screen, video, webm, mediarecorder


---

## Voice & Text-to-Speech
> 1 tools

### `voice.call`

**Voice Call / TTS** | ✅ SLM

Voice calls or TTS audio via Twilio, ElevenLabs, or Azure

**Parameters:**

| Name | Type | Required |
|------|------|----------|
| `provider` | string | Yes |
| `to` | string | No |
| `text` | string | Yes |
| `voice` | string | No |
| `language` | string | No |

**Tags:** voice, tts, speech, call


---

## Footer

stitaP Tool Harness — Complete Tool Catalog
267 tools across 48 domains | SLM-Powered | Zero-Dependency Computation
Generated September 2026