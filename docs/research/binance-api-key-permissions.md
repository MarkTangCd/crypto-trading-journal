# Binance API key permissions and read-only verification

Research for TASK-41. Checked 2026-11-04. Scope: USD-M futures read access for a linked account. Items without a primary-source quote are marked UNCONFIRMED.

## Findings

### 1. Which endpoints we call, and their security type

- `GET /fapi/v1/userTrades`, `GET /fapi/v1/allOrders`, `GET /fapi/v1/openAlgoOrders`, `GET /fapi/v1/allAlgoOrders`, `GET /fapi/v3/positionRisk`, `GET /fapi/v3/balance`, `GET /fapi/v3/account` are all `USER_DATA` (signed, read). Source: https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Account-Trade-List (lists USER_DATA: All Orders, Query Algo Order, Current All Algo Open Orders, Position Information V2/V3, Query All Algo Orders) and https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Futures-Account-Balance-V3 (Account Info V3 and Balance V3 are USER_DATA).
- `TRADE` endpoints (write): New Order, Cancel Order, Test Order, New/Cancel Algo Order, Change Initial Leverage, Change Margin Type, Change Position Mode, Modify Isolated Position Margin, etc. Source: same Account-Trade-List page.
- Security type semantics: "`TRADE` and `USER_DATA` endpoints are `SIGNED` endpoints"; "API-keys can be configured to only access certain types of secure endpoints"; "By default, API-keys can access all secure routes". Source: https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info
- The futures docs do NOT state which UI permission checkbox (Enable Reading vs Enable Futures) a USER_DATA futures endpoint requires. Fetched pages (general-info, Futures-Account-Balance-V3, Futures-Account-Configuration) say nothing on it. UNCONFIRMED.

### 2. Permission names in the key UI

- `Enable Reading` is the only checkbox label quoted by Binance's FAQ ("the system-generated API Key's permission can only be set to [Enable Reading]" for unrestricted IP). Source: https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072
- The exact UI label for futures ("Enable Futures") is not on that FAQ page. UNCONFIRMED as a UI string. The API field is `enableFutures` (section 3), which is confirmed.
- The FAQ states: Withdrawal and Futures permissions are not available by default; withdrawal requires IP restriction; Futures cannot be enabled on keys created before the Futures account was activated, or when Portfolio Margin is active. Same URL.
- Whether futures READ endpoints work with `enableFutures=false` and `enableReading=true`: UNCONFIRMED. The `enableFutures` doc says "the Futures API cannot be used if the key predates the Futures account opening or if Portfolio Margin is enabled", which suggests it gates the Futures API generally, but it is not an explicit read/trade split. Source: https://developers.binance.com/docs/wallet/account/api-key-permission

### 3. Endpoint that returns the key's own permissions

`GET /sapi/v1/account/apiRestrictions` (Get API Key Permission). Host `https://api.binance.com`, signed USER_DATA, weight 1, params `timestamp`, optional `recvWindow`. Source: https://developers.binance.com/docs/wallet/account/api-key-permission

Response booleans: `ipRestrict`, `createTime` (int64), `enableReading`, `enableWithdrawals`, `enableInternalTransfer`, `enableMargin`, `enableFutures`, `permitsUniversalTransfer`, `enableVanillaOptions`, `enableFixApiTrade`, `enableFixReadOnly`, `enableSpotAndMarginTrading`, `enablePortfolioMarginTrading`. Same URL.

- No field distinguishes futures read from futures trade: `enableFutures` is a single flag. A key with `enableFutures=true` cannot be proven read-only from this response alone.
- Whether a futures-only key can call this endpoint: UNCONFIRMED. The page documents no permission requirement beyond a valid signed request. It lives on the spot host (`api.binance.com`), not `fapi.binance.com`.
- Whether Ed25519/RSA keys can call it: the page documents no per-key-type restriction; UNCONFIRMED in practice.

### 4. Key types

