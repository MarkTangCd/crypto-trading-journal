---
id: TASK-95
title: tRPC setup namespace
status: To Do
assignee: []
created_date: '2026-11-13 14:28'
labels:
  - ready-for-agent
dependencies:
  - TASK-93
references:
  - backlog/docs/doc-8 - Trade-journal-spec.md
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-8, section tRPC surface → namespace setup. All publicProcedure; NOT_FOUND / CONFLICT / BAD_REQUEST per the spec's common-errors rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 setup.list, get, create, update, delete as the spec; name trimmed 1..SETUP_NAME_MAX; triggers trimmed 1..ENTRY_TRIGGER_MAX, case-insensitive duplicates → BAD_REQUEST; description RichTextDoc | null
- [ ] #2 Name taken case-insensitively (create, or update to another setup's name) → CONFLICT; delete with usageCount > 0 → CONFLICT; update returns updatedAt
- [ ] #3 server/setup.test.ts via createCaller with vi.mock('./db') covers every error row
- [ ] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
