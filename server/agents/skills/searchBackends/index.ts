import { tavilyBackend } from "./tavily";
import type { SearchBackend } from "./types";

/**
 * Resolve which SearchBackend the `web_search` tool should invoke.
 *
 * v1 is hardcoded to tavily — Phase 5 will read user-selected backend from
 * agent_settings and let conversations override per-turn. Kept as a function
 * (not a const) so callers always go through one indirection point, making
 * that future swap a one-file change.
 */
export function getActiveSearchBackend(): SearchBackend {
  return tavilyBackend;
}

export type {
  SearchBackend,
  SearchBackendArgs,
  SearchBackendResponse,
  SearchResult,
} from "./types";
