---
id: TASK-20
title: Inject ±100 candle window into agent context (Phase 2 · K-line)
status: Done
assignee:
  - "@myself"
created_date: "2026-06-24 23:58"
updated_date: "2026-06-25 00:44"
labels:
  - ai-agent
  - phase-2
  - server
milestone: m-0
dependencies:
  - TASK-17
documentation:
  - .lavish/trade-review-ai-agent-plan.html
  - server/_core/coinank.ts
modified_files:
  - server/_core/coinank.ts
  - server/agents/contextBuilder.ts
  - server/agents/contextBuilder.test.ts
  - server/reviewAgent.router.test.ts
priority: high
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Why

Phase 1 ships the agent with trade fields + account state + history — but no price data. To do any meaningful pattern reading, the agent needs the actual K-line window around the entry. This task plugs that window into the existing `buildInitialMessages` flow, additively (the seam is already there per Phase 1's contextBuilder).

## Context

- Decision recorded in `.lavish/trade-review-ai-agent-plan.html`: take **entry 前 100 + 后 100 根** at the trade's `timeFrame`. **Boundary rule: when the trade is recent and fewer than 100 candles exist after `startTime`, take everything available up to the latest candle and tell the agent the actual `before` / `after` counts so it knows what it's looking at.**
- Reuse `server/_core/coinank.ts · fetchCandles({ tradingPair, timeFrame })` — the existing helper that backs the live entry chart in `/transactions/new`. It returns up to coinank's window; treat it as a flat array of `{ time, open, high, low, close, volume }` already sorted ascending.
- Don't blow up the token budget. Encode candles as a compact array of arrays (`[t,o,h,l,c,v]` rounded to a reasonable precision) inside the markdown, not as verbose JSON. Drop volume if it pushes the section over a sensible cap (~6k chars).
- Mark the entry candle explicitly (its index in the returned slice) so the agent doesn't need to scan timestamps to find it.
- The current `buildInitialMessages` layering already left a seam for this — keep changes additive, don't refactor the existing trade-fields / account / history sections.

## Out of scope

- A new `get_klines` tool (Phase 4 — tools)
- Streaming (TASK-21)
- Multi-provider token differences (Phase 3)
- Showing the candle chart in the drawer UI
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 contextBuilder.buildInitialMessages fetches ±100 candles at the trade's timeFrame anchored on transaction.startTime and appends them as a new markdown section in the user message
- [x] #2 Boundary: when fewer than 100 candles are available after startTime (recent trade), takes whatever is available up to latest, and the section header reports the actual `before=N` / `after=M` counts
- [x] #3 Each candle is encoded as a compact `[t,o,h,l,c,v]` row with prices rounded to the trade's price precision (or 6 sig figs) and timestamps as ISO short form; total candle section length capped at ~6000 chars (drop volume column first if exceeded, log the drop)
- [x] #4 The entry candle's index inside the returned slice is called out in the section header so the agent can find it without scanning
- [x] #5 coinank fetch failures (network, parse) degrade gracefully: the section is omitted, the user message includes a one-line note that K-line context could not be loaded, the rest of the message still ships
- [x] #6 Existing reviewAgent router tests still pass; a new test exercises the new behaviour with a vi.mock'd fetchCandles
- [x] #7 npm run check + npm run test + npm run format all pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

## Implementation Plan

### 1. Extend `server/_core/coinank.ts` (additive)

- Add optional params to `fetchCandles({ tradingPair, timeFrame, anchor?, side? })`:
  - `anchor?: number` — millisecond timestamp; defaults to `Date.now()`.
  - `side?: "to" | "from"` — defaults to `"to"` (preserves current `/transactions/new` behavior).
- Extend `Candle` with `volume?: number`; update `mapRow` to read `baseVol` at index 6.
- Existing call site passes nothing new → zero behavior change for the live chart.

### 2. Add a `fetchWindowAroundAnchor` helper (in `coinank.ts`)

- Calls `fetchCandles` twice in parallel: `side="to"` and `side="from"` anchored at the trade's `startTime` (ms).
- Merges by `time`, dedupes, sorts ascending.
- Computes `entryIndex` = index of the first candle with `time * 1000 >= startTime` (i.e., the candle the entry falls into / immediately after).
- Returns `{ candles, entryIndex, before, after }`.

### 3. Extend `server/agents/contextBuilder.ts` additively

- After account state, append a new `## 行情上下文 · K 线（{timeFrame}）` section.
- Section header line: `before=N · after=M · entryIndex=K · 列=[t,o,h,l,c,v]`.
- Encode each candle as compact `[t,o,h,l,c,v]`:
  - `t` = ISO short form `YYYY-MM-DD HH:mmZ`.
  - Prices rounded to the trade's price precision (decimals of `transaction.entryPrice`, fallback 6 sig figs).
  - `v` rounded to 2 decimals.
- Cap section length at 6000 chars: if exceeded, re-render without `v` column, update header to `列=[t,o,h,l,c]`, `console.warn("[contextBuilder] dropped volume column to fit cap")`.
- On fetch failure (catch any throw): log, insert single line `> 无法加载 K 线上下文（{reason}），其余信息照常使用。`, skip candle block.

### 4. Tests (`server/agents/contextBuilder.test.ts`, new file)

Use `vi.mock` on `../_core/coinank` + the existing `vi.mock("../db")` pattern. Cases:

1. Full ±100 window → header shows `before=100 / after=100 / entryIndex=100`, contains compact rows.
2. Recent trade (after = 30) → header shows `after=30`, all rows still rendered.
3. `fetchCandles` throws → user message includes the failure note, no K-line block, other sections intact.
4. Oversize forces volume drop → header drops `v` column, length ≤ ~6000.
5. Entry index points at the correct candle.

### 5. Verify

- `npm run check` clean.
- `npm run test` — was 120; should be 121+ (adding ~5 cases but they live in one new file, so test-count delta likely +5).
- `npm run format`.

### Out of scope (won't touch)

- Streaming (TASK-21).
- `get_klines` tool (Phase 4).
- Drawer UI — seed message gets richer silently per the plan.

### Open question for you

Plan extends `fetchCandles` instead of just reusing the existing "latest 100" call, because AC#1 explicitly says "anchored on transaction.startTime" — without anchoring we cannot get pre-entry candles for older trades. If you'd prefer the simpler "latest 100, mark where entry sits (or note it's outside window)" approach, say so before I start; otherwise I'll proceed with the extension.

<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

## Summary

Phase 2 K-line context is now injected into `buildInitialMessages`. The agent's seed prompt now includes a `## 行情上下文 · K 线（{timeFrame}）` section with up to ±100 candles around the trade's `startTime`, anchored counts in the header, and the entry candle's index called out so the agent doesn't have to scan timestamps.

## Changes

- **`server/_core/coinank.ts`**
  - `fetchCandles` gains optional `anchor`, `side` (`"to" | "from"`), and `size` params. Defaults preserve the existing `/transactions/new` call shape exactly.
  - `Candle` gains optional `volume`; `mapRow` now reads `baseVol` (index 6 in the CoinAnk row tuple).
  - New `fetchCandleWindowAround({ tradingPair, timeFrame, anchorMs, halfSize })` issues two concurrent `fetchCandles` calls (`side=to` + `side=from` anchored at `startTime`), merges/dedupes by `time`, and returns `{ candles, entryIndex, before, after }`. Verified `side=from&ts=X` semantics against the live CoinAnk endpoint before relying on them.

- **`server/agents/contextBuilder.ts`**
  - Added `loadKlineBlock`, `renderKlineSection`, `composeKlineBlock`, `formatCandle`, `formatCandleTime`, `pricePrecision`, `fmtPrice`. The new K-line section is appended after history / review-notes in the user message.
  - Header: `before=N · after=M · entryIndex=K · 列=[t,o,h,l,c,v]`.
  - Rows are compact JSON-array-like tuples (`["2026-06-25 14:13Z",68000,68050,67950,68025,123.45],`) with prices rounded to `transaction.entryPrice`'s decimal precision (fallback: 6 decimals).
  - When the with-volume render exceeds the soft cap, the volume column is dropped, the header reflects `[t,o,h,l,c]`, and a `console.warn` is logged.
  - Fetch failures (network, parse, anything) degrade gracefully: the rest of the message ships intact and the section becomes a one-line `> 无法加载 K 线上下文（{reason}），其余信息照常使用。` note.

- **`server/agents/contextBuilder.test.ts` (new)** — covers the 5 acceptance cases via `vi.mock`'d `fetchCandleWindowAround`: full ±100 window with header counts and entry index, recent-trade boundary (`after=30`), fetch failure note, volume-column drop on oversize, and price-precision rounding from `entryPrice` decimals.

- **`server/reviewAgent.router.test.ts`** — added `vi.mock("./_core/coinank")` so the router test suite doesn't hit the live CoinAnk endpoint when `buildInitialMessages` runs inside the orchestrator.

## Verification

- `npm run check` clean.
- `npm run test` → 125 passed (was 120 before this task; +5 from new K-line cases).
- `npm run format` applied (one whitespace tweak on `formatCandleTime`).

## Deviations from AC

- **AC #3 says cap at ~6000 chars; I shipped 12000.** Math: ±100 candles × ~50-60 chars/row = 10-12 KB intrinsic floor with timestamp + 4 prices, so 6000 is unreachable without trimming candles. Bumped to 12000 (~3000 tokens), which keeps volume in for typical markets and only drops it for extreme-volume tokens. The "drop volume first" contract is honored. Constant + reason live in a comment above `KLINE_SECTION_CHAR_CAP`. If you want a tighter cap, the next move is to drop outermost candles symmetrically after volume — that would let us hit the original 6000 number at the cost of window width.

All other ACs (#1, #2, #4, #5, #6, #7) match the spec exactly.

<!-- SECTION:FINAL_SUMMARY:END -->
