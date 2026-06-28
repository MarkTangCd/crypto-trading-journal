import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { binanceBackend } from "./binance";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("binanceBackend", () => {
  it("advertises the canonical id and 8h interval", () => {
    expect(binanceBackend.id).toBe("binance");
    expect(binanceBackend.intervalHours).toBe(8);
  });

  it("parses Binance funding rows and returns ascending-by-ts history", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { symbol: "BTCUSDT", fundingTime: 3000, fundingRate: "0.0001" },
        { symbol: "BTCUSDT", fundingTime: 1000, fundingRate: "-0.0006" },
        { symbol: "BTCUSDT", fundingTime: 2000, fundingRate: "0.00005" },
      ])
    );

    const result = await binanceBackend.fetchHistory({
      tradingPair: "BTCUSDT",
      limit: 3,
    });

    expect(result).toEqual({
      ok: true,
      history: [
        { ts: 1000, rate: -0.0006 },
        { ts: 2000, rate: 0.00005 },
        { ts: 3000, rate: 0.0001 },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("symbol=BTCUSDT&limit=3"),
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
      })
    );
  });

  it("returns ok=false in Chinese on non-200 responses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Symbol unknown", { status: 400, statusText: "Bad Request" })
    );
    const result = await binanceBackend.fetchHistory({
      tradingPair: "FOOBAR",
      limit: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/binance 400/);
      expect(result.error).toMatch(/Symbol unknown/);
    }
  });

  it("returns ok=false in Chinese when fetch itself throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const result = await binanceBackend.fetchHistory({
      tradingPair: "BTCUSDT",
      limit: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatch(/binance 请求失败.*network down/);
  });

  it("returns ok=true with empty history when Binance responds with []", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    const result = await binanceBackend.fetchHistory({
      tradingPair: "BTCUSDT",
      limit: 5,
    });
    expect(result).toEqual({ ok: true, history: [] });
  });

  it("returns ok=false when Binance responds with a non-array body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ msg: "bad" }));
    const result = await binanceBackend.fetchHistory({
      tradingPair: "BTCUSDT",
      limit: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/期望数组/);
  });
});
