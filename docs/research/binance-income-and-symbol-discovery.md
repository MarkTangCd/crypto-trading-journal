# Binance USDS-M Futures: income history, symbol discovery, request budget

Checked 2026-11-04 against developers.binance.com (first-party docs) and the
first-party `binance/binance-connector-js` generated client. Unconfirmed items
are marked UNCONFIRMED.

Doc base: `https://developers.binance.com/docs/derivatives/usds-margined-futures`

Method note: the doc site returns an empty bot-challenge page to plain `curl`,
so pages were read through a fetch tool that summarizes content. Re-check
details on the live page before treating them as contract.

## 1. GET /fapi/v1/income

Source: <https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Get-Income-History>

- Weight: 30 (IP).
- Params: `symbol` (optional), `incomeType` (optional), `startTime`/`endTime`
  (ms, inclusive), `limit` (default 100, max 1000), `recvWindow`, `timestamp`.
- Omit `incomeType` to get all types. Omit `symbol` to get all symbols
  (`symbol` is optional on the request; response `symbol` is "if existing").
- Omit both times: last 7 days returned.
- Depth: "Income history only contains data for the last three months."
- Max `startTime`..`endTime` span: not stated on the page. UNCONFIRMED. Plan
  for 7 days (the stated span cap on `userTrades`) as the conservative choice.
- No `fromId`/page param is documented, so paging means advancing `startTime`
  past the last row's `time` when a page returns `limit` rows. Behavior for
  several rows sharing one millisecond at the page boundary: UNCONFIRMED.
  Dedupe by (`incomeType`, `tranId`); the page says `tranId` is unique within
  the same `incomeType`.
