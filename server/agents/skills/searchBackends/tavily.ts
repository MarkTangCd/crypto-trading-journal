import { getToolApiKey } from "../../secrets";
import type {
  SearchBackend,
  SearchBackendArgs,
  SearchBackendResponse,
  SearchResult,
} from "./types";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const PER_REQUEST_TIMEOUT_MS = 30_000;
const SNIPPET_MAX_CHARS = 500;

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

async function searchTavily(
  args: SearchBackendArgs
): Promise<SearchBackendResponse> {
  const apiKey = await getToolApiKey(args.userId, "tavily");
  if (!apiKey) {
    return { ok: false, error: "未配置 tavily api key" };
  }

  const externalSignals: AbortSignal[] = [
    AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
  ];
  if (args.signal) externalSignals.push(args.signal);
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

  const results: SearchResult[] = (payload.results ?? [])
    .slice(0, args.topK)
    .map(item => ({
      title: (item.title ?? "").trim(),
      url: (item.url ?? "").trim(),
      snippet: truncate((item.content ?? "").trim(), SNIPPET_MAX_CHARS),
    }))
    .filter(item => item.url.length > 0);

  return { ok: true, results };
}

export const tavilyBackend: SearchBackend = {
  id: "tavily",
  search: searchTavily,
};
