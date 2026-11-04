---
id: TASK-55
title: >-
  Binance client: income discovery, fills, positions, conditional orders and fee
  conversion
status: To Do
assignee: []
created_date: '2026-11-04 12:42'
updated_date: '2026-11-04 12:44'
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
- [ ] #1 discoverSymbols: GET /fapi/v1/income without symbol or incomeType, limit 1000, windows of at most 7 days, pages by advancing startTime, dedupes by tranId, keeps symbols from REALIZED_PNL / COMMISSION / FUNDING_FEE rows, returns { symbols, maxTime }
- [ ] #2 fetchFills: GET /fapi/v1/userTrades with symbol, windows of at most 7 days, limit 1000, pages by startTime = last time, dedupes by id, maps every ExchangeFill field; commission in USDT passes through to feeUsd unchanged
- [ ] #3 Non-USDT commission is converted through GET /fapi/v1/klines?symbol=<ASSET>USDT&interval=1m using the 1-minute close at the fill's minute, cached per (asset, minute) for the lifetime of one adapter run; a missing kline throws ExchangeError unknown
- [ ] #4 fetchPositions: GET /fapi/v3/positionRisk, returns rows with positionAmt != 0 with positionAmt signed as reported
- [ ] #5 fetchConditionalOrders: GET /fapi/v1/openAlgoOrders?symbol=, keeps algoStatus NEW, maps STOP/STOP_MARKET → stop and TAKE_PROFIT/TAKE_PROFIT_MARKET → takeProfit, drops trailing stops, uses triggerPrice never price, maps closePosition and quantity
- [ ] #6 Vitest covers pagination across a window boundary, tranId/id dedupe, BNB fee conversion with cache hit, missing-kline error, and each mapping, all against recorded responses
- [ ] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
