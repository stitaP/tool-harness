/**
 * Native reader for legacy Excel workbooks (.xls): BIFF8 (Excel 97–2003) and BIFF5/BIFF7 (Excel 5.0/95), following
 * [MS-XLS]. Pure TypeScript, Node built-ins only. Output matches the .xlsx conversion in office.ts: one `## <Sheet>`
 * section per sheet in workbook order with a Markdown table (first row as header).
 *
 * Layout: the "Workbook" (BIFF8) or "Book" (BIFF5) stream inside a Compound File is a sequence of records
 * [type u16][size u16][data]. It starts with the workbook-globals substream (BOF … EOF: shared strings, formats, XFs,
 * BOUNDSHEET entries pointing at each sheet's BOF), followed by one substream per sheet holding the cell records.
 */
export interface XlsOptions {
    sheets?: string[];
    maxRows?: number;
}
export declare function xlsToMarkdown(buf: Buffer, opts?: XlsOptions): {
    markdown: string;
    warnings: string[];
};
