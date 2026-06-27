import { z, type ZodTypeAny } from "zod";
import type { ToolDeclaration } from "./providers/types";

/**
 * Skill runtime contract. A skill is the unit the agent can invoke as a
 * function-call: it owns its argument schema (zod) so the orchestrator can
 * validate model-supplied arguments before invocation, and the declaration
 * emitter can derive a JSON Schema for provider `tools[]` payloads.
 *
 * Convention: the registry keys by `name`, which doubles as the skill's
 * stable id (the value the UI persists into `agentSettings.enabledSkillIds`).
 * "Skill id" === `skill.name` throughout the codebase; there is no separate
 * id field.
 *
 * `Tool` is preserved as a name-compatible alias so older call sites and
 * tests that import `Tool` keep type-checking.
 */
export interface Skill<TParams extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  parameters: TParams;
  /**
   * Coarse grouping for the future Settings UI (TASK-33). Optional; absent
   * means the skill is uncategorised (still listable / toggleable).
   */
  category?: "internal" | "network" | "analysis";
  /**
   * Execute the skill. The orchestrator passes the validated args plus an
   * optional context bag (userId, abort signal). Return value is JSON-
   * serialised into the resulting `role="tool"` message content.
   */
  run(
    args: z.infer<TParams>,
    context?: { userId?: number; signal?: AbortSignal }
  ): Promise<unknown>;
}

/** Legacy alias retained for files that still import `Tool`. */
export type Tool<TParams extends ZodTypeAny = ZodTypeAny> = Skill<TParams>;

const REGISTRY = new Map<string, Skill>();

/**
 * Register a skill. Production skills call this at module load (mirroring
 * the provider registry pattern); tests register scratch skills to exercise
 * the runTools orchestrator without depending on real skill implementations.
 */
export function register<T extends ZodTypeAny>(skill: Skill<T>): void {
  REGISTRY.set(skill.name, skill as Skill);
}

/** Alias of {@link register} for callers that prefer the verbose name. */
export const registerSkill = register;

/**
 * Test-only helper: drop a previously registered skill. Production code has
 * no use for this — skills are registered at boot and stay for the process
 * lifetime.
 */
export function unregisterForTest(name: string): void {
  REGISTRY.delete(name);
}

export function getSkill(name: string): Skill | undefined {
  return REGISTRY.get(name);
}

export function listSkills(): Skill[] {
  return Array.from(REGISTRY.values());
}

/**
 * Client-safe projection of a registered skill. Strips `parameters` (a Zod
 * schema) and `run` (a server function) so callers can safely return the
 * payload over tRPC without leaking server-only handles.
 */
export interface SkillMetadata {
  name: string;
  description: string;
  category?: Skill["category"];
}

/**
 * Listing helper for the Settings UI. Production-only skills surface here;
 * internal test skills (e.g. `__noop`) are filtered out so they never appear
 * in the user-facing toggle list.
 */
export function listSkillMetadata(): SkillMetadata[] {
  return listSkills()
    .filter(skill => !skill.name.startsWith("__"))
    .map(skill => ({
      name: skill.name,
      description: skill.description,
      category: skill.category,
    }));
}

function toDeclaration(skill: Skill): ToolDeclaration {
  return {
    name: skill.name,
    description: skill.description,
    parameters: z.toJSONSchema(skill.parameters) as Record<string, unknown>,
  };
}

/**
 * Render the subset of registered skills that should be advertised to the
 * model on this turn as provider-agnostic declarations.
 *
 * `enabledSkillIds` semantics:
 *   - empty array → return every registered skill (default-all-enabled, the
 *     zero-config posture used when the user has never configured Skills)
 *   - non-empty → return only skills whose id (== name) is in the set;
 *     unknown ids are silently ignored so a stale row in agent_settings
 *     never breaks an active conversation.
 *
 * Uses `z.toJSONSchema` (zod v4) so the schema matches what
 * openai-compatible endpoints expect under `tools[].function.parameters`.
 */
export function listEnabledSkillDeclarations(
  enabledSkillIds: string[]
): ToolDeclaration[] {
  const skills = listSkills();
  if (enabledSkillIds.length === 0) return skills.map(toDeclaration);
  const enabled = new Set(enabledSkillIds);
  return skills.filter(s => enabled.has(s.name)).map(toDeclaration);
}

/** Back-compat alias: same shape as the historical tool-era helper. */
export function listToolDeclarations(): ToolDeclaration[] {
  return listEnabledSkillDeclarations([]);
}

/** Back-compat alias of {@link getSkill}. */
export const getTool = getSkill;
/** Back-compat alias of {@link listSkills}. */
export const listTools = listSkills;

/**
 * Validate raw args against the skill's schema and invoke `run`. Throws when
 * the skill is unknown or args fail validation — the orchestrator catches
 * and surfaces those as `tool_result.ok=false` events without aborting.
 */
export async function runSkill(
  name: string,
  rawArgs: unknown,
  context?: { userId?: number; signal?: AbortSignal }
): Promise<unknown> {
  const skill = REGISTRY.get(name);
  if (!skill) {
    throw new Error(`Unknown skill: ${name}`);
  }
  const args = skill.parameters.parse(rawArgs);
  return skill.run(args, context);
}

/** Back-compat alias of {@link runSkill}. */
export const runTool = runSkill;

// Test-only skill: echoes its args back as the result so unit tests can drive
// the runTools orchestrator without registering production skills.
register({
  name: "__noop",
  description: "Internal echo skill used by runTools unit tests.",
  parameters: z.object({ echo: z.string().optional() }),
  async run(args) {
    return { echoed: args.echo ?? null };
  },
});
