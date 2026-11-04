---
id: TASK-53
title: 'ExchangeAdapter interface, ExchangeError and sync error codes'
status: To Do
assignee: []
created_date: '2026-11-04 12:42'
labels:
  - ready-for-agent
dependencies: []
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section ExchangeAdapter: the only surface the sync algorithm sees. Defining it first lets the Binance client, the reconstruction module and the sync algorithm be built and tested in parallel against a fake.

Includes a scripted fake adapter for tests (serves fixtures per method, can be told to throw a given error code).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 server/exchange/adapter.ts exports ExchangeCredentials, KeyVerification, ExchangeFill, ExchangePosition, ExchangeConditionalOrder, ExchangeBalance and ExchangeAdapter exactly as written in the spec
- [ ] #2 shared/const.ts exports SYNC_ERROR_CODES (the eight codes), the SyncErrorCode type and a TRANSIENT_SYNC_ERROR_CODES subset (rate_limited, exchange_unavailable, network)
- [ ] #3 server/exchange/errors.ts exports class ExchangeError { code: SyncErrorCode; detail: string }
- [ ] #4 server/exchange/testing/fakeAdapter.ts builds an ExchangeAdapter from fixtures (fills per symbol, positions, conditional orders per symbol, balance, verifyKey result) and can be configured to throw ExchangeError with any code from any method; it records calls
- [ ] #5 devbox run -- npm run check passes; a smoke test proves the fake adapter serves and throws as configured
<!-- AC:END -->
