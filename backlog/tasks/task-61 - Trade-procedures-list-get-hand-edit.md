---
id: TASK-61
title: 'Trade procedures: list, get, hand-edit'
status: To Do
assignee: []
created_date: '2026-11-04 12:43'
updated_date: '2026-11-04 12:44'
labels:
  - ready-for-agent
dependencies:
  - TASK-58
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 section tRPC surface → trade. New namespace alongside the old transaction namespace (removed by the removal task). No create, close, delete, getFormDefaults or getTradingPairs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 trade.list({ accountId, status? }) returns trades open first then openTime desc; trade.get({ id }) returns one trade or NOT_FOUND
- [ ] #2 trade.update({ id, stopLossPrice?, takeProfitPrice?, openTime? }) enforces the hand-edit rules through updateTradeByHand and throws BAD_REQUEST otherwise; prices validated as decimal strings, openTime as ms
- [ ] #3 server/trade.test.ts exercises the three procedures via appRouter.createCaller with the vi.mock pattern from server/transaction.test.ts
- [ ] #4 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
