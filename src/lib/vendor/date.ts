/* ─── stitaP — Custom Date Utilities (replaces date-fns) ─── */

/** Format a date to string */
export function format(date: Date | number | string, fmt: string): string {
  const d = toDate(date);
  // Single-pass replacement using a regex that matches the longest token first
  const tokenRe = /yyyy|MMMM|EEEE|EEE|MMM|yy|MM|M(?!M)|dd|d(?!d)|HH|H(?!H)|hh|mm|ss|SSS|a/g;
  return fmt.replace(tokenRe, (token) => {
    switch (token) {
      case "yyyy": return String(d.getFullYear()).padStart(4, "0");
      case "yy": return String(d.getFullYear()).slice(-2);
      case "MMMM": return MONTHS_FULL[d.getMonth()];
      case "MMM": return MONTHS_SHORT[d.getMonth()];
      case "MM": return String(d.getMonth() + 1).padStart(2, "0");
      case "M": return String(d.getMonth() + 1);
      case "dd": return String(d.getDate()).padStart(2, "0");
      case "d": return String(d.getDate());
      case "HH": return String(d.getHours()).padStart(2, "0");
      case "H": return String(d.getHours());
      case "hh": return String(d.getHours() % 12 || 12).padStart(2, "0");
      case "mm": return String(d.getMinutes()).padStart(2, "0");
      case "ss": return String(d.getSeconds()).padStart(2, "0");
      case "SSS": return String(d.getMilliseconds()).padStart(3, "0");
      case "EEEE": return DAYS_FULL[d.getDay()];
      case "EEE": return DAYS_SHORT[d.getDay()];
      case "a": return d.getHours() < 12 ? "AM" : "PM";
      default: return token;
    }
  });
}

/** Parse a date string */
export function parse(dateStr: string, fmt?: string): Date {
  if (!fmt) return new Date(dateStr);
  // Simple parsing for common formats
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Get relative time string */
export function formatDistanceToNow(date: Date | number | string): string {
  const now = Date.now();
  const d = typeof date === "number" ? date : typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diff = now - d;
  const absDiff = Math.abs(diff);
  const future = diff < 0;

  if (absDiff < 60_000) return "less than a minute" + (future ? " from now" : " ago");
  if (absDiff < 3_600_000) {
    const m = Math.round(absDiff / 60_000);
    return `${m} minute${m !== 1 ? "s" : ""}` + (future ? " from now" : " ago");
  }
  if (absDiff < 86_400_000) {
    const h = Math.round(absDiff / 3_600_000);
    return `${h} hour${h !== 1 ? "s" : ""}` + (future ? " from now" : " ago");
  }
  if (absDiff < 2_592_000_000) {
    const days = Math.round(absDiff / 86_400_000);
    return `${days} day${days !== 1 ? "s" : ""}` + (future ? " from now" : " ago");
  }
  if (absDiff < 31_536_000_000) {
    const months = Math.round(absDiff / 2_592_000_000);
    return `${months} month${months !== 1 ? "s" : ""}` + (future ? " from now" : " ago");
  }
  const years = Math.round(absDiff / 31_536_000_000);
  return `${years} year${years !== 1 ? "s" : ""}` + (future ? " from now" : " ago");
}

/** Add time to a date */
export function addDays(date: Date | number | string, days: number): Date {
  const d = toDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addHours(date: Date | number | string, hours: number): Date {
  const d = toDate(date);
  d.setHours(d.getHours() + hours);
  return d;
}

export function addMinutes(date: Date | number | string, minutes: number): Date {
  const d = toDate(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function addMonths(date: Date | number | string, months: number): Date {
  const d = toDate(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addYears(date: Date | number | string, years: number): Date {
  const d = toDate(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/** Start/end of day */
export function startOfDay(date: Date | number | string): Date {
  const d = toDate(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date | number | string): Date {
  const d = toDate(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Difference in days/hours/minutes */
export function differenceInDays(a: Date | number | string, b: Date | number | string): number {
  const da = toDate(a).getTime();
  const db = toDate(b).getTime();
  return Math.round((da - db) / 86_400_000);
}

export function differenceInHours(a: Date | number | string, b: Date | number | string): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / 3_600_000);
}

export function differenceInMinutes(a: Date | number | string, b: Date | number | string): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / 60_000);
}

/** Comparison */
export function isBefore(a: Date | number | string, b: Date | number | string): boolean {
  return toDate(a).getTime() < toDate(b).getTime();
}

export function isAfter(a: Date | number | string, b: Date | number | string): boolean {
  return toDate(a).getTime() > toDate(b).getTime();
}

export function isSameDay(a: Date | number | string, b: Date | number | string): boolean {
  const da = toDate(a);
  const db = toDate(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function isToday(date: Date | number | string): boolean {
  return isSameDay(date, new Date());
}

/** Get calendar days for a month grid */
export function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) result.push(null);
  for (let d = 1; d <= daysInMonth; d++) result.push(new Date(year, month, d));
  return result;
}

/** Convert to Date */
function toDate(v: Date | number | string): Date {
  if (v instanceof Date) return new Date(v.getTime());
  if (typeof v === "number") return new Date(v);
  return new Date(v);
}

/** Constants */
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
