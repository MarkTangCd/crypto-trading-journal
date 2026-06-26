import { z } from "zod";
import { register, type Skill } from "../skillRegistry";
import { getActiveSearchBackend } from "./searchBackends";

// Cross-backend cap. Tavily limits to 10; Serper / Brave land in the same
// ballpark, so 10 stays a safe shared upper bound for now. If a future backend
// supports more, lift this once the backend swap actually ships.
const MAX_TOP_K = 10;
const DEFAULT_TOP_K = 5;

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

export const webSearchSkill: Skill<typeof parameters> = {
  name: "web_search",
  category: "network",
  description:
    "Search the web for recent news, market commentary, or background context that isn't already in the conversation. Returns a compact list of top results with title, url, and snippet.",
  parameters,
  async run(args, context) {
    // Tool keys are scoped to the user. If the caller forgot to thread userId
    // we fail soft so the orchestrator surfaces it as `tool_result.ok=false`
    // rather than mid-stream error.
    if (context?.userId === undefined) {
      return { ok: false, error: "web_search requires ctx.userId for scoping" };
    }

    const backend = getActiveSearchBackend();
    const outcome = await backend.search({
      query: args.query,
      topK: args.topK,
      userId: context.userId,
      signal: context.signal,
    });

    if (!outcome.ok) {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, query: args.query, results: outcome.results };
  },
};

register(webSearchSkill);
