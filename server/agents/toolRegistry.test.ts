import { describe, expect, it } from "vitest";
import {
  getTool,
  listToolDeclarations,
  listTools,
  runTool,
} from "./toolRegistry";

describe("toolRegistry", () => {
  it("registers and looks up the built-in noop tool", () => {
    const tool = getTool("__noop");
    expect(tool).toBeDefined();
    expect(tool?.name).toBe("__noop");
  });

  it("listTools surfaces the noop entry", () => {
    expect(listTools().some(tool => tool.name === "__noop")).toBe(true);
  });

  it("listToolDeclarations emits provider-agnostic JSON schemas", () => {
    const declarations = listToolDeclarations();
    const noop = declarations.find(decl => decl.name === "__noop");
    expect(noop).toBeDefined();
    expect(noop?.description).toMatch(/echo/i);
    // z.toJSONSchema yields a real JSON Schema object — sanity-check the shape.
    expect(noop?.parameters).toMatchObject({
      type: "object",
      properties: expect.objectContaining({ echo: expect.any(Object) }),
    });
  });

  it("runTool validates args via zod before calling run", async () => {
    const result = await runTool("__noop", { echo: "hello" });
    expect(result).toEqual({ echoed: "hello" });
  });

  it("runTool throws when args fail validation", async () => {
    await expect(runTool("__noop", { echo: 42 })).rejects.toThrow();
  });

  it("runTool throws on unknown tool", async () => {
    await expect(runTool("does-not-exist", {})).rejects.toThrow(/unknown/i);
  });
});
