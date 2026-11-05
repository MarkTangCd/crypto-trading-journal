// Exchange sync (spec doc-4, Sync algorithm steps 0-11 and Auto-sync): fetch
// everything first, then write fills, trades and the account snapshot in one
// transaction. Arithmetic lives in reconstruct.ts.

import { TRPCError } from "@trpc/server";
import {
  SYNC_ERROR_CODES,
  TRANSIENT_SYNC_ERROR_CODES,
  type SyncErrorCode,
} from "@shared/const";
import type { Account, Fill } from "../../drizzle/schema";
import { decrypt } from "../agents/secrets";
import {
  getAccountById,
  getAccountsByUserId,
  getFillCursors,
  insertFills,
  listFillsByAccount,
  listOpenTradeSymbols,
  runInSqliteTransaction,
  upsertTradesByTradeKey,
  writeSyncAttempt,
  writeSyncFailure,
  writeSyncSuccess,
} from "../db";
import { isZero } from "../_core/decimal";
import type {
  ExchangeAdapter,
  ExchangeConditionalOrder,
  ExchangeCredentials,
  ExchangeFill,
} from "./adapter";
import { createBinanceAdapter } from "./binance";
import { ExchangeError } from "./errors";
import { computeSeeds, reconstruct, type FillRecord } from "./reconstruct";

const HOUR_MS = 60 * 60 * 1000;
const BACKFILL_MS = 30 * 24 * HOUR_MS;
const STALE_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_MS = 60 * 1000;

// Accounts with a run in flight in this process.
const running = new Set<number>();

export interface SyncOptions {
  reason: "manual" | "auto";
  adapter?: ExchangeAdapter;
}

export interface AutoSyncOutcome {
  accountId: number;
  ok: boolean;
  code?: SyncErrorCode;
}

const toFillRecord = (fill: Fill): FillRecord => ({
  source: fill.source,
  fillId: fill.fillId,
  orderId: fill.orderId,
  symbol: fill.symbol,
  positionSide: fill.positionSide,
  side: fill.side,
  price: fill.price,
  qty: fill.qty,
  realizedPnl: fill.realizedPnl,
  commission: fill.commission,
  commissionAsset: fill.commissionAsset,
  feeUsd: fill.feeUsd,
  time: fill.time,
});

const fromExchange = (fill: ExchangeFill): FillRecord => ({
  ...fill,
  source: "exchange",
});

const fillIdentity = (fill: { symbol: string; fillId: string }) =>
  `${fill.symbol}|${fill.fillId}`;

const isTransient = (code: string) =>
  (TRANSIENT_SYNC_ERROR_CODES as readonly string[]).includes(code);

function trpcCodeFor(code: SyncErrorCode): TRPCError["code"] {
  if (code === "unknown") return "INTERNAL_SERVER_ERROR";
  return isTransient(code) ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST";
}

/** Steps 2-9: everything that talks to the exchange, no writes. */
async function fetchAndReconstruct(
  account: Account,
  adapter: ExchangeAdapter,
  credentials: ExchangeCredentials,
  now: number
) {
  const verification = await adapter.verifyKey(credentials);
  if (!verification.ok) {
    throw new ExchangeError(verification.code, "key verification failed");
  }

  const backfill = account.backfillStart === null;
  const windowStart = account.backfillStart ?? now - BACKFILL_MS;
  const incomeCursor = account.incomeCursorAt ?? windowStart;
  const cursors = await getFillCursors(account.id);
  const fillsFrom = (symbol: string) =>
    backfill ? windowStart : (cursors.get(symbol) ?? incomeCursor) - HOUR_MS;

  const discovery = await adapter.discoverSymbols(
    credentials,
    backfill ? windowStart : incomeCursor - HOUR_MS,
    now
  );
  const symbols = new Set([
    ...discovery.symbols,
    ...(await listOpenTradeSymbols(account.id)),
  ]);

  const fetched = new Map<string, ExchangeFill[]>();
  for (const symbol of Array.from(symbols)) {
    fetched.set(
      symbol,
      await adapter.fetchFills(credentials, symbol, fillsFrom(symbol), now)
    );
  }

  const positions = await adapter.fetchPositions(credentials);
  if (backfill) {
    // A position that moved after the fill window would seed wrongly.
    for (const position of positions) {
      if (position.updateTime <= now) continue;
      fetched.set(
        position.symbol,
        await adapter.fetchFills(
          credentials,
          position.symbol,
          windowStart,
          Date.now()
        )
      );
    }
  }

  const openSymbols = new Set(
    positions.filter(p => !isZero(p.positionAmt)).map(p => p.symbol)
  );
  const conditionalOrders: ExchangeConditionalOrder[] = [];
  for (const symbol of Array.from(openSymbols)) {
    conditionalOrders.push(
      ...(await adapter.fetchConditionalOrders(credentials, symbol))
    );
  }

  const balance = await adapter.fetchBalance(credentials);

  const stored = (await listFillsByAccount(account.id, account.userId)).map(
    toFillRecord
  );
  const storedIds = new Set(stored.map(fillIdentity));
  const newFills = Array.from(fetched.values())
    .flat()
    .map(fromExchange)
    .filter(fill => !storedIds.has(fillIdentity(fill)));
  const seeds = backfill ? computeSeeds(newFills, positions, windowStart) : [];

  const { trades, logs } = reconstruct({
    fills: [...stored, ...newFills, ...seeds],
    conditionalOrders,
    exchange: account.exchange,
  });
  for (const line of logs) console.warn(line);

  return {
    fills: [...newFills, ...seeds],
    trades,
    balance,
    backfillStart: backfill ? windowStart : undefined,
    incomeCursorAt: Math.max(discovery.maxTime, incomeCursor),
  };
}

