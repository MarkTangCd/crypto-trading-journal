---
id: TASK-89
title: 'Write the Trade journal spec, schema and ADR'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-13 12:47'
updated_date: '2026-11-13 14:22'
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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Locked as doc-8 Trade journal spec. Schema: images ownerKind/ownerId (migration 0015 hand-edited SELECT), journal_entries (accountId + symbol fixed from first trade, text-decimal planned prices, emotion, 7 rich text columns, beforeImageIds/afterImageIds JSON arrays, reviewedAt), journal_entry_trades (unique tradeId), setups (unique (userId, lower(name)), triggers JSON), journal_entry_setups; new tables in 0016. Errors: NOT_FOUND unknown/foreign ids; CONFLICT for every state conflict incl. mark reviewed or review-field/after-slot writes with open trades (deviates from the ticket's BAD_REQUEST), linked trade, setup name taken, setup in use; BAD_REQUEST for input (decimals, lengths, symbol/account mismatch, empty or last trade, slot full at 10). Planned R:R client-only via previewPlannedRiskReward with the earliest trade's side; actual R and net pnl server-side on read. Linking an open trade relocks the review, content kept. '+ add trade' uses the entry's account. Rich text fields accept images; PlanEditor becomes components/RichTextEditor with an owner prop; shadcn popover added for the setups multi-select; journal.pickableTrades and journal.forTrade. GLOSSARY: Market context now covers journal entries. No new ADR: decision-3 amended with the polymorphic owner.
<!-- SECTION:FINAL_SUMMARY:END -->
