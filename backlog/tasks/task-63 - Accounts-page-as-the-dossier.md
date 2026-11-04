---
id: TASK-63
title: Accounts page as the dossier
status: To Do
assignee: []
created_date: '2026-11-04 12:43'
updated_date: '2026-11-04 12:45'
labels:
  - ready-for-agent
dependencies:
  - TASK-60
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section UI → Accounts, from task-47 (reference layout: AccountsA/B/C, LinkForm and SyncLine in client/src/pages/PrototypeExchangeSync.tsx on branch prototype/exchange-sync-ui; the decision picked the dossier variant). Read DESIGN.md and PRODUCT.md first.

This task also creates the shared sync pieces the Trades and Dashboard tasks reuse: the sync status line, the Chinese reason text per error code, and a hook wrapping account.sync that toasts 同步进行中 on CONFLICT.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 client/src/lib/syncErrors.ts maps each SyncErrorCode to a one-sentence Chinese reason; client/src/components/sync/SyncLine.tsx renders synced <ago> / never synced · sync now / ! sync failed <ago> — <reason> + last successful sync <time> · retry, in ink, never the loss hue
- [ ] #2 client/src/hooks/useSyncAccount.ts wraps account.sync: invalidates account, trade and stats queries on success, toasts 同步进行中 on CONFLICT, toast.error with the reason otherwise
- [ ] #3 Accounts page shows the selected account as a full-page record: hero wallet balance (— when null), exchange + key tail + read-only verified <date>, SyncLine, notes, linked <date> · backfilled from <date>, actions edit / replace key / unlink; other accounts as a short list; link form inline at the bottom (name, exchange fixed to binance, api key, api secret, notes)
- [ ] #4 Link-time rejection renders as one sentence under the api secret field and the form keeps its values; replace key uses the same form fields and the same rejection rendering
- [ ] #5 Unlink reads unlink · deletes its trades and the confirm dialog says AI conversations go with them
- [ ] #6 Empty state (no accounts) shows only the link form with a one-line explanation
- [ ] #7 Lowercase labels, IBM Plex Mono, tabular numerals, radius 0, no cards or shadows per DESIGN.md; devbox run -- npm run check passes and the page is exercised in the dev server
<!-- AC:END -->
