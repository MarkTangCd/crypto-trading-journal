---
id: TASK-73
title: 'Write the Trading plan spec, schema and ADR'
status: To Do
assignee: []
created_date: '2026-11-10 03:09'
updated_date: '2026-11-10 04:05'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-70
  - TASK-71
  - TASK-72
references:
  - backlog/docs/doc-5 - Trading-plan-map.md
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Lock the Trading plan spec as a Backlog doc (same shape as doc-4), fold in the three resolved tickets, and decide whether image-BLOBs-in-SQLite-served-by-Express deserves an ADR (decision-3).

The spec must fix: tables plans (symbol uppercase, marketContext document, closedAt nullable = status), plan_scenarios (planId, name, side long|short, primaryTimeFrame from TIME_FRAMES plus 12H, content document, outcome triggered|invalidated|null, position), plan_observations (planId, content document, createdAt), images (planId, sha256, mime, bytes, size), with checks, indexes and cascade rules; db functions in server/db.ts; the tRPC plan namespace (create by symbol, update fields, add/update/delete scenario and observation, close with verdicts, reopen, delete); the Express image routes; the chosen UI from the prototype; shared TIME_FRAMES gaining 12H; GLOSSARY updates if any term shifted. Grill with grilling + domain-modeling where the prototype left anything open.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From Prototype the Plans pages (task-72): variant A chose creation order with no manual reordering, so decide whether plan_scenarios.position stays in the schema or scenarios simply order by id. The full list of UX decisions A settled is in task-72's final summary.
<!-- SECTION:NOTES:END -->
