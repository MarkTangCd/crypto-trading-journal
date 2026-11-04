---
id: doc-3
title: Exchange sync map
type: other
created_date: '2026-11-04 06:45'
updated_date: '2026-11-04 12:46'
---

## Destination

A locked **Exchange sync spec** (Backlog doc) plus the new data model (`trades` table, linked-account credentials) and an ordered set of implementation tasks, ready to hand to build sessions. No implementation happens on this map. v1 = Binance USDⓈ-M perpetuals only.

## Notes

- Domain: crypto trading journal, single trader. Vocabulary in `GLOSSARY.md` → section **Exchange sync** (Fill, Trade, Open/Closed trade, Linked account, Sync, Sync cursor, Backfill). Use those words; never "transaction" for the new model.
- Skills every session should consult: `grilling` + `domain-modeling` for grilling tickets; `prototype` for prototype tickets; `research` for research tickets. UI tickets read `DESIGN.md` and `PRODUCT.md` first.
- Time policy stays decision-1 (epoch ms storage, UTC+8 display via `shared/time.ts`).
- Credentials reuse the encryption in `server/agents/secrets.ts`.
- Fact-check notes from charting (with URLs): `/private/tmp/claude-501/-Users-marktang-programming-personal-projects-crypto-trading-journal/15372519-435a-4ecc-bdd1-97d3852e0cee/scratchpad/binance-facts.md` (scratch; research tickets should re-verify and persist findings on `research/<name>` branches).
- Current DB has 0 transactions, so no data wipe is needed before the schema change.

## Decisions so far (charting, 2026-11-03/04)

Settled directly with the trader while charting; each later ticket builds on these and must not reopen them.

- **Scope**: USDⓈ-M perpetual futures only. No spot, COIN-M, options.
- **Trade = position round-trip** on one symbol + one side (hedge-mode positionSide aware): 0 → non-0 → 0. Scale-ins/partial exits fold in as weighted-average entry/exit; openTime = first opening fill, closeTime = fill that returns position to 0. A flip fill is split into close + open with pro-rata fee.
- **Manual entry removed entirely.** Every account is a linked account; trades arrive only via sync. All non-exchange columns are dropped (timeFrame, tradingLogic, context, tradeItems, marketCycle, transactionType, tvUrl, reviewFeedback, reviewChartUrl, status `reviewed`). Rule-set tagging and written review leave the product; the per-trade AI review conversation, Pre-trade and Goals stay. PRODUCT.md must be updated to match.
- **Derived values are not stored**: outcome, consecutive losses, planned R/R, account balance are computed on read.
- **`trades` columns**: symbol, side (long/short), status (open/closed), openTime, closeTime, entryPrice, exitPrice, quantity (base asset), positionSizeUsdt (Σ opening price×qty), feeUsd, realizedPnlUsd (net of fees), stopLossPrice, takeProfitPrice (nullable, hand-editable), openTimeApprox flag, plus exchange, exchangeSymbol, positionSide, syncedAt. No leverage / margin mode / liquidation price.
- **New table `trades`, `transactions` dropped**, conversations re-point to trades; tRPC namespace `transaction` → `trade`.
- **Account = one credential set**: name, exchange (stored, v1 always `binance`), apiKey, apiSecret (encrypted), notes. Server verifies the key is read-only at save time. No per-account testnet toggle (env only), no initialBalance.
- **Integration**: hand-written thin Binance REST client behind our own `ExchangeAdapter` interface; ccxt rejected for v1 (≈70 MB, no per-exchange tree-shaking, and it cannot fetch Binance position history anyway).
- **Sync trigger**: manual button + auto-sync on opening the trade list when stale. No background process, no WebSocket. Failures show last successful sync time + one-line error; no auto retry.
- **Balance** comes from the exchange wallet at sync; initialBalance retired (storage/curve decided in its own ticket).
- **PnL** = realized PnL − trading fees. Funding fees are not attributed per trade (account balance only). Non-stablecoin fees (e.g. BNB) converted to USDT via the exchange's 1-minute kline at fill time, inside the adapter.
- **SL/TP** are read from live conditional (Algo) orders while a trade is open, refreshed each sync, frozen at close; null for trades first seen already closed, hand-editable then.
- **Backfill 30 days** on link (Binance hard limit is 3 months); incremental sync cursor afterwards. Positions pre-dating the window are seeded as trades with openTime = window start, flagged approximate (superseded detail: see the fill-to-trade prototype decision below).
- **Deletion**: deleting an account cascades its trades and their AI conversations; changing credentials keeps trades; re-sync is idempotent by fill id.

