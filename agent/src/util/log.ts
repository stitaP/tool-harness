import { appendFileSync, statSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { redact } from "./redact.js";

export type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  private dir: string | null = null;
  level: Level = "info";
  echo = false;

  init(home: string): void { this.dir = join(home, "logs"); }

  private write(file: string, line: string): void {
    if (!this.dir) return;
    const p = join(this.dir, file);
    try {
      if (existsSync(p) && statSync(p).size > 10 * 1024 * 1024) renameSync(p, p + ".1");
      appendFileSync(p, line + "\n");
    } catch { /* logging must never crash the agent */ }
  }

  log(level: Level, msg: string, meta?: Record<string, any>): void {
    if (ORDER[level] < ORDER[this.level]) return;
    const line = redact(`${new Date().toISOString()} ${level.toUpperCase()} ${msg}${meta ? " " + JSON.stringify(meta) : ""}`);
    this.write("agent.log", line);
    if (ORDER[level] >= ORDER.warn) this.write("errors.log", line);
    if (this.echo) process.stderr.write(line + "\n");
  }
  debug(m: string, meta?: any) { this.log("debug", m, meta); }
  info(m: string, meta?: any) { this.log("info", m, meta); }
  warn(m: string, meta?: any) { this.log("warn", m, meta); }
  error(m: string, meta?: any) { this.log("error", m, meta); }
}

export const log = new Logger();
