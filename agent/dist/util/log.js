import { appendFileSync, statSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { redact } from "./redact.js";
const ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
export class Logger {
    dir = null;
    level = "info";
    echo = false;
    init(home) { this.dir = join(home, "logs"); }
    write(file, line) {
        if (!this.dir)
            return;
        const p = join(this.dir, file);
        try {
            if (existsSync(p) && statSync(p).size > 10 * 1024 * 1024)
                renameSync(p, p + ".1");
            appendFileSync(p, line + "\n");
        }
        catch { /* logging must never crash the agent */ }
    }
    log(level, msg, meta) {
        if (ORDER[level] < ORDER[this.level])
            return;
        const line = redact(`${new Date().toISOString()} ${level.toUpperCase()} ${msg}${meta ? " " + JSON.stringify(meta) : ""}`);
        this.write("agent.log", line);
        if (ORDER[level] >= ORDER.warn)
            this.write("errors.log", line);
        if (this.echo)
            process.stderr.write(line + "\n");
    }
    debug(m, meta) { this.log("debug", m, meta); }
    info(m, meta) { this.log("info", m, meta); }
    warn(m, meta) { this.log("warn", m, meta); }
    error(m, meta) { this.log("error", m, meta); }
}
export const log = new Logger();
