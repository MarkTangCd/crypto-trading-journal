---
id: TASK-41
title: Binance API key permissions and read-only verification
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
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Question

Which Binance API key permissions does a linked account need to read USDⓈ-M futures fills, positions, conditional orders and balance, and how can the server prove at save time that a key is read-only (no trade/withdraw permission)?

Cover: exact permission names in the Binance key UI; whether 'Enable Futures' is required for read-only futures endpoints; which endpoint returns the key's own permissions (e.g. /sapi/v1/account/apiRestrictions) and whether a futures-only key can call it; HMAC vs RSA vs Ed25519 key types; whether keys without an IP restriction expire after 90 days; sub-account key differences. Primary sources only (developers.binance.com).

<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Resolved by research on branch research/binance-api-key-permissions, file docs/research/binance-api-key-permissions.md (all claims cited).

Answer: a key's own permissions are readable via signed GET /sapi/v1/account/apiRestrictions (weight 1) on api.binance.com, returning enableReading, enableFutures, enableWithdrawals, enableInternalTransfer, enableMargin, enableSpotAndMarginTrading, enableVanillaOptions, enablePortfolioMarginTrading, enableFixApiTrade, permitsUniversalTransfer, ipRestrict. enableFutures is ONE flag: it does not split futures read from futures trade, so the API cannot prove a futures key is read-only. All fapi endpoints the journal needs (userTrades, orders, algo orders, positionRisk v3, balance v3) are USER_DATA; order placement/cancel and leverage changes are TRADE. HMAC keys are system-generated; Ed25519/RSA self-generated. An HMAC key without IP restriction may only have Enable Reading. The 90-day expiry rule applied only to Spot & Margin trading permission and Binance marks it no longer applicable since 2023-10-24; no official expiry for read-only keys.

Recommendation: trader creates an HMAC key with Enable Reading only (plus optional IP restriction); server at save time calls apiRestrictions and rejects if enableReading is false or any withdraw/transfer/margin/spot-trade/options/PM/FIX flag is true; smoke-reads /fapi/v3/balance; the spec must decide whether enableFutures=true is a warning or a rejection (depends on UNCONFIRMED: whether futures read endpoints work with enableFutures=false). Optional write probe via POST /fapi/v1/order/test. Re-run the check at the start of every sync.

UNCONFIRMED: whether futures reads need enableFutures; whether a futures-only key can call apiRestrictions; Ed25519 on fapi; sub-account key behaviour.

<!-- SECTION:FINAL_SUMMARY:END -->
