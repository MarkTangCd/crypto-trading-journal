import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const tmpDir = join(repoRoot, ".tmp");
const dbModuleUrl = pathToFileURL(join(repoRoot, "server", "db.ts")).href;

function runScenario(
  fileName: string,
  rows: Array<{
    status: string;
    reviewFeedback: string | null;
    isReviewed: number;
  }>
) {
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const databasePath = join(tmpDir, fileName);
  if (existsSync(databasePath)) {
    rmSync(databasePath);
  }

  const inserts = rows
    .map(
      row =>
        `db.prepare("INSERT INTO transactions (status, reviewFeedback, isReviewed) VALUES (?, ?, ?)").run(${JSON.stringify(row.status)}, ${JSON.stringify(row.reviewFeedback)}, ${row.isReviewed});`
    )
    .join("\n");

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'open', reviewFeedback TEXT, isReviewed INTEGER NOT NULL DEFAULT 0);");
    ${inserts}
    const { migrateTransactionStatus } = await import(${JSON.stringify(dbModuleUrl)});
    const migrated = await migrateTransactionStatus();
    const rows = db.prepare("SELECT id, status, reviewFeedback, isReviewed FROM transactions ORDER BY id").all();
    db.close();
    console.log(JSON.stringify({ migrated, rows }));
  `;

  const output = execFileSync(
    "node",
    [
      "--experimental-sqlite",
      "--input-type=module",
      "--import",
      "tsx",
      "--eval",
      script,
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: databasePath },
      encoding: "utf-8",
    }
  );

  const result = JSON.parse(output.trim()) as {
    migrated: number;
    rows: Array<{
      id: number;
      status: string;
      reviewFeedback: string | null;
      isReviewed: number;
    }>;
  };

  rmSync(databasePath);

  return result;
}

describe("migrateTransactionStatus", () => {
  beforeEach(() => {
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      for (const entry of [
        "task-3-reviewed.sqlite",
        "task-3-closed-feedback.sqlite",
        "task-3-closed-empty.sqlite",
      ]) {
        const path = join(tmpDir, entry);
        if (existsSync(path)) {
          rmSync(path);
        }
      }
    }
  });

  it("marks reviewed transactions as reviewed", () => {
    const result = runScenario("task-3-reviewed.sqlite", [
      { status: "open", reviewFeedback: "looks good", isReviewed: 1 },
    ]);

    expect(result.migrated).toBe(1);
    expect(result.rows).toEqual([
      {
        id: 1,
        status: "reviewed",
        reviewFeedback: "looks good",
        isReviewed: 1,
      },
    ]);
  });

  it("marks reviewed flag off as closed when feedback exists", () => {
    const result = runScenario("task-3-closed-feedback.sqlite", [
      { status: "open", reviewFeedback: "needs work", isReviewed: 0 },
    ]);

    expect(result.migrated).toBe(1);
    expect(result.rows).toEqual([
      {
        id: 1,
        status: "closed",
        reviewFeedback: "needs work",
        isReviewed: 0,
      },
    ]);
  });

  it("marks reviewed flag off as closed without feedback", () => {
    const result = runScenario("task-3-closed-empty.sqlite", [
      { status: "open", reviewFeedback: null, isReviewed: 0 },
    ]);

    expect(result.migrated).toBe(1);
    expect(result.rows).toEqual([
      {
        id: 1,
        status: "closed",
        reviewFeedback: null,
        isReviewed: 0,
      },
    ]);
  });
});
