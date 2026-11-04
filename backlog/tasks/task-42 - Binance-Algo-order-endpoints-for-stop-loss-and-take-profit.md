---
id: TASK-42
title: Binance Algo order endpoints for stop loss and take profit
status: Done
assignee:
  - '@claude'
created_date: '2026-11-04 06:46'
updated_date: '2026-11-04 06:55'
labels:
  - 'wayfinder:research'
dependencies: []
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What exactly do GET /fapi/v1/openAlgoOrders and GET /fapi/v1/allAlgoOrders return, and how far back does allAlgoOrders reach?

Needed so a sync can read the live stop-loss / take-profit conditional orders of an open position (triggerPrice, orderType, closePosition, reduceOnly, positionSide, algoStatus, quantity) and so we know whether SL/TP can ever be recovered for an already-closed trade. Also confirm which conditional order types moved to the Algo Service on 2025-12-09 and whether regular /fapi/v1/openOrders still lists any of them. Primary sources only.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolved by research on branch research/binance-algo-orders, file docs/research/binance-algo-orders.md (fields read from the docs' OpenAPI spec bundle + binance-connector-js).

Answer: since 2025-12-09 STOP_MARKET, TAKE_PROFIT_MARKET, STOP, TAKE_PROFIT and TRAILING_STOP_MARKET live in the Algo Service (POST /fapi/v1/order returns -4120 for them). GET /fapi/v1/openAlgoOrders (weight 1 with symbol, 40 without; params algoType, symbol, algoId) and GET /fapi/v1/allAlgoOrders (weight 5, symbol required, <7-day window, limit ≤1000) return the same fields: algoId, clientAlgoId, algoType, orderType, symbol, side, positionSide, timeInForce, quantity, algoStatus (NEW/CANCELED/TRIGGERING/TRIGGERED/FINISHED/REJECTED/EXPIRED), actualOrderId, actualPrice, triggerPrice, price, tpTriggerPrice, tpPrice, slTriggerPrice, slPrice, tpOrderType, workingType, priceMatch, closePosition, priceProtect, reduceOnly, createTime, updateTime, triggerTime, goodTillDate. History: unfilled cancelled/expired orders vanish after 3 days, everything after 90 days. User data stream gained an ALGO_UPDATE event (not used in v1).

Recommendation: each sync, for every symbol with an open position call openAlgoOrders(symbol), keep algoStatus=NEW, match symbol + positionSide; orderType STOP/STOP_MARKET → stopLossPrice, TAKE_PROFIT/TAKE_PROFIT_MARKET → takeProfitPrice, always from triggerPrice (not price); ignore TRAILING_STOP_MARKET. Several candidates: prefer closePosition=true, else the level nearest the mark price. Quantity-based orders count only if quantity covers the whole position; ladders do not reduce to one price (leave null). For trades first seen closed, allAlgoOrders can recover a TRIGGERED order up to 90 days back and a cancelled one only 3 days back, so the planned 'snapshot every sync while open, freeze at close' stays the primary path; allAlgoOrders is a best-effort fallback for backfilled closed trades.

UNCONFIRMED: whether live /fapi/v1/openOrders still returns any migrated type; meaning of tpTriggerPrice/slTriggerPrice/tpOrderType; whether closePosition orders report quantity 0.
<!-- SECTION:FINAL_SUMMARY:END -->
