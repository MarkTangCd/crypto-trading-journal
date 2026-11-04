---
id: TASK-55
title: >-
  Binance client: income discovery, fills, positions, conditional orders and fee
  conversion
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:42'
updated_date: '2026-11-04 13:38'
labels:
  - ready-for-agent
dependencies:
  - TASK-54
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section Binance implementation, rows discoverSymbols, fetchFills, fetchPositions, fetchConditionalOrders and fee conversion. Second half of the thin client.

Research: docs/research/binance-income-and-symbol-discovery.md (branch research/binance-income-and-symbol-discovery), docs/research/binance-algo-orders.md (branch research/binance-algo-orders), docs/research/binance-position-and-balance-v3.md.

Map fog to clear if possible: two facts still need a live open position (whether live openOrders still returns migrated conditional types alongside openAlgoOrders; sign of positionAmt for a hedge-mode SHORT). If the trader has an open position during this task, re-run scripts/binance-key-probe.mjs and record both answers in the final summary; otherwise say so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 discoverSymbols: GET /fapi/v1/income without symbol or incomeType, limit 1000, windows of at most 7 days, pages by advancing startTime, dedupes by tranId, keeps symbols from REALIZED_PNL / COMMISSION / FUNDING_FEE rows, returns { symbols, maxTime }
- [x] #2 fetchFills: GET /fapi/v1/userTrades with symbol, windows of at most 7 days, limit 1000, pages by startTime = last time, dedupes by id, maps every ExchangeFill field; commission in USDT passes through to feeUsd unchanged
- [x] #3 Non-USDT commission is converted through GET /fapi/v1/klines?symbol=<ASSET>USDT&interval=1m using the 1-minute close at the fill's minute, cached per (asset, minute) for the lifetime of one adapter run; a missing kline throws ExchangeError unknown
- [x] #4 fetchPositions: GET /fapi/v3/positionRisk, returns rows with positionAmt != 0 with positionAmt signed as reported
- [x] #5 fetchConditionalOrders: GET /fapi/v1/openAlgoOrders?symbol=, keeps algoStatus NEW, maps STOP/STOP_MARKET → stop and TAKE_PROFIT/TAKE_PROFIT_MARKET → takeProfit, drops trailing stops, uses triggerPrice never price, maps closePosition and quantity
- [x] #6 Vitest covers pagination across a window boundary, tranId/id dedupe, BNB fee conversion with cache hit, missing-kline error, and each mapping, all against recorded responses
- [x] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. http.ts: add publicGet (unsigned, same timeout/weight log/error mapping) by sharing the send path with signedGet
2. Windowing helper: split [from, to] into inclusive windows of at most 7 days; inside each window page with limit 1000, next startTime = last row time while the page is full (cursor + 1 if no progress, to avoid a same-ms loop)
3. discoverSymbols: /fapi/v1/income (no symbol/incomeType), dedupe by incomeType+tranId (tranId is unique per incomeType), symbols from REALIZED_PNL / COMMISSION / FUNDING_FEE rows with non-empty symbol, maxTime = max time of all rows (0 when none, same as the fake)
4. fetchFills: /fapi/v1/userTrades per window, dedupe by id, map to ExchangeFill (ids stringified); feeUsd = commission for USDT, else mul(commission, close) from /fapi/v1/klines symbol=<ASSET>USDT interval=1m startTime=minute limit=1; cache Map keyed asset:minute in the adapter closure (one adapter per sync run); empty kline -> ExchangeError unknown
5. fetchPositions: /fapi/v3/positionRisk, keep !isZero(positionAmt), map fields as reported
6. fetchConditionalOrders: /fapi/v1/openAlgoOrders?symbol=, keep algoStatus NEW, STOP/STOP_MARKET -> stop, TAKE_PROFIT/TAKE_PROFIT_MARKET -> takeProfit, others dropped; triggerPrice, closePosition, quantity
7. Tests with recorded-shape JSON: pagination across a window boundary, tranId/id dedupe, BNB fee conversion + cache hit, missing kline, each mapping
8. format, check, test; live probe only if the trader confirms an open position
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Second half of the hand-written Binance client (spec doc-4); createBinanceAdapter() now implements every ExchangeAdapter method.

- http.ts: publicGet (unsigned) shares the send path with signedGet (timeout, weight log, error mapping).
- fetchWindowed: splits [from, to] into <=7-day inclusive windows, pages with limit 1000 by startTime = last row time while full (steps 1 ms past a full same-millisecond page).
- discoverSymbols: /fapi/v1/income with no symbol/incomeType; dedupe by incomeType+tranId (tranId is unique per type); symbols from REALIZED_PNL/COMMISSION/FUNDING_FEE rows; maxTime = max time of all rows, 0 when none (sync must not overwrite its cursor with 0).
- fetchFills: /fapi/v1/userTrades, dedupe by id, full ExchangeFill mapping; USDT fee passes through; other assets use mul(commission, 1m close) from /fapi/v1/klines, cached per asset:minute in the adapter instance (one adapter per sync run); missing kline -> unknown.
- fetchPositions: v3 positionRisk rows with non-zero positionAmt, sign as reported.
- fetchConditionalOrders: openAlgoOrders?symbol=, NEW only, STOP/STOP_MARKET -> stop, TAKE_PROFIT/TAKE_PROFIT_MARKET -> takeProfit, trailing dropped, triggerPrice not price.
- Tests (+6, 40 in binance.test.ts) cover window-boundary paging, id dedupe, BNB conversion with cache hit, missing kline, every mapping. Income tranId dedupe has no observable effect on { symbols, maxTime }, so it is not separately asserted.
- check and full suite (436) pass.

Open fog: the trader had no open position, so the live probe was not re-run. Still UNCONFIRMED: (1) whether live openOrders still returns migrated conditional types alongside openAlgoOrders; (2) sign of positionAmt for a hedge-mode SHORT.
<!-- SECTION:FINAL_SUMMARY:END -->
