---
id: TASK-49
title: "Write the Exchange sync spec, schema and ADR"
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 06:47"
updated_date: "2026-11-04 12:32"
labels:
  - "wayfinder:task"
dependencies:
  - TASK-41
  - TASK-42
  - TASK-43
  - TASK-44
  - TASK-45
  - TASK-46
  - TASK-47
  - TASK-48
  - TASK-51
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Question

Nothing left to decide: fold every decision on the map into the destination artifacts.

Produce: a Backlog doc 'Exchange sync spec' (locked decisions, trades table columns, accounts changes, ExchangeAdapter interface, sync algorithm, error presentation); a Backlog decision (ADR) 'Exchange is the source of truth for trades; manual entry removed'; an updated PRODUCT.md purpose section reflecting the removal of rule-set tagging and written review; GLOSSARY.md touch-ups if any term shifted.

<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Destination artifacts written 2026-11-04.

- Exchange sync spec: backlog/docs/doc-4 - Exchange-sync-spec.md (type specification). Folds every map decision: locked decisions, accounts changes (credentials, balance snapshot, sync/error columns, backfillStart, incomeCursorAt), new fills table (fact store, seed rows as source=seed), new trades table with stable tradeKey and rebuild-merge rules, conversations.tradeId, derived values on read, ExchangeAdapter interface, Binance endpoint table with weights, 11-step sync algorithm (lock, verify, window, fetch, dedupe, seeds, fold, SL/TP, check, atomic write, failure), auto-sync policy, 8-code error taxonomy, tRPC account/trade/stats surface, UI per task-47, review-agent re-base, testing strategy, out of scope.
- ADR: backlog/decisions/decision-2 - Exchange-is-the-source-of-truth-for-trades-manual-entry-removed.md (status accepted): context, six-point decision, consequences incl. reversal cost.
- PRODUCT.md: Product Purpose and success criteria rewritten (sync replaces fast manual entry; rule-set tagging and written review gone); Users and keyboard-completeness lines updated to match.
- GLOSSARY.md: Sync cursor sharpened (per-symbol fill cursor + account-level income cursor). Other Exchange sync terms unchanged.

Two details settled here because no ticket covered them: seeds persist as synthetic fills rows (source=seed, fillId seed@<backfillStart>) so trades rebuild from fills alone; rebuild writes openTime on insert only and never touches SL/TP on closed rows, which is how hand edits survive without extra columns. Proxy handling stays outside the client (NODE_USE_ENV_PROXY=1 in the devbox env).

<!-- SECTION:FINAL_SUMMARY:END -->
