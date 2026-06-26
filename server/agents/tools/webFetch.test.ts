import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTool, runTool, unregisterForTest } from "../toolRegistry";

// Importing the module triggers register().
import "./webFetch";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  unregisterForTest("web_fetch");
});

function htmlResponse(body: string, contentType = "text/html; charset=utf-8") {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
  <head><title>Funding rate explainer</title></head>
  <body>
    <article>
      <h1>BTC funding spike</h1>
      <p>BTC perpetual funding turned strongly positive after a sharp rally.</p>
      <p>Traders piled into longs as price broke local resistance.</p>
      <p>The funding rate is a recurring payment between long and short positions.</p>
      <p>It keeps perpetual contract prices aligned with the spot market over time.</p>
    </article>
  </body>
</html>`;

describe("web_fetch tool", () => {
  it("registers under the canonical name", () => {
    const tool = getTool("web_fetch");
    expect(tool).toBeDefined();
    expect(tool?.description).toMatch(/markdown/);
  });

  it("rejects a non-URL argument at the zod boundary", async () => {
    await expect(runTool("web_fetch", { url: "not-a-url" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns markdown for an HTML response", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(SAMPLE_HTML));

    const result = (await runTool("web_fetch", {
      url: "https://example.com/funding",
    })) as { ok: boolean; markdown: string; title: string | null };

    expect(result.ok).toBe(true);
    expect(result.title).toMatch(/Funding/i);
    expect(result.markdown).toMatch(/funding/i);
    // Readability+turndown should strip the boilerplate and keep paragraph text.
    expect(result.markdown).toMatch(/perpetual funding/);
  });

  it("returns ok:false when content-type is non-html", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ hello: "world" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const result = (await runTool("web_fetch", {
      url: "https://api.example.com/data",
    })) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/非 HTML/);
  });

  it("returns ok:false when the body exceeds the 200KB cap", async () => {
    // ReadableStream that emits a single 300KB chunk -> reader should cancel
    // after the first read because 300_000 > MAX_BODY_BYTES (200 * 1024).
    const big = new Uint8Array(300_000);
    big.fill(0x61); // ascii 'a'
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big);
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = (await runTool("web_fetch", {
      url: "https://example.com/huge",
    })) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/200KB/);
  });

  it("returns ok:false on a 4xx/5xx upstream", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 404, statusText: "Not Found" })
    );
    const result = (await runTool("web_fetch", {
      url: "https://example.com/missing",
    })) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/404/);
  });

  it("returns ok:false when fetch itself throws (timeout / network)", async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    const result = (await runTool("web_fetch", {
      url: "https://example.com/slow",
    })) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/aborted/);
  });
});
