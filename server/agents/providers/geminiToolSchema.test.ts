import { describe, expect, it } from "vitest";
import {
  parseGeminiFunctionCalls,
  translateSchema,
  translateToGeminiTools,
} from "./geminiToolSchema";

describe("translateSchema", () => {
  it("drops $schema and additionalProperties (zod v4 emits both)", () => {
    const input = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
      additionalProperties: false,
    };
    expect(translateSchema(input)).toEqual({
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    });
  });

  it("drops numeric constraints (minimum / maximum / minLength / pattern)", () => {
    const input = {
      type: "integer",
      minimum: 1,
      maximum: 500,
      pattern: "^[a-z]+$",
      minLength: 3,
      description: "kept",
    };
    expect(translateSchema(input)).toEqual({
      type: "integer",
      description: "kept",
    });
  });

  it("recurses into nested object properties", () => {
    const input = {
      type: "object",
      properties: {
        outer: {
          type: "object",
          properties: {
            inner: { type: "string", default: "ignored" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    };
    expect(translateSchema(input)).toEqual({
      type: "object",
      properties: {
        outer: {
          type: "object",
          properties: {
            inner: { type: "string" },
          },
        },
      },
    });
  });

  it("recurses into array items schema", () => {
    const input = {
      type: "array",
      items: {
        type: "object",
        properties: { symbol: { type: "string" } },
        additionalProperties: false,
      },
      minItems: 1,
    };
    expect(translateSchema(input)).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: { symbol: { type: "string" } },
      },
    });
  });

  it("preserves enum and description verbatim", () => {
    const input = {
      type: "string",
      enum: ["1m", "5m", "1h"],
      description: "Kline interval",
    };
    expect(translateSchema(input)).toEqual({
      type: "string",
      enum: ["1m", "5m", "1h"],
      description: "Kline interval",
    });
  });

  it("preserves nullable and format on leaf nodes", () => {
    const input = {
      type: "string",
      format: "date-time",
      nullable: true,
      default: "drop me",
    };
    expect(translateSchema(input)).toEqual({
      type: "string",
      format: "date-time",
      nullable: true,
    });
  });

  it("returns {} for non-object input (defensive against undefined)", () => {
    expect(translateSchema(undefined)).toEqual({});
    expect(translateSchema(null)).toEqual({});
    expect(translateSchema("string")).toEqual({});
    expect(translateSchema([1, 2, 3])).toEqual({});
  });
});

describe("translateToGeminiTools", () => {
  it("wraps each tool as a functionDeclaration with translated parameters", () => {
    const result = translateToGeminiTools([
      {
        name: "get_klines",
        description: "fetch ohlcv",
        parameters: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            symbol: { type: "string" },
            interval: { type: "string", enum: ["1h", "1d"] },
            limit: { type: "integer", minimum: 1, maximum: 500 },
          },
          required: ["symbol", "interval"],
          additionalProperties: false,
        },
      },
    ]);
    expect(result).toEqual({
      functionDeclarations: [
        {
          name: "get_klines",
          description: "fetch ohlcv",
          parameters: {
            type: "object",
            properties: {
              symbol: { type: "string" },
              interval: { type: "string", enum: ["1h", "1d"] },
              limit: { type: "integer" },
            },
            required: ["symbol", "interval"],
          },
        },
      ],
    });
  });

  it("preserves multiple tools in order", () => {
    const result = translateToGeminiTools([
      { name: "a", description: "first", parameters: { type: "object" } },
      { name: "b", description: "second", parameters: { type: "object" } },
    ]);
    expect(result.functionDeclarations.map(d => d.name)).toEqual(["a", "b"]);
  });
});

describe("parseGeminiFunctionCalls", () => {
  it("extracts a single functionCall part with stringified args", () => {
    const result = parseGeminiFunctionCalls({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "get_klines",
                  args: { symbol: "BTCUSDT", interval: "1h" },
                },
              },
            ],
          },
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result?.[0].name).toBe("get_klines");
    expect(result?.[0].arguments).toBe(
      JSON.stringify({ symbol: "BTCUSDT", interval: "1h" })
    );
    expect(typeof result?.[0].id).toBe("string");
    expect(result?.[0].id.length).toBeGreaterThan(0);
  });

  it("falls back to {} args when functionCall.args is missing", () => {
    const result = parseGeminiFunctionCalls({
      candidates: [
        { content: { parts: [{ functionCall: { name: "ping" } }] } },
      ],
    });
    expect(result?.[0].arguments).toBe("{}");
  });

  it("preserves nested args when stringifying", () => {
    const result = parseGeminiFunctionCalls({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "search",
                  args: { query: "btc", filters: { type: "news", limit: 5 } },
                },
              },
            ],
          },
        },
      ],
    });
    const parsed = JSON.parse(result![0].arguments) as Record<string, unknown>;
    expect(parsed).toEqual({
      query: "btc",
      filters: { type: "news", limit: 5 },
    });
  });

  it("returns multiple calls when several functionCall parts appear", () => {
    const result = parseGeminiFunctionCalls({
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "a", args: {} } },
              { text: "thinking…" },
              { functionCall: { name: "b", args: { z: 1 } } },
            ],
          },
        },
      ],
    });
    expect(result?.map(c => c.name)).toEqual(["a", "b"]);
    expect(result?.[1].arguments).toBe(JSON.stringify({ z: 1 }));
  });

  it("returns undefined when no functionCall parts are present", () => {
    expect(
      parseGeminiFunctionCalls({
        candidates: [{ content: { parts: [{ text: "just words" }] } }],
      })
    ).toBeUndefined();
  });

  it("returns undefined for malformed payloads", () => {
    expect(parseGeminiFunctionCalls(undefined)).toBeUndefined();
    expect(parseGeminiFunctionCalls({})).toBeUndefined();
    expect(parseGeminiFunctionCalls({ candidates: [] })).toBeUndefined();
    expect(
      parseGeminiFunctionCalls({ candidates: [{ content: {} }] })
    ).toBeUndefined();
  });
});
