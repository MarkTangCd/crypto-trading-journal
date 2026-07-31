// Fixed UTC+8 display timezone (see backlog decision-1). Storage stays epoch
// milliseconds; every wall-clock string shown to a human or serialized into an
// LLM prompt must go through this module. UTC+8 has no DST, so fixed-offset
// math is fully correct.

export const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Shift so that UTC getters read out UTC+8 wall-clock fields.
function shifted(ts: number | Date): Date {
  const ms = ts instanceof Date ? ts.getTime() : ts;
  return new Date(ms + UTC8_OFFSET_MS);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export interface Utc8Parts {
  year: number;
  monthName: string;
  day: number;
  hhmm: string;
  hhmmss: string;
}

export function utc8Parts(ts: number | Date): Utc8Parts {
  const d = shifted(ts);
  return {
    year: d.getUTCFullYear(),
    monthName: MONTHS[d.getUTCMonth()],
    day: d.getUTCDate(),
    hhmm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    hhmmss: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  };
}

// "Mar 5, 2026 14:30" — UI text style (callers lowercase for the brand look).
export function formatUtc8DateTime(ts: number | Date): string {
  const p = utc8Parts(ts);
  return `${p.monthName} ${p.day}, ${p.year} ${p.hhmm}`;
}

// "Mar 5, 2026"
export function formatUtc8Date(ts: number | Date): string {
  const p = utc8Parts(ts);
  return `${p.monthName} ${p.day}, ${p.year}`;
}

// "2026-03-05 14:30"
function isoMinute(ts: number | Date): string {
  const d = shifted(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// "2026-03-05 14:30 UTC+8" — headline times in LLM prompts and tool results.
export function formatUtc8Prompt(ts: number | Date): string {
  return `${isoMinute(ts)} UTC+8`;
}

// "2026-03-05 14:30+08:00" — compact per-candle timestamps in LLM prompts.
export function formatUtc8CandleTime(timeSec: number): string {
  return `${isoMinute(timeSec * 1000)}+08:00`;
}

// "2026-03-05T14:30" for <input type="datetime-local">, UTC+8 wall-clock.
export function toDatetimeLocalUtc8(ts: number | Date): string {
  const d = shifted(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Parse a datetime-local string ("YYYY-MM-DDTHH:mm[:ss]") as UTC+8 wall-clock.
// Returns NaN for invalid input, matching new Date(str).getTime() behavior.
export function parseDatetimeLocalUtc8(value: string): number {
  return Date.parse(`${value}Z`) - UTC8_OFFSET_MS;
}
