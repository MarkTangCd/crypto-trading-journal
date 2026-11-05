---
id: TASK-47
title: Prototype linked-account UI and trimmed trade views
status: Done
assignee:
  - "@myself"
created_date: "2026-11-04 06:46"
updated_date: "2026-11-04 09:51"
labels:
  - "wayfinder:prototype"
dependencies:
  - TASK-45
references:
  - backlog/docs/doc-3 - Exchange-sync-map.md
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Question

With manual entry gone and only exchange facts left, what do Accounts, Transactions list, TransactionDetail and Dashboard look like?

Rough, throwaway screens per DESIGN.md: the link-account form (name, exchange, apiKey, apiSecret, notes) and its read-only validation error; the sync affordance with last-synced time and failure line; the trade row and detail with the new column set (symbol, side, status, openTime, closeTime, entryPrice, exitPrice, quantity, positionSizeUsdt, feeUsd, realizedPnlUsd, stopLossPrice, takeProfitPrice, openTimeApprox) and the editable SL/TP fallback; the Dashboard without per-system stats. Settle which stats survive and how an account that has never synced reads.

<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

task-45 resolved: never-synced state is decided (hero —, 'never synced', 'sync now' button, no performance section). Hero = wallet balance; secondary unrealized line when open trades exist; delta = Σ realized PnL of synced closed trades, no percentage. Prototype the layout, do not reopen those.

UI prototype (uncommitted in working tree while under review): client/src/pages/PrototypeExchangeSync.tsx + client/src/components/PrototypeSwitcher.tsx, dev-only route /prototype/exchange-sync?variant=A|B|C&screen=accounts|trades|trade|dashboard&state=synced|never|failed (&error=1 shows the read-only key rejection, &trade=14|12|7|6 picks the detail fixture). Variants: A ledger (tables/grids), B dossier (one account, day-grouped lines, in/out mirror), C instrument (numeral blocks, price ruler, running sum). To be moved to branch prototype/exchange-sync-ui on resolution.

<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Verdict (trader reviewed all three variants in the browser, 2026-11-04). Mix-and-match, by screen:

- Accounts → variant B 'dossier': the selected account is a full-page record (hero wallet balance, exchange + key tail + read-only verified date, sync line, notes, linked/backfilled facts, edit / replace key / unlink actions), other accounts as a short list, link-account form inline at the bottom. No table.
- Trades → variant B: open trades first in their own section with stop / target inline, then closed trades grouped by day with a per-day PnL subtotal. One line per trade: symbol side qty @ entry → exit, PnL right-aligned. fee, positionSizeUsdt, closeTime stay on the detail; openTimeApprox shows only as '~'.
- Trade detail → variant C 'instrument': hero net PnL (or 'open'), one meta line, then the price ruler (stop — entry — exit — target on one axis, exit in the outcome hue), a source line for the levels, and the hand-edit fallback when a closed trade has no levels. '打开 AI 复盘' stays top-right beside '← trades'.
- Dashboard → variant A 'ledger': hero wallet balance with unrealized sub-line (task-45), sync line, 'realized · synced trades' row with fees total, the existing four-stat grid (win rate, profit factor, expectancy, losing streak), and one 'open' line (count, exposure, exposure ÷ balance). No per-system stats, no new metrics beyond these.

Cross-cutting decisions:

- Sync failure is ink, never the loss hue: '! sync failed <ago> — <reason>' plus 'last successful sync <time> · retry'. Never synced: hero '—', 'never synced · sync now'; trades list shows a 'nothing synced yet' empty state with a sync button.
- Read-only key rejection renders under the api secret field as one sentence (what is accepted, what is rejected, how to fix); the account is not created. The enableFutures accept/reject policy itself is task-51's.
- SL/TP from the exchange are read-only with a source caption ('live from binance, refreshed each sync' / 'as set on binance when the trade closed'); only a closed trade with a null level shows 'set by hand →', which turns into an underline input.
- Unlink button reads 'unlink · deletes its trades'; the confirm dialog repeats that AI conversations go with them.

Prototype (all three variants + switcher) kept as a primary source on branch prototype/exchange-sync-ui: client/src/pages/PrototypeExchangeSync.tsx, client/src/components/PrototypeSwitcher.tsx, dev-only route in App.tsx. Never merge.

<!-- SECTION:FINAL_SUMMARY:END -->
