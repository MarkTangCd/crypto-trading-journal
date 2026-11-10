---
id: TASK-73
title: 'Write the Trading plan spec, schema and ADR'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 03:09'
updated_date: '2026-11-10 06:37'
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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Spec locked as doc-6 Trading plan spec; ADR decision-3 (image BLOBs in SQLite served by Express, cascade in app code, no FK). Grilled 2026-11-10: plan_scenarios.position dropped (order by id, letters shift on delete); own SCENARIO_TIME_FRAMES = 15m 30m 1H 4H 12H 1D instead of adding 12H to TIME_FRAMES (keeps coinank/getKlines/Pre-trade untouched); rich text as text json RichTextDoc via shared/richText.ts (shallow zod + isEmptyDoc), nullable except observation content; flat tRPC plan namespace (list/get/symbolSuggestions/create/update/add|update|deleteScenario/add|update|deleteObservation/close/reopen/delete); NOT_FOUND for unknown/foreign, CONFLICT for writes to closed plans and state-mismatched close/reopen, BAD_REQUEST for incomplete verdicts; TRADING_PAIR_RE moved to shared; last-write-wins autosave, updatedAt only on own row; image routes in server/_core/imageRoutes.ts, POST ?planId= 201/200-dedupe; outcomes kept on reopen only as close pre-fill (GLOSSARY Scenario outcome reworded); scenario name 1..80; child deletes immediate; no static-renderer/turndown; /plans/:id lazy-loaded; tests plan.test.ts, plan.db.test.ts, imageRoutes.test.ts (304 via node:http).
<!-- SECTION:FINAL_SUMMARY:END -->
