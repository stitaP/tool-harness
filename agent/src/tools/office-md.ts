/** Markdown helpers shared by the Office converters (office.ts and the legacy .doc/.xls/.ppt/.rtf readers). */

export const cellEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim();

/** GitHub Markdown table; the first row is the header. */
export function mdTable(rows: string[][]): string {
  if (!rows.length) return "";
  const w = Math.max(1, ...rows.map((r) => r.length));
  const line = (r: string[]) => "| " + Array.from({ length: w }, (_, k) => cellEsc(r[k] ?? "")).join(" | ") + " |";
  return [line(rows[0]), "| " + Array(w).fill("---").join(" | ") + " |", ...rows.slice(1).map(line)].join("\n");
}
