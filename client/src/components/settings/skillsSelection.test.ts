import { describe, expect, it } from "vitest";

import { fromSavedSkillIds, toSavedSkillIds } from "./skillsSelection";

describe("toSavedSkillIds", () => {
  const ALL = ["analyze", "summarize", "web_search"];

  it("collapses 'every known skill checked' to [] so new skills auto-enable", () => {
    const checked = new Set(ALL);
    expect(toSavedSkillIds(ALL, checked)).toEqual([]);
  });

  it("returns the sorted explicit allowlist when a strict subset is checked", () => {
    const checked = new Set(["web_search", "analyze"]);
    expect(toSavedSkillIds(ALL, checked)).toEqual(["analyze", "web_search"]);
  });

  it("returns [] (not all-checked) when no skill is checked — caller guards UX", () => {
    expect(toSavedSkillIds(ALL, new Set())).toEqual([]);
  });
});

describe("fromSavedSkillIds", () => {
  const ALL = ["analyze", "summarize", "web_search"];

  it("hydrates [] into the full set so default-all-enabled renders as fully checked", () => {
    const checked = fromSavedSkillIds(ALL, []);
    expect(checked).toEqual(new Set(ALL));
  });

  it("hydrates a non-empty allowlist into a subset, ignoring unknown stale ids", () => {
    const checked = fromSavedSkillIds(ALL, ["web_search", "ghost_skill"]);
    expect(checked).toEqual(new Set(["web_search"]));
  });
});
