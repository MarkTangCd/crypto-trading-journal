---
id: TASK-46
title: Prototype fill-to-trade reconstruction
status: Done
assignee:
  - '@myself'
created_date: '2026-11-04 06:46'
updated_date: '2026-11-04 08:48'
labels:
  - 'wayfinder:prototype'
dependencies:
  - TASK-44
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Does the agreed Trade definition (position round-trip, weighted-average entry/exit) hold up when a pure function folds realistic Binance fills into trades?

Build a throwaway pure function over hand-written fill fixtures covering: scale-in then single exit; partial exits; a flip fill split into close + open with pro-rata fee; hedge-mode LONG and SHORT on the same symbol; a position seeded from positionRisk whose opening fills pre-date the window (openTimeApprox); fee in BNB. React to the output and settle: sync-cursor semantics (per symbol? by fill id or time?), when the SL/TP snapshot is taken, how realizedPnl from fills reconciles with Σ(exit−entry)×qty.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Prototype: branch prototype/fill-to-trade, file server/exchange/PROTOTYPE-fill-to-trade.html (single HTML, double-click; pure module ExchangeSync.applySync(journal, snapshot) + 8 scenario tabs). Never merge. Also in the working tree of the main checkout, untracked, for local clicking.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verdict: the Trade definition holds. 8 scenarios, 10 reconstructed trades, Σ fill realizedPnl equals dir×(exit−entry)×qty exactly in every case (scale-in, partial exits, flip split, hedge LONG+SHORT, pre-window seed, pre-window position closed inside the window, BNB fee, idempotent re-sync).

Prototype: branch prototype/fill-to-trade → server/exchange/PROTOTYPE-fill-to-trade.html (pure module ExchangeSync.applySync(journal, snapshot); never merge).

Decisions (all recommendations accepted, 2026-11-04):
1. Storage: new fills table (raw exchange fills, unique on accountId+symbol+fillId). trades are rebuilt from fills per (symbol, positionSide) on every sync; derived but persisted. Hand-editable fields (SL/TP of closed trades, openTime corrections) are kept and merged back by trade identity.
2. Trade identity: accountId + symbol + positionSide + first opening fill id; seeded trades use seed@windowStart; the opening half of a flip uses fillId+flip. DB keeps an autoincrement id; rebuild matches rows by this key instead of delete-and-reinsert, so AI conversations keep pointing at the same trade.
3. Sync cursor: per symbol = max stored fill time; next request startTime = cursor − overlap (≈1h), overlap deduped by fill id (userTrades fromId cannot combine with a time window). A separate account-level income cursor drives new-symbol discovery.
4. SL/TP snapshot: after folding, for each still-open trade overwrite from current openAlgoOrders (null when none); a trade that closes in this sync keeps its last snapshot; trades first seen closed get null. closePosition=true preferred, then the level that fires first; partial TP ladders store only the nearest level.
5. PnL: realizedPnlUsd = Σ fill.realizedPnl − feeUsd (fees converted in the adapter). dir×(exit−entry)×qty is only a consistency check; a difference above 0.01 USDT is logged, never blocks.
6. Pre-window seed: openTime = windowStart (NOT positionRisk.updateTime, which is only the last change and lands inside the window after any scale-in), openTimeApprox = true, hand-editable; feeUsd covers window fills only, same flag. Entry price is back-solved from the first reducing fill's realizedPnl (exact, Binance computes it against average entry) minus window adds; positionRisk.entryPrice is used only when nothing was reduced inside the window. A position opened before the window and closed inside it becomes a complete closed trade the same way, with no positionRisk row.
7. Backfill order: fills → positionRisk; if any position.updateTime > the fills endTime, refetch that symbol's fills before computing seeds. Seeds are computed only on the first backfill.
8. Arithmetic: fixed-point decimal strings (existing addDecimalStrings helpers), never Number — a float residue (0.3−0.1) produced a phantom zero-qty flip trade in the prototype.

Found along the way: a missing/stale positionRisk row during backfill is mis-read as a pre-window opposite position; hedge-mode over-reduce cannot flip and is an adapter error.
<!-- SECTION:FINAL_SUMMARY:END -->
