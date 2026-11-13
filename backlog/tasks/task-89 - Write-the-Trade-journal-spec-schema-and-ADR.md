---
id: TASK-89
title: 'Write the Trade journal spec, schema and ADR'
status: To Do
assignee: []
created_date: '2026-11-13 12:47'
updated_date: '2026-11-13 13:35'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-86
  - TASK-87
  - TASK-88
references:
  - backlog/docs/doc-7 - Trade-journal-map.md
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Lock the Trade journal spec as a Backlog doc (same shape as doc-6 Trading plan spec), using the map's Decisions-so-far, the chosen prototype variant and both research findings. It must settle: the schema (`journal_entries` with reviewedAt, planned prices, emotion, rich text fields, before/after image refs; `journal_entry_trades` join; `setups` with name, description, triggers JSON; `journal_entry_setups` join; the polymorphic `images` owner and its migration), the tRPC `journal` and `setup` namespaces with their error codes (NOT_FOUND, CONFLICT for reviewed / trade already linked / setup in use, BAD_REQUEST for open trades on mark reviewed, symbol or account mismatch), the derived values (planned R:R reusing client/src/lib/plannedRiskReward.ts, actual R from net realized PnL over planned risk, both null when inputs are missing), the trade detail page link, shared constants (EMOTIONS, limits) and GLOSSARY updates. Write an ADR only if the polymorphic image owner meets all three ADR criteria (hard to reverse, surprising, a real trade-off).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From task-88: the UI is variant B (facing pages), see its final summary. The setups multi-select needs a popover primitive that components/ui lacks; decide in the spec whether to add shadcn popover or a native dropdown. Mixed-direction entries display 'short / long'.
<!-- SECTION:NOTES:END -->