<!-- one line per closed ticket, appended as tickets resolve -->

- [Binance API key permissions and read-only verification](task-41): a key's permissions are readable via GET /sapi/v1/account/apiRestrictions, but `enableFutures` is one flag, so read-only cannot be proven; reject any withdraw/transfer/margin/spot-trade flag, warn-or-reject on enableFutures (decided in task-51). No 90-day expiry for read-only keys. Findings: branch research/binance-api-key-permissions.
- [Binance Algo order endpoints for stop loss and take profit](task-42): SL/TP come from GET /fapi/v1/openAlgoOrders per open symbol (algoStatus NEW, orderType STOP* → SL, TAKE_PROFIT* → TP, use triggerPrice, prefer closePosition=true, ladders stay null). History via allAlgoOrders only 90 days (triggered) / 3 days (cancelled), so snapshot-every-sync remains primary. Findings: branch research/binance-algo-orders.
- [Binance income history and traded-symbol discovery for backfill](task-43): discover symbols from GET /fapi/v1/income (no symbol filter, REALIZED_PNL + COMMISSION + FUNDING_FEE rows), then userTrades per symbol in 7-day windows; 5 symbols × 30 days ≈ 335 weight of the 2400/min budget. Incremental sync = income from cursor minus overlap, then userTrades only for symbols with new rows or open positions. Async download endpoints rejected. Findings: branch research/binance-income-and-symbol-discovery.
- [Binance positionRisk v3 and balance v3 field confirmation](task-44): seed pre-window trades from /fapi/v3/positionRisk (entryPrice, |positionAmt|, positionAmt sign or positionSide, |notional|, updateTime as approximate openTime); v3 has no leverage/marginType anywhere, confirming they stay off the model. Balance snapshot = /fapi/v3/balance USDT row (balance, crossUnPnl, availableBalance, updateTime). Findings: branch research/binance-position-and-balance-v3.
- [Balance snapshot and balance-curve source after initialBalance retires](task-45): accounts gets balanceUsdt (wallet `balance`) + unrealizedPnlUsdt (`crossUnPnl`) + one lastSyncedAt, written with trades in the same transaction at the end of a successful sync; no snapshot table. Hero = wallet balance, delta = Σ realized PnL of synced closed trades (no %), never-synced shows — / 'never synced' / 'sync now'; position-size calculator and AI context read the stored snapshot.
- [Prototype fill-to-trade reconstruction](task-46): the Trade definition holds (10 trades, PnL check exact). New `fills` table is the fact store; trades are rebuilt from fills every sync with a stable identity (symbol+positionSide+first opening fill id, `seed@windowStart`, `fillId+flip`). Cursor = per-symbol max fill time minus overlap, deduped by fill id. SL/TP overwritten on open trades after folding, frozen at close. PnL = Σ fill realizedPnl − fees; (exit−entry)×qty only a logged check. Seeds: openTime = windowStart (not updateTime), entry back-solved from realizedPnl; fills fetched before positionRisk; fixed-point strings, never Number. Prototype: branch prototype/fill-to-trade.
- [Prototype linked-account UI and trimmed trade views](task-47): screens mixed from three variants — Accounts and Trades as the 'dossier' (one-account record with inline link form; open trades first, closed grouped by day, one line per trade), Trade detail as the 'instrument' (hero PnL + stop/entry/exit/target price ruler, hand-edit fallback for null levels), Dashboard as the 'ledger' (hero balance + unrealized, realized row with fees, the four existing stats, one open-exposure line). Sync failure in ink with last-success line; read-only rejection under the secret field. Prototype: branch prototype/exchange-sync-ui.
- [Create a read-only Binance futures API key for the journal](task-48): key lives in `.local/binance.env` (gitignored, 0600), system-generated HMAC, Enable Reading only, unrestricted IP, no testnet key. Live probe CONFIRMED: all futures USER_DATA reads work with enableFutures=false; POST /fapi/v1/order/test is rejected (-2015) for that key; income REALIZED_PNL and COMMISSION rows carry symbol + tradeId (FUNDING_FEE has symbol, no tradeId); account is in hedge mode. Node fetch ignores HTTPS_PROXY: the client needs NODE_USE_ENV_PROXY=1 (Node 22.22) or an undici ProxyAgent. Assets: scripts/binance-key-wizard.sh, scripts/binance-key-probe.mjs (uncommitted).
- [Read-only key policy and sync error taxonomy](task-51): key verification = apiRestrictions + one balance read, at link / replace key / start of every sync; strict reject on enableFutures or any write flag, no order/test probe, no unverified-account state. Eight error codes (invalid_key, permissions_changed, futures_unreadable, clock_skew, rate_limited, exchange_unavailable, network, unknown) persisted as accounts.lastSyncErrorCode with lastSyncAttemptAt, lastSyncRetryAt, keyVerifiedAt; reason text client-side in Chinese. Sync run is atomic (no partial backfill), per account, 15 s per request, in-process lock (CONFLICT on concurrent call). Stale = 5 min; auto-sync skips needs-human codes. No separate ADR; GLOSSARY gains Key verification and Stale.
- [Write the Exchange sync spec, schema and ADR](task-49): spec is doc-4 (Exchange sync spec), ADR is decision-2 (Exchange is the source of truth for trades; manual entry removed), PRODUCT.md purpose/success criteria and GLOSSARY Sync cursor updated. Settled in passing: seeds persist as `fills` rows with source=seed so trades rebuild from fills alone; rebuild writes openTime on insert only and never touches SL/TP on closed rows (hand edits survive without extra columns); proxy via NODE_USE_ENV_PROXY=1 in the devbox env, not in the client.
- [Break the Exchange sync spec into implementation tasks](task-50): seventeen build tasks, task-52 to task-68, all ready-for-agent and referencing doc-4; ordered additive-first (fixed-point, adapter, Binance client ×2, reconstruction, additive schema, DB functions, sync, account / trade / review-agent procedures, Accounts / Trades / Detail / Dashboard pages) then two removal tasks (manual-entry UI + e2e re-base, drop transactions / initialBalance / dead server code). Critical path 53 → 54 → 55 → 59 → 60 → 63 → 64 → 65 → 67 → 68. The way to the destination is clear; no tickets remain on this map.

