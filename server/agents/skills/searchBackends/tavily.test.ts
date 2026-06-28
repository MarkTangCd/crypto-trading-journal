import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock secrets BEFORE importing the backend so the module-level binding
// captures the mocked dependency.
vi.mock("../../secrets", () => ({
  getToolApiKey: vi.fn(),
}));

import { getToolApiKey } from "../../secrets";
import { tavilyBackend } from "./tavily";

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
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("tavilyBackend", () => {
  it("advertises the canonical id", () => {
    expect(tavilyBackend.id).toBe("tavily");
  });

  it("forwards query / topK / api key to tavily and normalises results", async () => {
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

    const outcome = await tavilyBackend.search({
      query: "btc funding",
      topK: 2,
      userId: TEST_USER_ID,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results[0]).toEqual({
      title: "BTC funding spike",
      url: "https://example.com/a",
      // 500 char cap + truncation suffix
      snippet: "x".repeat(500) + "…",
    });
    expect(outcome.results[1].snippet).toBe("short");

    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://api.tavily.com/search");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      api_key: "tav-key",
      query: "btc funding",
      max_results: 2,
    });
  });

  it("returns ok:false when the tavily api key is missing", async () => {
    getKeyMock.mockResolvedValueOnce(undefined);
    const outcome = await tavilyBackend.search({
      query: "x",
      topK: 5,
      userId: TEST_USER_ID,
    });
    expect(outcome).toEqual({ ok: false, error: "未配置 tavily api key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a 4xx upstream into ok:false with status + body preview", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    fetchMock.mockResolvedValueOnce(
      new Response("bad query", {
        status: 400,
        statusText: "Bad Request",
      })
    );

    const outcome = await tavilyBackend.search({
      query: "x",
      topK: 5,
      userId: TEST_USER_ID,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected error");
    expect(outcome.error).toMatch(/tavily 400/);
    expect(outcome.error).toMatch(/bad query/);
  });

  it("maps a network failure into ok:false with the chinese error prefix", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    fetchMock.mockRejectedValueOnce(new TypeError("ECONNREFUSED"));

    const outcome = await tavilyBackend.search({
      query: "x",
      topK: 5,
      userId: TEST_USER_ID,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "tavily 请求失败: ECONNREFUSED",
    });
  });

  it("maps a malformed json body into ok:false", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    fetchMock.mockResolvedValueOnce(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const outcome = await tavilyBackend.search({
      query: "x",
      topK: 5,
      userId: TEST_USER_ID,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected error");
    expect(outcome.error).toMatch(/tavily 解析失败/);
  });

  it("returns ok:true with an empty results[] when tavily yields none", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    const outcome = await tavilyBackend.search({
      query: "no hits",
      topK: 5,
      userId: TEST_USER_ID,
    });
    expect(outcome).toEqual({ ok: true, results: [] });
  });

  it("threads caller's AbortSignal onto the fetch", async () => {
    getKeyMock.mockResolvedValueOnce("tav-key");
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    const controller = new AbortController();
    await tavilyBackend.search({
      query: "x",
      topK: 5,
      userId: TEST_USER_ID,
      signal: controller.signal,
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
