# Binance USD-M Futures: positionRisk v3, balance v3, account v3

Researched 2026-11-04 for TASK-44. Docs base:
`https://developers.binance.com/docs/derivatives/usds-margined-futures/`

## Source access note

The official docs page for Position Information V3
(`.../trade/rest-api/Position-Information-V3`) could not be read: the fetch
tool returns the Trade page truncated before that section, and
`llms-full.txt` redirects (302). Fields below therefore come from Binance's
own official connector, which is generated from the official OpenAPI spec:
`binance/binance-connector-js`,
`clients/derivatives-trading-usds-futures/src/rest-api/types/`
(https://github.com/binance/binance-connector-js/tree/master/clients/derivatives-trading-usds-futures/src/rest-api/types).
Field descriptions were paraphrased by the fetch tool, not verbatim.

## GET /fapi/v3/positionRisk

Weight 5 (earlier fact-check; UNCONFIRMED from the official page).
Source: `position-information-v3-response-inner.ts` in the official connector
(URL above). All fields optional in the type; strings unless noted.

symbol, positionSide, positionAmt (positive long, negative short), entryPrice,
breakEvenPrice, markPrice, unRealizedProfit, liquidationPrice, isolatedMargin,
notional, marginAsset, isolatedWallet, initialMargin, maintMargin,
positionInitialMargin, openOrderInitialMargin, adl (number), bidNotional
(ignore), askNotional (ignore), updateTime (number, ms).

- No `leverage`, no `marginType`, no `isAutoAddMargin`, no `maxNotionalValue`.
- No open-time or first-fill field. `updateTime` is last update, not open time.
- No TP/SL field.
- Only symbols with a position or open orders are returned (UNCONFIRMED for the
  v3 official text; from an earlier zh-CN search summary).

For contrast, V2 (`position-information-v2-response-inner.ts`, same directory)
has `leverage`, `marginType`, `isAutoAddMargin`, `maxNotionalValue`, and lacks
`marginAsset`, `adl`, `initialMargin`, `maintMargin`, `positionInitialMargin`,
`openOrderInitialMargin`, `bidNotional`, `askNotional`.

## GET /fapi/v3/balance

Weight 5. Sources: official docs page
https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Futures-Account-Balance-V3
(read via the Account section listing) and connector type
`futures-account-balance-v3-response.ts` (V3 response is an array of the V2
inner type).

Array of: accountAlias, asset, balance, crossWalletBalance, crossUnPnl,
availableBalance, maxWithdrawAmount, marginAvailable (boolean), updateTime (ms).
The docs list V3 fields identical to V2.

There is no `walletBalance` field here; the wallet balance is `balance`.

## GET /fapi/v3/account

Weight 5. Sources:
https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Account-Information-V3
and connector types `account-information-v3-response-*.ts`.

- Top level (strings): totalInitialMargin, totalMaintMargin,
  totalWalletBalance, totalUnrealizedProfit, totalMarginBalance,
  totalPositionInitialMargin, totalOpenOrderInitialMargin,
  totalCrossWalletBalance, totalCrossUnPnl, availableBalance, maxWithdrawAmount.
- assets[] (quote assets USDT/USDC/BTC): asset, walletBalance,
  unrealizedProfit, marginBalance, maintMargin, initialMargin,
  positionInitialMargin, openOrderInitialMargin, crossWalletBalance, crossUnPnl,
  availableBalance, maxWithdrawAmount, updateTime.
- positions[]: symbol, positionSide, positionAmt, unrealizedProfit,
  isolatedMargin, notional, isolatedWallet, initialMargin, maintMargin,
  updateTime. No entryPrice, no leverage.
- V2 account differs: has feeTier/canTrade/etc., `marginAvailable` on assets,
  and per-position `leverage`, `entryPrice`, `isolated`, `maxNotional`. V3 drops
  the permission/feeTier fields.

## Deprecation of v2

- Changelog entry 2024-07-24: `GET /fapi/v2/balance`, `GET /fapi/v2/account`,
  `GET /fapi/v2/positionRisk` (and WS API account.status/balance/position)
  "will be deprecated in the coming months (exact date to be announced later)".
  https://developers.binance.com/docs/derivatives/change-log
- No exact removal date found in the parts of the changelog read (roughly the
  first 100k characters plus the tail from 100k, which holds 2022 and older).
  Some middle entries may have been missed: exact v2 removal date UNCONFIRMED.
- Precedent: v1 account/balance/positionRisk unsupported from 2023-07-15
  (changelog entry 2023-06-28, same URL).

## Leverage and marginType in v3

- Not present in v3 positionRisk, v3 balance or v3 account (connector types).
- Where they live instead: UNCONFIRMED. `GET /fapi/v1/accountConfig` exists but
  returns only feeTier, canTrade, canDeposit, canWithdraw, dualSidePosition,
  multiAssetsMargin, updateTime, tradeGroupId. `GET /fapi/v1/leverageBracket`
  gives bracket max leverage, not the user's setting. Both from
  https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Futures-Account-Balance-V3
  (page lists them). `GET /fapi/v1/symbolConfig` likely holds leverage and
  marginType but its fields were not fetched (UNCONFIRMED).
- Hedge vs one-way mode: `GET /fapi/v1/positionSide/dual` returns
  `dualSidePosition` (same page).

## Recommendation for the journal

Seed a trade for a pre-window position from v3 positionRisk, for each row with
`positionAmt != 0`:

- entry price: `entryPrice`
- quantity: `abs(positionAmt)`
- side: in one-way mode (`positionSide = BOTH`) the sign of `positionAmt`; in
  hedge mode `positionSide` (LONG/SHORT). Sign of SHORT `positionAmt` in hedge
  mode is UNCONFIRMED.
- notional: `notional` (store absolute value)
- symbol: `symbol` (uppercase), `marginAsset` as quote
- approximate open time: no field exists. `updateTime` is only the last
  change, so it is an upper bound. Use it flagged as approximate and let the
  user edit it; do not present it as exact.
- leverage and margin type: not in v3; omit, or fetch separately (endpoint
  UNCONFIRMED).
- optional context: `liquidationPrice`, `markPrice`, `unRealizedProfit`.

USDT account balance snapshot: from `/fapi/v3/balance`, the row with
`asset == "USDT"`: `balance` (wallet), `crossUnPnl`, `availableBalance`,
`updateTime`. If margin balance (equity) is wanted, use `/fapi/v3/account`
`assets[]` row with `asset == "USDT"`: `walletBalance`, `unrealizedProfit`,
`marginBalance`, `availableBalance`, since balance v3 has no `marginBalance`.
Whether `crossUnPnl` excludes isolated positions' PnL is UNCONFIRMED. Use v3
only; v2 is announced for deprecation.
