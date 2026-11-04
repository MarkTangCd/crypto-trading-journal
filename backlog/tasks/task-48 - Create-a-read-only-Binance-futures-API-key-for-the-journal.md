---
id: TASK-48
title: Create a read-only Binance futures API key for the journal
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 06:46'
updated_date: '2026-11-04 11:30'
labels:
  - 'wayfinder:task'
dependencies:
  - TASK-41
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Nothing to decide: the trader must create a Binance API key with only the read permissions the research ticket names (plus a demo-fapi.binance.com testnet key if useful), so the thin client can be exercised against real data before the spec is final.

Resolution records: where the key is kept locally (never in the repo), which permissions were ticked, whether an IP restriction was set, and the testnet key status. HITL: hand the trader a precise checklist.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Author scripts/binance-key-probe.mjs: signed read-only calls (apiRestrictions, fapi balance, income, openOrders/openAlgoOrders, positionRisk, positionSide/dual) plus an opt-in POST /fapi/v1/order/test write probe; prints a redacted report.
2. Author scripts/binance-key-wizard.sh from the wizard template: Binance UI checklist, stores key in .local/binance.env (gitignored, mode 0600), runs the probe, optional testnet key.
3. Static-verify both (bash -n, node --check, shellcheck).
4. Hand off: trader runs the wizard; resolution records permissions ticked, IP restriction, storage path, testnet status, and the probe's answers to the map's UNCONFIRMED facts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Handoff (2026-11-04): assets ready, trader runs them. Uncommitted, throwaway.
- scripts/binance-key-wizard.sh: 6-stage checklist (create HMAC key with Enable Reading only; IP restriction; probe; optional write probe; optional demo testnet key; record outcome). Stores key in .local/binance.env (gitignored, mode 0600).
- scripts/binance-key-probe.mjs: signed read-only probes answering the map's UNCONFIRMED facts: apiRestrictions flags, futures balance with enableFutures=false, income symbol/tradeId presence, openOrders vs openAlgoOrders types, positionSide/dual + positionAmt sign. --write-probe runs POST /fapi/v1/order/test (validate only) for task-51 (b). --testnet targets demo-fapi.binance.com.
- Verified: bash -n, node --check, dummy-key run returns clean Binance -2008/-2014 errors; network failures are reported per probe, not thrown.
- Fact for the spec (task-49): Node fetch ignores HTTPS_PROXY. On this machine Binance is reachable only via the proxy at 127.0.0.1:1087, so the thin client must set NODE_USE_ENV_PROXY=1 (works on Node 22.22) or an undici ProxyAgent. The wizard exports it.
Run: bash scripts/binance-key-wizard.sh, then paste the probe summary lines (no secrets) here with --append-notes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done 2026-11-04 with the trader. Key: Binance system-generated HMAC, label trading-journal, Enable Reading only (Enable Futures was ticked briefly after a false probe failure, then unticked), IP unrestricted (Binance forces reading-only on unrestricted HMAC keys), no demo testnet key. Stored at .local/binance.env (gitignored, mode 0600); never in the repo. Live probe results (scripts/binance-key-probe.mjs, log in .local/binance-key-probe.log):
- apiRestrictions: enableReading=true, enableFutures=false, ipRestrict=false, no write flags.
- /fapi/v3/balance, income, openOrders, openAlgoOrders, positionSide/dual, positionRisk all succeed with enableFutures=false. CONFIRMED: futures USER_DATA reads need only Enable Reading.
- POST /fapi/v1/order/test with this key: HTTP 401 code -2015. CONFIRMED: a reading-only key is rejected on TRADE endpoints, so the write probe works as a read-only check.
- income REALIZED_PNL (14 rows) and COMMISSION (20 rows) all carry symbol and a non-zero tradeId; FUNDING_FEE carries symbol, empty tradeId.
- Account is in hedge mode; 0 open positions/orders, so openOrders migrated types and hedge SHORT positionAmt sign stay unverified (map fog).
- Node fetch ignores HTTPS_PROXY; this machine reaches Binance only via 127.0.0.1:1087, so the client needs NODE_USE_ENV_PROXY=1 (works on Node 22.22) or an undici ProxyAgent.
Wizard bug fixed in this session: it first wrote the key to .env (gitignored, untracked); keys were moved to .local/binance.env and the wizard now sets ENV_FILE unconditionally.
<!-- SECTION:FINAL_SUMMARY:END -->
