---
id: TASK-93
title: Journal entry and setup DB functions
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:28'
updated_date: '2026-11-13 15:14'
labels:
  - ready-for-agent
dependencies:
  - TASK-92
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, sections Derived values and DB functions. Plain exported functions scoped by userId, no joins through the sqlite-proxy callback, multi-row writes in runInSqliteTransaction (never nested). State guards stay out of db functions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 listJournalEntries, getJournalEntry, getJournalEntryRow, listPickableTrades, getJournalEntryForTrade, createJournalEntry, updateJournalEntry, setJournalEntrySetups, addJournalEntryTrade, removeJournalEntryTrade, addSlotImage, removeSlotImage, setJournalEntryReviewedAt, deleteJournalEntry as the spec
- [x] #2 listSetups, getSetup, getSetupRow, findSetupByName (case-insensitive), createSetup, updateSetup, deleteSetup as the spec; setups ordered by lower(name)
- [x] #3 Derived values computed on read: date (min openTime), sides (distinct, openTime order), tradeCount, openTradeCount, netPnlUsd (all linked trades), actualR on get (null when any trade open, a price missing, or entry equals stop), setup usageCount
- [x] #4 deleteJournalEntry cascades images ('journal_entry', id), setup links and trade links; deleteSetup cascades images ('setup', id); both in one transaction
- [x] #5 server/journal.db.test.ts (real temp SQLite) covers every case listed in the spec's Testing section for this file
- [x] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server/db.ts new section Journal entries: types JournalEntryListItem (JournalEntry + date, sides, tradeCount, openTradeCount, netPnlUsd, setupNames), JournalEntryDetail (+ trades openTime asc, setups {id,name} by name, actualR), JournalEntrySummary.
2. Private helper loads links -> trades -> setup links -> setups for a set of entries (separate queries, no joins) and derives values; reused by list / get / forTrade. netPnlUsd and actualR via server/_core/decimal then Number().
3. Functions per doc-8: listJournalEntries (date desc), getJournalEntry, getJournalEntryRow, listPickableTrades (not-in subquery on journal_entry_trades, openTime desc), getJournalEntryForTrade, createJournalEntry (tx; accountId/symbol from earliest trade), updateJournalEntry (returns updatedAt), setJournalEntrySetups (tx), add/removeJournalEntryTrade, add/removeSlotImage (tx, bump updatedAt), setJournalEntryReviewedAt, deleteJournalEntry (tx cascade images/setup links/trade links).
4. Setups: listSetups (lower(name) asc) / getSetup with usageCount, getSetupRow, findSetupByName (lower = lower), createSetup, updateSetup, deleteSetup (tx cascade images).
5. server/journal.db.test.ts with the plan.db.test.ts harness, covering every spec Testing case for this file.
6. npm run check + npm run test; Prettier on changed .ts only; ACs, summary, Done.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Journal entry and setup DB functions in server/db.ts, per doc-8 Derived values and DB functions.

- Journal entries: getJournalEntryRow, listJournalEntries (date desc, entries without trades last), getJournalEntry, listPickableTrades (not-in subquery on journal_entry_trades, openTime desc), getJournalEntryForTrade, createJournalEntry (tx; accountId/symbol from the earliest trade; undefined when no trade is the user's), updateJournalEntry (returns updatedAt), setJournalEntrySetups (tx), add/removeJournalEntryTrade, add/removeSlotImage (tx via a shared changeSlotImages; no-ops skip the write), setJournalEntryReviewedAt, deleteJournalEntry (tx: images ('journal_entry', id), setup links, trade links, entry).
- Setups: getSetupRow, listSetups (lower(name) asc) and getSetup with usageCount, findSetupByName (lower = lower), createSetup, updateSetup, deleteSetup (tx: images ('setup', id), setup).
- Derived values computed on read in one helper (loadJournalEntryLinks + deriveJournalEntry): date, sides, tradeCount, openTradeCount, netPnlUsd (number); actualR on get via server/_core/decimal at RATIO_SCALE.
- Separate queries per table, no joins; state guards left to the router. updatedAt bumped only by writes to the entry row (fields, slots, reviewedAt), not by link changes.
- server/journal.db.test.ts: 8 real-SQLite cases covering the spec's Testing list (create + links, trade unique index, list order and derived values, actualR cases incl. mixed sides, pickable trades, slot ordering/no-ops, delete cascade, setup usage/unique index/cascade, user scoping). A mutation (dropping abs in actualR) fails the suite.

Checks: npm run check; npm run test (45 files, 511 tests).

Follow-up: deleteAccountCascade deletes an account's trades but leaves journal entries and links pointing at them (spec silent); derived values tolerate zero trades (date null).
<!-- SECTION:FINAL_SUMMARY:END -->
