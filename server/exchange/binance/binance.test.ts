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

describe("createBinanceAdapter unimplemented methods", () => {
  it("throws not implemented", async () => {
    const adapter = createBinanceAdapter(options(fakeFetch()));
    await expect(adapter.fetchPositions(CREDS)).rejects.toThrow(
      /not implemented/
    );
  });
});
