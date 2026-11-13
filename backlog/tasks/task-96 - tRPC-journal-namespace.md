---
id: TASK-96
title: tRPC journal namespace
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:28'
updated_date: '2026-11-13 15:29'
labels:
  - ready-for-agent
dependencies:
  - TASK-93
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, section tRPC surface → namespace journal (14 procedures). All publicProcedure; any write to a reviewed entry except reopen and delete → CONFLICT; state conflicts CONFLICT, input problems BAD_REQUEST.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 journal.list, get, pickableTrades, forTrade, create, update, setSetups, addTrade, removeTrade, addSlotImage, removeSlotImage, markReviewed, reopen, delete with the inputs and errors in the spec table
- [x] #2 Planned prices: trim, empty → null, else DECIMAL_PATTERN and > 0 or BAD_REQUEST; review-field writes, after-slot writes and markReviewed while openTradeCount > 0 → CONFLICT
- [x] #3 create: foreign/unknown trade NOT_FOUND, mixed symbol or account BAD_REQUEST, already linked (incl. unique-index race) CONFLICT; removeTrade of the last trade BAD_REQUEST; addSlotImage at SLOT_IMAGE_MAX BAD_REQUEST
- [x] #4 server/journal.test.ts via createCaller with vi.mock('./db') covers every CONFLICT / BAD_REQUEST / NOT_FOUND row
- [x] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server/db.ts: add getImageOwner(userId, imageId) -> { ownerKind, ownerId } | undefined (no bytes), needed by addSlotImage's ownership check; no existing function exposes an image's owner.
2. server/routers.ts helpers: plannedPrice schema (trim; '' -> null; DECIMAL_PATTERN and a non-zero digit, else BAD_REQUEST; stored trimmed, not normalized); requireEntry (getJournalEntry -> NOT_FOUND), requireUnreviewedEntry (reviewedAt -> CONFLICT), requireClosedTrades (openTradeCount > 0 -> CONFLICT); requireUnlinked(tradeIds) after a failed insert -> CONFLICT if any is linked (getJournalEntryForTrade), else rethrow.
3. journal namespace: list; get (NOT_FOUND); pickableTrades { accountId, symbol? }; forTrade { tradeId } (unknown trade NOT_FOUND, else summary ?? null); create { tradeIds min 1 unique } (getTradeById each -> NOT_FOUND, mixed symbol/account -> BAD_REQUEST, linked -> CONFLICT via insert failure + re-check); update (unreviewed; review fields while trades open -> CONFLICT; returns { updatedAt }); setSetups { setupIds unique } (getSetupRow each -> NOT_FOUND); addTrade (NOT_FOUND trade, symbol/account differ -> BAD_REQUEST, linked -> CONFLICT); removeTrade (not linked to this entry -> NOT_FOUND, last -> BAD_REQUEST); addSlotImage (image owner must be (journal_entry, id) -> NOT_FOUND, after while open -> CONFLICT, full slot -> BAD_REQUEST unless already present; returns { imageIds }); removeSlotImage (after while open -> CONFLICT; returns { imageIds }); markReviewed (reviewed or open -> CONFLICT); reopen (not reviewed -> CONFLICT); delete (NOT_FOUND).
4. server/journal.test.ts: createCaller + vi.mock('./db') covering every error row, price normalisation, review-field locking, create race.
5. format changed files, check, full test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds the journal tRPC namespace (14 procedures) for the Trade journal.

- server/routers.ts: journal.list, get, pickableTrades, forTrade, create, update, setSetups, addTrade, removeTrade, addSlotImage, removeSlotImage, markReviewed, reopen, delete; all publicProcedure.
- Guards: requireEntry (NOT_FOUND), requireUnreviewedEntry (every write except reopen/delete on a reviewed entry -> CONFLICT), requireClosedTrades (review fields, after slot and markReviewed while openTradeCount > 0 -> CONFLICT), requireTrade (NOT_FOUND).
- plannedPrice schema: trim, blank -> null, DECIMAL_PATTERN plus a non-zero digit else BAD_REQUEST; stored as typed, not normalized.
- linkTrades(): create/addTrade insert first; on failure, if getJournalEntryForTrade finds any of the trades linked -> CONFLICT (covers pre-existing links and unique-index races), else rethrow.
- create: tradeIds min 1 and distinct; unknown/foreign trade NOT_FOUND; mixed symbol or account BAD_REQUEST. removeTrade: not linked NOT_FOUND, last trade BAD_REQUEST. setSetups: setupIds distinct, unknown setup NOT_FOUND. addSlotImage: image must be owned by (journal_entry, id) else NOT_FOUND; full slot BAD_REQUEST unless the image is already in it. Slot procedures return { imageIds }; other writes { success: true }, update { updatedAt }.
- server/db.ts: getImageOwner(userId, imageId) -> { ownerKind, ownerId } without bytes (no existing function exposed an image's owner).
- server/journal.test.ts: 63 createCaller cases with vi.mock('./db') covering every CONFLICT / BAD_REQUEST / NOT_FOUND row, price handling, review-field locking and the create race.

Verified: npm run check and the full suite (608 tests) pass; the new test files also type-check.
<!-- SECTION:FINAL_SUMMARY:END -->
