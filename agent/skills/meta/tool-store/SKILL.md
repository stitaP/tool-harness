---
name: tool-store
description: Use the stitaP Tool Store's deterministic domain tools (finance, math/engineering, graphs, symbolic math, office, fractals, CFD, inference sizing) instead of computing by hand.
version: 1.0.0
---

# Using the Tool Store

The store has deterministic calculators that are more reliable than doing math in your head — especially for small models.

1. `tool_search` with the task in plain words (e.g. "beam deflection", "linear system solve", "symbolic derivative", "chit fund", "EMI").
2. Read the returned params; call `use_tool name="store:<id>" arguments={…}`.
3. If a store tool is catalog-only (no executor), compute with `execute_code` instead.
4. Show the inputs you used and the tool's numeric output in the answer.
