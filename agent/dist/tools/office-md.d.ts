/** Markdown helpers shared by the Office converters (office.ts and the legacy .doc/.xls/.ppt/.rtf readers). */
export declare const cellEsc: (s: string) => string;
/** GitHub Markdown table; the first row is the header. */
export declare function mdTable(rows: string[][]): string;
