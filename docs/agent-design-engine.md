# Agent Design Engine

A **Figma-style programmatic canvas** for agents — not a human UI. Agents call these tools via the harness to create, compose, and export visual designs.

## Why Agents Need This

Agents don't need drag-and-drop. They need:
1. **Create** — blank canvas, artboards, components
2. **Compose** — add elements, position, style, group
3. **Auto-layout** — flex row/column, center, spacing
4. **Export** — React+Tailwind, HTML, SVG, Figma JSON

One agent call creates what a human takes 30 minutes to design in Figma.

## Architecture

```
Agent Request
     │
     ▼
┌─────────────────────────┐
│   Tool Harness (CAR)    │  ← permission gates, spend rails
│   design.canvas.create  │
│   design.artboard.add   │
│   design.element.add    │
│   design.preset.add     │
│   design.layout.auto    │
│   design.export         │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Agent Design Engine    │  ← pure functions, no DOM
│  (agent-canvas.ts)      │
│                         │
│  CanvasState            │  ← serializable state tree
│  ├── Artboards[]        │
│  ├── Elements Map       │
│  ├── Layer Order        │
│  └── Design Tokens      │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Export Layer            │
│  ├── React + Tailwind   │
│  ├── HTML + CSS         │
│  ├── SVG                │
│  └── Figma JSON         │
└─────────────────────────┘
```

## Core Concepts

### Canvas State

Every operation is a pure function: `(CanvasState, Action) → CanvasState`. No DOM, no browser, runs anywhere.

```ts
interface CanvasState {
  id: string;
  name: string;
  artboards: Artboard[];
  elements: Map<string, CanvasElement>;
  layerOrder: string[];
  tokens: DesignTokens;
}
```

### Artboards (Frames)

Responsive breakpoints with presets:

| Breakpoint | Size | Preset |
|------------|------|--------|
| `mobile` | 375×812 | iPhone 14 |
| `tablet` | 768×1024 | iPad |
| `desktop` | 1440×900 | Desktop |
| `wide` | 1920×1080 | Wide Desktop |

### Elements (20+ types)

| Kind | Purpose | Has Text | Has Children |
|------|---------|----------|--------------|
| `rect` | Rectangle/box | ✗ | ✗ |
| `text` | Paragraph/text | ✓ | ✗ |
| `image` | Image (src) | ✗ | ✗ |
| `icon` | Lucide icon | ✗ | ✗ |
| `button` | CTA button | ✓ | ✗ |
| `input` | Text input | ✗ | ✗ |
| `card` | Content card | ✓ | ✗ |
| `nav` | Navigation bar | ✗ | ✓ |
| `hero` | Hero section | ✗ | ✓ |
| `grid` | CSS Grid | ✗ | ✓ |
| `flex` | Flexbox container | ✗ | ✓ |
| `divider` | HR/divider | ✗ | ✗ |
| `badge` | Status badge | ✓ | ✗ |
| `avatar` | User avatar | ✗ | ✗ |
| `modal` | Dialog/modal | ✗ | ✓ |
| `sidebar` | Side panel | ✗ | ✓ |
| `footer` | Page footer | ✗ | ✓ |
| `section` | Generic section | ✗ | ✓ |
| `container` | Wrapper div | ✗ | ✓ |
| `group` | Layer group | ✗ | ✓ |

### Component Presets

Ready-made patterns agents can drop in:

| Preset | Description |
|--------|-------------|
| `hero-center` | Centered headline + subheadline + CTA button |
| `navbar` | Logo + nav links + sign-up button |
| `card-grid` | 3-column feature cards |
| `pricing-table` | Free / Pro / Enterprise tiers |
| `footer` | Multi-column footer with links |

### Design Tokens

Default token system (customizable):

```
Colors:     primary, secondary, accent, background, foreground, muted, border, destructive, success, warning
Fonts:      sans (Inter), mono (JetBrains Mono), display (Cal Sans)
Sizes:      xs → 5xl (0.75rem → 3rem)
Spacing:    0 → 16 (0 → 4rem)
Radii:      none → full (0 → 9999px)
Shadows:    sm, md, lg, xl
```

## Tools (11 total)

