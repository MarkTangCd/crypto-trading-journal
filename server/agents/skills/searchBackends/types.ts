/**
 * Pluggable backend contract for the `web_search` tool. v1 ships a single
 * tavily implementation; Serper / Brave can slot in later by exporting another
 * SearchBackend and pointing `getActiveSearchBackend()` at it.
 *
 * Kept deliberately small: query + topK in, normalised result list out. The
 * tool layer owns user-facing concerns (zod schema, ToolResult wrapping); the
 * backend layer owns transport (fetch, auth, error mapping).
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchBackendArgs {
  query: string;
  topK: number;
  userId: number;
  signal?: AbortSignal;
}

export type SearchBackendResponse =
  | { ok: true; results: SearchResult[] }
  | { ok: false; error: string };

export interface SearchBackend {
  /** Stable backend id, e.g. "tavily". */
  id: string;
  search(args: SearchBackendArgs): Promise<SearchBackendResponse>;
}
