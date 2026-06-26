import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock secrets BEFORE importing the tool so the boot-time register call
// inside webSearch.ts wires through the mocked dependency.
vi.mock("../secrets", () => ({
  getToolApiKey: vi.fn(),
}));

import { getToolApiKey } from "../secrets";
import { getTool, runTool, unregisterForTest } from "../toolRegistry";

// Importing the module triggers register().
import "./webSearch";

const getKeyMock = vi.mocked(getToolApiKey);

const TEST_USER_ID = 1;
const originalFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  getKeyMock.mockReset();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  unregisterForTest("web_search");
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("web_search tool", () => {
  it("registers under the canonical name", () => {
    const tool = getTool("web_search");
    expect(tool).toBeDefined();
    expect(tool?.description).toMatch(/Tavily/);
  });

  it("returns ok:false when tavily api key is missing (does not throw)", async () => {
    getKeyMock.mockResolvedValueOnce(undefined);
    const result = (await runTool(
      "web_search",
      { query: "btc funding" },
      { userId: TEST_USER_ID }
    )) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tavily/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("compresses top-K results into { title, url, snippet }", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            title: "BTC funding spike",
            url: "https://example.com/a",
            content: "x".repeat(800),
          },
          {
            title: "Another",
            url: "https://example.com/b",
            content: "short",
          },
          {
            title: "drop me — past topK",
            url: "https://example.com/c",
            content: "ignored",
          },
        ],
      })
    );

    const result = (await runTool(
      "web_search",
      { query: "btc funding", topK: 2 },
      { userId: TEST_USER_ID }
    )) as {
      ok: boolean;
      results: Array<{ title: string; url: string; snippet: string }>;
    };

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].url).toBe("https://example.com/a");
    expect(result.results[0].snippet.length).toBeLessThanOrEqual(501);
    expect(result.results[0].snippet.endsWith("…")).toBe(true);
    expect(result.results[1].snippet).toBe("short");

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(requestInit.body as string)).toMatchObject({
      api_key: "tav-key",
      query: "btc funding",
      max_results: 2,
    });
  });

  it("returns ok:false on tavily 5xx", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    fetchMock.mockResolvedValueOnce(
      new Response("server boom", {
        status: 500,
        statusText: "Server Error",
      })
    );

    const result = (await runTool(
      "web_search",
      { query: "x" },
      { userId: TEST_USER_ID }
    )) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tavily 500/);
  });

  it("rejects an empty query at the zod boundary", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    await expect(
      runTool("web_search", { query: "" }, { userId: TEST_USER_ID })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects topK > 10 at the zod boundary", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    await expect(
      runTool("web_search", { query: "x", topK: 50 }, { userId: TEST_USER_ID })
    ).rejects.toThrow();
  });

  it("returns ok:false when userId is missing from context", async () => {
    const result = (await runTool("web_search", { query: "x" })) as {
      ok: boolean;
      error?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/userId/);
    expect(getKeyMock).not.toHaveBeenCalled();
  });
});
