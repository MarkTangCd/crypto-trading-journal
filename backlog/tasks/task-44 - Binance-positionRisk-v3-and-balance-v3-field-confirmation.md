---
id: TASK-44
title: Binance positionRisk v3 and balance v3 field confirmation
status: Done
assignee:
  - "@claude"
created_date: "2026-11-04 06:46"
updated_date: "2026-11-04 06:53"
labels:
  - "wayfinder:research"
dependencies: []
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Question

What are the exact response fields of GET /fapi/v3/positionRisk, GET /fapi/v3/balance and GET /fapi/v3/account, and which v2 endpoints are deprecated and when?

Needed for seeding trades from positions that pre-date the backfill window (entryPrice, positionAmt, positionSide, updateTime, notional) and for the account balance snapshot (walletBalance, crossUnPnl, availableBalance for USDT). The earlier fact-check could not fetch the official positionRisk v3 page; confirm from developers.binance.com directly.

<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Resolved by research on branch research/binance-position-and-balance-v3, file docs/research/binance-position-and-balance-v3.md. Official Position-Information-V3 page could not be fetched; v3 fields confirmed from Binance's official binance-connector-js generated types instead.

Answer: GET /fapi/v3/positionRisk returns symbol, positionSide, positionAmt (signed), entryPrice, breakEvenPrice, markPrice, unRealizedProfit, liquidationPrice, isolatedMargin, notional, marginAsset, isolatedWallet, initialMargin, maintMargin, positionInitialMargin, openOrderInitialMargin, adl, bidNotional, askNotional, updateTime. No leverage / marginType anywhere in v3 (positionRisk, balance, account); only v2 positionRisk has them. No open-time field; updateTime is last-change time. GET /fapi/v3/balance per asset: accountAlias, asset, balance (the wallet balance; there is no walletBalance key here), crossWalletBalance, crossUnPnl, availableBalance, maxWithdrawAmount, marginAvailable, updateTime. GET /fapi/v3/account assets[] adds walletBalance, unrealizedProfit, marginBalance; its positions[] lack entryPrice and leverage. v2 balance/account/positionRisk announced for deprecation 2024-07-24 with no fixed date yet.

Recommendation: seed pre-window trades from v3 positionRisk rows with positionAmt != 0: entryPrice → entryPrice, |positionAmt| → quantity, side from positionAmt sign (one-way) or positionSide (hedge), |notional| → positionSizeUsdt, updateTime → openTime with openTimeApprox=true. Balance snapshot = /fapi/v3/balance row asset==USDT: balance, crossUnPnl, availableBalance, updateTime (use /fapi/v3/account marginBalance if equity is wanted).

UNCONFIRMED: official v3 positionRisk weight; whether it returns only symbols with positions/open orders; exact v2 shutdown date; sign of positionAmt for hedge-mode SHORT; whether crossUnPnl excludes isolated positions.

<!-- SECTION:FINAL_SUMMARY:END -->
