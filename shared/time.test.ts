import { describe, expect, it } from "vitest";
import {
  formatUtc8CandleTime,
  formatUtc8Date,
  formatUtc8DateTime,
  formatUtc8Prompt,
  parseDatetimeLocalUtc8,
  toDatetimeLocalUtc8,
  utc8DayKey,
  utc8Parts,
} from "./time";

// All expectations are fixed UTC+8 wall-clock values; results must not depend
// on the host timezone.

const T = Date.UTC(2026, 2, 5, 6, 30); // 2026-03-05 06:30 UTC = 14:30 UTC+8

describe("shared/time UTC+8 helpers", () => {
  it("formats UI datetime in UTC+8", () => {
    expect(formatUtc8DateTime(T)).toBe("Mar 5, 2026 14:30");
    expect(formatUtc8DateTime(new Date(T))).toBe("Mar 5, 2026 14:30");
  });

  it("formats UI date in UTC+8, rolling over the UTC day boundary", () => {
    expect(formatUtc8Date(T)).toBe("Mar 5, 2026");
    // 2026-03-05 23:00 UTC is already 03-06 in UTC+8.
    expect(formatUtc8Date(Date.UTC(2026, 2, 5, 23, 0))).toBe("Mar 6, 2026");
  });

  it("keys a timestamp by its UTC+8 calendar day", () => {
    expect(utc8DayKey(T)).toBe("2026-03-05");
    expect(utc8DayKey(Date.UTC(2026, 2, 5, 15, 59))).toBe("2026-03-05");
    expect(utc8DayKey(Date.UTC(2026, 2, 5, 16, 0))).toBe("2026-03-06");
  });

  it("formats LLM prompt time with explicit UTC+8 label", () => {
    expect(formatUtc8Prompt(T)).toBe("2026-03-05 14:30 UTC+8");
  });

  it("formats candle time (epoch seconds) with +08:00 offset", () => {
    expect(formatUtc8CandleTime(T / 1000)).toBe("2026-03-05 14:30+08:00");
  });

  it("generates datetime-local values in UTC+8", () => {
    expect(toDatetimeLocalUtc8(T)).toBe("2026-03-05T14:30");
  });

  it("parses datetime-local strings as UTC+8 wall-clock", () => {
    expect(parseDatetimeLocalUtc8("2026-03-05T14:30")).toBe(T);
    expect(Number.isNaN(parseDatetimeLocalUtc8("garbage"))).toBe(true);
    expect(Number.isNaN(parseDatetimeLocalUtc8(""))).toBe(true);
  });

  it("round-trips epoch ms through datetime-local", () => {
    expect(parseDatetimeLocalUtc8(toDatetimeLocalUtc8(T))).toBe(T);
  });

  it("exposes chart tick parts in UTC+8", () => {
    const p = utc8Parts(T);
    expect(p.year).toBe(2026);
    expect(p.monthName).toBe("Mar");
    expect(p.day).toBe(5);
    expect(p.hhmm).toBe("14:30");
    expect(p.hhmmss).toBe("14:30:00");
  });
});
