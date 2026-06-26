import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiProvider } from "./gemini";
import { ProviderError } from "./types";

// Build a Response whose body streams the given SSE chunks one at a time.
// Used to assert chunked-delta behaviour without hitting the network.
function sseResponse(
  chunks: string[],
  init: { status?: number } = {}
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: init.status ?? 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function geminiFrame(text: string): string {
  return `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  })}\n\n`;
}

interface CapturedRequest {
  url: string;
  init: RequestInit;
  body: unknown;
}

function captureFetch(
  response: Response | (() => Response | Promise<Response>)
) {
  const captured: CapturedRequest[] = [];
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      captured.push({ url, init, body });
      return typeof response === "function" ? response() : response;
    });
  vi.stubGlobal("fetch", fetchMock);
  return { captured, fetchMock };
}

async function drain(
  stream: AsyncIterable<{ delta: string }>
): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of stream) out.push(chunk.delta);
  return out;
}

const BASE_OPTIONS = { apiKey: "test-key", baseUrl: undefined };

describe("geminiProvider", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("request shape", () => {
    it("extracts a single system message into systemInstruction and keeps contents user-only", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: "you are a journal coach" },
            { role: "user", content: "review this trade" },
          ],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as {
        systemInstruction: { parts: { text: string }[] };
        contents: { role: string; parts: { text: string }[] }[];
      };
      expect(body.systemInstruction.parts[0].text).toBe(
        "you are a journal coach"
      );
      expect(body.contents).toHaveLength(1);
      expect(body.contents[0]).toEqual({
        role: "user",
        parts: [{ text: "review this trade" }],
      });
    });

    it("joins multiple system messages with newlines", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: "rule one" },
            { role: "system", content: "rule two" },
            { role: "user", content: "hi" },
          ],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as {
        systemInstruction: { parts: { text: string }[] };
      };
      expect(body.systemInstruction.parts[0].text).toBe("rule one\nrule two");
    });

    it("maps assistant -> model and preserves message order in contents", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [
            { role: "user", content: "q1" },
            { role: "assistant", content: "a1" },
            { role: "user", content: "q2" },
          ],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as {
        contents: { role: string; parts: { text: string }[] }[];
        systemInstruction?: unknown;
      };
      expect(body.systemInstruction).toBeUndefined();
      expect(body.contents).toEqual([
        { role: "user", parts: [{ text: "q1" }] },
        { role: "model", parts: [{ text: "a1" }] },
        { role: "user", parts: [{ text: "q2" }] },
      ]);
    });

    it("only sets generationConfig.temperature when caller provides one", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
          temperature: 0.4,
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as {
        generationConfig?: { temperature: number };
      };
      expect(body.generationConfig).toEqual({ temperature: 0.4 });
    });

    it("omits generationConfig when temperature is undefined", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as { generationConfig?: unknown };
      expect(body.generationConfig).toBeUndefined();
    });
  });

  describe("URL and headers", () => {
    it("hits the default base, embeds model + apiKey in the query, and omits Authorization", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
        },
        { apiKey: "secret-token" }
      );

      expect(captured[0].url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=secret-token"
      );
      const headers = captured[0].init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Accept).toBe("text/event-stream");
    });

    it("strips a trailing slash from a custom baseUrl", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
        },
        { apiKey: "k", baseUrl: "https://proxy.example.com/v1beta/" }
      );

      expect(captured[0].url).toBe(
        "https://proxy.example.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=k"
      );
    });

    it("falls back to the default model when the request omits one", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        { model: "", messages: [{ role: "user", content: "hi" }] },
        { apiKey: "k" }
      );

      expect(captured[0].url).toContain("/models/gemini-2.5-flash:");
    });
  });

  describe("streaming delta", () => {
    it("yields candidates[0].content.parts[0].text from each frame in order", async () => {
      captureFetch(
        sseResponse([
          geminiFrame("hello "),
          geminiFrame("world"),
          geminiFrame("!"),
        ])
      );

      const stream = geminiProvider.chatStream(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
        },
        BASE_OPTIONS
      );
      expect(await drain(stream)).toEqual(["hello ", "world", "!"]);
    });

    it("skips malformed frames and continues yielding good ones", async () => {
      captureFetch(sseResponse([`data: {not json}\n\n`, geminiFrame("ok")]));

      const stream = geminiProvider.chatStream(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
        },
        BASE_OPTIONS
      );
      expect(await drain(stream)).toEqual(["ok"]);
    });
  });

  describe("error mapping", () => {
    it("throws AUTH on missing apiKey before any fetch", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          { apiKey: "" }
        )
      ).rejects.toMatchObject({ code: "AUTH" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps 401 to AUTH", async () => {
      captureFetch(new Response("nope", { status: 401 }));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        )
      ).rejects.toMatchObject({
        code: "AUTH",
        message: "gemini api key 无效，请到 Settings 重新填写。",
      });
    });

    it("maps 403 to AUTH", async () => {
      captureFetch(new Response("forbidden", { status: 403 }));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        )
      ).rejects.toMatchObject({ code: "AUTH" });
    });

    it("maps 429 to RATE_LIMIT", async () => {
      captureFetch(new Response("slow down", { status: 429 }));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        )
      ).rejects.toMatchObject({
        code: "RATE_LIMIT",
        message: "gemini 接口限流，请稍后再试。",
      });
    });

    it("maps other non-2xx (e.g. 502) to UPSTREAM with status echoed", async () => {
      captureFetch(new Response("bad gateway", { status: 502 }));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        )
      ).rejects.toMatchObject({
        code: "UPSTREAM",
        message: "gemini 接口异常（状态码 502）。",
      });
    });

    it("throws INVALID_RESPONSE when the upstream returns 200 with no body", async () => {
      captureFetch(new Response(null, { status: 200 }));

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        )
      ).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        message: "gemini 流式响应为空，请稍后重试。",
      });
    });

    it("silences AbortError into ProviderError(NETWORK, 请求已被中断。)", async () => {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
        const abortError = new Error("aborted");
        abortError.name = "AbortError";
        throw abortError;
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        )
      ).rejects.toMatchObject({
        code: "NETWORK",
        message: "请求已被中断。",
      });
    });

    it("maps other fetch failures to NETWORK with the brand label", async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError("ECONNREFUSED"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        )
      ).rejects.toMatchObject({
        code: "NETWORK",
        message: "无法连接 gemini。请检查网络或代理配置。",
      });
    });

    it("throws INVALID_RESPONSE from chat() when the stream drains empty", async () => {
      // 200 + an immediately closed body emits no frames, mirroring an upstream
      // that connected but never produced a candidate.
      captureFetch(sseResponse([]));

      await expect(
        geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        )
      ).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        message: "gemini 返回为空，请稍后重试。",
      });
    });

    it("error mappings use ProviderError instances (not plain Error)", async () => {
      captureFetch(new Response("nope", { status: 401 }));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        await geminiProvider.chat(
          {
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: "hi" }],
          },
          BASE_OPTIONS
        );
        throw new Error("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
      }
    });
  });

  describe("tool calls", () => {
    function functionCallFrame(name: string, args: object): string {
      return `data: ${JSON.stringify({
        candidates: [
          {
            content: { parts: [{ functionCall: { name, args } }] },
          },
        ],
      })}\n\n`;
    }

    it("forwards req.tools as a translated functionDeclarations block on the body", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
          tools: [
            {
              name: "get_klines",
              description: "fetch ohlcv",
              parameters: {
                $schema: "https://json-schema.org/draft/2020-12/schema",
                type: "object",
                properties: {
                  symbol: { type: "string" },
                  interval: { type: "string", enum: ["1h", "1d"] },
                },
                required: ["symbol", "interval"],
                additionalProperties: false,
              },
            },
          ],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as { tools: unknown };
      expect(body.tools).toEqual([
        {
          functionDeclarations: [
            {
              name: "get_klines",
              description: "fetch ohlcv",
              parameters: {
                type: "object",
                properties: {
                  symbol: { type: "string" },
                  interval: { type: "string", enum: ["1h", "1d"] },
                },
                required: ["symbol", "interval"],
              },
            },
          ],
        },
      ]);
    });

    it("omits tools when req.tools is absent (no regression for plain chats)", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ok")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as Record<string, unknown>;
      expect(body).not.toHaveProperty("tools");
    });

    it("emits a single { toolCalls } chunk when a frame contains a functionCall", async () => {
      captureFetch(
        sseResponse([
          functionCallFrame("get_klines", {
            symbol: "BTCUSDT",
            interval: "1h",
          }),
        ])
      );

      const chunks: { delta?: string; toolCalls?: unknown }[] = [];
      for await (const chunk of geminiProvider.chatStream(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "go" }],
        },
        BASE_OPTIONS
      )) {
        chunks.push(chunk);
      }

      const final = chunks.find(c => c.toolCalls) as
        | { toolCalls: Array<{ name: string; arguments: string }> }
        | undefined;
      expect(final?.toolCalls).toHaveLength(1);
      expect(final?.toolCalls[0].name).toBe("get_klines");
      expect(JSON.parse(final!.toolCalls[0].arguments)).toEqual({
        symbol: "BTCUSDT",
        interval: "1h",
      });
    });

    it("chat() returns toolCalls and skips the empty-content guard when tools are present", async () => {
      captureFetch(sseResponse([functionCallFrame("ping", {})]));

      const result = await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "go" }],
          tools: [{ name: "ping", description: "", parameters: {} }],
        },
        BASE_OPTIONS
      );

      expect(result.content).toBe("");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].name).toBe("ping");
    });

    it("maps role=tool history to role=user + functionResponse part", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ack")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [
            { role: "user", content: "look up btc" },
            {
              role: "assistant",
              content: "",
              toolCalls: [
                {
                  id: "call-1",
                  name: "get_klines",
                  arguments: JSON.stringify({ symbol: "BTCUSDT" }),
                },
              ],
            },
            {
              role: "tool",
              content: JSON.stringify({ close: 50_000 }),
              toolCallId: "call-1",
              name: "get_klines",
            },
          ],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as {
        contents: Array<{
          role: string;
          parts: Array<Record<string, unknown>>;
        }>;
      };
      // user prompt -> assistant functionCall -> user functionResponse
      expect(body.contents).toHaveLength(3);
      expect(body.contents[2]).toEqual({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "get_klines",
              response: { content: { close: 50_000 } },
            },
          },
        ],
      });
    });

    it("replays assistant turns with prior toolCalls as model + functionCall part", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ack")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "assistant",
              content: "",
              toolCalls: [
                {
                  id: "call-1",
                  name: "get_klines",
                  arguments: JSON.stringify({
                    symbol: "BTCUSDT",
                    interval: "1h",
                  }),
                },
              ],
            },
          ],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as {
        contents: Array<{
          role: string;
          parts: Array<Record<string, unknown>>;
        }>;
      };
      expect(body.contents).toEqual([
        {
          role: "model",
          parts: [
            {
              functionCall: {
                name: "get_klines",
                args: { symbol: "BTCUSDT", interval: "1h" },
              },
            },
          ],
        },
      ]);
    });

    it("preserves both text and functionCall parts on an assistant replay", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ack")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "assistant",
              content: "let me check",
              toolCalls: [
                {
                  id: "call-1",
                  name: "ping",
                  arguments: "{}",
                },
              ],
            },
          ],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as {
        contents: Array<{ role: string; parts: unknown[] }>;
      };
      expect(body.contents[0]).toEqual({
        role: "model",
        parts: [
          { text: "let me check" },
          { functionCall: { name: "ping", args: {} } },
        ],
      });
    });

    it("falls back to {} args when a replayed toolCall has malformed JSON arguments", async () => {
      const { captured } = captureFetch(sseResponse([geminiFrame("ack")]));

      await geminiProvider.chat(
        {
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "assistant",
              content: "",
              toolCalls: [{ id: "x", name: "ping", arguments: "{not json" }],
            },
          ],
        },
        BASE_OPTIONS
      );

      const body = captured[0].body as {
        contents: Array<{ parts: Array<Record<string, unknown>> }>;
      };
      expect(body.contents[0].parts[0]).toEqual({
        functionCall: { name: "ping", args: {} },
      });
    });
  });
});
