---
id: TASK-90
title: Break the Trade journal spec into implementation tasks
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 12:47'
updated_date: '2026-11-13 14:30'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-89
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Turn the locked Trade journal spec into ordered, ready-for-agent Backlog tasks (same shape as task-75…task-84 for Plans): additive-first, each sized for one build session, each with acceptance criteria that reference the spec doc, dependencies wired with --depends-on, UI tasks verified on the :3100 temp-DB dev server against the chosen prototype variant. Decide the critical path and which tasks can run in parallel.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fourteen implementation tasks created from doc-8, TASK-91 to TASK-104, all labelled ready-for-agent and referencing the spec; slicing confirmed with the trader (all four recommendations accepted). Additive-first so each keeps npm run check and npm run test green on its own.

Server: TASK-91 shared constants (DECIMAL_PATTERN moves to shared); TASK-92 images owner pair + four journal tables, migrations 0015 (hand-edited SELECT) and 0016, server image code rewired with the ?planId= route API unchanged; TASK-93 journal + setup db functions and derived values + journal.db.test.ts; TASK-94 image route owner kinds together with client/src/lib/images.ts and PlanEditor → components/RichTextEditor (route and its client move together so Plans uploads never break); TASK-95 tRPC setup; TASK-96 tRPC journal.
UI: TASK-97 nav, routes, /journal list and picker; TASK-98 setups page; TASK-99 entry shell + before page; TASK-100 setups multi-select with shadcn popover; TASK-101 ImageSlot + before screenshots; TASK-102 after page (actual R, linked trades, locked review, after screenshots); TASK-103 mark reviewed / reopen / delete; TASK-104 trade detail journal section. Every UI task is verified on the :3100 temp-DB dev server against variant B.

Critical path 91 → 92 → 93 → 96 → 97 → 99 → 101 → 102 → 103; 94 and 95 parallel 96; 98 and 100 parallel 101; 104 any time after 97. No new fog; existing fog stays for a later effort. Map complete.
<!-- SECTION:FINAL_SUMMARY:END -->
