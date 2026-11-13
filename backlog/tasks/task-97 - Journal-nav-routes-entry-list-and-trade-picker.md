---
id: TASK-97
title: 'Journal nav, routes, entry list and trade picker'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 14:28'
updated_date: '2026-11-13 15:37'
labels:
  - ready-for-agent
dependencies:
  - TASK-96
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, sections Locked decisions 1, 7, 12 and Pages → /journal and Picker. Read DESIGN.md and PRODUCT.md first. The entry and setups pages are lazy placeholders here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sidebar order Goals → Plans → Trades → Journal → Pre-Trade; routes /journal, /journal/setups, /journal/:id in App.tsx (setups before :id), the last two React.lazy placeholders
- [x] #2 /journal: title, 'n entries · m to review', header 'setups' and 'new entry →'; column table date (UTC+8) · symbol (· account when not selected) · side(s) 'short / long' · setups ('—') · trades · net pnl · state ('● to review' / '● n open' / muted 'reviewed'); rows link; tabular numerals
- [x] #3 Picker replaces the table in place ('new entry →', ?new=1, ?pick=<tradeId> preselects): symbol search, checkbox column, opened · symbol · status · position · pnl; other symbols dim after the first tick with the one-line explanation; 'create entry with n trade(s) →' disabled with 'tick at least one trade'; cancel; create jumps to /journal/:id
- [x] #4 Verified on the :3100 temp-DB dev server against prototype variant B (branch prototype/journal-ui, VariantB.tsx); explicit empty/loading states; failures toast.error, no success toasts
- [x] #5 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. DashboardLayout: Journal (BookOpen) between Trades and Pre-Trade.
2. App.tsx: /journal -> Journal; /journal/setups and /journal/:id -> React.lazy placeholders (JournalSetups.tsx, JournalEntry.tsx), setups before :id; share one Suspense spinner fallback with PlanDetail.
3. pages/Journal.tsx: list from journal.list (title, counts, header links, column table, explicit empty + loading states); account suffix via useAccount().accounts.
4. Picker in the same file, URL-driven (?new=1 opens, ?pick=<id> preselects, cancel -> /journal): journal.pickableTrades for the selected account, symbol search, checkbox column, symbol lock with explanation, create -> journal.create, invalidate list/pickableTrades, jump to /journal/:id; toast.error on failure; no success toast.
5. Verify on :3100 temp-DB dev server with Playwright screenshots against VariantB; prettier on changed files, npm run check, npm run test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Journal nav, routes, entry list and trade picker.

- Sidebar: Journal (BookOpen) between Trades and Pre-Trade.
- App.tsx: /journal, /journal/setups, /journal/:id (setups first); the last two are React.lazy placeholders (JournalSetups.tsx, JournalEntry.tsx) sharing one LAZY_FALLBACK spinner with PlanDetail.
- pages/Journal.tsx: title with 'n entries · m to review', header 'setups' / 'new entry →'; column table (date UTC+8, symbol with '· account' when not the selected one, sides 'long / short', setups or '—', trades, net pnl, state '● to review' / '● n open' / muted 'reviewed'); whole row navigates, date cell is the keyboard link; spinner, error line and explicit empty state.
- Picker is URL-driven (?new=1 opens, ?pick=<id> preselects, cancel -> /journal): journal.pickableTrades for the selected account, symbol search, checkbox column, other symbols dim and disable after the first tick with a one-line explanation, 'create entry with n trade(s) →' disabled as 'tick at least one trade'; create invalidates journal.list / pickableTrades and jumps to /journal/:id; failures toast.error, no success toast. Ticks not in the pickable list (other account, already linked) are dropped; no linked account shows 'link one →'.

Verified on a :3100 temp-DB dev server with seeded accounts/trades via Playwright: list, picker, symbol lock, search, cancel, ?pick preselect + create jump, row click, foreign ?pick ignored, empty state; no console errors. npm run check and npm run test (47 files, 608 tests) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
