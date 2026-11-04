---
id: decision-2
title: Exchange is the source of truth for trades; manual entry removed
date: "2026-11-04 12:31"
status: accepted
---

## Context

The journal stored every trade as a hand-typed `transactions` row: planned
entry / stop / target, the rule-set that produced it (trading system plus
tagged elements, `tradeItems`), market cycle, time frame, free-text logic,
a written review and a `reviewed` status. The trader entered each fill and
each close by hand, and the Dashboard derived balance from a typed
`initialBalance` plus the typed `returnAmount` of each trade.

Charting the _Exchange sync map_ (doc-3, 2026-11-03/04) with the trader
surfaced the actual failure mode: trades were not being recorded at all,
because recording competed with trading for attention, and the numbers
that were recorded could not be trusted as a primary source. The rule-set
tagging and written review were never used consistently enough to produce
per-system statistics worth acting on.

The trader trades USDⓈ-M perpetuals on one Binance account and is willing
to give the journal a read-only API key. The database holds 0 transactions,
so there is nothing to migrate.

## Decision

1. **The exchange is the only source of trade facts.** A trade exists
   because the exchange reports the fills that make it up; the journal
   never creates, closes or deletes a trade by hand.
2. **Manual entry is removed entirely**, not kept as a fallback. The
   `transactions` table, the new-trade and close-trade forms, and every
   column that only a human could fill (time frame, trading logic, context,
   trade items, market cycle, transaction type, TradingView URLs, written
   review, `reviewed` status) are dropped. Rule-set tagging and written
   review leave the product; the per-trade AI review conversation, Pre-trade
   and Goals stay.
3. **Every account is a linked account**: one encrypted read-only
   credential set per account; `initialBalance` is retired and balance is
   the exchange's wallet balance at the last successful sync.
4. **Trade = position round-trip** per `(symbol, positionSide)` rebuilt
   from stored fills on every sync; fills are the fact store, trades are
   derived but persisted with a stable identity.
5. **Nothing numeric is hand-edited** except a missing stop / target on a
   closed trade and the approximate open time of a trade seeded from a
   position older than the backfill window.
6. v1 is **Binance USDⓈ-M perpetuals only**, behind an `ExchangeAdapter`
   seam so a second exchange is an addition, not a rewrite.

The full mechanics (schema, adapter, sync algorithm, error taxonomy, UI)
are in the _Exchange sync spec_ (doc-4).

## Consequences

- Trust: a number on the Dashboard can be traced to exchange fills; PnL is
  net of trading fees exactly as the exchange computed it. Success is no
  longer "trades logged" but "trades reconciled".
- Loss of narrative: there is no written thesis per trade. The AI review
  conversation becomes the only place reflection is captured; what the
  review agent is told about a trade without a thesis is an open map item.
- No per-system statistics: win rate, profit factor, expectancy and streaks
  are per account only. If rule-set analysis returns it must be a separate
  effort that tags exchange trades after the fact, never one that types
  them in.
- The product depends on Binance's API surface (3-month history cap,
  7-day query windows, Algo order migration). Sync must happen at least
  every few weeks or reconstruction gaps appear; this is accepted for a
  solo journal.
- Credentials at rest: the journal now holds an exchange API key, encrypted
  with the existing `server/agents/secrets.ts` master key. The read-only
  policy is enforced at link time and at every sync; the port must still
  never be exposed off `localhost`.
- `PRODUCT.md` purpose and success criteria are rewritten to match; the
  "fast new-trade entry" criterion becomes "sync is cheap and trusted".
- Reversal cost: high. Reintroducing manual entry means reintroducing a
  second source of truth for the same table; the decision is made on the
  understanding that it will not be reversed for v1.
