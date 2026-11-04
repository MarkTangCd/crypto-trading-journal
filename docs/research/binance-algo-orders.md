# Binance USDⓈ-M Algo order endpoints (stop-loss / take-profit)

Researched 2026-11-04 for TASK-42. Primary sources only: Binance's own docs site, the OpenAPI spec bundle that the docs site renders from, its llms-full.txt dump, and the first-party `binance-connector-js` repo (generated from the same spec).

Source key:

- DOCS-TRADE: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade (SPA; sections `#current-all-algo-open-orders`, `#query-all-algo-orders`, `#query-algo-order`, `#new-algo-order`). The old URLs `.../usds-margined-futures/trade/rest-api/<Name>` 302-redirect here. The page text is hard to scrape, so field-level facts below were read from the spec bundle it renders.
- SPEC: https://bin.bnbstatic.com/static/dev-docs/html/en/docs/assets/catalog_core_trading_derivatives_trading_usd_s_m_futures_api_rest_api-derivatives-trading-usds-futures.yaml-BisumuOc.js (OpenAPI 3.1.1, "Futures (USDⓈ-M) REST API"; the asset hash may change on redeploy).
- CHANGELOG: https://developers.binance.com/docs/derivatives/change-log
- LLMS: https://developers.binance.com/en/docs/llms-full.txt
- CONNECTOR: https://raw.githubusercontent.com/binance/binance-connector-js/master/clients/derivatives-trading-usds-futures/src/rest-api/modules/trade-api.ts

## 1. Algo Service migration (2025-12-09)

- Conditional orders migrated to the Algo Service effective 2025-12-09. Affected types: `STOP_MARKET`, `TAKE_PROFIT_MARKET`, `STOP`, `TAKE_PROFIT`, `TRAILING_STOP_MARKET`. Source: CHANGELOG, entry dated 2025-11-06.
- New REST endpoints: POST/DELETE/GET `/fapi/v1/algoOrder`, DELETE `/fapi/v1/algoOpenOrders`, GET `/fapi/v1/openAlgoOrders`, GET `/fapi/v1/allAlgoOrders`. Source: CHANGELOG (same entry); LLMS (operation index).
- `POST /fapi/v1/order` and `POST /fapi/v1/batchOrders` for those types are blocked after migration with error `-4120 STOP_ORDER_SWITCH_ALGO`. Source: CHANGELOG (same entry).
- New user-data event `ALGO_UPDATE`; `CONDITIONAL_ORDER_TRIGGER_REJECT` deprecated from 2025-12-15 (rejection reasons now in `ALGO_UPDATE`). Source: CHANGELOG, entries 2025-11-06 and 2025-12-10.
- Conditional order limit is 200 across all symbols (the `MAX_NUM_ALGO_ORDERS` exchangeInfo filter was removed 2025-12-29). Source: CHANGELOG, entry 2025-12-29.
- Changed behaviour: modifying untriggered conditional orders is not supported; no margin check before trigger. Source: CHANGELOG, entry 2025-11-06.
- Supported types under `algoType=CONDITIONAL` are exactly the five above. Source: SPEC, `newAlgoOrder` description; DOCS-TRADE `#new-algo-order`.
- Does `/fapi/v1/openOrders` still list any of them? The migration entries state no change to it (CHANGELOG), and its description is just "Get all open orders on a symbol" (SPEC). Its response example still shows `origType`/`type` = `TRAILING_STOP_MARKET` (SPEC, `/fapi/v1/openOrders` 200 example), which looks like a stale example, not a statement of behaviour. **UNCONFIRMED** whether live `openOrders` returns any of the five types post-migration; the docs do not say. Treat `openAlgoOrders` as the only authoritative source for them. A live call with a key would settle it.

## 2. GET /fapi/v1/openAlgoOrders

Source for this section: SPEC (`/fapi/v1/openAlgoOrders`), DOCS-TRADE `#current-all-algo-open-orders`; CONNECTOR (`currentAllAlgoOpenOrders`).

- Description: all open algo (conditional) orders, including TP/SL and trailing stop orders.
- Security USER_DATA, signed, `X-MBX-APIKEY` header.
- Weight (IP): 1 with `symbol`; 40 without `symbol`.
- Params (all optional except `timestamp`): `algoType` (example `CONDITIONAL`), `symbol`, `algoId`, `recvWindow` (max 60000), `timestamp`.
- No `symbol` returns all symbols in one array.
- Response: array of objects with these fields (examples in parentheses, from SPEC):
  - `algoId` int64, `clientAlgoId` string, `algoType` ("CONDITIONAL"), `orderType` ("TAKE_PROFIT"), `symbol`, `side` (BUY/SELL), `positionSide` ("BOTH"), `timeInForce` ("GTC")
  - `quantity` string ("0.01"), `algoStatus` ("NEW")
  - `actualOrderId` string (empty until triggered), `actualPrice` ("0.00000")
  - `triggerPrice` string ("750.000"), `price` string ("750.000"), `icebergQuantity` ("null")
  - `tpTriggerPrice`, `tpPrice`, `slTriggerPrice`, `slPrice`, `tpOrderType` (examples "0.000" / ""; meaning not documented in the spec, **UNCONFIRMED**, ignore)
  - `selfTradePreventionMode`, `workingType` ("CONTRACT_PRICE"), `priceMatch` ("NONE")
  - `closePosition` bool, `priceProtect` bool, `reduceOnly` bool
  - `createTime`, `updateTime`, `triggerTime` (0 if untriggered), `goodTillDate` (ms int64)
