import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { fetchCandles } from "./coinank";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("fetchCandles retry behaviour", () => {
  it("retries once when the first fetch rejects and returns the second response", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [[1781707200000, 1781710800000, 100, 101, 102, 99, 5]],
        })
      );

    vi.useFakeTimers();
    const promise = fetchCandles({
      tradingPair: "BTCUSDT",
      timeFrame: "1H",
      anchor: 1781707320000,
      size: 1,
    });
    // Skip past the 1s retry backoff so the promise resolves immediately.
    await vi.advanceTimersByTimeAsync(1_500);
    const candles = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({
      open: 100,
      close: 101,
      high: 102,
      low: 99,
    });
  });

  it("throws BAD_GATEWAY when both attempts fail", async () => {
    const err = new TypeError("fetch failed");
    fetchMock.mockRejectedValue(err);

    vi.useFakeTimers();
    const promise = fetchCandles({
      tradingPair: "BTCUSDT",
      timeFrame: "1H",
      anchor: 1781707320000,
      size: 1,
    });
    // Swallow the unhandled rejection until the assertion attaches.
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(promise).rejects.toBeInstanceOf(TRPCError);
    await expect(promise).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: "Failed to reach market data provider",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
