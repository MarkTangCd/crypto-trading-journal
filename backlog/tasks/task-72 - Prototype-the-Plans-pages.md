---
id: TASK-72
title: Prototype the Plans pages
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 03:09'
updated_date: '2026-11-10 04:05'
labels:
  - 'wayfinder:prototype'
dependencies:
  - TASK-70
references:
  - backlog/docs/doc-5 - Trading-plan-map.md
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How should the Plans pages look and behave inside the bench-notebook design (DESIGN.md, PRODUCT.md)? Run through /impeccable and produce 2 to 3 variants on a prototype/plans-ui branch for the trader to react to in the browser.

Screens: /plans (create by symbol only, then jump to the detail; open plans first, closed plans grouped by UTC+8 day; one line per plan with symbol, scenario count and outcomes once closed) and /plans/:id (market context editor, scenarios with name / long-short / primary timeframe 15m 30m 1H 4H 12H 1D / content, observations appended with their UTC+8 time, a quiet 'saved hh:mm' indicator, delete with confirmation, and the close panel that demands a triggered / invalidated verdict for every scenario before the plan can close; closed plans render read-only with a reopen action). Nav item 'Plans' sits between Goals and Trades.

Use the editor recommended by the rich-text research ticket; images may stay base64 in the prototype. Record which variant or mix was chosen and every UX decision it settles.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Prototype ready on branch prototype/plans-ui (commit 003657b, pushed; not for merge). Run: git checkout prototype/plans-ui && devbox run -- npm install && devbox run dev, open /plans; switch with ?variant=A|B|C, the bottom-right bar or the arrow keys. In-memory seed data; reload reseeds. Tiptap 3.32.0 per TASK-70, images base64 in the prototype only.
A ledger: one column like Trades; symbol is the display hero; scenarios lettered a/b/c in creation order; observations oldest first with composer at the foot; close is an inline section at the page foot.
B index + sheet: plan index stays beside the open plan (hidden on phone when a plan is open); open-for duration is the display hero; scenarios are a table expanding one row at a time; observations newest first, composer on top; close in a right side sheet.
C scenario columns: big symbol input on /plans, open plans listed with their scenarios; detail puts symbol beside market context, scenarios side by side with manual left/right reordering; close turns the columns into an in-place verdict board with a sticky confirm bar.
Shared across all three: outcomes in ink with glyphs (filled = triggered, hollow = invalidated), no win/loss hue; long/short in ink; lowercase labels with timeframes kept uppercase; delete via confirmation dialog; saved hh:mm indicator from updatedAt.
Questions for the trader: (1) which variant or mix; (2) list and detail on separate pages (A, C) or together (B); (3) close flow: inline section, side sheet or in-place verdicts; (4) scenario ordering: creation order or manual reorder (settles the map fog item); (5) observations oldest-first or newest-first; (6) which number is the hero: symbol or open-for duration.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trader chose variant A (ledger) as is, no mix. Settled UX: /plans and /plans/:id stay separate pages. /plans: title, one symbol input (uppercase, datalist of synced symbols) with 'open plan →' that creates and jumps; 'open · n' section with one line per plan (open-for duration, symbol, scenario and observation counts), newest first; closed plans grouped by UTC+8 close day, one line each (close hh:mm, symbol, outcome glyphs, 'n triggered · m invalidated', '—' for zero scenarios). /plans/:id: single column max-w-3xl; '← plans' and the quiet 'saved hh:mm' on top; symbol is the display-size hero, editable in place while open; meta line 'open · since <day hh:mm> · <duration>' or 'closed <day hh:mm> · was open <duration>'; sections market context, scenarios, observations under mist-rule headers. Scenarios lettered a, b, c in creation order (no manual reordering); each shows name (inline edit), long/short and 15m 30m 1H 4H 12H 1D as segmented one-click controls, delete, and its rich text; add-scenario form at the end of the list (name + side + timeframe). Observations oldest first with UTC+8 day+time column, editable while open, delete on hover; composer at the foot, Cmd+Enter or 'log observation →', time stamped on log. Footer: 'close plan →' (filled ink) and 'delete plan'. Close is an inline section replacing the footer, not a modal: one triggered/invalidated toggle per scenario, 'k of n verdicts' counter, 'close plan' disabled until complete, cancel; re-close pre-fills outcomes; zero-scenario plans close directly. Closed plans render read-only with outcome next to each scenario name and 'reopen plan'. Delete uses a confirmation dialog naming scenario and observation counts. Outcomes are ink with glyphs (● triggered, ○ invalidated), never win/loss hues; long/short in ink; timeframes keep uppercase H/D inside lowercase labels. Prototype (all three variants): branch prototype/plans-ui, commit 003657b, not for merge.
<!-- SECTION:FINAL_SUMMARY:END -->
