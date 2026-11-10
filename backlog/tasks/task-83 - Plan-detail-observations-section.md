---
id: TASK-83
title: 'Plan detail: observations section'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:51'
updated_date: '2026-11-10 12:22'
labels:
  - ready-for-agent
dependencies:
  - TASK-81
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, section UI → Observations. Lives in client/src/components/plans/PlanObservations.tsx so PlanDetail.tsx changes by one line and this task can run in parallel with TASK-82 (scenarios). The server stamps the observation time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PlanObservations.tsx renders under the observations header, oldest first, with a UTC+8 day + time column from createdAt via shared/time.ts
- [x] #2 Each observation's content is a PlanEditor autosaving through plan.updateObservation; delete on hover, immediate, no confirmation
- [x] #3 Composer at the foot (PlanEditor): Cmd+Enter or 'log observation →' calls plan.addObservation; an empty doc (isEmptyDoc) is not sent; the composer clears after success
- [x] #4 Structured writes invalidate plan.get and plan.list via trpc.useUtils(); failures toast.error; no success toasts
- [x] #5 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first
- [x] #6 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. client/src/components/plans/PlanObservations.tsx owns the whole section (SectionHeader 'observations · n', list, composer); PlanDetail.tsx gains one <PlanObservations planId observations editable onSaved /> element + import.
2. Move dayTime (UTC+8 'nov 10 05:12' via utc8Parts) from PlanDetail.tsx to client/src/lib/ledger.tsx as fmtDayTime so both use it.
3. Rows oldest first (server order): grid [7rem_1fr_auto] like variant A; time column tabular-nums; content PlanEditor autosaving via plan.updateObservation (empty doc not sent since the server rejects it; no plan.get invalidation; NOT_FOUND after a delete not toasted); 'del' revealed on hover / focus, immediate.
4. Composer at the foot (open only): PlanEditor gains an optional debounceMs prop (default 1000); the composer uses 0 to track the current doc. Cmd/Ctrl+Enter (captured before Tiptap's hard-break binding) or 'log observation →' calls plan.addObservation; empty doc not sent, button disabled; editor remounts (cleared) on success.
5. Writes invalidate plan.get + plan.list and set the saved mark; failures toast.error; no success toasts. Empty states: 'nothing logged yet. log what you see as it happens.' (open) / 'nothing was logged.' (closed).
6. Verify on :3100 with a temp DB copy against variant A; prettier on changed files only; check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Plan detail observations section.

- New client/src/components/plans/PlanObservations.tsx owns the whole section (header 'observations · n', list, composer); PlanDetail.tsx adds one <PlanObservations planId observations editable onSaved /> element + import.
- dayTime moved from PlanDetail.tsx to client/src/lib/ledger.tsx as fmtDayTime (UTC+8 'nov 10 05:12' via utc8Parts), used by both.
- Rows oldest first: grid [7rem_1fr_auto] as variant A, tabular-nums time column from createdAt. Content is a PlanEditor autosaving via plan.updateObservation; an emptied doc is not sent (server rejects it, delete is explicit); no plan.get invalidation; NOT_FOUND from the unmount flush after a delete is not toasted. 'del' is revealed on hover / focus and deletes immediately.
- Composer (open only): PlanEditor gained an optional debounceMs (default 1000); 0 hands every change over synchronously, so Cmd/Ctrl+Enter right after typing sees the latest doc (a setTimeout(0) lost trailing keystrokes in testing). Cmd/Ctrl+Enter is caught in the capture phase so Tiptap's Mod-Enter hard break never fires. 'log observation →' disabled while empty (isEmptyDoc) or pending; the editor remounts cleared on success.
- Writes invalidate plan.get + plan.list and set the saved mark; failures toast.error; no success toasts. Empty states: 'nothing logged yet. log what you see as it happens.' / 'nothing was logged.'. Closed plan: no composer or del, editors read-only.

Verified on :3100 with a temp DB copy (Playwright): empty/whitespace not sent, Cmd+Enter and button log full text with no hard break, composer clears, content edit autosaves, cleared observation keeps server content without a toast, del hidden until hover and deletes, plan.list observationCount updates, closed plan read-only, closed empty state, no console errors. npm run check and npm run test (499) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
