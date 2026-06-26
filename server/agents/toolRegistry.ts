import { z, type ZodTypeAny } from "zod";
import type { ToolDeclaration } from "./providers/types";

/**
 * Tool runtime contract. Each tool owns its argument schema (zod) so the
 * orchestrator can validate model-supplied arguments before invoking it,
 * and the declaration emitter can derive a JSON Schema for the provider
 * `tools[]` payload.
 */
export interface Tool<TParams extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  parameters: TParams;
  /**
   * Execute the tool. The orchestrator passes the validated args plus an
   * optional context bag (userId, abort signal). Return value is JSON-
   * serialised into the resulting `role="tool"` message content.
   */
  run(
    args: z.infer<TParams>,
    context?: { userId?: number; signal?: AbortSignal }
  ): Promise<unknown>;
}

const REGISTRY = new Map<string, Tool>();

/**
 * Register a tool. Production tools call this at module load (mirroring the
 * provider registry pattern); tests register scratch tools to exercise the
 * runTools orchestrator without depending on real tool implementations.
 */
export function register<T extends ZodTypeAny>(tool: Tool<T>): void {
  REGISTRY.set(tool.name, tool as Tool);
}

/**
 * Test-only helper: drop a previously registered tool. Production code has
 * no use for this — tools are registered at boot and stay for the process
 * lifetime.
 */
export function unregisterForTest(name: string): void {
  REGISTRY.delete(name);
}

export function getTool(name: string): Tool | undefined {
  return REGISTRY.get(name);
}

export function listTools(): Tool[] {
  return Array.from(REGISTRY.values());
}

/**
 * Render every registered tool as a provider-agnostic declaration. Uses
 * `z.toJSONSchema` (zod v4) so the schema matches what openai-compatible
 * endpoints expect under `tools[].function.parameters`.
 */
export function listToolDeclarations(): ToolDeclaration[] {
  return listTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.parameters) as Record<string, unknown>,
  }));
}

/**
 * Validate raw args against the tool's schema and invoke `run`. Throws when
 * the tool is unknown or args fail validation — the orchestrator catches and
 * surfaces those as `tool_result.ok=false` events without aborting the loop.
 */
export async function runTool(
  name: string,
  rawArgs: unknown,
  context?: { userId?: number; signal?: AbortSignal }
): Promise<unknown> {
  const tool = REGISTRY.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const args = tool.parameters.parse(rawArgs);
  return tool.run(args, context);
}

// Test-only tool: echoes its args back as the result so unit tests can drive
// the runTools orchestrator without registering production tools. Real tools
// (get_klines, web_search, ...) live in follow-up tasks and register here.
register({
  name: "__noop",
  description: "Internal echo tool used by runTools unit tests.",
  parameters: z.object({ echo: z.string().optional() }),
  async run(args) {
    return { echoed: args.echo ?? null };
  },
});
