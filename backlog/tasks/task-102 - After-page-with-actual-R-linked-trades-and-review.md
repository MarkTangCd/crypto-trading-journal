---
id: TASK-102
title: 'After page with actual R, linked trades and review'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:30'
updated_date: '2026-11-14 01:25'
labels:
  - ready-for-agent
dependencies:
  - TASK-101
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, Locked decisions 4, 5, 13 and Pages → /journal/:id right page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Right page 'after · actual r': actual R hero tinted by sign ('open' while trades are open), 'net pnl · formula' line
- [x] #2 Linked trades: unlink on hover while unreviewed and more than one; '+ add trade' lists journal.pickableTrades for the entry's account and symbol
- [x] #3 Review: while any trade is open a 'waiting for n open trade(s) to close' line with the review fields dimmed and locked (content kept); once all closed the static Chinese prompt block verbatim, after screenshots (ImageSlot), mistakes, rules followed or broken, management decisions, notes for next time
- [x] #4 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [x] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. JournalEntry.tsx: extend the local Entry type with netPnlUsd and actualR; replace the right-page placeholder with an AfterPage component.
2. Hero: 'after · actual r' label; text-display value 'open' while trades are open, else signed '+1.23r' tinted win/loss (or '—'); line 'net <pnl>' + ' · n of m trades still open' / ' · set entry and stop to measure r' / ' · entry equals stop' / ' · pnl / (|entry − stop| × qty)'.
3. LinkedTrades: 'linked trades · n' block, rows 'day hh:mm · side qty @ entry → exit · pnl|open', hover/focus unlink x while unreviewed and n > 1 (journal.removeTrade). '+ add trade' opens an inline list from journal.pickableTrades({ accountId, symbol }) (loading line, empty 'no unlinked <symbol> trades in this account.'), click -> journal.addTrade, cancel. Invalidate journal.get, journal.list, journal.pickableTrades; failures toast.error.
4. Review: open trades -> 'waiting for n open trade(s) to close…' line; else the verbatim Chinese prompt block (doc-7 Notes). Below it, always mounted: after screenshots (ScreenshotSlot slot 'after') and the four review rich fields (mistakes, rules, managementDecisions, nextTime) with autosave like the before page; editable only while unreviewed and all closed; dimmed (opacity) while trades are open, content kept.
5. Verify on :3100 temp DB with Playwright against VariantB: open trade (locked), add/unlink trades, all closed (prompts, editable review, after screenshots), actual R tint for +/-, reviewed read-only.
6. Format changed files, npm run check, npm run test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fills the right page of /journal/:id (client/src/pages/JournalEntry.tsx).

- AfterPage: 'after · actual r' hero showing 'open' while trades are open, else signed '+0.25r' tinted win/loss (or '—'); 'net <pnl> · …' line with 'n of m trades still open', 'set entry and stop to measure r', 'entry equals stop' or the formula.
- LinkedTrades: 'linked trades · n' rows (open time, side qty @ entry → exit, pnl or 'open'), hover/focus unlink while unreviewed and more than one (journal.removeTrade); '+ add trade' lists journal.pickableTrades for the entry's account and symbol with loading and empty lines, click -> journal.addTrade, cancel. Invalidates journal.get / list / pickableTrades / forTrade; failures toast.error.
- Review: 'waiting for n open trade(s) to close…' line while trades are open, else the verbatim doc-7 Chinese prompt block. After screenshots (ScreenshotSlot 'after') and the four review rich fields (autosave like the before page) stay mounted, editable only while unreviewed with every trade closed, dimmed while locked so written content stays visible.
- Local Entry type gains netPnlUsd and actualR; local Pnl / tradeLine helpers as on the list page.

Verified on the :3100 temp-DB dev server with Playwright: prices -> +1.00r win tint; review text autosaved; adding an open trade locks the review (hero 'open', prompts hidden, text kept, editors read-only); unlinking unlocks; adding a closed short -> +0.25r; after screenshot saved to afterImageIds; ETH entry -1.00r loss tint and empty add list; reviewed entry read-only with no add/unlink; 400px stacks; no toasts or page errors. npm run check and npm run test (608) pass.

Not in scope: mark reviewed / reopen / delete footer (task-103).
<!-- SECTION:FINAL_SUMMARY:END -->
