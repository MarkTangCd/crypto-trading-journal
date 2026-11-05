---
id: TASK-53
title: "ExchangeAdapter interface, ExchangeError and sync error codes"
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 12:42"
updated_date: "2026-11-04 13:09"
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

- [x] #1 server/exchange/adapter.ts exports ExchangeCredentials, KeyVerification, ExchangeFill, ExchangePosition, ExchangeConditionalOrder, ExchangeBalance and ExchangeAdapter exactly as written in the spec
- [x] #2 shared/const.ts exports SYNC_ERROR_CODES (the eight codes), the SyncErrorCode type and a TRANSIENT_SYNC_ERROR_CODES subset (rate_limited, exchange_unavailable, network)
- [x] #3 server/exchange/errors.ts exports class ExchangeError { code: SyncErrorCode; detail: string }
- [x] #4 server/exchange/testing/fakeAdapter.ts builds an ExchangeAdapter from fixtures (fills per symbol, positions, conditional orders per symbol, balance, verifyKey result) and can be configured to throw ExchangeError with any code from any method; it records calls
- [x] #5 devbox run -- npm run check passes; a smoke test proves the fake adapter serves and throws as configured
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. shared/const.ts: add SYNC_ERROR_CODES (8 codes, as const), SyncErrorCode type, TRANSIENT_SYNC_ERROR_CODES (rate_limited, exchange_unavailable, network)
2. server/exchange/adapter.ts: copy the spec interfaces verbatim
3. server/exchange/errors.ts: class ExchangeError extends Error { code; detail }, message = code: detail
4. server/exchange/testing/fakeAdapter.ts: createFakeAdapter(fixtures) -> { adapter, calls }; fixtures = verifyKey, fills per symbol, positions, conditionalOrders per symbol, balance, throws per method (SyncErrorCode); fetchFills filters by [from, to]; discoverSymbols derived from fill symbols in window + max fill time; every call recorded as { method, args }
5. server/exchange/testing/fakeAdapter.test.ts smoke test: serves fixtures, throws ExchangeError with configured code, records calls
6. format, check, run test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Add the ExchangeAdapter contract for Exchange sync (spec doc-4).

- server/exchange/adapter.ts: spec interfaces verbatim.
- shared/const.ts: SYNC_ERROR_CODES, SyncErrorCode, TRANSIENT_SYNC_ERROR_CODES.
- server/exchange/errors.ts: ExchangeError extends Error { code, detail }.
- server/exchange/testing/fakeAdapter.ts: createFakeAdapter(fixtures) -> { adapter, calls }; fetchFills filters by [from, to]; discoverSymbols is derived from fill fixtures in the window; throws config maps any method to an ExchangeError code; every call recorded.
- Smoke test fakeAdapter.test.ts. npm run check and the full test suite (396) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
