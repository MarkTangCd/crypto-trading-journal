/**
 * Tiny SSE frame parser used by openai-compatible streaming providers.
 *
 * Why a helper instead of inlining: SSE chunks can split mid-frame, and
 * `: ping` keepalives plus the `[DONE]` terminator need uniform handling
 * across providers. Keeping the buffer + line-walk in one place lets each
 * provider focus on the JSON shape inside `data:` lines.
 */

export interface ParsedFrame {
  /** Raw text after `data:` (trimmed). Never includes `[DONE]`. */
  data: string;
}

export interface ParseSseResult {
  frames: ParsedFrame[];
  /** Bytes that did not complete a frame yet — feed back on the next call. */
  remainder: string;
  /** True when the upstream signalled end-of-stream via `data: [DONE]`. */
  done: boolean;
}

/**
 * Consumes a buffered SSE chunk and returns completed frames plus any
 * trailing partial bytes. The caller is responsible for stitching
 * `result.remainder` onto the next chunk.
 *
 * Frame layout per the SSE spec: events are separated by a blank line
 * (`\n\n`). Lines starting with `:` are comments (used by upstream for
 * keepalives like `: ping`) and must be ignored. Lines starting with
 * `data:` carry the payload; multiple `data:` lines in one event are
 * joined with `\n` before being surfaced.
 */
export function parseSseFrames(input: string): ParseSseResult {
  const frames: ParsedFrame[] = [];
  let done = false;

  // Split on blank line (handle both \n\n and \r\n\r\n).
  const normalised = input.replace(/\r\n/g, "\n");
  const lastBlank = normalised.lastIndexOf("\n\n");
  if (lastBlank === -1) {
    return { frames, remainder: input, done };
  }

  const complete = normalised.slice(0, lastBlank);
  const remainder = normalised.slice(lastBlank + 2);

  for (const rawEvent of complete.split("\n\n")) {
    const dataLines: string[] = [];
    for (const line of rawEvent.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
      // Ignore other SSE fields (`event:`, `id:`, `retry:`) for v1.
    }
    if (dataLines.length === 0) continue;

    const data = dataLines.join("\n");
    if (data === "[DONE]") {
      done = true;
      break;
    }
    frames.push({ data });
  }

  return { frames, remainder, done };
}
