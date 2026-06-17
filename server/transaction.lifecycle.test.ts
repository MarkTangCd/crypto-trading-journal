import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const tmpDir = join(repoRoot, ".tmp");
const dbModuleUrl = pathToFileURL(join(repoRoot, "server", "db.ts")).href;

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    initialBalance: "1000.00",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function buildDbMock(overrides: Record<string, unknown> = {}) {
  return {
    createTransactionWithElements: vi.fn(),
    getTransactionById: vi.fn().mockResolvedValue(null),
    getTransactionsByUserId: vi.fn().mockResolvedValue([]),
    updateTransaction: vi.fn().mockResolvedValue(null),
    closeOpenTransaction: vi
      .fn()
      .mockResolvedValue({ transaction: null, affected: 0 }),
    deleteTransactionWithElements: vi.fn().mockResolvedValue(undefined),
    getConsecutiveLosses: vi.fn().mockResolvedValue(0),
    getCurrentBalance: vi.fn().mockResolvedValue("1000.00"),
    getAccountSnapshot: vi.fn().mockResolvedValue({
      currentBalance: "1000.00",
      consecutiveLosses: 0,
    }),
    getStatistics: vi.fn().mockResolvedValue({}),
    getUniqueTradingPairs: vi.fn().mockResolvedValue([]),
    updateUserInitialBalance: vi.fn().mockResolvedValue(undefined),
    getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "1000" }),
    getAccountById: vi.fn().mockResolvedValue({
      id: 1,
      userId: 1,
      name: "Test Account",
      notes: null,
      initialBalance: "1000",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    runInSqliteTransaction: vi
      .fn()
      .mockImplementation(async (op: (db: unknown) => Promise<unknown>) =>
        op(undefined)
      ),
    ...overrides,
  };
}

