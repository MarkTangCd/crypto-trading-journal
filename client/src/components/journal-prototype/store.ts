// PROTOTYPE (TASK-88, branch prototype/journal-ui). In-memory Journal data
// shared by every variant. Nothing persists; a reload reseeds.
import { previewPlannedRiskReward } from "@/lib/plannedRiskReward";
import type { RichTextDoc } from "@shared/richText";
import type { Trade as RealTrade } from "@shared/types";
import { useSyncExternalStore } from "react";

export type Side = "long" | "short";

export type Trade = {
  id: number;
  accountId: number;
  symbol: string;
  side: Side;
  status: "open" | "closed";
  openTime: number;
  closeTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  realizedPnlUsd: number;
};

export type Setup = {
  id: number;
  name: string;
  description: RichTextDoc | null;
  triggers: string[];
  createdAt: number;
};

export const EMOTIONS = [
  "fear",
  "greed",
  "frustration",
  "impatience",
  "hesitation",
  "overconfidence",
  "revenge",
  "boredom",
  "stress",
  "FOMO",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type Shot = { id: number; src: string };

export type RichField =
  | "entryReason"
  | "marketContext"
  | "invalidation"
  | "mistakes"
  | "rulesFollowed"
  | "managementDecisions"
  | "notesForNext";

export type PriceField = "plannedEntry" | "plannedStop" | "plannedTarget";

export type JournalEntry = {
  id: number;
  tradeIds: number[];
  setupIds: number[];
  emotion: Emotion | null;
  plannedEntry: string;
  plannedStop: string;
  plannedTarget: string;
  beforeShots: Shot[];
  afterShots: Shot[];
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
} & Record<RichField, RichTextDoc | null>;

export const ACCOUNTS = [
  { id: 1, name: "main" },
  { id: 2, name: "sub" },
];
export const CURRENT_ACCOUNT_ID = 1;

type State = {
  trades: Trade[];
  setups: Setup[];
  entries: JournalEntry[];
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

// Fake chart screenshot: a stepped ink line on paper, as an SVG data URL.
function fakeChart(seed: number): string {
  let y = 60;
  const points: string[] = [];
  for (let x = 0; x <= 320; x += 8) {
    y += Math.sin(seed * 7.1 + x * 0.09) * 9 + Math.cos(seed + x * 0.031) * 4;
    y = Math.min(110, Math.max(14, y));
    points.push(`${x},${y.toFixed(1)}`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 128"><rect width="320" height="128" fill="#f7f7f7"/><line x1="0" y1="${30 + seed * 7}" x2="320" y2="${30 + seed * 7}" stroke="#bbb" stroke-dasharray="3 3"/><polyline fill="none" stroke="#222" stroke-width="1.4" points="${points.join(" ")}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function doc(...paragraphs: string[]): RichTextDoc {
  return {
    type: "doc",
    content: paragraphs.map(text => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

function trade(
  id: number,
  symbol: string,
  side: Side,
  openAgo: number,
  heldHours: number | null,
  entryPrice: number,
  exitPrice: number | null,
  quantity: number,
  accountId = 1
): Trade {
  const closeTime =
    heldHours === null ? null : NOW - openAgo + heldHours * HOUR;
  const gross =
    exitPrice === null
      ? 0
      : (side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice) *
        quantity;
  const fee =
    exitPrice === null ? 0 : (entryPrice + exitPrice) * quantity * 0.0004;
  return {
    id,
    accountId,
    symbol,
    side,
    status: heldHours === null ? "open" : "closed",
    openTime: NOW - openAgo,
    closeTime,
    entryPrice,
    exitPrice,
    quantity,
    realizedPnlUsd: Math.round((gross - fee) * 100) / 100,
  };
}

function seed(): State {
  const trades: Trade[] = [
    trade(1, "BTCUSDT", "long", 20 * DAY, 9, 91250, 93180, 0.15),
    trade(2, "ETHUSDT", "short", 19 * DAY, 3, 3184, 3221, 2.5),
    trade(3, "BTCUSDT", "long", 17 * DAY, 14, 90410, 92960, 0.2),
    trade(4, "BTCUSDT", "long", 17 * DAY - 2 * HOUR, 12, 90980, 92960, 0.1),
    trade(5, "SOLUSDT", "short", 15 * DAY, 2, 182.4, 185.9, 40),
    trade(6, "SOLUSDT", "long", 15 * DAY - 3 * HOUR, 6, 186.2, 188.1, 40),
    trade(7, "ETHUSDT", "long", 12 * DAY, 20, 3090, 3176, 2.4),
    trade(8, "DOGEUSDT", "long", 10 * DAY, 1, 0.3214, 0.3189, 18000),
    trade(9, "BTCUSDT", "short", 8 * DAY, 4, 94820, 96100, 0.2),
    trade(10, "ETHUSDT", "long", 6 * DAY, 30, 3240, 3282, 2.2),
    trade(11, "SOLUSDT", "long", 5 * DAY, 16, 176.8, 181.5, 38),
    trade(12, "BTCUSDT", "long", 3 * DAY, 22, 95120, 97240, 0.19),
    trade(13, "ETHUSDT", "short", 2 * DAY, 5, 3310, 3338, 2.5),
    trade(14, "BTCUSDT", "long", 30 * HOUR, 7, 97480, 97810, 0.1),
    trade(15, "BTCUSDT", "long", 6 * HOUR, null, 98020, null, 0.12),
    trade(16, "ETHUSDT", "short", 3 * HOUR, null, 3352, null, 2),
    trade(17, "SOLUSDT", "long", 5 * HOUR, 4.5, 190.3, 191.8, 35),
    trade(18, "BTCUSDT", "long", 9 * DAY, 11, 93300, 94410, 0.12, 2),
  ];

  const setups: Setup[] = [
    {
      id: 1,
      name: "range reclaim",
      description: doc(
        "Price loses the range low, then closes back inside on the 1H. Entry on the retest of the low from above."
      ),
      triggers: ["1H close back inside", "retest holds", "volume on reclaim"],
      createdAt: NOW - 40 * DAY,
    },
    {
      id: 2,
      name: "breakout retest",
      description: doc(
        "Clean break of a 4H level with acceptance above, wait for the first pullback into the level."
      ),
      triggers: ["4H close above level", "pullback on low volume"],
      createdAt: NOW - 38 * DAY,
    },
    {
      id: 3,
      name: "liquidity sweep",
      description: doc("扫掉前高/前低后快速收回，反向入场。"),
      triggers: ["wick through prior high", "15m engulfing"],
      createdAt: NOW - 30 * DAY,
    },
    {
      id: 4,
      name: "trend pullback",
      description: null,
      triggers: [],
      createdAt: NOW - 12 * DAY,
    },
  ];

  const blank = (id: number, tradeIds: number[], createdAt: number) =>
    ({
      id,
      tradeIds,
      setupIds: [],
      emotion: null,
      plannedEntry: "",
      plannedStop: "",
      plannedTarget: "",
      beforeShots: [],
      afterShots: [],
      reviewedAt: null,
      createdAt,
      updatedAt: createdAt,
      entryReason: null,
      marketContext: null,
      invalidation: null,
      mistakes: null,
      rulesFollowed: null,
      managementDecisions: null,
      notesForNext: null,
    }) satisfies JournalEntry;

  const entries: JournalEntry[] = [
    {
      ...blank(1, [1], NOW - 20 * DAY),
      setupIds: [2],
      emotion: "hesitation",
      plannedEntry: "91200",
      plannedStop: "90400",
      plannedTarget: "93400",
      entryReason: doc(
        "4H closed above 91k after three tests. Waited for the pullback."
      ),
      marketContext: doc("BTC dominance rising, alts bleeding. Funding flat."),
      invalidation: doc("4H close back under 90.4k."),
      beforeShots: [{ id: 1, src: fakeChart(1) }],
      afterShots: [{ id: 2, src: fakeChart(2) }],
      mistakes: doc(
        "Took profit early on the first push, left 0.5R on the table."
      ),
      rulesFollowed: doc("Followed: waited for the retest. Broke: none."),
      managementDecisions: doc("Moved stop to entry after 92k."),
      notesForNext: doc("Let the runner go to the planned target."),
      reviewedAt: NOW - 19 * DAY,
      updatedAt: NOW - 19 * DAY,
    },
    {
      ...blank(2, [3, 4], NOW - 17 * DAY),
      setupIds: [1, 2],
      emotion: "greed",
      plannedEntry: "90500",
      plannedStop: "89700",
      plannedTarget: "93000",
      entryReason: doc(
        "Range low reclaimed; added a second clip on the retest."
      ),
      mistakes: doc("Second clip was chasing, not planned."),
      notesForNext: doc("加仓必须写在计划里。"),
      reviewedAt: NOW - 16 * DAY,
      updatedAt: NOW - 16 * DAY,
    },
    {
      ...blank(3, [5, 6], NOW - 15 * DAY),
      setupIds: [3],
      emotion: "revenge",
      plannedEntry: "182.5",
      plannedStop: "184.5",
      plannedTarget: "176",
      entryReason: doc("Sweep of the 185 high, expected rejection."),
      mistakes: doc("Flipped long right after the stop. Revenge trade."),
      rulesFollowed: doc("Broke: no flip within 1h of a stop."),
      reviewedAt: NOW - 14 * DAY,
      updatedAt: NOW - 14 * DAY,
    },
    {
      ...blank(4, [9], NOW - 8 * DAY),
      setupIds: [3],
      emotion: "FOMO",
      plannedEntry: "94800",
      plannedStop: "95600",
      plannedTarget: "92400",
      entryReason: doc("Swept the weekly high, 15m engulfing."),
      beforeShots: [{ id: 3, src: fakeChart(3) }],
    },
    {
      ...blank(5, [12], NOW - 3 * DAY),
      setupIds: [4],
      plannedEntry: "95100",
      plannedStop: "94300",
      plannedTarget: "97500",
      marketContext: doc("Trend day, higher lows all session."),
    },
    {
      ...blank(6, [14, 15], NOW - 30 * HOUR),
      setupIds: [2],
      emotion: "impatience",
      plannedEntry: "97500",
      plannedStop: "96900",
      plannedTarget: "99800",
      entryReason: doc(
        "Breakout above 97k, first clip early, second on the retest."
      ),
      beforeShots: [
        { id: 4, src: fakeChart(4) },
        { id: 5, src: fakeChart(5) },
      ],
    },
    {
      ...blank(7, [18], NOW - 9 * DAY),
      setupIds: [1],
      plannedEntry: "93300",
      plannedStop: "92700",
      plannedTarget: "94500",
      reviewedAt: NOW - 8 * DAY,
      updatedAt: NOW - 8 * DAY,
    },
  ];

  return { trades, setups, entries };
}

let state: State = seed();
let nextId = 1000;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach(listener => listener());
}

export function useJournal(): State {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}

// ---------- derived values ----------

export function tradesOf(s: State, entry: JournalEntry): Trade[] {
  return entry.tradeIds
    .map(id => s.trades.find(t => t.id === id))
    .filter((t): t is Trade => t !== undefined)
    .sort((a, b) => a.openTime - b.openTime);
}

export function entryDate(s: State, entry: JournalEntry): number {
  return Math.min(...tradesOf(s, entry).map(t => t.openTime));
}

export function entrySymbol(s: State, entry: JournalEntry): string {
  return tradesOf(s, entry)[0]?.symbol ?? "—";
}

export function entrySides(s: State, entry: JournalEntry): Side[] {
  return [...new Set(tradesOf(s, entry).map(t => t.side))];
}

export function netPnl(s: State, entry: JournalEntry): number {
  return tradesOf(s, entry).reduce((sum, t) => sum + t.realizedPnlUsd, 0);
}

export function openCount(s: State, entry: JournalEntry): number {
  return tradesOf(s, entry).filter(t => t.status === "open").length;
}

export function entryAccountId(s: State, entry: JournalEntry): number {
  return tradesOf(s, entry)[0]?.accountId ?? CURRENT_ACCOUNT_ID;
}

export type Ratio =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; value: number };

// Planned R:R = |TP - entry| / |entry - SL|; direction-checked when all
// linked trades share one side.
export function plannedRR(s: State, entry: JournalEntry): Ratio {
  const sides = entrySides(s, entry);
  if (sides.length === 1) {
    return previewPlannedRiskReward(
      sides[0],
      entry.plannedEntry,
      entry.plannedStop,
      entry.plannedTarget
    );
  }
  const e = parseFloat(entry.plannedEntry);
  const sl = parseFloat(entry.plannedStop);
  const tp = parseFloat(entry.plannedTarget);
  if ([e, sl, tp].some(Number.isNaN)) return { kind: "empty" };
  if (e === sl) return { kind: "invalid", reason: "stop equals entry" };
  return { kind: "ok", value: Math.abs(tp - e) / Math.abs(e - sl) };
}

// Actual R = net realized PnL / (|entry - SL| x total quantity), once every
// linked trade is closed.
export function actualR(s: State, entry: JournalEntry): Ratio {
  if (openCount(s, entry) > 0) return { kind: "empty" };
  const e = parseFloat(entry.plannedEntry);
  const sl = parseFloat(entry.plannedStop);
  if (Number.isNaN(e) || Number.isNaN(sl)) return { kind: "empty" };
  if (e === sl) return { kind: "invalid", reason: "stop equals entry" };
  const qty = tradesOf(s, entry).reduce((sum, t) => sum + t.quantity, 0);
  return { kind: "ok", value: netPnl(s, entry) / (Math.abs(e - sl) * qty) };
}

export function linkedTradeIds(s: State): Set<number> {
  return new Set(s.entries.flatMap(e => e.tradeIds));
}

// Current account's trades not linked to any entry, newest first.
export function pickableTrades(s: State, keep: number[] = []): Trade[] {
  const linked = linkedTradeIds(s);
  return s.trades
    .filter(
      t =>
        t.accountId === CURRENT_ACCOUNT_ID &&
        (!linked.has(t.id) || keep.includes(t.id))
    )
    .sort((a, b) => b.openTime - a.openTime);
}

export function setupUsage(s: State, setupId: number): number {
  return s.entries.filter(e => e.setupIds.includes(setupId)).length;
}

export function entryForTrade(
  s: State,
  tradeId: number
): JournalEntry | undefined {
  return s.entries.find(e => e.tradeIds.includes(tradeId));
}

// Entries sorted by earliest linked trade openTime, newest first.
export function sortedEntries(s: State): JournalEntry[] {
  return [...s.entries].sort((a, b) => entryDate(s, b) - entryDate(s, a));
}

// ---------- actions ----------

function patchEntry(id: number, patch: Partial<JournalEntry>) {
  set({
    ...state,
    entries: state.entries.map(e =>
      e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e
    ),
  });
}

export const actions = {
  createEntry(tradeIds: number[]): number {
    const id = ++nextId;
    const now = Date.now();
    set({
      ...state,
      entries: [
        ...state.entries,
        {
          id,
          tradeIds,
          setupIds: [],
          emotion: null,
          plannedEntry: "",
          plannedStop: "",
          plannedTarget: "",
          beforeShots: [],
          afterShots: [],
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          entryReason: null,
          marketContext: null,
          invalidation: null,
          mistakes: null,
          rulesFollowed: null,
          managementDecisions: null,
          notesForNext: null,
        },
      ],
    });
    return id;
  },
  setRich(id: number, field: RichField, value: RichTextDoc | null) {
    patchEntry(id, { [field]: value });
  },
  setPrice(id: number, field: PriceField, value: string) {
    patchEntry(id, { [field]: value });
  },
  setEmotion(id: number, emotion: Emotion | null) {
    patchEntry(id, { emotion });
  },
  setSetups(id: number, setupIds: number[]) {
    patchEntry(id, { setupIds });
  },
  setTrades(id: number, tradeIds: number[]) {
    if (tradeIds.length === 0) return;
    patchEntry(id, { tradeIds });
  },
  addShot(id: number, slot: "beforeShots" | "afterShots", src: string) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    patchEntry(id, { [slot]: [...entry[slot], { id: ++nextId, src }] });
  },
  removeShot(id: number, slot: "beforeShots" | "afterShots", shotId: number) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    patchEntry(id, { [slot]: entry[slot].filter(s => s.id !== shotId) });
  },
  markReviewed(id: number) {
    patchEntry(id, { reviewedAt: Date.now() });
  },
  reopen(id: number) {
    patchEntry(id, { reviewedAt: null });
  },
  deleteEntry(id: number) {
    set({ ...state, entries: state.entries.filter(e => e.id !== id) });
  },
  createSetup(name: string): number | string {
    const clean = name.trim();
    if (clean.length < 1 || clean.length > 60)
      return "name is 1 to 60 characters";
    if (state.setups.some(s => s.name.toLowerCase() === clean.toLowerCase())) {
      return "a setup with this name exists";
    }
    const id = ++nextId;
    set({
      ...state,
      setups: [
        ...state.setups,
        {
          id,
          name: clean,
          description: null,
          triggers: [],
          createdAt: Date.now(),
        },
      ],
    });
    return id;
  },
  updateSetup(id: number, patch: Partial<Omit<Setup, "id">>): string | null {
    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (clean.length < 1 || clean.length > 60)
        return "name is 1 to 60 characters";
      if (
        state.setups.some(
          s => s.id !== id && s.name.toLowerCase() === clean.toLowerCase()
        )
      ) {
        return "a setup with this name exists";
      }
      patch = { ...patch, name: clean };
    }
    set({
      ...state,
      setups: state.setups.map(s => (s.id === id ? { ...s, ...patch } : s)),
    });
    return null;
  },
  deleteSetup(id: number): boolean {
    if (setupUsage(state, id) > 0) return false;
    set({ ...state, setups: state.setups.filter(s => s.id !== id) });
    return true;
  },
  // Simulates a sync closing the oldest open trade.
  closeOldestOpenTrade(): Trade | undefined {
    const open = state.trades
      .filter(t => t.status === "open")
      .sort((a, b) => a.openTime - b.openTime)[0];
    if (!open) return undefined;
    const exitPrice = open.entryPrice * (open.side === "long" ? 1.012 : 0.991);
    const gross =
      (open.side === "long"
        ? exitPrice - open.entryPrice
        : open.entryPrice - exitPrice) * open.quantity;
    set({
      ...state,
      trades: state.trades.map(t =>
        t.id === open.id
          ? {
              ...t,
              status: "closed",
              closeTime: Date.now(),
              exitPrice: Math.round(exitPrice * 100) / 100,
              realizedPnlUsd: Math.round(gross * 100) / 100,
            }
          : t
      ),
    });
    return open;
  },
  // Trade detail runs on real trades; copy one in so the shortcut can link it.
  importRealTrade(real: RealTrade): number {
    const id = 100_000 + real.id;
    if (!state.trades.some(t => t.id === id)) {
      set({
        ...state,
        trades: [
          ...state.trades,
          {
            id,
            accountId: CURRENT_ACCOUNT_ID,
            symbol: real.symbol,
            side: real.side,
            status: real.status,
            openTime: real.openTime,
            closeTime: real.closeTime,
            entryPrice: parseFloat(real.entryPrice),
            exitPrice:
              real.exitPrice === null ? null : parseFloat(real.exitPrice),
            quantity: parseFloat(real.quantity),
            realizedPnlUsd: parseFloat(real.realizedPnlUsd),
          },
        ],
      });
    }
    return id;
  },
};

export const realTradeKey = (realId: number) => 100_000 + realId;
