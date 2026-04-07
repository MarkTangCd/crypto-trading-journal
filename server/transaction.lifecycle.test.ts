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
    activeTradingSystemId: null,
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
    deleteTransactionWithElements: vi.fn().mockResolvedValue(undefined),
    getConsecutiveLosses: vi.fn().mockResolvedValue(0),
    getCurrentBalance: vi.fn().mockResolvedValue("1000.00"),
    getStatistics: vi.fn().mockResolvedValue({}),
    getSystemStatistics: vi.fn().mockResolvedValue([]),
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
    createTradingElement: vi.fn().mockResolvedValue(null),
    getTradingElementById: vi.fn().mockResolvedValue(null),
    getTradingElementsByUserId: vi.fn().mockResolvedValue([]),
    updateTradingElement: vi.fn().mockResolvedValue(null),
    deleteTradingElement: vi.fn().mockResolvedValue(undefined),
    createTradingSystem: vi.fn().mockResolvedValue(null),
    getTradingSystemById: vi.fn().mockResolvedValue(null),
    getTradingSystemsByUserId: vi.fn().mockResolvedValue([]),
    updateTradingSystem: vi.fn().mockResolvedValue(null),
    deleteTradingSystem: vi.fn().mockResolvedValue(undefined),
    activateTradingSystem: vi.fn().mockResolvedValue(undefined),
    deactivateTradingSystem: vi.fn().mockResolvedValue(undefined),
    getActiveTradingSystem: vi.fn().mockResolvedValue(null),
    getTransactionElements: vi.fn().mockResolvedValue([]),
    calculateConfidenceLevel: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

