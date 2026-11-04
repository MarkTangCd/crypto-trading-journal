# Crypto Trading Journal

A single-trader journal for recording and reviewing crypto trades. One
anonymous user, several accounts, and the discipline artifacts that sit
around the trades themselves.

## Language

**Goal**:
A short free-text intention the trader commits to achieving in the near
term. Belongs to the trader, not to any account.
_Avoid_: Target (collides with take-profit target price), todo, task

**Open goal**:
A goal the trader has not yet marked as achieved. Only open goals are
surfaced on the Dashboard.
_Avoid_: Pending, active, in progress

**Done goal**:
A goal the trader has marked as achieved. It is kept for review and can be
reopened.
_Avoid_: Completed, finished, archived, closed

## Exchange sync

**Fill**:
A single execution reported by the exchange: one order matched at one price
for one quantity at one instant. Fills are the raw material; the journal
never shows them directly.
_Avoid_: Trade (exchange-API sense), execution, order

**Trade**:
One complete position round-trip on one symbol in one direction: the
position grows from zero and returns to zero. Scale-ins and partial exits
fold into the same trade as weighted-average entry and exit prices.
_Avoid_: Transaction, position, round-trip, order

**Open trade / Closed trade**:
A trade whose position is still non-zero / has returned to zero. The only
two trade states.
_Avoid_: Reviewed, pending, active, holding

**Linked account**:
A journal account bound to one set of exchange API credentials. Every
account is a linked account; trades arrive only through sync.
_Avoid_: Connected account, exchange account, API account

**Sync**:
The act of pulling new fills, open positions and conditional orders from the
exchange for a linked account and updating its trades. Triggered by the
trader or by opening the trade list, never by a background process.
_Avoid_: Import, refresh, poll

**Sync cursor**:
The point up to which an account's fills have already been folded into
trades; the next sync starts a little before it and drops fills it already
holds. One cursor per symbol (the newest stored fill), plus one per account
for discovering newly traded symbols.
_Avoid_: Checkpoint, watermark, last-synced

**Backfill**:
The initial sync when an account is first linked, reaching 30 days into the
past.
_Avoid_: Initial import, history load

**Balance snapshot**:
The linked account's wallet balance and unrealized PnL as the exchange
reported them at the account's last successful sync. The only balance the
journal knows; there is no starting balance and no balance history.
_Avoid_: Initial balance, current balance, equity curve, balance curve

**Seeded trade**:
A trade whose opening fills lie before the backfill window, so its open time
and pre-window fees are unknown and marked approximate; its entry price is
recovered from the exchange's own realized PnL.
_Avoid_: Legacy position, pre-existing position, imported position

**Key verification**:
The check that proves a linked account's API key can read and cannot act:
reading enabled, every write permission off, one futures read succeeds.
Performed when the account is linked, when its key is replaced, and at the
start of every sync.
_Avoid_: Validation, permission check, key test

**Stale**:
A linked account whose last successful sync is more than five minutes old.
Opening the trade list syncs stale accounts automatically.
_Avoid_: Outdated, expired, out of date
