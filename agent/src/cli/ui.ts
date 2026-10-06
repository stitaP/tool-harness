/** Terminal rendering helpers (ANSI colors, respecting NO_COLOR / non-TTY). */
const on = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
export const dim = c("2"), bold = c("1"), red = c("31"), green = c("32"), yellow = c("33"), blue = c("34"), magenta = c("35"), cyan = c("36"), gray = c("90");

export function toolLine(name: string, args: any): string {
  let a = "";
  if (args && typeof args === "object") {
    const main = args.command ?? args.path ?? args.query ?? args.url ?? args.name ?? args.goal ?? args.action ?? "";
    a = typeof main === "string" ? main : JSON.stringify(main);
    if (!a) a = JSON.stringify(args);
  }
  return `${cyan("⚙")} ${bold(name)} ${gray(a.replace(/\s+/g, " ").slice(0, 160))}`;
}

export function indent(s: string, pre = "  │ "): string {
  return s.split("\n").map((l) => gray(pre) + l).join("\n");
}

export const BANNER = `${cyan("stitaP")} ${dim("agent")} — type a task, ${bold("/help")} for commands, ${bold("Ctrl+C")} to interrupt, ${bold("/quit")} to exit`;
