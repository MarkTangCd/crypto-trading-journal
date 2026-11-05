---
id: TASK-61
title: 'Trade procedures: list, get, hand-edit'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 11:55'
labels:
  - ready-for-agent
dependencies:
  - TASK-58
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section tRPC surface → trade. New namespace alongside the old transaction namespace (removed by the removal task). No create, close, delete, getFormDefaults or getTradingPairs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 trade.list({ accountId, status? }) returns trades open first then openTime desc; trade.get({ id }) returns one trade or NOT_FOUND
- [x] #2 trade.update({ id, stopLossPrice?, takeProfitPrice?, openTime? }) enforces the hand-edit rules through updateTradeByHand and throws BAD_REQUEST otherwise; prices validated as decimal strings, openTime as ms
- [x] #3 server/trade.test.ts exercises the three procedures via appRouter.createCaller with the vi.mock pattern from server/transaction.test.ts
- [x] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. routers.ts: new trade namespace next to transaction.
   - list({ accountId, status?: open|closed }) -> requireOwnedAccount then listTrades.
   - get({ id }) -> getTradeById or TRPCError NOT_FOUND.
   - update({ id, stopLossPrice?, takeProfitPrice?, openTime? }): prices = positive decimal strings (normalized via decimal.normalize), nullable to clear; openTime = positive int ms; at least one field. Calls updateTradeByHand; undefined -> NOT_FOUND; TradeEditError -> BAD_REQUEST.
2. server/trade.test.ts: vi.mock ./db pattern, createCaller; list ordering passthrough + ownership, get NOT_FOUND, update success / rule violation / invalid decimal / invalid openTime / missing trade.
3. format (only touched files), check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
New trade tRPC namespace alongside transaction (spec doc-4, tRPC surface -> trade).

- trade.list({ accountId, status? }): ownership check (FORBIDDEN) then listTrades (open first, openTime desc).
- trade.get({ id }): getTradeById or NOT_FOUND.
- trade.update({ id, stopLossPrice?, takeProfitPrice?, openTime? }): prices are positive plain decimals normalized via decimal.normalize, nullable to clear; openTime positive int ms; empty patch rejected. updateTradeByHand enforces the rules; TradeEditError -> BAD_REQUEST, missing trade -> NOT_FOUND.
- No create/close/delete/getFormDefaults/getTradingPairs.
- server/trade.test.ts: 15 cases via createCaller + vi.mock(./db).
- npm run check and npm run test (478 tests) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
