---
id: doc-4
title: Exchange sync spec
type: specification
created_date: "2026-11-04 12:31"
updated_date: "2026-11-04 12:31"
---

Spec for **Exchange sync**: trades arrive from the exchange, manual entry is
gone. Vocabulary per `GLOSSARY.md` → section _Exchange sync_ (Fill, Trade,
Open/Closed trade, Linked account, Sync, Sync cursor, Backfill, Balance
snapshot, Seeded trade, Key verification, Stale). Every decision below was
settled with the trader on 2026-11-03/04 on the _Exchange sync map_ (doc-3)
and its tickets; implementation must not reopen them. Where this spec is
silent, the prototype on branch `prototype/fill-to-trade`
(`server/exchange/PROTOTYPE-fill-to-trade.html`, pure module
`ExchangeSync.applySync`) is the reference behaviour; the UI prototype on
`prototype/exchange-sync-ui` is the reference layout. Neither branch is ever
merged.

v1 = **Binance USDⓈ-M perpetual futures only.**

## Purpose

Replace hand-typed trade records with facts pulled from the exchange. The
journal links one Binance API key per account, backfills 30 days of fills,
folds fills into trades (one position round-trip each), and from then on
syncs incrementally when the trader opens the trade list or presses _sync_.
Derived numbers (PnL, win rate, streaks, balance) are computed from those
facts; nothing numeric is typed by hand except a missing stop / target on a
closed trade.

## Locked decisions

1. **Source of truth**: the exchange. `transactions` and every manual-entry
   path are removed (see decision _Exchange is the source of truth for
   trades; manual entry removed_).
2. **Trade** = position round-trip on one `(symbol, positionSide)`:
   0 → non-0 → 0. Scale-ins and partial exits fold into one trade with
   weighted-average entry / exit. A flip fill is split: the closing half
   takes all of the fill's realized PnL and a pro-rata share of its fee; the
   remainder opens the opposite trade.
3. **Fills are the fact store**; trades are rebuilt from fills on every sync
   and persisted with a stable identity so AI conversations keep pointing at
   the same row.
4. **Derived values are not stored** (outcome, consecutive losses, R
   multiples, win rate, profit factor, expectancy): computed on read.
5. **Account = one credential set.** No `initialBalance`, no per-account
   testnet toggle, no manual balance. Balance is the exchange's wallet
   balance at the last successful sync.
6. **Read-only key, strictly.** Key verification = `apiRestrictions` + one
   balance read; any write flag rejects. No order/test write probe.
7. **PnL** = Σ fill `realizedPnl` − trading fees (fees converted to USDT in
   the adapter). Funding fees are not attributed to trades.
8. **SL / TP** are read from live Algo orders while a trade is open,
   refreshed every sync, frozen at close; null when first seen closed, then
   hand-editable.
9. **Sync is manual + auto-on-open**, atomic per run, per account, no
   background process, no WebSocket, no auto retry.
10. **Thin hand-written Binance client** behind an `ExchangeAdapter`
    interface. ccxt rejected.
11. **Time**: epoch ms storage, UTC+8 display through `shared/time.ts`
    (decision-1).
12. **Arithmetic** on prices, quantities and money uses fixed-point decimal
    strings (the `addDecimalStrings` family in `server/db.ts`, extracted to a
    shared module), never `Number`.

## Data model

All in `drizzle/schema.ts`, same conventions as `accounts` / `goals`
(autoincrement `id`, `userId` filter on every query, `createdAt` /
`updatedAt` with `unixepoch() * 1000` defaults, text decimals, ms
timestamps). Generate the migration with `npm run db:push`. The current DB
holds 0 transactions: no data migration.

### `accounts` (changed)

