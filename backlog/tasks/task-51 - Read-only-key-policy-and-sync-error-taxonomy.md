---
id: TASK-51
title: Read-only key policy and sync error taxonomy
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 06:56"
updated_date: "2026-11-04 12:24"
labels:
  - "wayfinder:grilling"
dependencies:
  - TASK-48
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Question

Binance cannot prove a futures key is read-only (enableFutures is one flag, see the API-key research). What does the journal accept at save time, and how are sync failures classified and shown?

Grill: (a) enableFutures=true → reject, or accept with a warning? Hinges on whether futures read endpoints work with enableFutures=false, which the key task will have tested live. (b) Should the server run the POST /fapi/v1/order/test write probe? (c) Error taxonomy for the one-line sync error: invalid/revoked key, permission lost, rate-limited (429/418), network, exchange maintenance, partial backfill. (d) Does a permission failure block the whole sync or only mark the account?

<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Grilled with the trader 2026-11-04, three rounds, all recommendations accepted.

Key verification (at link, at replace key, and at the start of every sync):

- GET /sapi/v1/account/apiRestrictions + one GET /fapi/v3/balance smoke read. No POST /fapi/v1/order/test write probe.
- Reject (account not created / sync aborted) if enableReading=false or ANY of enableFutures, enableWithdrawals, enableInternalTransfer, enableMargin, enableSpotAndMarginTrading, enableVanillaOptions, enablePortfolioMarginTrading, enableFixApiTrade, permitsUniversalTransfer is true. Strict: no warn-and-accept mode (task-48 proved futures reads work with enableFutures=false).
- Non-permission failures at link time use the same error codes, shown under the secret field; no unverified-account state.
- accounts.keyVerifiedAt updated on every pass; key tail (4 chars) derived from the decrypted apiKey at read time, not stored.
- Replace key re-runs verification; on success clears lastSyncErrorCode; trades and cursor untouched.

Sync error taxonomy (8 codes; reason text generated client-side in Chinese from the code, status-line skeleton stays the prototype's lowercase English):

- invalid_key (-2015/-2014/-2008/HTTP 401): key invalid, revoked, or this machine's IP not whitelisted. Needs human.
- permissions_changed (apiRestrictions shows a write flag or enableReading=false): needs human.
- futures_unreadable (apiRestrictions passes, balance read -2015): account has no USDⓈ-M futures or key predates it / Portfolio Margin on. Needs human.
- clock_skew (-1021): local clock off by more than recvWindow 5 s; no server-time self-correction in v1. Needs human.
- rate_limited (429/418): lastSyncRetryAt from Retry-After, 60 s default; auto-sync skips until then. Transient.
- exchange_unavailable (5xx/-1001/maintenance): transient.
- network (connect failure, timeout, proxy): per-request timeout 15 s, no whole-run timeout. Transient.
- unknown: anything else; full response logged server-side with [Sync] prefix, never the key/secret; raw Binance text never stored or shown.

Sync semantics:

- A sync run is atomic: any failure rolls back fills, trades, cursor, balance; no partial-backfill state. Idempotent by fill id so retry is cheap. Backfill stays ~335 weight of 2400/min, so no proactive throttling off X-MBX-USED-WEIGHT-1M in v1.
- Per account: auto-sync on opening the trade list runs each linked account independently; a failure marks only that account.
- Persisted on accounts: lastSyncAttemptAt, lastSyncErrorCode (nullable, cleared on success), lastSyncRetryAt (nullable), keyVerifiedAt, plus the existing lastSyncedAt. No error history.
- Stale = last successful sync older than 5 minutes. Auto-sync fires only for stale accounts whose last error is null or transient (rate_limited after lastSyncRetryAt, exchange_unavailable, network); needs-human codes retry only via the manual button / 'retry' link.
- Concurrent sync on one account: in-process in-flight set; second call throws TRPCError CONFLICT, client toasts '同步进行中', not recorded as an attempt.
- No separate ADR for the key policy (easily reversible); it lives in the Exchange sync spec (task-49). GLOSSARY.md gains 'Key verification' and 'Stale'.
<!-- SECTION:FINAL_SUMMARY:END -->
