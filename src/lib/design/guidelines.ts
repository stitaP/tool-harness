/**
 * Design Guidelines Engine
 *
 * Encodes structured rules from three authoritative sources:
 * 1. Vercel Web Interface Guidelines (https://vercel.com/design/guidelines)
 * 2. Microsoft Fluent 2 Design System (https://fluent2.microsoft.design)
 * 3. TasteSkill — Anti-Slop Frontend Framework (https://tasteskill.dev)
 *
 * Each rule has a source, severity, category, and check function.
 * Tools consume these rules to audit, score, and suggest improvements.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type GuidelineSource = "vercel" | "fluent" | "tasteskill";
export type RuleSeverity = "error" | "warning" | "info";
export type RuleCategory =
  | "accessibility"
  | "focus"
  | "forms"
  | "animation"
  | "typography"
  | "content"
  | "images"
  | "performance"
  | "navigation"
  | "touch"
  | "layout"
  | "dark-mode"
  | "i18n"
  | "hydration"
  | "interactive-states"
  | "copy"
  | "spacing"
  | "color"
  | "grid"
  | "responsive"
  | "visual-hierarchy"
  | "anti-slop"
  | "motion"
  | "brand-consistency";

export interface DesignRule {
  id: string;
  source: GuidelineSource;
  category: RuleCategory;
  severity: RuleSeverity;
  title: string;
  description: string;
  /** Human-readable fix instruction */
  fix: string;
  /** CSS/HTML pattern to search for (optional) */
  pattern?: string;
  /** Anti-pattern to flag (optional) */
  antiPattern?: string;
  /** Weight for scoring (1-10, higher = more important) */
  weight: number;
  /** Tags for filtering */
  tags: string[];
}

export interface RuleViolation {
  rule: DesignRule;
  element?: string;
  location?: string;
  actualValue?: string;
  expectedValue?: string;
  suggestion: string;
  confidence: number; // 0-1
}

export interface AuditResult {
  source: GuidelineSource;
  totalRules: number;
  passed: number;
  warnings: number;
  errors: number;
  score: number; // 0-100
  violations: RuleViolation[];
}

export interface DesignAuditReport {
  url: string;
  timestamp: string;
  overallScore: number;
  vercelAudit: AuditResult;
  fluentAudit: AuditResult;
  tasteAudit: AuditResult;
  combinedViolations: RuleViolation[];
  topIssues: string[];
  improvementPlan: string[];
}

// ─── Vercel Web Interface Guidelines ──────────────────────────────────────────

