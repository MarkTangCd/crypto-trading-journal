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

## Review

**Daily PnL**:
The sum of net realized PnL of every closed trade whose close time falls on
one UTC+8 calendar day. Open trades contribute nothing until they close.
_Avoid_: Daily return, day profit, daily equity change

**Profit calendar**:
The month grid on the Dashboard showing the selected linked account's daily
PnL, one cell per UTC+8 day.
_Avoid_: PnL heatmap, trading calendar, performance calendar

## Trading plans

**Plan**:
The trader's written intention for one symbol over the coming session: the
market context, one or more scenarios, and the observations logged while it
is open. Belongs to the trader, not to an account.
_Avoid_: Pre-trade, session, note, trading plan (as an identifier)

**Open plan / Closed plan**:
A plan the trader is still working / has concluded. The only two plan
states. Closing records the end time; a closed plan can be reopened.
_Avoid_: Active, in progress, completed, done, finished, archived

**Market context**:
The free-form background (text and screenshots) the trader writes at the top
of a plan.
_Avoid_: Background, analysis, thesis, idea

**Scenario**:
One predicted script inside a plan: a name, a direction (long or short), a
primary timeframe, and free-form content. A plan may hold several. Not a
Setup: a scenario is written once for one plan, a setup is reused across
journal entries.
_Avoid_: Playbook, setup, strategy, thesis, idea

**Scenario outcome**:
The verdict the trader gives every scenario when closing its plan: triggered
or invalidated. A scenario the market never reached is invalidated. Has no
meaning while the plan is open; reopening keeps the earlier verdicts only as
the starting point for the next close.
_Avoid_: Result, status, hit, miss, pending, untriggered

**Observation**:
A timestamped free-form entry (text and screenshots) added to an open plan
as the market moves. Ordered by the time it was written, shown in UTC+8.
_Avoid_: Market data observation, log, update, comment, note

## Trade journal

**Journal entry**:
The trader's written record of one trade idea as it was taken: the setups
it matched, the reasoning, the planned prices and the emotion going in, then
the review once the linked trades have closed. Links one or more trades on
one symbol from one linked account; a trade belongs to at most one entry.
Belongs to the trader, not to an account.
_Avoid_: Journal (as an identifier), log, note, trade note, diary

**Unreviewed entry / Reviewed entry**:
A journal entry whose review the trader has not yet marked done / has marked
done. The only two entry states. Marking reviewed records the time and makes
the entry read-only; a reviewed entry can be reopened.
_Avoid_: Open, closed, pending, complete, draft, finished

**Review**:
The part of a journal entry written after every linked trade has closed:
the after screenshots, mistakes, rules followed or broken, management
decisions and notes for next time. Locked while any linked trade is open.
_Avoid_: Post-mortem, retrospective, debrief, analysis

**Setup**:
A reusable trading pattern the trader defines once and matches journal
entries against: a name, a description and its entry triggers. A setup in
use by any entry cannot be deleted.
_Avoid_: Scenario, strategy, playbook, pattern, system, template

**Entry trigger**:
One short condition that, in the trader's definition, signals a setup is
ready to be taken. A setup lists zero or more.
_Avoid_: Signal, condition, rule, criterion

**Emotion**:
The single dominant feeling the trader records going into a journal entry,
chosen from a fixed list: fear, greed, frustration, impatience, hesitation,
overconfidence, revenge, boredom, stress, FOMO.
_Avoid_: Mood, mindset, psychology, state

**Planned R:R**:
The reward-to-risk ratio the trader intended for a journal entry: the
distance from the planned entry price to the planned take profit, divided
by the distance from the planned entry price to the planned stop loss.
_Avoid_: Risk/reward, RR, target ratio, expected ratio

**Actual R**:
What a journal entry actually earned measured in units of its planned risk:
the net realized PnL of every linked trade divided by the planned risk
(planned entry-to-stop distance times the total quantity traded). Known only
once every linked trade has closed.
_Avoid_: Realized R:R, actual ratio, R multiple, return
