---
id: TASK-88
title: Prototype the Journal pages
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 12:47'
updated_date: '2026-11-13 13:35'
labels:
  - 'wayfinder:prototype'
dependencies: []
references:
  - backlog/docs/doc-7 - Trade-journal-map.md
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How should the Journal look and behave, inside DESIGN.md (watchmaker's notebook, paper-pale, mono-forward, no cards, no shadows, lowercase labels)? Build a throwaway prototype through /impeccable (read PRODUCT.md and DESIGN.md first) on a prototype/journal-ui branch, with fake data, and iterate with the trader until one variant is chosen. Pages and pieces to decide:

- `/journal` list: one row per entry with date (earliest linked trade openTime, UTC+8), symbol, side(s), setup names, trade count, net realized PnL, unreviewed/reviewed state; newest first; the creation entry point; a small 'setups' link in the header. How loud the unreviewed state is.
- The trade picker used to create an entry: current account's trades (open and closed) not already in another entry, newest first, symbol search, same-symbol constraint after the first tick, create on at least one tick, then jump to `/journal/:id`.
- `/journal/:id` entry page: symbol as hero like the plan page; the recording section (setups multi-select with inline '+ new setup', entry reason rich text, market context rich text, before screenshots slot, planned entry / stop / take profit inputs with planned R:R shown, emotion select, invalidation rich text); the linked trades strip (add/remove while unreviewed); the review section shown but locked with 'waiting for N open trade(s) to close' until every linked trade is closed, then the static Chinese prompt block (the seven questions and the closing line, verbatim from the map Notes), after screenshots slot, mistakes, rules followed or broken, management decisions, notes for next time, actual R; 'mark reviewed' at the foot with reopen and delete like PlanFooter.
- `/journal/setups`: list of setups with name, triggers, usage count; inline create and edit (name, rich text description, trigger chips); delete blocked when in use.
- The trade detail page: a link to its entry, or a 'new journal entry' shortcut preselecting that trade.

Resolve with the chosen variant and the decisions it forced; link the branch.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Prototype ready on branch prototype/journal-ui (commit 37adb69, pushed; not for merge). Run: git checkout prototype/journal-ui && devbox run dev, open /journal; switch with ?variant=A|B|C, the bottom-right bar or the arrow keys; 'sim: close a trade' closes the oldest open trade to unlock a review. In-memory seed (7 entries, 18 trades, 4 setups); reload reseeds.
A ledger: Plans A grammar; /journal single list newest first with hollow/filled glyph for unreviewed/reviewed; picker unfolds inline under the header; entry is one column, symbol as display hero, planned r:r / actual r / net in a line under it; trades → recording → review (locked, dimmed) → footer; setups rows expand in place. Trade detail: one label line under the result.
B facing pages: /journal is a column table with a state column (to review / n open / reviewed); picker replaces the table (?new=1); entry is a two-page spread, before page hero planned r:r, after page hero actual r with linked trades on top; setups master-detail. Trade detail: a closing 'journal' section.
C review queue: /journal opens on the to-review count as hero, sections to review / recording / unjournaled (tick trades right there to create) / reviewed by month with actual r; entry hero is actual r, recording | review tabs, review default when ready; setups dense rows expand in place. Trade detail: link in the top bar.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trader chose variant B (facing pages) as is, no mix. Settled UX:
/journal: title 'journal' with 'n entries · m to review' under it; header actions 'setups' and 'new entry →'. Entries as a column table (date with hh:mm in UTC+8 · symbol, plus '· <account>' when not the selected account · side, mixed directions shown as 'short / long' · setups, '—' when none · trades · net pnl · state), newest first, tabular numerals, rows link to the entry. State column: '● to review' (unreviewed, every trade closed), '● n open' (unreviewed, waiting), muted 'reviewed'. Explicit empty state.
Picker: 'new entry →' (or ?new=1, with ?pick=<tradeId> preselecting) replaces the table on the same page with a picker table: symbol search above, checkbox column, opened · symbol · status · position (side qty @ entry → exit) · pnl ('open' while open); once a trade is ticked, other symbols dim and a line explains the one-symbol lock; footer 'create entry with n trade(s) →' (disabled 'tick at least one trade') and cancel; create jumps to /journal/:id.
/journal/:id: '← journal' and quiet 'saved hh:mm' on top; title line = symbol (text-title, not display) with 'date · side(s) · n trades · state'. Two pages at lg split by a 1px mist vertical rule, stacked on narrow. Left page 'before · planned r:r': planned R:R as the display hero with a hint line ('|target − entry| / |entry − stop|', the invalid reason, or 'enter entry, stop and target'), then planned entry / stop loss / take profit inputs, setups multi-select (dropdown with checkboxes and an inline '+ new setup') beside the emotion select, then entry reason, market context, invalidation (rich text) and before screenshots. Right page 'after · actual r': actual R as the display hero tinted by sign ('open' while trades are open), a 'net pnl · formula' line, then linked trades (unlink on hover while unreviewed and >1, '+ add trade' lists same-symbol unlinked trades of the selected account), then the review: while trades are open a 'waiting for n open trade(s) to close' line with the review field labels dimmed and locked; once all closed the static Chinese prompt block, after screenshots, mistakes, rules followed or broken, management decisions, notes for next time. Footer across both pages: 'mark reviewed →' (filled ink, disabled with 'after every linked trade closes' while open); reviewed shows 'reviewed <day hh:mm> · reopen'; 'delete entry' at the right behind a confirmation dialog, back to /journal.
/journal/setups: master-detail. Left: inline create input (enter, errors inline) and the setup list with usage counts. Right: selected setup with name (save on blur, uniqueness/length errors inline), 'used by n entries', entry trigger chips (enter to add, 1..80 chars, × to remove), rich text description, 'delete setup' disabled with 'used by n entries; untag them first' while in use.
Trade detail: a closing 'journal' section: one row linking to the entry (date, setups, trade count, state) or 'this trade is not in a journal entry.' with 'new journal entry →' opening /journal?new=1&pick=<id>.
Build note: no popover primitive exists in components/ui; the setups multi-select needs one (or a native-ish dropdown) in the build.
Prototype (all three variants): branch prototype/journal-ui, commit 37adb69, not for merge.
<!-- SECTION:FINAL_SUMMARY:END -->