| column               | type                   | notes                                                             |
| -------------------- | ---------------------- | ----------------------------------------------------------------- |
| `name`, `notes`      | unchanged              |                                                                   |
| ~~`initialBalance`~~ | dropped                |                                                                   |
| `exchange`           | text not null          | check `in ('binance')`; v1 always `binance`                       |
| `apiKey`             | text not null          | ciphertext from `encrypt()` in `server/agents/secrets.ts`         |
| `apiSecret`          | text not null          | ciphertext, same                                                  |
| `keyVerifiedAt`      | ms, nullable           | last key verification pass                                        |
| `balanceUsdt`        | text decimal, nullable | `/fapi/v3/balance` USDT row `balance`; null until first sync      |
| `unrealizedPnlUsdt`  | text decimal, nullable | same row `crossUnPnl`                                             |
| `backfillStart`      | ms, nullable           | window start of the first backfill; null until first sync         |
| `incomeCursorAt`     | ms, nullable           | account-level cursor for new-symbol discovery (max income `time`) |
| `lastSyncedAt`       | ms, nullable           | end of the last **successful** sync                               |
| `lastSyncAttemptAt`  | ms, nullable           | start of the last run, success or not                             |
| `lastSyncErrorCode`  | text, nullable         | one of the eight codes below; cleared on success                  |
| `lastSyncRetryAt`    | ms, nullable           | set from `Retry-After` on `rate_limited`                          |

Secrets never leave the server: `Account` rows returned by tRPC omit
`apiKey` / `apiSecret` and add `apiKeyTail` (last 4 characters of the
decrypted key, computed at read time, never stored).

### `fills` (new)

Raw exchange fills plus synthetic seed rows. Unique on
`(accountId, symbol, fillId)`.

| column            | type                     | notes                                                                 |
| ----------------- | ------------------------ | --------------------------------------------------------------------- |
| `id`              | integer PK autoincrement |                                                                       |
| `userId`          | integer not null         |                                                                       |
| `accountId`       | integer not null         |                                                                       |
| `source`          | text not null            | check `in ('exchange','seed')`                                        |
| `fillId`          | text not null            | Binance `userTrades.id` as text; seed rows use `seed@<backfillStart>` |
| `orderId`         | text, nullable           | Binance `orderId`; null on seeds                                      |
| `symbol`          | text not null            | exchange symbol, e.g. `BTCUSDT`                                       |
| `positionSide`    | text not null            | check `in ('BOTH','LONG','SHORT')`                                    |
| `side`            | text not null            | check `in ('BUY','SELL')`                                             |
| `price`           | text decimal not null    |                                                                       |
| `qty`             | text decimal not null    | base asset                                                            |
| `realizedPnl`     | text decimal not null    | Binance `realizedPnl`; `0` on opening fills and seeds                 |
| `commission`      | text decimal not null    | raw, in `commissionAsset`; `0` on seeds                               |
| `commissionAsset` | text not null            | `USDT`, `BNB`, …; `USDT` on seeds                                     |
| `feeUsd`          | text decimal not null    | commission converted to USDT by the adapter at fetch time             |
| `time`            | ms not null              | fill time; seeds use `backfillStart`                                  |

Indexes: `(accountId, symbol, time)`, `(accountId, time)`.

A **seed row** is the position that existed at `backfillStart`, per
`(symbol, positionSide)`, written once by the first backfill. It is folded
like an ordinary opening fill; a trade whose first fill is a seed is a
_Seeded trade_ (`openTimeApprox = true`).

### `trades` (new; replaces `transactions`)

Rebuilt from `fills` every sync. Matched by `tradeKey`, never
delete-and-reinsert.

