/**
 * Skill allowlist conversion helpers shared by SkillsSection and its tests.
 *
 * Server semantics (see server/agents/skillRegistry.ts):
 *   - `enabledSkillIds = []` means "every registered skill is enabled". This
 *     is the zero-config default and keeps future-registered skills opt-in
 *     for users who never touched the setting.
 *   - A non-empty array is the explicit allowlist.
 *
 * UI inverts that mapping: the user always sees concrete checkboxes, never
 * an implicit "all" state. These helpers translate between the two views.
 */

/**
 * Build the checkbox state shown to the user from the saved allowlist.
 *   - saved `[]` → every known skill is checked (default-all-enabled).
 *   - saved non-empty → intersect with known ids so a stale row (a skill
 *     that has since been unregistered) is silently dropped.
 */
export function fromSavedSkillIds(
  allIds: readonly string[],
  saved: readonly string[]
): Set<string> {
  if (saved.length === 0) return new Set(allIds);
  const known = new Set(allIds);
  return new Set(saved.filter(id => known.has(id)));
}

/**
 * Collapse the user's checked set back into what gets persisted.
 *   - checked === every known id → save `[]` so newly-registered skills
 *     auto-enable next time the agent runs.
 *   - otherwise → save the sorted ids actually checked.
 *
 * Sorting keeps repeated saves byte-identical, which simplifies dirty-state
 * comparison and makes the row easier to eyeball during debugging.
 */
export function toSavedSkillIds(
  allIds: readonly string[],
  checked: ReadonlySet<string>
): string[] {
  if (allIds.length > 0 && checked.size === allIds.length) {
    const everyKnownChecked = allIds.every(id => checked.has(id));
    if (everyKnownChecked) return [];
  }
  return Array.from(checked).sort();
}
