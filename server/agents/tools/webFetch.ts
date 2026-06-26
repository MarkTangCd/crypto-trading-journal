import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { register } from "../toolRegistry";

const PER_REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 200 * 1024; // 200KB
const MAX_MARKDOWN_CHARS = 7_000;
const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"] as const;

const parameters = z.object({
  url: z
    .string()
    .url()
    .describe(
      "Absolute URL of an HTML page to fetch and convert to markdown. Non-HTML responses fail soft."
    ),
});

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "…";
}

function composeSignals(signals: AbortSignal[]): AbortSignal {
  const live = signals.filter(Boolean);
  if (live.length === 0) return new AbortController().signal;
  if (live.length === 1) return live[0];
  return AbortSignal.any(live);
}

function isHtmlContentType(value: string | null): boolean {
  if (!value) return false;
  const head = value.split(";")[0].trim().toLowerCase();
  return HTML_CONTENT_TYPES.some(t => head === t);
}

/**
 * Read up to `cap` bytes from the response body. Cancels the underlying reader
 * the moment we cross the cap so the network connection is closed; we never
 * buffer the entire body just to measure its length.
 */
async function readBodyWithCap(
  response: Response,
  cap: number
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  if (!response.body) {
    return { ok: false, error: "empty response body" };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel();
        return {
          ok: false,
          error: `响应超过 ${Math.round(cap / 1024)}KB 上限，已截断`,
        };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: merged };
}

function htmlToMarkdown(
  html: string,
  fallbackUrl: string
): { title: string | null; markdown: string } {
  // linkedom needs a base URL on the document so relative links resolve when
  // Readability serializes them back out. We pass the request URL.
  const { document } = parseHTML(html, { url: fallbackUrl });
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  const sourceHtml = article?.content ?? html;
  const markdown = turndown.turndown(sourceHtml).trim();
  return { title: article?.title ?? null, markdown };
}

register({
  name: "web_fetch",
  description:
    "Fetch a single HTML URL and return its readable article body as markdown. Use this after `web_search` to read a result in detail. Caps at 200KB / 30s; non-HTML responses fail soft.",
  parameters,
  async run(args, context) {
    const externalSignals: AbortSignal[] = [
      AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    ];
    if (context?.signal) externalSignals.push(context.signal);
    const signal = composeSignals(externalSignals);

    let response: Response;
    try {
      response = await fetch(args.url, {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "crypto-trading-journal/web-fetch",
        },
        redirect: "follow",
        signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      return { ok: false, error: `请求失败: ${message}` };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `远端 ${response.status}: ${response.statusText || "request failed"}`,
      };
    }

    const contentType = response.headers.get("content-type");
    if (!isHtmlContentType(contentType)) {
      // Match the spec: PDFs / images / json are out of scope. Cancel the body
      // so the connection closes immediately instead of trickling bytes.
      response.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        error: `非 HTML 内容 (content-type: ${contentType ?? "unknown"})`,
      };
    }

    const body = await readBodyWithCap(response, MAX_BODY_BYTES);
    if (!body.ok) return body;

    const html = new TextDecoder("utf-8").decode(body.bytes);

    let extracted: { title: string | null; markdown: string };
    try {
      extracted = htmlToMarkdown(html, args.url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "html parse failed";
      return { ok: false, error: `正文抽取失败: ${message}` };
    }

    return {
      ok: true,
      url: args.url,
      title: extracted.title,
      markdown: truncate(extracted.markdown, MAX_MARKDOWN_CHARS),
    };
  },
});
