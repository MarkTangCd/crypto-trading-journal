import { describe, expect, it } from "vitest";
import { parseSseFrames } from "./sseParser";

describe("parseSseFrames", () => {
  it("parses a single complete frame and reports remainder", () => {
    const input = `data: {"choices":[{"delta":{"content":"hi"}}]}\n\nleftover`;
    const result = parseSseFrames(input);
    expect(result.frames).toEqual([
      { data: '{"choices":[{"delta":{"content":"hi"}}]}' },
    ]);
    expect(result.remainder).toBe("leftover");
    expect(result.done).toBe(false);
  });

  it("buffers a partial frame as remainder until the blank line arrives", () => {
    const result = parseSseFrames(`data: {"choices":[{"delta":{"content":"ab`);
    expect(result.frames).toHaveLength(0);
    expect(result.remainder).toContain('"ab');
    expect(result.done).toBe(false);
  });

  it("skips `: ping` keepalive comments", () => {
    const input = `: ping\n\ndata: {"x":1}\n\n`;
    const result = parseSseFrames(input);
    expect(result.frames).toEqual([{ data: '{"x":1}' }]);
    expect(result.done).toBe(false);
  });

  it("flags done=true on [DONE] terminator and stops emitting later frames", () => {
    const input = `data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\ndata: {"ignored":true}\n\n`;
    const result = parseSseFrames(input);
    expect(result.frames).toEqual([
      { data: '{"choices":[{"delta":{"content":"hi"}}]}' },
    ]);
    expect(result.done).toBe(true);
  });

  it("joins multi-`data:` lines within a single event", () => {
    const input = `data: line1\ndata: line2\n\n`;
    const result = parseSseFrames(input);
    expect(result.frames).toEqual([{ data: "line1\nline2" }]);
  });

  it("tolerates \\r\\n line endings", () => {
    const input = `data: {"x":1}\r\n\r\n`;
    const result = parseSseFrames(input);
    expect(result.frames).toEqual([{ data: '{"x":1}' }]);
  });
});
