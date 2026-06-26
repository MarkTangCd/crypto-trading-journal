import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the backend dispatcher BEFORE importing the tool — the register() call
// inside webSearch.ts captures the mocked resolver at module load.
const backendSearchMock = vi.fn<
  (args: {
    query: string;
    topK: number;
    userId: number;
    signal?: AbortSignal;
  }) => Promise<
    | {
        ok: true;
        results: Array<{ title: string; url: string; snippet: string }>;
      }
    | { ok: false; error: string }
  >
>();

vi.mock("./searchBackends", () => ({
  getActiveSearchBackend: () => ({ id: "mock", search: backendSearchMock }),
}));

import { getTool, runTool, unregisterForTest } from "../skillRegistry";

// Importing the module triggers register().
import "./webSearch";

const TEST_USER_ID = 1;

beforeEach(() => {
  backendSearchMock.mockReset();
});

afterAll(() => {
  unregisterForTest("web_search");
});

describe("web_search tool", () => {
  it("registers under the canonical name", () => {
    const tool = getTool("web_search");
    expect(tool).toBeDefined();
    expect(tool?.description).toMatch(/Search the web/);
  });

  it("calls the active backend once with the validated args", async () => {
    backendSearchMock.mockResolvedValueOnce({ ok: true, results: [] });

    await runTool(
      "web_search",
      { query: "btc funding", topK: 3 },
      { userId: TEST_USER_ID }
    );

    expect(backendSearchMock).toHaveBeenCalledTimes(1);
    expect(backendSearchMock.mock.calls[0][0]).toMatchObject({
      query: "btc funding",
      topK: 3,
      userId: TEST_USER_ID,
    });
  });

  it("threads ctx.signal through to the backend", async () => {
    backendSearchMock.mockResolvedValueOnce({ ok: true, results: [] });
    const controller = new AbortController();

    await runTool(
      "web_search",
      { query: "x" },
      { userId: TEST_USER_ID, signal: controller.signal }
    );

    const call = backendSearchMock.mock.calls[0][0];
    expect(call.signal).toBe(controller.signal);
  });

  it("wraps an ok backend response into { ok, query, results }", async () => {
    backendSearchMock.mockResolvedValueOnce({
      ok: true,
      results: [
        {
          title: "BTC funding spike",
          url: "https://example.com/a",
          snippet: "snippet a",
        },
      ],
    });

    const result = (await runTool(
      "web_search",
      { query: "btc funding" },
      { userId: TEST_USER_ID }
    )) as {
      ok: boolean;
      query: string;
      results: Array<{ title: string; url: string; snippet: string }>;
    };

    expect(result).toEqual({
      ok: true,
      query: "btc funding",
      results: [
        {
          title: "BTC funding spike",
          url: "https://example.com/a",
          snippet: "snippet a",
        },
      ],
    });
  });

  it("passes backend error string straight through on ok:false", async () => {
    backendSearchMock.mockResolvedValueOnce({
      ok: false,
      error: "tavily 400: bad request",
    });

    const result = (await runTool(
      "web_search",
      { query: "x" },
      { userId: TEST_USER_ID }
    )) as { ok: boolean; error?: string };

    expect(result).toEqual({ ok: false, error: "tavily 400: bad request" });
  });

  it("falls back to the default topK when the caller omits one", async () => {
    backendSearchMock.mockResolvedValueOnce({ ok: true, results: [] });

    await runTool("web_search", { query: "x" }, { userId: TEST_USER_ID });

    expect(backendSearchMock.mock.calls[0][0].topK).toBe(5);
  });

  it("rejects an empty query at the zod boundary (backend never called)", async () => {
    await expect(
      runTool("web_search", { query: "" }, { userId: TEST_USER_ID })
    ).rejects.toThrow();
    expect(backendSearchMock).not.toHaveBeenCalled();
  });

  it("rejects topK > 10 at the zod boundary", async () => {
    await expect(
      runTool("web_search", { query: "x", topK: 50 }, { userId: TEST_USER_ID })
    ).rejects.toThrow();
    expect(backendSearchMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when userId is missing (does not invoke the backend)", async () => {
    const result = (await runTool("web_search", { query: "x" })) as {
      ok: boolean;
      error?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/userId/);
    expect(backendSearchMock).not.toHaveBeenCalled();
  });
});
