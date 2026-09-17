# Agent Execution Guidelines for WebBuilder Requirement Analysis

## Core Directives

1. **Context Management:** All crawled website assets MUST be stored in `viking://resources/`. Always read `.abstract` (L0) and `.overview` (L1) layers before loading raw `.json` or HTML (L2) files.
2. **Browser Automation:** Use `BrowserUse` for DOM inspection. Take full-page snapshots on route navigation and map interactive element selectors (`data-testid`, `id`, `class`).
3. **Diagramming Standard:** All architectural flows must be rendered in standard Mermaid syntax via the `DiagramDesign` skill module.
4. **Verification Gates:** An audit task is marked COMPLETE only when every route listed in `sitemap.xml` has a corresponding L1 overview and interaction sequence diagram.
5. **Spend Awareness:** Always check CAR framework spend rails before executing token-intensive operations. Stay within budget limits.
6. **Sandbox First:** All code execution must happen in sandboxed containers. Never execute untrusted code outside a sandbox.
7. **Memory Persistence:** Store user preferences, project context, and audit findings in AgentMemory for cross-session persistence.
8. **Progressive Loading:** Never load L2 (full raw) data unless explicitly required for deep editing. Start with L0 summaries, upgrade to L1 overview as needed.

---

## Harness Configuration (CAR Framework)

### Control Layer (Permissions & Policies)

| Action | Policy |
|--------|--------|
| `deploy`, `publish`, `delete_resource`, `modify_production` | ⚠️ Requires human approval |
| `access_credentials`, `modify_env`, `bypass_sandbox` | ❌ Blocked |
| `browser_use`, `viking_store`, `diagram_design` | ✅ Auto-approved |

### Agency Layer (Agent Capabilities)

- **Default Autonomy:** Semi-autonomous
- **Max Concurrent Agents:** 4
- **Max Agent Lifespan:** 60 minutes
- **Allowed Tools:** browser_use, viking_store, agent_memory, diagram_design, webbuilder_audit, knowledge_base
- **Blocked Tools:** shell_exec, file_system_write

### Runtime Layer (Budgets & Limits)

| Resource | Per-Action | Per-Session |
|----------|-----------|-------------|
| Tokens | 10,000 | 100,000 |
| Cost (USD) | $0.50 | $5.00 |
| Timeout | 120s | 30min |
| Memory | 512MB | — |

---

## Evaluation Gates

An audit task passes these gates before being marked COMPLETE:

1. **Route Coverage Gate:** Every discovered route must have an L0 abstract and L1 overview.
2. **Component Catalog Gate:** All UI components must be identified and classified.
3. **Design Token Gate:** Colors, typography, spacing, and breakpoints must be extracted.
4. **Interaction Map Gate:** All interactive elements (buttons, forms, tabs, modals) must have interaction sequences documented.
5. **API Contract Gate:** All third-party integrations must have input/output data contracts recorded.
6. **Performance Gate:** Core Web Vitals (LCP, CLS, INP) must be measured and recorded.
7. **Accessibility Gate:** ARIA labels, keyboard navigation, and contrast ratios must be verified.
8. **Diagram Gate:** At minimum, a route navigation map and user journey sequence diagram must be generated.

---

## Required Tool Capabilities

### 1. BrowserUse — Browser Automation

```
Tools: browser_use, dom_inspect, screenshot, network_intercept
Purpose: Navigate, inspect, and extract data from target websites
```

- Launch headless browser sessions
- Traverse all URL routes
- Click interactive triggers (modals, dropdowns, tabs, forms)
- Log network payload requests
- Extract raw HTML/CSS structural trees
- Capture layout breakpoints and design tokens
- Execute client-side JavaScript behavior analysis

### 2. OpenViking — Context Database

```
Tools: viking_store, viking_query, viking_index
Purpose: Store and organize extracted assets in tiered context
```

- Store components in `viking://resources/{project}/`
- Index across L0 (Abstract), L1 (Overview), L2 (Details) tiers
- Budget-aware loading: always start at L0, upgrade only as needed
- Generate project summaries from aggregated L0 data

### 3. AgentMemory — Long-Term Memory

```
Tools: memory_store, memory_query, memory_decay
Purpose: Persist user preferences, session history, and audit findings
```

- Store user preferences (type: "user")
- Store project facts (type: "project")
- Store workflow patterns (type: "workflow")
- Decay old memories automatically
- Merge similar memories to stay within budget

### 4. ScientificAgentSkills — Analysis & Verification

```
Tools: webbuilder_audit, standards_check, performance_measure
Purpose: Evaluate functional logic, performance, and accessibility
```

- Run automated checks against Core Web Vitals
- Verify form validation rules and error states
- Inspect API endpoints for data contracts
- Check WCAG 2.2 compliance
- Audit SEO metadata (title, OpenGraph, JSON-LD)

### 5. DiagramDesign — Visual Architecture

```
Tools: diagram_generate, diagram_render, diagram_export
Purpose: Convert raw data into visual documentation
```

- Generate User Journey Sequence Diagrams
- Generate UI Component Tree diagrams
- Generate Data Flow & ER Diagrams
- Generate System Architecture schemas
- Generate Route Navigation maps
- All diagrams in standard Mermaid syntax

### 6. Harness Engineering — Governance

```
Tools: harness_check, spend_verify, gate_evaluate
Purpose: Enforce safety guardrails and track trajectory
```

- Check spend rails before token-intensive operations
- Evaluate verification gates at milestones
- Enforce sandbox boundaries for code execution
- Track agent lifecycle and resource usage
- Generate audit trail of all agent actions

---

## Workflow: End-to-End Execution Pipeline

### Phase 1: Automated Discovery (BrowserUse)

1. Launch BrowserUse session with target URL
2. Crawl all public routes
3. Trigger authentication for protected routes
4. Click through all interactive elements
5. Capture network requests and payloads
6. Extract DOM structure, CSS, and JavaScript

### Phase 2: Context Indexing (OpenViking)

1. Create viking:// project namespace
2. Index each route at L0 (abstract summary)
3. Index component trees at L1 (overview)
4. Store full DOM/CSS/JS at L2 (details)
5. Generate project summary from aggregated L0s

### Phase 3: Analytical Audit (ScientificAgentSkills)

1. Run Web Vitals checks (LCP, CLS, INP)
2. Verify form validation rules
3. Inspect API integrations and data contracts
4. Check accessibility compliance
5. Audit SEO metadata

### Phase 4: Architecture Mapping (DiagramDesign)

1. Generate route navigation map from crawl data
2. Generate user journey sequence diagrams
3. Generate component tree diagrams
4. Generate data flow diagrams for integrations
5. Generate ER diagrams for data models

### Phase 5: Harness Verification

1. Evaluate route coverage gate
2. Evaluate component catalog gate
3. Evaluate performance gate
4. Evaluate accessibility gate
5. Evaluate diagram gate
6. Generate final audit report