- Response fields: `symbol`, `incomeType`, `income`, `asset`, `info`, `time`,
  `tranId`, `tradeId`. Field docs: `symbol` "trade symbol, if existing",
  `tradeId` "trade id, if existing"
  (<https://raw.githubusercontent.com/binance/binance-connector-js/master/clients/derivatives-trading-usds-futures/src/rest-api/types/get-income-history-response-inner.ts>).

### Full incomeType list (23)

The doc page shows 8 and collapses 15 more
(<https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Get-Income-History>).
The complete enum is in the first-party connector's
`GetIncomeHistoryIncomeTypeEnum`
(<https://raw.githubusercontent.com/binance/binance-connector-js/master/clients/derivatives-trading-usds-futures/src/rest-api/modules/account-api.ts>):

TRANSFER, WELCOME_BONUS, REALIZED_PNL, FUNDING_FEE, COMMISSION,
INSURANCE_CLEAR, REFERRAL_KICKBACK, COMMISSION_REBATE, API_REBATE,
CONTEST_REWARD, CROSS_COLLATERAL_TRANSFER, OPTIONS_PREMIUM_FEE,
OPTIONS_SETTLE_PROFIT, INTERNAL_TRANSFER, AUTO_EXCHANGE,
DELIVERED_SETTELMENT (sic), COIN_SWAP_DEPOSIT, COIN_SWAP_WITHDRAW,
POSITION_LIMIT_INCREASE_FEE, STRATEGY_UMFUTURES_TRANSFER, FEE_RETURN,
BFUSD_REWARD, SPECIAL_FUNDING_FEE.

That is 23, matching "8 shown + 15 hidden". Whether the live API can return
types outside this enum: UNCONFIRMED.

### Do REALIZED_PNL / COMMISSION rows carry symbol and tradeId?

- The docs only say "if existing" for both fields and have no per-type notes.
  Documented guarantee: none. Empirical behavior (REALIZED_PNL and COMMISSION
  rows populated with `symbol` and `tradeId`): UNCONFIRMED. Verify with one
  live read-only call before relying on it. Non-trade types (TRANSFER,
  WELCOME_BONUS) are expected to lack them.
- `userTrades` independently carries `symbol`, `id` (trade id), `orderId`,
  `commission`, `commissionAsset`, `realizedPnl`, `time`, so trade-level data
  does not depend on income rows.

## 2. GET /fapi/v1/userTrades

Source: <https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Account-Trade-List>

- Weight 5. `symbol` is required. `limit` default 500, max 1000.
- No times: last 7 days. `endTime - startTime` must not exceed 7 days.
  `fromId` cannot be combined with `startTime`/`endTime`. Only the past 3
  months can be queried.
- Fields: `buyer`, `commission`, `commissionAsset`, `id`, `maker`, `orderId`,
  `price`, `qty`, `quoteQty`, `marginAsset`, `realizedPnl`, `side`,
  `positionSide`, `symbol`, `pair`, `time`.
- Paging inside a window: advance `startTime` past the last row's `time`
  (`fromId` cannot be combined with times, so it is not usable for windowed
  backfill).

## 3. Symbol discovery for a 30-day backfill

`userTrades` needs `symbol`, and no documented endpoint lists "symbols I ever
traded". Options from the documented surface:

1. `GET /fapi/v1/income` with no `symbol` and no `incomeType` filter, 7-day
   windows. Collect distinct non-empty `symbol` from REALIZED_PNL, COMMISSION
   and FUNDING_FEE rows. One scan covers all symbols (weight 30 per call).
   Caveat: relies on `symbol` being populated, UNCONFIRMED (section 1).
   Caveat: an opening fill has COMMISSION but no realized PnL, so scan
   COMMISSION as well as REALIZED_PNL.
2. Position endpoints only cover currently open positions, so they miss closed
   round trips. Not sufficient alone.
3. `GET /fapi/v1/exchangeInfo` (weight 1,
   <https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Exchange-Information>)
   lists all symbols; probing `userTrades` for every symbol is too costly.
   Use only as a symbol validity list.
4. A user-supplied symbol list (journal setting) as fallback.

## 4. Request-weight budget

- Limit: `REQUEST_WEIGHT` 2400 per 1 MINUTE per IP, not per API key. The 2400
  comes from the example `rateLimits` in
  <https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Exchange-Information>;
  "limits on the API are based on the IPs, not the API keys" is from
  <https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info>.
  Confirm the live value via `rateLimits` in `exchangeInfo`.
- Every response carries `X-MBX-USED-WEIGHT-1M`. `429` means back off; ignoring
  it leads to `418` IP bans from 2 minutes up to 3 days
  (<https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info>).
- Weights: userTrades 5, income 30, exchangeInfo 1 (links above).
- Formulas: userTrades weight = 5 x N symbols x ceil(days / 7) x pages;
  income weight = 30 x ceil(days / 7) x pages (no symbol multiplier).
- Even 50 symbols x 5 windows = 250 calls x 5 = 1250 weight fits in one minute.
  The budget is not the constraint for a single-user journal; the 7-day window
  cap and the 3-month depth are.

## 5. Async download endpoints

Source (all seven endpoints on one page):
<https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Get-Download-Id-For-Futures-Transaction-History>

- `GET /fapi/v1/income/asyn` (100 req/month, shared with the website and
  COIN-M), `GET /fapi/v1/trade/asyn` (5/month), `GET /fapi/v1/order/asyn`
  (10/month). Weight 1000 each; `startTime`/`endTime` required; span max 1
  year.
- Link fetch: `GET /fapi/v1/{income,trade,order}/asyn/id`, weight 10, returns
  `status` (`completed` or `processing`), `url`, `expirationTimestamp`; links
  expire 7 days after creation.
- Monthly quotas are shared with the website download UI; at weight 1000 two
  calls use most of a minute's budget.
- History depth of downloads (beyond 3 months?): UNCONFIRMED. The 1-year max
  span is documented, not that data exists that far back.
- Output file format/columns: UNCONFIRMED (not on the page).
- Verdict: not a sane default (polling, scarce quotas, undocumented file
  schema). Possibly an opt-in "import older than 3 months" path later, only
  after the file format is verified.

## Recommendation for the journal

### Backfill (30 days, N symbols), sequential, honoring `X-MBX-USED-WEIGHT-1M`

1. (Optional, weight 1) `GET /fapi/v1/exchangeInfo` to validate symbols.
2. Discovery: `GET /fapi/v1/income` with no `symbol`, no `incomeType`,
   `limit=1000`, 7-day windows covering [now-30d, now] (5 windows), paging by
   advancing `startTime` when a page is full. From rows with `incomeType` in
   {REALIZED_PNL, COMMISSION, FUNDING_FEE} collect distinct non-empty
   `symbol`. Store all rows keyed by (`incomeType`, `tranId`). Merge with any
   user-configured symbols.
3. Fills: for each discovered symbol, `GET /fapi/v1/userTrades` with
   `limit=1000`, 7-day windows (5), paging by `startTime` when full; store
   keyed by (`symbol`, `id`).
4. In dev, verify that REALIZED_PNL/COMMISSION rows populate `symbol` and
   `tradeId` and join to `userTrades.id`; if not, fall back to the user
   symbol list and join on (`symbol`, `time`).

Worked estimate, 5 symbols x 30 days:

- Income: 5 windows x 30 = 150 weight for one page each. Rows: about
  5 symbols x 3 funding/day x 30 = 450 funding rows plus ~2 rows per fill;
  with ~300 fills that is ~1050 rows, so assume ~2 extra pages: ~7 calls =
  ~210 weight.
- userTrades: 5 symbols x 5 windows = 25 calls x 5 = 125 weight (plus 5 per
  extra page if a window exceeds 1000 fills).
- Total about 335 weight, far under 2400/min; no throttling needed. At 50
  symbols: ~210 + 1250 = ~1460, still under one minute's limit; keep pacing
  and read the header.

### Incremental sync

- Store per-account cursors: max income `time` and max trade `time` per symbol.
- Each sync: `GET /fapi/v1/income` (no symbol/type) with
  `startTime = cursor - small overlap`, `endTime = now` (loop by <= 7-day
  windows if behind), dedupe by (`incomeType`, `tranId`). Weight 30 per call.
- For symbols with new REALIZED_PNL/COMMISSION rows (plus symbols with open
  positions), `GET /fapi/v1/userTrades` from that symbol's cursor.
  Weight 5 per symbol per window.
- Typical sync: 30 + 5K weight for K active symbols.
- History is capped at 3 months, so sync at least every few weeks; older gaps
  are unrecoverable via these endpoints (async download depth UNCONFIRMED).

## UNCONFIRMED summary

- Max time span for `/fapi/v1/income`.
- Whether REALIZED_PNL/COMMISSION rows reliably populate `symbol` and `tradeId`.
- Same-millisecond boundary behavior when paging income by `startTime`.
- Whether live income can return types outside the 23-value connector enum.
- Async download history depth and file schema.
- That 2400/min matches the live `exchangeInfo` for this account.
