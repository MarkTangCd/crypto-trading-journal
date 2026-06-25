---
id: TASK-20
title: Inject ±100 candle window into agent context (Phase 2 · K-line)
status: To Do
assignee: []
created_date: '2026-06-24 23:58'
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
- [ ] #1 contextBuilder.buildInitialMessages fetches ±100 candles at the trade's timeFrame anchored on transaction.startTime and appends them as a new markdown section in the user message
- [ ] #2 Boundary: when fewer than 100 candles are available after startTime (recent trade), takes whatever is available up to latest, and the section header reports the actual `before=N` / `after=M` counts
- [ ] #3 Each candle is encoded as a compact `[t,o,h,l,c,v]` row with prices rounded to the trade's price precision (or 6 sig figs) and timestamps as ISO short form; total candle section length capped at ~6000 chars (drop volume column first if exceeded, log the drop)
- [ ] #4 The entry candle's index inside the returned slice is called out in the section header so the agent can find it without scanning
- [ ] #5 coinank fetch failures (network, parse) degrade gracefully: the section is omitted, the user message includes a one-line note that K-line context could not be loaded, the rest of the message still ships
- [ ] #6 Existing reviewAgent router tests still pass; a new test exercises the new behaviour with a vi.mock'd fetchCandles
- [ ] #7 npm run check + npm run test + npm run format all pass
<!-- AC:END -->