export const VERCEL_RULES: DesignRule[] = [
  // Accessibility
  {
    id: "vercel-a11y-icon-btn",
    source: "vercel",
    category: "accessibility",
    severity: "error",
    title: "Icon buttons need aria-label",
    description: "Buttons that contain only an icon must have an aria-label for screen readers",
    fix: 'Add aria-label="Descriptive label" to icon-only buttons',
    antiPattern: "<button> without aria-label containing only SVG/icon children",
    weight: 9,
    tags: ["aria", "icon", "button", "screen-reader"],
  },
  {
    id: "vercel-a11y-form-label",
    source: "vercel",
    category: "accessibility",
    severity: "error",
    title: "Form controls need labels",
    description: "Every form control must have an associated <label> or aria-label",
    fix: "Use <label htmlFor={id}> or aria-label on the input",
    weight: 9,
    tags: ["form", "label", "input", "aria"],
  },
  {
    id: "vercel-a11y-keyboard",
    source: "vercel",
    category: "accessibility",
    severity: "error",
    title: "Interactive elements need keyboard handlers",
    description: "All interactive elements must have onKeyDown/onKeyUp handlers",
    fix: "Add onKeyDown handler or use a native <button>/<a> element",
    weight: 8,
    tags: ["keyboard", "interactive", "a11y"],
  },
  {
    id: "vercel-a11y-semantic-html",
    source: "vercel",
    category: "accessibility",
    severity: "error",
    title: "Use semantic HTML before ARIA",
    description: "Prefer <button>, <a>, <label>, <table> over ARIA roles on divs",
    fix: "Replace <div onClick> with <button>, <div onClick=navigate> with <a>",
    antiPattern: "<div> or <span> with onClick handlers",
    weight: 8,
    tags: ["semantic", "html", "button", "link"],
  },
  {
    id: "vercel-a11y-headings",
    source: "vercel",
    category: "accessibility",
    severity: "warning",
    title: "Headings must be hierarchical",
    description: "Use headings h1-h6 in order without skipping levels",
    fix: "Ensure h1→h2→h3 order, include skip link for main content",
    weight: 6,
    tags: ["headings", "hierarchy", "navigation"],
  },
  {
    id: "vercel-a11y-alt-text",
    source: "vercel",
    category: "accessibility",
    severity: "error",
    title: "Images need alt text",
    description: "All images must have alt (or alt=\"\" if decorative)",
    fix: 'Add alt="description" to meaningful images, alt="" to decorative ones',
    weight: 9,
    tags: ["image", "alt", "accessibility"],
  },
  {
    id: "vercel-a11y-aria-live",
    source: "vercel",
    category: "accessibility",
    severity: "warning",
    title: "Async updates need aria-live",
    description: "Toasts, validation messages, and dynamic content need aria-live=\"polite\"",
    fix: 'Add aria-live="polite" to containers with dynamic content updates',
    weight: 6,
    tags: ["aria-live", "dynamic", "toast", "validation"],
  },
  // Focus
  {
    id: "vercel-focus-visible",
    source: "vercel",
    category: "focus",
    severity: "error",
    title: "Visible focus states required",
    description: "Interactive elements need visible focus: focus-visible:ring or equivalent",
    fix: "Add focus-visible:ring-2 or outline styles, never use outline:none alone",
    antiPattern: "outline: none or outline-none without focus-visible replacement",
    weight: 9,
    tags: ["focus", "outline", "ring", "visible"],
  },
  // Forms
  {
    id: "vercel-form-autocomplete",
    source: "vercel",
    category: "forms",
    severity: "warning",
    title: "Inputs need autocomplete",
    description: "Form inputs need autocomplete attribute and meaningful name",
    fix: 'Add autoComplete="email", "name", etc. and name="fieldName"',
    weight: 5,
    tags: ["form", "autocomplete", "name"],
  },
  {
    id: "vercel-form-correct-type",
    source: "vercel",
    category: "forms",
    severity: "warning",
    title: "Use correct input types",
    description: "Use type=email, tel, url, number and appropriate inputmode",
    fix: "Set type and inputMode appropriately for each input field",
    weight: 5,
    tags: ["form", "type", "input", "email"],
  },
  {
    id: "vercel-form-no-paste-block",
    source: "vercel",
    category: "forms",
    severity: "error",
    title: "Never block paste",
    description: "Do not use onPaste with preventDefault — users must be able to paste",
    fix: "Remove onPaste preventDefault or allow paste in password/OTP fields only",
    weight: 8,
    tags: ["form", "paste", "clipboard"],
  },
  {
    id: "vercel-form-submit-spinner",
    source: "vercel",
    category: "forms",
    severity: "warning",
    title: "Submit button needs loading state",
    description: "Submit button stays enabled until request starts; show spinner during request",
    fix: "Disable button and show loading indicator during form submission",
    weight: 6,
    tags: ["form", "submit", "loading", "spinner"],
  },
  {
    id: "vercel-form-errors-inline",
    source: "vercel",
    category: "forms",
    severity: "warning",
    title: "Errors inline next to fields",
    description: "Validation errors should appear next to the relevant field, focus first error",
    fix: "Show error messages adjacent to the field that has the error",
    weight: 6,
    tags: ["form", "error", "validation", "inline"],
  },
  // Animation
  {
    id: "vercel-motion-reduced",
    source: "vercel",
    category: "animation",
    severity: "error",
    title: "Honor prefers-reduced-motion",
    description: "All animations must provide a reduced variant or disable under prefers-reduced-motion",
    fix: "Add @media (prefers-reduced-motion: reduce) { animation: none; transition: none; }",
    weight: 8,
    tags: ["animation", "reduced-motion", "a11y"],
  },
  {
    id: "vercel-motion-compositor",
    source: "vercel",
    category: "animation",
    severity: "warning",
    title: "Animate transform/opacity only",
    description: "Use only transform and opacity for animations (compositor-friendly)",
    fix: "Replace width/top/left animations with transform: translateX/scale etc.",
    antiPattern: "transition: all or animating layout properties",
    weight: 7,
    tags: ["animation", "performance", "compositor", "transform"],
  },
  {
    id: "vercel-motion-no-transition-all",
    source: "vercel",
    category: "animation",
    severity: "error",
    title: "Never use transition: all",
    description: "Always list transition properties explicitly",
    fix: "Replace transition: all with transition: transform 200ms ease, opacity 150ms ease",
    antiPattern: "transition: all",
    weight: 8,
    tags: ["animation", "transition", "performance"],
  },
  // Typography
  {
    id: "vercel-type-ellipsis",
    source: "vercel",
    category: "typography",
    severity: "info",
    title: "Use proper ellipsis character",
    description: "Use … (U+2026) not three dots ...",
    fix: "Replace ... with …",
    weight: 3,
    tags: ["typography", "ellipsis", "punctuation"],
  },
  {
    id: "vercel-type-curly-quotes",
    source: "vercel",
    category: "typography",
    severity: "info",
    title: "Use curly quotes",
    description: "Use curly quotes \u201C\u201D not straight quotes \"",
    fix: "Replace straight quotes with curly quotes in UI text",
    weight: 3,
    tags: ["typography", "quotes", "punctuation"],
  },
  {
    id: "vercel-type-tabular-nums",
    source: "vercel",
    category: "typography",
    severity: "warning",
    title: "Tabular numbers for data",
    description: "Use font-variant-numeric: tabular-nums for number columns and comparisons",
    fix: "Add font-variant-numeric: tabular-nums to number-heavy content",
    weight: 5,
    tags: ["typography", "numbers", "tabular"],
  },
  {
    id: "vercel-type-balance",
    source: "vercel",
    category: "typography",
    severity: "warning",
    title: "Balance headings",
    description: "Use text-wrap: balance or text-pretty on headings to prevent widows",
    fix: 'Add text-wrap: balance to headings and text-pretty to paragraphs',
    weight: 5,
    tags: ["typography", "balance", "heading", "widow"],
  },
  // Content
  {
    id: "vercel-content-truncate",
    source: "vercel",
    category: "content",
    severity: "warning",
    title: "Handle long text",
    description: "Text containers must handle long content: truncate, line-clamp, or break-words",
    fix: "Add truncate, line-clamp-*, or break-words to text containers",
    weight: 5,
    tags: ["text", "truncate", "overflow", "long-content"],
  },
  {
    id: "vercel-content-empty",
    source: "vercel",
    category: "content",
    severity: "warning",
    title: "Handle empty states",
    description: "Don't render broken UI for empty strings or arrays",
    fix: "Add empty state UI: 'No results found', 'Nothing here yet'",
    weight: 6,
    tags: ["empty-state", "content", "ux"],
  },
  // Images
  {
    id: "vercel-img-dimensions",
    source: "vercel",
    category: "images",
    severity: "error",
    title: "Images need dimensions",
    description: "<img> must have explicit width and height to prevent CLS",
    fix: 'Add width and height attributes to <img> elements',
    weight: 8,
    tags: ["image", "cls", "width", "height"],
  },
  {
    id: "vercel-img-lazy",
    source: "vercel",
    category: "images",
    severity: "warning",
    title: "Lazy-load below-fold images",
    description: "Below-fold images should have loading=\"lazy\"",
    fix: 'Add loading="lazy" to images below the fold',
    weight: 6,
    tags: ["image", "lazy", "performance"],
  },
  // Performance
  {
    id: "vercel-perf-virtualize",
    source: "vercel",
    category: "performance",
    severity: "error",
    title: "Virtualize large lists",
    description: "Lists with >50 items must be virtualized",
    fix: "Use content-visibility: auto or a virtualization library for long lists",
    weight: 8,
    tags: ["performance", "list", "virtualization", "rendering"],
  },
  {
    id: "vercel-perf-no-layout-read",
    source: "vercel",
    category: "performance",
    severity: "warning",
    title: "Avoid layout reads in render",
    description: "Don't call getBoundingClientRect, offsetHeight, etc. in render",
    fix: "Move layout reads to useEffect or use useLayoutEffect with batching",
    weight: 7,
    tags: ["performance", "layout", "reflow", "render"],
  },
  // Navigation & State
  {
    id: "vercel-nav-url-state",
    source: "vercel",
    category: "navigation",
    severity: "warning",
    title: "URL should reflect state",
    description: "Filters, tabs, pagination, expanded panels should be in query params",
    fix: "Sync UI state to URL search params for deep linking",
    weight: 6,
    tags: ["navigation", "url", "state", "deep-link"],
  },
  {
    id: "vercel-nav-link-element",
    source: "vercel",
    category: "navigation",
    severity: "error",
    title: "Use <a>/<Link> for navigation",
    description: "Links must use <a> or <Link> for Cmd+click, middle-click support",
    fix: "Replace <div onClick=navigate> with <a href>",
    antiPattern: "Inline onClick navigation without <a>",
    weight: 8,
    tags: ["navigation", "link", "anchor"],
  },
  {
    id: "vercel-nav-destructive",
    source: "vercel",
    category: "navigation",
    severity: "warning",
    title: "Confirm destructive actions",
    description: "Destructive actions need confirmation modal or undo window",
    fix: "Add confirmation dialog before delete/remove actions",
    weight: 7,
    tags: ["destructive", "confirmation", "undo"],
  },
  // Touch & Interaction
  {
    id: "vercel-touch-manipulation",
    source: "vercel",
    category: "touch",
    severity: "warning",
    title: "Prevent double-tap zoom",
    description: "Add touch-action: manipulation to interactive areas",
    fix: "Add touch-action: manipulation to prevent 300ms delay",
    weight: 5,
    tags: ["touch", "mobile", "zoom", "delay"],
  },
  {
    id: "vercel-touch-overscroll",
    source: "vercel",
    category: "touch",
    severity: "warning",
    title: "Contain overscroll in modals",
    description: "Modals, drawers, and sheets need overscroll-behavior: contain",
    fix: 'Add overscroll-behavior: contain to scrollable containers',
    weight: 5,
    tags: ["overscroll", "modal", "drawer"],
  },
  // Dark Mode
  {
    id: "vercel-dark-color-scheme",
    source: "vercel",
    category: "dark-mode",
    severity: "warning",
    title: "Set color-scheme meta",
    description: "Dark themes need color-scheme: dark on <html> for native elements",
    fix: 'Add <meta name="color-scheme" content="dark"> or CSS color-scheme: dark',
    weight: 5,
    tags: ["dark-mode", "color-scheme", "theme"],
  },
  // i18n
  {
    id: "vercel-i18n-date-format",
    source: "vercel",
    category: "i18n",
    severity: "warning",
    title: "Use Intl for dates/numbers",
    description: "Use Intl.DateTimeFormat and Intl.NumberFormat, not hardcoded formats",
    fix: 'Replace "12/31/2024" with new Intl.DateTimeFormat().format(date)',
    weight: 5,
    tags: ["i18n", "date", "number", "format", "locale"],
  },
  // Copy
  {
    id: "vercel-copy-active-voice",
    source: "vercel",
    category: "copy",
    severity: "info",
    title: "Use active voice",
    description: 'Write "Install the CLI" not "The CLI will be installed"',
    fix: "Rewrite passive voice to active voice in all UI text",
    weight: 4,
    tags: ["copy", "voice", "writing"],
  },
  {
    id: "vercel-copy-title-case",
    source: "vercel",
    category: "copy",
    severity: "info",
    title: "Title Case for headings/buttons",
    description: "Use Title Case for headings and buttons (Chicago style)",
    fix: "Capitalize major words in headings and button labels",
    weight: 3,
    tags: ["copy", "title-case", "heading"],
  },
  {
    id: "vercel-copy-specific",
    source: "vercel",
    category: "copy",
    severity: "info",
    title: "Specific button labels",
    description: 'Use "Save API Key" not "Continue" — be specific about actions',
    fix: "Replace generic button labels with specific action descriptions",
    weight: 5,
    tags: ["copy", "button", "label", "specific"],
  },
  // Anti-patterns
  {
    id: "vercel-anti-zoom-disable",
    source: "vercel",
    category: "accessibility",
    severity: "error",
    title: "Never disable zoom",
    description: "user-scalable=no or maximum-scale=1 must never be used",
    fix: "Remove user-scalable=no and maximum-scale=1 from viewport meta",
    antiPattern: 'user-scalable=no, maximum-scale=1',
    weight: 10,
    tags: ["zoom", "accessibility", "viewport"],
  },
];