async function setupCreateCaller() {
  vi.resetModules();

  const createTransactionWithElements = vi
    .fn()
    .mockImplementation(async data => ({
      id: 1,
      status: data.status ?? "open",
      userId: data.userId,
      accountBalance: data.accountBalance ?? null,
      tradingPair: data.tradingPair,
      timeFrame: data.timeFrame,
      startTime: data.startTime,
      endTime: data.endTime ?? null,
      direction: data.direction,
      tradingLogic: data.tradingLogic,
      context: data.context,
      tradeItems: data.tradeItems,
      outcome: data.outcome ?? null,
      consecutiveLosses: data.consecutiveLosses ?? 0,
      riskRewardRatio: data.riskRewardRatio ?? null,
      returnAmount: data.returnAmount ?? null,
      entryPrice: data.entryPrice ?? null,
      positionSizeUsdt: data.positionSizeUsdt ?? null,
      plannedStopLossPrice: data.plannedStopLossPrice ?? null,
      plannedTakeProfitPrice: data.plannedTakeProfitPrice ?? null,
      plannedRiskRewardRatio: data.plannedRiskRewardRatio ?? null,
      exitPrice: data.exitPrice ?? null,
      tvUrl: data.tvUrl ?? null,
      reviewFeedback: null,
      reviewChartUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

  vi.doMock("./db", () =>
    buildDbMock({
      createTransactionWithElements,
    })
  );

  const { appRouter } = await import("./routers");

  return {
    caller: appRouter.createCaller(createAuthContext()),
    createTransactionWithElements,
  };
}

async function setupCloseCaller(options?: {
  status?: "open" | "closed" | "reviewed";
  startTime?: number;
  currentBalance?: string;
  consecutiveLosses?: number;
}) {
  vi.resetModules();

  // Use an accountId distinct from id/userId so tests can detect
  // regressions that pass the wrong identifier to getAccountById.
  const TRANSACTION_ACCOUNT_ID = 7;

  const getTransactionById = vi.fn().mockResolvedValue({
    id: 42,
    userId: 1,
    accountId: TRANSACTION_ACCOUNT_ID,
    status: options?.status ?? "open",
    accountBalance: null,
    tradingPair: "BTCUSDT",
    timeFrame: "1H",
    startTime: options?.startTime ?? 1000,
    endTime: null,
    direction: "long",
    tradingLogic: "test",
    context: "test",
    tradeItems: [],
    outcome: null,
    consecutiveLosses: 0,
    riskRewardRatio: null,
    returnAmount: null,
    // Planned setup: entry=100, SL=94, size=1000, TP=110 -> planned R/R = 10/6 = 1.67
    // Used by close tests below to drive deterministic actual R/R and return math.
    entryPrice: "100.00000000",
    positionSizeUsdt: "1000.00",
    plannedStopLossPrice: "94.00000000",
    plannedTakeProfitPrice: "110.00000000",
    plannedRiskRewardRatio: "1.67",
    exitPrice: null,
    tvUrl: null,
    reviewFeedback: null,
    reviewChartUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const updateTransaction = vi
    .fn()
    .mockImplementation(async (id: number, userId: number, data: object) => ({
      id,
      userId,
      ...data,
    }));

  const closeOpenTransaction = vi
    .fn()
    .mockImplementation(async (id: number, userId: number, data: object) => ({
      transaction: { id, userId, status: "closed", ...data },
      affected: 1,
    }));

  const getAccountById = vi.fn().mockResolvedValue({
    id: TRANSACTION_ACCOUNT_ID,
    userId: 1,
    name: "Test Account",
    notes: null,
    initialBalance: "1000",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  vi.doMock("./db", () =>
    buildDbMock({
      getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "1000" }),
      getCurrentBalance: vi
        .fn()
        .mockResolvedValue(options?.currentBalance ?? "1000.00"),
      getConsecutiveLosses: vi
        .fn()
        .mockResolvedValue(options?.consecutiveLosses ?? 0),
      getAccountSnapshot: vi.fn().mockResolvedValue({
        currentBalance: options?.currentBalance ?? "1000.00",
        consecutiveLosses: options?.consecutiveLosses ?? 0,
      }),
      getAccountById,
      getTransactionById,
      updateTransaction,
      closeOpenTransaction,
      createTransactionWithElements: vi.fn().mockImplementation(async data => ({
        id: 1,
        status: data.status ?? "open",
        userId: data.userId,
        accountBalance: data.accountBalance ?? null,
        tradingPair: data.tradingPair,
        timeFrame: data.timeFrame,
        startTime: data.startTime,
        endTime: data.endTime ?? null,
        direction: data.direction,
        tradingLogic: data.tradingLogic,
        context: data.context,
        tradeItems: data.tradeItems,
        outcome: data.outcome ?? null,
        consecutiveLosses: data.consecutiveLosses ?? 0,
        riskRewardRatio: data.riskRewardRatio ?? null,
        returnAmount: data.returnAmount ?? null,
        entryPrice: data.entryPrice ?? null,
        positionSizeUsdt: data.positionSizeUsdt ?? null,
        plannedStopLossPrice: data.plannedStopLossPrice ?? null,
        plannedTakeProfitPrice: data.plannedTakeProfitPrice ?? null,
        plannedRiskRewardRatio: data.plannedRiskRewardRatio ?? null,
        exitPrice: data.exitPrice ?? null,
        tvUrl: data.tvUrl ?? null,
        reviewFeedback: null,
        reviewChartUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    })
  );

  const { appRouter: mockedRouter } = await import("./routers");

  return {
    caller: mockedRouter.createCaller(createAuthContext()) as any,
    getTransactionById,
    getAccountById,
    updateTransaction,
    closeOpenTransaction,
    transactionAccountId: TRANSACTION_ACCOUNT_ID,
  };
}

async function setupGetFormDefaultsCaller() {
  vi.resetModules();

  vi.doMock("./db", () =>
    buildDbMock({
      getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "1000" }),
      getCurrentBalance: vi.fn().mockResolvedValue("1050"),
      getConsecutiveLosses: vi.fn().mockResolvedValue(2),
      getAccountSnapshot: vi
        .fn()
        .mockResolvedValue({ currentBalance: "1050", consecutiveLosses: 2 }),
    })
  );

  const { appRouter } = await import("./routers");
  return appRouter.createCaller(createAuthContext());
}

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

function runStatsScenario(
  fileName: string,
  rows: Array<{
    status: string;
    outcome: "win" | "loss" | "breakeven";
    returnAmount: string;
    createdAt: number;
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
        `db.prepare("INSERT INTO transactions (userId, accountId, status, accountBalance, tradingPair, timeFrame, startTime, endTime, direction, tradingLogic, outcome, returnAmount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(1, 1, ${JSON.stringify(row.status)}, '1000.00', 'BTCUSDT', '1H', ${row.createdAt - 60000}, ${row.createdAt}, 'long', 'Test trade', ${JSON.stringify(row.outcome)}, ${JSON.stringify(row.returnAmount)}, ${row.createdAt}, ${row.createdAt});`
    )
    .join("\n");

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', tradeItems TEXT NOT NULL DEFAULT '[]', outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, entryPrice TEXT, positionSizeUsdt TEXT, plannedStopLossPrice TEXT, plannedTakeProfitPrice TEXT, plannedRiskRewardRatio TEXT, exitPrice TEXT, tvUrl TEXT, marketCycle TEXT, transactionType TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    ${inserts}
    const { getCurrentBalance, getConsecutiveLosses, getStatistics } = await import(${JSON.stringify(dbModuleUrl)});
    const currentBalance = await getCurrentBalance(1, '1000.00');
    const consecutiveLosses = await getConsecutiveLosses(1);
    const statistics = await getStatistics(1, '1000.00');
    db.close();
    console.log(JSON.stringify({ currentBalance, consecutiveLosses, statistics }));
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
    currentBalance: string;
    consecutiveLosses: number;
    statistics: {
      winCount: number;
      lossCount: number;
      breakevenCount: number;
      totalTrades: number;
      totalReward: number;
      latestBalance: number;
    };
  };

  rmSync(databasePath);

  return result;
}

function runUpdateScenario(
  fileName: string,
  options: {
    status: "open" | "closed" | "reviewed";
    updateInput: Record<string, unknown>;
    reviewFeedback?: string | null;
    reviewChartUrl?: string | null;
    outcome?: "win" | "loss" | "breakeven";
  }
) {
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const databasePath = join(tmpDir, fileName);
  if (existsSync(databasePath)) {
    rmSync(databasePath);
  }

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', tradeItems TEXT NOT NULL DEFAULT '[]', outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, entryPrice TEXT, positionSizeUsdt TEXT, plannedStopLossPrice TEXT, plannedTakeProfitPrice TEXT, plannedRiskRewardRatio TEXT, exitPrice TEXT, tvUrl TEXT, marketCycle TEXT, transactionType TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.prepare("INSERT INTO transactions (id, userId, accountId, status, accountBalance, tradingPair, timeFrame, startTime, endTime, direction, tradingLogic, outcome, consecutiveLosses, riskRewardRatio, returnAmount, tvUrl, reviewFeedback, reviewChartUrl, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(1, 1, 1, ${JSON.stringify(options.status)}, '1000.00', 'BTCUSDT', '1H', 1000, 2000, 'long', 'Initial logic', ${JSON.stringify(options.outcome ?? "win")}, 0, '2.0', '50.00', null, ${JSON.stringify(options.reviewFeedback ?? null)}, ${JSON.stringify(options.reviewChartUrl ?? null)}, 1000, 1000);
    const { appRouter } = await import(${JSON.stringify(pathToFileURL(join(repoRoot, "server", "routers.ts")).href)});
    const caller = appRouter.createCaller({
      req: {},
      res: {},
      user: {
        id: 1,
        openId: 'test-open-id',
        name: 'Test User',
        email: 'test@example.com',
        loginMethod: 'anonymous',
        role: 'user',
        initialBalance: '1000.00',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    });

    let result = null;
    let error = null;
    try {
      result = await caller.transaction.update(${JSON.stringify(options.updateInput)});
    } catch (err) {
      error = {
        message: err instanceof Error ? err.message : String(err),
        code: typeof err === 'object' && err !== null && 'code' in err ? err.code : null,
      };
    }

    const transaction = db.prepare("SELECT id, status, tradingPair, timeFrame, tradingLogic, context, tradeItems, outcome, reviewFeedback, reviewChartUrl FROM transactions WHERE id = 1").get();
    db.close();
    console.log(JSON.stringify({ result, error, transaction }));
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
    result: unknown;
    error: { message: string; code: string | null } | null;
    transaction: {
      id: number;
      status: "open" | "closed" | "reviewed";
      tradingPair: string;
      timeFrame: string;
      tradingLogic: string;
      context: string;
      tradeItems: string;
      outcome: "win" | "loss" | "breakeven";
      reviewFeedback: string | null;
      reviewChartUrl: string | null;
    };
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
        "task-4-current-balance.sqlite",
        "task-4-consecutive-losses.sqlite",
        "task-4-statistics.sqlite",
        "task-10-open-entry-edit.sqlite",
        "task-10-closed-entry-lock.sqlite",
        "task-10-closed-review-transition.sqlite",
        "task-10-open-review-reject.sqlite",
        "task-10-reviewed-review-edit.sqlite",
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

describe("statistics exclude open trades", () => {
  it("getCurrentBalance excludes open trades", () => {
    const result = runStatsScenario("task-4-current-balance.sqlite", [
      {
        status: "closed",
        outcome: "loss",
        returnAmount: "-50.00",
        createdAt: 1000,
      },
      {
        status: "open",
        outcome: "win",
        returnAmount: "300.00",
        createdAt: 2000,
      },
      {
        status: "reviewed",
        outcome: "win",
        returnAmount: "100.00",
        createdAt: 3000,
      },
    ]);

    expect(result.currentBalance).toBe("1050.00");
  });

  it("getConsecutiveLosses ignores open trades", () => {
    const result = runStatsScenario("task-4-consecutive-losses.sqlite", [
      {
        status: "closed",
        outcome: "win",
        returnAmount: "25.00",
        createdAt: 1000,
      },
      {
        status: "closed",
        outcome: "loss",
        returnAmount: "-20.00",
        createdAt: 2000,
      },
      {
        status: "reviewed",
        outcome: "loss",
        returnAmount: "-10.00",
        createdAt: 3000,
      },
      {
        status: "open",
        outcome: "loss",
        returnAmount: "-15.00",
        createdAt: 4000,
      },
    ]);

    expect(result.consecutiveLosses).toBe(2);
  });

  it("getStatistics excludes open trades", () => {
    const result = runStatsScenario("task-4-statistics.sqlite", [
      {
        status: "closed",
        outcome: "win",
        returnAmount: "120.00",
        createdAt: 1000,
      },
      {
        status: "open",
        outcome: "loss",
        returnAmount: "-80.00",
        createdAt: 2000,
      },
      {
        status: "reviewed",
        outcome: "breakeven",
        returnAmount: "0.00",
        createdAt: 3000,
      },
    ]);

    expect(result.statistics.winCount).toBe(1);
    expect(result.statistics.lossCount).toBe(0);
    expect(result.statistics.breakevenCount).toBe(1);
    expect(result.statistics.totalTrades).toBe(2);
    expect(result.statistics.totalReward).toBe(120);
    expect(result.statistics.latestBalance).toBe(1120);
  });
});

describe("transaction.update lifecycle rules", () => {
  it("open trade allows entry field editing", () => {
    const result = runUpdateScenario("task-10-open-entry-edit.sqlite", {
      status: "open",
      updateInput: {
        id: 1,
        tradingPair: "ethusdt",
        timeFrame: "4H",
        context: "Updated context",
        tradeItems: ["breakout", "retest"],
      },
    });

    expect(result.error).toBeNull();
    expect(result.transaction).toMatchObject({
      status: "open",
      tradingPair: "ETHUSDT",
      timeFrame: "4H",
      tradingLogic: "Updated context",
      context: "Updated context",
      tradeItems: '["breakout","retest"]',
    });
  });

  it("closed trade rejects entry field changes", () => {
    const result = runUpdateScenario("task-10-closed-entry-lock.sqlite", {
      status: "closed",
      outcome: "win",
      updateInput: {
        id: 1,
        outcome: "loss",
      },
    });

    expect(result.error).toMatchObject({ code: "BAD_REQUEST" });
    expect(result.transaction).toMatchObject({
      status: "closed",
      outcome: "win",
    });
  });

  it("review on closed trade transitions status to reviewed", () => {
    const result = runUpdateScenario(
      "task-10-closed-review-transition.sqlite",
      {
        status: "closed",
        updateInput: {
          id: 1,
          reviewFeedback: "Post-trade review complete",
        },
      }
    );

    expect(result.error).toBeNull();
    expect(result.transaction).toMatchObject({
      status: "reviewed",
      reviewFeedback: "Post-trade review complete",
    });
  });

  it("review on open trade is rejected", () => {
    const result = runUpdateScenario("task-10-open-review-reject.sqlite", {
      status: "open",
      updateInput: {
        id: 1,
        reviewFeedback: "Should fail",
      },
    });

    expect(result.error).toMatchObject({ code: "BAD_REQUEST" });
    expect(result.transaction).toMatchObject({
      status: "open",
      reviewFeedback: null,
    });
  });

  it("reviewed trade allows review field edits", () => {
    const result = runUpdateScenario("task-10-reviewed-review-edit.sqlite", {
      status: "reviewed",
      reviewFeedback: "Initial review",
      reviewChartUrl: "https://example.com/old",
      updateInput: {
        id: 1,
        reviewFeedback: "Updated review",
        reviewChartUrl: "https://example.com/new",
      },
    });

    expect(result.error).toBeNull();
    expect(result.transaction).toMatchObject({
      status: "reviewed",
      reviewFeedback: "Updated review",
      reviewChartUrl: "https://example.com/new",
    });
  });
});

describe("transaction.close", () => {
  it("closes an open trade and computes returnAmount + actual R/R from exitPrice", async () => {
    const {
      caller,
      closeOpenTransaction,
      getAccountById,
      transactionAccountId,
    } = await setupCloseCaller();

    // entry=100, size=1000, SL=94, exit=115
    //   return = 1000 * (115-100)/100 = 150.00
    //   actual R/R = (115-100)/(100-94) = 15/6 = 2.50
    const result = await caller.transaction.close({
      id: 42,
      endTime: 2000,
      exitPrice: "115",
    });

    expect(closeOpenTransaction).toHaveBeenCalledOnce();
    // Regression guard: balance lookup must use the transaction's own
    // accountId, not the user id or any ambient account context.
    expect(getAccountById).toHaveBeenCalledWith(transactionAccountId, 1);
    expect(result).toMatchObject({
      id: 42,
      status: "closed",
      endTime: 2000,
      exitPrice: "115.00000000",
      outcome: "win",
      riskRewardRatio: "2.50",
      returnAmount: "150.00",
      accountBalance: "1150.00",
      consecutiveLosses: 0,
    });
  });

  it("calculates accountBalance and consecutiveLosses when closing at a loss", async () => {
    const { caller, closeOpenTransaction } = await setupCloseCaller({
      currentBalance: "900.00",
      consecutiveLosses: 1,
    });

    // entry=100, size=1000, exit=95 -> return = 1000 * (95-100)/100 = -50.00 -> loss
    await caller.transaction.close({
      id: 42,
      endTime: 2500,
      exitPrice: "95",
    });

    expect(closeOpenTransaction).toHaveBeenCalledWith(
      42,
      1,
      expect.objectContaining({
        accountBalance: "850.00",
        consecutiveLosses: 2,
        outcome: "loss",
        returnAmount: "-50.00",
      })
    );
  });

  it("fails with TRPCError when trade is already closed", async () => {
    const { caller, closeOpenTransaction } = await setupCloseCaller({
      status: "closed",
    });

    await expect(
      caller.transaction.close({
        id: 42,
        endTime: 2000,
        exitPrice: "115",
      })
    ).rejects.toBeInstanceOf(TRPCError);

    expect(closeOpenTransaction).not.toHaveBeenCalled();
  });

  it("validates that endTime is greater than startTime", async () => {
    const { caller, closeOpenTransaction } = await setupCloseCaller({
      startTime: 3000,
    });

    await expect(
      caller.transaction.close({
        id: 42,
        endTime: 3000,
        exitPrice: "115",
      })
    ).rejects.toBeInstanceOf(TRPCError);

    expect(closeOpenTransaction).not.toHaveBeenCalled();
  });
});

function runListScenario(
  fileName: string,
  rows: Array<{
    status: string;
    endTime: number | null;
    createdAt: number;
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
        `db.prepare("INSERT INTO transactions (userId, accountId, status, accountBalance, tradingPair, timeFrame, startTime, endTime, direction, tradingLogic, outcome, returnAmount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(1, 1, ${JSON.stringify(row.status)}, '1000.00', 'BTCUSDT', '1H', ${row.createdAt - 60000}, ${row.endTime === null ? "null" : row.endTime}, 'long', 'Test trade', 'win', '100.00', ${row.createdAt}, ${row.createdAt});`
    )
    .join("\n");

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', tradeItems TEXT NOT NULL DEFAULT '[]', outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, entryPrice TEXT, positionSizeUsdt TEXT, plannedStopLossPrice TEXT, plannedTakeProfitPrice TEXT, plannedRiskRewardRatio TEXT, exitPrice TEXT, tvUrl TEXT, marketCycle TEXT, transactionType TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    ${inserts}
    const { getTransactionsByUserId } = await import(${JSON.stringify(dbModuleUrl)});
    const allTransactions = await getTransactionsByUserId(1);
    const openTransactions = await getTransactionsByUserId(1, { status: 'open' });
    const closedTransactions = await getTransactionsByUserId(1, { status: 'closed' });
    const reviewedTransactions = await getTransactionsByUserId(1, { status: 'reviewed' });
    const sortedByEndTimeDesc = await getTransactionsByUserId(1, { sortBy: 'endTime', sortOrder: 'desc' });
    const sortedByEndTimeAsc = await getTransactionsByUserId(1, { sortBy: 'endTime', sortOrder: 'asc' });
    db.close();
    console.log(JSON.stringify({ allTransactions, openTransactions, closedTransactions, reviewedTransactions, sortedByEndTimeDesc, sortedByEndTimeAsc }));
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
    allTransactions: Array<{
      id: number;
      status: string;
      endTime: number | null;
    }>;
    openTransactions: Array<{ id: number; status: string }>;
    closedTransactions: Array<{ id: number; status: string }>;
    reviewedTransactions: Array<{ id: number; status: string }>;
    sortedByEndTimeDesc: Array<{
      id: number;
      status: string;
      endTime: number | null;
    }>;
    sortedByEndTimeAsc: Array<{
      id: number;
      status: string;
      endTime: number | null;
    }>;
  };

  rmSync(databasePath);

  return result;
}

function runCloseLifecycleScenario(fileName: string) {
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const databasePath = join(tmpDir, fileName);
  if (existsSync(databasePath)) {
    rmSync(databasePath);
  }

  // Use a userId distinct from accountId so the test detects the regression
  // where ctx.user.id was passed where accountId was expected.
  const USER_ID = 7;
  const ACCOUNT_ID = 42;
  const INITIAL_BALANCE = "1000.00";

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec(\`
      CREATE TABLE users (id INTEGER PRIMARY KEY, openId TEXT, name TEXT, email TEXT, loginMethod TEXT, role TEXT, initialBalance TEXT, activeTradingSystemId INTEGER, createdAt INTEGER, updatedAt INTEGER, lastSignedIn INTEGER);
      CREATE TABLE accounts (id INTEGER PRIMARY KEY, userId INTEGER NOT NULL, name TEXT NOT NULL, notes TEXT, initialBalance TEXT NOT NULL, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));
      CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', tradeItems TEXT NOT NULL DEFAULT '[]', outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, entryPrice TEXT, positionSizeUsdt TEXT, plannedStopLossPrice TEXT, plannedTakeProfitPrice TEXT, plannedRiskRewardRatio TEXT, exitPrice TEXT, tvUrl TEXT, marketCycle TEXT, transactionType TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));
    \`);
    db.prepare("INSERT INTO users (id, openId, name, email, loginMethod, role, initialBalance, createdAt, updatedAt, lastSignedIn) VALUES (?, 'u', 'u', 'u@e', 'anonymous', 'user', ?, 0, 0, 0)").run(${USER_ID}, ${JSON.stringify(INITIAL_BALANCE)});
    db.prepare("INSERT INTO accounts (id, userId, name, initialBalance, createdAt, updatedAt) VALUES (?, ?, 'Main', ?, 0, 0)").run(${ACCOUNT_ID}, ${USER_ID}, ${JSON.stringify(INITIAL_BALANCE)});
    // entry=100, size=1000, SL=95: long exit=110 yields +100 (win, R/R=2.00); exit=95 yields -50 (loss, R/R=-1.00)
    db.prepare("INSERT INTO transactions (id, userId, accountId, status, tradingPair, timeFrame, startTime, direction, tradingLogic, entryPrice, positionSizeUsdt, plannedStopLossPrice, plannedTakeProfitPrice, plannedRiskRewardRatio, createdAt, updatedAt) VALUES (?, ?, ?, 'open', 'BTCUSDT', '1H', 1000, 'long', 'first', '100.00000000', '1000.00', '95.00000000', '110.00000000', '2.00', 1000, 1000)").run(101, ${USER_ID}, ${ACCOUNT_ID});
    db.prepare("INSERT INTO transactions (id, userId, accountId, status, tradingPair, timeFrame, startTime, direction, tradingLogic, entryPrice, positionSizeUsdt, plannedStopLossPrice, plannedTakeProfitPrice, plannedRiskRewardRatio, createdAt, updatedAt) VALUES (?, ?, ?, 'open', 'BTCUSDT', '1H', 1000, 'long', 'second', '100.00000000', '1000.00', '95.00000000', '110.00000000', '2.00', 2000, 2000)").run(102, ${USER_ID}, ${ACCOUNT_ID});

    const { appRouter } = await import(${JSON.stringify(pathToFileURL(join(repoRoot, "server", "routers.ts")).href)});
    const ctx = {
      req: {},
      res: {},
      user: {
        id: ${USER_ID},
        openId: 'test-open-id',
        name: 'Test User',
        email: 'test@example.com',
        loginMethod: 'anonymous',
        role: 'user',
        initialBalance: ${JSON.stringify(INITIAL_BALANCE)},
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    };
    const caller = appRouter.createCaller(ctx);

    // First trade closes as a win for +100 (entry 100 -> exit 110, size 1000)
    const first = await caller.transaction.close({
      id: 101,
      endTime: 2000,
      exitPrice: '110',
    });

    // Second trade closes as a loss for -50 (entry 100 -> exit 95, size 1000)
    const second = await caller.transaction.close({
      id: 102,
      endTime: 3000,
      exitPrice: '95',
    });

    db.close();
    console.log(JSON.stringify({ first, second }));
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
    first: {
      accountBalance: string;
      consecutiveLosses: number;
    };
    second: {
      accountBalance: string;
      consecutiveLosses: number;
    };
  };

  rmSync(databasePath);

  return result;
}

function runConcurrentCloseScenario(fileName: string) {
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const databasePath = join(tmpDir, fileName);
  if (existsSync(databasePath)) {
    rmSync(databasePath);
  }

  const USER_ID = 9;
  const ACCOUNT_ID = 77;
  const INITIAL_BALANCE = "1000.00";

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec(\`
      CREATE TABLE users (id INTEGER PRIMARY KEY, openId TEXT, name TEXT, email TEXT, loginMethod TEXT, role TEXT, initialBalance TEXT, activeTradingSystemId INTEGER, createdAt INTEGER, updatedAt INTEGER, lastSignedIn INTEGER);
      CREATE TABLE accounts (id INTEGER PRIMARY KEY, userId INTEGER NOT NULL, name TEXT NOT NULL, notes TEXT, initialBalance TEXT NOT NULL, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));
      CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', tradeItems TEXT NOT NULL DEFAULT '[]', outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, entryPrice TEXT, positionSizeUsdt TEXT, plannedStopLossPrice TEXT, plannedTakeProfitPrice TEXT, plannedRiskRewardRatio TEXT, exitPrice TEXT, tvUrl TEXT, marketCycle TEXT, transactionType TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));
    \`);
    db.prepare("INSERT INTO users (id, openId, name, email, loginMethod, role, initialBalance, createdAt, updatedAt, lastSignedIn) VALUES (?, 'u', 'u', 'u@e', 'anonymous', 'user', ?, 0, 0, 0)").run(${USER_ID}, ${JSON.stringify(INITIAL_BALANCE)});
    db.prepare("INSERT INTO accounts (id, userId, name, initialBalance, createdAt, updatedAt) VALUES (?, ?, 'Main', ?, 0, 0)").run(${ACCOUNT_ID}, ${USER_ID}, ${JSON.stringify(INITIAL_BALANCE)});
    // entry=100, size=1000, SL=95: long exit=110 -> +100 (win)
    db.prepare("INSERT INTO transactions (id, userId, accountId, status, tradingPair, timeFrame, startTime, direction, tradingLogic, entryPrice, positionSizeUsdt, plannedStopLossPrice, plannedTakeProfitPrice, plannedRiskRewardRatio, createdAt, updatedAt) VALUES (?, ?, ?, 'open', 'BTCUSDT', '1H', 1000, 'long', 'race', '100.00000000', '1000.00', '95.00000000', '110.00000000', '2.00', 1000, 1000)").run(500, ${USER_ID}, ${ACCOUNT_ID});

    const { appRouter } = await import(${JSON.stringify(pathToFileURL(join(repoRoot, "server", "routers.ts")).href)});
    const ctx = {
      req: {},
      res: {},
      user: {
        id: ${USER_ID},
        openId: 'test-open-id',
        name: 'Test User',
        email: 'test@example.com',
        loginMethod: 'anonymous',
        role: 'user',
        initialBalance: ${JSON.stringify(INITIAL_BALANCE)},
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    };
    const caller = appRouter.createCaller(ctx);

    // Fire two close requests concurrently against the same open trade.
    // exit=110 -> +100 win
    const closePayload = {
      id: 500,
      endTime: 2000,
      exitPrice: '110',
    };

    const settlements = await Promise.allSettled([
      caller.transaction.close(closePayload),
      caller.transaction.close(closePayload),
    ]);

    const summary = settlements.map(s => {
      if (s.status === 'fulfilled') {
        return { status: 'fulfilled', accountBalance: s.value && s.value.accountBalance };
      }
      const err = s.reason;
      return {
        status: 'rejected',
        code: err && err.code ? err.code : null,
        message: err && err.message ? err.message : String(err),
      };
    });

    const finalRow = db.prepare("SELECT status, accountBalance, returnAmount FROM transactions WHERE id = 500").get();
    db.close();
    console.log(JSON.stringify({ summary, finalRow }));
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
    summary: Array<{
      status: "fulfilled" | "rejected";
      accountBalance?: string | null;
      code?: string | null;
      message?: string;
    }>;
    finalRow: {
      status: string;
      accountBalance: string;
      returnAmount: string;
    };
  };

  rmSync(databasePath);

  return result;
}

describe("transaction.close concurrency", () => {
  it("two concurrent close requests result in exactly one success", () => {
    const result = runConcurrentCloseScenario("close-concurrent.sqlite");

    const fulfilled = result.summary.filter(s => s.status === "fulfilled");
    const rejected = result.summary.filter(s => s.status === "rejected");

    // Exactly one wins; the other is rejected with CONFLICT or BAD_REQUEST.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(["CONFLICT", "BAD_REQUEST"]).toContain(rejected[0].code);

    // Returned balance includes one +100, never two.
    expect(fulfilled[0].accountBalance).toBe("1100.00");

    // Persisted row reflects a single close — balance = 1000 + 100.
    expect(result.finalRow.status).toBe("closed");
    expect(result.finalRow.accountBalance).toBe("1100.00");
    expect(result.finalRow.returnAmount).toBe("100.00");
  });
});

describe("transaction.close cumulative balance regression", () => {
  it("computes balance and consecutiveLosses from the account, not the user", () => {
    const result = runCloseLifecycleScenario("close-cumulative.sqlite");

    // After first close (win, +100): balance = 1000 + 100 = 1100, streak reset to 0
    expect(result.first.accountBalance).toBe("1100.00");
    expect(result.first.consecutiveLosses).toBe(0);

    // After second close (loss, -50): balance = 1100 + (-50) = 1050
    // (proves cumulative — the bug would have produced 1000 + (-50) = 950)
    expect(result.second.accountBalance).toBe("1050.00");
    // streak is 1 (one loss after the prior win), proving real history is consulted
    expect(result.second.consecutiveLosses).toBe(1);
  });
});

describe("transaction.list status-aware filtering", () => {
  it("filters transactions by status correctly", () => {
    const result = runListScenario("task-11-status-filter.sqlite", [
      { status: "open", endTime: null, createdAt: 1000 },
      { status: "closed", endTime: 2000, createdAt: 2000 },
      { status: "reviewed", endTime: 3000, createdAt: 3000 },
      { status: "open", endTime: null, createdAt: 4000 },
      { status: "closed", endTime: 5000, createdAt: 5000 },
    ]);

    // All transactions
    expect(result.allTransactions).toHaveLength(5);

    // Open filter
    expect(result.openTransactions).toHaveLength(2);
    expect(result.openTransactions.every(tx => tx.status === "open")).toBe(
      true
    );

    // Closed filter
    expect(result.closedTransactions).toHaveLength(2);
    expect(result.closedTransactions.every(tx => tx.status === "closed")).toBe(
      true
    );

    // Reviewed filter
    expect(result.reviewedTransactions).toHaveLength(1);
    expect(
      result.reviewedTransactions.every(tx => tx.status === "reviewed")
    ).toBe(true);
  });

  it("sorts by endTime with NULLS LAST for open trades (desc)", () => {
    const result = runListScenario("task-11-endtime-sort-desc.sqlite", [
      { status: "open", endTime: null, createdAt: 1000 },
      { status: "closed", endTime: 5000, createdAt: 2000 },
      { status: "reviewed", endTime: 3000, createdAt: 3000 },
      { status: "open", endTime: null, createdAt: 4000 },
      { status: "closed", endTime: 4000, createdAt: 5000 },
    ]);

    // When sorting by endTime desc, NULL values should be LAST
    // So order should be: 5000, 4000, 3000, null, null
    const endTimes = result.sortedByEndTimeDesc.map(tx => tx.endTime);
    expect(endTimes[0]).toBe(5000);
    expect(endTimes[1]).toBe(4000);
    expect(endTimes[2]).toBe(3000);
    expect(endTimes[3]).toBeNull();
    expect(endTimes[4]).toBeNull();
  });

  it("sorts by endTime with NULLS LAST for open trades (asc)", () => {
    const result = runListScenario("task-11-endtime-sort-asc.sqlite", [
      { status: "open", endTime: null, createdAt: 1000 },
      { status: "closed", endTime: 5000, createdAt: 2000 },
      { status: "reviewed", endTime: 3000, createdAt: 3000 },
      { status: "open", endTime: null, createdAt: 4000 },
      { status: "closed", endTime: 4000, createdAt: 5000 },
    ]);

    const endTimes = result.sortedByEndTimeAsc.map(tx => tx.endTime);
    expect(endTimes[0]).toBe(3000);
    expect(endTimes[1]).toBe(4000);
    expect(endTimes[2]).toBe(5000);
    expect(endTimes[3]).toBeNull();
    expect(endTimes[4]).toBeNull();
  });
});

describe("transaction.getFormDefaults", () => {
  it("excludes open trades from balance and streaks", async () => {
    const caller = await setupGetFormDefaultsCaller();
    const result = await caller.transaction.getFormDefaults({ accountId: 1 });

    // The mocked stat functions already exclude open trades (Task 4)
    // Verify the values match what the mocked stat functions return
    expect(result.currentBalance).toBe("1050");
    expect(result.consecutiveLosses).toBe(2);
    expect(result.initialBalance).toBe("1000");
  });
});

describe("transaction.create open-only lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates successfully with planning fields and computes planned R/R", async () => {
    const { caller, createTransactionWithElements } = await setupCreateCaller();

    const result = await caller.transaction.create({
      accountId: 1,
      tradingPair: "btcusdt",
      direction: "long",
      timeFrame: "4H",
      marketCycle: "Trading Range",
      transactionType: "Trend",
      startTime: Date.now(),
      context: "Breakout and retest",
      tradeItems: ["breakout", "retest", "volume expansion"],
      entryPrice: "100",
      positionSizeUsdt: "1000",
      plannedStopLossPrice: "95",
      plannedTakeProfitPrice: "110",
    });

    expect(result.tradingPair).toBe("BTCUSDT");
    expect(createTransactionWithElements).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "open",
        tradingPair: "BTCUSDT",
        direction: "long",
        timeFrame: "4H",
        context: "Breakout and retest",
        tradeItems: ["breakout", "retest", "volume expansion"],
        tradingLogic: "Breakout and retest",
        entryPrice: "100.00000000",
        positionSizeUsdt: "1000.00",
        plannedStopLossPrice: "95.00000000",
        plannedTakeProfitPrice: "110.00000000",
        plannedRiskRewardRatio: "2.00",
      })
    );
  });

  it("returns status open and null outcome fields", async () => {
    const { caller } = await setupCreateCaller();

    const result = await caller.transaction.create({
      accountId: 1,
      tradingPair: "ETHUSDT",
      direction: "short",
      timeFrame: "1H",
      marketCycle: "Trading Range",
      transactionType: "Trend",
      startTime: Date.now(),
      context: "Rejection at resistance",
      tradeItems: [],
      entryPrice: "2000",
      positionSizeUsdt: "500",
      plannedStopLossPrice: "2100",
      plannedTakeProfitPrice: "1800",
    });

    expect(result.status).toBe("open");
    expect(result.outcome).toBeNull();
    expect(result.returnAmount).toBeNull();
    expect(result.riskRewardRatio).toBeNull();
  });

  it("rejects outcome fields in create input", async () => {
    const { caller, createTransactionWithElements } = await setupCreateCaller();

    const invalidCreateInput = {
      accountId: 1,
      tradingPair: "BTCUSDT",
      direction: "long",
      timeFrame: "4H",
      marketCycle: "Trading Range",
      transactionType: "Trend",
      startTime: Date.now(),
      context: "Trend continuation",
      tradeItems: [],
      entryPrice: "100",
      positionSizeUsdt: "1000",
      plannedStopLossPrice: "95",
      plannedTakeProfitPrice: "110",
      outcome: "win",
      returnAmount: "100",
      riskRewardRatio: "2.0",
    };

    await expect(
      caller.transaction.create(invalidCreateInput as never)
    ).rejects.toThrow(/Unrecognized key/);

    expect(createTransactionWithElements).not.toHaveBeenCalled();
  });

  it("rejects create when planned SL/TP price relationship is invalid", async () => {
    const { caller, createTransactionWithElements } = await setupCreateCaller();

    await expect(
      caller.transaction.create({
        accountId: 1,
        tradingPair: "BTCUSDT",
        direction: "long",
        timeFrame: "4H",
        marketCycle: "Trading Range",
        transactionType: "Trend",
        startTime: Date.now(),
        context: "Invalid plan",
        tradeItems: [],
        entryPrice: "100",
        positionSizeUsdt: "1000",
        plannedStopLossPrice: "105", // above entry — invalid for long
        plannedTakeProfitPrice: "110",
      })
    ).rejects.toThrow(/stop loss/i);

    expect(createTransactionWithElements).not.toHaveBeenCalled();
  });
});
