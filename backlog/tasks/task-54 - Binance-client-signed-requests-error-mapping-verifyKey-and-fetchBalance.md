---
id: TASK-54
title: 'Binance client: signed requests, error mapping, verifyKey and fetchBalance'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:42'
updated_date: '2026-11-04 13:18'
labels:
  - ready-for-agent
dependencies:
  - TASK-53
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section Binance implementation and Error taxonomy. First half of the thin hand-written client (ccxt rejected): the HTTP core every endpoint shares, plus the two methods key verification needs.

Research: docs/research/binance-api-key-permissions.md on branch research/binance-api-key-permissions; docs/research/binance-position-and-balance-v3.md on branch research/binance-position-and-balance-v3. Live probe findings in task-48 (Enable Reading only is enough for all futures USER_DATA reads; order/test is rejected with -2015).

The probe and wizard scripts from task-48 live uncommitted in scripts/; commit them with this task so live checks have a home. Tests use recorded JSON responses through an injected fetch; no live call in CI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 server/exchange/binance/http.ts signs query strings with HMAC-SHA256, sends timestamp (local clock) and recvWindow 5000, uses Node fetch with a 15 s AbortSignal per request, base https://fapi.binance.com for futures and https://api.binance.com for apiRestrictions, and logs X-MBX-USED-WEIGHT-1M with the [Binance] prefix
- [x] #2 Errors map to SyncErrorCode per the spec table: -2015/-2014/-2008/HTTP 401 → invalid_key, -1021 → clock_skew, HTTP 429/418 → rate_limited with retryAt from Retry-After (default 60 s), HTTP 5xx/-1001 → exchange_unavailable, connect failure/timeout → network, else unknown; raw Binance text goes into ExchangeError.detail only
- [x] #3 verifyKey: GET /sapi/v1/account/apiRestrictions then GET /fapi/v3/balance; rejects with permissions_changed when enableReading is false or any of the nine write flags listed in the spec is true; futures_unreadable when apiRestrictions passes and the balance read fails with -2015
- [x] #4 fetchBalance returns the USDT row as { balanceUsdt: balance, unrealizedPnlUsdt: crossUnPnl, updateTime }
- [x] #5 server/exchange/binance/index.ts exports createBinanceAdapter(): ExchangeAdapter with the remaining methods throwing not-implemented until the next task
- [x] #6 Vitest covers signing, timeout, each error mapping, each verifyKey branch and fetchBalance against recorded responses
- [x] #7 scripts/binance-key-probe.mjs and scripts/binance-key-wizard.sh are committed with a two-line usage comment at the top of each
- [x] #8 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ExchangeError: add optional retryAt (ms) so rate_limited can carry Retry-After to sync (needed by AC #2; spec shape otherwise unchanged)
2. server/exchange/binance/http.ts: FAPI_BASE / SAPI_BASE, sign(query, secret) HMAC-SHA256, signedGet(creds, base, path, params, options) with timestamp = now(), recvWindow 5000, X-MBX-APIKEY header, AbortSignal.timeout(15 s); options inject fetch / now / timeoutMs for tests; logs [Binance] <path> weight=<X-MBX-USED-WEIGHT-1M>
3. mapBinanceError(status, body, retryAfter, now): 429/418 -> rate_limited (retryAt = now + Retry-After s, default 60 s); 401 or -2015/-2014/-2008 -> invalid_key; -1021 -> clock_skew; 5xx or -1001 -> exchange_unavailable; else unknown. fetch throw / timeout -> network. Raw Binance text only in detail
4. server/exchange/binance/verifyKey.ts + fetchBalance.ts (or inline in index.ts if short): apiRestrictions invalid_key -> { ok: false, invalid_key }; enableReading false or any of the 9 flags (incl. enableFutures) true -> permissions_changed; balance read invalid_key (-2015) after passing -> futures_unreadable; other errors rethrown. fetchBalance picks USDT row
5. server/exchange/binance/index.ts: createBinanceAdapter(options?) ; other 4 methods throw Error(not implemented)
6. binance.test.ts with injected fetch + recorded-shape JSON: signing (known HMAC vector + query params), timeout, every error mapping, each verifyKey branch, fetchBalance
7. Add 2-line usage comment to scripts/binance-key-probe.mjs and scripts/binance-key-wizard.sh
8. format, check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
First half of the hand-written Binance client (spec doc-4).

- server/exchange/binance/http.ts: HMAC-SHA256 signing, timestamp + recvWindow 5000, X-MBX-APIKEY, 15 s AbortSignal.timeout, fapi/sapi bases, [Binance] weight log; fetch/now/timeoutMs injectable for tests.
- mapBinanceError per the spec taxonomy; 429/418 carry retryAt from Retry-After (default 60 s). ExchangeError gains optional retryAt so sync can persist lastSyncRetryAt.
- server/exchange/binance/index.ts: createBinanceAdapter() with verifyKey (invalid_key / permissions_changed on enableReading false or any of 9 flags / futures_unreadable when balance auth fails after apiRestrictions passes; transient errors rethrown) and fetchBalance (USDT row). Other methods throw not implemented.
- binance.test.ts: 34 tests over signing (Binance doc vector), timeout, connect failure, every error mapping, every verifyKey branch, fetchBalance.
- Usage comments on scripts/binance-key-probe.mjs and scripts/binance-key-wizard.sh.
- npm run check and full suite (430) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