// ─── Microsoft Fluent 2 Design System ─────────────────────────────────────────

export const FLUENT_RULES: DesignRule[] = [
  // Spacing & Layout
  {
    id: "fluent-spacing-base-unit",
    source: "fluent",
    category: "spacing",
    severity: "warning",
    title: "Use 4px base unit spacing",
    description: "Fluent uses a 4px base unit: 0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 48, 52, 56px",
    fix: "Align all spacing to the 4px grid ramp (4, 8, 12, 16, 20, 24, 32, 40, 48)",
    weight: 6,
    tags: ["spacing", "grid", "base-unit", "4px"],
  },
  {
    id: "fluent-spacing-proximity",
    source: "fluent",
    category: "spacing",
    severity: "warning",
    title: "Proximity implies relationship",
    description: "Elements close together are perceived as related; space separates unrelated elements",
    fix: "Group related elements with tight spacing (4-8px), separate groups with larger gaps (16-24px)",
    weight: 7,
    tags: ["spacing", "proximity", "grouping", "relationship"],
  },
  {
    id: "fluent-spacing-hierarchy",
    source: "fluent",
    category: "spacing",
    severity: "warning",
    title: "Space creates visual hierarchy",
    description: "More space around an element makes it appear more important",
    fix: "Add more whitespace around important elements to draw focus",
    weight: 7,
    tags: ["spacing", "hierarchy", "whitespace", "focus"],
  },
  // Grid
  {
    id: "fluent-grid-12col",
    source: "fluent",
    category: "grid",
    severity: "info",
    title: "Use 12-column grid",
    description: "Fluent recommends a 12-column grid for flexible layout division",
    fix: "Use CSS Grid with grid-template-columns: repeat(12, 1fr) or Tailwind grid-cols-12",
    weight: 5,
    tags: ["grid", "columns", "layout"],
  },
  {
    id: "fluent-grid-gutters",
    source: "fluent",
    category: "grid",
    severity: "info",
    title: "Gutters must be multiples of base unit",
    description: "Grid gutters should be multiples of 4px and adapt at breakpoints",
    fix: "Use 16px gutters for desktop, 8-12px for mobile",
    weight: 4,
    tags: ["grid", "gutters", "responsive"],
  },
  // Responsive Breakpoints
  {
    id: "fluent-responsive-breakpoints",
    source: "fluent",
    category: "responsive",
    severity: "info",
    title: "Use standard breakpoints",
    description: "small(<479), medium(<639), large(<1023), x-large(>1024), xx-large(>1366), xxx-large(>1920)",
    fix: "Define media queries at these breakpoints for consistent behavior",
    weight: 5,
    tags: ["responsive", "breakpoints", "mobile", "desktop"],
  },
  // Design Principles
  {
    id: "fluent-principle-natural",
    source: "fluent",
    category: "visual-hierarchy",
    severity: "info",
    title: "Design should feel natural",
    description: "Experiences should adapt to the device and build on familiar patterns",
    fix: "Use platform-native patterns and familiar UI conventions",
    weight: 6,
    tags: ["principle", "natural", "familiar", "platform"],
  },
  {
    id: "fluent-principle-focus",
    source: "fluent",
    category: "visual-hierarchy",
    severity: "warning",
    title: "Built for focus — reduce clutter",
    description: "Less visual clutter keeps people centered, calm, and confident",
    fix: "Remove unnecessary decorative elements, reduce cognitive load",
    weight: 7,
    tags: ["principle", "focus", "clutter", "simplicity"],
  },
  {
    id: "fluent-principle-inclusive",
    source: "fluent",
    category: "accessibility",
    severity: "warning",
    title: "Inclusive by design",
    description: "Consider a range of perspectives and abilities from the start",
    fix: "Design for screen readers, keyboard navigation, high contrast, and reduced motion",
    weight: 7,
    tags: ["inclusion", "accessibility", "diversity"],
  },
  // Touch Targets
  {
    id: "fluent-touch-targets",
    source: "fluent",
    category: "touch",
    severity: "error",
    title: "Minimum touch targets: 44x44px (web/iOS), 48x48px (Android)",
    description: "Interactive elements must meet minimum touch target sizes",
    fix: "Ensure all clickable/tappable elements are at least 44x44px on web",
    weight: 8,
    tags: ["touch", "target", "size", "mobile", "tap"],
  },
  // Color & Contrast
  {
    id: "fluent-color-brand",
    source: "fluent",
    category: "color",
    severity: "info",
    title: "Brand color with restraint",
    description: "Use brand colors for emphasis and action, neutral colors for backgrounds and text",
    fix: "Use brand color for CTAs and highlights, neutral grays for surfaces and body text",
    weight: 5,
    tags: ["color", "brand", "emphasis", "neutral"],
  },
  {
    id: "fluent-color-text-contrast",
    source: "fluent",
    category: "color",
    severity: "error",
    title: "Text must meet contrast ratios",
    description: "Normal text: 4.5:1, Large text (18px+ bold or 24px+): 3:1",
    fix: "Increase contrast ratio to meet WCAG AA minimums",
    weight: 9,
    tags: ["color", "contrast", "text", "wcag"],
  },
  // Typography
  {
    id: "fluent-type-ramp",
    source: "fluent",
    category: "typography",
    severity: "info",
    title: "Use consistent type scale",
    description: "Fluent type ramp: 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 64, 68px",
    fix: "Use font sizes from the type scale, not arbitrary values",
    weight: 5,
    tags: ["typography", "scale", "font-size"],
  },
  // Alignment
  {
    id: "fluent-alignment-consistent",
    source: "fluent",
    category: "layout",
    severity: "warning",
    title: "Consistent alignment",
    description: "Objects align centrally, text aligns left. Maintain consistent horizontal rhythm",
    fix: "Left-align body text, center icons/images within containers",
    weight: 6,
    tags: ["alignment", "left-align", "center", "consistency"],
  },
];

