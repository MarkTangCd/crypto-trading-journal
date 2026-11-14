---
id: TASK-104
title: Journal section on the trade detail page
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:30'
updated_date: '2026-11-14 02:21'
labels:
  - ready-for-agent
dependencies:
  - TASK-96
  - TASK-97
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decision 1 (trade side) and Pages → Trade detail. The trade list gets no new column.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 client/src/pages/TradeDetail.tsx ends with a 'journal' section from journal.forTrade: one row linking to the entry (date, setups, trade count, state)
- [x] #2 Unlinked trade: 'this trade is not in a journal entry.' with 'new journal entry →' to /journal?new=1&pick=<id>, which opens the picker with that trade ticked
- [x] #3 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [x] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TradeDetail.tsx: add a JournalSection component, rendered last, querying trpc.journal.forTrade({ tradeId }) (retry: false).
2. Linked: SectionHeader 'journal' + one Link row to /journal/:id, layout per VariantB TradeLinkB: date (fmtDayTime, UTC+8) · setups joined (or 'no setup') · n trade(s) · state ('● unreviewed' / muted 'reviewed', from forTrade.state as the spec defines it) · →.
3. Unlinked: 'this trade is not in a journal entry.' + Link 'new journal entry →' to /journal?new=1&pick=<id> (picker preselect already exists from task-97).
4. Loading: inline spinner in the section. No mutations here, so no toasts; a query failure shows an inline 'failed to load journal: <message>' line like the /journal list.
5. Verify on :3100 temp-DB dev server (linked/unlinked/reviewed, pick preselect) with Playwright screenshots; format changed files, npm run check, npm run test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trade detail now closes with a 'journal' section (client/src/pages/TradeDetail.tsx, JournalSection) fed by journal.forTrade.

- Linked trade: one row linking to /journal/:id, laid out like prototype variant B TradeLinkB: date (UTC+8 day hh:mm) · setup names or 'no setup' · n trade(s) · '● unreviewed' / muted 'reviewed'.
- Unlinked trade: 'this trade is not in a journal entry.' with 'new journal entry →' to /journal?new=1&pick=<id>; the existing picker preselects the trade.
- Loading shows an inline spinner; a query failure shows 'failed to load journal: <message>' inline. No mutations here, so no toasts.
- Deviation from the prototype: state reads unreviewed/reviewed because forTrade returns only state (per spec), not openTradeCount.

Verified on a :3100 temp-DB dev server with seeded trades (unreviewed linked, reviewed linked, unlinked, picker preselect, row navigation, 400px width), no console errors. npm run check and npm run test (608 tests) pass. No backend changes.
<!-- SECTION:FINAL_SUMMARY:END -->
