import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the backend resolver BEFORE the skill module registers, so the run
// closure picks up our stub instead of the real binance backend.
const fetchHistoryMock = vi.fn();
vi.mock("./fundingBackends", () => ({
  getActiveFundingBackend: () => ({
    id: "binance",
    intervalHours: 8,
    fetchHistory: fetchHistoryMock,
  }),
}));

import { getTool, runTool, unregisterForTest } from "../skillRegistry";

import "./fetchFundingRates";

beforeEach(() => {
  fetchHistoryMock.mockReset();
});

afterAll(() => {
  unregisterForTest("fetch_funding_rates");
});

describe("fetch_funding_rates skill", () => {
  it("registers under the canonical name with the network category", () => {
    const tool = getTool("fetch_funding_rates");
    expect(tool).toBeDefined();
    expect(tool?.category).toBe("network");
  });

  it("converts decimal rates to percent, flags extremes, and routes current/history", async () => {
    // 0.0001 == 0.01% (below threshold), 0.0006 == 0.06% (long-heavy),
    // -0.0007 == -0.07% (short-heavy), 0.0005 == 0.05% exactly (NOT extreme,
    // threshold is strict >).
    fetchHistoryMock.mockResolvedValueOnce({
      ok: true,
      history: [
        { ts: 1000, rate: 0.0001 },
        { ts: 2000, rate: 0.0006 },
        { ts: 3000, rate: -0.0007 },
        { ts: 4000, rate: 0.0005 },
      ],
    });

    const result = (await runTool("fetch_funding_rates", {
      tradingPair: "btcusdt",
      lookbackHours: 24,
    })) as {
      ok: true;
      tradingPair: string;
      source: string;
      unit: "percent";
      intervalHours: number;
      current: { ts: number; rate: number };
      extremes: Array<{ ts: number; rate: number; side: string }>;
      history: Array<{ ts: number; rate: number }>;
      threshold: number;
    };

    expect(result.ok).toBe(true);
    expect(result.tradingPair).toBe("BTCUSDT");
    expect(result.source).toBe("binance");
    expect(result.unit).toBe("percent");
    expect(result.intervalHours).toBe(8);
    expect(result.threshold).toBe(0.05);
    expect(result.history.map(p => p.rate)).toEqual([0.01, 0.06, -0.07, 0.05]);
    expect(result.current).toEqual({ ts: 4000, rate: 0.05 });
    expect(result.extremes).toEqual([
      { ts: 2000, rate: 0.06, side: "long-heavy" },
      { ts: 3000, rate: -0.07, side: "short-heavy" },
    ]);

    // 24h / 8h per funding => limit = 3.
    expect(fetchHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ tradingPair: "BTCUSDT", limit: 3 })
    );
  });

  it("returns ok=false in Chinese when the backend returns empty history", async () => {
    fetchHistoryMock.mockResolvedValueOnce({ ok: true, history: [] });

    const result = (await runTool("fetch_funding_rates", {
      tradingPair: "BTCUSDT",
    })) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/未获取到/);
  });

  it("propagates backend errors as ok=false in Chinese", async () => {
    fetchHistoryMock.mockResolvedValueOnce({
      ok: false,
      error: "binance 请求失败: network down",
    });

    const result = (await runTool("fetch_funding_rates", {
      tradingPair: "BTCUSDT",
    })) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toBe("binance 请求失败: network down");
  });

  it("rejects lookbackHours below 24 at the zod boundary", async () => {
    await expect(
      runTool("fetch_funding_rates", {
        tradingPair: "BTCUSDT",
        lookbackHours: 1,
      })
    ).rejects.toThrow();
    expect(fetchHistoryMock).not.toHaveBeenCalled();
  });
});
