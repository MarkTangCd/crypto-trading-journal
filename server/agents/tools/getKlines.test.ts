import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock coinank BEFORE importing the tool so the boot-time register call
// inside getKlines.ts wires through the mocked dependency.
vi.mock("../../_core/coinank", () => ({
  fetchCandleWindowAround: vi.fn(),
}));

import { fetchCandleWindowAround } from "../../_core/coinank";
import { getTool, runTool, unregisterForTest } from "../toolRegistry";

// Importing the module triggers register().
import "./getKlines";

const fetchMock = vi.mocked(fetchCandleWindowAround);

beforeEach(() => {
  fetchMock.mockReset();
});

afterAll(() => {
  // Keep the registry clean for sibling test files that boot fresh.
  unregisterForTest("get_klines");
});

describe("get_klines tool", () => {
  it("registers under the canonical name", () => {
    const tool = getTool("get_klines");
    expect(tool).toBeDefined();
    expect(tool?.description).toMatch(/OHLCV/);
  });

  it("normalizes the trading pair to uppercase and forwards the default halfSize", async () => {
    fetchMock.mockResolvedValueOnce({
      candles: [
        {
          time: 1_700_000_000,
          open: 1.23456789,
          high: 1.34567891,
          low: 1.12345678,
          close: 1.2,
          volume: 100.123456,
        },
      ],
      entryIndex: 0,
      before: 0,
      after: 1,
    });

    const result = (await runTool("get_klines", {
      tradingPair: "btcusdt",
      timeFrame: "1H",
      anchorMs: 1_700_000_000_000,
    })) as { tradingPair: string; candles: Array<Record<string, number>> };

    expect(fetchMock).toHaveBeenCalledWith({
      tradingPair: "BTCUSDT",
      timeFrame: "1H",
      anchorMs: 1_700_000_000_000,
      halfSize: 50,
    });
    expect(result.tradingPair).toBe("BTCUSDT");
    expect(result.candles[0]).toEqual({
      time: 1_700_000_000,
      open: 1.2346,
      high: 1.3457,
      low: 1.1235,
      close: 1.2,
      volume: 100.12,
    });
  });

  it("rejects an unknown timeFrame at the zod boundary", async () => {
    await expect(
      runTool("get_klines", {
        tradingPair: "BTCUSDT",
        timeFrame: "2h",
        anchorMs: 1_700_000_000_000,
      })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects anchorMs <= 0", async () => {
    await expect(
      runTool("get_klines", {
        tradingPair: "BTCUSDT",
        timeFrame: "1H",
        anchorMs: 0,
      })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects a caller-supplied halfSize within the [1, 200] bounds", async () => {
    fetchMock.mockResolvedValueOnce({
      candles: [],
      entryIndex: null,
      before: 0,
      after: 0,
    });
    await runTool("get_klines", {
      tradingPair: "ETHUSDT",
      timeFrame: "4H",
      anchorMs: 1_700_000_000_000,
      halfSize: 10,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ halfSize: 10 })
    );
  });

  it("rejects halfSize beyond the [1, 200] guardrails", async () => {
    await expect(
      runTool("get_klines", {
        tradingPair: "BTCUSDT",
        timeFrame: "1H",
        anchorMs: 1_700_000_000_000,
        halfSize: 1000,
      })
    ).rejects.toThrow();
  });
});
