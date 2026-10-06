# Fixtures for the native .doc / .rtf readers

| File | Source | License |
| --- | --- | --- |
| `textutil-sample.html` | Written for this test suite (headings, bold/italic, nested bullet list, numbered list, link, table). | Same as this repository |
| `textutil-sample.doc` | Generated on macOS from `textutil-sample.html` with `textutil -convert doc` (a genuine Word 97 binary file). Only used to make the fixture; the reader never calls textutil. | Same as this repository |
| `textutil-sample.rtf` | Generated on macOS from `textutil-sample.html` with `textutil -convert rtf` (Cocoa RTF writer). | Same as this repository |
| `word-style.rtf` | Hand-written for this test suite in the style of Word's RTF output (stylesheet with heading styles, list table + overrides, `\info`, `\header`, `\pict`, fields, footnote, table, `\u` / `\'` escapes, `\bin`). | Same as this repository |
| `poi-simple-table.doc` | Apache POI test data, `test-data/document/simple-table.doc` (Word 97 SR2) — https://github.com/apache/poi/tree/trunk/test-data/document | Apache License 2.0 |
| `poi-hyperlink.doc` | Apache POI test data, `test-data/document/hyperlink.doc` | Apache License 2.0 |
| `poi-Lists.doc` | Apache POI test data, `test-data/document/Lists.doc` (heading, bullet / numbered / multi-level lists) | Apache License 2.0 |
| `poi-test-fields.doc` | Apache POI test data, `test-data/document/test-fields.doc` (fields in body, footnote, endnote, header, comment) | Apache License 2.0 |
| `poi-footnote.doc` | Apache POI test data, `test-data/document/footnote.doc` | Apache License 2.0 |
| `poi-innertable.doc` | Apache POI test data, `test-data/document/innertable.doc` (nested table) | Apache License 2.0 |
| `poi-Word6.doc` | Apache POI test data, `test-data/document/Word6.doc` (Word 6.0 / 95 format) | Apache License 2.0 |
| `poi-PasswordProtected.doc` | Apache POI test data, `test-data/document/PasswordProtected.doc` (encrypted; error path) | Apache License 2.0 |
| `tika-testRTF.rtf` | Apache Tika test documents, `tika-parsers/.../tika-parser-microsoft-module/src/test/resources/test-documents/testRTF.rtf` (written by Word) — https://github.com/apache/tika | Apache License 2.0 |
| `tika-testRTFHyperlink.rtf` | Apache Tika test documents, `testRTFHyperlink.rtf` (Word RTF with many HYPERLINK fields) — same folder as above | Apache License 2.0 |
| `tika-testRTFWord2010CzechCharacters.rtf` | Apache Tika test documents, `testRTFWord2010CzechCharacters.rtf` (Word 2010; Czech text in `\fcharset238` fonts) — same folder as above | Apache License 2.0 |
