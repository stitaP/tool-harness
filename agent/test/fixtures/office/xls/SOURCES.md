# .xls fixtures — origin and license

## Generated here (public domain / CC0)

Written with Python `xlwt` 1.3.0 (BIFF8) by `make-xlwt-fixtures.py` in this folder
(`python make-xlwt-fixtures.py <outdir>`). xlwt always stores an "empty" cached formula result, so the script patches
FORMULA records to carry real cached values (number, string + STRING record, boolean, error) the way Excel does.

| File | Contents |
| --- | --- |
| `xlwt-basic.xls` | Sheets Data, Long, Secret (hidden), Big (1200 rows), Offset (data starting at C3), Empty. Unicode strings, RK/MULRK ints and x100 decimals, NUMBER doubles, booleans, date/datetime/time/percent/quoted custom formats, formulas with cached results; a 9100-char ASCII string, a 9600-char Greek (UTF-16) string and 600 more strings so the SST spans 6 CONTINUE records. |
| `xlwt-1904.xls` | DATEMODE = 1904 workbook with dates. |

## Apache POI test data (Apache License 2.0)

From https://github.com/apache/poi/tree/trunk/test-data/spreadsheet (fetched via raw.githubusercontent.com), unmodified
except the renamed fuzz case. Genuine Excel-written files unless noted.

| File | Why |
| --- | --- |
| `SimpleWithFormula.xls` | formula with cached string result (STRING record) |
| `StringFormulas.xls` | string formula result |
| `1904DateWindowing.xls` | 1904 date system, written by Excel |
| `DateFormats.xls` | US/UK built-in and custom date formats |
| `TwoSheetsOneHidden.xls` | hidden sheet |
| `PercentPtg.xls` | formula numbers |
| `SimpleChart.xls` | worksheet with an embedded chart (nested BOF/EOF substream) |
| `44010-SingleChart.xls` | chart sheet + French text, MULRK, SST CONTINUE |
| `testEXCEL_95.xls` | BIFF5 / Excel 95 ("Book" stream, 8-bit strings) |
| `BOOK_in_capitals.xls` | workbook stream named "BOOK" (third-party writer) |
| `password.xls` | encrypted (FILEPASS, RC4) |
| `xor-encryption-abc.xls` | encrypted (FILEPASS, XOR obfuscation) |
| `poi-clusterfuzz-4819588401201152.xls` | OSS-Fuzz minimized crash case (originally `clusterfuzz-testcase-minimized-POIHSSFFuzzer-4819588401201152.xls`) — must error cleanly |