| column             | type                     | notes                                                                                                   |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`               | integer PK autoincrement | referenced by `conversations.tradeId`                                                                   |
| `userId`           | integer not null         |                                                                                                         |
| `accountId`        | integer not null         |                                                                                                         |
| `tradeKey`         | text not null            | `<symbol>                                                                                               | <positionSide>#<firstOpeningFillId>`, `…#seed@<backfillStart>`, `…#<fillId>+flip`. Unique with `accountId` |
| `exchange`         | text not null            | copied from the account                                                                                 |
| `exchangeSymbol`   | text not null            | `BTCUSDT`                                                                                               |
| `symbol`           | text not null            | display pair, uppercase; v1 equals `exchangeSymbol`                                                     |
| `positionSide`     | text not null            | `BOTH` / `LONG` / `SHORT`                                                                               |
| `side`             | text not null            | check `in ('long','short')`                                                                             |
| `status`           | text not null            | check `in ('open','closed')`                                                                            |
| `openTime`         | ms not null              | first opening fill time; seeds: `backfillStart`. Written on insert only, hand-editable on seeded trades |
| `openTimeApprox`   | integer boolean not null | true on seeded trades until the trader edits `openTime`                                                 |
| `closeTime`        | ms, nullable             | time of the fill that returned the position to 0                                                        |
| `entryPrice`       | text decimal not null    | Σ(opening price × qty) ÷ Σ opening qty                                                                  |
| `exitPrice`        | text decimal, nullable   | Σ(closing price × qty) ÷ Σ closing qty; null while nothing closed                                       |
| `quantity`         | text decimal not null    | Σ opening qty (base asset)                                                                              |
| `positionSizeUsdt` | text decimal not null    | Σ opening price × qty                                                                                   |
| `feeUsd`           | text decimal not null    | Σ `feeUsd` of its fills (flip fill pro-rata); window fills only on seeded trades                        |
| `realizedPnlUsd`   | text decimal not null    | Σ fill `realizedPnl` − `feeUsd`; running value while open                                               |
| `stopLossPrice`    | text decimal, nullable   | from Algo orders while open; frozen at close; hand-editable when closed                                 |
| `takeProfitPrice`  | text decimal, nullable   | same                                                                                                    |
| `syncedAt`         | ms not null              | last sync that touched the row                                                                          |

Indexes: `(accountId, status)`, `(accountId, openTime)`,
`(accountId, closeTime, id)`.

Not on the model (decided): leverage, margin mode, liquidation price,
timeFrame, tradingLogic, context, tradeItems, marketCycle, transactionType,
tvUrl, reviewFeedback, reviewChartUrl, outcome, consecutiveLosses,
accountBalance, riskRewardRatio, planned\* columns, status `reviewed`.

**Rebuild merge rules** (per account, inside the sync transaction):

- Insert rows whose `tradeKey` is new; set every column.
- Update existing rows: all columns **except** `openTime` and, on closed
  rows, `stopLossPrice` / `takeProfitPrice`. `openTimeApprox` is written on
  insert only.
- Open rows get `stopLossPrice` / `takeProfitPrice` overwritten from the
  current Algo snapshot (null when none).
- A `tradeKey` that disappears after a rebuild is logged with `[Sync]` and
  left in place (it would orphan its conversation); this should not happen
  with append-only fills.

### `conversations` (changed)

`transactionId` → `tradeId` (FK to `trades`). XOR check and index renamed
accordingly. Deleting an account deletes its trades, their conversations
and messages, and its fills, in one transaction.

### Dropped

Table `transactions`, types `Transaction` / `InsertTransaction`, and every
DB function / router procedure that exists only for manual entry
(`createTransactionWithElements`, `closeOpenTransaction`,
`getFormDefaults`, `getTradingPairs`, `assertClosedTradesHaveEndTime`, …).

## Derived values (computed on read, `server/db.ts`)

- **Outcome** of a closed trade: `realizedPnlUsd` > 0 win, < 0 loss, = 0
  breakeven.
- **Consecutive losses**: closed trades newest-first by `closeTime`, count
  until the first non-loss (same semantics as today's
  `getConsecutiveLosses`).
- **Stats** (`stats.get`, per account): win rate, profit factor,
  expectancy, current losing streak, Σ `realizedPnlUsd` (labelled _realized
  · synced_), Σ `feeUsd`, open count, open exposure = Σ `positionSizeUsdt`
  of open trades, exposure ÷ `balanceUsdt`. No per-system stats, no balance
  curve.
