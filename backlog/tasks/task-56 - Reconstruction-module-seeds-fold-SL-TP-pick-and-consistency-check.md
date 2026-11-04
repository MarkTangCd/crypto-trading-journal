---
id: TASK-56
title: 'Reconstruction module: seeds, fold, SL/TP pick and consistency check'
status: To Do
assignee: []
created_date: '2026-11-04 12:42'
updated_date: '2026-11-04 12:44'
labels:
  - ready-for-agent
dependencies:
  - TASK-52
  - TASK-53
references:
  - backlog/docs/doc-4 - Exchange-sync-spec.md
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-4 Sync algorithm steps 6 to 9 as a pure module: no DB, no network, no clock. Reference behaviour is ExchangeSync.applySync in server/exchange/PROTOTYPE-fill-to-trade.html on branch prototype/fill-to-trade (computeSeeds, foldKey, pickSlTp, finalize); the task-46 decision fixes the trade identity scheme and cursor rules.

Input: all fills for one account (stored plus newly fetched, already deduped), current positions, conditional orders, backfill window (or null when incremental). Output: seed fill rows to insert (backfill only), trade records keyed by tradeKey with every trades column except id/userId/accountId/syncedAt, and a list of log lines ([Sync] consistency differences, skipped reducing fills). Arithmetic through server/_core/fixedPoint.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 server/exchange/reconstruct.ts exports computeSeeds(fills, positions, windowStart) and reconstruct({ fills, positions, conditionalOrders, exchange }) → { trades, logs } with no imports from db.ts or the network
- [ ] #2 Seeds: per (symbol, positionSide) startAmt = positionAmt − Σ signed window fills; non-zero startAmt yields a seed row with fillId seed@<windowStart>, qty |startAmt|, side by sign (hedge: from positionSide; one-way: sign of positionAmt), time = windowStart, price back-solved from the first reducing fill's realizedPnl, else from positionRisk entryPrice minus window adds
- [ ] #3 Fold per (symbol, positionSide) in (time, fillId) order: same direction scales in; opposite reduces by min(qty, remaining) with pro-rata fee; remaining 0 closes with closeTime = fill time; leftover on BOTH opens tradeKey <symbol>|BOTH#<fillId>+flip taking all the fill's realizedPnl on the closing half; leftover on LONG/SHORT throws; a reducing fill with no open leg is skipped and logged
- [ ] #4 tradeKey = <symbol>|<positionSide>#<firstOpeningFillId>; entryPrice/exitPrice are quantity-weighted averages; quantity = Σ opening qty; positionSizeUsdt = Σ opening price × qty; feeUsd = Σ fill feeUsd; realizedPnlUsd = Σ fill realizedPnl − feeUsd; openTimeApprox true when the first fill is a seed
- [ ] #5 SL/TP for open trades: conditional orders matching symbol + positionSide with side opposite to the trade; stop → stopLossPrice, takeProfit → takeProfitPrice; prefer closePosition = true, else the level that fires first (long: highest stop, lowest take-profit; short: reverse); quantity-based orders count only when quantity ≥ remaining; closed trades keep null here
- [ ] #6 Consistency check logs a [Sync] line when |dir × (exit − entry) × exitQty − Σ realizedPnl| > 0.01 for a closed trade; it never changes the result
- [ ] #7 server/exchange/reconstruct.test.ts runs the prototype's eight scenarios as fixtures (scale-in, partial exits, flip, hedge, pre-window seed, pre-window closed inside window, BNB fee, idempotent re-sync) and every closed trade asserts Σ realizedPnl == dir × (exit − entry) × exitQty
- [ ] #8 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
