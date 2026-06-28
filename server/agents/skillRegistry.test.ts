import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  getSkill,
  getTool,
  listEnabledSkillDeclarations,
  listSkills,
  listTools,
  listToolDeclarations,
  register,
  runSkill,
  runTool,
  unregisterForTest,
} from "./skillRegistry";

describe("skillRegistry", () => {
  it("registers and looks up the built-in noop skill", () => {
    const skill = getSkill("__noop");
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("__noop");
  });

  it("listSkills surfaces the noop entry", () => {
    expect(listSkills().some(skill => skill.name === "__noop")).toBe(true);
  });

  it("listEnabledSkillDeclarations emits provider-agnostic JSON schemas", () => {
    const declarations = listEnabledSkillDeclarations([]);
    const noop = declarations.find(decl => decl.name === "__noop");
    expect(noop).toBeDefined();
    expect(noop?.description).toMatch(/echo/i);
    expect(noop?.parameters).toMatchObject({
      type: "object",
      properties: expect.objectContaining({ echo: expect.any(Object) }),
    });
  });

  it("runSkill validates args via zod before calling run", async () => {
    const result = await runSkill("__noop", { echo: "hello" });
    expect(result).toEqual({ echoed: "hello" });
  });

  it("runSkill throws when args fail validation", async () => {
    await expect(runSkill("__noop", { echo: 42 })).rejects.toThrow();
  });

  it("runSkill throws on unknown skill", async () => {
    await expect(runSkill("does-not-exist", {})).rejects.toThrow(/unknown/i);
  });
});

describe("skillRegistry back-compat aliases", () => {
  it("getTool / listTools / listToolDeclarations / runTool mirror skill helpers", async () => {
    expect(getTool("__noop")?.name).toBe("__noop");
    expect(listTools().some(t => t.name === "__noop")).toBe(true);
    const decls = listToolDeclarations();
    expect(decls.some(d => d.name === "__noop")).toBe(true);
    await expect(runTool("__noop", {})).resolves.toEqual({ echoed: null });
  });
});

describe("listEnabledSkillDeclarations filtering", () => {
  const SKILL_A = "__filter_a";
  const SKILL_B = "__filter_b";

  function registerFixtures() {
    register({
      name: SKILL_A,
      description: "fixture skill a",
      parameters: z.object({}),
      async run() {
        return null;
      },
    });
    register({
      name: SKILL_B,
      description: "fixture skill b",
      parameters: z.object({}),
      async run() {
        return null;
      },
    });
  }

  afterEach(() => {
    unregisterForTest(SKILL_A);
    unregisterForTest(SKILL_B);
  });

  it("empty array returns every registered skill (default-all-enabled)", () => {
    registerFixtures();
    const names = listEnabledSkillDeclarations([]).map(d => d.name);
    expect(names).toEqual(expect.arrayContaining([SKILL_A, SKILL_B, "__noop"]));
  });

  it("non-empty array returns only the listed skills", () => {
    registerFixtures();
    const names = listEnabledSkillDeclarations([SKILL_A]).map(d => d.name);
    expect(names).toEqual([SKILL_A]);
  });

  it("unknown ids are silently ignored, registered ids still emit", () => {
    registerFixtures();
    const names = listEnabledSkillDeclarations([SKILL_B, "does-not-exist"]).map(
      d => d.name
    );
    expect(names).toEqual([SKILL_B]);
  });

  it("returns an empty array when every requested id is unknown", () => {
    registerFixtures();
    const decls = listEnabledSkillDeclarations(["missing-1", "missing-2"]);
    expect(decls).toEqual([]);
  });
});
