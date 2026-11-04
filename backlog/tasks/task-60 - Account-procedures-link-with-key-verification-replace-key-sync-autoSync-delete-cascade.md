---
id: TASK-60
title: >-
  Account procedures: link with key verification, replace key, sync, autoSync,
  delete cascade
status: To Do
assignee: []
created_date: '2026-11-04 12:43'
updated_date: '2026-11-04 12:44'
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
- [ ] #1 account.create({ name, exchange: 'binance', apiKey, apiSecret, notes? }) verifies the key, encrypts both secrets and inserts; a failed verification throws TRPCError BAD_REQUEST whose message is the SyncErrorCode and writes nothing
- [ ] #2 account.replaceKey({ id, apiKey, apiSecret }) verifies, encrypts, updates, clears lastSyncErrorCode and lastSyncRetryAt, and leaves fills, trades and cursors untouched
- [ ] #3 account.update({ id, name?, notes? }); account.list / account.get return rows without apiKey/apiSecret and with apiKeyTail
- [ ] #4 account.delete cascades fills, trades, conversations and messages; account.sync({ id }) calls runSync with reason manual and returns the refreshed public account; account.autoSync() returns the per-account outcome list
- [ ] #5 Accounts page form posts name, apiKey, apiSecret, notes; a link-time failure renders the error code under the api secret field; the page still lists accounts
- [ ] #6 server/account.test.ts updated with a mocked adapter: create success, create rejected (nothing written), replaceKey, delete cascade, secrets absent from list/get
- [ ] #7 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
