---
name: office-to-markdown
description: Convert Word/Excel/PowerPoint files or folders to Markdown with office_to_markdown. Use when given an Office document to read, summarize, or convert.
version: 1.0.0
---

# Office documents to Markdown

## 1. Convert
- One file, read the result directly:
  `office_to_markdown path="~/Documents/report.docx"`
- One file, save to a .md file:
  `office_to_markdown path="~/Documents/report.docx" output="~/Documents/md/report.md"` (`output` = a `.md` file for one input, a folder for a folder input)
- Whole folder (supported files directly inside; subfolders are NOT included — convert each subfolder separately):
  `office_to_markdown path="~/Documents/contracts" output="~/Documents/contracts-md"`
  Always give `output` for folders — otherwise the combined text can be too long for your context.
- Supported, all built in (nothing to install, every OS): `.docx .xlsx .pptx .odt .ods .odp` and legacy `.doc .xls .ppt .rtf`.

## 2. Spreadsheets
- Large workbook: first convert with a small `max_rows` (e.g. `max_rows=20`) to see sheet names and headers.
- Then pick sheets (a list): `office_to_markdown path="sales.xlsx" sheets=["Q1","Q2"] max_rows=2000 output="md/sales.md"`. Default `max_rows` is 500; extra rows are truncated.
- Each sheet becomes a `## <sheet>` section with a Markdown table. Formulas appear as their last saved values.
- For real analysis (sums, pivots, charts) on big data, prefer CSV: see step 5, then skill `csv-analysis`.

## 3. Presentations
- `office_to_markdown path="deck.pptx"` → one section per slide; speaker notes are included by default (`include_notes=false` to drop them).
- Use notes when the user wants "what the presenter says", a script, or a fuller summary.

## 4. Legacy formats
- `.doc` `.xls` `.ppt` `.rtf` (Office 97–2003, and Excel 95 / Word 6) are read natively — same call, nothing to install.
- The real type is detected from the file contents, so an RTF saved as `.doc` or a `.docx` renamed `.doc` still converts (a warning says so).
- Password-protected files (any format) cannot be read: ask the user to remove the password and save again.
- Word 2.x and fast-saved Word 95 files are not supported: ask the user to "Save As" .docx.

## 5. Typical follow-ups
- **Summarize**: read the Markdown (`read_file` on the output file), then give: purpose, key points, numbers, decisions, open questions. Cite section/slide/sheet names.
- **Action items**: load skill `document-to-action-items`.
- **Tables to CSV**: convert the sheet/table to Markdown, then write a CSV with `write_file` (header row + rows, quote fields containing commas). For spreadsheets with many rows, use `execute_code` or `terminal` (e.g. Python `openpyxl`/`pandas`) instead of copying by hand.
- **Knowledge base / search**: convert the folder with `output`, keep the folder structure, then index or grep the `.md` files (`terminal`: `grep -ril "keyword" contracts-md/`).
- **Compare two versions**: convert both, then `terminal`: `diff -u old.md new.md`.

## Pitfalls
- Password-protected or encrypted files are not supported: ask the user for an unprotected copy.
- Images, charts, and SmartArt become placeholders (e.g. `![image]`); their content is not read. If the user needs it, export slides/pages as images and use `vision_analyze`.
- Tracked changes / comments may be dropped; mention it if the document is a draft under review.
- Merged cells and multi-row headers flatten imperfectly — check headers before using numbers.
- Very wide sheets make huge tables: filter with `sheets` and `max_rows`, or go to CSV.
- Paths with `~` or spaces: pass them quoted, as one string.

## Done when
- [ ] Every requested file converted (list any that failed and why).
- [ ] Output location stated (or content shown if small).
- [ ] Follow-up done (summary / CSV / index) with references to sheet, slide, or section names.