// ─── TasteSkill Anti-Slop Rules ───────────────────────────────────────────────

export const TASTESKILL_RULES: DesignRule[] = [
  // Anti-slop core
  {
    id: "taste-no-generic",
    source: "tasteskill",
    category: "anti-slop",
    severity: "error",
    title: "No generic templated UI",
    description: "Interfaces must not look like generic Bootstrap/Tailwind templates",
    fix: "Add unique visual personality: custom colors, distinctive typography, original layout patterns",
    weight: 9,
    tags: ["anti-slop", "generic", "template", "personality"],
  },
  {
    id: "taste-brief-inference",
    source: "tasteskill",
    category: "anti-slop",
    severity: "warning",
    title: "Design must match context",
    description: "Design direction should be inferred from industry, audience, mood, and purpose",
    fix: "Consider what industry/faudience the site serves before choosing visual style",
    weight: 7,
    tags: ["context", "industry", "audience", "inference"],
  },
  {
    id: "taste-design-system",
    source: "tasteskill",
    category: "anti-slop",
    severity: "warning",
    title: "Use appropriate design system",
    description: "Choose between Material, Fluent, Carbon, Polaris, Atlassian, Radix, shadcn based on context",
    fix: "Select the most appropriate design system or create a custom one for the project",
    weight: 6,
    tags: ["design-system", "context", "appropriate"],
  },
  // Visual Quality
  {
    id: "taste-visual-depth",
    source: "tasteskill",
    category: "visual-hierarchy",
    severity: "warning",
    title: "Create visual depth and layers",
    description: "Use elevation, shadows, gradients, and z-index to create depth",
    fix: "Add subtle box-shadows, gradient overlays, and layered backgrounds",
    weight: 7,
    tags: ["depth", "shadow", "layers", "elevation"],
  },
  {
    id: "taste-motion-direction",
    source: "tasteskill",
    category: "motion",
    severity: "warning",
    title: "Intentional motion and direction",
    description: "Animations should have purpose: enter from source, exit to destination",
    fix: "Elements entering from bottom-right, cards sliding in, modals fading with scale",
    weight: 6,
    tags: ["motion", "animation", "direction", "intentional"],
  },
  {
    id: "taste-dark-mode-default",
    source: "tasteskill",
    category: "dark-mode",
    severity: "info",
    title: "Support dark mode by default",
    description: "Dual-mode interfaces with contrast and hierarchy parity across themes",
    fix: "Implement dark mode with matching visual weight and hierarchy as light mode",
    weight: 6,
    tags: ["dark-mode", "theme", "dual-mode", "parity"],
  },
  // Layout
  {
    id: "taste-asymmetric-layout",
    source: "tasteskill",
    category: "layout",
    severity: "info",
    title: "Break the grid intentionally",
    description: "Avoid perfectly symmetric layouts — use offset grids and asymmetric compositions",
    fix: "Offset hero text, use asymmetric image placements, break regularity",
    weight: 6,
    tags: ["layout", "asymmetric", "grid-break", "composition"],
  },
  {
    id: "taste-white-space",
    source: "tasteskill",
    category: "spacing",
    severity: "warning",
    title: "Generous whitespace",
    description: "Ample whitespace creates premium feel and visual clarity",
    fix: "Increase padding and margins, let content breathe, avoid cramped layouts",
    weight: 7,
    tags: ["whitespace", "spacing", "premium", "breathe"],
  },
  // Typography
  {
    id: "taste-typography-personality",
    source: "tasteskill",
    category: "typography",
    severity: "warning",
    title: "Typography must have personality",
    description: "Use distinctive font pairings, not default system fonts",
    fix: "Choose a display font + body font pairing that matches the brand personality",
    weight: 7,
    tags: ["typography", "font", "personality", "pairing"],
  },
  {
    id: "taste-typography-hierarchy",
    source: "tasteskill",
    category: "typography",
    severity: "warning",
    title: "Strong typographic hierarchy",
    description: "Clear distinction between headings, subheadings, body, and captions",
    fix: "Use size, weight, and color to create clear 3-4 level text hierarchy",
    weight: 7,
    tags: ["typography", "hierarchy", "size", "weight"],
  },
  // Color
  {
    id: "taste-color-intentional",
    source: "tasteskill",
    category: "color",
    severity: "warning",
    title: "Color palette must be intentional",
    description: "Every color should serve a purpose: brand, action, state, or information",
    fix: "Define a limited palette (3-5 colors) with clear roles for each",
    weight: 7,
    tags: ["color", "palette", "intentional", "purpose"],
  },
  {
    id: "taste-color-restraint",
    source: "tasteskill",
    category: "color",
    severity: "info",
    title: "Restrained color usage",
    description: "Use color sparingly for emphasis; let neutral tones carry most of the UI",
    fix: "Limit bright colors to CTAs and key highlights, use grays for everything else",
    weight: 6,
    tags: ["color", "restraint", "emphasis", "neutral"],
  },
  // Components
  {
    id: "taste-component-unique",
    source: "tasteskill",
    category: "anti-slop",
    severity: "warning",
    title: "Components should feel custom",
    description: "Buttons, cards, inputs should have unique styling, not stock appearance",
    fix: "Customize component borders, padding, transitions, and states beyond defaults",
    weight: 6,
    tags: ["component", "custom", "unique", "styling"],
  },
  {
    id: "taste-redesign-audit-first",
    source: "tasteskill",
    category: "anti-slop",
    severity: "warning",
    title: "Audit before redesign",
    description: "On existing projects, always audit current state before making changes",
    fix: "Run a full design audit before suggesting visual changes",
    weight: 5,
    tags: ["audit", "redesign", "existing", "review"],
  },
  // Pre-flight
  {
    id: "taste-preflight-complete",
    source: "tasteskill",
    category: "anti-slop",
    severity: "error",
    title: "All pre-flight checks must pass",
    description: "Every checkbox must honestly pass before shipping: no placeholders, no half-finished sections",
    fix: "Remove all TODO placeholders, lorem ipsum, and incomplete components before shipping",
    weight: 10,
    tags: ["preflight", "complete", "placeholder", "shipping"],
  },
];

