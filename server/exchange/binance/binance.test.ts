import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExchangeError } from "../errors";
import { mapBinanceError, sign, signedGet } from "./http";
import { createBinanceAdapter } from "./index";

const CREDS = { apiKey: "test-key", apiSecret: "test-secret" };
const NOW = 1_762_000_000_000;

// Recorded-shape responses (fields per Binance docs / task-48 probe).
const READ_ONLY_RESTRICTIONS = {
  ipRestrict: false,
  createTime: 1_761_900_000_000,
  enableReading: true,
  enableWithdrawals: false,
  enableInternalTransfer: false,
  enableMargin: false,
  enableFutures: false,
  permitsUniversalTransfer: false,
  enableVanillaOptions: false,
  enableFixApiTrade: false,
  enableFixReadOnly: false,
  enableSpotAndMarginTrading: false,
  enablePortfolioMarginTrading: false,
};

const BALANCE_V3 = [
  {
    accountAlias: "SgsR",
    asset: "BNB",
    balance: "0.00000000",
    crossWalletBalance: "0.00000000",
    crossUnPnl: "0.00000000",
    availableBalance: "0.00000000",
    maxWithdrawAmount: "0.00000000",
    marginAvailable: true,
    updateTime: 0,
  },
  {
    accountAlias: "SgsR",
    asset: "USDT",
    balance: "1234.56780000",
    crossWalletBalance: "1234.56780000",
    crossUnPnl: "-12.34000000",
    availableBalance: "1100.00000000",
    maxWithdrawAmount: "1100.00000000",
    marginAvailable: true,
    updateTime: 1_761_999_000_000,
  },
];

const AUTH_REJECTED = {
  code: -2015,
  msg: "Invalid API-key, IP, or permissions for action.",
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "x-mbx-used-weight-1m": "7", ...headers },
  });

const fakeFetch = (...responses: Response[]) => {
  const queue = [...responses];
  return vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  });
};

const options = (fetchImpl: typeof fetch) => ({
  fetch: fetchImpl,
  now: () => NOW,
});

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sign", () => {
  it("matches Binance's documented HMAC-SHA256 example", () => {
    expect(
      sign(
        "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559",
        "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j"
      )
    ).toBe("c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71");
  });
});

describe("signedGet", () => {
  it("sends a signed query with timestamp, recvWindow, api key header and timeout signal", async () => {
    const fetchImpl = fakeFetch(json({ ok: 1 }));
    const body = await signedGet(
      CREDS,
      "https://fapi.binance.com",
      "/fapi/v1/userTrades",
      { symbol: "BTCUSDT" },
      options(fetchImpl)
    );

    expect(body).toEqual({ ok: 1 });
    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe(
      "https://fapi.binance.com/fapi/v1/userTrades"
    );
    const query = `symbol=BTCUSDT&recvWindow=5000&timestamp=${NOW}`;
    expect(url.search).toBe(
      `?${query}&signature=${sign(query, CREDS.apiSecret)}`
    );
    expect(init?.headers).toEqual({ "X-MBX-APIKEY": "test-key" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(console.info).toHaveBeenCalledWith(
      "[Binance] GET /fapi/v1/userTrades weight=7"
    );
  });

  it("maps a timed-out request to network", async () => {
    const hanging = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          );
        })
    );
    const error = await signedGet(
      CREDS,
      "https://fapi.binance.com",
      "/fapi/v3/balance",
      {},
      { ...options(hanging), timeoutMs: 5 }
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExchangeError);
    expect(error).toMatchObject({ code: "network" });
    expect((error as ExchangeError).detail).toMatch(/TimeoutError/);
  });

  it("maps a connect failure to network", async () => {
    const failing = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed", {
        cause: new Error("connect ECONNREFUSED"),
      });
    });
    await expect(
      signedGet(
        CREDS,
        "https://fapi.binance.com",
        "/fapi/v3/balance",
        {},
        options(failing)
      )
    ).rejects.toMatchObject({
      code: "network",
      detail: expect.stringContaining("ECONNREFUSED"),
    });
  });

  it("throws the mapped ExchangeError on a non-2xx response", async () => {
    const fetchImpl = fakeFetch(
      json({ code: -1021, msg: "Timestamp outside recvWindow." }, 400)
    );
    await expect(
      signedGet(
        CREDS,
        "https://fapi.binance.com",
        "/fapi/v3/balance",
        {},
        options(fetchImpl)
      )
    ).rejects.toMatchObject({ code: "clock_skew" });
  });
});

