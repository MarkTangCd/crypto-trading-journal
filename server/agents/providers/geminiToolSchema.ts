import { randomUUID } from "node:crypto";
import type { ToolCall, ToolDeclaration } from "./types";

/**
 * Translate ToolDeclaration[] (openai-style JSON Schema) into the Gemini
 * `tools: [{ functionDeclarations: [...] }]` wire shape, and parse Gemini
 * `functionCall` parts back into the cross-provider ToolCall[] structure.
 *
 * Why a dedicated module: Gemini's OpenAPI 3.0 subset rejects keywords that
 * `z.toJSONSchema` (zod v4) emits by default (`$schema`, `additionalProperties`,
 * numeric `minimum`/`maximum`, ...). Keeping the translation here means the
 * provider only has to wire it in — and the rules stay unit-testable in
 * isolation from any provider transport code.
 */

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GeminiToolsBlock {
  functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiFunctionCallPart {
  name: string;
  args?: Record<string, unknown>;
}

interface GeminiCandidatePart {
  text?: string;
  functionCall?: GeminiFunctionCallPart;
}

interface GeminiResponseLike {
  candidates?: Array<{
    content?: { parts?: GeminiCandidatePart[] };
  }>;
}

// Whitelist of JSON Schema keywords that Gemini's OpenAPI 3.0 subset accepts.
// Anything not on this list (notably `$schema` and `additionalProperties`,
// which zod v4 always emits) is dropped silently — including them produces a
// 400 from the upstream.
const SCHEMA_WHITELIST = new Set([
  "type",
  "description",
  "properties",
  "required",
  "items",
  "enum",
  "nullable",
  "format",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Recursively walk a JSON Schema and keep only the keys Gemini accepts.
 * Recurses into `properties` (each child schema) and `items` (single schema)
 * so nested object/array shapes survive intact. Non-schema primitives like
 * `required` (string[]) and `enum` (value[]) pass through unchanged.
 */
export function translateSchema(schema: unknown): Record<string, unknown> {
  if (!isPlainObject(schema)) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!SCHEMA_WHITELIST.has(key)) continue;

    if (key === "properties" && isPlainObject(value)) {
      const translatedProps: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        translatedProps[propName] = translateSchema(propSchema);
      }
      out.properties = translatedProps;
    } else if (key === "items") {
      out.items = translateSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function translateToGeminiTools(
  tools: ToolDeclaration[]
): GeminiToolsBlock {
  return {
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: translateSchema(tool.parameters),
    })),
  };
}

/**
 * Pull `functionCall` parts out of a Gemini streaming/non-streaming response
 * candidate and normalise them into the cross-provider ToolCall shape.
 *
 * Gemini does not assign call ids, so we mint a `crypto.randomUUID()` per
 * call. runTools uses ids only for in-turn outcome correlation, so global
 * stability is unnecessary — uniqueness within the assistant turn is enough.
 *
 * Returns `undefined` (not `[]`) when no calls are present, mirroring the
 * `chunk.toolCalls?.length` guard used by callers.
 */
export function parseGeminiFunctionCalls(
  payload: unknown
): ToolCall[] | undefined {
  if (!isPlainObject(payload)) return undefined;
  const response = payload as GeminiResponseLike;
  const parts = response.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return undefined;

  const calls: ToolCall[] = [];
  for (const part of parts) {
    const fnCall = part?.functionCall;
    if (!fnCall || typeof fnCall.name !== "string") continue;
    calls.push({
      id: randomUUID(),
      name: fnCall.name,
      arguments: JSON.stringify(fnCall.args ?? {}),
    });
  }
  return calls.length > 0 ? calls : undefined;
}
