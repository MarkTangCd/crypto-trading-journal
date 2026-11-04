---
id: TASK-54
title: 'Binance client: signed requests, error mapping, verifyKey and fetchBalance'
status: To Do
assignee: []
created_date: '2026-11-04 12:42'
updated_date: '2026-11-04 12:44'
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
- [ ] #1 server/exchange/binance/http.ts signs query strings with HMAC-SHA256, sends timestamp (local clock) and recvWindow 5000, uses Node fetch with a 15 s AbortSignal per request, base https://fapi.binance.com for futures and https://api.binance.com for apiRestrictions, and logs X-MBX-USED-WEIGHT-1M with the [Binance] prefix
- [ ] #2 Errors map to SyncErrorCode per the spec table: -2015/-2014/-2008/HTTP 401 → invalid_key, -1021 → clock_skew, HTTP 429/418 → rate_limited with retryAt from Retry-After (default 60 s), HTTP 5xx/-1001 → exchange_unavailable, connect failure/timeout → network, else unknown; raw Binance text goes into ExchangeError.detail only
- [ ] #3 verifyKey: GET /sapi/v1/account/apiRestrictions then GET /fapi/v3/balance; rejects with permissions_changed when enableReading is false or any of the nine write flags listed in the spec is true; futures_unreadable when apiRestrictions passes and the balance read fails with -2015
- [ ] #4 fetchBalance returns the USDT row as { balanceUsdt: balance, unrealizedPnlUsdt: crossUnPnl, updateTime }
- [ ] #5 server/exchange/binance/index.ts exports createBinanceAdapter(): ExchangeAdapter with the remaining methods throwing not-implemented until the next task
- [ ] #6 Vitest covers signing, timeout, each error mapping, each verifyKey branch and fetchBalance against recorded responses
- [ ] #7 scripts/binance-key-probe.mjs and scripts/binance-key-wizard.sh are committed with a two-line usage comment at the top of each
- [ ] #8 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