describe("mapBinanceError", () => {
  const body = (code: number) => JSON.stringify({ code, msg: "raw text" });

  it.each([
    [401, body(-2015), "invalid_key"],
    [400, body(-2014), "invalid_key"],
    [400, body(-2008), "invalid_key"],
    [401, "", "invalid_key"],
    [400, body(-1021), "clock_skew"],
    [502, "<html>Bad Gateway</html>", "exchange_unavailable"],
    [503, body(-1008), "exchange_unavailable"],
    [400, body(-1001), "exchange_unavailable"],
    [400, body(-1102), "unknown"],
    [404, "not found", "unknown"],
  ] as const)("HTTP %i %s -> %s", (status, text, code) => {
    const error = mapBinanceError(status, text, null, NOW);
    expect(error.code).toBe(code);
    expect(error.detail).toBe(`HTTP ${status}: ${text}`);
    expect(error.retryAt).toBeUndefined();
  });

  it("maps 429 and 418 to rate_limited with retryAt from Retry-After", () => {
    expect(mapBinanceError(429, body(-1003), "120", NOW)).toMatchObject({
      code: "rate_limited",
      retryAt: NOW + 120_000,
    });
    expect(mapBinanceError(418, body(-1003), "7", NOW)).toMatchObject({
      code: "rate_limited",
      retryAt: NOW + 7_000,
    });
  });

  it("defaults retryAt to 60 s without a usable Retry-After", () => {
    expect(mapBinanceError(429, "", null, NOW).retryAt).toBe(NOW + 60_000);
    expect(mapBinanceError(429, "", "soon", NOW).retryAt).toBe(NOW + 60_000);
  });
});

describe("createBinanceAdapter.verifyKey", () => {
  it("passes a reading-only key whose futures balance is readable", async () => {
    const fetchImpl = fakeFetch(json(READ_ONLY_RESTRICTIONS), json(BALANCE_V3));
    const adapter = createBinanceAdapter(options(fetchImpl));

    expect(await adapter.verifyKey(CREDS)).toEqual({ ok: true });
    const urls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map(u => u.origin + u.pathname)).toEqual([
      "https://api.binance.com/sapi/v1/account/apiRestrictions",
      "https://fapi.binance.com/fapi/v3/balance",
    ]);
  });

  it("returns invalid_key when apiRestrictions rejects the key", async () => {
    const adapter = createBinanceAdapter(
      options(fakeFetch(json(AUTH_REJECTED, 401)))
    );
    expect(await adapter.verifyKey(CREDS)).toEqual({
      ok: false,
      code: "invalid_key",
    });
  });

  it("returns permissions_changed when enableReading is false", async () => {
    const adapter = createBinanceAdapter(
      options(
        fakeFetch(json({ ...READ_ONLY_RESTRICTIONS, enableReading: false }))
      )
    );
    expect(await adapter.verifyKey(CREDS)).toEqual({
      ok: false,
      code: "permissions_changed",
    });
  });

  it.each([
    "enableFutures",
    "enableWithdrawals",
    "enableInternalTransfer",
    "enableMargin",
    "enableSpotAndMarginTrading",
    "enableVanillaOptions",
    "enablePortfolioMarginTrading",
    "enableFixApiTrade",
    "permitsUniversalTransfer",
  ])("returns permissions_changed when %s is true", async flag => {
    const fetchImpl = fakeFetch(
      json({ ...READ_ONLY_RESTRICTIONS, [flag]: true })
    );
    const adapter = createBinanceAdapter(options(fetchImpl));
    expect(await adapter.verifyKey(CREDS)).toEqual({
      ok: false,
      code: "permissions_changed",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns futures_unreadable when the balance read fails with -2015", async () => {
    const adapter = createBinanceAdapter(
      options(fakeFetch(json(READ_ONLY_RESTRICTIONS), json(AUTH_REJECTED, 401)))
    );
    expect(await adapter.verifyKey(CREDS)).toEqual({
      ok: false,
      code: "futures_unreadable",
    });
  });

  it("rethrows transient errors instead of judging the key", async () => {
    const adapter = createBinanceAdapter(
      options(
        fakeFetch(
          json(READ_ONLY_RESTRICTIONS),
          json({}, 429, { "retry-after": "30" })
        )
      )
    );
    await expect(adapter.verifyKey(CREDS)).rejects.toMatchObject({
      code: "rate_limited",
      retryAt: NOW + 30_000,
    });
  });
});

describe("createBinanceAdapter.fetchBalance", () => {
  it("returns the USDT row", async () => {
    const adapter = createBinanceAdapter(options(fakeFetch(json(BALANCE_V3))));
    expect(await adapter.fetchBalance(CREDS)).toEqual({
      balanceUsdt: "1234.56780000",
      unrealizedPnlUsdt: "-12.34000000",
      updateTime: 1_761_999_000_000,
    });
  });

  it("throws unknown when there is no USDT row", async () => {
    const adapter = createBinanceAdapter(
      options(fakeFetch(json([BALANCE_V3[0]])))
    );
    await expect(adapter.fetchBalance(CREDS)).rejects.toMatchObject({
      code: "unknown",
    });
  });
});

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_760_000_000_000 - (1_760_000_000_000 % 60_000);

const routeFetch = (routes: Record<string, (url: URL) => unknown>) =>
  vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    const handler = routes[url.pathname];
    if (!handler) throw new Error(`unexpected ${url.pathname}`);
    return json(handler(url));
  });