async function setupCreateCaller() {
  vi.resetModules();

  const createTransactionWithElements = vi
    .fn()
    .mockImplementation(async (data, _elementIds) => ({
      id: 1,
      status: data.status ?? "open",
      userId: data.userId,
      tradingSystemId: data.tradingSystemId ?? null,
      accountBalance: data.accountBalance ?? null,
      tradingPair: data.tradingPair,
      timeFrame: data.timeFrame,
      startTime: data.startTime,
      endTime: data.endTime ?? null,
      direction: data.direction,
      tradingLogic: data.tradingLogic,
      outcome: data.outcome ?? null,
      consecutiveLosses: data.consecutiveLosses ?? 0,
      riskRewardRatio: data.riskRewardRatio ?? null,
      returnAmount: data.returnAmount ?? null,
      confidenceLevel: data.confidenceLevel ?? null,
      tvUrl: data.tvUrl ?? null,
      reviewFeedback: null,
      reviewChartUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

  vi.doMock("./db", () =>
    buildDbMock({
      getActiveTradingSystem: vi.fn().mockResolvedValue(null),
      calculateConfidenceLevel: vi.fn().mockResolvedValue(4),
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

  const getTransactionById = vi.fn().mockResolvedValue({
    id: 42,
    userId: 1,
    tradingSystemId: null,
    status: options?.status ?? "open",
    accountBalance: null,
    tradingPair: "BTCUSDT",
    timeFrame: "1H",
    startTime: options?.startTime ?? 1000,
    endTime: null,
    direction: "long",
    tradingLogic: "test",
    outcome: null,
    consecutiveLosses: 0,
    riskRewardRatio: null,
    returnAmount: null,
    confidenceLevel: null,
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

  vi.doMock("./db", () =>
    buildDbMock({
      getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "1000" }),
      getCurrentBalance: vi
        .fn()
        .mockResolvedValue(options?.currentBalance ?? "1000.00"),
      getConsecutiveLosses: vi
        .fn()
        .mockResolvedValue(options?.consecutiveLosses ?? 0),
      getTransactionById,
      updateTransaction,
      getActiveTradingSystem: vi.fn().mockResolvedValue(null),
      calculateConfidenceLevel: vi.fn().mockResolvedValue(4),
      createTransactionWithElements: vi
        .fn()
        .mockImplementation(async (data, _elementIds) => ({
          id: 1,
          status: data.status ?? "open",
          userId: data.userId,
          tradingSystemId: data.tradingSystemId ?? null,
          accountBalance: data.accountBalance ?? null,
          tradingPair: data.tradingPair,
          timeFrame: data.timeFrame,
          startTime: data.startTime,
          endTime: data.endTime ?? null,
          direction: data.direction,
          tradingLogic: data.tradingLogic,
          outcome: data.outcome ?? null,
          consecutiveLosses: data.consecutiveLosses ?? 0,
          riskRewardRatio: data.riskRewardRatio ?? null,
          returnAmount: data.returnAmount ?? null,
          confidenceLevel: data.confidenceLevel ?? null,
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
    updateTransaction,
  };
}

async function setupGetFormDefaultsCaller() {
  vi.resetModules();

  vi.doMock("./db", () =>
    buildDbMock({
      getUserById: vi.fn().mockResolvedValue({ id: 1, initialBalance: "1000" }),
      getCurrentBalance: vi.fn().mockResolvedValue("1050"),
      getConsecutiveLosses: vi.fn().mockResolvedValue(2),
      getActiveTradingSystem: vi.fn().mockResolvedValue({
        id: 1,
        name: "Test System",
        elements: [],
      }),
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
        `db.prepare("INSERT INTO transactions (userId, accountId, tradingSystemId, status, accountBalance, tradingPair, timeFrame, startTime, endTime, direction, tradingLogic, outcome, returnAmount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(1, 1, 1, ${JSON.stringify(row.status)}, '1000.00', 'BTCUSDT', '1H', ${row.createdAt - 60000}, ${row.createdAt}, 'long', 'Test trade', ${JSON.stringify(row.outcome)}, ${JSON.stringify(row.returnAmount)}, ${row.createdAt}, ${row.createdAt});`
    )
    .join("\n");

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec("CREATE TABLE trading_elements (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, confidenceLevel INTEGER NOT NULL DEFAULT 3, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.exec("CREATE TABLE trading_systems (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, name TEXT NOT NULL, notes TEXT, isActive INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.exec("CREATE TABLE trading_system_elements (id INTEGER PRIMARY KEY AUTOINCREMENT, tradingSystemId INTEGER NOT NULL, tradingElementId INTEGER NOT NULL);");
    db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, tradingSystemId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, confidenceLevel INTEGER, tvUrl TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.prepare("INSERT INTO trading_systems (id, userId, name, notes, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(1, 1, 'System A', null, 1, 1000, 1000);
    ${inserts}
    const { getCurrentBalance, getConsecutiveLosses, getStatistics, getSystemStatistics } = await import(${JSON.stringify(dbModuleUrl)});
    const currentBalance = await getCurrentBalance(1, '1000.00');
    const consecutiveLosses = await getConsecutiveLosses(1);
    const statistics = await getStatistics(1, '1000.00');
    const systemStatistics = await getSystemStatistics(1, 1);
    db.close();
    console.log(JSON.stringify({ currentBalance, consecutiveLosses, statistics, systemStatistics }));
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
    systemStatistics: Array<{
      systemId: number;
      totalTrades: number;
      winCount: number;
      lossCount: number;
      breakevenCount: number;
      totalReturn: number;
    }>;
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
    initialElementIds?: number[];
    elementConfidenceLevels?: number[];
  }
) {
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const databasePath = join(tmpDir, fileName);
  if (existsSync(databasePath)) {
    rmSync(databasePath);
  }

  const elementConfidenceLevels = options.elementConfidenceLevels ?? [3, 4, 5];
  const initialElementIds = options.initialElementIds ?? [1];

  const elementInserts = elementConfidenceLevels
    .map(
      (confidenceLevel, index) =>
        `db.prepare("INSERT INTO trading_elements (id, userId, name, description, confidenceLevel) VALUES (?, ?, ?, ?, ?)").run(${index + 1}, 1, ${JSON.stringify(`Element ${index + 1}`)}, null, ${confidenceLevel});`
    )
    .join("\n");

  const transactionElementInserts = initialElementIds
    .map(
      elementId =>
        `db.prepare("INSERT INTO transaction_elements (transactionId, tradingElementId) VALUES (?, ?)").run(1, ${elementId});`
    )
    .join("\n");

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec("CREATE TABLE trading_elements (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, confidenceLevel INTEGER NOT NULL DEFAULT 3, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.exec("CREATE TABLE transaction_elements (id INTEGER PRIMARY KEY AUTOINCREMENT, transactionId INTEGER NOT NULL, tradingElementId INTEGER NOT NULL);");
    db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, tradingSystemId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, confidenceLevel INTEGER, tvUrl TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.prepare("INSERT INTO transactions (id, userId, accountId, tradingSystemId, status, accountBalance, tradingPair, timeFrame, startTime, endTime, direction, tradingLogic, outcome, consecutiveLosses, riskRewardRatio, returnAmount, confidenceLevel, tvUrl, reviewFeedback, reviewChartUrl, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(1, 1, 1, null, ${JSON.stringify(options.status)}, '1000.00', 'BTCUSDT', '1H', 1000, 2000, 'long', 'Initial logic', ${JSON.stringify(options.outcome ?? "win")}, 0, '2.0', '50.00', 3, null, ${JSON.stringify(options.reviewFeedback ?? null)}, ${JSON.stringify(options.reviewChartUrl ?? null)}, 1000, 1000);
    ${elementInserts}
    ${transactionElementInserts}
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
        activeTradingSystemId: null,
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

    const transaction = db.prepare("SELECT id, status, tradingPair, timeFrame, tradingLogic, outcome, confidenceLevel, reviewFeedback, reviewChartUrl FROM transactions WHERE id = 1").get();
    const elements = db.prepare("SELECT tradingElementId FROM transaction_elements WHERE transactionId = 1 ORDER BY tradingElementId").all();
    db.close();
    console.log(JSON.stringify({ result, error, transaction, elements }));
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
      outcome: "win" | "loss" | "breakeven";
      confidenceLevel: number | null;
      reviewFeedback: string | null;
      reviewChartUrl: string | null;
    };
    elements: Array<{ tradingElementId: number }>;
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
        "task-4-system-statistics.sqlite",
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

  it("getSystemStatistics excludes open trades", () => {
    const result = runStatsScenario("task-4-system-statistics.sqlite", [
      {
        status: "closed",
        outcome: "loss",
        returnAmount: "-60.00",
        createdAt: 1000,
      },
      {
        status: "open",
        outcome: "win",
        returnAmount: "200.00",
        createdAt: 2000,
      },
      {
        status: "reviewed",
        outcome: "win",
        returnAmount: "90.00",
        createdAt: 3000,
      },
    ]);

    expect(result.systemStatistics).toHaveLength(1);
    expect(result.systemStatistics[0]).toMatchObject({
      systemId: 1,
      totalTrades: 2,
      winCount: 1,
      lossCount: 1,
      breakevenCount: 0,
      totalReturn: 30,
    });
  });
});

describe("transaction.update lifecycle rules", () => {
  it("open trade allows entry field editing and element updates", () => {
    const result = runUpdateScenario("task-10-open-entry-edit.sqlite", {
      status: "open",
      initialElementIds: [1],
      elementConfidenceLevels: [1, 4, 5],
      updateInput: {
        id: 1,
        tradingPair: "ethusdt",
        timeFrame: "4H",
        tradingLogic: "Updated logic",
        selectedElementIds: [2, 3],
      },
    });

    expect(result.error).toBeNull();
    expect(result.transaction).toMatchObject({
      status: "open",
      tradingPair: "ETHUSDT",
      timeFrame: "4H",
      tradingLogic: "Updated logic",
      confidenceLevel: 4.5,
    });
    expect(result.elements).toEqual([
      { tradingElementId: 2 },
      { tradingElementId: 3 },
    ]);
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
  it("closes an open trade when required fields are provided", async () => {
    const { caller, updateTransaction } = await setupCloseCaller();

    const result = await caller.transaction.close({
      id: 42,
      endTime: 2000,
      outcome: "win",
      riskRewardRatio: "2.5",
      returnAmount: "150.00",
    });

    expect(updateTransaction).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: 42,
      status: "closed",
      endTime: 2000,
      outcome: "win",
      riskRewardRatio: "2.5",
      returnAmount: "150.00",
      accountBalance: "1150.00",
      consecutiveLosses: 0,
    });
  });

  it("calculates accountBalance and consecutiveLosses when closing", async () => {
    const { caller, updateTransaction } = await setupCloseCaller({
      currentBalance: "900.00",
      consecutiveLosses: 1,
    });

    await caller.transaction.close({
      id: 42,
      endTime: 2500,
      outcome: "loss",
      riskRewardRatio: "1.2",
      returnAmount: "-50.00",
    });

    expect(updateTransaction).toHaveBeenCalledWith(
      42,
      1,
      expect.objectContaining({
        status: "closed",
        accountBalance: "850.00",
        consecutiveLosses: 2,
      })
    );
  });

  it("fails with TRPCError when trade is already closed", async () => {
    const { caller, updateTransaction } = await setupCloseCaller({
      status: "closed",
    });

    await expect(
      caller.transaction.close({
        id: 42,
        endTime: 2000,
        outcome: "win",
        riskRewardRatio: "2.0",
        returnAmount: "100.00",
      })
    ).rejects.toBeInstanceOf(TRPCError);

    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("validates that endTime is greater than startTime", async () => {
    const { caller, updateTransaction } = await setupCloseCaller({
      startTime: 3000,
    });

    await expect(
      caller.transaction.close({
        id: 42,
        endTime: 3000,
        outcome: "breakeven",
        riskRewardRatio: "1.0",
        returnAmount: "0.00",
      })
    ).rejects.toBeInstanceOf(TRPCError);

    expect(updateTransaction).not.toHaveBeenCalled();
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
        `db.prepare("INSERT INTO transactions (userId, accountId, tradingSystemId, status, accountBalance, tradingPair, timeFrame, startTime, endTime, direction, tradingLogic, outcome, returnAmount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(1, 1, 1, ${JSON.stringify(row.status)}, '1000.00', 'BTCUSDT', '1H', ${row.createdAt - 60000}, ${row.endTime === null ? "null" : row.endTime}, 'long', 'Test trade', 'win', '100.00', ${row.createdAt}, ${row.createdAt});`
    )
    .join("\n");

  const script = `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL);
    db.exec("CREATE TABLE trading_elements (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, confidenceLevel INTEGER NOT NULL DEFAULT 3, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.exec("CREATE TABLE trading_systems (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, name TEXT NOT NULL, notes TEXT, isActive INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.exec("CREATE TABLE trading_system_elements (id INTEGER PRIMARY KEY AUTOINCREMENT, tradingSystemId INTEGER NOT NULL, tradingElementId INTEGER NOT NULL);");
    db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, accountId INTEGER, tradingSystemId INTEGER, status TEXT NOT NULL DEFAULT 'open', accountBalance TEXT, tradingPair TEXT NOT NULL, timeFrame TEXT NOT NULL, startTime INTEGER NOT NULL, endTime INTEGER, direction TEXT NOT NULL, tradingLogic TEXT NOT NULL, outcome TEXT, consecutiveLosses INTEGER DEFAULT 0, riskRewardRatio TEXT, returnAmount TEXT, confidenceLevel INTEGER, tvUrl TEXT, reviewFeedback TEXT, reviewChartUrl TEXT, createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000), updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000));");
    db.prepare("INSERT INTO trading_systems (id, userId, name, notes, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(1, 1, 'System A', null, 1, 1000, 1000);
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
    expect(result.activeSystem).toEqual({
      id: 1,
      name: "Test System",
      elements: [],
    });
  });
});

describe("transaction.create open-only lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates successfully with only open fields", async () => {
    const { caller, createTransactionWithElements } = await setupCreateCaller();

    const result = await caller.transaction.create({
      tradingPair: "btcusdt",
      direction: "long",
      timeFrame: "4H",
      marketCycle: "Trading Range",
      transactionType: "Trend",
      startTime: Date.now(),
      tradingLogic: "Breakout and retest",
    });

    expect(result.tradingPair).toBe("BTCUSDT");
    expect(createTransactionWithElements).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "open",
        tradingPair: "BTCUSDT",
        direction: "long",
        timeFrame: "4H",
        tradingLogic: "Breakout and retest",
      }),
      []
    );
  });

  it("returns status open and null outcome fields", async () => {
    const { caller } = await setupCreateCaller();

    const result = await caller.transaction.create({
      tradingPair: "ETHUSDT",
      direction: "short",
      timeFrame: "1H",
      marketCycle: "Trading Range",
      transactionType: "Trend",
      startTime: Date.now(),
      tradingLogic: "Rejection at resistance",
    });

    expect(result.status).toBe("open");
    expect(result.outcome).toBeNull();
    expect(result.returnAmount).toBeNull();
    expect(result.riskRewardRatio).toBeNull();
  });

  it("rejects outcome fields in create input", async () => {
    const { caller, createTransactionWithElements } = await setupCreateCaller();

    const invalidCreateInput = {
      tradingPair: "BTCUSDT",
      direction: "long",
      timeFrame: "4H",
      marketCycle: "Trading Range",
      transactionType: "Trend",
      startTime: Date.now(),
      tradingLogic: "Trend continuation",
      outcome: "win",
      returnAmount: "100",
      riskRewardRatio: "2.0",
    };

    await expect(
      caller.transaction.create(invalidCreateInput as never)
    ).rejects.toThrow(/Unrecognized key/);

    expect(createTransactionWithElements).not.toHaveBeenCalled();
  });
});
