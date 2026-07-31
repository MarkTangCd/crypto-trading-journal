---
id: decision-1
title: "All times fixed to UTC+8 across display, input, and LLM interaction"
date: "2026-07-22 23:40"
status: accepted
---

## Context

The project had three coexisting timezones with no explicit policy:

- Frontend text display (`client/src/lib/ledger.tsx` `fmtDateTime`/`fmtDate`
  via date-fns `format`): implicit browser-local timezone.
- Candlestick chart axis (`client/src/components/CandlestickChart.tsx`,
  lightweight-charts default): UTC. The same candle showed a different time on
  the chart axis than in the adjacent "entry from candle" dialog text.
- Form input parsing (`datetime-local` strings in `NewTransaction.tsx` and
  `useCloseTradeForm.ts` via `new Date(str).getTime()`): browser-local.
- LLM prompts (`server/agents/contextBuilder.ts` and
  `preTradeContextBuilder.ts` `fmtTime`/`formatCandleTime`): explicit UTC, so
  the review and pre-trade agents replied in UTC.
- `getRecentTrades` skill returned raw epoch-ms integers to the model,
  forcing it to do its own conversion when narrating times.

Storage (`drizzle/schema.ts`) is epoch milliseconds — timezone-agnostic and
correct as-is.

The user (sole trader, based in UTC+8) wants every time in the product — UI,
chart, forms, and LLM conversation content — expressed in UTC+8, with no
mental conversion during review.

## Decision

Hardcode UTC+8 as the single fixed display/input timezone for the entire
project. Specifically:

1. UTC+8 is a fixed offset, not browser-local and not configurable. Behavior
   is identical regardless of where the browser or server runs.
2. Storage stays epoch milliseconds. No data migration (existing timestamps
   were entered in UTC+8 and are already correct).
3. Form `datetime-local` inputs are interpreted as UTC+8 wall-clock,
   including the "now" default seed for close-trade end time. Display and
   input round-trip consistently.
4. Chart axis, crosshair, and selected-candle labels render UTC+8. Persisted
   timestamps remain true epoch values (display-only conversion).
5. LLM prompts serialize all times (open/close, anchor, candles, recent
   trades) pre-converted to UTC+8 with an explicit UTC+8 label, and both
   system prompts gain a hard rule: all times are UTC+8; state times in
   UTC+8 in replies; never self-convert. Rationale: model arithmetic on
   timezone conversion is unreliable; feed it data already in the target
   zone.
6. `getRecentTrades` keeps raw ms fields (so the model can chain them into
   `getKlines`/`analyzeMarketStructure` `anchorMs` without parsing) and adds
   formatted UTC+8 text fields for narration.
7. UI shows no "utc+8" suffix — the timezone is globally uniform, so a
   marker carries no information and violates the restrained visual style.
   The LLM prompt keeps the explicit marker (disambiguation for the model,
   not for humans).
8. Implementation is a hand-written zero-dependency module `shared/time.ts`
   (fixed +8h offset math; UTC+8 has no DST, so a fixed offset is fully
   correct) shared by frontend, backend, and prompt builders. Rejected
   `@date-fns/tz`: a new dependency for a single fixed offset.

## Consequences

- Verification bar: the same candle/trade shows the identical time on the
  chart, in lists, on the detail page, and in LLM replies; re-running with
  the OS timezone set to UTC changes nothing.
- If the user relocates permanently or multi-timezone support is ever
  needed, this becomes a config value; the single `shared/time.ts` choke
  point makes that migration cheap.
- All future date formatting must go through `shared/time.ts` — introducing
  a bare `new Date(str)` parse or date-fns `format` call on a timestamp
  reintroduces the local-timezone drift this decision removes.
- The close-trade "now" seed logic (`getTimezoneOffset()` trick in
  `useCloseTradeForm.ts`) is replaced by the shared helper.
