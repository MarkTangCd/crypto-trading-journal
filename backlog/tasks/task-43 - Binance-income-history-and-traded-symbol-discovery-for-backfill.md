---
id: TASK-43
title: Binance income history and traded-symbol discovery for backfill
status: Done
assignee:
  - "@claude"
created_date: "2026-11-04 06:46"
updated_date: "2026-11-04 06:54"
labels:
  - "wayfinder:research"
dependencies: []
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Question

GET /fapi/v1/userTrades requires a symbol. How does a 30-day backfill discover which symbols the account traded, and what does GET /fapi/v1/income offer for that?

Confirm: the full incomeType list; max startTime–endTime window and history depth of /income; whether REALIZED_PNL / COMMISSION rows carry symbol and tradeId; request weight budget for 30 days × N symbols × 7-day userTrades windows against the 2400/min futures limit; whether the async download endpoints (/fapi/v1/trade/asyn) are a sane alternative. Primary sources only.

<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Resolved by research on branch research/binance-income-and-symbol-discovery, file docs/research/binance-income-and-symbol-discovery.md. incomeType enum taken from the first-party binance-connector-js client (docs page collapses it).

Answer: GET /fapi/v1/income has 23 incomeType values (REALIZED_PNL, COMMISSION, FUNDING_FEE, TRANSFER, …), weight 30, limit ≤1000, last 7 days when no times given, 3-month depth, no fromId/page param (page by advancing startTime, dedupe on incomeType+tranId); max span not stated (assume 7 days). Rows carry symbol and tradeId only 'if existing' with no per-type guarantee. GET /fapi/v1/userTrades: weight 5, symbol required, ≤7-day span, fromId cannot combine with times, 3-month depth. REQUEST_WEIGHT limit 2400/min per IP (confirm live via exchangeInfo rateLimits); 429 → back off, else 418 ban. Async download endpoints cost 1000 weight each with monthly quotas of 100/5/10 shared with the website: not a sane default, at most an opt-in for data older than 3 months.

Recommendation — backfill: (1) income with no symbol/type, limit 1000, five 7-day windows, collect distinct symbols from REALIZED_PNL + COMMISSION + FUNDING_FEE rows (COMMISSION matters because opening fills have no PnL); (2) userTrades per symbol over the same five windows paging by startTime. Worked estimate: 5 symbols × 30 days ≈ 335 weight, 50 symbols ≈ 1460, both inside one minute. Incremental sync: income from cursor minus a small overlap in ≤7-day windows, then userTrades only for symbols with new income rows or open positions (≈30 + 5K weight). Offer a user-supplied symbol list as fallback. Sync at least every few weeks or the 3-month cap creates gaps.

UNCONFIRMED: income max span; whether REALIZED_PNL/COMMISSION rows populate symbol and tradeId (verify with one live call once a key exists); same-millisecond rows at page boundaries; live weight limit value.

<!-- SECTION:FINAL_SUMMARY:END -->
