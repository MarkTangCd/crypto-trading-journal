---
id: TASK-65
title: Trade detail page as the instrument
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 12:43'
updated_date: '2026-11-05 13:08'
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
- [x] #1 client/src/pages/TradeDetail.tsx at /trades/:id: hero net PnL (or open), one meta line (symbol side qty · open → close in UTC+8 · fees), price ruler stop — entry — exit — target with exit in the outcome hue, R multiple shown only when stopLossPrice is non-null
- [x] #2 Source caption under the levels: live from binance, refreshed each sync while open; as set on binance when the trade closed when closed
- [x] #3 Hand-edit fallback set by hand → appears only for a closed trade with a null stop or target and calls trade.update; a seeded trade (openTimeApprox) offers an open time edit that calls trade.update({ openTime })
- [x] #4 打开 AI 复盘 stays top-right and opens the review drawer by tradeId
- [x] #5 NOT_FOUND renders an explicit not-found state; devbox run -- npm run check passes and the page is exercised in the dev server with an open, a closed-with-levels, a closed-null-levels and a seeded trade
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. client/src/pages/TradeDetail.tsx (prototype DetailC = instrument; Level/PriceRuler from the same file): trade.get({ id }); top row '← trades' link + AgentDrawerToggle tradeId (打开 AI 复盘).
2. Hero: meta line 'symbol side qty · open[~] → close (UTC+8) · fees $x'; text-display net PnL in outcome hue, or 'open'; sub-line size · held · R multiple (closed + stop non-null only).
3. PriceRuler svg stop — entry — exit — target, exit in outcome hue; source caption: open -> live from binance, refreshed each sync; closed -> as set on binance when the trade closed.
4. Hand-edit: closed trade, per null level -> 'set by hand →' inline input, Enter/save calls trade.update, invalidates trade.*. Seeded (openTimeApprox) -> open time edit via datetime-local (UTC+8 helpers) calling trade.update({ openTime }).
5. NOT_FOUND / bad id -> 'trade not found.' + back to trades; loading spinner; toasts on mutation success/failure.
6. App.tsx: route /trades/:id. format, check, exercise in dev server with open / closed-with-levels / closed-null-levels / seeded trades + not found.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Add client/src/pages/TradeDetail.tsx at /trades/:id (prototype DetailC = instrument, with its Level/PriceRuler): '← trades' + 打开 AI 复盘 (AgentDrawerToggle by tradeId) top row; meta line 'symbol side qty · open[~] → close (UTC+8) · fees'; hero net PnL in outcome hue or 'open'; sub-line size · held · R multiple (closed trades with a stop only, price-based); SVG ruler stop — entry — exit — target with exit in outcome hue.

Source caption: open -> live from binance, refreshed each sync; closed -> as set on binance when the trade closed; closed with neither level -> no stop or target seen on binance while this trade was open.

Hand edits via trade.update: per null level on a closed trade ('set by hand →'), and the real open time on seeded trades (datetime-local, UTC+8, must be earlier than the window start at minute precision). NOT_FOUND / bad id -> explicit 'trade not found.' with back to trades; query retry disabled so it shows immediately.

Verified: npm run check passes; dev server on a temp DB copy exercised open, closed-with-levels, closed-null-levels, seeded and not-found trades, the stop and open-time edits (persisted, R and ~ update), the unchanged-open-time rejection, and the AI drawer.
<!-- SECTION:FINAL_SUMMARY:END -->