const requested = (fetchImpl: ReturnType<typeof routeFetch>, path: string) =>
  fetchImpl.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter(url => url.pathname === path)
    .map(url => Object.fromEntries(url.searchParams));

const incomeRow = (
  tranId: number,
  incomeType: string,
  symbol: string,
  time: number
) => ({
  symbol,
  incomeType,
  income: "-0.01000000",
  asset: "USDT",
  info: "",
  time,
  tranId,
  tradeId: symbol ? String(tranId) : "",
});

const tradeRow = (
  id: number,
  time: number,
  commissionAsset = "USDT",
  commission = "0.04000000"
) => ({
  buyer: true,
  commission,
  commissionAsset,
  id,
  maker: false,
  orderId: 8_000_000 + id,
  price: "65000.10",
  qty: "0.010",
  quoteQty: "650.001",
  realizedPnl: "0",
  side: "BUY",
  positionSide: "BOTH",
  symbol: "BTCUSDT",
  time,
});

describe("createBinanceAdapter.discoverSymbols", () => {
  it("pages within a window, crosses the 7-day window boundary and keeps trade-related symbols", async () => {
    const windowEnd = T0 + 7 * DAY - 1;
    const fullPage = Array.from({ length: 1000 }, (_, i) =>
      incomeRow(i + 1, "FUNDING_FEE", "BTCUSDT", T0 + i)
    );
    const fetchImpl = routeFetch({
      "/fapi/v1/income": url => {
        const startTime = Number(url.searchParams.get("startTime"));
        if (startTime === T0) return fullPage;
        if (startTime === T0 + 999) {
          return [
            incomeRow(1000, "FUNDING_FEE", "BTCUSDT", T0 + 999), // overlap
            incomeRow(2001, "COMMISSION", "ETHUSDT", T0 + 2 * DAY),
            incomeRow(2002, "TRANSFER", "", T0 + 3 * DAY),
            incomeRow(2003, "INSURANCE_CLEAR", "XRPUSDT", T0 + 4 * DAY),
          ];
        }
        return [incomeRow(3001, "REALIZED_PNL", "SOLUSDT", T0 + 7 * DAY + 5)];
      },
    });
    const adapter = createBinanceAdapter(options(fetchImpl));

    const result = await adapter.discoverSymbols(CREDS, T0, T0 + 8 * DAY);

    expect(result.symbols.sort()).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    expect(result.maxTime).toBe(T0 + 7 * DAY + 5);
    expect(
      requested(fetchImpl, "/fapi/v1/income").map(q => ({
        startTime: Number(q.startTime),
        endTime: Number(q.endTime),
        limit: q.limit,
        symbol: q.symbol,
        incomeType: q.incomeType,
      }))
    ).toEqual([
      { startTime: T0, endTime: windowEnd, limit: "1000" },
      { startTime: T0 + 999, endTime: windowEnd, limit: "1000" },
      { startTime: T0 + 7 * DAY, endTime: T0 + 8 * DAY, limit: "1000" },
    ]);
  });

  it("returns maxTime 0 when there is no income", async () => {
    const adapter = createBinanceAdapter(
      options(routeFetch({ "/fapi/v1/income": () => [] }))
    );
    expect(await adapter.discoverSymbols(CREDS, T0, T0 + DAY)).toEqual({
      symbols: [],
      maxTime: 0,
    });
  });
});