- The list schemas contain no `activatePrice` / `callbackRate` (trailing-stop parameters). **UNCONFIRMED** whether trailing orders add them in practice. Irrelevant for SL/TP.
- `algoStatus` values documented for the `ALGO_UPDATE` stream: NEW, CANCELED, TRIGGERING, TRIGGERED, FINISHED, REJECTED, EXPIRED (LLMS, "Event: Algo Order Update"). The REST docs do not list a separate set. Open orders are the `NEW` ones.

## 3. GET /fapi/v1/allAlgoOrders

Source: SPEC (`/fapi/v1/allAlgoOrders`), DOCS-TRADE `#query-all-algo-orders`; CONNECTOR (`queryAllAlgoOrders`).

- Description: all algo orders: active, CANCELED, TRIGGERED, or FINISHED, including TP/SL and trailing.
- Weight (IP) 5. `symbol` REQUIRED. Optional: `algoId`, `startTime`, `endTime`, `limit` (default 500, max 1000), `recvWindow`.
- Notes: with `algoId`, returns orders >= that id, otherwise the most recent. Query time period must be less than 7 days; default is the recent 7 days.
- History depth, per the docs: orders are not found if (a) status is `CANCELED` or `EXPIRED` AND the order has NO filled trade AND created time + 3 days < now; or (b) create time + 90 days < now.
  - So there is a hard ceiling of 90 days from creation, and cancelled/expired-unfilled orders vanish after 3 days.
  - Triggered/finished orders stay retrievable up to 90 days. Each query window is at most 7 days, so reaching back 90 days means about 13 windows per symbol (5 weight each), or paging by `algoId`.
- Response: same field set as section 2 (identical properties in SPEC; `algoStatus` example "CANCELED"). The single-order endpoint `GET /fapi/v1/algoOrder` (weight 1, needs `algoId` or `clientAlgoId`) additionally documents `actualType` and `actualQty` (only after trigger/fill) and repeats the same 3-day/90-day not-found rule. Source: DOCS-TRADE `#query-algo-order`.
- Whether `actualType` / `actualQty` also appear in list responses: **UNCONFIRMED** (absent from the list schemas in SPEC and CONNECTOR).

## 4. Position endpoints carry no SL/TP

`positionRisk` and account responses have no SL/TP fields; SL/TP exist only as separate algo orders. This was taken from the earlier fact-check field lists and not re-verified here (**UNCONFIRMED** at this depth).

## Recommendation for the journal

Reading current SL/TP of an open position:

1. Call `GET /fapi/v1/openAlgoOrders` with `symbol` (weight 1) for each symbol that has an open position; avoid the no-symbol form (weight 40). Keep rows with `algoStatus = NEW`. Optionally also call `/fapi/v1/openOrders`, since live behaviour for the five migrated types there is UNCONFIRMED; ids live in different spaces (`algoId` vs `orderId`), so no dedupe is needed.
2. Match to the position: same `symbol`; `positionSide` equal to the position side in hedge mode, or `BOTH` in one-way mode. The order `side` must be opposite to the position (SELL for a long, BUY for a short).
3. Classify SL vs TP by `orderType`, not by comparing prices:
   - SL: `STOP_MARKET` or `STOP`.
   - TP: `TAKE_PROFIT_MARKET` or `TAKE_PROFIT`.
   - `TRAILING_STOP_MARKET`: not a fixed level; do not put it in `stopLossPrice`.
   - Price is `triggerPrice` (not `price`, which is only the limit price of `STOP` / `TAKE_PROFIT`). Trigger semantics are in SPEC `newAlgoOrder` notes (sell stop fires at price <= trigger, sell TP at price >= trigger, reference price per `workingType`).
4. When several exist of one kind: prefer `closePosition = true` orders, then the one nearest the market, i.e. the level that fires first (for a long: highest SL, lowest TP; for a short: lowest SL, highest TP). Ladders of partial TPs cannot fit one `takeProfitPrice`; storing the nearest is lossy and should be documented. Optionally keep the full list in a JSON column.
5. closePosition vs quantity-based: `closePosition = true` (only `STOP_MARKET` / `TAKE_PROFIT_MARKET`; cannot combine with `quantity` or `reduceOnly`) means "close the entire position", so it maps 1:1 to a single price. Quantity-based orders protect only part of the position: map to the single price only if `quantity >= |positionAmt|`, otherwise treat as partial (rule 4). Whether close-all orders return `quantity` as 0 or a number is **UNCONFIRMED**; rely on `closePosition`.
6. Optional: subscribe to `ALGO_UPDATE` on the user data stream for change events; polling is enough otherwise.

Closed trades:

- SL/TP of an already closed trade can only be recovered from `allAlgoOrders`, per symbol, in 7-day windows, and only inside the retention rules: cancelled/expired orders without fills disappear after 3 days, everything disappears 90 days after creation.
- If the user moved or cancelled the SL before closing, the order in force at close time is not recoverable after 3 days. A triggered SL/TP is discoverable (`algoStatus` TRIGGERED/FINISHED, `actualOrderId` links to the real order), which shows the level that actually closed the trade, not necessarily the last one set.
- Therefore the journal should snapshot SL/TP on every sync while the position is open and persist it. Backfill for already-closed trades is best-effort only (triggered within 90 days, cancelled within 3 days).

## Unconfirmed summary

- Whether `/fapi/v1/openOrders` returns any of the five migrated types today (needs a live call).
- Meaning of `tpTriggerPrice`, `tpPrice`, `slTriggerPrice`, `slPrice`, `tpOrderType` (undocumented).
- Whether `actualType` / `actualQty` appear in list endpoints.
- Whether close-all orders return `quantity` as 0 or a number.
- Whether `positionRisk` has any TP/SL field (not re-checked here).