// ─── All Rules Combined ───────────────────────────────────────────────────────

export const ALL_RULES: DesignRule[] = [...VERCEL_RULES, ...FLUENT_RULES, ...TASTESKILL_RULES];

export const RULES_BY_SOURCE: Record<GuidelineSource, DesignRule[]> = {
  vercel: VERCEL_RULES,
  fluent: FLUENT_RULES,
  tasteskill: TASTESKILL_RULES,
};

export const RULES_BY_CATEGORY: Partial<Record<RuleCategory, DesignRule[]>> = {};
for (const rule of ALL_RULES) {
  if (!RULES_BY_CATEGORY[rule.category]) RULES_BY_CATEGORY[rule.category] = [];
  RULES_BY_CATEGORY[rule.category]!.push(rule);
}

// ─── Spacing Ramp (Fluent 4px grid) ──────────────────────────────────────────

export const FLUENT_SPACING_RAMP = [
  0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 48, 52, 56,
] as const;

/** Check if a pixel value falls on the Fluent 4px spacing grid */
export function isOnSpacingGrid(px: number, tolerance = 2): boolean {
  return FLUENT_SPACING_RAMP.some(v => Math.abs(v - px) <= tolerance);
}

// ─── Fluent Breakpoints ───────────────────────────────────────────────────────

export const FLUENT_BREAKPOINTS = {
  small: { min: 0, max: 479 },
  medium: { min: 480, max: 639 },
  large: { min: 640, max: 1023 },
  xLarge: { min: 1024, max: 1365 },
  xxLarge: { min: 1366, max: 1919 },
  xxxLarge: { min: 1920, max: Infinity },
} as const;

// ─── Vercel Type Scale ────────────────────────────────────────────────────────

export const VERCEL_COPY_RULES = {
  activeVoice: true,
  titleCase: true,
  specificLabels: true,
  numeralCounts: true,
  secondPerson: true,
  ampersand: true,
} as const;

// ─── WCAG Contrast Ratios ────────────────────────────────────────────────────

export const WCAG_CONTRAST = {
  normalText: 4.5,
  largeText: 3.0, // 18px+ bold or 24px+ regular
  nonText: 3.0,   // UI components, graphical objects
} as const;

// ─── Touch Target Sizes ──────────────────────────────────────────────────────

export const TOUCH_TARGETS = {
  web: 44,
  ios: 44,
  android: 48,
} as const;
