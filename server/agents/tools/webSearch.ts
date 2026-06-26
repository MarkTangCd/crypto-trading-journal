import { z } from "zod";
import { register } from "../toolRegistry";
import { getToolApiKey } from "../secrets";

// Tavily caps `max_results` at 10; keep the schema aligned so an over-eager
// model can't ask for 50 results and waste tokens on a truncated reply.
const MAX_TOP_K = 10;
const DEFAULT_TOP_K = 5;
const SNIPPET_MAX_CHARS = 500;
const PER_REQUEST_TIMEOUT_MS = 30_000;
const TAVILY_ENDPOINT = "https://api.tavily.com/search";

const parameters = z.object({
  query: z
    .string()
    .min(1)
    .describe("Free-form search query. Pass plain text, not URL-encoded."),
  topK: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_K)
    .default(DEFAULT_TOP_K)
    .describe(
      `Number of results, 1-${MAX_TOP_K}. Defaults to ${DEFAULT_TOP_K}.`
    ),
});

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilyResponse {
  results?: TavilySearchResult[];
}

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

register({
  name: "web_search",
  description:
    "Search the web via Tavily. Use this to surface recent news, market commentary, or background context that isn't already in the conversation. Returns a compact list of top results with title, url, and snippet.",
  parameters,
  async run(args, context) {
    // Tool keys are scoped to the user. If the caller forgot to thread userId
    // we fail soft so the orchestrator surfaces it as `tool_result.ok=false`
    // rather than mid-stream error.
    if (context?.userId === undefined) {
      return { ok: false, error: "web_search requires ctx.userId for scoping" };
    }

    const apiKey = await getToolApiKey(context.userId, "tavily");
    if (!apiKey) {
      return { ok: false, error: "未配置 tavily api key" };
    }

    const externalSignals: AbortSignal[] = [
      AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    ];
    if (context.signal) externalSignals.push(context.signal);
    const signal = composeSignals(externalSignals);

    let response: Response;
    try {
      response = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: args.query,
          max_results: args.topK,
        }),
        signal,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "tavily request failed";
      return { ok: false, error: `tavily 请求失败: ${message}` };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `tavily ${response.status}: ${truncate(body, 200) || response.statusText}`,
      };
    }

    let payload: TavilyResponse;
    try {
      payload = (await response.json()) as TavilyResponse;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "invalid tavily payload";
      return { ok: false, error: `tavily 解析失败: ${message}` };
    }

    const results = (payload.results ?? [])
      .slice(0, args.topK)
      .map(item => ({
        title: (item.title ?? "").trim(),
        url: (item.url ?? "").trim(),
        snippet: truncate((item.content ?? "").trim(), SNIPPET_MAX_CHARS),
      }))
      .filter(item => item.url.length > 0);

    return { ok: true, query: args.query, results };
  },
});