describe("createBinanceAdapter.fetchFills", () => {
  it("pages by startTime = last time across a window boundary, dedupes by id and maps every field", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) =>
      tradeRow(i + 1, T0 + i)
    );
    const fetchImpl = routeFetch({
      "/fapi/v1/userTrades": url => {
        const startTime = Number(url.searchParams.get("startTime"));
        if (startTime === T0) return fullPage;
        if (startTime === T0 + 999) return [tradeRow(1000, T0 + 999)];
        return [tradeRow(5000, T0 + 7 * DAY + 1)];
      },
    });
    const adapter = createBinanceAdapter(options(fetchImpl));

    const fills = await adapter.fetchFills(CREDS, "BTCUSDT", T0, T0 + 8 * DAY);

    expect(fills).toHaveLength(1001);
    expect(new Set(fills.map(f => f.fillId)).size).toBe(1001);
    expect(fills[0]).toEqual({
      fillId: "1",
      orderId: "8000001",
      symbol: "BTCUSDT",
      positionSide: "BOTH",
      side: "BUY",
      price: "65000.10",
      qty: "0.010",
      realizedPnl: "0",
      commission: "0.04000000",
      commissionAsset: "USDT",
      feeUsd: "0.04000000",
      time: T0,
    });
    expect(
      requested(fetchImpl, "/fapi/v1/userTrades").map(q => [
        q.symbol,
        Number(q.startTime),
        Number(q.endTime),
        q.limit,
      ])
    ).toEqual([
      ["BTCUSDT", T0, T0 + 7 * DAY - 1, "1000"],
      ["BTCUSDT", T0 + 999, T0 + 7 * DAY - 1, "1000"],
      ["BTCUSDT", T0 + 7 * DAY, T0 + 8 * DAY, "1000"],
    ]);
  });

  it("converts BNB commission with the 1m close at the fill's minute and caches per (asset, minute)", async () => {
    const fetchImpl = routeFetch({
      "/fapi/v1/userTrades": () => [
        tradeRow(1, T0 + 1_000, "BNB", "0.00010000"),
        tradeRow(2, T0 + 59_000, "BNB", "0.00020000"),
        tradeRow(3, T0 + 61_000, "BNB", "0.00010000"),
      ],
      "/fapi/v1/klines": url => {
        const openTime = Number(url.searchParams.get("startTime"));
        const close = openTime === T0 ? "600.50" : "601.00";
        return [
          [
            openTime,
            "600.00",
            "602.00",
            "599.00",
            close,
            "1234.5",
            openTime + 59_999,
            "740000.0",
            300,
            "600.0",
            "360000.0",
            "0",
          ],
        ];
      },
    });
    const adapter = createBinanceAdapter(options(fetchImpl));

    const fills = await adapter.fetchFills(CREDS, "BTCUSDT", T0, T0 + DAY);

    expect(fills.map(f => f.feeUsd)).toEqual(["0.06005", "0.1201", "0.0601"]);
    expect(requested(fetchImpl, "/fapi/v1/klines")).toEqual([
      {
        symbol: "BNBUSDT",
        interval: "1m",
        startTime: String(T0),
        endTime: String(T0 + 59_999),
        limit: "1",
      },
      {
        symbol: "BNBUSDT",
        interval: "1m",
        startTime: String(T0 + 60_000),
        endTime: String(T0 + 119_999),
        limit: "1",
      },
    ]);
  });

  it("throws unknown when no kline exists for the fill's minute", async () => {
    const adapter = createBinanceAdapter(
      options(
        routeFetch({
          "/fapi/v1/userTrades": () => [tradeRow(1, T0, "BNB", "0.0001")],
          "/fapi/v1/klines": () => [],
        })
      )
    );
    await expect(
      adapter.fetchFills(CREDS, "BTCUSDT", T0, T0 + DAY)
    ).rejects.toMatchObject({ code: "unknown" });
  });
});

