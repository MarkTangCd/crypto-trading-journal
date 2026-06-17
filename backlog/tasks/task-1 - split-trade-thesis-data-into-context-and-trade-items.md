---
id: task-1
title: Split trade thesis data into context and trade items
status: Done
assignee: []
created_date: '2026-06-17'
updated_date: '2026-06-17 09:06'
labels:
  - backend
  - database
  - trade-entry
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the trade data model and API layer so the existing thesis concept is
represented as two fields:

- `context`: text for the current market background.
- `tradeItems`: ordered string array of trade item tags.

Preserve existing trade creation and read flows while preparing the frontend to
consume the new fields.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Trade creation input accepts `context` as a string field.
- [x] #2 Trade creation input accepts `tradeItems` as a string array field.
- [x] #3 Existing trade reads expose `context` and `tradeItems` to the client.
- [x] #4 Existing persisted `thesis` data is handled through migration, fallback,
      or a documented compatibility decision.
- [x] #5 Focused verification covers creating and reading a trade with multiple
      trade items.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the trade thesis data split so trade creation and reads support `context` and ordered `tradeItems`, with existing persisted thesis data handled for compatibility and focused verification covering create/read behavior.
<!-- SECTION:FINAL_SUMMARY:END -->
