---
name: csv-analysis
description: Analyze CSV/Excel/JSON data files: profile, clean, aggregate, chart, and report findings. Use when the user provides tabular data or asks data questions.
version: 1.0.0
---

# Tabular data analysis

1. Peek: `read_file` the first ~30 lines (CSV) or check size with the terminal.
2. Prefer `execute_code` (Python with pandas if available — check with `python3 -c "import pandas"`; otherwise use the csv module or JavaScript).
3. Profile: rows, columns, dtypes, missing values, duplicates, value ranges. Report surprises.
4. Answer the question with code; print intermediate numbers you rely on.
5. Charts: save PNGs with matplotlib (if installed) next to the data and mention the path.
6. Write cleaned outputs to NEW files; never overwrite the user's source data unless asked.
7. Final answer: the numbers, a short interpretation, caveats about data quality.