- "System-generated API keys use HMAC symmetric encryption"; "Self-generated API keys use Ed25519 or RSA asymmetric encryption" (user supplies the public key). Source: https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072
- Ed25519 support announced 2023-07-19; Binance recommends it for "optimized API performance and enhanced security". Source: https://www.binance.com/en/support/announcement/binance-now-supports-ed25519-api-keys-2023-07-19-30372026b6af4fbbb9b38ab5c3f91755
- USD-M futures general-info documents HMAC SHA256 and RSA (PKCS#8, RSASSA-PKCS1-v1_5 SHA-256) signing and does not mention Ed25519. Source: https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info. Whether fapi accepts Ed25519 signatures: UNCONFIRMED from that page. Safest choice for the journal: HMAC, the documented fapi path.
- Coupling of key type and permissions: an HMAC key with unrestricted IP can only have `Enable Reading`; to enable other permissions you must add IPv4 restriction, use a self-generated key, or disable default security controls. Source: FAQ above. So a system-generated HMAC key with no IP restriction is read-only by Binance policy (whether it then can read futures: see section 2 UNCONFIRMED).

### 5. 90-day expiry

- The only official statement found is the 2021-07-26 announcement: the `Enable Spot & Margin Trading` permission was extended from 30 to 90 days for keys without IP whitelisting. It carries the notice "Note: The following API key permission rules are no longer applicable as of 2023-10-24." Source: https://www.binance.com/en/support/announcement/11e4c2f44e7a47b9b5fc0e479c0b256f
- The FAQ above mentions no expiry. No official current 90-day expiry rule was found for read-only or futures keys.
- Third-party only (not primary, do not rely on): https://www.quantconnect.com/forum/discussion/12734/binance-demands-ips-for-api-connection-after-90-days/ and https://quotaguard.com/blog/binance-api-ip-whitelist-cloud-static-ip (claim 90 days / 30 days inactivity deletion). Current behaviour for unrestricted read-only keys: UNCONFIRMED. The journal should handle invalid-key errors gracefully either way.

### 6. Sub-account keys

- Sub-accounts have their own API Management tab and up to 30 keys each. Source: https://www.binance.com/en-BH/support/faq/binance-sub-account-functions-and-frequently-asked-questions-360020632811 (from a search summary; page body not fetched, partly UNCONFIRMED).
- A sub-account must have futures enabled before its key can get futures permission (`futuresTrade`): https://developers.binance.com/docs/binance_link/exchange-link/account/Change-Sub-Account-Api-Permission and https://developers.binance.com/docs/sub_account/account-management/Enable-Futures-for-Sub-account (search summaries only; UNCONFIRMED in detail).
- Sub-account keys can call the futures API: https://www.binance.com/en/support/announcement/binance-opens-futures-and-margin-trading-for-sub-accounts-360035845731
- Whether `apiRestrictions` behaves identically with a sub-account key, and whether sub-account keys are exempt from IP rules: UNCONFIRMED.
- A master key returning sub-account fapi data: UNCONFIRMED; assume one key per account being linked.

## Recommendation for the journal

### Permission checklist for the trader (Binance web: Profile > API Management > Create API)

1. Prefer a system-generated (HMAC) key. It is the documented fapi path.
2. Tick `Enable Reading` only. Leave everything else unticked: Enable Withdrawals, Enable Internal Transfer, Enable Margin, Enable Spot & Margin Trading, Enable Vanilla Options, Enable Portfolio Margin Trading, universal transfer, FIX.
3. Futures: first test with `Enable Reading` only whether `/fapi/v3/balance` succeeds (UNCONFIRMED). If Binance rejects it, `Enable Futures` is unavoidable; the key can then place futures orders, so rely on IP restriction (item 4) and the order-test probe below.
4. Restrict to the trusted IPv4 of the machine running the journal if it has a fixed IP; otherwise leave unrestricted (HMAC unrestricted keys are forced to reading-only by Binance policy).
5. One key per linked account (main account key, or the specific sub-account key that trades).
6. The secret is stored server-side only, encrypted at rest (as in task-18).

### Server-side read-only verification at save time

1. Call `GET https://api.binance.com/sapi/v1/account/apiRestrictions` (signed, weight 1) with the candidate key. Source: https://developers.binance.com/docs/wallet/account/api-key-permission
2. Reject the key (do not save) if `enableReading` is false, or if ANY of these is true: `enableWithdrawals`, `enableInternalTransfer`, `enableMargin`, `enableSpotAndMarginTrading`, `enableVanillaOptions`, `enablePortfolioMarginTrading`, `enableFixApiTrade`, `permitsUniversalTransfer`.
3. `enableFutures`: if false, accept and verify reads in step 5. If true, the response cannot prove futures read-only; accept only with an explicit user warning ("this key can trade futures"), or reject if the spec chooses strict mode (decision for task-49).
4. Record `ipRestrict` and `createTime` for display; no policy rejection.
5. Smoke-read: `GET /fapi/v3/balance`; success confirms the key can read futures.
6. Optional write-capability probe (behaviour UNCONFIRMED, validate on testnet before adopting): `POST /fapi/v1/order/test` (Test Order, a TRADE endpoint, validates without placing). Expect a permission error for a read-only key; success means trade rights, so reject. Endpoint class source: https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Account-Trade-List
7. If step 1 fails with an auth/permission error (a futures-only key may not be allowed on the spot host, UNCONFIRMED), reject with an actionable message asking for `Enable Reading`; never skip verification silently.
8. Re-run steps 1-2 at the start of each sync; treat any newly appeared write permission as a sync-blocking error (the trader can edit the key later).
