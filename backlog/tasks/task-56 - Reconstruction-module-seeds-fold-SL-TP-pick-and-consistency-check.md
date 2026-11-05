---
id: TASK-56
title: "Reconstruction module: seeds, fold, SL/TP pick and consistency check"
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 12:42"
updated_date: "2026-11-04 13:43"
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

Input: all fills for one account (stored plus newly fetched, already deduped), current positions, conditional orders, backfill window (or null when incremental). Output: seed fill rows to insert (backfill only), trade records keyed by tradeKey with every trades column except id/userId/accountId/syncedAt, and a list of log lines ([Sync] consistency differences, skipped reducing fills). Arithmetic through server/\_core/fixedPoint.ts.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 server/exchange/reconstruct.ts exports computeSeeds(fills, positions, windowStart) and reconstruct({ fills, positions, conditionalOrders, exchange }) → { trades, logs } with no imports from db.ts or the network
- [x] #2 Seeds: per (symbol, positionSide) startAmt = positionAmt − Σ signed window fills; non-zero startAmt yields a seed row with fillId seed@<windowStart>, qty |startAmt|, side by sign (hedge: from positionSide; one-way: sign of positionAmt), time = windowStart, price back-solved from the first reducing fill's realizedPnl, else from positionRisk entryPrice minus window adds
- [x] #3 Fold per (symbol, positionSide) in (time, fillId) order: same direction scales in; opposite reduces by min(qty, remaining) with pro-rata fee; remaining 0 closes with closeTime = fill time; leftover on BOTH opens tradeKey <symbol>|BOTH#<fillId>+flip taking all the fill's realizedPnl on the closing half; leftover on LONG/SHORT throws; a reducing fill with no open leg is skipped and logged
- [x] #4 tradeKey = <symbol>|<positionSide>#<firstOpeningFillId>; entryPrice/exitPrice are quantity-weighted averages; quantity = Σ opening qty; positionSizeUsdt = Σ opening price × qty; feeUsd = Σ fill feeUsd; realizedPnlUsd = Σ fill realizedPnl − feeUsd; openTimeApprox true when the first fill is a seed
- [x] #5 SL/TP for open trades: conditional orders matching symbol + positionSide with side opposite to the trade; stop → stopLossPrice, takeProfit → takeProfitPrice; prefer closePosition = true, else the level that fires first (long: highest stop, lowest take-profit; short: reverse); quantity-based orders count only when quantity ≥ remaining; closed trades keep null here
- [x] #6 Consistency check logs a [Sync] line when |dir × (exit − entry) × exitQty − Σ realizedPnl| > 0.01 for a closed trade; it never changes the result
- [x] #7 server/exchange/reconstruct.test.ts runs the prototype's eight scenarios as fixtures (scale-in, partial exits, flip, hedge, pre-window seed, pre-window closed inside window, BNB fee, idempotent re-sync) and every closed trade asserts Σ realizedPnl == dir × (exit − entry) × exitQty
- [x] #8 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. server/exchange/reconstruct.ts, pure (imports only adapter types, errors.ts, \_core/decimal.ts)
2. FillRecord = fills table row minus id/userId/accountId (source, fillId, orderId|null, ..., feeUsd, time); TradeRecord = trades row minus id/userId/accountId/syncedAt
3. computeSeeds(fills, positions, windowStart) -> FillRecord[] (source seed, fillId seed@<windowStart>, orderId null, commission/feeUsd/realizedPnl 0, USDT). Position sign: BOTH as reported, LONG +|amt|, SHORT -|amt| (hedge SHORT sign still unconfirmed). Entry back-solved in one division: from the first reducing fill using its closing part min(qty, held), else positionRisk entryPrice minus window adds
4. reconstruct({ fills, positions, conditionalOrders, exchange }) -> { trades, logs }: group by (symbol, positionSide), sort (time, seed first, numeric fillId), fold per prototype foldKey; flip fee split closing = fee\*closeQty/qty, opening = fee - closing; LONG/SHORT leftover throws ExchangeError unknown; skipped reduce logged
5. Averages via decimal.div at scale 8; sums exact
6. SL/TP for open trades: match symbol + positionSide + opposite side; closePosition pool first, else orders with quantity >= remaining; nearest level per direction; closed trades null
7. Consistency check: closed trade exitQty == entryQty, so dir*(exit-entry)*exitQty is computed exactly as dir\*(exitNotional-entryNotional); log [Sync] line when |diff| > 0.01
8. reconstruct.test.ts: prototype's 8 scenarios as fixtures + PnL identity helper per closed trade
9. format, check, test
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Pure reconstruction module for sync steps 6-9 (spec doc-4), ported from the task-46 prototype.

- server/exchange/reconstruct.ts: FillRecord (fills row minus ids), TradeRecord (trades row minus id/userId/accountId/syncedAt), computeSeeds(fills, positions, windowStart) and reconstruct({ fills, conditionalOrders, exchange }) -> { trades, logs }. Imports only adapter types, errors.ts and \_core/decimal.ts.
- Deviations from the task text: arithmetic uses \_core/decimal.ts (task-52), not fixedPoint.ts (2 dp only); averages at 8 dp, sums exact. reconstruct takes no positions: seeds already carry them and nothing else in steps 7-9 reads positions.
- Seeds: hedge legs signed by positionSide (hedge SHORT sign still unconfirmed live); entry back-solved in a single division from the closing part of the first reducing fill (fixes the prototype using the whole qty of a flip fill), else positionRisk entryPrice minus window adds.
- Fold order (time, seed first, numeric fillId). Flip fee split closing = fee x closeQty / qty, opening = remainder, so fees sum exactly. Hedge over-reduce throws ExchangeError unknown; reduce with no open leg skipped + logged.
- SL/TP: closePosition orders first, else quantity >= remaining; level that fires first per direction.
- Consistency check computed exactly as dir x (exitNotional - entryNotional) (closed => exitQty == entryQty); logs [Sync] line above 0.01.
- reconstruct.test.ts: 21 tests over the 8 prototype scenarios plus flip-seed back-solve, hedge seed sign, SL/TP pick and consistency log; every closed trade asserts the PnL identity to the cent.
- check and full suite (457) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
