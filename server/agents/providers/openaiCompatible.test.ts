import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleProvider } from "./openaiCompatible";
import { ProviderError } from "./types";

const BRAND = "testbrand";
const provider = createOpenAICompatibleProvider({
  id: "test",
  defaultBaseUrl: "https://api.test.example",
  defaultModel: "test-model",
  errorBrand: BRAND,
});

function sseResponse(frames: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function deltaFrame(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("createOpenAICompatibleProvider", () => {
  describe("request body shape", () => {
    it("sends model + messages + stream:true to {baseUrl}/chat/completions", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([deltaFrame("ok"), "data: [DONE]\n\n"])
      );

      await provider.chat(
        {
          model: "",
          messages: [
            { role: "system", content: "sys" },
            { role: "user", content: "hi" },
          ],
          temperature: 0.7,
        },
        { apiKey: "sk-abc" }
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test.example/chat/completions");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer sk-abc");
      expect(init.headers.Accept).toBe("text/event-stream");
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        model: "test-model",
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "hi" },
        ],
        stream: true,
        temperature: 0.7,
      });
    });

    it("honours request.model when provided and skips temperature when missing", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([deltaFrame("ok"), "data: [DONE]\n\n"])
      );

      await provider.chat(
        {
          model: "override-model",
          messages: [{ role: "user", content: "hi" }],
        },
        { apiKey: "sk-abc", baseUrl: "https://override.test/" }
      );

      const [url, init] = fetchMock.mock.calls[0];
      // Trailing slash on baseUrl must be stripped to avoid //chat/completions.
      expect(url).toBe("https://override.test/chat/completions");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("override-model");
      expect(body).not.toHaveProperty("temperature");
    });
  });

  describe("delta streaming", () => {
    it("yields deltas in order and concatenates them via chat()", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          deltaFrame("hello "),
          deltaFrame("world"),
          "data: [DONE]\n\n",
        ])
      );

      const result = await provider.chat(
        { model: "test-model", messages: [{ role: "user", content: "hi" }] },
        { apiKey: "sk-abc" }
      );

      expect(result).toEqual({ role: "assistant", content: "hello world" });
    });
  });

  describe("error mapping", () => {
    it("throws ProviderError(AUTH) on missing api key without calling fetch", async () => {
      await expect(
        provider.chat(
          { model: "test-model", messages: [{ role: "user", content: "x" }] },
          { apiKey: "" }
        )
      ).rejects.toMatchObject({
        name: "ProviderError",
        code: "AUTH",
        message: expect.stringContaining(BRAND),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps 401 to AUTH with branded message", async () => {
      fetchMock.mockResolvedValueOnce(new Response("bad key", { status: 401 }));

      await expect(
        provider.chat(
          { model: "test-model", messages: [{ role: "user", content: "x" }] },
          { apiKey: "sk-bad" }
        )
      ).rejects.toMatchObject({
        name: "ProviderError",
        code: "AUTH",
        message: expect.stringContaining(BRAND),
      });
    });

    it("maps 403 to AUTH as well", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("forbidden", { status: 403 })
      );

      await expect(
        provider.chat(
          { model: "test-model", messages: [{ role: "user", content: "x" }] },
          { apiKey: "sk-bad" }
        )
      ).rejects.toMatchObject({ code: "AUTH" });
    });

    it("maps 429 to RATE_LIMIT", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("slow down", { status: 429 })
      );

      await expect(
        provider.chat(
          { model: "test-model", messages: [{ role: "user", content: "x" }] },
          { apiKey: "sk-ok" }
        )
      ).rejects.toMatchObject({
        code: "RATE_LIMIT",
        message: expect.stringContaining(BRAND),
      });
    });

    it("maps other non-2xx to UPSTREAM with status code", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("server boom", { status: 502 })
      );

      await expect(
        provider.chat(
          { model: "test-model", messages: [{ role: "user", content: "x" }] },
          { apiKey: "sk-ok" }
        )
      ).rejects.toMatchObject({
        code: "UPSTREAM",
        message: expect.stringContaining("502"),
      });
    });

    it("yields INVALID_RESPONSE when chat() sees no content (stream drains to empty)", async () => {
      fetchMock.mockResolvedValueOnce(sseResponse(["data: [DONE]\n\n"]));

      await expect(
        provider.chat(
          { model: "test-model", messages: [{ role: "user", content: "x" }] },
          { apiKey: "sk-ok" }
        )
      ).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        message: expect.stringContaining(BRAND),
      });
    });

    it("throws INVALID_RESPONSE when upstream response has no body", async () => {
      // 200 but body=null — mimics a broken upstream.
      fetchMock.mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );

      const iter = provider.chatStream(
        { model: "test-model", messages: [{ role: "user", content: "x" }] },
        { apiKey: "sk-ok" }
      );

      await expect(async () => {
        for await (const _ of iter) {
          // exhaust
        }
      }).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        message: expect.stringContaining(BRAND),
      });
    });

    it("maps caller-aborted fetch to ProviderError(NETWORK)", async () => {
      const abortError = Object.assign(new Error("aborted"), {
        name: "AbortError",
      });
      fetchMock.mockRejectedValueOnce(abortError);

      const controller = new AbortController();
      controller.abort();

      await expect(
        provider.chat(
          { model: "test-model", messages: [{ role: "user", content: "x" }] },
          { apiKey: "sk-ok", signal: controller.signal }
        )
      ).rejects.toMatchObject({
        code: "NETWORK",
        message: "请求已被中断。",
      });
    });

    it("maps other fetch errors to ProviderError(NETWORK) with brand", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(
        provider.chat(
          { model: "test-model", messages: [{ role: "user", content: "x" }] },
          { apiKey: "sk-ok" }
        )
      ).rejects.toMatchObject({
        code: "NETWORK",
        message: expect.stringContaining(BRAND),
      });
    });
  });

  describe("tool calls", () => {
    function toolDeltaFrame(
      tool_calls: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>,
      finish?: string
    ): string {
      const payload = finish
        ? { choices: [{ delta: { tool_calls }, finish_reason: finish }] }
        : { choices: [{ delta: { tool_calls } }] };
      return `data: ${JSON.stringify(payload)}\n\n`;
    }

    it("forwards req.tools as tools[] + tool_choice:auto on the request body", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([deltaFrame("ok"), "data: [DONE]\n\n"])
      );

      await provider.chat(
        {
          model: "test-model",
          messages: [{ role: "user", content: "hi" }],
          tools: [
            {
              name: "get_x",
              description: "fetch x",
              parameters: {
                type: "object",
                properties: { x: { type: "number" } },
              },
            },
          ],
        },
        { apiKey: "sk-abc" }
      );

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.tool_choice).toBe("auto");
      expect(body.tools).toEqual([
        {
          type: "function",
          function: {
            name: "get_x",
            description: "fetch x",
            parameters: {
              type: "object",
              properties: { x: { type: "number" } },
            },
          },
        },
      ]);
    });

    it("omits tools / tool_choice when req.tools is absent (no regression for plain chats)", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([deltaFrame("ok"), "data: [DONE]\n\n"])
      );

      await provider.chat(
        { model: "test-model", messages: [{ role: "user", content: "hi" }] },
        { apiKey: "sk-abc" }
      );

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
    });

    it("merges streaming tool_calls deltas across frames and emits a final ToolCall[]", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          toolDeltaFrame([
            {
              index: 0,
              id: "call-1",
              function: { name: "get_x", arguments: "" },
            },
          ]),
          toolDeltaFrame([{ index: 0, function: { arguments: '{"x":' } }]),
          toolDeltaFrame(
            [{ index: 0, function: { arguments: "1}" } }],
            "tool_calls"
          ),
          "data: [DONE]\n\n",
        ])
      );

      const chunks = [];
      for await (const chunk of provider.chatStream(
        {
          model: "test-model",
          messages: [{ role: "user", content: "go" }],
        },
        { apiKey: "sk-abc" }
      )) {
        chunks.push(chunk);
      }

      const final = chunks.find(c => c.toolCalls);
      expect(final?.toolCalls).toEqual([
        { id: "call-1", name: "get_x", arguments: '{"x":1}' },
      ]);
    });

    it("buffered tool_calls flush on stream end even without an explicit finish_reason", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          toolDeltaFrame([
            {
              index: 0,
              id: "call-2",
              function: { name: "ping", arguments: "{}" },
            },
          ]),
          "data: [DONE]\n\n",
        ])
      );

      const chunks = [];
      for await (const chunk of provider.chatStream(
        {
          model: "test-model",
          messages: [{ role: "user", content: "go" }],
        },
        { apiKey: "sk-abc" }
      )) {
        chunks.push(chunk);
      }

      const final = chunks.find(c => c.toolCalls);
      expect(final?.toolCalls).toEqual([
        { id: "call-2", name: "ping", arguments: "{}" },
      ]);
    });

    it("chat() returns toolCalls and skips the empty-content guard when tools are present", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          toolDeltaFrame(
            [
              {
                index: 0,
                id: "call-3",
                function: { name: "noop", arguments: "{}" },
              },
            ],
            "tool_calls"
          ),
          "data: [DONE]\n\n",
        ])
      );

      const result = await provider.chat(
        {
          model: "test-model",
          messages: [{ role: "user", content: "go" }],
          tools: [{ name: "noop", description: "", parameters: {} }],
        },
        { apiKey: "sk-abc" }
      );

      expect(result.content).toBe("");
      expect(result.toolCalls).toEqual([
        { id: "call-3", name: "noop", arguments: "{}" },
      ]);
    });

    it("replays assistant turns with prior toolCalls back to the wire shape", async () => {
      fetchMock.mockResolvedValueOnce(
        sseResponse([deltaFrame("ack"), "data: [DONE]\n\n"])
      );

      await provider.chat(
        {
          model: "test-model",
          messages: [
            {
              role: "assistant",
              content: "",
              toolCalls: [{ id: "call-1", name: "noop", arguments: "{}" }],
            },
            {
              role: "tool",
              content: '{"result":1}',
              toolCallId: "call-1",
              name: "noop",
            },
          ],
        },
        { apiKey: "sk-abc" }
      );

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.messages[0]).toEqual({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "noop", arguments: "{}" },
          },
        ],
      });
      expect(body.messages[1]).toEqual({
        role: "tool",
        content: '{"result":1}',
        tool_call_id: "call-1",
        name: "noop",
      });
    });
  });

  it("maps mid-stream AbortError to NETWORK without leaking the raw error", async () => {
    const failing = new Response(
      new ReadableStream<Uint8Array>({
        start(streamController) {
          const abort = Object.assign(new Error("aborted"), {
            name: "AbortError",
          });
          streamController.error(abort);
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );
    fetchMock.mockResolvedValueOnce(failing);

    await expect(async () => {
      for await (const _ of provider.chatStream(
        { model: "test-model", messages: [{ role: "user", content: "x" }] },
        { apiKey: "sk-ok" }
      )) {
        // exhaust
      }
    }).rejects.toMatchObject({
      name: "ProviderError",
      code: "NETWORK",
      message: "请求已被中断。",
    });
  });
});
