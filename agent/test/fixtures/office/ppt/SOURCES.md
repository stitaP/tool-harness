# .ppt fixtures

All files are unmodified copies of Apache POI test data
(https://github.com/apache/poi/tree/trunk/test-data/slideshow, fetched 2026-10-04 from
`https://raw.githubusercontent.com/apache/poi/trunk/test-data/slideshow/<name>`).
License: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0), © The Apache Software Foundation.

| File | Used for |
| --- | --- |
| basic_test_ppt_file.ppt | 2 slides, titles + body, speaker notes; three incremental saves (UserEditAtom chain with several persist directories) |
| incorrect_slide_order.ppt | presentation order differs from creation order (slide list order, not record order) |
| bug-41015.ppt | body paragraphs with indent levels 0 and 1 (nested bullets) |
| text_shapes.ppt | text that lives only in the slide drawing (text box, rectangle, ellipse, octagon) |
| 54880_chinese.ppt | non-ASCII text: Japanese, half-width katakana, a non-BMP CJK character (U+20B9F) |
| 54111.ppt | an OfficeArt table (header row + 5 rows × 4 columns) |
| Password_Protected-hello.ppt | encrypted presentation (password "hello"; encrypted CurrentUser token) |

Expected text was taken from POI's own unit tests where available (TestBasic/TestNotesText, TestBugs,
TestTable) and otherwise from manual inspection of the decoded text atoms.