- **R multiple** of a trade (detail page only): computed from entry /
  stop / exit when `stopLossPrice` is non-null, otherwise not shown.
- **Position size calculator default balance** and **AI review context
  balance** read `accounts.balanceUsdt`; no live exchange call.

## ExchangeAdapter

`server/exchange/adapter.ts` — the only surface the sync algorithm sees.
One implementation in v1: `server/exchange/binance/`.

```ts
export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
}

export type KeyVerification =
  | { ok: true }
  | {
      ok: false;
      code: "invalid_key" | "permissions_changed" | "futures_unreadable";
    };

export interface ExchangeFill {
  fillId: string;
  orderId: string;
  symbol: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
  side: "BUY" | "SELL";
  price: string;
  qty: string;
  realizedPnl: string;
  commission: string;
  commissionAsset: string;
  feeUsd: string; // converted by the adapter
  time: number;
}

export interface ExchangePosition {
  symbol: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
  positionAmt: string; // signed as the exchange reports it
  entryPrice: string;
  notional: string;
  updateTime: number;
}

export interface ExchangeConditionalOrder {
  symbol: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
  side: "BUY" | "SELL";
  kind: "stop" | "takeProfit"; // STOP/STOP_MARKET vs TAKE_PROFIT/TAKE_PROFIT_MARKET; trailing stops dropped
  triggerPrice: string;
  closePosition: boolean;
  quantity: string;
}

export interface ExchangeBalance {
  balanceUsdt: string;
  unrealizedPnlUsdt: string;
  updateTime: number;
}

export interface ExchangeAdapter {
  verifyKey(c: ExchangeCredentials): Promise<KeyVerification>;
  /** Distinct symbols with REALIZED_PNL / COMMISSION / FUNDING_FEE income in [from, to], plus the max income time seen. */
  discoverSymbols(
    c: ExchangeCredentials,
    from: number,
    to: number
  ): Promise<{ symbols: string[]; maxTime: number }>;
  fetchFills(
    c: ExchangeCredentials,
    symbol: string,
    from: number,
    to: number
  ): Promise<ExchangeFill[]>;
  fetchPositions(c: ExchangeCredentials): Promise<ExchangePosition[]>;
  fetchConditionalOrders(
    c: ExchangeCredentials,
    symbol: string
  ): Promise<ExchangeConditionalOrder[]>;
  fetchBalance(c: ExchangeCredentials): Promise<ExchangeBalance>;
}
```

Adapter errors are thrown as `ExchangeError { code: SyncErrorCode; detail: string }`;
`detail` is logged server-side only, never persisted or shown.

### Binance implementation

Base `https://fapi.binance.com` (futures) and `https://api.binance.com`
(`apiRestrictions` only). HMAC-SHA256 signed query, `recvWindow` 5000,
`timestamp` = local clock (no server-time correction in v1). Per-request
timeout 15 s, no whole-run timeout. Uses Node `fetch`; the client does not
handle proxies itself: on a machine that needs one, set
`NODE_USE_ENV_PROXY=1` (+ `HTTPS_PROXY`) in the devbox env, as the key
wizard does.

