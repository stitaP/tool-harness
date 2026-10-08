# stitaP Tool Harness — Tool Catalog

> **367 tools across 53 domains**, every one with a working executor.
> Generated from the Tool Store by `agent/scripts/gen-tool-catalog.mjs` — do not edit by hand; re-run the script after changing tools.

The agent reaches these through `tool_search` + `use_tool` (see [tool-store.md](tool-store.md) for credentials,
requirements and approvals). For the agent's own built-in tools (files, terminal, browser, pipelines, site templates, …)
see [agent-runtime.md](agent-runtime.md). Business solutions built from these tools: [enterprise-use-cases.md](enterprise-use-cases.md).

| Metric | Value |
|---|---|
| Tools | **367** |
| Domains | **53** |
| SLM-friendly (small, clear parameters) | **321** (87%) |
| With an executor | **367** |

## Domains

- [Agent Orchestration](#agent-orchestration) (5)
- [Analytics & Database](#analytics--database) (20)
- [Browser Automation & Testing](#browser-automation--testing) (42)
- [CAR Governance Framework](#car-governance-framework) (6)
- [Catalog](#catalog) (1)
- [Chains](#chains) (2)
- [Chit Funds](#chit-funds) (9)
- [Cloud Storage](#cloud-storage) (4)
- [Code Generation](#code-generation) (9)
- [Computational Fluid Dynamics](#computational-fluid-dynamics) (6)
- [Database Connectors](#database-connectors) (4)
- [Design System & Canvas](#design-system--canvas) (12)
- [Diagram & Architecture](#diagram--architecture) (7)
- [Document Parsing](#document-parsing) (6)
- [E-commerce](#e-commerce) (24)
- [Email Communication](#email-communication) (2)
- [Engineering Mathematics](#engineering-mathematics) (16)
- [Enterprise Workflow](#enterprise-workflow) (1)
- [Environment Management](#environment-management) (4)
- [Fault Detection & Quality](#fault-detection--quality) (3)
- [Finance & Lending Calculators](#finance--lending-calculators) (32)
- [Fractal Analysis](#fractal-analysis) (5)
- [Governance](#governance) (1)
- [Graph Execution](#graph-execution) (1)
- [Graphs & Visualization](#graphs--visualization) (3)
- [Hugging Face Hub](#hugging-face-hub) (6)
- [Indic Typography Engine](#indic-typography-engine) (23)
- [Inference & Model Management](#inference--model-management) (5)
- [Knowledge Base](#knowledge-base) (1)
- [Legacy Server Revival](#legacy-server-revival) (4)
- [LLM Integration & Prompting](#llm-integration--prompting) (6)
- [Machine Learning](#machine-learning) (8)
- [Maps & Geolocation](#maps--geolocation) (5)
- [Media Processing](#media-processing) (6)
- [Mobile Hardware](#mobile-hardware) (5)
- [Notifications](#notifications) (1)
- [Observability & Tracing](#observability--tracing) (1)
- [OCR & Text Recognition](#ocr--text-recognition) (4)
- [Office Document Generation](#office-document-generation) (5)
- [OpenViking Context Store](#openviking-context-store) (5)
- [OS & Desktop Integration](#os--desktop-integration) (10)
- [Payment Processing](#payment-processing) (4)
- [Real Estate](#real-estate) (10)
- [Real-time Collaboration](#real-time-collaboration) (4)
- [Sandbox Execution](#sandbox-execution) (8)
- [Session Management](#session-management) (1)
- [SMS Communication](#sms-communication) (1)
- [Standards](#standards) (4)
- [Swarm Intelligence](#swarm-intelligence) (1)
- [Task Scheduling](#task-scheduling) (1)
- [Text Analysis & NLP](#text-analysis--nlp) (5)
- [Video Editing & Rendering](#video-editing--rendering) (7)
- [Voice & Text-to-Speech](#voice--text-to-speech) (1)

## Agent Orchestration

### `agent.kanban`

**Kanban Board** | ✅ SLM

Multi-agent task orchestration: create boards, add tasks with dependencies, assign workers, track progress

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | What to do |
| `boardId` | string | No | Board ID |
| `taskId` | string | No | Task ID (for move/assign/delete/comment) |
| `status` | enum | No | New status (for move-task) |
| `title` | string | No | Task title (for add-task) |
| `description` | string | No | Task description |
| `priority` | enum | No | Task priority |
| `dependsOn` | string | No | Comma-separated task IDs this depends on |
| `assignee` | string | No | Worker ID to assign |
| `workerName` | string | No | Worker name (for register-worker) |
| `workerType` | enum | No | Worker type |
| `workerId` | string | No | Worker ID (for heartbeat) |
| `author` | string | No | Comment author (for add-comment) |
| `comment` | string | No | Comment content |
| `subtasks` | string | No | JSON array [{title, description?, priority?}] (for fan-out) |
| `boardName` | string | No | Board name (for create-board) |

**Tags:** kanban, board, tasks, multi-agent, orchestration, parallel

### `agent.memory`

**Agent Memory** | ✅ SLM

Store and retrieve persistent memories across sessions: user preferences, project facts, workflow patterns

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | What to do |
| `type` | enum | No | Memory type (for add/query) |
| `key` | string | No | Memory key (for add/remove, e.g., 'user.name') |
| `content` | string | No | Memory content (for add) |
| `importance` | number | No | Importance 1-10 (for add, default 5) |
| `tags` | string | No | Comma-separated tags (for add/query) |
| `search` | string | No | Search query (for query) |
| `limit` | number | No | Max results (for query, default 20) |
| `format` | enum | No | Output format (for query/to-prompt) |

**Tags:** memory, persistent, cross-session, knowledge, agent

### `agent.self-improve`

**Self-Improvement** | ✅ SLM

Track performance, detect patterns, and get improvement suggestions based on task history

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | What to do |
| `taskData` | string | No | JSON TaskRecord (for record action) |
| `format` | enum | No | Output format |

**Tags:** self-improve, performance, patterns, optimization, agent

### `agent.skills`

**Agent Skills** | ✅ SLM

Create, list, search, refine, and execute reusable skills extracted from completed tasks

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | What to do |
| `skillId` | string | No | Skill ID (for get/refine/delete) |
| `name` | string | No | Skill name (for create/extract) |
| `description` | string | No | Skill description |
| `category` | enum | No | Skill category |
| `steps` | string | No | JSON array of steps [{action, toolId}] (for create/extract) |
| `tags` | string | No | Comma-separated tags |
| `search` | string | No | Search query (for search) |
| `format` | enum | No | Output format |

**Tags:** skills, procedures, reuse, learning, agent

### `agent.terminal`

**Real Terminal** | ✅ SLM

Execute shell commands with process management: background jobs, output capture, timeout enforcement

| Parameter | Type | Required | Description |
|---|---|---|---|
| `command` | string | No | Shell command to execute |
| `action` | enum | No | For process management |
| `processId` | string | No | Background process ID (for poll/wait/kill/log/write) |
| `background` | boolean | No | Run command in background |
| `timeoutSecs` | number | No | Command timeout in seconds (default 30) |
| `cwd` | string | No | Working directory |

**Tags:** terminal, shell, command, process, background, agent

## Analytics & Database

### `analytics.create_table`

**Create Empty Table** | ✅ SLM

Create a new empty table with a defined schema. Useful for building datasets incrementally.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name for the new table |
| `columns` | string | Yes | Column definitions, e.g. "id:i32, name:str, amount:f64, active:bool" |

**Tags:** create, schema

### `analytics.csv_export`

**Export CSV** | ✅ SLM

Export a table to CSV text format. Use after querying to get downloadable results.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name of the table |

**Tags:** csv, export

### `analytics.csv_import`

**Import CSV** | ✅ SLM

Parse CSV text into a columnar table with auto-detected types (int, float, bool, string, date). Returns row count and schema.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `csv` | string | Yes | Raw CSV text content |
| `tableName` | string | No | Name for the table (default: csv_import) |

**Tags:** csv, import, data

### `analytics.describe`

**Describe Table** | ✅ SLM

Show schema and summary statistics (count, nulls, min, max, sum, avg, distinct) for all columns in a table.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name of the table |

**Tags:** schema, stats, metadata

### `analytics.export_excel`

**Export for Excel**

Export a table as an Excel-compatible file — CSV with BOM and formatting, or XML Spreadsheet (SSML) with styles and typed cells.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name of the table to export |
| `format` | string | No | Format: 'csv' (default) or 'xml' for native Excel XML |

**Tags:** excel, spreadsheet, export

### `analytics.export_powerbi`

**Export for Power BI**

Export a table as a Power BI-compatible CSV with metadata header, plus auto-generated DAX measure templates for numeric columns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name of the table to export |

**Tags:** powerbi, dax, export, bi

### `analytics.export_sheets`

**Export for Google Sheets**

Export a table as Google Sheets-compatible CSV with schema metadata, plus auto-generated Sheets formulas for analysis.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name of the table to export |

**Tags:** google-sheets, export, formulas

### `analytics.export_tableau`

**Export for Tableau**

Export a table as a Tableau-compatible TSV with typed columns, plus auto-generated Tableau workbook manifest (.twb) for auto-import.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name of the table to export |

**Tags:** tableau, export, twb, tsv

### `analytics.filter`

**Filter Rows** | ✅ SLM

Keep only rows matching a condition. Returns a new table with matching rows.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Table to filter |
| `column` | string | Yes | Column to test |
| `op` | string | Yes | Operator: eq, neq, gt, lt, gte, lte, contains, startswith |
| `value` | string | Yes | Value to compare against |

**Tags:** filter, where

### `analytics.groupby`

**Group By Aggregation** | ✅ SLM

Group rows by one or more columns and compute aggregations (count, sum, avg, min, max) on specified columns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Source table name |
| `groupBy` | string | Yes | Comma-separated column names to group by |
| `aggregations` | string | Yes | Comma-separated agg definitions, e.g. "count(*), sum(amount), avg(price)" |
| `resultName` | string | No | Name for the result table |

**Tags:** groupby, aggregation, statistics

### `analytics.insert_rows`

**Insert Rows** | ✅ SLM

Append one or more rows to an existing table. Values must match the table's column order and types.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Table to insert into |
| `rows` | string | Yes | JSON array of arrays, e.g. "[[1, \"Alice\", 100, true], [2, \"Bob\", 200, false]]" |

**Tags:** insert, data

### `analytics.join`

**Join Tables** | ✅ SLM

Inner join two tables on a matching column. Returns a combined table with columns from both.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `leftTable` | string | Yes | Left table name |
| `rightTable` | string | Yes | Right table name |
| `onColumn` | string | Yes | Column name to join on (must exist in both tables) |
| `resultName` | string | No | Name for the result table (default: joined) |

**Tags:** join, relational

### `analytics.json_export`

**Export JSON** | ✅ SLM

Export a table to a JSON array of row objects.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name of the table |

**Tags:** json, export

### `analytics.json_import`

**Import JSON** | ✅ SLM

Import a JSON array of objects into a columnar table with auto-detected types.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | string | Yes | JSON string (array of objects) |
| `tableName` | string | No | Name for the table (default: json_import) |

**Tags:** json, import, data

### `analytics.mdx`

**MDX Query** | ✅ SLM

Execute an MDX (Multidimensional Expressions) query for OLAP-style analytics. Supports CROSSJOIN, FILTER, ORDER, TOPCOUNT/BOTTOMCOUNT, HEAD/TAIL, aggregate functions, calculated members (WITH MEMBER), IIF, CASE, and NON EMPTY.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | MDX query, e.g. "SELECT [Measures].[Sales Amount] ON COLUMNS, [Product].[Category] ON ROWS FROM [SalesCube]" |

**Tags:** mdx, olap, cubes, bi

### `analytics.schema_export`

**Export Schema** | ✅ SLM

Export the schema of a table as JSON — column names, types, nullable flags. Useful for documentation and cross-platform compatibility.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Name of the table |

**Tags:** schema, export, metadata

### `analytics.sort`

**Sort Table** | ✅ SLM

Sort a table by a column in ascending or descending order.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tableName` | string | Yes | Table to sort |
| `column` | string | Yes | Column name to sort by |
| `descending` | boolean | No | Sort descending (default: false) |

**Tags:** sort, order

### `analytics.sql`

**SQL Query** | ✅ SLM

Execute a SQL-like query against registered tables. Supports SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, JOIN, aggregations (COUNT, SUM, AVG, MIN, MAX), CASE expressions, and arithmetic.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | SQL query, e.g. "SELECT dept, COUNT(*) as cnt FROM sales GROUP BY dept ORDER BY cnt DESC LIMIT 10" |
| `tableName` | string | No | Optional: name of a single table to query (shortcuts FROM clause) |

**Tags:** sql, query, database

### `analytics.window`

**Window Function Query** | ✅ SLM

Execute SQL with DuckDB-style window functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, FIRST_VALUE, LAST_VALUE, NTILE, SUM/AVG/COUNT OVER PARTITION BY ... ORDER BY ...).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | SQL with window functions, e.g. "SELECT name, amount, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY amount DESC) as rank FROM employees" |

**Tags:** window, analytics, rank

### `analytics.xql`

**XQL Query** | ✅ SLM

Execute an XQL (eXtended Query Language) query — a hybrid SQL+JSON path+graph traversal language. Supports relational queries, JSON path expressions (@.field, $.data.nested), graph traversal, time-series windowing, UNNEST, LET bindings, COALESCE.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | XQL query, e.g. "SELECT name, @.metadata.tags, SUM(amount) as total FROM orders WHERE @.status = 'active' GROUP BY name" |

**Tags:** xql, query, hybrid, json-path

## Browser Automation & Testing

### `browser.a11y-audit`

**Accessibility Audit** | ✅ SLM

WCAG 2.1 compliance check: missing alt text, colour contrast, ARIA labels, keyboard navigation, heading hierarchy, focus management

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `standard` | enum | No | WCAG conformance level |
| `scope` | enum | No | Audit scope |
| `includeFixes` | boolean | No | Include specific fix instructions |
| `screenshotViolations` | boolean | No | Capture screenshots of violations |

**Tags:** accessibility, wcag, a11y, aria, contrast, keyboard, screen-reader, testing

### `browser.api-test`

**API Endpoint Testing** | ✅ SLM

Discover and test API endpoints: response codes, latency, payload validation, error handling, CORS, rate limiting

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `action` | enum | Yes | What to test |
| `duration` | number | No | Monitoring duration in seconds (default 30) |
| `includePayloads` | boolean | No | Include request/response payloads in report |
| `validateSchemas` | boolean | No | Validate response payloads against expected schemas |
| `checkCaching` | boolean | No | Analyse caching headers and cache effectiveness |
| `checkCORS` | boolean | No | Validate CORS configuration |

**Tags:** api, endpoint, rest, graphql, latency, response, testing

### `browser.click`

**Click** | ✅ SLM

Click an element on the page

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector or XPath for the target element |
| `clickType` | enum | No | Type of click |
| `offsetX` | number | No | X offset from element center |
| `offsetY` | number | No | Y offset from element center |
| `timeout` | number | No | Max wait for element (ms) |

**Tags:** click, interaction, button, link, cdp

### `browser.color-analyze`

**Colour Analysis** | ✅ SLM

Extract dominant colour palette from a screenshot — analysis feeds into the ViT model preprocessing pipeline

| Parameter | Type | Required | Description |
|---|---|---|---|
| `screenshotB64` | string | No | Base64-encoded screenshot to analyse |
| `tabId` | number | No | Chrome tab ID |
| `sampleSize` | number | No | Number of pixel samples |

**Tags:** colour, palette, design, analysis, pixel

### `browser.color-palette`

**Color Palette Generator** | ✅ SLM

Generate accessible color palettes with WCAG contrast validation, brand integration, and Fluent 4px-compatible design tokens

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | What to do |
| `brandColor` | string | No | Brand hex colour for palette generation (e.g., '#6366f1') |
| `tabId` | number | No | Chrome tab ID for page analysis |
| `contrastStandard` | enum | No | WCAG contrast level to validate against |
| `includeDarkMode` | boolean | No | Generate dark mode variants |
| `outputFormat` | enum | No | Output format |

**Tags:** color, palette, wcag, contrast, brand, design-tokens, dark-mode

### `browser.component-qa`

**Component QA** | ✅ SLM

Validate buttons, inputs, cards, modals, navigation, and other components against all three guideline sets

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `url` | string | No | URL to audit |
| `components` | string | No | Comma-separated list of components to check (default: all) |
| `includeFixes` | boolean | No | Include fix instructions for each issue |

**Tags:** component, qa, button, input, card, modal, navigation, validation

### `browser.console`

**Console Log Capture** | ✅ SLM

Capture all console.log, warn, error, info, and debug messages with stack traces

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | No | start=begin capturing, stop=stop & return, snapshot=get current |
| `levels` | array | No | Log levels to capture |
| `maxEntries` | number | No | Max log entries |
| `includeStackTrace` | boolean | No | Include stack traces |

**Tags:** console, logs, errors, warnings, debug, stack-traces

### `browser.cookies`

**Full Cookie Jar** | ✅ SLM

Read all cookies including HttpOnly via CDP with full metadata: domain, path, expiry, SameSite, Secure flags

| Parameter | Type | Required | Description |
|---|---|---|---|
| `urls` | array | No | URLs to get cookies for (default: all) |
| `filter` | string | No | Filter by cookie name (substring) |
| `groupedByDomain` | boolean | No | Group results by domain |

**Tags:** cookies, httpOnly, session, auth, tracking, samesite

### `browser.design-audit`

**Design Audit** | ✅ SLM

Audit a page against Vercel, Fluent 2, and TasteSkill guidelines — accessibility, spacing, typography, animation, color, copy, and anti-slop rules

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `url` | string | No | URL to audit (omit for current page) |
| `scope` | enum | No | Audit scope |
| `source` | enum | No | Filter by guideline source |
| `includeCodeExamples` | boolean | No | Include code snippets showing the fix |

**Tags:** design, audit, vercel, fluent, tasteskill, accessibility, typography, spacing, color

### `browser.design-generate`

**Design Code Generator** | ✅ SLM

Generate production-ready HTML/CSS/Tailwind components following Vercel + Fluent + TasteSkill guidelines

| Parameter | Type | Required | Description |
|---|---|---|---|
| `component` | string | Yes | Description of the component to generate (e.g., 'pricing card with 3 tiers') |
| `framework` | enum | No | CSS framework to use |
| `theme` | enum | No | Visual theme |
| `responsive` | boolean | No | Include responsive styles |
| `accessibility` | boolean | No | Include full accessibility attributes |
| `animations` | boolean | No | Include animations with reduced-motion support |
| `style` | enum | No | Visual style direction |

**Tags:** design, generate, html, css, tailwind, component, code

### `browser.design-suggest`

**Design Suggestions** | ✅ SLM

Analyse a page and generate prioritised improvement suggestions with before/after code examples

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `url` | string | No | URL to analyse |
| `focusArea` | enum | No | Area to focus suggestions on |
| `maxSuggestions` | number | No | Maximum suggestions to return (default 20) |
| `framework` | enum | No | Framework for code examples |

**Tags:** design, suggestions, improvement, code-examples, before-after

### `browser.domevents`

**DOM Event Capture** | ✅ SLM

Capture all DOM events with target, phase, bubbles, timestamp, and propagation path

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | No | start=begin, stop=stop & return, snapshot=get current |
| `eventTypes` | array | No | Event types to capture |
| `maxEntries` | number | No | Max events to keep |
| `includeMutationObserver` | boolean | No | Also capture DOM mutations |

**Tags:** events, dom-events, clicks, inputs, mutation-observer, user-interaction

### `browser.drag`

**Drag & Drop** | ✅ SLM

Drag an element to a target position or element

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sourceSelector` | string | Yes | CSS selector for the source element |
| `targetSelector` | string | No | CSS selector for the target element |
| `targetX` | number | No | Target X position (if no target selector) |
| `targetY` | number | No | Target Y position (if no target selector) |
| `method` | enum | No | Drag method |

**Tags:** drag, drop, move, reorder, interaction

### `browser.extensions`

**Extensions Inspector** | ✅ SLM

List installed browser extensions, their permissions, content scripts, and injected code

| Parameter | Type | Required | Description |
|---|---|---|---|
| `includeContentScripts` | boolean | No | Scan for injected content scripts |
| `includePermissions` | boolean | No | Include extension permissions |

**Tags:** extensions, plugins, permissions, content-scripts, addons

### `browser.extract`

**Extract Content** | ✅ SLM

Extract text, links, or structured data from the page

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mode` | enum | No | Extraction mode |
| `selector` | string | No | CSS selector for targeted extraction |
| `attributes` | array | No | Attributes to extract (for selector mode) |
| `includeHidden` | boolean | No | Include hidden elements |
| `maxDepth` | number | No | Max DOM traversal depth |

**Tags:** extract, scrape, text, links, data

### `browser.extract-visual-context`

**Extract Visual Context** | ✅ SLM

Run ViT model on a specific page region to understand what that area depicts — combines model inference with DOM context

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | CSS selector for the DOM element to analyse |
| `screenshotB64` | string | No | Base64-encoded screenshot to crop from |
| `tabId` | number | No | Chrome tab ID |
| `bboxX` | number | No | Bounding box X coordinate |
| `bboxY` | number | No | Bounding box Y coordinate |
| `bboxW` | number | No | Bounding box width |
| `bboxH` | number | No | Bounding box height |

**Tags:** vision, context, region, model, ai, crop

### `browser.form-test`

**Form Validation Test** | ✅ SLM

Test form validation: required fields, email/phone/URL patterns, min/max length, custom validators, submission flow

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `formSelector` | string | No | CSS selector for specific form (omit to test all forms) |
| `testEmpty` | boolean | No | Test submitting with empty required fields |
| `testInvalid` | boolean | No | Test with invalid data (bad emails, too long, etc.) |
| `testValid` | boolean | No | Test with valid data to verify success flow |
| `testEdgeCases` | boolean | No | Test edge cases (unicode, very long input, special chars) |

**Tags:** form, validation, input, submit, error-handling, testing

### `browser.hover`

**Hover** | ✅ SLM

Hover over an element

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector for the element to hover |
| `delay` | number | No | Delay before hover (ms) |
| `holdDuration` | number | No | How long to hold hover (ms) |

**Tags:** hover, mouseover, tooltip, dropdown

### `browser.icon-detect`

**Icon Detection (ViT)** | ✅ SLM

Run ViT model inference to identify icon types and their semantic meaning from a screenshot region

| Parameter | Type | Required | Description |
|---|---|---|---|
| `screenshotB64` | string | No | Base64-encoded screenshot to analyse |
| `tabId` | number | No | Chrome tab ID |
| `selector` | string | No | CSS selector to focus on a specific element |

**Tags:** icon, vision, classification, model, semantic

### `browser.inspect`

**Deep DOM Inspector** | ✅ SLM

Inspect every DOM element with attributes, computed styles, shadow DOM, iframes, and accessibility tree

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | Root CSS selector (default: document.documentElement) |
| `depth` | number | No | Max traversal depth (0=unlimited) |
| `includeHidden` | boolean | No | Include display:none elements |
| `includeShadowDOM` | boolean | No | Traverse shadow roots |
| `includeIframes` | boolean | No | Traverse same-origin iframes |
| `includeStyles` | boolean | No | Include computed styles per element |
| `includeA11y` | boolean | No | Include accessibility tree |
| `maxNodes` | number | No | Maximum nodes to return (prevents OOM) |
| `attributeFilter` | array | No | Only return these attributes (empty = all) |

**Tags:** inspect, dom, shadow-dom, iframe, accessibility, a11y, computed-styles, attributes

### `browser.interact-test`

**Interaction Testing** | ✅ SLM

Click an element and validate what happens: response time, DOM changes, network requests, console errors, navigation

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector for the element to interact with |
| `action` | enum | Yes | Type of interaction |
| `tabId` | number | No | Chrome tab ID |
| `waitFor` | string | No | CSS selector to wait for after interaction |
| `waitForTimeout` | number | No | Max ms to wait for expected change (default 5000) |
| `expectNavigation` | boolean | No | Expect page navigation after interaction |
| `expectNetworkRequest` | string | No | URL pattern to expect in network requests |
| `expectDomChange` | string | No | CSS selector that should appear/change after interaction |
| `expectNoConsoleError` | boolean | No | Fail if console errors appear |
| `measureLatency` | boolean | No | Measure time from click to first response |

**Tags:** interaction, click, test, validation, response-time, e2e

### `browser.layout-analyze`

**Layout Analysis (ViT)** | ✅ SLM

Detect layout zones (header, sidebar, main, footer, form, overlay) using ViT model inference on the screenshot

| Parameter | Type | Required | Description |
|---|---|---|---|
| `screenshotB64` | string | No | Base64-encoded screenshot |
| `tabId` | number | No | Chrome tab ID |

**Tags:** layout, structure, zones, model, architecture

### `browser.navigate`

**Navigate** | ✅ SLM

Navigate the browser to a URL

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | Target URL to navigate to |
| `timeout` | number | No | Max wait for page load (ms) |
| `waitForSelector` | string | No | CSS selector to wait for after navigation |

**Tags:** navigation, url, page-load, cdp

### `browser.network`

**Network Traffic Capture** | ✅ SLM

Capture every HTTP request and response: URLs, methods, headers, bodies, status codes, timing, and cookies

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | No | start=begin capturing, stop=stop & return, snapshot=get current log |
| `filter` | object | No | Filter: { urlPattern, methods[], statusRange, resourceTypes[], excludeDomains[] } |
| `maxEntries` | number | No | Max entries to keep in buffer |
| `includeBodies` | boolean | No | Capture request/response bodies (can be large) |
| `includeCookies` | boolean | No | Include cookies in request/response headers |

**Tags:** network, api, fetch, xhr, requests, responses, headers, traffic, har

### `browser.performance`

**Performance Metrics** | ✅ SLM

Measure Core Web Vitals (LCP, FID, CLS, TTFB), resource loading times, paint metrics, and bundle size analysis

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | What to measure |
| `tabId` | number | No | Chrome tab ID |
| `duration` | number | No | Measurement duration in seconds (default 10) |
| `includeResources` | boolean | No | Include individual resource timings |
| `includeSuggestions` | boolean | No | Include improvement suggestions |

**Tags:** performance, core-web-vitals, lcp, cls, ttfb, metrics, testing

### `browser.responsive-test`

**Responsive Design Test** | ✅ SLM

Test layout across viewport breakpoints (mobile, tablet, desktop), detect overflow, horizontal scroll, and layout breakage

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `url` | string | No | URL to test (omit for current page) |
| `viewports` | string | No | Comma-separated widths to test (default: 320,375,768,1024,1280,1440,1920) |
| `includeScreenshots` | boolean | No | Capture screenshot at each viewport |
| `checkTouchTargets` | boolean | No | Verify touch targets are >= 44px |
| `checkOverflow` | boolean | No | Detect horizontal overflow |

**Tags:** responsive, mobile, breakpoint, viewport, layout, testing

### `browser.screenshot`

**Screenshot** | ✅ SLM

Capture a screenshot of the page or element

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mode` | enum | No | Capture mode |
| `selector` | string | No | CSS selector (for element mode) |
| `region` | object | No | {x, y, width, height} (for region mode) |
| `format` | enum | No | Output format |
| `quality` | number | No | JPEG/WebP quality (1-100) |
| `clipToViewport` | boolean | No | Clip to visible viewport |

**Tags:** screenshot, capture, image, png, cdp

### `browser.screenshot-to-llm`

**Screenshot to LLM** | ✅ SLM

Capture a screenshot and immediately generate an optimised LLM prompt via ViT model inference — ready to paste into any LLM

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID to screenshot |
| `url` | string | No | URL to navigate to first |
| `goal` | enum | Yes | What the LLM should do with this screenshot |
| `codeLang` | string | No | Target language for recreate goal |
| `viewportWidth` | number | No | Viewport width for screenshot |
| `viewportHeight` | number | No | Viewport height for screenshot |

**Tags:** screenshot, llm, prompt, vision, one-click

### `browser.scroll`

**Scroll** | ✅ SLM

Scroll the page or an element

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mode` | enum | No | Scroll mode |
| `deltaY` | number | No | Pixels to scroll (for delta mode) |
| `selector` | string | No | Element to scroll to (for toElement mode) |
| `y` | number | No | Y position to scroll to (for toPosition mode) |
| `behavior` | enum | No | Scroll behavior |

**Tags:** scroll, viewport, page, infinite-scroll

### `browser.security-headers`

**Security Headers Audit** | ✅ SLM

Check HTTP security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, CORS, mixed content, cookie flags

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `url` | string | No | URL to check headers for |
| `includeRemediation` | boolean | No | Include specific header fix instructions |
| `checkMixedContent` | boolean | No | Scan for HTTP resources on HTTPS pages |
| `checkCookies` | boolean | No | Audit cookie security flags |

**Tags:** security, headers, csp, hsts, cors, cookies, audit, testing

### `browser.seo-audit`

**SEO Analysis** | ✅ SLM

Audit SEO fundamentals: meta tags, Open Graph, Twitter Cards, structured data, heading hierarchy, image alt text, canonical URLs, robots.txt

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `url` | string | No | URL to audit |
| `scope` | enum | No | Audit scope |
| `includeSuggestions` | boolean | No | Include improvement suggestions |

**Tags:** seo, meta, open-graph, structured-data, headings, audit, testing

### `browser.source`

**Source Code Extractor** | ✅ SLM

Extract all inline scripts, external script contents, stylesheets, and source maps

| Parameter | Type | Required | Description |
|---|---|---|---|
| `types` | array | No | What to extract |
| `includeInline` | boolean | No | Include inline <script> and <style> content |
| `includeExternal` | boolean | No | Include external script/style URLs |
| `maxContentLength` | number | No | Max chars per script/style |
| `fetchExternal` | boolean | No | Fetch external scripts to get full content |

**Tags:** source, scripts, styles, css, javascript, sourcemaps, code

### `browser.spacing-check`

**Spacing & Grid Audit** | ✅ SLM

Validate spacing rhythm against Fluent 4px grid, check grid alignment, responsive breakpoint compliance

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `url` | string | No | URL to audit |
| `tolerance` | number | No | Px tolerance for grid alignment (default 2) |
| `checkGrid` | boolean | No | Check grid column alignment |
| `checkResponsive` | boolean | No | Validate spacing across Fluent breakpoints |

**Tags:** spacing, grid, layout, alignment, 4px, fluent, rhythm

### `browser.state`

**Framework State Extractor** | ✅ SLM

Extract application state from React, Vue, Angular, Redux, MobX, and Zustand

| Parameter | Type | Required | Description |
|---|---|---|---|
| `frameworks` | array | No | Frameworks to detect (auto=all) |
| `selector` | string | No | Root element to inspect (default: #root) |
| `maxComponents` | number | No | Max components to extract |
| `includeHooks` | boolean | No | Include React hook values |
| `includeStore` | boolean | No | Include global store state (Redux/Zustand) |

**Tags:** react, vue, angular, redux, state, fiber, store, framework

### `browser.storage`

**Browser Storage Inspector** | ✅ SLM

Read cookies, localStorage, sessionStorage, and IndexedDB with full metadata

| Parameter | Type | Required | Description |
|---|---|---|---|
| `types` | array | No | Which storage types to inspect |
| `filter` | string | No | Key name filter (substring match) |
| `includeValues` | boolean | No | Include actual values (false = keys + sizes only) |
| `maxValueLength` | number | No | Truncate values longer than this |
| `origin` | string | No | Origin for storage (default: current page) |

**Tags:** storage, cookies, localstorage, sessionstorage, indexeddb, auth, state

### `browser.test-suggester`

**Test Scenario Generator** | ✅ SLM

Analyse a page's DOM, interactivity, and structure to generate comprehensive test scenarios the LLM can execute

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `scope` | enum | Yes | What to generate tests for |
| `maxScenarios` | number | No | Maximum test scenarios to generate (default 20) |
| `includeCode` | boolean | No | Include executable test code for each scenario |
| `priority` | enum | No | Filter by priority level |

**Tags:** test-generation, scenarios, e2e, automation, llm, testing

### `browser.type`

**Type Text** | ✅ SLM

Type text into an input field

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | Yes | CSS selector for the input element |
| `text` | string | Yes | Text to type |
| `clear` | boolean | No | Clear the field before typing |
| `delay` | number | No | Delay between keystrokes (ms) |
| `pressEnter` | boolean | No | Press Enter after typing |

**Tags:** type, input, form, text, cdp

### `browser.typography-check`

**Typography Audit** | ✅ SLM

Validate fonts, sizes, line-heights, letter-spacing, and text hierarchy against Vercel + Fluent type scales

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Chrome tab ID |
| `url` | string | No | URL to audit |
| `scale` | enum | No | Type scale to validate against |
| `checkHierarchy` | boolean | No | Check heading hierarchy (h1-h6 order) |
| `checkLoading` | boolean | No | Check font loading strategy (preload, display: swap) |

**Tags:** typography, font, line-height, hierarchy, type-scale, text

### `browser.visual-regression`

**Visual Regression Test** | ✅ SLM

Compare two screenshots (baseline vs current) with pixel diff, region-based comparison, and layout shift detection

| Parameter | Type | Required | Description |
|---|---|---|---|
| `baselineB64` | string | No | Base64-encoded baseline screenshot |
| `currentB64` | string | No | Base64-encoded current screenshot to compare |
| `baselineUrl` | string | No | URL to capture as baseline |
| `currentUrl` | string | No | URL to capture as current |
| `tabId` | number | No | Chrome tab ID for capture |
| `tolerance` | number | No | Pixel colour tolerance (0-255, default 10) |
| `ignoreRegions` | string | No | JSON array of {x,y,w,h} regions to ignore |
| `threshold` | number | No | Minimum similarity % to pass (default 95) |

**Tags:** visual-regression, screenshot, diff, comparison, baseline, testing

### `browser.visual-understand`

**Visual Scene Understanding** | ✅ SLM

Run ViT model inference on a screenshot to classify UI elements, detect layout zones, extract colours, and generate an LLM-readable scene description

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | Analysis action: full, elements, layout, colors, prompt |
| `screenshotB64` | string | No | Base64-encoded PNG/JPEG screenshot to analyse |
| `tabId` | number | No | Chrome tab ID to screenshot |
| `goal` | enum | No | LLM prompt goal when action=prompt |
| `includeRaw` | boolean | No | Include raw element data in prompt output |
| `maxElements` | number | No | Maximum elements to return |

**Tags:** vision, ai, scene, ui-detection, model, vit

### `browser.wait`

**Wait** | ✅ SLM

Wait for a condition before continuing

| Parameter | Type | Required | Description |
|---|---|---|---|
| `condition` | enum | No | What to wait for |
| `selector` | string | No | CSS selector (for element/text conditions) |
| `text` | string | No | Text to wait for (for text condition) |
| `timeout` | number | No | Max wait time (ms) |
| `expression` | string | No | JavaScript expression that returns truthy (for custom condition) |

**Tags:** wait, pause, condition, timeout, flow

### `browser.websocket`

**WebSocket Capture** | ✅ SLM

Intercept and log all WebSocket frames sent and received

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | No | start=begin intercepting, stop=stop & return log |
| `maxFrames` | number | No | Max frames to keep |

**Tags:** websocket, ws, realtime, socket, protocol, frames

## CAR Governance Framework

### `harness.action_check`

**Check Action Policy** | ✅ SLM

Verify if an action is allowed by the control policy

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | string | Yes | Action to check (e.g., deploy, crawl, audit) |

**Tags:** harness, policy, permission, approval, control

### `harness.car_config`

**CAR Configuration** | ✅ SLM

Configure the Control-Agency-Runtime harness for agent governance

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Harness name |
| `autonomyLevel` | enum | No | Default agent autonomy level |
| `tokenBudget` | number | No | Session token budget |
| `costCap` | number | No | Session cost cap in USD |

**Tags:** harness, car, governance, control, agency, runtime

### `harness.gate_evaluate`

**Evaluate Gates** | ✅ SLM

Run verification gates to check analysis completeness

| Parameter | Type | Required | Description |
|---|---|---|---|
| `context` | string | No | JSON object of metric values for gate conditions |

**Tags:** harness, gates, evaluation, verification, completeness

### `harness.generate_agents_md`

**Generate AGENTS.md** | ✅ SLM

Generate the AGENTS.md governance file from the current harness configuration

**Tags:** harness, agents-md, governance, documentation, config

### `harness.register_agent`

**Register Agent** | ✅ SLM

Register a new agent in the harness with capabilities and budgets

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Agent name |
| `role` | string | Yes | Agent role (e.g., crawler, auditor, diagrammer) |
| `autonomyLevel` | enum | No | Agent autonomy level |
| `tokenBudget` | number | No | Maximum tokens for this agent |

**Tags:** harness, agent, register, capabilities, budget

### `harness.spend_check`

**Check Spend Rails** | ✅ SLM

Verify resource usage is within limits before executing actions

| Parameter | Type | Required | Description |
|---|---|---|---|
| `resource` | enum | Yes | Resource type to check |
| `amount` | number | Yes | Amount of resource to use |

**Tags:** harness, spend, budget, limits, rail

## Catalog

### `catalog.browse`

**Harness Catalog** | ✅ SLM

Browse, search, and get details on all tools in the harness catalog — orchestration, memory, browser, coding, serving, observability, animation, scraping

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | No | Browse action |
| `category` | string | No | Filter by catalog category |
| `query` | string | No | Search query (name, description, tags) |
| `toolId` | string | No | Get details for a specific tool by ID |

**Tags:** catalog, store, tools, browse, search

## Chains

### `chains.agent`

**ReAct Agent** | ✅ SLM

Run the ReAct-style agent executor: reason → act → observe loop over registered tools until a final answer

| Parameter | Type | Required | Description |
|---|---|---|---|
| `question` | string | Yes | The task/question for the agent |
| `maxIterations` | number | No | Max Reason→Act loops (default 8) |

**Tags:** agent, react, tools, loop, reasoning, langchain

### `chains.run`

**Chains Run** | ✅ SLM

Execute an LLM chain (prompt → model → parser) or multi-step sequential chain using the in-house stitap-chains engine

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mode` | enum | No | Chain type |
| `template` | string | No | Prompt template with {variables} (single mode) |
| `system` | string | No | System message for the chain |
| `variables` | object | No | Template variable values |
| `parser` | enum | No | Output parser |
| `steps` | array | No | Sequential steps [{name, template, inputs, output}] (sequential mode) |

**Tags:** chain, prompt, llm, pipeline, sequential, langchain

## Chit Funds

### `chit.collection.record`

**Record Chit Collection** | ✅ SLM

Record a member's monthly contribution payment. Supports cash, cheque, UPI, bank transfer.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `groupId` | string | Yes | Chit group ID |
| `memberId` | string | Yes | Member ID |
| `amount` | number | Yes | Amount paid |
| `method` | string | Yes | Payment method: cash, cheque, upi, bank_transfer |

**Tags:** chit, collection, payment, contribution

### `chit.compliance.check`

**Chit Compliance Check** | ✅ SLM

Check regulatory compliance: RERA, state limits, documentation, bonds. Based on Chit Funds Act 1982.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `groupId` | string | Yes | Chit group ID |

**Tags:** chit, compliance, rera, regulatory, legal

### `chit.dashboard`

**Chit Fund Dashboard** | ✅ SLM

Generate complete dashboard: all groups, collection rates, disbursements, defaults, commission earned.

**Tags:** chit, dashboard, overview, analytics

### `chit.default.notice`

**Generate Default Notice** | ✅ SLM

Generate formatted default notice for a member. Supports warning, final, and legal notice types.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `groupId` | string | Yes | Chit group ID |
| `memberId` | string | Yes | Member ID |
| `missedRounds` | string | Yes | Comma-separated missed round numbers |

**Tags:** chit, default, notice, legal, warning

### `chit.foreman.report`

**Foreman Report** | ✅ SLM

Generate foreman commission report: total commission earned, collections, disbursements, defaults.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `groupId` | string | Yes | Chit group ID |

**Tags:** chit, foreman, commission, report

### `chit.group.create`

**Create Chit Group** | ✅ SLM

Create a new chit group with members. Auto-calculates monthly contribution, commission, and generates member IDs.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Chit group name |
| `chitValue` | number | Yes | Monthly chit value in ₹ |
| `numberOfMembers` | number | Yes | Number of members (equal to months) |
| `members` | string | Yes | JSON array of {name, phone, address} |
| `state` | string | Yes | State for compliance |

**Tags:** chit, chitfund, group, create, members

### `chit.member.statement`

**Member Statement** | ✅ SLM

Generate complete statement for a chit member: contributions, dividends received, prize won, net position.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `groupId` | string | Yes | Chit group ID |
| `memberId` | string | Yes | Member ID |

**Tags:** chit, statement, member, dividends, position

### `chit.round.bid`

**Record Chit Bid** | ✅ SLM

Record a bid for the current chit round. Validates member eligibility and bid amount.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `groupId` | string | Yes | Chit group ID |
| `memberId` | string | Yes | Member ID |
| `bidAmount` | number | Yes | Bid amount in ₹ (lower = higher discount) |

**Tags:** chit, bid, auction, discount

### `chit.round.close`

**Close Chit Round** | ✅ SLM

Close bidding, determine winner, calculate dividend per member, and generate disbursement summary.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `groupId` | string | Yes | Chit group ID |
| `bids` | string | No | JSON array of {memberId, bidAmount} (optional: defaults to bids recorded with chit.round.bid) |

**Tags:** chit, close, winner, dividend, disbursement

## Cloud Storage

### `storage.download`

**Download File** | ✅ SLM

Download files from cloud storage

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Storage provider |
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key/path |

**Tags:** storage, download

### `storage.list`

**List Files** | ✅ SLM

List files in a bucket with prefix filtering

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Storage provider |
| `bucket` | string | Yes | Bucket name |
| `prefix` | string | No | Key prefix filter |
| `maxKeys` | number | No | Max results |

**Tags:** storage, list, browse

### `storage.share`

**Generate Share Link** | ✅ SLM

Generate a presigned URL for secure file sharing

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Storage provider |
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key |
| `expiresInMinutes` | number | No | Link expiry in minutes |

**Tags:** storage, share, presigned

### `storage.upload`

**Upload File** | ✅ SLM

Upload files to S3, GCS, Azure Blob, or local storage

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Storage provider |
| `bucket` | string | Yes | Bucket name |
| `key` | string | Yes | Object key/path |
| `content` | string | Yes | File content (string or base64) |
| `contentType` | string | No | MIME type |

**Tags:** storage, upload, s3, cloud

## Code Generation

### `codegen.check`

**Detailed Syntax Check** | ✅ SLM

Run a detailed syntax check on code, returning line-by-line issues with severity levels (error/warning/info) and specific fix suggestions. More detailed than validate — includes column positions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language` | enum | Yes | Programming language |
| `code` | string | Yes | Source code to check |

**Tags:** check, lint, detailed, line-by-line, fix

### `codegen.generate`

**Generate Code** | ✅ SLM

Generate working code in Python, Java, C++, C, JavaScript, TypeScript, or Rust for a given task. Uses the language reference library to ensure correct API usage, imports, and syntax. Returns code + validation + run instructions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language` | enum | Yes | Target language: python, java, cpp, c, javascript, typescript, rust |
| `task` | string | Yes | Natural language description of what to build (e.g. 'read CSV compute average age') |
| `inputFormat` | string | No | Input data format: csv, json, text, binary |
| `outputFormat` | string | No | Expected output format: csv, json, text, file |
| `dependencies` | array | No | Extra packages to include (e.g. ['pandas', 'numpy']) |
| `errorHandling` | boolean | No | Include try/catch error handling |
| `comments` | boolean | No | Add explanatory comments to the code |

**Tags:** codegen, generate, code, programming, language, slm, reference, python, java, cpp, rust

### `codegen.overview`

**Language API Overview** | ✅ SLM

Get a complete overview of all available APIs for a language in a compact table format. Useful for SLMs to quickly scan what's available before selecting specific APIs.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language` | enum | No | Language to list APIs for (omit for all languages) |

**Tags:** overview, list, browse, catalog, all-apis

### `codegen.pattern`

**Code Pattern Library** | ✅ SLM

Get a complete code pattern for common programming tasks (HTTP server, file processing, database CRUD, async/concurrent, CLI tool, API client). These are cross-language templates the SLM can adapt.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pattern` | string | No | Pattern name: http_server, file_processor, database_crud, async_concurrent, cli_tool, json_api_client |
| `language` | enum | No | Get pattern in specific language (omit for Python default) |

**Tags:** pattern, template, boilerplate, common, http, crud, cli

### `codegen.profile`

**Language Profile** | ✅ SLM

Get the complete language profile: version, file extension, compile/run commands, package manager, and common pitfalls that trip up SLMs. Essential for setting up the correct execution environment.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language` | enum | Yes | Programming language to profile |

**Tags:** profile, language, setup, config, environment, pitfalls

### `codegen.reference`

**Language Reference Lookup** | ✅ SLM

Query the language reference database to find API signatures, import statements, and working examples. SLMs use this to get the exact API they need before generating code.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language` | enum | No | Filter by language (python, java, cpp, c, javascript, typescript, rust) |
| `search` | string | No | Search query (e.g. 'read csv', 'http request', 'sort array') |
| `id` | string | No | Exact API ID (e.g. 'python.pandas.read_csv') |

**Tags:** reference, lookup, api, signature, documentation, help

### `codegen.starter`

**Generate Starter File** | ✅ SLM

Generate a complete starter file for a language and task, with all necessary imports, boilerplate, and TODO placeholders. The SLM fills in the logic based on the reference library.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language` | enum | Yes | Target language |
| `task` | string | Yes | What the file should do |

**Tags:** starter, template, boilerplate, scaffold, init

### `codegen.stats`

**Reference Statistics** | ✅ SLM

Get statistics about the language reference library: total APIs, count per language, available patterns, and languages supported. Useful for understanding capabilities.

**Tags:** stats, info, count, capability

### `codegen.validate`

**Validate Syntax** | ✅ SLM

Check code for common syntax errors, missing imports, incorrect API usage, and language-specific pitfalls. Returns line-by-line issues with fixes. Use before executing code in sandbox.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language` | enum | Yes | Programming language of the code |
| `code` | string | Yes | Source code to validate |

**Tags:** validate, syntax, check, lint, debug, error, fix

## Computational Fluid Dynamics

### `cfd.auto-dispatch`

**CFD Auto-Dispatch** | ✅ SLM

Intelligent auto-selection of solver type, grid resolution, boundary conditions, and convergence parameters from a natural language problem description. The agent describes the problem in plain English and this tool decides everything.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `description` | string | Yes | Natural language description of the CFD problem (e.g. 'Solve lid-driven cavity at Re=1000', 'Channel flow between parallel plates at Re=200', 'Backward-facing step with sudden expansion') |
| `maxGridCells` | number | No | Maximum total grid cells allowed (browser performance limit, default 16384) |
| `solve` | boolean | No | Whether to also run the solver and return results (default true) |

**Tags:** cfd, auto, dispatch, intelligent, solver-selection, natural-language

### `cfd.benchmark`

**CFD Benchmark**

Run standard CFD benchmarks (lid-driven cavity, channel flow, backward-facing step) at specified Reynolds numbers and grid resolutions. Returns convergence metrics for comparison against published data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `benchmarks` | array | Yes | List of benchmarks to run [{name, re, grid}] |

**Tags:** cfd, benchmark, validation, lid-driven-cavity, reynolds

### `cfd.mesh.create`

**Create CFD Mesh**

Generate a structured 2D Cartesian mesh for CFD simulations with configurable domain size, grid resolution, and boundary conditions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `problem` | enum | No | Pre-built problem or custom mesh |
| `domainWidth` | number | No | Domain width in meters |
| `domainHeight` | number | No | Domain height in meters |
| `ni` | number | No | Number of cells in x-direction |
| `nj` | number | No | Number of cells in y-direction |
| `reynoldsNumber` | number | No | Reynolds number |

**Tags:** cfd, mesh, grid, finite-volume, simulation

### `cfd.pipeflow.thermal`

**Pipe Flow Thermal Solver** | ✅ SLM

Solve pipe flow with coupled momentum and energy equations. Handles convective heat transfer from external sources (sun, ambient). Returns velocity profile, temperature distribution, Nusselt number, and pressure drop.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diameter` | number | No | Pipe diameter in meters (default 0.6096 = 2ft) |
| `length` | number | No | Pipe length in meters |
| `flowRateLPM` | number | No | Volumetric flow rate in liters per minute |
| `sunTempC` | number | No | External temperature (e.g. sun ambient) in °C |
| `inletTempC` | number | No | Water inlet temperature in °C |
| `hSun` | number | No | Convective heat transfer coefficient W/m²K (natural convection ~10-25, forced ~50-500) |
| `wallThickness` | number | No | Pipe wall thickness in meters |
| `wallConductivity` | number | No | Pipe wall thermal conductivity W/mK (steel=50, copper=400, PVC=0.2) |
| `ni` | number | No | Axial grid cells |
| `nj` | number | No | Radial grid cells |
| `outputs` | array | No | Which outputs to generate |

**Tags:** cfd, pipe-flow, thermal, heat-transfer, convection

### `cfd.postprocess`

**CFD Post-Processing**

Generate convergence charts, contour data, velocity vector fields, streamlines, and centerline profiles from solver results.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `problem` | enum | No | Problem to post-process |
| `reynoldsNumber` | number | No | Reynolds number |
| `ni` | number | No | Grid cells in x |
| `nj` | number | No | Grid cells in y |
| `outputs` | array | No | Which outputs to generate |

**Tags:** cfd, visualization, contour, streamlines, postprocess

### `cfd.solve.navier-stokes`

**Solve Navier-Stokes**

Run an incompressible 2D Navier-Stokes simulation using the SIMPLE (Semi-Implicit Method for Pressure-Linked Equations) algorithm. Returns velocity fields, pressure field, convergence history, and diagnostics.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `problem` | enum | No | Benchmark problem to solve |
| `reynoldsNumber` | number | No | Reynolds number |
| `ni` | number | No | Grid cells in x |
| `nj` | number | No | Grid cells in y |
| `maxIterations` | number | No | Max outer iterations |
| `tolerance` | number | No | Convergence tolerance |
| `alphaP` | number | No | Pressure under-relaxation (0-1) |
| `alphaU` | number | No | Velocity under-relaxation (0-1) |
| `convectionScheme` | enum | No | Convection discretization scheme |

**Tags:** cfd, navier-stokes, simple, pressure-velocity, solver

## Database Connectors

### `database.connect`

**Database Connect** | ✅ SLM

Create a persistent connection with pooling

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Database provider |
| `host` | string | No | Database host |
| `port` | number | No | Port number |
| `database` | string | Yes | Database name |
| `username` | string | No | Username |
| `password` | string | No | Password |
| `ssl` | boolean | No | Enable SSL |

**Tags:** database, connection, pool

### `database.migrate`

**Database Migration**

Run schema migrations with rollback support

| Parameter | Type | Required | Description |
|---|---|---|---|
| `connectionId` | string | Yes | Connection ID |
| `operations` | array | Yes | Migration operations |
| `dryRun` | boolean | No | Preview without applying |

**Tags:** database, migration, schema

### `database.query`

**Database Query** | ✅ SLM

Execute SQL queries against PostgreSQL, MySQL, SQLite, or MongoDB

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Database provider |
| `query` | string | Yes | SQL query or MongoDB operation |
| `params` | array | No | Query parameters for prepared statements |
| `connectionId` | string | No | Reuse an existing connection |

**Tags:** database, sql, nosql, query

### `database.schema`

**Schema Inspector** | ✅ SLM

Inspect tables, columns, indexes, and relationships

| Parameter | Type | Required | Description |
|---|---|---|---|
| `connectionId` | string | Yes | Connection ID to inspect |
| `table` | string | No | Specific table to inspect |
| `includeIndexes` | boolean | No | Include index information |

**Tags:** database, schema, introspection

## Design System & Canvas

### `design.artboard.add`

**Add Artboard** | ✅ SLM

Add a responsive artboard (mobile/tablet/desktop/wide)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID to add artboard to |
| `breakpoint` | enum | No | Responsive breakpoint preset |
| `name` | string | No | Artboard name |
| `width` | number | No | Custom width in px (overrides breakpoint preset) |
| `height` | number | No | Custom height in px |
| `backgroundColor` | string | No | Background color (hex or Tailwind) |

**Tags:** design, artboard, frame, responsive, breakpoint

### `design.canvas.create`

**Create Design Canvas** | ✅ SLM

Create a new blank design canvas with tokens

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | Canvas name |
| `description` | string | No | Canvas description |
| `tokens` | object | No | Custom design tokens { colors, fonts, fontSizes, spacing, radii, shadows } |

**Tags:** design, canvas, figma, visual, layout

### `design.element.add`

**Add Design Element** | ✅ SLM

Add an element (rect, text, button, card, nav, hero, grid, image, etc.)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID |
| `artboardId` | string | Yes | Artboard ID to add element to |
| `kind` | enum | Yes | Element type |
| `name` | string | No | Element name for layer panel |
| `x` | number | No | X position in px |
| `y` | number | No | Y position in px |
| `width` | number | Yes | Width in px |
| `height` | number | Yes | Height in px |
| `text` | string | No | Text content (for text, button, badge, card) |
| `src` | string | No | Image source URL or data URL |
| `icon` | string | No | Lucide icon name |
| `href` | string | No | Link URL |
| `backgroundColor` | string | No | Background color |
| `color` | string | No | Text color |
| `fontSize` | string | No | Font size (px or Tailwind token) |
| `fontWeight` | string | No | Font weight (400-800) |
| `borderRadius` | string | No | Border radius |
| `padding` | string | No | Padding (CSS shorthand) |
| `textAlign` | enum | No | Text alignment |

**Tags:** design, element, rect, text, button, card, component

### `design.element.group`

**Group Elements** | ✅ SLM

Group multiple elements into a container

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID |
| `artboardId` | string | Yes | Artboard ID |
| `elementIds` | array | Yes | Array of element IDs to group |
| `name` | string | No | Group name |

**Tags:** design, group, container, layers, organization

### `design.element.remove`

**Remove Element** | ✅ SLM

Remove an element (and its children) from the canvas

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID |
| `elementId` | string | Yes | Element ID to remove |

**Tags:** design, remove, delete, cleanup

### `design.element.update`

**Update Element** | ✅ SLM

Update an element's position, size, style, or content

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID |
| `elementId` | string | Yes | Element ID to update |
| `patch` | object | Yes | Properties to update (x, y, width, height, text, backgroundColor, color, fontSize, etc.) |

**Tags:** design, update, edit, style, position

### `design.export`

**Export Design to Code** | ✅ SLM

Export canvas as React+Tailwind, HTML+CSS, SVG, or Figma JSON

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID to export |
| `format` | enum | No | Export format |
| `artboardId` | string | No | Export specific artboard (omit for all) |

**Tags:** design, export, react, tailwind, html, svg, figma, code-generation

### `design.indic.create`

**Create Indic Design** | ✅ SLM

Create a complete design canvas pre-configured for an Indic script

| Parameter | Type | Required | Description |
|---|---|---|---|
| `script` | enum | Yes | Primary Indic script for the design |
| `name` | string | No | Design name |
| `layout` | enum | No | Pre-built layout template |

**Tags:** design, indic, template, one-shot, newspaper, website

### `design.landing.create`

**Create Full Landing Page** | ✅ SLM

Auto-generate a complete landing page (navbar + hero + cards + footer)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID |
| `title` | string | No | Hero headline text |
| `subtitle` | string | No | Hero subheadline |
| `cta` | string | No | CTA button text |
| `brand` | string | No | Brand name for navbar and footer |

**Tags:** design, landing-page, template, full-page, one-shot

### `design.layer.reorder`

**Reorder Layer** | ✅ SLM

Move an element up/down/top/bottom in the layer stack

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID |
| `elementId` | string | Yes | Element ID to reorder |
| `direction` | enum | Yes | Direction to move |

**Tags:** design, layer, z-order, reorder, stacking

### `design.layout.auto`

**Auto-Layout** | ✅ SLM

Auto-arrange elements in flex row/column or center them

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID |
| `artboardId` | string | Yes | Artboard ID |
| `mode` | enum | No | Layout mode |
| `gap` | number | No | Gap between elements in px |
| `align` | enum | No | Cross-axis alignment |
| `padding` | number | No | Padding around all edges in px |

**Tags:** design, layout, flex, auto-layout, alignment, spacing

### `design.preset.add`

**Add Component Preset** | ✅ SLM

Add a pre-built component (hero, navbar, cards, pricing, footer)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canvasId` | string | Yes | Canvas ID |
| `artboardId` | string | Yes | Artboard ID |
| `preset` | enum | Yes | Component preset to add |
| `offsetY` | number | No | Y offset to stack below existing content |

**Tags:** design, preset, template, hero, navbar, cards, pricing, footer

## Diagram & Architecture

### `diagram.architecture`

**System Architecture** | ✅ SLM

Generate a layered system architecture diagram

| Parameter | Type | Required | Description |
|---|---|---|---|
| `layers` | string | Yes | JSON array of layer data with name and components |
| `title` | string | No | Diagram title |

**Tags:** diagram, mermaid, architecture, system, layers

### `diagram.component_tree`

**UI Component Tree** | ✅ SLM

Generate a component hierarchy diagram

| Parameter | Type | Required | Description |
|---|---|---|---|
| `components` | string | Yes | JSON array of component data with name, children, and type |
| `title` | string | No | Diagram title |

**Tags:** diagram, mermaid, component, hierarchy, tree

### `diagram.data_flow`

**Data Flow Diagram** | ✅ SLM

Generate a data flow diagram showing how data moves through the system

| Parameter | Type | Required | Description |
|---|---|---|---|
| `nodes` | string | Yes | JSON array of node data with id, label, and type |
| `edges` | string | Yes | JSON array of edge data with from, to, label, and type |
| `title` | string | No | Diagram title |

**Tags:** diagram, mermaid, data-flow, system, integration

### `diagram.er_diagram`

**ER Diagram** | ✅ SLM

Generate an Entity-Relationship diagram for data models

| Parameter | Type | Required | Description |
|---|---|---|---|
| `entities` | string | Yes | JSON array of entity data with name and fields |
| `relationships` | string | Yes | JSON array of relationships with from, to, and type |
| `title` | string | No | Diagram title |

**Tags:** diagram, mermaid, er, database, data-model

### `diagram.route_map`

**Route Navigation Map** | ✅ SLM

Generate a route navigation map showing all routes and relationships

| Parameter | Type | Required | Description |
|---|---|---|---|
| `routes` | string | Yes | JSON array of route data with path, children, and isProtected |
| `title` | string | No | Diagram title |

**Tags:** diagram, mermaid, routes, navigation, sitemap

### `diagram.state_machine`

**State Machine Diagram** | ✅ SLM

Generate a state machine diagram for interactive flows

| Parameter | Type | Required | Description |
|---|---|---|---|
| `states` | string | Yes | JSON array of state names |
| `transitions` | string | Yes | JSON array of transitions with from, to, and event |
| `title` | string | No | Diagram title |

**Tags:** diagram, mermaid, state-machine, workflow, transitions

### `diagram.user_journey`

**User Journey Diagram** | ✅ SLM

Generate a user journey sequence diagram from route data

| Parameter | Type | Required | Description |
|---|---|---|---|
| `routes` | string | Yes | JSON array of route data with path, isProtected, and interactions |
| `title` | string | No | Diagram title |

**Tags:** diagram, mermaid, sequence, user-journey, flow

## Document Parsing

### `doc.detectTutorial`

**Detect Tutorial** | ✅ SLM

Detect if a page is a tutorial and extract its structure

| Parameter | Type | Required | Description |
|---|---|---|---|
| `html` | string | Yes | HTML content to analyze |
| `url` | string | No | Page URL for context |
| `title` | string | No | Page title for context |

**Tags:** detect, tutorial, classify, analyze, structure

### `doc.extractAPI`

**Extract API Reference** | ✅ SLM

Extract API documentation into structured schemas

| Parameter | Type | Required | Description |
|---|---|---|---|
| `html` | string | Yes | API documentation HTML content |
| `format` | enum | No | Documentation format |
| `includeExamples` | boolean | No | Include code examples in output |

**Tags:** api, reference, extract, schema, endpoints

### `doc.extractSteps`

**Extract Steps** | ✅ SLM

Extract step-by-step instructions from documentation

| Parameter | Type | Required | Description |
|---|---|---|---|
| `html` | string | Yes | HTML content to parse |
| `maxSteps` | number | No | Maximum number of steps to extract |
| `includeCodeBlocks` | boolean | No | Include code blocks as part of steps |
| `includeImages` | boolean | No | Include image references in steps |

**Tags:** extract, steps, instructions, tutorial, parse

### `doc.generateNarration`

**Generate Narration** | ✅ SLM

Generate natural narration text for tutorial steps

| Parameter | Type | Required | Description |
|---|---|---|---|
| `step` | string | Yes | Step description text |
| `context` | string | No | Previous step context |
| `style` | enum | No | Narration style |
| `audienceLevel` | enum | No | Target audience |

**Tags:** narration, generate, tts, voice, text

### `doc.generateScript`

**Generate Tutorial Script** | ✅ SLM

Generate a video tutorial script from parsed documentation

| Parameter | Type | Required | Description |
|---|---|---|---|
| `steps` | array | Yes | Parsed steps from extractSteps |
| `title` | string | No | Tutorial title |
| `audienceLevel` | enum | No | Target audience level |
| `narrationStyle` | enum | No | Narration voice style |
| `includeIntros` | boolean | No | Include intro and outro scenes |
| `estimatedDuration` | number | No | Target duration in seconds (0 = auto) |

**Tags:** script, generate, tutorial, narration, scenes

### `doc.parseFAQ`

**Parse FAQ** | ✅ SLM

Extract question-answer pairs from FAQ pages

| Parameter | Type | Required | Description |
|---|---|---|---|
| `html` | string | Yes | HTML content to parse |
| `maxPairs` | number | No | Maximum Q&A pairs to extract |
| `includeMetadata` | boolean | No | Include category tags and difficulty level |

**Tags:** faq, questions, answers, parse, extract

## E-commerce

### `ecom.adjust_price`

**Dynamic Price Adjustment** | ✅ SLM

Adjust product price based on demand, competition, inventory levels, and pricing rules.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `force` | boolean | No | Override the max-change guard after human review |
| `productId` | string | Yes | Product ID |
| `newPrice` | number | Yes | New price in cents |
| `reason` | string | Yes | Reason for price change |

**Tags:** ecommerce, pricing, dynamic, competitive, margin

### `ecom.analyze_reviews`

**Analyze Reviews** | ✅ SLM

Extract sentiment, issues, and actionable insights from product reviews. Agent identifies product improvement opportunities.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productId` | string | No | Product ID (omit for all products) |
| `limit` | number | No | Maximum reviews to analyze |

**Tags:** ecommerce, review, sentiment, analytics, insights

### `ecom.at_risk_customers`

**Identify At-Risk Customers** | ✅ SLM

Find customers likely to churn or complain. Agent proactively reaches out before issues escalate.

**Tags:** ecommerce, churn, retention, customer, proactive

### `ecom.auto_reorder`

**Auto-Reorder Stock** | ✅ SLM

Automatically place reorder when stock drops below threshold. Calculates quantity based on sales velocity and supplier lead time.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productId` | string | Yes | Product ID to reorder |
| `salesVelocityDays` | number | No | Days of sales history to use for calculation |

**Tags:** ecommerce, inventory, reorder, procurement, supplier

### `ecom.auto_reply`

**Auto-Reply to Ticket** | ✅ SLM

Generate and send contextual reply to customer ticket based on category, history, and order data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ticketId` | string | Yes | Ticket ID to reply to |
| `action` | enum | Yes | Action to take |
| `message` | string | No | Reply message (auto-generated if omitted) |
| `refundAmount` | number | No | Refund amount (store currency units) if action is refund; defaults to the refundable balance |

**Tags:** ecommerce, customer-service, auto-reply, refund, NLP

### `ecom.bulk_process_tickets`

**Bulk Process Ticket Queue** | ✅ SLM

Process multiple tickets autonomously: auto-reply to simple ones, escalate complex ones, skip ambiguous ones.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `maxTickets` | number | No | Maximum tickets to process |
| `autoReplyThreshold` | number | No | Confidence threshold (0-1) for auto-reply |

**Tags:** ecommerce, customer-service, bulk, automation, queue

### `ecom.cancel_order`

**Cancel Order** | ✅ SLM

Cancel order, process automatic refund, restock inventory, notify customer. Handles cancellation policy checks.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID to cancel |
| `reason` | string | Yes | Cancellation reason |
| `refundFull` | boolean | No | Whether to refund full amount (vs. restocking fee) |

**Tags:** ecommerce, order, cancel, refund, inventory

### `ecom.check_fraud`

**Check Order for Fraud** | ✅ SLM

Analyze order for fraud indicators: address mismatch, velocity, payment patterns, behavioral signals.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID to check |

**Tags:** ecommerce, fraud, security, detection, scoring

### `ecom.classify_ticket`

**Classify Customer Ticket** | ✅ SLM

Read a customer message, detect intent, assign category and priority. Agent handles classification without human triage.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `customerName` | string | No | Customer name |
| `customerEmail` | string | No | Customer email (replies are sent here when email is configured) |
| `subject` | string | Yes | Ticket subject line |
| `message` | string | Yes | Customer message body |
| `orderId` | string | No | Related order ID if available |

**Tags:** ecommerce, customer-service, ticket, classification, NLP

### `ecom.create_order`

**Create Order** | ✅ SLM

Create an order: prices items from the catalog, reserves stock, screens for fraud and sends the confirmation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `customerName` | string | Yes | Customer name |
| `customerEmail` | string | No | Customer email |
| `customerPhone` | string | No | Customer phone (WhatsApp/SMS notifications) |
| `items` | array | Yes | [{productId\|sku, quantity, unitPrice?}] |
| `shippingAddress` | object | No | {line1, city, state, postalCode, country, phone} or a one-line address |
| `paymentMethod` | string | No | upi, card, cod, … |
| `paymentRef` | string | No | Gateway payment id for refunds |
| `shippingCost` | number | No | Shipping charge |
| `discount` | number | No | Discount amount |

**Tags:** ecommerce, orders, checkout

### `ecom.create_shipment`

**Create Shipping Label** | ✅ SLM

Generate shipping label, compare carrier rates, select optimal shipping option. Agent handles full shipping workflow.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID to ship |
| `carrier` | string | No | Preferred carrier (auto-selected if omitted) |
| `service` | string | No | Shipping service level |

**Tags:** ecommerce, shipping, label, carrier, tracking

### `ecom.daily_report`

**Daily Sales Report** | ✅ SLM

Calculate actionable daily sales metrics. Agent produces numbers and actions, not charts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `date` | string | No | Date (YYYY-MM-DD, defaults to today) |

**Tags:** ecommerce, sales, report, daily, operations

### `ecom.hold_order`

**Hold Suspicious Order** | ✅ SLM

Place order on hold pending review. Notifies security team and preserves evidence for investigation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID to hold |
| `reason` | string | Yes | Hold reason |
| `fraudScore` | number | Yes | Fraud score (0-100) |
| `flags` | array | No | Fraud indicators detected |

**Tags:** ecommerce, fraud, security, hold, investigation

### `ecom.import_data`

**Import Store Data** | ✅ SLM

Load products, orders, tickets, reviews or returns into the agent's local store from JSON or CSV.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | string | Yes | JSON object/array or CSV text |
| `kind` | enum | No | What the rows are (for arrays/CSV) |

**Tags:** ecommerce, import, csv, products, orders

### `ecom.optimize_listing`

**Optimize Product Listing** | ✅ SLM

Rewrite product title, description, and tags for SEO and conversion. Agent analyzes search data and best practices.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `apply` | boolean | No | Save the suggested changes to the product |
| `productId` | string | Yes | Product ID to optimize |
| `focus` | enum | No | Optimization focus |

**Tags:** ecommerce, product, SEO, optimization, listing

### `ecom.prevent_stockout`

**Prevent Stockout** | ✅ SLM

Cross-reference pending orders with available stock. Identify products at risk and take proactive action.

**Tags:** ecommerce, inventory, stockout, prevention, proactive

### `ecom.process_refund`

**Process Refund** | ✅ SLM

Process a payment refund for an order. Calculates amount, applies policy, processes reversal, notifies customer.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID to refund |
| `ticketId` | string | No | Associated ticket ID |
| `amount` | number | No | Refund amount in cents (omit for full refund) |
| `reason` | string | Yes | Refund reason |

**Tags:** ecommerce, refund, payment, customer-service

### `ecom.process_return`

**Process Return Request** | ✅ SLM

Handle end-to-end return flow: approve/reject, generate return label, track return shipment, process refund or exchange.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `returnId` | string | Yes | Return request ID |
| `decision` | enum | Yes | Approve or reject |
| `refundType` | enum | No | Type of refund |
| `refundAmount` | number | No | Partial refund amount in cents |

**Tags:** ecommerce, return, refund, exchange, shipping

### `ecom.respond_to_review`

**Respond to Review** | ✅ SLM

Generate and post personalized response to customer review. Agent matches tone to sentiment.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `reviewId` | string | Yes | Review ID |
| `productId` | string | Yes | Product ID |
| `response` | string | No | Response text (auto-generated if omitted) |
| `tone` | enum | No | Response tone |

**Tags:** ecommerce, review, response, reputation, sentiment

### `ecom.send_notification`

**Send Order Notification** | ✅ SLM

Send personalized order notifications: confirmation, shipping update, delivery, delay alert. Agent composes message with order context.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID |
| `type` | enum | Yes | Notification type |
| `customMessage` | string | No | Custom message to include |

**Tags:** ecommerce, notification, email, sms, order

### `ecom.track_shipment`

**Track Shipment** | ✅ SLM

Monitor shipment transit, detect delays, proactively notify customers. Agent watches all active shipments.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `trackingNumber` | string | Yes | Tracking number |
| `carrier` | string | Yes | Carrier name |

**Tags:** ecommerce, shipping, tracking, proactive, exception

### `ecom.update_inventory`

**Update Inventory** | ✅ SLM

Adjust stock levels after sale, return, adjustment, or damage. Triggers low-stock alerts automatically.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mode` | enum | No | For reason=adjustment: delta (default) or set absolute stock |
| `productId` | string | Yes | Product ID |
| `quantity` | number | Yes | Quantity change (positive = add, negative = remove) |
| `reason` | enum | Yes | Reason for change |
| `notes` | string | No | Additional notes |

**Tags:** ecommerce, inventory, stock, reorder

### `ecom.update_order_status`

**Update Order Status** | ✅ SLM

Move order through lifecycle: confirmed → processing → packed → shipped → delivered. Notifies customer at each step.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID to update |
| `status` | enum | Yes | New order status |
| `trackingNumber` | string | No | Tracking number (required for shipped) |
| `carrier` | string | No | Shipping carrier |

**Tags:** ecommerce, order, status, lifecycle, notification

### `ecom.upsert_product`

**Add/Update Product** | ✅ SLM

Create or update product listing with optimized title, description, and tags. Agent generates SEO-friendly content.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Product name |
| `price` | number | Yes | Price in cents |
| `description` | string | No | Product description (auto-generated if omitted) |
| `category` | string | No | Product category |
| `sku` | string | No | Stock keeping unit |
| `stock` | number | No | Initial stock quantity |

**Tags:** ecommerce, product, catalog, SEO, listing

## Email Communication

### `email.send`

**Send Email** | ✅ SLM

Send emails via SMTP, SendGrid, Resend, or Postmark

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Email provider |
| `to` | array | Yes | Recipient email addresses |
| `from` | string | Yes | Sender email address |
| `subject` | string | Yes | Email subject |
| `text` | string | No | Plain text body |
| `html` | string | No | HTML body |

**Tags:** email, send, smtp, notification

### `email.template`

**Email Template** | ✅ SLM

Render HTML email templates with variables

| Parameter | Type | Required | Description |
|---|---|---|---|
| `template` | string | Yes | Template string with {{variables}} |
| `variables` | object | Yes | Template variables |
| `format` | string | No | Output format |

**Tags:** email, template, render

## Engineering Mathematics

### `math.beam.analysis`

**Beam & Column Analysis** | ✅ SLM

Compute beam deflection, moment, and shear diagrams for simply-supported or cantilever beams with point loads. Also computes Euler buckling load for columns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `analysis` | enum | Yes | Type of analysis |
| `E` | number | Yes | Young's modulus (Pa) |
| `I` | number | Yes | Second moment of area (m⁴) |
| `L` | number | Yes | Beam/column length (m) |
| `loads` | array | No | Point loads [{position, force}] |
| `supportType` | enum | No | Support type |
| `effectiveLengthFactor` | number | No | K factor for buckling (1.0=pinned, 0.5=fixed-fixed, 2.0=fixed-free) |

**Tags:** beam, deflection, moment, shear, buckling, column, structural

### `math.derivative`

**Symbolic Differentiation**

Compute the derivative of a polynomial or numeric function. Returns derivative coefficients or gradient vector.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `coefficients` | string | No | JSON array of polynomial coefficients [a0, a1, a2, ...] for p(x) = a0 + a1*x + a2*x^2 + ... |
| `functionType` | enum | No | Type of derivative to compute |
| `x` | string | No | For numerical_gradient: JSON array of x values at which to evaluate gradient |
| `expression` | string | No | Alternative to coefficients: a math expression in x, e.g. "x^3 + sin(x)" (symbolic derivative) |

**Tags:** math, derivative, differentiation, gradient, calculus

### `math.fea.solve`

**FEA Structural Solver**

Finite Element Analysis solver for 2D structural problems. Supports truss, beam, CST triangle, and Q4 quad elements. Meshes rectangular domains, applies loads and boundary conditions, and solves for displacements, stresses, and von Mises stress.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `problemType` | enum | Yes | Type of structural problem |
| `width` | number | No | Domain width (m) |
| `height` | number | No | Domain height (m) |
| `nx` | number | No | Elements in x |
| `ny` | number | No | Elements in y |
| `E` | number | Yes | Young's modulus (Pa) |
| `nu` | number | No | Poisson's ratio |
| `thickness` | number | No | Element thickness (m) |
| `loads` | array | Yes | Point loads [{nodeX, nodeY, fx, fy}] |
| `fixedEdges` | array | No | Fixed edges ['left','right','top','bottom'] |

**Tags:** fea, finite-element, structural, stress, displacement, mesh

### `math.find_root`

**Root Finding**

Find roots of equations using Bisection, Newton-Raphson, or Secant methods. Returns root value, convergence status, and iteration count.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `method` | enum | No | Root-finding method |
| `a` | number | Yes | Lower bound (bisection) or first guess (secant) |
| `b` | number | No | Upper bound (bisection) or second guess (secant) |
| `tolerance` | number | No | Convergence tolerance (default 1e-8) |
| `expression` | string | No | f(x) as an expression, e.g. "x^3 - 2*x - 5" (or give coefficients) |
| `coefficients` | string | No | Alternative to expression: polynomial coefficients [a0, a1, a2, …] |

**Tags:** math, root, bisection, newton, secant, equation, solver

### `math.heat.transfer`

**2D Heat Conduction Solver** | ✅ SLM

Solve 2D steady-state heat conduction with Dirichlet and convection boundary conditions. Returns temperature field, heat flux, and max/min temperatures.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `width` | number | Yes | Domain width (m) |
| `height` | number | Yes | Domain height (m) |
| `nx` | number | No | Grid points in x |
| `ny` | number | No | Grid points in y |
| `k` | number | Yes | Thermal conductivity (W/m·K) |
| `Q` | number | No | Internal heat generation (W/m³) |
| `TLeft` | number | No | Left boundary temperature (°C) |
| `TRight` | number | No | Right boundary temperature (°C) |
| `TTop` | number | No | Top boundary temperature (°C) |
| `TBottom` | number | No | Bottom boundary temperature (°C) |
| `convectionSide` | enum | No | Side with convection BC |
| `h_conv` | number | No | Convection coefficient (W/m²·K) |
| `Tinf` | number | No | Ambient temperature for convection (°C) |

**Tags:** heat, thermal, conduction, temperature, convection, fourier

### `math.integrate`

**Numerical Integration**

Compute definite integrals using Simpson's 1/3 rule or trapezoidal method. Supports arbitrary functions defined as coefficient polynomials.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `coefficients` | string | No | JSON array of polynomial coefficients [a0, a1, a2, ...] |
| `a` | number | Yes | Lower bound of integration |
| `b` | number | Yes | Upper bound of integration |
| `method` | enum | No | Integration method |
| `steps` | number | No | Number of integration steps (default 1000) |
| `expression` | string | No | Alternative to coefficients: integrand as an expression in x, e.g. "exp(-x^2)" |

**Tags:** math, integration, integral, simpson, trapezoidal, calculus

### `math.linalg.solve`

**Linear Algebra Solver** | ✅ SLM

Solve linear systems Ax=b using LU, Cholesky, QR, or iterative (CG, BiCGSTAB) methods. Also computes eigenvalues, matrix inverse, determinant, and condition number.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `operation` | enum | Yes | Operation to perform |
| `A` | array | Yes | Matrix A (array of arrays) |
| `b` | array | No | RHS vector b (for solve) |
| `method` | enum | No | Solver method |

**Tags:** linear-algebra, matrix, eigenvalue, LU, Cholesky, QR, solver

### `math.matrix`

**Matrix Calculator** | ✅ SLM

Compute matrix determinant, inverse, eigenvalues, trace, rank. Supports arbitrary NxN matrices.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `operation` | enum | Yes | Matrix operation |
| `matrix` | array | Yes | Matrix as array of arrays |

**Tags:** matrix, determinant, inverse, eigenvalue, linear-algebra

### `math.optimize`

**Engineering Optimizer** | ✅ SLM

Solve optimization problems: gradient descent, Newton's method, BFGS, constrained optimization (penalty method), linear programming (simplex), and nonlinear least squares (Levenberg-Marquardt).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `method` | enum | Yes | Optimization method |
| `x0` | array | Yes | Initial guess |
| `maxIter` | number | No | Max iterations |
| `tolerance` | number | No | Convergence tolerance |
| `learningRate` | number | No | Learning rate for gradient descent |

**Tags:** optimization, gradient-descent, newton, BFGS, linear-programming, least-squares

### `math.poly_fit`

**Polynomial Regression**

Fit a polynomial of given degree to (x, y) data using least-squares. Returns coefficients, degree, and R² goodness-of-fit.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `x` | string | Yes | JSON array of x-values |
| `y` | string | Yes | JSON array of y-values (same length as x) |
| `degree` | number | Yes | Polynomial degree (1=linear, 2=quadratic, 3=cubic, ...) |

**Tags:** math, polynomial, regression, fit, least-squares, curve

### `math.science.solve`

**Science Formula Solver** | ✅ SLM

Solve physics, chemistry, and engineering formulas: Newton's laws, thermodynamics, fluid mechanics, electromagnetism, structural mechanics, wave optics, and more. Provide formula name and values.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `formula` | string | Yes | Formula name or expression (e.g. 'kinetic-energy', 'newton-second', 'ideal-gas', 'drag-force', 'euler-buckling', or custom expression) |
| `variables` | object | Yes | Variable values as key-value pairs (e.g. {m: 10, v: 5} for kinetic energy) |

**Tags:** science, physics, chemistry, engineering, formula, newton, thermodynamics

### `math.solve_ode`

**ODE Solver**

Solve ordinary differential equations using Euler or 4th-order Runge-Kutta methods. Supports scalar and system ODEs.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | No | ODE type |
| `y0` | string | Yes | Initial condition: number for scalar, JSON array for system |
| `t0` | number | Yes | Start time |
| `tEnd` | number | Yes | End time |
| `dt` | number | No | Time step (default 0.01) |
| `method` | enum | No | Numerical method |
| `expression` | string | Yes | dy/dt as an expression in t and y, e.g. "-2*y + t". For systems: ";"-separated expressions in t, y0, y1, … e.g. "y1; -y0" |

**Tags:** math, ode, differential, runge-kutta, euler, equation

### `math.solve_pde`

**PDE Solver**

Solve partial differential equations using finite-difference methods. Supports 1D heat equation, 1D wave equation, and 2D Laplace equation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `equation` | enum | Yes | PDE equation type |
| `alpha` | number | No | Thermal diffusivity (heat equation) or wave speed (wave equation) |
| `L` | number | No | Domain length [0, L] |
| `T` | number | No | Final simulation time |
| `nx` | number | No | Number of spatial grid points |
| `nt` | number | No | Number of time steps |
| `initial` | string | No | Initial condition u(x,0) as an expression in x and L (default "sin(pi*x/L)") |

**Tags:** math, pde, partial-differential, heat, wave, laplace, finite-difference

### `math.stress.analysis`

**Stress Analysis** | ✅ SLM

Compute principal stresses, von Mises stress, Mohr's circle, and failure criteria from a 2D stress state. Supports Tresca, von Mises, and Mohr-Coulomb criteria.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sx` | number | Yes | Normal stress σ_x (Pa) |
| `sy` | number | Yes | Normal stress σ_y (Pa) |
| `txy` | number | Yes | Shear stress τ_xy (Pa) |
| `E` | number | No | Young's modulus for strain calc (Pa) |
| `nu` | number | No | Poisson's ratio for strain calc |

**Tags:** stress, strain, von-mises, mohr, principal, failure

### `math.symbolic.solve`

**Symbolic Math Solver** | ✅ SLM

Solve math problems: evaluate expressions, differentiate, integrate, solve equations, compute Taylor series, limits, matrix operations. Supports standard math notation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `problem` | string | Yes | Math problem in natural language or expression (e.g. 'differentiate x^3+2x', 'integrate sin(x) from 0 to pi', 'solve x^2-4=0') |
| `expression` | string | No | Math expression to process |
| `variable` | string | No | Variable name (default 'x') |
| `a` | number | No | Lower bound for integration |
| `b` | number | No | Upper bound for integration |
| `center` | number | No | Center point for Taylor series |
| `order` | number | No | Order for Taylor series |
| `guesses` | array | No | Initial guesses for equation solver |
| `variables` | array | No | Variable names for system of equations |
| `equations` | array | No | Equations for system solver |
| `initialGuess` | array | No | Initial guess for system solver |

**Tags:** symbolic, calculus, algebra, equation, derivative, integral, matrix

### `math.transform`

**Transform Calculator**

Compute Laplace transform, Fourier transform, inverse Laplace, inverse Fourier. Useful for signals, control systems, and differential equations.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Transform type |
| `expression` | string | Yes | Time-domain expression (Laplace) or signal array (Fourier) |
| `variable` | string | No | Time variable name |
| `s` | number | No | s value for Laplace transform |
| `signal` | array | No | Signal values for Fourier transform |
| `sampleRate` | number | No | Sample rate for Fourier (Hz) |

**Tags:** laplace, fourier, transform, signal, control, frequency

## Enterprise Workflow

### `enterprise.project`

**Enterprise Project** | ✅ SLM

Company guideline packs + migration projects with long-running kanban execution (plan → commit → develop/test/document → verify)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | guidelines \| role-prompt \| plan \| step |
| `orgName` | string | No | Organization name for the guideline pack |
| `role` | string | No | Worker role for role-prompt action |
| `sections` | object | No | {coding,testing,review,docs,security,delivery} rule texts |
| `stories` | array | No | [{title,description,acceptanceCriteria,priority,dependsOn}] |
| `fromStack` | string | No | Source stack (e.g. python3.9-django) |
| `toStack` | string | No | Target stack (e.g. go1.22-chi) |

**Tags:** enterprise, guidelines, migration, long-running, kanban, jira

## Environment Management

### `env.create`

**Create Environment** | ✅ SLM

Create an isolated virtual environment for a specific programming language with resource limits

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Human-readable name for the environment |
| `language` | enum | Yes | Programming language for this environment |
| `memoryLimitMB` | number | No | Maximum memory in MB (default 128) |
| `timeoutMs` | number | No | Maximum execution time in ms (default 30000) |
| `envVars` | string | No | JSON object of environment variables |

**Tags:** environment, sandbox, code, execution, runtime, isolated

### `env.destroy`

**Destroy Environment** | ✅ SLM

Destroy an environment and free its resources (memory, file system, packages)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `environmentId` | string | Yes | ID of the environment to destroy |

**Tags:** destroy, cleanup, environment, resource

### `env.list`

**List Environments** | ✅ SLM

List all active environments with their language, status, package count, and execution history

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language` | enum | No | Filter by language (omit for all) |

**Tags:** list, environments, status, management

### `env.run`

**Run Code** | ✅ SLM

Execute code in an existing environment, capturing stdout, stderr, return value, and execution time

| Parameter | Type | Required | Description |
|---|---|---|---|
| `environmentId` | string | Yes | ID of the environment to run in (from env.create) |
| `code` | string | Yes | Code to execute |
| `stdin` | string | No | Standard input data |
| `timeoutMs` | number | No | Override timeout in ms |
| `workDir` | string | No | Override working directory |

**Tags:** run, execute, code, output, result, sandbox

## Fault Detection & Quality

### `fault.classify`

**Rule-Based Fault Classifier**

Classify fault events using configurable diagnostic rules. Supports custom rules with condition matching, severity assignment, and recommendations.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `events` | string | Yes | JSON array of fault events: [{ "timestamp": 123, "faultType": "temperature", "source": "sensor-A", "details": { "value": 92 } }] |
| `rules` | string | No | Optional JSON array of custom rules. Each: { "name": "rule1", "keywords": ["temp", "hot"], "severity": "high" } |

**Tags:** fault, classify, rules, diagnostic, severity

### `fault.detect_anomalies`

**Anomaly / Fault Detection**

Detect anomalies and faults in time-series or multivariate data using Z-score, Mahalanobis distance, Isolation Forest, or change-point detection. Returns per-point anomaly scores and flags.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | string | Yes | JSON array of numbers (univariate) or JSON array of arrays (multivariate rows) |
| `method` | enum | No | Detection algorithm |
| `threshold` | number | No | Anomaly threshold. Z-score: std deviations (default 3.0). Isolation Forest: contamination rate 0-1 (default 0.1). |
| `windowSize` | number | No | Sliding window size for change-point detection (default 20) |

**Tags:** fault, anomaly, detection, outlier, isolation-forest, z-score

### `fault.spc_chart`

**Statistical Process Control (SPC)**

Generate SPC control charts (X̄ chart, EWMA, CUSUM) for process monitoring. Detects out-of-control signals, trends, and shifts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | string | Yes | JSON array of numeric measurements |
| `method` | enum | No | Control chart method |
| `lambda` | number | No | EWMA smoothing factor (0-1, default 0.2) |
| `threshold` | number | No | CUSUM decision interval (default 5.0) |

**Tags:** fault, spc, control-chart, ewma, cusum, quality

## Finance & Lending Calculators

### `fin.analytics.agent_leaderboard`

**Agent Leaderboard** | ✅ SLM

Rank collection agents by performance: collections made, amount collected, success rate, pincodes covered.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `period` | string | No | Time period: 'today', 'week', 'month' (default: week) |

**Tags:** microfinance, agent, leaderboard, performance, ranking

### `fin.analytics.duckdb_query`

**Run DuckDB Query** | ✅ SLM

Execute any SQL query against the microfinance database. Pre-loaded DuckDB in-browser with customers, orders, payments, EMIs tables.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | SQL query to execute |

**Tags:** microfinance, duckdb, sql, analytics, query

### `fin.analytics.emi_collection_rate`

**EMI Collection Rate** | ✅ SLM

Daily EMI collection rate: paid vs overdue vs pending. Track how many EMIs are collected on time each day.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `days` | number | No | Number of days to look back (default: 7) |

**Tags:** microfinance, emi, collection, rate, daily

### `fin.analytics.financier_report`

**Financier Report** | ✅ SLM

Show credit exposure by financier: how much each financier has funded, outstanding, default rate. Essential for business relationships.

**Tags:** microfinance, financier, report, credit, exposure

### `fin.analytics.monthly_trend`

**Monthly Collection Trend** | ✅ SLM

12-month collection trend: total collected per month, unique customers, average payment size. Spot seasonal patterns.

**Tags:** microfinance, trend, monthly, analytics, collection

### `fin.calc.compare`

**Investment Comparator** | ✅ SLM

Compare multiple investment options side-by-side (SIP vs FD vs PPF vs NPS). Shows best option by each metric.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amount` | number | Yes | Investment amount in ₹ |
| `duration` | number | Yes | Duration in years |
| `options` | string | Yes | Comma-separated: sip,fd,ppf,nps |

**Tags:** finance, compare, investment, sip, fd, ppf, nps

### `fin.calc.fd`

**FD Calculator** | ✅ SLM

Calculate Fixed Deposit maturity with compounding (quarterly/monthly/yearly), TDS, and inflation-adjusted returns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `principal` | number | Yes | FD amount in ₹ |
| `annualRate` | number | Yes | Annual interest rate |
| `tenureYears` | number | Yes | Tenure in years |
| `compounding` | string | No | Compounding frequency: quarterly, monthly, yearly |

**Tags:** finance, fd, fixed deposit, compounding, maturity

### `fin.calc.goal`

**Goal-Based Planner** | ✅ SLM

Calculate monthly investment needed to reach a financial goal (child education, retirement, house). Shows asset allocation and feasibility.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `targetAmount` | number | Yes | Goal amount in ₹ |
| `targetDate` | string | Yes | Target date (YYYY-MM-DD) |
| `riskProfile` | string | Yes | Conservative, moderate, or aggressive |
| `currentSavings` | number | No | Current savings amount |

**Tags:** finance, goal, planning, investment, retirement, education

### `fin.calc.loan`

**Loan Calculator** | ✅ SLM

Calculate EMI, total interest, amortization schedule for any loan (home, car, personal, gold). Supports prepayment modeling and tax benefits.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `principal` | number | Yes | Loan amount in ₹ |
| `annualRate` | number | Yes | Annual interest rate (e.g. 8.5 for 8.5%) |
| `tenureMonths` | number | Yes | Loan tenure in months |
| `prepayment` | number | No | Annual prepayment amount (optional) |
| `processingFee` | number | No | Processing fee in ₹ or % |

**Tags:** finance, loan, emi, amortization, prepayment

### `fin.calc.rd`

**RD Calculator** | ✅ SLM

Calculate Recurring Deposit maturity with compounding and effective rate.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `monthlyDeposit` | number | Yes | Monthly deposit amount in ₹ |
| `annualRate` | number | Yes | Annual interest rate |
| `tenureMonths` | number | Yes | Tenure in months |

**Tags:** finance, rd, recurring deposit, savings

### `fin.calc.sip`

**SIP Calculator** | ✅ SLM

Calculate SIP returns with step-up, inflation adjustment, and LTCG tax. Shows year-wise wealth growth.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `monthlyAmount` | number | Yes | Monthly SIP amount in ₹ |
| `annualReturnRate` | number | Yes | Expected annual return (e.g. 12 for 12%) |
| `durationYears` | number | Yes | Investment duration in years |
| `stepUpPercent` | number | No | Annual step-up percentage (optional) |
| `inflationRate` | number | No | Inflation rate (default 6%) |

**Tags:** finance, sip, mutual fund, investment, returns

### `fin.calc.stamp_duty`

**Stamp Duty Calculator** | ✅ SLM

Calculate stamp duty and registration charges for any Indian state. State-wise rates built-in.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `propertyValue` | number | Yes | Property value in ₹ |
| `state` | string | Yes | Indian state name |

**Tags:** finance, stamp duty, registration, property, real estate

### `fin.calc.swp`

**SWP Calculator** | ✅ SLM

Calculate Systematic Withdrawal Plan — how long a corpus lasts with monthly withdrawals and returns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `corpus` | number | Yes | Total corpus amount in ₹ |
| `monthlyWithdrawal` | number | Yes | Monthly withdrawal amount in ₹ |
| `annualReturnRate` | number | Yes | Expected annual return rate |

**Tags:** finance, swp, withdrawal, retirement, corpus

### `fin.calc.tax`

**Income Tax Calculator** | ✅ SLM

Calculate income tax under old and new regime (FY 2025-26). Shows regime comparison, effective rate, take-home, and recommends better regime.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `grossIncome` | number | Yes | Annual gross income in ₹ |
| `section80C` | number | No | Section 80C deductions (PPF, LIC, etc.) |
| `section24` | number | No | Section 24 home loan interest deduction |
| `section80D` | number | No | Section 80D health insurance deduction |
| `hra` | number | No | HRA exemption amount |

**Tags:** finance, tax, income tax, old regime, new regime, deductions

### `fin.customer.list_by_pincode`

**List Customers by Pincode** | ✅ SLM

List all customers in a pincode area with their outstanding amounts. Used for area-wise collection planning.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pincode` | string | Yes | Pincode to search |
| `includeCompleted` | string | No | Include completed orders (default: false) |

**Tags:** microfinance, customer, pincode, list, area

### `fin.customer.search`

**Search Customer** | ✅ SLM

Find customer by name, phone, or order ID. Returns full profile with all orders, payments, and current status.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search term: name, phone, or order ID |

**Tags:** microfinance, customer, search, lookup, profile

### `fin.ledger.create_order`

**Create Credit Order** | ✅ SLM

Register a new appliance sale on credit. Auto-generates 10-month EMI schedule with ₹3/month interest. Creates customer record if new.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `customerName` | string | Yes | Customer full name |
| `customerPhone` | string | Yes | 10-digit phone number |
| `pincode` | string | Yes | Area pincode for route planning |
| `address` | string | Yes | Full delivery address |
| `itemName` | string | Yes | Appliance name (e.g., 'Samsung 43" TV') |
| `sellingPrice` | number | Yes | Price charged to customer |
| `purchasePrice` | number | No | Cost price (for margin tracking) |
| `financedBy` | string | No | Financier name or 'self' |

**Tags:** microfinance, credit, emi, ledger, order, create

### `fin.ledger.customer_balance`

**Customer Balance** | ✅ SLM

Get full balance sheet for any customer: total credit, total paid, outstanding, EMI history, next due date, risk status.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `customerId` | string | Yes | Customer ID or phone number |

**Tags:** microfinance, balance, outstanding, customer, ledger

### `fin.ledger.mark_overdue`

**Mark Overdue EMIs** | ✅ SLM

Scan all active orders and mark EMIs as overdue if past due date. Auto-detects defaulted orders (3+ months missed). Run daily.

**Tags:** microfinance, overdue, emi, default, batch

### `fin.ledger.record_payment`

**Record Payment** | ✅ SLM

Record a payment (cash or PhonePe) against a customer's EMI. Auto-matches to pending month, handles overpayment/underpayment, generates receipt.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID (ORD-XXXX-XXXX) |
| `amount` | number | Yes | Payment amount in ₹ |
| `method` | string | Yes | Payment method: 'phonepe' or 'cash' |
| `transactionRef` | string | No | PhonePe UPI reference or cash receipt # |
| `receivedBy` | string | No | Agent ID if collected in person |

**Tags:** microfinance, payment, emi, receipt, cash, phonepe

### `fin.reconcile.daily_settlement`

**Daily Settlement Report** | ✅ SLM

End-of-day settlement: total cash collected, PhonePe collected, agent-wise breakdown, unmatched payments, discrepancies.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `date` | string | No | Settlement date (default: today) |

**Tags:** microfinance, settlement, daily, reconciliation, cash, phonepe

### `fin.reconcile.match_transactions`

**Match PhonePe Transactions** | ✅ SLM

Match incoming PhonePe payments against expected EMIs. Identifies matches, mismatches, and unknown payments.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `transactions` | string | Yes | JSON array of {amount, phone, date, upiRef} |
| `date` | string | No | Transaction date to match against |

**Tags:** microfinance, phonepe, reconciliation, upi, matching

### `fin.risk.detect_defaulters`

**Detect Defaulters** | ✅ SLM

Scan all orders and identify defaulters with risk scores, missed months, recommended actions (call/visit/repossession).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pincode` | string | No | Filter by pincode (optional) |
| `minRiskScore` | number | No | Minimum risk score to include (default: 30) |

**Tags:** microfinance, defaulter, risk, escalation, detection

### `fin.risk.total_credit_exposure`

**Total Credit Exposure** | ✅ SLM

Get total credit given out, total collected, total outstanding, and exposure by financier. The 'how much money is at risk' query.

**Tags:** microfinance, credit, exposure, financier, risk

### `fin.risk.weekly_summary`

**Weekly Collection Summary** | ✅ SLM

This week's collection: total expected vs collected, cash vs PhonePe split, agent-wise performance, new defaulters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `weekStarting` | string | No | Week start date (YYYY-MM-DD) |

**Tags:** microfinance, weekly, summary, collection, performance

### `fin.route.assign_pincodes`

**Assign Pincodes to Agent** | ✅ SLM

Assign a set of pincodes to a collection agent. Updates their daily route scope.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agentId` | string | Yes | Agent ID |
| `pincodes` | string | Yes | Comma-separated pincodes to assign |

**Tags:** microfinance, agent, pincode, assignment

### `fin.route.pincode_summary`

**Pincode Collection Summary** | ✅ SLM

Get collection stats for a specific pincode: total orders, outstanding, overdue, customer count, defaulters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pincode` | string | Yes | Pincode to analyze |

**Tags:** microfinance, pincode, summary, analytics

### `fin.route.plan_daily`

**Plan Daily Collection Route** | ✅ SLM

Generate optimized collection route for an agent based on assigned pincodes. Prioritizes by overdue severity, groups by area.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agentId` | string | Yes | Collection agent ID |
| `date` | string | No | Date for route (YYYY-MM-DD, default: today) |
| `maxStops` | number | No | Maximum stops per route (default: 15) |

**Tags:** microfinance, route, collection, agent, pincode

### `fin.whatsapp.batch_reminders`

**Send Batch Reminders** | ✅ SLM

Auto-generate and queue reminder messages for all overdue customers in a pincode area. Agent can copy-paste to WhatsApp.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pincodes` | string | No | Comma-separated pincodes to target |
| `minOverdueMonths` | number | No | Minimum months overdue (default: 1) |

**Tags:** microfinance, whatsapp, batch, reminder, overdue

### `fin.whatsapp.parse_payment`

**Parse WhatsApp Message** | ✅ SLM

Extract payment info from WhatsApp messages. Detects amount, customer name, phone, order ID, payment method from free-text messages.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | string | Yes | Raw WhatsApp message text |

**Tags:** microfinance, whatsapp, nlp, payment, parse

### `fin.whatsapp.send_receipt`

**Generate Receipt Message** | ✅ SLM

Generate a formatted WhatsApp receipt for a completed payment. Shows item, month, amount, remaining balance, next due date.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID |
| `paymentAmount` | number | Yes | Amount paid |

**Tags:** microfinance, whatsapp, receipt, message

### `fin.whatsapp.send_reminder`

**Generate Reminder Message** | ✅ SLM

Generate a polite WhatsApp reminder for overdue EMI. Shows missed months, amount due, payment options.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Order ID with overdue EMI |

**Tags:** microfinance, whatsapp, reminder, overdue

## Fractal Analysis

### `fractal.chaos`

**Chaos & Dynamical Systems** | ✅ SLM

Generate chaos theory visualizations: logistic map bifurcation, Hénon phase space, Lorenz attractor, cobweb diagrams. Analyze period-doubling routes to chaos.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Chaos system |
| `r` | number | No | Parameter r (logistic/cobweb) |
| `x0` | number | No | Initial condition |
| `iterations` | number | No | Number of iterations |
| `sigma` | number | No | Lorenz sigma |
| `rho` | number | No | Lorenz rho |
| `beta` | number | No | Lorenz beta |

**Tags:** chaos, bifurcation, lorenz, attractor, dynamical-systems, nonlinear

### `fractal.dimension`

**Fractal Dimension Analyzer**

Compute fractal dimension using box-counting, Minkowski-Bouligand, lacunarity analysis, and multifractal spectrum f(α). Works on any binary or grayscale image/data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `method` | enum | Yes | Dimension estimation method |
| `data` | array | Yes | 2D array of values (grayscale image or fractal output) |
| `threshold` | number | No | Binary threshold for Minkowski |

**Tags:** fractal, dimension, box-counting, lacunarity, multifractal, hausdorff

### `fractal.generate`

**Fractal Generator**

Generate any fractal: Mandelbrot, Julia, Burning Ship, Newton, Tricorn, Sierpinski, Koch, Cantor, Dragon, Hilbert, IFS (Barnsley fern, etc.), L-systems, orbit trap, distance estimation. Returns pixel data or line data for rendering.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Fractal type |
| `width` | number | No | Image width (pixels) |
| `height` | number | No | Image height (pixels) |
| `zoom` | number | No | Zoom level (escape-time fractals) |
| `centerX` | number | No | Center X coordinate |
| `centerY` | number | No | Center Y coordinate |
| `cReal` | number | No | Julia set C real part |
| `cImag` | number | No | Julia set C imaginary part |
| `maxIter` | number | No | Max iterations |
| `iterations` | number | No | Iterations (geometric fractals) |
| `seed` | number | No | Random seed for noise |
| `octaves` | number | No | Octaves for fractal noise |

**Tags:** fractal, mandelbrot, julia, sierpinski, koch, ifs, l-system

### `fractal.ifs`

**IFS Fractal Generator**

Generate Iterated Function System fractals: Barnsley fern, Sierpinski gasket, Cantor dust, tree, spiral. Supports custom affine transformations.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `preset` | enum | No | Predefined IFS |
| `functions` | array | No | Custom IFS functions [{a,b,c,d,e,f,probability}] |
| `iterations` | number | No | Number of points to generate |
| `seed` | number | No | Random seed |

**Tags:** ifs, fractal, barnsley, fern, attractor

### `fractal.lsystem`

**L-System Generator** | ✅ SLM

Generate L-system fractals: Koch curve, Sierpinski arrow, Dragon, plant, tree, Gosper curve, Penrose tiling. Supports custom axiom and production rules.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `preset` | enum | No | Predefined L-system |
| `axiom` | string | No | Custom axiom (if no preset) |
| `rules` | array | No | Custom rules [{from, to}] |
| `angle` | number | No | Turn angle (degrees) |
| `iterations` | number | No | Number of iterations |

**Tags:** l-system, fractal, plant, tree, koch, penrose

## Governance

### `approvals.gate`

**Approval Gate** | ✅ SLM

Human-in-the-loop risk gate for autonomous agents: submit, decide, expire, configure policy

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | submit \| decide \| pending \| history \| policy \| expire |
| `title` | string | No | What needs approval (submit) |
| `toolId` | string | No | Tool that would act (submit) |
| `risk` | enum | No | low \| medium \| high \| critical (submit) |
| `requestId` | string | No | Request id (decide) |
| `decision` | enum | No | approved \| rejected (decide) |
| `by` | string | No | Who decided (default 'human') |
| `preset` | enum | No | balanced \| strict \| autonomous (policy) |

**Tags:** approvals, human-in-the-loop, policy, risk, autonomy

## Graph Execution

### `graph.run`

**Graph Run** | ✅ SLM

Define and invoke a stateful graph (nodes, edges, conditional routing) using the in-house stitap-graph engine

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | Graph name |
| `channels` | array | Yes | State channel names |
| `recursionLimit` | number | No | Max supersteps (default 25) |

**Tags:** graph, state, workflow, routing, checkpointing, langgraph

## Graphs & Visualization

### `chart.fractal-viz`

**Fractal Visualization** | ✅ SLM

Generate recharts-compatible visualizations for fractal analysis: dimension plot, multifractal spectrum, convergence history, escape-time heatmaps.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Visualization type |
| `data` | object | Yes | Visualization-specific data |

**Tags:** fractal, visualization, dimension, spectrum, heatmap

### `chart.generate`

**Chart Generator** | ✅ SLM

Generate recharts-compatible chart data for 35+ chart types: line, bar, scatter, area, histogram, box plot, violin, density, contour, heatmap, vector field, streamlines, phase portrait, bifurcation, radar, treemap, waterfall, funnel, gauge, sparkline, Pareto, Q-Q, autocorrelation, spectrum, fractal dimension, multifractal, convergence.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Chart type |
| `title` | string | No | Chart title |
| `xLabel` | string | No | X-axis label |
| `yLabel` | string | No | Y-axis label |
| `data` | object | Yes | Chart-specific data (see docs) |

**Tags:** chart, visualization, graph, recharts, dashboard, analysis

### `chart.stats`

**Quick Statistics** | ✅ SLM

Compute and visualize descriptive statistics: mean, median, std, percentiles, skewness, kurtosis, IQR, with histogram and box plot.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `values` | array | Yes | Numeric data array |
| `name` | string | No | Dataset name |

**Tags:** statistics, histogram, box-plot, descriptive, analysis

## Hugging Face Hub

### `huggingface.delete`

**Delete Downloaded Model** | ✅ SLM

Delete a downloaded HuggingFace model from local storage to free up disk space.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `modelId` | string | Yes | HuggingFace model ID |
| `filename` | string | Yes | GGUF filename to delete |

**Tags:** huggingface, delete, cleanup

### `huggingface.download`

**Download HuggingFace Model** | ✅ SLM

Download a GGUF model file from HuggingFace Hub. Supports progress tracking, pause/resume, and automatic quantization selection.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `modelId` | string | Yes | HuggingFace model ID (e.g., 'Qwen/Qwen2.5-1.5B-Instruct-GGUF') |
| `quant` | string | No | Quantization level (e.g., 'Q4_K_M', 'Q8_0', 'F16'). Auto-selected if not specified. |
| `maxRAMGB` | number | No | Available RAM in GB for quantization selection (default: 16) |

**Tags:** huggingface, download, gguf, model

### `huggingface.list_downloaded`

**List Downloaded Models** | ✅ SLM

List all HuggingFace models that have been downloaded and are available locally.

**Tags:** huggingface, models, local

### `huggingface.quant_info`

**Get Quantization Info** | ✅ SLM

Get detailed information about a quantization level including bits per weight, quality score, speed score, and RAM requirements.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `quant` | string | No | Quantization level (e.g., 'Q4_K_M'). If omitted, returns all levels. |

**Tags:** huggingface, quantization, info

### `huggingface.recommend`

**Recommend Model** | ✅ SLM

Get a recommended model and quantization level based on available RAM and use case.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ramGB` | number | Yes | Available RAM in GB |
| `category` | string | No | Use case: 'general', 'code', 'math', 'multilingual', 'tiny' |

**Tags:** huggingface, recommend, model

### `huggingface.search`

**Search HuggingFace Models** | ✅ SLM

Search the HuggingFace Hub for AI models. Supports filtering by GGUF files, parameter count, RAM requirements, and tags.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search query (e.g., 'qwen2.5', 'llama', 'phi-3') |
| `ggufOnly` | boolean | No | Only show models with GGUF files (default: true) |
| `maxRAMGB` | number | No | Maximum RAM in GB for estimated model size (default: 16) |
| `limit` | number | No | Maximum number of results (default: 20) |

**Tags:** huggingface, models, search, gguf

## Indic Typography Engine

### `typography.indic.css`

**Generate Indic CSS** | ✅ SLM

Generate CSS that follows W3C Indic Layout Requirements

| Parameter | Type | Required | Description |
|---|---|---|---|
| `script` | enum | Yes | Indic script to generate CSS for |
| `selector` | string | No | CSS selector (default: [lang="script"]) |
| `includeFonts` | boolean | No | Include Google Fonts @import |

**Tags:** typography, css, generation, google-fonts, responsive

### `typography.indic.detect`

**Detect Indic Script** | ✅ SLM

Detect which Indic script a text sample uses

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | Text sample to analyze |

**Tags:** typography, indic, script-detection, telugu, hindi, bengali, unicode

### `typography.indic.newspaper`

**Newspaper Layout Preset** | ✅ SLM

Get a proven newspaper-style column layout for an Indic script

| Parameter | Type | Required | Description |
|---|---|---|---|
| `script` | enum | Yes | Indic script |
| `preset` | enum | No | Layout preset |

**Tags:** typography, newspaper, columns, layout, editorial, print-inspired

### `typography.indic.rules`

**Get Indic Typography Rules** | ✅ SLM

Get W3C-compliant typography rules for an Indic script

| Parameter | Type | Required | Description |
|---|---|---|---|
| `script` | enum | Yes | Indic script to get rules for |

**Tags:** typography, rules, w3c, line-height, fonts, layout

### `typography.indic.tokens`

**Generate Indic Design Tokens** | ✅ SLM

Generate Tailwind-compatible design tokens for an Indic script

| Parameter | Type | Required | Description |
|---|---|---|---|
| `script` | enum | Yes | Indic script |

**Tags:** typography, tokens, tailwind, design-system, config

### `typography.indic.validate`

**Validate Indic Typography** | ✅ SLM

Check CSS against W3C Indic Layout Requirements

| Parameter | Type | Required | Description |
|---|---|---|---|
| `script` | enum | Yes | Indic script to validate against |
| `css` | object | Yes | CSS properties to validate (e.g., { fontSize: '14px', letterSpacing: '0.05em', lineHeight: '1.3' }) |

**Tags:** typography, validation, audit, w3c, accessibility, quality

### `typography.kannada.css`

**Kannada CSS Generator** | ✅ SLM

Generate W3C-compliant CSS for ಕನ್ನಡ typography

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | CSS selector (default: [lang="code"]) |
| `includeFonts` | boolean | No | Include Google Fonts @import |

**Tags:** typography, kannada, css, newspaper, w3c, indic

### `typography.kannada.newspaper`

**Kannada Newspaper Layout** | ✅ SLM

Get proven newspaper-style column layout for ಕನ್ನಡ

| Parameter | Type | Required | Description |
|---|---|---|---|
| `preset` | enum | No | Layout preset |

**Tags:** typography, kannada, newspaper, columns, layout, editorial

### `typography.kannada.tailwind`

**Kannada Tailwind Config** | ✅ SLM

Generate Tailwind config extensions for ಕನ್ನಡ

**Tags:** typography, kannada, tailwind, config, design-system

### `typography.kannada.validate`

**Kannada Typography Validator** | ✅ SLM

Check CSS against ಕನ್ನಡ typography rules

| Parameter | Type | Required | Description |
|---|---|---|---|
| `css` | object | Yes | CSS properties to validate |

**Tags:** typography, kannada, validation, audit, w3c, quality

### `typography.malayalam.css`

**Malayalam CSS Generator** | ✅ SLM

Generate W3C-compliant CSS for മലയാളം typography

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | CSS selector (default: [lang="code"]) |
| `includeFonts` | boolean | No | Include Google Fonts @import |

**Tags:** typography, malayalam, css, newspaper, w3c, indic

### `typography.malayalam.newspaper`

**Malayalam Newspaper Layout** | ✅ SLM

Get proven newspaper-style column layout for മലയാളം

| Parameter | Type | Required | Description |
|---|---|---|---|
| `preset` | enum | No | Layout preset |

**Tags:** typography, malayalam, newspaper, columns, layout, editorial

### `typography.malayalam.tailwind`

**Malayalam Tailwind Config** | ✅ SLM

Generate Tailwind config extensions for മലയാളം

**Tags:** typography, malayalam, tailwind, config, design-system

### `typography.malayalam.validate`

**Malayalam Typography Validator** | ✅ SLM

Check CSS against മലയാളം typography rules

| Parameter | Type | Required | Description |
|---|---|---|---|
| `css` | object | Yes | CSS properties to validate |

**Tags:** typography, malayalam, validation, audit, w3c, quality

### `typography.south-indian.compare`

**South Indian Language Comparison** | ✅ SLM

Compare typography rules across Telugu, Kannada, Tamil, Malayalam

**Tags:** typography, south-indian, comparison, telugu, kannada, tamil, malayalam

### `typography.tamil.css`

**Tamil CSS Generator** | ✅ SLM

Generate W3C-compliant CSS for தமிழ் typography

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | CSS selector (default: [lang="code"]) |
| `includeFonts` | boolean | No | Include Google Fonts @import |

**Tags:** typography, tamil, css, newspaper, w3c, indic

### `typography.tamil.newspaper`

**Tamil Newspaper Layout** | ✅ SLM

Get proven newspaper-style column layout for தமிழ்

| Parameter | Type | Required | Description |
|---|---|---|---|
| `preset` | enum | No | Layout preset |

**Tags:** typography, tamil, newspaper, columns, layout, editorial

### `typography.tamil.tailwind`

**Tamil Tailwind Config** | ✅ SLM

Generate Tailwind config extensions for தமிழ்

**Tags:** typography, tamil, tailwind, config, design-system

### `typography.tamil.validate`

**Tamil Typography Validator** | ✅ SLM

Check CSS against தமிழ் typography rules

| Parameter | Type | Required | Description |
|---|---|---|---|
| `css` | object | Yes | CSS properties to validate |

**Tags:** typography, tamil, validation, audit, w3c, quality

### `typography.telugu.css`

**Telugu CSS Generator** | ✅ SLM

Generate W3C-compliant CSS for తెలుగు typography

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | No | CSS selector (default: [lang="code"]) |
| `includeFonts` | boolean | No | Include Google Fonts @import |

**Tags:** typography, telugu, css, newspaper, w3c, indic

### `typography.telugu.newspaper`

**Telugu Newspaper Layout** | ✅ SLM

Get proven newspaper-style column layout for తెలుగు

| Parameter | Type | Required | Description |
|---|---|---|---|
| `preset` | enum | No | Layout preset |

**Tags:** typography, telugu, newspaper, columns, layout, editorial

### `typography.telugu.tailwind`

**Telugu Tailwind Config** | ✅ SLM

Generate Tailwind config extensions for తెలుగు

**Tags:** typography, telugu, tailwind, config, design-system

### `typography.telugu.validate`

**Telugu Typography Validator** | ✅ SLM

Check CSS against తెలుగు typography rules

| Parameter | Type | Required | Description |
|---|---|---|---|
| `css` | object | Yes | CSS properties to validate |

**Tags:** typography, telugu, validation, audit, w3c, quality

## Inference & Model Management

### `inference.download`

**Model Download** | ✅ SLM

Download model files with resumable chunked transfer, parallel connections, and SHA256 integrity verification

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | URL of the model file to download |
| `filename` | string | Yes | Local filename for the downloaded model |
| `sha256` | string | No | Expected SHA256 hash for integrity verification |
| `action` | enum | No | Download action |
| `parallelism` | number | No | Number of parallel connections |

**Tags:** download, resumable, chunked, sha256, model

### `inference.legacy`

**Legacy Server Support** | ✅ SLM

Detect legacy server hardware and provide actionable guidance for running GGUF inference on old systems

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | No | Action to perform |

**Tags:** legacy, server, numa, static-link, cross-compile, old-hardware

### `inference.probe`

**Hardware Probe** | ✅ SLM

Detect all available inference backends on this device — no privilege elevation required

| Parameter | Type | Required | Description |
|---|---|---|---|
| `includeBenchmark` | boolean | No | Also benchmark each available backend |

**Tags:** hardware, detection, probe, capabilities

### `inference.quant`

**Quantization Menu** | ✅ SLM

Show viable quantization levels for a model on this device with memory, throughput, and quality estimates

| Parameter | Type | Required | Description |
|---|---|---|---|
| `modelSource` | string | Yes | Model source URL or identifier |
| `originalWeightsAvailable` | boolean | No | Whether original full-precision weights are available |
| `currentFormat` | string | No | Current quantization format of any downloaded model |
| `availableFormats` | array | No | Available quantization formats for this model |

**Tags:** quantization, gguf, memory, quality, optimization

### `inference.router`

**Inference Router** | ✅ SLM

Select the fastest available backend for the current device — benchmarks each backend, picks the winner, caches the decision

| Parameter | Type | Required | Description |
|---|---|---|---|
| `mode` | enum | No | Performance mode |
| `workloadType` | enum | No | Expected workload pattern |
| `forceRebenchmark` | boolean | No | Ignore cached benchmarks and re-measure |

**Tags:** inference, routing, hardware, benchmarking, openvino, llamacpp

## Knowledge Base

### `knowledge.search`

**Knowledge Base (RAG)** | ✅ SLM

Ingest documents into a local vector store and retrieve budgeted context for prompts

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | ingest \| search \| context \| sources \| stats |
| `name` | string | No | Document name (ingest) |
| `text` | string | No | Document text (ingest) |
| `query` | string | No | Search query (search/context) |
| `topK` | number | No | Max hits (default 5) |
| `tokenBudget` | number | No | Context budget in tokens (default 600) |

**Tags:** rag, vector, search, context, offline

## Legacy Server Revival

### `server.build-optimizer`

**llama.cpp Build Optimizer**

Generates exact cmake flags, compile options, quantization, and runtime config to build llama.cpp for pre-AVX hardware. Solves SIGILL crashes on SSE-only machines.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | build-plan, build-config, model-recommendations |
| `serverModel` | string | No | Legacy server model name (e.g., 'ProLiant DL380 G5'). |

**Tags:** llama.cpp, build, optimization, compile, legacy, sigill

### `server.hardware-detect`

**Hardware Detection** | ✅ SLM

Detect CPU features (ISA, cores, cache), memory (size, type, speed), and storage on the current machine or a remote server via SSH probe. Generates a complete hardware profile for build optimization.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | detect-local, generate-probe, parse-probe |
| `probeOutput` | string | No | SSH probe output text (for parse-probe action). |

**Tags:** hardware, cpuid, memory, detection

### `server.legacy-hardware-db`

**Legacy Server Database** | ✅ SLM

Query the database of pre-2008 enterprise servers (Dell PowerEdge, HP ProLiant, IBM xSeries, Sun Fire, Supermicro). ~3 million estimated in the field.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | list-all, query, best-rag, report |
| `maxYear` | number | No | Filter: maximum release year. |
| `minRAMGB` | number | No | Filter: minimum max RAM in GB. |
| `manufacturer` | string | No | Filter: Dell, HP, IBM, Sun, Supermicro. |

**Tags:** legacy, hardware, database, servers

### `server.rag-deploy`

**RAG Server Deployment Kit**

Complete deployment plan: OS selection, llama.cpp build, vector DB, document ingestion, nginx, systemd services, and monitoring for pre-2008 servers.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | full-plan, deployment-script, performance-estimate, summary |
| `serverModel` | string | No | Legacy server model name to deploy on. |

**Tags:** rag, deployment, chatbot, legacy, server

## LLM Integration & Prompting

### `llm.buildPrompt`

**Build Prompt** | ✅ SLM

Build a structured prompt for an LLM from templates and context

| Parameter | Type | Required | Description |
|---|---|---|---|
| `template` | string | Yes | Prompt template with {{variables}} |
| `variables` | object | No | Template variables to substitute |
| `systemPrompt` | string | No | System/instruction prompt |
| `fewShot` | array | No | Few-shot examples [{input, output}] |
| `maxTokens` | number | No | Max tokens hint for the LLM |
| `temperature` | number | No | Temperature hint (0-2) |

**Tags:** prompt, template, llm, few-shot, system

### `llm.call`

**Call LLM** | ✅ SLM

Make a direct API call to any configured LLM provider

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Provider name (openai, ollama, huggingface, custom) |
| `model` | string | Yes | Model identifier |
| `messages` | array | Yes | Messages [{role, content}] |
| `endpoint` | string | No | Custom endpoint URL |
| `maxTokens` | number | No | Max tokens to generate |
| `temperature` | number | No | Temperature |
| `stream` | boolean | No | Enable streaming |
| `timeout` | number | No | Request timeout in ms |

**Tags:** call, api, inference, openai, ollama, stream

### `llm.generateScript`

**Generate Tutorial Script** | ✅ SLM

Generate a complete video tutorial script using an LLM

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | Yes | Documentation content to generate from |
| `title` | string | Yes | Tutorial title |
| `provider` | string | No | LLM provider |
| `model` | string | No | Model to use |
| `audienceLevel` | enum | No | Target audience |
| `maxScenes` | number | No | Max scenes to generate |
| `style` | enum | No | Narration style |

**Tags:** script, generate, tutorial, video, scenes

### `llm.manageContext`

**Manage Context** | ✅ SLM

Manage conversation context window for LLM interactions

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | Context management action |
| `messages` | array | No | Messages to add [{role, content}] |
| `maxTokens` | number | No | Max context window size (tokens) |
| `strategy` | enum | No | Truncation strategy |

**Tags:** context, window, token, history, truncation

### `llm.parseResponse`

**Parse Response** | ✅ SLM

Parse LLM response into structured data

| Parameter | Type | Required | Description |
|---|---|---|---|
| `response` | string | Yes | Raw LLM response text |
| `format` | enum | No | Expected output format |
| `schema` | object | No | JSON schema for validation |

**Tags:** parse, response, json, extract, structured

### `llm.routeModel`

**Route to Model** | ✅ SLM

Route a request to the best available LLM based on task type

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taskType` | enum | Yes | Type of task |
| `complexity` | enum | No | Task complexity |
| `preferredProvider` | string | No | Preferred provider name |
| `maxLatencyMs` | number | No | Max acceptable latency in ms |
| `offlineOnly` | boolean | No | Only use offline/local models |

**Tags:** route, model, select, provider, fallback

## Machine Learning

### `ml.cluster`

**K-Means Clustering**

Group unlabeled data into K clusters. Returns cluster assignments, centroids, inertia, and silhouette scores.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | string | Yes | JSON array of objects with numeric feature columns |
| `k` | number | Yes | Number of clusters |
| `maxIter` | number | No | Maximum iterations |

**Tags:** ml, clustering, kmeans, unsupervised

### `ml.evaluate`

**Evaluate Model**

Evaluate a trained model against test data. Returns MSE, RMSE, MAE, R-squared, accuracy, precision, recall, F1, confusion matrix.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `modelJson` | string | Yes | Serialized model JSON from ml.train |
| `data` | string | Yes | JSON array of objects with feature columns + "target" column |

**Tags:** ml, evaluate, metrics, accuracy

### `ml.feature_importance`

**Feature Importance**

Get feature importance scores from tree-based models (random forest, gradient boosting).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `modelJson` | string | Yes | Serialized model JSON (must be random_forest or gradient_boosting) |
| `featureNames` | string | No | JSON array of feature names for labeling |

**Tags:** ml, feature, importance, explainability

### `ml.forecast`

**Time Series Forecast**

Forecast future values from a time series using Holt-Winters exponential smoothing or moving average. Returns predictions with confidence intervals.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `series` | string | Yes | JSON array of numeric values (the time series) |
| `horizon` | number | Yes | How many steps ahead to forecast |
| `method` | enum | No | Forecasting method |
| `seasonLength` | number | No | Seasonal period length (for Holt-Winters) |

**Tags:** ml, forecast, time-series, smoothing

### `ml.pca`

**PCA (Dimensionality Reduction)**

Reduce feature dimensions via Principal Component Analysis. Returns transformed data, explained variance ratios, and loadings.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | string | Yes | JSON array of objects with numeric feature columns |
| `nComponents` | number | No | Number of principal components to keep |

**Tags:** ml, pca, dimensionality, reduction

### `ml.predict`

**Predict**

Run predictions using a previously trained model on new data points.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `modelJson` | string | Yes | Serialized model JSON from ml.train |
| `data` | string | Yes | JSON array of objects with the same feature columns as training data (no "target" column needed). |

**Tags:** ml, predict, inference

### `ml.preprocess`

**Preprocess Data**

Clean and prepare data for ML: normalize, standardize, handle missing values, encode categoricals, split train/test.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | string | Yes | JSON array of objects |
| `operations` | string | Yes | JSON array of operations: ["normalize", "standardize", "drop_missing", "encode_categoricals"] |
| `targetColumn` | string | No | Name of the target/label column |

**Tags:** ml, preprocess, clean, normalize

### `ml.train`

**Train Model**

Train a machine learning model on labeled data. Supports linear/logistic regression, KNN, random forest, gradient boosting. Returns trained model + metrics.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `algorithm` | enum | Yes | ML algorithm to use |
| `data` | string | Yes | JSON array of objects. Each object has feature columns + a "target" column. |
| `testSplit` | number | No | Fraction of data to hold out for testing (0-1) |
| `hyperparams` | string | No | JSON object of algorithm-specific hyperparameters. E.g. {"k": 5} for KNN, {"numTrees": 100} for random forest |

**Tags:** ml, train, supervised, regression, classification

## Maps & Geolocation

### `maps.geocode`

**Geocode Address** | ✅ SLM

Convert address text to GPS coordinates

| Parameter | Type | Required | Description |
|---|---|---|---|
| `address` | string | Yes | Address to geocode |
| `limit` | number | No | Max results |
| `countryCode` | string | No | ISO country code filter |
| `provider` | string | No | Map provider |

**Tags:** maps, geocode, location

### `maps.geofence`

**Geofence** | ✅ SLM

Create and check geographic boundary zones

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | string | Yes | Action to perform |
| `fence` | object | No | Geofence definition (for create) |
| `point` | object | No | Point to check (for check) |

**Tags:** maps, geofence, boundary

### `maps.isochrone`

**Isochrone** | ✅ SLM

Areas reachable within N minutes from a point

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | number | Yes | Center latitude |
| `lng` | number | Yes | Center longitude |
| `ranges` | array | Yes | Time ranges in minutes |
| `profile` | string | No | Transport mode |

**Tags:** maps, isochrone, accessibility

### `maps.reverse-geocode`

**Reverse Geocode** | ✅ SLM

Convert GPS coordinates to an address

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | number | Yes | Latitude |
| `lng` | number | Yes | Longitude |
| `provider` | string | No | Map provider |

**Tags:** maps, reverse-geocode

### `maps.route`

**Calculate Route** | ✅ SLM

Driving, cycling, or walking route between waypoints

| Parameter | Type | Required | Description |
|---|---|---|---|
| `waypoints` | array | Yes | Array of {lat, lng} points |
| `profile` | string | No | Transport mode |
| `steps` | boolean | No | Include turn-by-turn steps |

**Tags:** maps, route, navigation

## Media Processing

### `media.composeAudio`

**Compose Audio Track** | ✅ SLM

Compose a multi-layer audio track with music, SFX, and narration

| Parameter | Type | Required | Description |
|---|---|---|---|
| `layers` | array | Yes | Audio layers [{type, startTime, duration, volume}] |
| `duration` | number | No | Total track duration in seconds |
| `sampleRate` | number | No | Output sample rate |
| `fadeIn` | number | No | Fade in duration in seconds |
| `fadeOut` | number | No | Fade out duration in seconds |

**Tags:** compose, mix, audio, music, sfx, narration

### `media.generateSticker`

**Generate Sticker** | ✅ SLM

Generate an SVG sticker for video overlays

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Sticker type |
| `variant` | string | No | Specific variant (e.g., 'star', 'heart', 'circle', 'right-arrow') |
| `size` | number | No | Size in pixels |
| `color` | string | No | Primary color (hex) |
| `backgroundColor` | string | No | Background color (hex, empty for transparent) |
| `label` | string | No | Text label for number/highlight types |

**Tags:** sticker, svg, emoji, shape, arrow, overlay

### `media.generateThumbnail`

**Generate Thumbnail** | ✅ SLM

Generate a video thumbnail with text and styling

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Thumbnail title text |
| `width` | number | No | Thumbnail width |
| `height` | number | No | Thumbnail height |
| `background` | enum | No | Background style |
| `backgroundImage` | string | No | Background image URL/imageData (for 'image' background) |
| `titleColor` | string | No | Title text color |
| `titleSize` | number | No | Title font size in pixels |
| `gradientColors` | array | No | Gradient colors for gradient background |

**Tags:** thumbnail, preview, image, cover, poster

### `media.generateWaveform`

**Generate Waveform** | ✅ SLM

Generate a visual waveform visualization for audio

| Parameter | Type | Required | Description |
|---|---|---|---|
| `source` | string | No | Audio or video file to draw (peaks decoded with ffmpeg) |
| `samples` | array | No | Audio sample data (array of numbers 0-1); omit and pass source to compute peaks from a file |
| `width` | number | No | SVG width in pixels |
| `height` | number | No | SVG height in pixels |
| `color` | string | No | Waveform color |
| `style` | enum | No | Waveform style |

**Tags:** waveform, audio, visualization, svg, bars

### `media.renderVideo`

**Render Video** | ✅ SLM

Render a sequence of scenes into a video

| Parameter | Type | Required | Description |
|---|---|---|---|
| `scenes` | array | Yes | Array of scene objects {text, background, duration, overlays} |
| `width` | number | No | Video width in pixels |
| `height` | number | No | Video height in pixels |
| `fps` | number | No | Frame rate |
| `format` | enum | No | Output format |

**Tags:** render, video, canvas, composite, export

### `media.synthesizeSpeech`

**Synthesize Speech** | ✅ SLM

Generate speech audio from text using formant synthesis

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | Text to synthesize |
| `voice` | enum | No | Voice preset |
| `speed` | number | No | Speech speed (0.5 = half speed, 2 = double) |
| `pitch` | number | No | Pitch shift (0.5 = lower, 2 = higher) |
| `volume` | number | No | Volume (0-1) |

**Tags:** tts, speech, synthesis, voice, audio, formant

## Mobile Hardware

### `hardware.camera`

**Capture Photo** | ✅ SLM

Capture photo from device camera (mobile/web)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `facingMode` | string | No | Camera facing |
| `width` | number | No | Max width |
| `height` | number | No | Max height |
| `quality` | number | No | JPEG quality (0-1) |

**Tags:** hardware, camera, photo, mobile

### `hardware.clipboard`

**Clipboard** | ✅ SLM

Read/write text or images to system clipboard

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | string | Yes | Clipboard action |
| `text` | string | No | Text to write (for write action) |

**Tags:** hardware, clipboard

### `hardware.gps`

**Get GPS Location** | ✅ SLM

Get current GPS position from the device

| Parameter | Type | Required | Description |
|---|---|---|---|
| `highAccuracy` | boolean | No | High accuracy mode |
| `timeout` | number | No | Timeout in ms |

**Tags:** hardware, gps, location, mobile

### `hardware.motion`

**Accelerometer**

Read device motion sensors (accelerometer + gyroscope)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `duration` | number | No | Sample duration in ms |

**Tags:** hardware, accelerometer, gyroscope, mobile

### `hardware.speech`

**Text-to-Speech** | ✅ SLM

Speak text using device speech synthesis

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | Text to speak |
| `lang` | string | No | Language code |
| `rate` | number | No | Speech rate (0.1-10) |
| `pitch` | number | No | Speech pitch (0-2) |

**Tags:** hardware, speech, tts, audio

## Notifications

### `notify.send`

**Notifications** | ✅ SLM

Dispatch agent notifications through severity-filtered channels with quiet hours and dedupe

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | send \| channel \| list \| compact |
| `severity` | enum | No | debug\|info\|warn\|error\|critical (send) |
| `title` | string | No | Notification title (send) |
| `body` | string | No | Notification body (send) |
| `dedupeKey` | string | No | Collapse repeats inside the dedupe window (send) |
| `kind` | enum | No | in-app \| webhook \| log (channel) |
| `target` | string | No | Channel target URL/inbox/path (channel) |
| `minSeverity` | enum | No | Channel threshold (default info) |

**Tags:** notifications, alerts, webhook, quiet-hours, dedupe

## Observability & Tracing

### `trace.runs`

**Run Tracing** | ✅ SLM

Trace agent runs as span trees with token accounting and waterfall postmortems

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | start \| span \| end-span \| finish \| list \| waterfall |
| `name` | string | No | Run/span/span-name label |
| `runId` | string | No | Trace id |
| `spanIndex` | number | No | Span index within trace (end-span) |
| `status` | enum | No | ok \| error \| cancelled |
| `tokensIn` | number | No | Prompt tokens consumed |
| `tokensOut` | number | No | Completion tokens produced |
| `error` | string | No | Error message (end-span) |

**Tags:** tracing, observability, spans, tokens, postmortem

## OCR & Text Recognition

### `ocr.indic.batch`

**Indic Batch OCR** | ✅ SLM

OCR multiple images in Indian languages

| Parameter | Type | Required | Description |
|---|---|---|---|
| `images` | array | Yes | Array of image data URLs or file paths |
| `language` | enum | No | Target language code or 'auto' for detection |

**Tags:** ocr, indic, batch, multi-image, document-scanning

### `ocr.indic.detect`

**Indic Script Detector** | ✅ SLM

Detect the dominant Indian script in an image

| Parameter | Type | Required | Description |
|---|---|---|---|
| `image` | string | Yes | Image data URL or file path to analyze |

**Tags:** ocr, indic, script-detection, hindi, bengali, tamil, devanagari, indian-languages

### `ocr.indic.postprocess`

**Indic Text Normalizer** | ✅ SLM

Normalize and fix Indic OCR output text

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | OCR output text to normalize |
| `scriptFamily` | enum | No | Script family for targeted normalization |

**Tags:** ocr, indic, normalization, unicode, post-processing, devanagari

### `ocr.indic.recognize`

**Indic Text Recognition** | ✅ SLM

Recognize text in Indian languages from images

| Parameter | Type | Required | Description |
|---|---|---|---|
| `image` | string | Yes | Image data URL or file path to OCR |
| `language` | enum | No | Target language code or 'auto' for detection |
| `profile` | enum | No | Pre-defined language profile for mixed-script documents |
| `additionalLanguages` | array | No | Additional language codes for multi-language documents |

**Tags:** ocr, indic, text-recognition, hindi, bengali, tamil, telugu, multi-language

## Office Document Generation

### `office.doc`

**Document Generator** | ✅ SLM

Generate structured documents (Word alternative): headings, paragraphs, tables, images, page breaks. Convert Markdown to styled documents. Export as HTML for rendering.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | Action to perform |
| `title` | string | No | Document title |
| `markdown` | string | No | Markdown content (for from-markdown) |
| `content` | array | No | Content sections [{heading, content}] |
| `author` | string | No | Document author |
| `attendees` | array | No | Attendees (for meeting-notes) |
| `agenda` | array | No | Agenda items (for meeting-notes) |
| `actionItems` | array | No | Action items [{owner, task, deadline}] |

**Tags:** document, word, docx, report, markdown, html

### `office.email`

**Email Generator** | ✅ SLM

Generate email messages with proper headers, formatting, attachments, and HTML templates.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `from` | string | Yes | Sender email |
| `to` | array | Yes | Recipient emails |
| `subject` | string | Yes | Email subject |
| `body` | string | Yes | Email body text |
| `cc` | array | No | CC recipients |
| `priority` | enum | No | Email priority |
| `html` | boolean | No | Send as HTML |

**Tags:** email, outlook, mail, message

### `office.pdf`

**PDF Generator** | ✅ SLM

Generate PDF content from Markdown or structured data. Produces renderable HTML that can be printed to PDF.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | No | Document title |
| `markdown` | string | Yes | Markdown content to convert |

**Tags:** pdf, document, export

### `office.sheet`

**Spreadsheet Generator** | ✅ SLM

Generate spreadsheets (Excel alternative): populate sheets from CSV/JSON, create pivot tables, add formulas. Export as CSV.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | Action to perform |
| `name` | string | No | Spreadsheet name |
| `csv` | string | No | CSV data (for from-csv) |
| `json` | string | No | JSON array data (for from-json) |
| `sheetName` | string | No | Sheet name |
| `groupBy` | string | No | Group-by field for pivot |
| `valueField` | string | No | Value field for pivot |
| `aggFunc` | enum | No | Aggregation function for pivot |

**Tags:** spreadsheet, excel, csv, pivot, data

### `office.slide`

**Presentation Generator** | ✅ SLM

Generate presentations (PowerPoint alternative): title slides, content slides, two-column layouts. Convert Markdown to presentations. Export as HTML.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | Action to perform |
| `title` | string | No | Presentation title |
| `markdown` | string | No | Markdown content (for from-markdown) |
| `layout` | enum | No | Slide layout |
| `slideTitle` | string | No | Title for new slide |

**Tags:** presentation, powerpoint, slides, pptx

## OpenViking Context Store

### `viking.build_context`

**Build LLM Context** | ✅ SLM

Generate an SLM-friendly context block from indexed resources

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search query for relevant context |
| `tokenBudget` | number | No | Maximum tokens for context block |

**Tags:** viking, context, llm, prompt, rag

### `viking.create_project`

**Create Viking Project** | ✅ SLM

Initialize a new viking:// context store for a webbuilder project

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Project name |
| `baseUrl` | string | Yes | Base URL of the target website |

**Tags:** viking, context, tiered, storage, openviking

### `viking.index_resource`

**Index Resource** | ✅ SLM

Store a crawled resource in the appropriate tier (L0/L1/L2)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID to index into |
| `path` | string | Yes | Resource path (e.g., /landing) |
| `tier` | enum | Yes | Storage tier |
| `summary` | string | Yes | L0 abstract summary (~100 tokens) |

**Tags:** viking, index, tiered, L0, L1, L2

### `viking.query`

**Query Context** | ✅ SLM

Search and retrieve resources from the viking:// store with budget-aware tier loading

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID to search |
| `search` | string | No | Search query |
| `tier` | enum | No | Maximum tier to load |
| `tokenBudget` | number | No | Maximum tokens to return |

**Tags:** viking, query, search, budget-aware, retrieval

### `viking.webbuilder_audit`

**WebBuilder Audit** | ✅ SLM

Run requirement analysis audit across 6 functional pillars

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | Target URL to audit |
| `depth` | enum | No | Audit depth |

**Tags:** viking, audit, webbuilder, requirements, analysis, seo, a11y

## OS & Desktop Integration

### `os.execute`

**Execute Command**

Execute a shell command (sandboxed)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `command` | string | Yes | Shell command |
| `cwd` | string | No | Working directory |
| `timeout` | number | No | Timeout in ms |

**Tags:** os, shell, execute

### `os.file.list`

**List Directory** | ✅ SLM

List files and subdirectories in a path

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Directory path |
| `recursive` | boolean | No | List recursively |

**Tags:** os, filesystem, list

### `os.file.read`

**Read File** | ✅ SLM

Read a file from the local filesystem

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | File path |

**Tags:** os, filesystem, read

### `os.file.watch`

**Watch File**

Watch a file or directory for changes

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Path to watch |
| `recursive` | boolean | No | Watch recursively |

**Tags:** os, filesystem, watch

### `os.file.write`

**Write File** | ✅ SLM

Write content to a local file

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | File path |
| `content` | string | Yes | File content |

**Tags:** os, filesystem, write

### `os.notify`

**Desktop Notification** | ✅ SLM

Send native desktop or browser notification

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Notification title |
| `body` | string | No | Notification body |
| `icon` | string | No | Icon URL |

**Tags:** os, notification, alert

### `os.power`

**Power Management**

Check power source and prevent display sleep

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | string | Yes | Power action |

**Tags:** os, power, battery

### `os.process.list`

**List Processes**

List running system processes

**Tags:** os, process, monitoring

### `os.system-info`

**System Information** | ✅ SLM

Get platform, CPUs, memory, screen, locale info

**Tags:** os, system, info

### `os.tray`

**System Tray**

Create or update a system tray icon (Electron)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Tray tooltip text |
| `icon` | string | No | Icon path or data URL |
| `menu` | array | No | Context menu items |

**Tags:** os, tray, electron, desktop

## Payment Processing

### `payment.create_checkout`

**Create Checkout** | ✅ SLM

Create Stripe checkout for one-time or subscription payments

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Payment provider |
| `amount` | number | Yes | Amount in smallest currency unit (cents) |
| `currency` | string | Yes | ISO currency code |
| `productName` | string | Yes | Product name |
| `mode` | string | No | Payment mode |

**Tags:** payment, stripe, checkout

### `payment.invoice`

**Generate Invoice** | ✅ SLM

Generate PDF invoices with line items and taxes

| Parameter | Type | Required | Description |
|---|---|---|---|
| `items` | array | Yes | Line items with name, quantity, unitPrice |
| `currency` | string | Yes | ISO currency code |
| `tax` | number | No | Tax rate (0-1) |
| `notes` | string | No | Additional notes |

**Tags:** invoice, pdf, billing

### `payment.subscription`

**Manage Subscription**

Create, update, or cancel recurring subscriptions

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Payment provider |
| `action` | string | Yes | Action to perform |
| `customerId` | string | No | Customer ID |
| `priceId` | string | No | Price/plan ID |
| `subscriptionId` | string | No | Subscription ID (update, cancel, get) |

**Tags:** subscription, billing, recurring

### `payment.verify`

**Verify Payment** | ✅ SLM

Verify a completed payment by session or transaction ID

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Payment provider |
| `sessionId` | string | Yes | Checkout session ID |

**Tags:** payment, verify, webhook

## Real Estate

### `re.cashflow.report`

**Cash Flow Report** | ✅ SLM

Generate project cash flow report: inflows, outflows, category breakdown, 12-month projection.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `period` | string | No | Period: month, quarter, year |

**Tags:** realestate, cashflow, report, inflow, outflow

### `re.compliance.track`

**Compliance Tracker** | ✅ SLM

Track RERA registration, approvals status, upcoming expiries, violations, compliance score.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Tags:** realestate, compliance, rera, approvals, legal

### `re.cost.estimate`

**Cost Estimation** | ✅ SLM

Quick cost estimation for a project: total cost, revenue, profit margin, breakeven units. What-if on different price points.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `landAreaAcres` | number | Yes | Land area in acres |
| `floors` | number | Yes | Number of floors |
| `constructionCostPerSqFt` | number | Yes | Construction cost per sq ft |
| `sellingPricePerSqFt` | number | Yes | Selling price per sq ft |
| `state` | string | Yes | State name (for land rates) |

**Tags:** realestate, cost, estimation, breakeven, profit

### `re.crm.followup`

**CRM Follow-up List** | ✅ SLM

Generate daily follow-up list: today's follow-ups, overdue, upcoming, hot leads, lost recovery candidates.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Tags:** realestate, crm, followup, leads, hot

### `re.dashboard`

**Real Estate Dashboard** | ✅ SLM

Complete company dashboard: all projects, units sold, revenue, profit, inventory value, approvals pending.

**Tags:** realestate, dashboard, overview, company

### `re.forecast.revenue`

**Revenue Forecast** | ✅ SLM

Forecast revenue based on current sales velocity. Shows monthly projections, target date, confidence level.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `monthsAhead` | number | No | Months to forecast (default 12) |

**Tags:** realestate, forecast, revenue, velocity, projection

### `re.profitability`

**Profitability Analysis** | ✅ SLM

Calculate project profitability: ROI, IRR, gross/net margin, payback period, cost breakdown, revenue by unit.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Tags:** realestate, profit, roi, irr, margin, analysis

### `re.project.create`

**Create Real Estate Project** | ✅ SLM

Create a new project with full cost estimation: land, construction, approvals, marketing, finance costs. Auto-generates profit analysis.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Project name |
| `location` | string | Yes | Project location/address |
| `city` | string | Yes | City name |
| `state` | string | Yes | State name |
| `type` | string | Yes | apartment, villa, plot, commercial, mixed |
| `landAreaAcres` | number | Yes | Land area in acres |
| `floors` | number | Yes | Number of floors |
| `landCost` | number | Yes | Land acquisition cost in ₹ |
| `constructionCostPerSqFt` | number | Yes | Construction cost per sq ft |
| `sellingPricePerSqFt` | number | Yes | Selling price per sq ft |

**Tags:** realestate, project, create, cost, estimation

### `re.sales.pipeline`

**Sales Pipeline** | ✅ SLM

Generate sales pipeline report: leads, visits, negotiations, bookings, conversions, revenue vs target.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |

**Tags:** realestate, sales, pipeline, conversion, revenue

### `re.unit.pricing`

**Unit Pricing Engine** | ✅ SLM

Calculate optimal unit pricing based on floor, facing, view, size. Auto-applies premiums and discounts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | Yes | Project ID |
| `basePricePerSqFt` | number | Yes | Base price per sq ft |
| `floorRise` | number | No | Per floor premium in ₹/sq ft |
| `facingPremiums` | string | No | JSON: {north: 0, south: 2, east: 5, west: 3} |

**Tags:** realestate, pricing, unit, premium, floor, facing

## Real-time Collaboration

### `collab.channel.create`

**Create Channel** | ✅ SLM

Create a messaging channel in a session

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | Yes | Session ID |
| `name` | string | Yes | Channel name |
| `type` | string | No | Channel type |

**Tags:** collaboration, channel, chat

### `collab.ot.transform`

**Operational Transform**

Resolve concurrent editing conflicts via OT

| Parameter | Type | Required | Description |
|---|---|---|---|
| `document` | string | Yes | Current document text |
| `operations` | array | Yes | Concurrent operations to resolve |
| `strategy` | string | No | Resolution strategy |

**Tags:** collaboration, ot, conflict-resolution

### `collab.session.create`

**Create Session** | ✅ SLM

Create a real-time collaboration session

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Session name |
| `ownerId` | string | Yes | Owner user ID |
| `maxUsers` | number | No | Max participants |

**Tags:** collaboration, session, realtime

### `collab.session.join`

**Join Session** | ✅ SLM

Join an existing session with presence tracking

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | Yes | Session ID to join |
| `userId` | string | Yes | Your user ID |
| `name` | string | Yes | Display name |

**Tags:** collaboration, join, presence

## Sandbox Execution

### `sandbox.create`

**Create Sandbox** | ✅ SLM

Create a new isolated execution sandbox from a scenario template or custom configuration

| Parameter | Type | Required | Description |
|---|---|---|---|
| `scenarioId` | string | No | Pre-built scenario ID (e.g., 'test-unit', 'dev-sandbox', 'security-audit') |
| `name` | string | No | Human-readable name for the sandbox |
| `description` | string | No | Description of what this sandbox is for |
| `isolationLevel` | enum | No | Isolation level: none (shared), basic (Worker), full (Worker+policy+VFS), paranoid (full+limits) |
| `tags` | string | No | Comma-separated tags for search/filtering |

**Tags:** sandbox, create, isolation, environment, worker

### `sandbox.destroy`

**Destroy Sandbox** | ✅ SLM

Terminate and clean up an isolated sandbox, freeing its worker, file system, and network logs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sandboxId` | string | Yes | ID of the sandbox to destroy |

**Tags:** sandbox, destroy, cleanup, terminate

### `sandbox.exec`

**Execute in Sandbox** | ✅ SLM

Execute JavaScript/TypeScript code inside an isolated sandbox with network policy enforcement and timeout

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sandboxId` | string | Yes | ID of the sandbox to execute in |
| `code` | string | Yes | JavaScript/TypeScript code to execute |
| `language` | enum | No | Programming language (auto-detected if omitted) |
| `timeoutMs` | number | No | Execution timeout in milliseconds (overrides sandbox default) |

**Tags:** sandbox, execute, run, code, isolate

### `sandbox.files`

**Manage Sandbox Files** | ✅ SLM

List, read, or write files in a sandbox's virtual file system

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sandboxId` | string | Yes | ID of the sandbox |
| `action` | enum | Yes | File operation |
| `path` | string | No | File path (e.g., '/workspace/index.ts') |
| `content` | string | No | Content to write (for write action) |

**Tags:** sandbox, files, virtual-fs, read, write

### `sandbox.list`

**List Sandboxes** | ✅ SLM

List all active sandboxes with their status, resource usage, and configuration

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filter` | enum | No | Filter by status |
| `scenarioId` | string | No | Filter by scenario ID |
| `tag` | string | No | Filter by tag |

**Tags:** sandbox, list, status, monitor

### `sandbox.network`

**Sandbox Network Monitor** | ✅ SLM

View network traffic log and policy status for a sandbox

| Parameter | Type | Required | Description |
|---|---|---|---|
| `allowAll` | boolean | No | policy: allow all outbound traffic |
| `allowPatterns` | string | No | policy: comma-separated URL globs to allow, e.g. https://api.github.com/* |
| `blockPatterns` | string | No | policy: comma-separated URL globs to block |
| `sandboxId` | string | Yes | ID of the sandbox to inspect |
| `action` | enum | Yes | What to show |
| `limit` | number | No | Max log entries to return (default 50) |

**Tags:** sandbox, network, monitor, traffic, policy

### `sandbox.scenarios`

**Browse Sandbox Scenarios** | ✅ SLM

List all available sandbox scenarios: unit testing, integration, security audit, development, demo, performance

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | enum | No | Filter by category |
| `search` | string | No | Search query to filter scenarios |

**Tags:** sandbox, scenarios, templates, browse

### `sandbox.snapshot`

**Snapshot Sandbox State** | ✅ SLM

Capture a snapshot of a sandbox's virtual file system and state for later restore or cloning

| Parameter | Type | Required | Description |
|---|---|---|---|
| `restore` | string | No | Snapshot id to restore into the sandbox (omit to take a new snapshot) |
| `sandboxId` | string | Yes | ID of the sandbox to snapshot |

**Tags:** sandbox, snapshot, backup, restore, state

## Session Management

### `session.modules`

**Session Modules** | ✅ SLM

List, enable or disable harness modules for the current chat session and get the synchronized token budget

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | list \| enable \| disable \| preset \| budget |
| `moduleId` | string | No | Module id for enable/disable |
| `preset` | enum | No | slm-minimal \| balanced \| full-power \| air-gapped |
| `modelContextWindow` | number | No | Context window of the loaded model (default 8192) |

**Tags:** session, modules, configuration, budget, notebook

## SMS Communication

### `sms.send`

**Send SMS** | ✅ SLM

Send SMS messages via Twilio, Vonage, or AWS SNS

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | SMS provider |
| `to` | string | Yes | Phone number |
| `from` | string | No | Sender number or short code |
| `body` | string | Yes | Message text |

**Tags:** sms, twilio, notification

## Standards

### `standards.accessibility`

**Accessibility Audit (WCAG 2.2)** | ✅ SLM

Audit web content against WCAG 2.2 guidelines: alt text, color contrast, keyboard navigation, semantic HTML, ARIA attributes, focus management.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `files` | array | Yes | HTML/React files to audit [{path, content}] |

**Tags:** accessibility, wcag, a11y, aria, keyboard

### `standards.audit`

**Standards Compliance Audit** | ✅ SLM

Run a comprehensive compliance audit against ISO 25010, ISO 9001, ISO 27001, OWASP Top 10, WCAG 2.2, QA standards, and documentation standards. Analyzes source code, tests, configs, and documentation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `standard` | enum | Yes | Standard to audit against |
| `files` | array | Yes | Source files to audit [{path, content, language}] |
| `tests` | array | No | Test files [{path, content, passing}] |
| `packageJson` | object | No | package.json contents |

**Tags:** iso, compliance, audit, security, accessibility, quality, owasp, wcag

### `standards.quality`

**Code Quality Audit (ISO 25010)** | ✅ SLM

Audit code against ISO 25010 quality characteristics: functional suitability, performance, reliability, security, maintainability, portability.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `files` | array | Yes | Source files to audit [{path, content, language}] |
| `tests` | array | No | Test files [{path, content, passing}] |
| `packageJson` | object | No | package.json contents |

**Tags:** quality, iso-25010, maintainability, reliability

### `standards.security`

**Quick Security Scan** | ✅ SLM

Rapid security scan checking for hardcoded secrets, XSS vectors, SQL injection, deprecated crypto, missing auth, and common vulnerabilities.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `files` | array | Yes | Source files to scan [{path, content}] |

**Tags:** security, scan, vulnerability, secrets, xss

## Swarm Intelligence

### `swarm.configure`

**Swarm Configure** | ✅ SLM

Size and build a multi-agent swarm for this machine: topology, roles, memory slots, router workload sync

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Swarm name |
| `topology` | enum | No | hierarchical \| mesh \| ring \| star \| pipeline |
| `count` | number | No | Desired workers (clamped to hardware limits) |
| `modelName` | string | No | GGUF filename |
| `paramBillions` | number | Yes | Model parameter count in billions |
| `bitsPerWeight` | number | Yes | Quantization bits (e.g. 4 for Q4_K_M) |
| `physicalCores` | number | Yes | Physical CPU cores |
| `usableRamBytes` | number | Yes | Usable RAM after OS overhead |

**Tags:** swarm, multi-agent, topology, sizing, gguf

## Task Scheduling

### `scheduler.jobs`

**Task Scheduler** | ✅ SLM

Create and inspect scheduled agent automations using intervals or cron expressions

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | add \| list \| due \| remove \| record |
| `name` | string | No | Job name (add) |
| `kind` | enum | No | interval \| cron \| once (add) |
| `spec` | string | No | Interval seconds, cron expr, or ISO time (add) |
| `toolId` | string | No | Tool to run when the job fires (add) |
| `jobId` | string | No | Job id (remove/record) |
| `ok` | boolean | No | Outcome for record action |
| `durationMs` | number | No | Run duration for record |

**Tags:** scheduler, cron, automation, recurring, long-running

## Text Analysis & NLP

### `text.bm25_rank`

**BM25 Document Ranking**

Rank documents by relevance to a query using BM25 (Okapi). Returns documents sorted by relevance score.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | The search query |
| `documents` | string | Yes | JSON array of document strings |
| `topN` | number | No | Number of top results to return |

**Tags:** text, bm25, rank, search, retrieval

### `text.classify`

**Classify Text**

Classify a text document using a previously trained model. Returns predicted label, confidence score, and class probabilities.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `modelJson` | string | Yes | Serialized model JSON from text.train_classifier |
| `text` | string | Yes | The text to classify |

**Tags:** text, classify, predict, label

### `text.extract_keywords`

**Extract Keywords**

Extract top keywords and keyphrases from a document using RAKE-inspired scoring. Returns ranked keywords with scores and frequency.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | The document to extract keywords from |
| `topN` | number | No | Number of top keywords to return (default 10) |

**Tags:** text, keyword, extract, rake, phrase

### `text.sentiment`

**Sentiment Analysis**

Lexicon-based sentiment scoring. Returns score (-1 to +1), label (positive/negative/neutral), and matched sentiment words.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | The text to analyze |

**Tags:** text, sentiment, nlp, positive, negative

### `text.train_classifier`

**Train Text Classifier**

Train a keyword-based text classifier using Naive Bayes, KNN, or rule-based methods on labeled documents. Returns trained model for prediction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `documents` | string | Yes | JSON array of text strings (the training documents) |
| `labels` | string | Yes | JSON array of label strings (same length as documents, one label per document) |
| `method` | enum | No | Classification algorithm |
| `k` | number | No | Number of neighbors for KNN (default 3) |

**Tags:** text, classify, naive-bayes, keyword, tfidf, train

## Video Editing & Rendering

### `video.addCaption`

**Add Caption** | ✅ SLM

Add subtitles or captions to the video

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | Caption text |
| `startTime` | number | Yes | Start time in seconds |
| `endTime` | number | Yes | End time in seconds |
| `position` | enum | No | Caption position |
| `fontSize` | number | No | Font size in pixels |
| `bgColor` | string | No | Background color (hex, empty for transparent) |
| `textColor` | string | No | Text color (hex) |
| `style` | enum | No | Caption style |

**Tags:** caption, subtitle, text, timed, accessibility

### `video.addOverlay`

**Add Overlay** | ✅ SLM

Add an image, text, or sticker overlay to the video

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Overlay type |
| `content` | string | No | Text content or sticker ID |
| `imageUrl` | string | No | Image URL (for image/watermark/logo types) |
| `x` | number | No | X position (0-1 normalized) |
| `y` | number | No | Y position (0-1 normalized) |
| `scale` | number | No | Scale factor |
| `opacity` | number | No | Opacity (0-1) |
| `startTime` | number | No | Start time in seconds |
| `endTime` | number | No | End time in seconds (-1 for forever) |
| `animation` | enum | No | Entrance animation |

**Tags:** overlay, sticker, logo, watermark, text, image

### `video.addTransition`

**Add Transition** | ✅ SLM

Add a transition between two clips or scenes

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Transition type |
| `duration` | number | No | Transition duration in seconds |
| `atTime` | number | Yes | Time position for the transition (seconds) |

**Tags:** transition, fade, dissolve, wipe, slide, zoom

### `video.annotate`

**Annotate Frame** | ✅ SLM

Add annotations to the current video frame

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | enum | Yes | Annotation type |
| `x` | number | Yes | X position |
| `y` | number | Yes | Y position |
| `content` | string | No | Text content (for text/number types) |
| `width` | number | No | Width (for rect/highlight/blur) |
| `height` | number | No | Height (for rect/highlight/blur) |
| `color` | string | No | Annotation color (hex) |
| `endX` | number | No | End X (for arrow type) |
| `endY` | number | No | End Y (for arrow type) |
| `fontSize` | number | No | Font size in pixels |
| `startTime` | number | No | Start time in seconds |
| `endTime` | number | No | End time in seconds (-1 for forever) |

**Tags:** annotate, overlay, text, arrow, highlight, blur

### `video.captureFrame`

**Capture Frame** | ✅ SLM

Capture a single frame from the video as an image

| Parameter | Type | Required | Description |
|---|---|---|---|
| `source` | string | No | Video file to use instead of the current project source |
| `timestamp` | number | No | Time in seconds to capture the frame |
| `format` | enum | No | Output format |
| `quality` | number | No | Quality (1-100, for jpeg/webp) |
| `scale` | number | No | Scale factor (1 = original, 0.5 = half) |

**Tags:** frame, capture, thumbnail, preview, extract

### `video.export`

**Export Video** | ✅ SLM

Export the edited video to a file

| Parameter | Type | Required | Description |
|---|---|---|---|
| `source` | string | No | Video file to use instead of the current project source |
| `format` | enum | No | Export format |
| `quality` | number | No | Export quality (1-100) |
| `startFrame` | number | No | Start frame number |
| `endFrame` | number | No | End frame number (-1 for all) |
| `fps` | number | No | Output frame rate |
| `width` | number | No | Output width in pixels |
| `height` | number | No | Output height in pixels |

**Tags:** export, video, webm, mp4, gif, render

### `video.record`

**Record Screen** | ✅ SLM

Start or stop screen recording

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | start/stop a screen recording, or open an existing video file as the project source |
| `source` | string | No | Video file to open (action=open) |
| `includeAudio` | boolean | No | Include system audio |
| `includeWebcam` | boolean | No | Include webcam overlay |
| `frameRate` | number | No | Target frame rate |
| `maxDuration` | number | No | Max recording duration in seconds |

**Tags:** record, screen, video, webm, mediarecorder

## Voice & Text-to-Speech

### `voice.call`

**Voice Call / TTS** | ✅ SLM

Voice calls or TTS audio via Twilio, ElevenLabs, or Azure

| Parameter | Type | Required | Description |
|---|---|---|---|
| `provider` | string | Yes | Voice provider |
| `to` | string | No | Phone number (for calls) |
| `text` | string | Yes | Text to speak |
| `voice` | string | No | Voice ID or name |
| `language` | string | No | Language code |

**Tags:** voice, tts, speech, call
