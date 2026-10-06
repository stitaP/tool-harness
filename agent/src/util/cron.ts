/**
 * 5-field cron expressions (minute hour day-of-month month day-of-week) plus a
 * natural-language front end ("every 15m", "daily at 9:00", "weekdays at 8:30").
 * Evaluated in local time.
 */

type Field = Set<number>;
export interface CronSpec { minute: Field; hour: Field; dom: Field; month: Field; dow: Field; domStar: boolean; dowStar: boolean; source: string }

const NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseField(f: string, min: number, max: number): Field {
  const out = new Set<number>();
  for (const part of f.toLowerCase().split(",")) {
    const [rangeRaw, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad cron step: ${part}`);
    let lo = min, hi = max;
    const val = (x: string) => {
      const n = NAMES[x] ?? Number(x);
      if (!Number.isInteger(n)) throw new Error(`bad cron value: ${x}`);
      return n;
    };
    if (rangeRaw !== "*") {
      const [a, b] = rangeRaw.split("-");
      lo = val(a);
      hi = b !== undefined ? val(b) : stepRaw ? max : lo;
    }
    if (lo < min || hi > max + (max === 6 ? 1 : 0) || lo > hi) throw new Error(`cron value out of range: ${part}`);
    for (let i = lo; i <= hi; i += step) out.add(max === 6 && i === 7 ? 0 : i);
  }
  return out;
}

export function parseCron(expr: string): CronSpec {
  const macros: Record<string, string> = {
    "@hourly": "0 * * * *", "@daily": "0 0 * * *", "@midnight": "0 0 * * *",
    "@weekly": "0 0 * * 0", "@monthly": "0 0 1 * *", "@yearly": "0 0 1 1 *",
  };
  const e = macros[expr.trim()] ?? expr.trim();
  const parts = e.split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron expression needs 5 fields: "${expr}"`);
  return {
    minute: parseField(parts[0], 0, 59), hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31), month: parseField(parts[3], 1, 12), dow: parseField(parts[4], 0, 6),
    domStar: parts[2] === "*", dowStar: parts[4] === "*", source: e,
  };
}

function matches(c: CronSpec, d: Date): boolean {
  if (!c.minute.has(d.getMinutes()) || !c.hour.has(d.getHours()) || !c.month.has(d.getMonth() + 1)) return false;
  const domOk = c.dom.has(d.getDate()), dowOk = c.dow.has(d.getDay());
  if (c.domStar && c.dowStar) return true;
  if (c.domStar) return dowOk;
  if (c.dowStar) return domOk;
  return domOk || dowOk;
}

/** Next fire time strictly after `from`. */
export function nextCron(expr: string | CronSpec, from = new Date()): Date {
  const c = typeof expr === "string" ? parseCron(expr) : expr;
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (matches(c, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  throw new Error(`cron expression never fires: ${c.source}`);
}

/**
 * Natural language → cron expression, or {everyMs} for sub-minute-precision
 * intervals that don't map to cron (e.g. every 7 minutes still maps via step).
 */
export function naturalToCron(text: string): string {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  try { parseCron(t); return t; } catch { /* not raw cron */ }
  if (/^@(hourly|daily|midnight|weekly|monthly|yearly)$/.test(t)) return t;
  let m = /^every (\d+) ?(m|min|mins|minute|minutes)$/.exec(t);
  if (m) return `*/${m[1]} * * * *`;
  m = /^every (\d+) ?(h|hr|hrs|hour|hours)$/.exec(t);
  if (m) return `0 */${m[1]} * * *`;
  if (/^every (minute|1m)$/.test(t)) return "* * * * *";
  if (/^(every hour|hourly)$/.test(t)) return "0 * * * *";
  const time = (s: string) => {
    const mm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(s.trim());
    if (!mm) throw new Error(`can't read time "${s}"`);
    let h = Number(mm[1]);
    const min = Number(mm[2] ?? 0);
    if (mm[3] === "pm" && h < 12) h += 12;
    if (mm[3] === "am" && h === 12) h = 0;
    return { h, min };
  };
  m = /^(?:every day|daily|everyday)(?: at (.+))?$/.exec(t);
  if (m) { const { h, min } = time(m[1] ?? "9:00"); return `${min} ${h} * * *`; }
  m = /^(?:every )?weekdays?(?: at (.+))?$/.exec(t);
  if (m) { const { h, min } = time(m[1] ?? "9:00"); return `${min} ${h} * * 1-5`; }
  m = /^(?:every )?weekends?(?: at (.+))?$/.exec(t);
  if (m) { const { h, min } = time(m[1] ?? "10:00"); return `${min} ${h} * * 0,6`; }
  m = /^(?:every |weekly on )(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?(?: at (.+))?$/.exec(t);
  if (m) { const { h, min } = time(m[2] ?? "9:00"); return `${min} ${h} * * ${NAMES[m[1].slice(0, 3)]}`; }
  m = /^(?:monthly|every month)(?: on (?:the )?(\d{1,2})(?:st|nd|rd|th)?)?(?: at (.+))?$/.exec(t);
  if (m) { const { h, min } = time(m[2] ?? "9:00"); return `${min} ${h} ${m[1] ?? 1} * *`; }
  throw new Error(`could not understand schedule "${text}". Use cron ("0 9 * * 1-5") or phrases like "every 30m", "daily at 9:00", "weekdays at 8:30", "every monday at 10".`);
}

/**
 * One-off times as a cron expression pinned to that minute/day/month (the scheduler marks such jobs `once`):
 * "now", "in 90m", "in 2 hours", "at 23:30", "today at 6pm", "tonight at 11", "tomorrow at 9:15". Null if not one.
 */
export function oneOffCron(text: string, now = new Date()): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  const pin = (d: Date) => `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`;
  if (t === "now") return pin(new Date(now.getTime() + 60_000));
  let m = /^in (\d+) ?(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/.exec(t);
  if (m) {
    const n = Number(m[1]) * (m[2].startsWith("h") ? 60 : 1);
    return pin(new Date(now.getTime() + Math.max(1, n) * 60_000));
  }
  m = /^(?:(today|tonight|tomorrow) )?at (\d{1,2})(?::(\d{2}))? ?(am|pm)?$/.exec(t);
  if (m) {
    let h = Number(m[2]);
    const min = Number(m[3] ?? 0);
    if ((m[4] === "pm" || (m[1] === "tonight" && h < 12)) && h < 12) h += 12;
    if (m[4] === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    const d = new Date(now); d.setSeconds(0, 0); d.setHours(h, min);
    if (m[1] === "tomorrow") d.setDate(d.getDate() + 1);
    else if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1); // "at 9" after 9:00 means tomorrow
    return pin(d);
  }
  return null;
}
