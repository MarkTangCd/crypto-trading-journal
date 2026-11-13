---
id: TASK-93
title: Journal entry and setup DB functions
status: To Do
assignee: []
created_date: '2026-11-13 14:28'
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
- [ ] #1 listJournalEntries, getJournalEntry, getJournalEntryRow, listPickableTrades, getJournalEntryForTrade, createJournalEntry, updateJournalEntry, setJournalEntrySetups, addJournalEntryTrade, removeJournalEntryTrade, addSlotImage, removeSlotImage, setJournalEntryReviewedAt, deleteJournalEntry as the spec
- [ ] #2 listSetups, getSetup, getSetupRow, findSetupByName (case-insensitive), createSetup, updateSetup, deleteSetup as the spec; setups ordered by lower(name)
- [ ] #3 Derived values computed on read: date (min openTime), sides (distinct, openTime order), tradeCount, openTradeCount, netPnlUsd (all linked trades), actualR on get (null when any trade open, a price missing, or entry equals stop), setup usageCount
- [ ] #4 deleteJournalEntry cascades images ('journal_entry', id), setup links and trade links; deleteSetup cascades images ('setup', id); both in one transaction
- [ ] #5 server/journal.db.test.ts (real temp SQLite) covers every case listed in the spec's Testing section for this file
- [ ] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
