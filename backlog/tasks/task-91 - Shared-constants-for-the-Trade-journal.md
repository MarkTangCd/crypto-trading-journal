---
id: TASK-91
title: Shared constants for the Trade journal
status: In Progress
assignee:
  - '@myself'
created_date: '2026-11-13 14:27'
updated_date: '2026-11-13 14:32'
labels:
  - ready-for-agent
dependencies: []
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, section Shared constants and helpers. Additive: no consumers yet except the moved DECIMAL_PATTERN.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 shared/const.ts exports IMAGE_OWNER_KINDS + ImageOwnerKind, EMOTIONS + Emotion, JOURNAL_SLOTS, SLOT_IMAGE_MAX = 10, SETUP_NAME_MAX = 60, ENTRY_TRIGGER_MAX = 80 and DECIMAL_PATTERN exactly as the spec
- [ ] #2 client/src/lib/plannedRiskReward.ts imports DECIMAL_PATTERN from @shared/const instead of defining it, keeps re-exporting it for existing importers; behaviour unchanged
- [ ] #3 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. shared/const.ts: append IMAGE_OWNER_KINDS + ImageOwnerKind, EMOTIONS + Emotion, JOURNAL_SLOTS, SLOT_IMAGE_MAX, SETUP_NAME_MAX, ENTRY_TRIGGER_MAX, DECIMAL_PATTERN verbatim from doc-8 after MAX_IMAGE_BYTES
2. client/src/lib/plannedRiskReward.ts: drop the local DECIMAL_PATTERN, import it from @shared/const; no re-export (no other file imports it)
3. prettier on the two files, npm run check, npm run test
<!-- SECTION:PLAN:END -->
