// Formatting and time-zone helpers. Everything is stored in UTC and shown in the coach's time zone.

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function money(cents: number | null | undefined, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format((cents ?? 0) / 100);
}

export function fmtDateTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function fmtDate(iso: string, tz?: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T00:00:00Z") : new Date(iso);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz ?? "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function fmtRelativeDays(iso: string | null) {
  if (!iso) return "never";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}

/** Parts of a UTC instant as seen in a time zone. */
function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

function offsetMs(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - date.getTime();
}

/** "2026-10-27T10:00" in the coach's time zone -> UTC ISO string. */
export function zonedToUtc(local: string, tz: string) {
  const [datePart, timePart = "00:00"] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  let ts = guess - offsetMs(new Date(guess), tz);
  ts = guess - offsetMs(new Date(ts), tz);
  return new Date(ts).toISOString();
}

/** UTC ISO -> "YYYY-MM-DDTHH:mm" in the coach's time zone (for datetime-local inputs). */
export function utcToZonedInput(iso: string, tz: string) {
  const p = zonedParts(new Date(iso), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(tz: string) {
  return utcToZonedInput(new Date().toISOString(), tz).slice(0, 10);
}

export function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing ymd. */
export function weekStart(ymd: string) {
  const d = new Date(ymd + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(ymd, -dow);
}

/** Minutes past midnight of an instant in a time zone. */
export function minutesInDay(iso: string, tz: string) {
  const p = zonedParts(new Date(iso), tz);
  return p.h * 60 + p.min;
}

export function cadenceLabel(c: string) {
  return (
    { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly", package: "Package", ad_hoc: "As needed" } as Record<
      string,
      string
    >
  )[c] ?? c;
}

export function fullName(c: { first_name?: string | null; last_name?: string | null }) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}
