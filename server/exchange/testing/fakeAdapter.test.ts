import { describe, expect, it } from "vitest";

import type { ExchangeFill } from "../adapter";
import { ExchangeError } from "../errors";
import { createFakeAdapter } from "./fakeAdapter";

const CREDS = { apiKey: "key", apiSecret: "secret" };

const fill = (symbol: string, fillId: string, time: number): ExchangeFill => ({
  fillId,
  orderId: `o-${fillId}`,
  symbol,
  positionSide: "BOTH",
  side: "BUY",
  price: "100",
  qty: "1",
  realizedPnl: "0",
  commission: "0.04",
  commissionAsset: "USDT",
  feeUsd: "0.04",
  time,
});

describe("createFakeAdapter", () => {
  it("serves fixtures and records calls", async () => {
    const { adapter, calls } = createFakeAdapter({
      verifyKey: { ok: false, code: "permissions_changed" },
      fills: {
        BTCUSDT: [fill("BTCUSDT", "1", 1_000), fill("BTCUSDT", "2", 5_000)],
        ETHUSDT: [fill("ETHUSDT", "3", 9_000)],
      },
      positions: [
        {
          symbol: "BTCUSDT",
          positionSide: "BOTH",
          positionAmt: "-0.5",
          entryPrice: "100",
          notional: "-50",
          updateTime: 5_000,
        },
      ],
      conditionalOrders: {
        BTCUSDT: [
          {
            symbol: "BTCUSDT",
            positionSide: "BOTH",
            side: "BUY",
            kind: "stop",
            triggerPrice: "110",
            closePosition: true,
            quantity: "0",
          },
        ],
      },
      balance: { balanceUsdt: "1000", unrealizedPnlUsdt: "-5", updateTime: 1 },
    });

    expect(await adapter.verifyKey(CREDS)).toEqual({
      ok: false,
      code: "permissions_changed",
    });
    expect(await adapter.discoverSymbols(CREDS, 0, 6_000)).toEqual({
      symbols: ["BTCUSDT"],
      maxTime: 5_000,
    });
    expect(
      (await adapter.fetchFills(CREDS, "BTCUSDT", 2_000, 6_000)).map(
        f => f.fillId
      )
    ).toEqual(["2"]);
    expect(await adapter.fetchFills(CREDS, "SOLUSDT", 0, 10_000)).toEqual([]);
    expect(await adapter.fetchPositions(CREDS)).toHaveLength(1);
    expect(await adapter.fetchConditionalOrders(CREDS, "BTCUSDT")).toHaveLength(
      1
    );
    expect(await adapter.fetchConditionalOrders(CREDS, "ETHUSDT")).toEqual([]);
    expect((await adapter.fetchBalance(CREDS)).balanceUsdt).toBe("1000");

    expect(calls.map(c => c.method)).toEqual([
      "verifyKey",
      "discoverSymbols",
      "fetchFills",
      "fetchFills",
      "fetchPositions",
      "fetchConditionalOrders",
      "fetchConditionalOrders",
      "fetchBalance",
    ]);
    expect(calls[2].args).toEqual([CREDS, "BTCUSDT", 2_000, 6_000]);
  });

  it("throws ExchangeError with the configured code and still records the call", async () => {
    const { adapter, calls } = createFakeAdapter({
      throws: { fetchFills: "rate_limited", fetchBalance: "clock_skew" },
    });

    await expect(
      adapter.fetchFills(CREDS, "BTCUSDT", 0, 1)
    ).rejects.toMatchObject({ code: "rate_limited" });
    const error = await adapter.fetchBalance(CREDS).catch(e => e);
    expect(error).toBeInstanceOf(ExchangeError);
    expect(error.code).toBe("clock_skew");
    expect(await adapter.fetchPositions(CREDS)).toEqual([]);

    expect(calls.map(c => c.method)).toEqual([
      "fetchFills",
      "fetchBalance",
      "fetchPositions",
    ]);
  });
});