| Tool | Purpose |
|------|---------|
| `design.canvas.create` | Create new canvas with tokens |
| `design.artboard.add` | Add responsive artboard |
| `design.element.add` | Add any of 20+ element types |
| `design.preset.add` | Drop in component preset |
| `design.layout.auto` | Auto-arrange (flex row/column/center) |
| `design.element.group` | Group elements into container |
| `design.landing.create` | One-shot full landing page |
| `design.export` | Export to React/HTML/SVG/Figma JSON |
| `design.element.update` | Modify element properties |
| `design.element.remove` | Delete element + children |
| `design.layer.reorder` | Change z-order |

## Agent Workflow Example

### Create a landing page in one call

```ts
// Agent calls:
design.canvas.create({ name: "SaaS Landing" })
design.landing.create({
  canvasId: "canvas-xxx",
  title: "Ship faster with AI",
  subtitle: "The platform that turns ideas into production",
  cta: "Start Free Trial",
  brand: "Acme AI"
})
design.export({ canvasId: "canvas-xxx", format: "react" })

// Output: Complete React + Tailwind component
```

### Build a custom page step by step

```ts
// 1. Create canvas
design.canvas.create({ name: "Dashboard" })

// 2. Add artboard
design.artboard.add({ canvasId, breakpoint: "desktop" })

// 3. Add elements
design.element.add({
  canvasId, artboardId,
  kind: "nav", name: "Top Nav",
  width: 1440, height: 64,
  backgroundColor: "#ffffff"
})

design.element.add({
  canvasId, artboardId,
  kind: "text", name: "Title",
  x: 48, y: 120, width: 400, height: 48,
  text: "Dashboard", fontSize: "2.25rem", fontWeight: "700"
})

// 4. Auto-layout
design.layout.auto({ canvasId, artboardId, mode: "column", gap: 24, padding: 48 })

// 5. Export
design.export({ canvasId, format: "html" })
```

### Multi-breakpoint responsive design

```ts
// Desktop
design.artboard.add({ canvasId, breakpoint: "desktop" })
// ... add elements ...

// Tablet
design.artboard.add({ canvasId, breakpoint: "tablet" })
// ... add elements with tablet-specific sizes ...

// Mobile
design.artboard.add({ canvasId, breakpoint: "mobile" })
// ... add elements with mobile-specific sizes ...

// Export all breakpoints
design.export({ canvasId, format: "react" })
```

## Export Formats

### React + Tailwind (default)

```tsx
import React from "react";

export default function Design() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff" }}>
      <nav className="absolute left-0 top-0 w-[1440px] h-[64px] bg-white border-b border-zinc-200">
        <p className="absolute left-[48px] top-[20px] w-[120px] h-[24px] text-xl font-bold text-zinc-950">Acme Inc</p>
      </nav>
      <p className="absolute left-[200px] top-[160px] w-[1040px] h-[80px] text-5xl font-extrabold text-white text-center">
        Build something amazing
      </p>
      <button className="absolute left-[620px] top-[340px] w-[200px] h-[48px] bg-blue-500 text-white rounded-md text-base font-semibold">
        Get Started
      </button>
    </div>
  );
}
```

### Figma JSON (round-trip)

```json
{
  "name": "Landing Page",
  "tokens": { "colors": { "primary": "#3b82f6", ... } },
  "artboards": [{
    "id": "artboard-1",
    "name": "Desktop",
    "width": 1440,
    "height": 900,
    "children": [
      { "id": "el-1", "type": "NAV", "name": "Navbar", "x": 0, "y": 0, "width": 1440, "height": 64 },
      { "id": "el-2", "type": "TEXT", "name": "Headline", "x": 200, "y": 160, "content": "Build something amazing" }
    ]
  }]
}
```

## File Locations

| File | Purpose |
|------|---------|
| `src/lib/design/agent-canvas.ts` | Core engine — pure functions, types, presets, export |
| `src/lib/store/tools/design-engine-tools.ts` | 11 tool manifests for the Store |
| `src/lib/store/registry.ts` | Tool registration |
| `docs/agent-design-engine.md` | This documentation |

## Integration with Agent Harness

The design tools are registered in the CAR framework:

```ts
// Agent can call any design tool:
const result = await harness.store.execute("design.landing.create", {
  canvasId: "canvas-123",
  title: "My Product",
  cta: "Sign Up"
});
```

Permissions (from AGENTS.md):
- `design.*` tools: ✅ Auto-approved
- No browser/network required — all pure computation
- Zero token cost beyond the tool call itself