describe("createBinanceAdapter.fetchPositions", () => {
  it("keeps non-zero rows with positionAmt signed as reported", async () => {
    const position = (
      symbol: string,
      positionSide: string,
      positionAmt: string
    ) => ({
      symbol,
      positionSide,
      positionAmt,
      entryPrice: "65000.0",
      breakEvenPrice: "65026.0",
      markPrice: "65100.0",
      unRealizedProfit: "1.00",
      liquidationPrice: "0",
      isolatedMargin: "0",
      notional: positionAmt.startsWith("-") ? "-651.00" : "651.00",
      marginAsset: "USDT",
      isolatedWallet: "0",
      initialMargin: "65.1",
      maintMargin: "2.6",
      positionInitialMargin: "65.1",
      openOrderInitialMargin: "0",
      adl: 1,
      bidNotional: "0",
      askNotional: "0",
      updateTime: T0,
    });
    const adapter = createBinanceAdapter(
      options(
        routeFetch({
          "/fapi/v3/positionRisk": () => [
            position("BTCUSDT", "BOTH", "-0.010"),
            position("ETHUSDT", "BOTH", "0.000"),
            position("SOLUSDT", "LONG", "2"),
          ],
        })
      )
    );

    expect(await adapter.fetchPositions(CREDS)).toEqual([
      {
        symbol: "BTCUSDT",
        positionSide: "BOTH",
        positionAmt: "-0.010",
        entryPrice: "65000.0",
        notional: "-651.00",
        updateTime: T0,
      },
      {
        symbol: "SOLUSDT",
        positionSide: "LONG",
        positionAmt: "2",
        entryPrice: "65000.0",
        notional: "651.00",
        updateTime: T0,
      },
    ]);
  });
});

describe("createBinanceAdapter.fetchConditionalOrders", () => {
  it("keeps NEW stop / take-profit orders by triggerPrice and drops trailing stops", async () => {
    const algo = (
      algoId: number,
      orderType: string,
      overrides: Record<string, unknown> = {}
    ) => ({
      algoId,
      clientAlgoId: `c${algoId}`,
      algoType: "CONDITIONAL",
      orderType,
      symbol: "BTCUSDT",
      side: "SELL",
      positionSide: "BOTH",
      timeInForce: "GTC",
      quantity: "0.010",
      algoStatus: "NEW",
      actualOrderId: "",
      actualPrice: "0.00000",
      triggerPrice: "60000.00",
      price: "59900.00",
      icebergQuantity: null,
      selfTradePreventionMode: "EXPIRE_MAKER",
      workingType: "CONTRACT_PRICE",
      priceMatch: "NONE",
      closePosition: false,
      priceProtect: false,
      reduceOnly: true,
      createTime: T0,
      updateTime: T0,
      triggerTime: 0,
      goodTillDate: 0,
      ...overrides,
    });
    const fetchImpl = routeFetch({
      "/fapi/v1/openAlgoOrders": () => [
        algo(1, "STOP", { triggerPrice: "60000.00" }),
        algo(2, "STOP_MARKET", {
          triggerPrice: "59500.00",
          closePosition: true,
          quantity: "0",
        }),
        algo(3, "TAKE_PROFIT", { triggerPrice: "70000.00" }),
        algo(4, "TAKE_PROFIT_MARKET", { triggerPrice: "71000.00" }),
        algo(5, "TRAILING_STOP_MARKET"),
        algo(6, "STOP_MARKET", { algoStatus: "TRIGGERING" }),
      ],
    });
    const adapter = createBinanceAdapter(options(fetchImpl));

    const orders = await adapter.fetchConditionalOrders(CREDS, "BTCUSDT");

    expect(requested(fetchImpl, "/fapi/v1/openAlgoOrders")[0].symbol).toBe(
      "BTCUSDT"
    );
    const base = {
      symbol: "BTCUSDT",
      positionSide: "BOTH",
      side: "SELL",
      closePosition: false,
      quantity: "0.010",
    };
    expect(orders).toEqual([
      { ...base, kind: "stop", triggerPrice: "60000.00" },
      {
        ...base,
        kind: "stop",
        triggerPrice: "59500.00",
        closePosition: true,
        quantity: "0",
      },
      { ...base, kind: "takeProfit", triggerPrice: "70000.00" },
      { ...base, kind: "takeProfit", triggerPrice: "71000.00" },
    ]);
  });
});