## Not yet specified

- Two facts still need a live open position to verify (the account had none on 2026-11-04): whether live openOrders still returns migrated conditional types alongside openAlgoOrders, and the sign of positionAmt for a hedge-mode SHORT. Re-run `scripts/binance-key-probe.mjs` while a position is open, during the thin-client build.
- Review-agent context (`server/agents/contextBuilder.ts`, `getRecentTrades` skill) once trades replace transactions: what the model is told about a trade when there is no written thesis.
- Dev/e2e strategy: recorded fixtures vs the Binance demo testnet (no testnet key was created in task-48; the probe supports `--testnet` if one is added later).
- Whether hedge-mode and one-way-mode trades need any UI distinction beyond the positionSide column (the UI prototype used one-way fixtures only).
- Gap handling when an account goes unsynced for longer than Binance's 3-month history: incremental sync never recomputes seeds, so missing fills would mis-reconstruct positions. v1 spec documents the gap and does nothing; decide whether a stale-beyond-90-days account must re-backfill (and how its existing trades survive) before or during the build.

## Out of scope

- Second exchange adapters (OKX, Bybit, Bitget…). v1 is Binance; the ExchangeAdapter seam exists so a later effort can add them.
- Spot, COIN-M, options markets.
- Funding-fee attribution per trade.
- Balance curve / equity chart on the Dashboard (task-45): no snapshot history in v1, the hero numeral stays the design; deposits and withdrawals would pollute a curve anyway.
- Background / WebSocket live sync.
- Leverage, margin mode, liquidation price on trades.
- Keeping manual trade entry as a fallback for unlinked accounts.
- Data migration of existing transactions (table is empty).
