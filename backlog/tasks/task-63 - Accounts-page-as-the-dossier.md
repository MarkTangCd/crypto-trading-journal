---
id: TASK-63
title: Accounts page as the dossier
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 12:31'
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
- [x] #1 client/src/lib/syncErrors.ts maps each SyncErrorCode to a one-sentence Chinese reason; client/src/components/sync/SyncLine.tsx renders synced <ago> / never synced · sync now / ! sync failed <ago> — <reason> + last successful sync <time> · retry, in ink, never the loss hue
- [x] #2 client/src/hooks/useSyncAccount.ts wraps account.sync: invalidates account, trade and stats queries on success, toasts 同步进行中 on CONFLICT, toast.error with the reason otherwise
- [x] #3 Accounts page shows the selected account as a full-page record: hero wallet balance (— when null), exchange + key tail + read-only verified <date>, SyncLine, notes, linked <date> · backfilled from <date>, actions edit / replace key / unlink; other accounts as a short list; link form inline at the bottom (name, exchange fixed to binance, api key, api secret, notes)
- [x] #4 Link-time rejection renders as one sentence under the api secret field and the form keeps its values; replace key uses the same form fields and the same rejection rendering
- [x] #5 Unlink reads unlink · deletes its trades and the confirm dialog says AI conversations go with them
- [x] #6 Empty state (no accounts) shows only the link form with a one-line explanation
- [x] #7 Lowercase labels, IBM Plex Mono, tabular numerals, radius 0, no cards or shadows per DESIGN.md; devbox run -- npm run check passes and the page is exercised in the dev server
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. client/src/lib/syncErrors.ts: SYNC_ERROR_REASONS (8 codes -> one Chinese sentence) + syncErrorReason(message) helper.
2. client/src/components/sync/SyncLine.tsx: from PublicAccount; synced <ago> · sync now / never synced · sync now / ! sync failed <ago> — <reason> + last successful sync <time> · retry; text-label ink only; syncing… while pending.
3. client/src/hooks/useSyncAccount.ts: account.sync mutation; success -> invalidate account, trade, stats; error CONFLICT -> toast 同步进行中, else toast.error(reason); account queries also invalidated on error so the persisted failure shows.
4. Accounts.tsx rewrite as dossier (AccountsB): header name + 'binance usdⓈ-m · key ····tail · read-only verified <date>'; hero wallet balance (— when null); SyncLine; notes; linked <date> · backfilled from <date>; actions edit / replace key / unlink · deletes its trades (dialogs; unlink hidden for the last account); other accounts short list with select →; inline link form at bottom (name, exchange fixed, api key, api secret + rejection sentence, notes), values kept on error; on success select the new account (+ first sync, pending decision). Empty state: link form + one line.
5. Shared KeyFields for link + replace key.
6. prettier on touched files, check, test; exercise in dev server (Playwright screenshot to scratchpad).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Accounts page as the dossier (spec doc-4 UI -> Accounts; prototype AccountsB) plus the shared sync pieces.

- lib/syncErrors.ts: SYNC_ERROR_REASONS (8 codes -> one Chinese sentence), isSyncErrorCode, syncErrorReason.
- components/sync/SyncLine.tsx: synced <ago> · sync now / never synced · sync now / ! sync failed <ago> — <reason> + last successful sync <time|never> · retry; ink only; syncing… while pending.
- hooks/useSyncAccount.ts: account.sync; success invalidates account/trade/stats; CONFLICT -> toast 同步进行中; other errors -> toast.error(reason) and account refetch so the persisted failure shows (agreed deviation).
- pages/Accounts.tsx: selected account record (name; binance usdⓈ-m · key ····tail · read-only verified <date>; hero wallet balance or —; SyncLine; notes; linked <date> · backfilled from <date>|not backfilled yet; edit / replace key / unlink · deletes its trades). Other accounts as a short list with select →. Inline link form (name, exchange fixed, api key, api secret, notes); on success selects the new account and starts the first sync (agreed). Key rejection rendered as one sentence under api secret with values kept, shared by link and replace key (KeyFields). Unlink dialog says trades and AI review conversations go with it; hidden for the last account. Empty state: link form + one line.
- Gotcha fixed: cn()/tailwind-merge drops text-display next to a text-* color class, so the hero uses a plain class string.
- Verified in the running dev server with Playwright (desktop + 390px): link and replace-key rejection with a junk key render the invalid_key sentence and keep values; sync on the legacy keyless account toasts the server error. Empty state and unlink not exercised live (would delete local data).
- npm run check and npm run test (484) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
