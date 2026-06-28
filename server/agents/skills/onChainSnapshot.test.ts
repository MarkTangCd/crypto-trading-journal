import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getTool, runTool, unregisterForTest } from "../skillRegistry";

import "./onChainSnapshot";

const fetchSpy = vi.spyOn(globalThis, "fetch");

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

// Use a `since` that is well in the past so synthetic chart points always
// fall inside the window after filtering.
function chartPoints(points: Array<[number, number]>): {
  values: { x: number; y: number }[];
} {
  return { values: points.map(([x, y]) => ({ x, y })) };
}

beforeEach(() => {
  fetchSpy.mockReset();
});

afterAll(() => {
  fetchSpy.mockRestore();
  unregisterForTest("on_chain_snapshot");
});

describe("on_chain_snapshot skill", () => {
  it("registers under the canonical name with the network category", () => {
    const tool = getTool("on_chain_snapshot");
    expect(tool).toBeDefined();
    expect(tool?.category).toBe("network");
  });

  it("rejects non-BTC pairs (SOL) WITHOUT calling fetch", async () => {
    const result = (await runTool("on_chain_snapshot", {
      symbol: "SOLUSDT",
    })) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/仅支持 BTC 交易对/);
    expect(result.error).toMatch(/SOLUSDT/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects ETH pairs with an explicit Chinese hint about ETH backend not enabled", async () => {
    for (const symbol of ["ETHUSDT", "ETH/USDT", "ETH"]) {
      const result = (await runTool("on_chain_snapshot", { symbol })) as {
        ok: false;
        error: string;
      };
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/ETH 链上数据需付费 backend/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects BTC-prefix-but-not-BTC pairs (BTCDOM, BTCB) at the gate", async () => {
    for (const symbol of ["BTCDOM", "BTCB"]) {
      const result = (await runTool("on_chain_snapshot", { symbol })) as {
        ok: false;
        error: string;
      };
      expect(result.ok).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("BTC happy path: returns sorted history + deltaPct per metric, asset=BTC", async () => {
    const now = Math.floor(Date.now() / 1000);
    // All points within the lookback window so the trimmer keeps them.
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        chartPoints([
          [now - 3600 * 24 * 2, 100], // 2 days ago
          [now - 3600 * 24, 110], // 1 day ago
          [now - 3600, 130], // 1 hour ago
        ])
      )
    );
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        chartPoints([
          [now - 3600 * 24 * 2, 5000],
          [now - 3600, 6000],
        ])
      )
    );

    const result = (await runTool("on_chain_snapshot", {
      symbol: "BTCUSDT",
    })) as {
      ok: true;
      asset: string;
      source: string;
      metrics: Record<
        string,
        | {
            ok: true;
            current: number;
            history: { ts: number; value: number }[];
            deltaPct: number | null;
          }
        | { ok: false; reason: string }
      >;
    };

    expect(result.ok).toBe(true);
    expect(result.asset).toBe("BTC");
    expect(result.source).toBe("blockchain.com");

    const aa = result.metrics.active_addresses;
    expect(aa.ok).toBe(true);
    if (aa.ok) {
      expect(aa.history.map(p => p.value)).toEqual([100, 110, 130]);
      expect(aa.current).toBe(130);
      expect(aa.deltaPct).toBe(30); // (130-100)/100 * 100
    }

    const tv = result.metrics.transfer_value_usd;
    expect(tv.ok).toBe(true);
    if (tv.ok) {
      expect(tv.deltaPct).toBe(20); // (6000-5000)/5000 * 100
    }

    // Each metric uses its own chart endpoint.
    const url0 = String(fetchSpy.mock.calls[0]?.[0]);
    const url1 = String(fetchSpy.mock.calls[1]?.[0]);
    expect(url0).toContain("/charts/n-unique-addresses");
    expect(url1).toContain("/charts/estimated-transaction-volume-usd");
    expect(url0).toContain("format=json");
    expect(url0).toContain("sampled=false");
  });

  it("trims points older than the lookback window (Blockchain.com timespan widens past requested)", async () => {
    const now = Math.floor(Date.now() / 1000);
    // 3 weeks of points: only the last 3 should land inside a 72h lookback.
    const points: Array<[number, number]> = [];
    for (let i = 21; i >= 0; i -= 1) {
      points.push([now - 3600 * 24 * i, 100 + i]);
    }
    fetchSpy.mockResolvedValueOnce(jsonResponse(chartPoints(points)));

    const result = (await runTool("on_chain_snapshot", {
      symbol: "BTCUSDT",
      lookbackHours: 72,
      metrics: ["active_addresses"],
    })) as {
      ok: true;
      metrics: Record<string, { ok: true; history: unknown[] } | { ok: false }>;
    };

    const aa = result.metrics.active_addresses;
    expect(aa.ok).toBe(true);
    if (aa.ok) {
      // 72h → expect 4 points (today + 3 days back) survive the trim.
      expect(aa.history.length).toBeLessThanOrEqual(4);
      expect(aa.history.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("per-metric 429 surfaces as ok=false reason without crashing siblings", async () => {
    const now = Math.floor(Date.now() / 1000);
    fetchSpy.mockResolvedValueOnce(
      new Response("rate limited", { status: 429 })
    );
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        chartPoints([
          [now - 3600 * 24, 1],
          [now - 3600, 2],
        ])
      )
    );

    const result = (await runTool("on_chain_snapshot", {
      symbol: "BTCUSDT",
      metrics: ["active_addresses", "transfer_value_usd"],
    })) as {
      ok: true;
      metrics: Record<string, { ok: boolean; reason?: string }>;
    };

    expect(result.ok).toBe(true);
    const aa = result.metrics.active_addresses;
    expect(aa.ok).toBe(false);
    if (!aa.ok) expect(aa.reason).toMatch(/限流/);
    expect(result.metrics.transfer_value_usd.ok).toBe(true);
  });

  it("per-metric non-200 surfaces with status code + body slice", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("not found", { status: 404, statusText: "Not Found" })
    );
    fetchSpy.mockResolvedValueOnce(
      new Response("server error", { status: 500 })
    );

    const result = (await runTool("on_chain_snapshot", {
      symbol: "BTCUSDT",
      metrics: ["active_addresses", "miner_revenue"],
    })) as {
      ok: true;
      metrics: Record<string, { ok: boolean; reason?: string }>;
    };

    const aa = result.metrics.active_addresses;
    expect(aa.ok).toBe(false);
    if (!aa.ok) expect(aa.reason).toMatch(/Blockchain\.com 404/);
    const mr = result.metrics.miner_revenue;
    expect(mr.ok).toBe(false);
    if (!mr.ok) expect(mr.reason).toMatch(/Blockchain\.com 500/);
  });

  it("returns ok=false per metric when Blockchain.com returns no points inside the window", async () => {
    // All points predate the window → trim drops them all.
    const now = Math.floor(Date.now() / 1000);
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        chartPoints([
          [now - 3600 * 24 * 30, 1],
          [now - 3600 * 24 * 20, 2],
        ])
      )
    );

    const result = (await runTool("on_chain_snapshot", {
      symbol: "BTCUSDT",
      lookbackHours: 24,
      metrics: ["active_addresses"],
    })) as {
      ok: true;
      metrics: Record<string, { ok: boolean; reason?: string }>;
    };

    const aa = result.metrics.active_addresses;
    expect(aa.ok).toBe(false);
    if (!aa.ok) expect(aa.reason).toMatch(/空数据/);
  });

  it("rejects lookbackHours outside 24..168 at the zod boundary", async () => {
    await expect(
      runTool("on_chain_snapshot", {
        symbol: "BTCUSDT",
        lookbackHours: 10,
      })
    ).rejects.toThrow();
    await expect(
      runTool("on_chain_snapshot", {
        symbol: "BTCUSDT",
        lookbackHours: 999,
      })
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
