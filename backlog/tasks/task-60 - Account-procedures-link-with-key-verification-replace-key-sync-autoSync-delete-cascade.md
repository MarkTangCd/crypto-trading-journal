---
id: TASK-60
title: >-
  Account procedures: link with key verification, replace key, sync, autoSync,
  delete cascade
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 11:23'
labels:
  - ready-for-agent
dependencies:
  - TASK-54
  - TASK-59
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section tRPC surface → account. Every account is a linked account (decision-2): create verifies the key through the adapter, encrypts with server/agents/secrets.ts and inserts; no unverified-account state.

The current Accounts page posts initialBalance to account.create; to keep the client compiling, change its form fields to api key / api secret (name, notes stay) with the smallest edit possible. The dossier layout is its own task. Other readers of accounts.initialBalance stay as they are until the removal task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 account.create({ name, exchange: 'binance', apiKey, apiSecret, notes? }) verifies the key, encrypts both secrets and inserts; a failed verification throws TRPCError BAD_REQUEST whose message is the SyncErrorCode and writes nothing
- [x] #2 account.replaceKey({ id, apiKey, apiSecret }) verifies, encrypts, updates, clears lastSyncErrorCode and lastSyncRetryAt, and leaves fills, trades and cursors untouched
- [x] #3 account.update({ id, name?, notes? }); account.list / account.get return rows without apiKey/apiSecret and with apiKeyTail
- [x] #4 account.delete cascades fills, trades, conversations and messages; account.sync({ id }) calls runSync with reason manual and returns the refreshed public account; account.autoSync() returns the per-account outcome list
- [x] #5 Accounts page form posts name, apiKey, apiSecret, notes; a link-time failure renders the error code under the api secret field; the page still lists accounts
- [x] #6 server/account.test.ts updated with a mocked adapter: create success, create rejected (nothing written), replaceKey, delete cascade, secrets absent from list/get
- [x] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/types.ts: move PublicAccount type here (db.ts imports it; toPublicAccount stays in db.ts).
2. routers.ts account namespace: helper verifyAndEncryptKey (createBinanceAdapter().verifyKey; ok:false or ExchangeError -> TRPCError BAD_REQUEST message=code; encrypt both). create / replaceKey / update / list / get return toPublicAccount. replaceKey sets keyVerifiedAt, clears lastSyncErrorCode + lastSyncRetryAt. delete -> deleteAccountCascade (keep last-account guard). sync -> runSync(manual) then return refreshed public account. autoSync -> autoSync(userId).
3. db.ts: remove deleteAccountWithTransactions (now unused) and its test mocks.
4. Accounts.tsx + AccountContext.tsx: PublicAccount type; create form name/apiKey/apiSecret/notes; edit form name/notes; create onError with SyncErrorCode renders code under api secret field, else toast.
5. Tests: rewrite server/account.test.ts with mocked binance adapter (fake adapter) + mocked sync; drop duplicated account.\* block in transaction.test.ts.
6. format, check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Account procedures for linked accounts (spec doc-4, tRPC surface -> account).

- routers.ts: verifyAndEncryptKey runs adapter.verifyKey; ok:false or a thrown ExchangeError -> TRPCError BAD_REQUEST with the sync error code, nothing written. create inserts encrypted key/secret + keyVerifiedAt; replaceKey also clears lastSyncErrorCode/lastSyncRetryAt and leaves fills/trades/cursors alone; update takes name/notes only; list/get/create/update/replaceKey return toPublicAccount; delete uses deleteAccountCascade (last-account guard kept); sync runs runSync(manual) and returns the refreshed public account; autoSync returns autoSync outcomes.
- PublicAccount type moved to shared/types.ts for the client; deleteAccountWithTransactions removed (no callers).
- Accounts page: create form name/api key/api secret/notes, link-time error code rendered under api secret; edit form name/notes. AccountContext typed with PublicAccount.
- Tests: account.test.ts rewritten with the fake adapter + mocked sync (15 cases); duplicated account block and stale mocks dropped from transaction.test.ts / settings.router.test.ts.
- npm run check and npm run test (463 tests) pass.

Notes: legacy transactions of a deleted account are not removed (0 rows; table goes in task-68). Error code is shown raw; Chinese reason text belongs to the dossier task (task-63).
<!-- SECTION:FINAL_SUMMARY:END -->