| adapter method           | endpoint                                             | weight | notes                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifyKey`              | `GET /sapi/v1/account/apiRestrictions`               | 1      | then one `GET /fapi/v3/balance`                                                                                                                                                                    |
| `discoverSymbols`        | `GET /fapi/v1/income`                                | 30     | no `symbol`/`incomeType`, `limit` 1000, ≤7-day windows, page by advancing `startTime`, dedupe `tranId`                                                                                             |
| `fetchFills`             | `GET /fapi/v1/userTrades`                            | 5      | `symbol` required, ≤7-day windows, `limit` 1000, page by `startTime` = last `time`, dedupe by `id`                                                                                                 |
| `fetchPositions`         | `GET /fapi/v3/positionRisk`                          | n/a    | rows with `positionAmt != 0`; official weight unconfirmed, read live from `X-MBX-USED-WEIGHT-1M`                                                                                                   |
| `fetchConditionalOrders` | `GET /fapi/v1/openAlgoOrders?symbol=`                | 1      | keep `algoStatus = NEW`; map `orderType`; use `triggerPrice`, never `price`                                                                                                                        |
| `fetchBalance`           | `GET /fapi/v3/balance`                               | 5      | row `asset == USDT`: `balance`, `crossUnPnl`, `updateTime`                                                                                                                                         |
| fee conversion           | `GET /fapi/v1/klines?symbol=<ASSET>USDT&interval=1m` | 1      | public; `USDT` commission passes through; any other asset is converted with the 1-minute close at the fill's minute, cached per (asset, minute) within a run; no kline for that minute → `unknown` |

Rate limit: 2400 weight/min per IP; a 30-day backfill of 5 symbols costs
≈ 335, so no proactive throttling in v1. HTTP 429/418 → `rate_limited`
with `Retry-After`.

Key verification rejects when `enableReading` is false or **any** of
`enableFutures`, `enableWithdrawals`, `enableInternalTransfer`,
`enableMargin`, `enableSpotAndMarginTrading`, `enableVanillaOptions`,
`enablePortfolioMarginTrading`, `enableFixApiTrade`,
`permitsUniversalTransfer` is true (`permissions_changed`). A passing
`apiRestrictions` followed by a balance read failing with `-2015` is
`futures_unreadable`. Binance confirmed live (task-48): all futures
USER_DATA reads work with Enable Reading only.

## Sync algorithm (`server/exchange/sync.ts`)

Entry point `runSync(accountId, userId, { reason: "manual" | "auto" })`.

0. **Lock**: in-process `Set<accountId>`; if present throw
   `TRPCError CONFLICT` (not recorded as an attempt).
1. **Attempt**: write `lastSyncAttemptAt = now` (its own tiny transaction,
   survives failure).
2. **Verify key** → on failure persist the code, stop.
3. **Decide window.**
   - Backfill (`backfillStart` null): `windowStart = now − 30 d`,
     `windowEnd = now`.
   - Incremental: income from `incomeCursorAt − 1 h`; per-symbol fill
     cursor = max stored `fills.time` for that symbol − 1 h.
4. **Fetch** (all before any write):
   1. `discoverSymbols(windowStart|incomeCursor−1h, now)` → new-symbol set.
   2. Symbols to fetch = discovered ∪ symbols of open trades in DB (so
      SL/TP and closes are caught even without new income rows).
   3. `fetchFills(symbol, cursor, now)` per symbol.
   4. `fetchPositions()`. Backfill only: if any position `updateTime` >
      the fills `windowEnd`, refetch that symbol's fills to `now` first.
   5. `fetchConditionalOrders(symbol)` for every symbol with a non-zero
      position.
   6. `fetchBalance()`.
5. **Dedupe** fetched fills against stored `(symbol, fillId)`.
6. **Seeds** (backfill only): per `(symbol, positionSide)`,
   `startAmt = positionAmt(now) − Σ signed window fills`. If non-zero,
   write a seed fill row: `qty = |startAmt|`, `side` by sign, `time =
windowStart`, `price` back-solved from the first reducing fill's
   `realizedPnl` (exact) or, when nothing reduced inside the window, from
   `positionRisk.entryPrice` minus window adds. Hedge mode: sign from
   `positionSide`; one-way: sign of `positionAmt`.
7. **Fold** all stored fills per `(symbol, positionSide)` in
   `(time, fillId)` order, exactly as the prototype's `foldKey`: same-direction
   fill = scale-in; opposite = reduce by `min(qty, remaining)`, pro-rata
   fee; remaining 0 → closed, `closeTime = fill.time`; leftover on `BOTH`
   → flip opens `…#<fillId>+flip`; leftover on `LONG`/`SHORT` → adapter
   error. A reducing fill with no open position on a hedge leg is skipped
   and logged.
