---
id: TASK-65
title: Trade detail page as the instrument
status: To Do
assignee: []
created_date: "2026-11-04 12:43"
updated_date: "2026-11-04 12:45"
labels:
  - ready-for-agent
dependencies:
  - TASK-64
  - TASK-62
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Spec doc-4 section UI → Trade detail, from task-47 (reference: DetailA, PriceRuler, Level in the prototype on branch prototype/exchange-sync-ui). Read DESIGN.md and PRODUCT.md first. Lives at /trades/:id; the old TransactionDetail stays until the removal task.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 client/src/pages/TradeDetail.tsx at /trades/:id: hero net PnL (or open), one meta line (symbol side qty · open → close in UTC+8 · fees), price ruler stop — entry — exit — target with exit in the outcome hue, R multiple shown only when stopLossPrice is non-null
- [ ] #2 Source caption under the levels: live from binance, refreshed each sync while open; as set on binance when the trade closed when closed
- [ ] #3 Hand-edit fallback set by hand → appears only for a closed trade with a null stop or target and calls trade.update; a seeded trade (openTimeApprox) offers an open time edit that calls trade.update({ openTime })
- [ ] #4 打开 AI 复盘 stays top-right and opens the review drawer by tradeId
- [ ] #5 NOT_FOUND renders an explicit not-found state; devbox run -- npm run check passes and the page is exercised in the dev server with an open, a closed-with-levels, a closed-null-levels and a seeded trade
<!-- AC:END -->
