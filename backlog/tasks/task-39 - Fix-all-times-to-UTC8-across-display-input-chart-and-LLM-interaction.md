---
id: TASK-39
title: "Fix all times to UTC+8 across display, input, chart, and LLM interaction"
status: Done
assignee:
  - "@myself"
created_date: "2026-07-22 23:44"
updated_date: "2026-07-22 23:50"
labels: []
dependencies: []
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Per decision-1: the project mixed browser-local (UI text, form inputs), UTC (chart axis, LLM prompts), and raw epoch ms (getRecentTrades tool results). Fix everything to a hardcoded UTC+8 so no surface requires mental timezone conversion. See backlog/decisions/decision-1 and glossary doc-1.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 shared/time.ts provides zero-dependency fixed UTC+8 helpers (format for UI, format for LLM prompts, datetime-local parse/generate) used by both client and server
- [x] #2 UI text times (fmtDateTime/fmtDate in ledger.tsx and all call sites) render fixed UTC+8 with unchanged visual format and no timezone suffix
- [x] #3 datetime-local inputs (new transaction startTime, close trade endTime including its 'now' seed) round-trip as UTC+8 wall-clock
- [x] #4 Candlestick chart axis, crosshair, and selected-candle labels render UTC+8 while data timestamps stay true epoch
- [x] #5 Review and pre-trade prompt builders serialize all times as UTC+8 with explicit label; both system prompts instruct the model to state times in UTC+8 and never self-convert
- [x] #6 getRecentTrades keeps raw ms fields and adds UTC+8 text fields
- [x] #7 Unit tests cover the shared helpers; npm run check and npm run test pass; output independent of host timezone
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Add shared/time.ts: UTC8_OFFSET_MS, formatUtc8DateTime / formatUtc8Date (UI style), formatUtc8Prompt ('YYYY-MM-DD HH:mm UTC+8'), formatUtc8CandleIso ('YYYY-MM-DDTHH:mm+08:00'), toDatetimeLocalUtc8, parseDatetimeLocalUtc8. Pure fixed-offset math via UTC getters.
2. Add unit tests for the helpers (vitest), asserting results with non-UTC+8-dependent expectations.
3. ledger.tsx: fmtDateTime/fmtDate delegate to shared helpers (keep lowercase), drop date-fns usage there.
4. NewTransaction.tsx + useCloseTradeForm.ts: parse datetime-local via parseDatetimeLocalUtc8; seed endTime default via toDatetimeLocalUtc8(Date.now()) replacing the getTimezoneOffset trick.
5. CandlestickChart.tsx: add localization.timeFormatter + timeScale.tickMarkFormatter using shared helpers (data stays true epoch seconds).
6. contextBuilder.ts + preTradeContextBuilder.ts: fmtTime/formatCandleTime -> UTC+8 via shared helpers; add hard rule line to both SYSTEM_PROMPTs.
7. getRecentTrades.ts: add startTimeText/endTimeText UTC+8 fields alongside raw ms.
8. devbox run -- npm run format && npm run check && npm run test; verify with TZ=UTC that tests still pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Implemented per plan. Extra: removed date-fns from package.json (ledger.tsx was its only consumer; now unused). Added shared/\*_/_.test.ts to vitest include. Deviation: devbox is not installed on this machine (.devbox/ absent), so format/check/test ran on host node v25.4.0 (satisfies >=22.5.0). Full suite also passes with TZ=UTC and helper tests pass under TZ=America/New_York.

<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Fixed all times to hardcoded UTC+8 (decision-1). New shared/time.ts (zero-dep fixed-offset helpers + 8 unit tests). ledger.tsx fmtDateTime/fmtDate now UTC+8; datetime-local inputs in NewTransaction.tsx and useCloseTradeForm.ts parse/seed as UTC+8 wall-clock (getTimezoneOffset trick removed); CandlestickChart.tsx adds tickMarkFormatter + localization.timeFormatter for UTC+8 axis/crosshair with true-epoch data; contextBuilder.ts and preTradeContextBuilder.ts serialize times as 'YYYY-MM-DD HH:mm UTC+8' / '...+08:00' and both system prompts forbid model-side timezone conversion; getRecentTrades adds startTimeText/endTimeText UTC+8 fields alongside raw ms. date-fns removed (unused). check + 369 tests pass, timezone-independent.

<!-- SECTION:FINAL_SUMMARY:END -->
