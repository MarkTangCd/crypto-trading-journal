import path from "node:path";

const DEFAULT_DB_PATH = "./data/crypto-trading-journal.sqlite";

const FORBIDDEN_PATH_SEGMENTS = [
  "dist",
  "build",
  "out",
  "output",
  ".next",
  ".nuxt",
  ".output",
];

/**
 * Resolves DATABASE_URL to a SQLite file path with validation rules:
 * - Returns default path when DATABASE_URL is blank
 * - Preserves ':memory:' for in-memory databases
 * - Allows '.tmp/*.sqlite' for test files
 * - Rejects paths under dist/ or build-output directories
 *
 * @param databaseUrl - The DATABASE_URL environment variable value
 * @returns Resolved SQLite file path
 * @throws Error if path is under a forbidden directory
 */
export function resolveDatabasePath(databaseUrl: string): string {
  // Handle empty/blank DATABASE_URL
  if (!databaseUrl || databaseUrl.trim() === "") {
    return DEFAULT_DB_PATH;
  }

  const trimmed = databaseUrl.trim();

  // Preserve in-memory database
  if (trimmed === ":memory:") {
    return ":memory:";
  }

  // Normalize path for validation
  const normalized = path.normalize(trimmed);
  const pathSegments = normalized.split(path.sep);

  // Check for forbidden directories
  for (const segment of pathSegments) {
    if (FORBIDDEN_PATH_SEGMENTS.includes(segment.toLowerCase())) {
      throw new Error(
        `Database path '${trimmed}' is not allowed: ` +
          `paths under '${segment}/' are reserved for build output. ` +
          `Please use a different location such as './data/' or '.tmp/' for tests.`
      );
    }
  }

  return trimmed;
}