8. **SL/TP**: for each open trade, pick from conditional orders matching
   `symbol` + `positionSide` with `side` opposite to the trade: `stop` →
   `stopLossPrice`, `takeProfit` → `takeProfitPrice`; prefer
   `closePosition = true`, else the level that fires first (long: highest
   stop / lowest take-profit; short: the reverse). Quantity-based orders
   count only when `quantity ≥ remaining`; otherwise ignored. Closed trades
   are left as they are.
9. **Consistency check** (log only): per closed trade
   `dir × (exit − entry) × exitQty` vs Σ fill `realizedPnl`; difference
   > 0.01 logged with `[Sync]`.
10. **Write**, one `runInSqliteTransaction`: insert new fills (and seeds),
    upsert trades by `tradeKey` (merge rules above), set
    `backfillStart` (first time), `incomeCursorAt = max(income time)`,
    `balanceUsdt`, `unrealizedPnlUsdt`, `lastSyncedAt = now`,
    `lastSyncErrorCode = null`, `lastSyncRetryAt = null`,
    `keyVerifiedAt = now`.
11. On any throw after step 1: nothing from step 10 is written; persist
    `lastSyncErrorCode` (+ `lastSyncRetryAt` for `rate_limited`); log
    `[Sync] <accountId> <code> <detail>`; rethrow as `TRPCError` with the
    code in `message`.

Idempotent by `(accountId, symbol, fillId)`: re-running after a failure
costs only weight.

**Auto-sync** (`account.autoSync`, called by the Trades page on mount and
the Dashboard on mount): for each account that is _stale_
(`lastSyncedAt` null or older than 5 min) and whose `lastSyncErrorCode` is
null or transient (`rate_limited` only after `lastSyncRetryAt`,
`exchange_unavailable`, `network`), run `runSync` independently; a failure
marks only that account. Needs-human codes are retried only by the manual
button / `retry` link.

## Error taxonomy

Persisted as `accounts.lastSyncErrorCode`. Reason text is produced
**client-side in Chinese** from the code; the status line skeleton stays
the prototype's lowercase English. Raw Binance text is never stored or
shown.

| code                   | trigger                                                            | class       |
| ---------------------- | ------------------------------------------------------------------ | ----------- |
| `invalid_key`          | `-2015` / `-2014` / `-2008` / HTTP 401 on signed call              | needs human |
| `permissions_changed`  | `apiRestrictions` shows a write flag or `enableReading = false`    | needs human |
| `futures_unreadable`   | `apiRestrictions` passes, balance read `-2015`                     | needs human |
| `clock_skew`           | `-1021`                                                            | needs human |
| `rate_limited`         | HTTP 429 / 418; `lastSyncRetryAt` from `Retry-After`, default 60 s | transient   |
| `exchange_unavailable` | HTTP 5xx, `-1001`, maintenance                                     | transient   |
| `network`              | connect failure, timeout, proxy                                    | transient   |
| `unknown`              | anything else, incl. reconstruction errors; full response logged   | needs human |

Link-time failures use the same codes, rendered as one sentence under the
_api secret_ field; the account is not created. There is no
unverified-account state.

## tRPC surface (`server/routers.ts`)

Namespace `transaction` is removed; `trade` replaces it. All
`publicProcedure`, all reads/writes in `server/db.ts`.

**`account`**

- `list` / `get` → `Account` without secrets, plus `apiKeyTail`.
- `create({ name, exchange: "binance", apiKey, apiSecret, notes? })` →
  verify key (adapter) → encrypt → insert. On verification failure throw
  `TRPCError BAD_REQUEST` with the error code; nothing is written.
- `update({ id, name?, notes? })`.
- `replaceKey({ id, apiKey, apiSecret })` → verify → encrypt → update;
  clears `lastSyncErrorCode`; trades, fills and cursors untouched.
- `delete({ id })` → cascades fills, trades, conversations, messages.
- `sync({ id })` → `runSync(..., { reason: "manual" })`; returns the
  refreshed account.
- `autoSync()` → runs stale eligible accounts; returns per-account
  outcome.