export async function runSync(
  accountId: number,
  userId: number,
  { reason, adapter = createBinanceAdapter() }: SyncOptions
): Promise<void> {
  // Checked before any await so a concurrent call can never slip past.
  if (running.has(accountId)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Sync already running",
    });
  }
  running.add(accountId);

  try {
    const account = await getAccountById(accountId, userId);
    if (!account) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
    }
    if (account.apiKey === null || account.apiSecret === null) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Account has no API key",
      });
    }

    const now = Date.now();
    await writeSyncAttempt(accountId, now);

    try {
      const credentials = {
        apiKey: decrypt(account.apiKey),
        apiSecret: decrypt(account.apiSecret),
      };
      const result = await fetchAndReconstruct(
        account,
        adapter,
        credentials,
        now
      );

      await runInSqliteTransaction(async () => {
        await insertFills(
          result.fills.map(fill => ({ ...fill, userId, accountId }))
        );
        await upsertTradesByTradeKey(accountId, userId, result.trades, now);
        await writeSyncSuccess(accountId, {
          balanceUsdt: result.balance.balanceUsdt,
          unrealizedPnlUsdt: result.balance.unrealizedPnlUsdt,
          backfillStart: result.backfillStart,
          incomeCursorAt: result.incomeCursorAt,
          at: Date.now(),
        });
      });

      console.log(
        `[Sync] ${accountId} ok (${reason}) +${result.fills.length} fills, ${result.trades.length} trades`
      );
    } catch (error) {
      const exchangeError = error instanceof ExchangeError ? error : undefined;
      const code = exchangeError?.code ?? "unknown";
      const retryAt =
        code === "rate_limited"
          ? (exchangeError?.retryAt ?? Date.now() + DEFAULT_RETRY_MS)
          : undefined;
      await writeSyncFailure(accountId, code, retryAt);
      console.error(
        `[Sync] ${accountId} ${code}`,
        exchangeError?.detail ?? error
      );
      throw new TRPCError({ code: trpcCodeFor(code), message: code });
    }
  } finally {
    running.delete(accountId);
  }
}

function isAutoSyncEligible(account: Account, now: number): boolean {
  if (account.apiKey === null) return false;
  if (account.lastSyncedAt !== null && now - account.lastSyncedAt < STALE_MS) {
    return false;
  }
  const code = account.lastSyncErrorCode;
  if (code === null) return true;
  if (code === "rate_limited") {
    return account.lastSyncRetryAt === null || account.lastSyncRetryAt <= now;
  }
  return isTransient(code);
}

/** Sync every stale, auto-retryable account; one failure marks only its own. */
export async function autoSync(
  userId: number,
  options: { adapter?: ExchangeAdapter } = {}
): Promise<AutoSyncOutcome[]> {
  const now = Date.now();
  const accounts = (await getAccountsByUserId(userId)).filter(account =>
    isAutoSyncEligible(account, now)
  );

  const outcomes: AutoSyncOutcome[] = [];
  for (const account of accounts) {
    try {
      await runSync(account.id, userId, { reason: "auto", ...options });
      outcomes.push({ accountId: account.id, ok: true });
    } catch (error) {
      // runSync already persisted and logged the failure; only report it.
      // CONFLICT / NOT_FOUND carry no sync error code.
      const code =
        error instanceof TRPCError
          ? SYNC_ERROR_CODES.find(c => c === error.message)
          : undefined;
      outcomes.push({ accountId: account.id, ok: false, code });
    }
  }
  return outcomes;
}