**`trade`**

- `list({ accountId, status? })` ordered open first then `openTime` desc.
- `get({ id })`.
- `update({ id, stopLossPrice?, takeProfitPrice?, openTime? })`:
  `stopLossPrice` / `takeProfitPrice` only when `status = closed`;
  `openTime` only when `openTimeApprox = true` (sets it false). Anything
  else → `BAD_REQUEST`.
- No `create`, `close`, `delete`, `getFormDefaults`, `getTradingPairs`.

**`stats.get({ accountId })`** → the derived values above.

**`reviewAgent.*`** keyed by `tradeId` instead of `transactionId`.

## UI (per task-47; read `DESIGN.md`, `PRODUCT.md` first)

- **Accounts** — _dossier_: selected account as a full-page record (hero
  wallet balance; exchange + key tail + _read-only verified <date>_; sync
  line; notes; _linked <date> · backfilled from <date>_; actions edit /
  replace key / unlink), other accounts as a short list, link-account form
  inline at the bottom (name, exchange fixed to binance, api key, api
  secret, notes). Unlink reads _unlink · deletes its trades_; the confirm
  dialog repeats that AI conversations go with them.
- **Trades** (`/trades`, replaces `/transactions`): open trades first with
  stop / target inline, then closed trades grouped by day with a per-day
  PnL subtotal. One line per trade: `symbol side qty @ entry → exit`, PnL
  right-aligned; `openTimeApprox` shown only as `~`. Never-synced: _nothing
  synced yet_ + sync button.
- **Trade detail** — _instrument_: hero net PnL (or _open_), one meta
  line, price ruler (stop — entry — exit — target, exit in the outcome hue),
  source caption for the levels (_live from binance, refreshed each sync_ /
  _as set on binance when the trade closed_), hand-edit fallback _set by
  hand →_ only for a closed trade with a null level. _打开 AI 复盘_ stays
  top-right.
- **Dashboard** — _ledger_: hero wallet balance with unrealized sub-line
  when open trades exist; sync line; _realized · synced trades_ row with
  fees total (absolute, no %); the existing four-stat grid; one _open_ line
  (count, exposure, exposure ÷ balance). Never-synced: hero `—`, _never
  synced · sync now_, performance section not rendered.
- **Sync failure** everywhere: ink, never the loss hue:
  `! sync failed <ago> — <reason>` + `last successful sync <time> · retry`.
  Concurrent sync toasts `同步进行中`.
- Removed: `NewTransaction` page and route, close-trade form, every
  rule-set / tagging / written-review control, `/transactions` route.
  Pre-trade, Goals, Tools, Settings unchanged.

## Review agent

`server/agents/contextBuilder.ts`, `reviewAgent`, and the
`getRecentTrades` skill read `trades` instead of `transactions` and carry
only exchange facts (symbol, side, open/close time in UTC+8, entry / exit /
stop / target, quantity, size, fees, net PnL, `openTimeApprox`). What the
model is told when there is no written thesis is still open on the map
(_Not yet specified_); the first implementation keeps the current prompt
shape minus the removed fields.

## Testing

- Pure reconstruction module (`server/exchange/reconstruct.ts`) covered by
  Vitest with the prototype's eight scenarios as fixtures (scale-in, partial
  exits, flip, hedge, pre-window seed, pre-window closed inside window, BNB
  fee, idempotent re-sync); every case asserts Σ `realizedPnl` ==
  `dir × (exit − entry) × exitQty`.
- Sync algorithm tested with a fake `ExchangeAdapter` (fixtures, no network),
  including each error code and the atomic-rollback guarantee.
- Binance client tested against recorded responses; live runs only via the
  probe script, never in CI. Dev/e2e strategy beyond this is map fog.

## Out of scope (v1)

Other exchanges (seam exists), spot / COIN-M / options, funding-fee
attribution, balance curve, background / WebSocket sync, leverage / margin
mode / liquidation price, manual entry fallback, migration of old
transactions.
