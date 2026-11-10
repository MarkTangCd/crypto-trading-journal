// PROTOTYPE (TASK-72, branch prototype/plans-ui). In-memory stand-in for the
// future `plan` tRPC namespace. Nothing persists; a reload reseeds.
import type { JSONContent } from "@tiptap/react";
import { useSyncExternalStore } from "react";

export type Side = "long" | "short";
export type Outcome = "triggered" | "invalidated";

export const SCENARIO_TIME_FRAMES = [
  "15m",
  "30m",
  "1H",
  "4H",
  "12H",
  "1D",
] as const;
export type ScenarioTimeFrame = (typeof SCENARIO_TIME_FRAMES)[number];

export const SYMBOL_SUGGESTIONS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "DOGEUSDT",
  "ARBUSDT",
  "BNBUSDT",
  "XRPUSDT",
];

export interface Scenario {
  id: number;
  name: string;
  side: Side;
  primaryTimeFrame: ScenarioTimeFrame;
  content: JSONContent | null;
  outcome: Outcome | null;
  position: number;
}

export interface Observation {
  id: number;
  content: JSONContent;
  createdAt: number;
  updatedAt: number;
}

export interface Plan {
  id: number;
  symbol: string;
  marketContext: JSONContent | null;
  closedAt: number | null;
  createdAt: number;
  updatedAt: number;
  scenarios: Scenario[];
  observations: Observation[];
}

// ---------- seed helpers ----------

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Block = string | { bullets: string[] } | { steps: string[] };

function doc(...blocks: Block[]): JSONContent {
  return {
    type: "doc",
    content: blocks.map(block => {
      if (typeof block === "string") {
        return { type: "paragraph", content: [{ type: "text", text: block }] };
      }
      const items = "bullets" in block ? block.bullets : block.steps;
      return {
        type: "bullets" in block ? "bulletList" : "orderedList",
        content: items.map(text => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        })),
      };
    }),
  };
}

let nextId = 100;
const id = () => nextId++;

function scenario(
  name: string,
  side: Side,
  primaryTimeFrame: ScenarioTimeFrame,
  content: JSONContent | null,
  outcome: Outcome | null = null
): Omit<Scenario, "position"> {
  return { id: id(), name, side, primaryTimeFrame, content, outcome };
}

function plan(
  symbol: string,
  createdAgo: number,
  closedAgo: number | null,
  marketContext: JSONContent | null,
  scenarios: Omit<Scenario, "position">[],
  observations: [number, JSONContent][]
): Plan {
  const now = Date.now();
  return {
    id: id(),
    symbol,
    marketContext,
    closedAt: closedAgo === null ? null : now - closedAgo,
    createdAt: now - createdAgo,
    updatedAt: now - (closedAgo ?? Math.min(createdAgo, 20 * MIN)),
    scenarios: scenarios.map((s, position) => ({ ...s, position })),
    observations: observations.map(([ago, content]) => ({
      id: id(),
      content,
      createdAt: now - ago,
      updatedAt: now - ago,
    })),
  };
}

function seed(): Plan[] {
  return [
    plan(
      "BTCUSDT",
      9 * HOUR + 12 * MIN,
      null,
      doc(
        "Weekly closed above 68.2k, but the daily printed a bearish engulfing off 69.4k. Funding flipped positive overnight and OI is up 6% while price went nowhere: late longs are crowding the range.",
        {
          bullets: [
            "range 66.8k to 69.4k since tuesday",
            "CPI tomorrow 20:30 UTC+8, no new position 30 min before",
            "ETH/BTC weak, alts following BTC 1:1",
          ],
        }
      ),
      [
        scenario(
          "range high reclaim",
          "long",
          "4H",
          doc(
            "4H close above 69.4k with OI flat or falling (shorts covering, not new longs). Entry on the first 1H retest of 69.4k.",
            { bullets: ["stop below 68.6k", "target 71.2k, then trail"] }
          )
        ),
        scenario(
          "breakdown of 66.8k",
          "short",
          "1H",
          doc(
            "1H acceptance below 66.8k (two closes). Short the retest from below; crowded longs are the fuel.",
            { bullets: ["stop 67.6k", "target 64.9k (prior weekly open)"] }
          )
        ),
        scenario(
          "sweep and reclaim of the low",
          "long",
          "15m",
          doc(
            "Wick below 66.8k that reclaims within 2 candles on 15m. Only if CPI is already out."
          )
        ),
      ],
      [
        [
          8 * HOUR,
          doc("Asia open pushed into 69.1k and got sold in 20 minutes."),
        ],
        [
          5 * HOUR,
          doc(
            "Funding now 0.018%. Coinbase premium negative for the first time this week."
          ),
        ],
        [
          40 * MIN,
          doc("Range low tested once at 66.95k, bounce weak, volume thin."),
        ],
      ]
    ),
    plan(
      "ETHUSDT",
      DAY + 3 * HOUR,
      null,
      doc(
        "ETH lagging BTC all week. 3,050 is the level everyone is watching; above it the 4H structure turns bullish."
      ),
      [
        scenario(
          "3,050 breakout",
          "long",
          "4H",
          doc("4H close above 3,050, enter on 1H retest.")
        ),
        scenario(
          "lose 2,880",
          "short",
          "1H",
          doc("Daily low lost with ETH/BTC making new lows.")
        ),
      ],
      [[20 * HOUR, doc("3,050 rejected twice on 1H, wicks only.")]]
    ),
    plan("SOLUSDT", 5 * MIN, null, null, [], []),
    plan(
      "BTCUSDT",
      DAY + 14 * HOUR,
      DAY + 2 * HOUR,
      doc("FOMC day. Expected a liquidity grab in both directions."),
      [
        scenario(
          "post-FOMC squeeze",
          "long",
          "1H",
          doc("Reclaim of 67k after the release."),
          "triggered"
        ),
        scenario(
          "fade the spike",
          "short",
          "15m",
          doc("Short the first spike above 68.5k."),
          "invalidated"
        ),
      ],
      [
        [DAY + 12 * HOUR, doc("Pre-release chop, 66.6k to 67.1k.")],
        [DAY + 6 * HOUR, doc("Squeeze through 67k within 10 minutes.")],
        [
          DAY + 4 * HOUR,
          doc("Spike stopped at 68.3k, never reached the fade zone."),
        ],
      ]
    ),
    plan(
      "DOGEUSDT",
      DAY + 9 * HOUR,
      DAY + 5 * HOUR,
      doc("Meme rotation chatter, nothing on the chart yet."),
      [
        scenario(
          "0.18 breakout",
          "long",
          "30m",
          doc("Only with BTC flat."),
          "invalidated"
        ),
      ],
      []
    ),
    plan(
      "ETHUSDT",
      4 * DAY,
      3 * DAY + 2 * HOUR,
      doc("ETF flow headlines; range 2,950 to 3,120."),
      [
        scenario(
          "range low bid",
          "long",
          "1H",
          doc("Bid 2,950 with stop 2,910."),
          "triggered"
        ),
        scenario(
          "range high short",
          "short",
          "1H",
          doc("Short 3,120 rejection."),
          "invalidated"
        ),
        scenario(
          "range break up",
          "long",
          "4H",
          doc("4H close above 3,120."),
          "invalidated"
        ),
      ],
      [[3 * DAY + 20 * HOUR, doc("2,952 tagged, bounce clean.")]]
    ),
    plan("ARBUSDT", 3 * DAY + 6 * HOUR, 3 * DAY + 5 * HOUR, null, [], []),
  ];
}

// ---------- store ----------

let plans: Plan[] = seed();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlans(): Plan[] {
  return useSyncExternalStore(subscribe, () => plans);
}

export function usePlan(planId: number): Plan | undefined {
  return usePlans().find(p => p.id === planId);
}

function mutate(planId: number, fn: (p: Plan) => Plan) {
  plans = plans.map(p =>
    p.id === planId ? { ...fn(p), updatedAt: Date.now() } : p
  );
  emit();
}

export const planStore = {
  create(symbol: string): number {
    const now = Date.now();
    const created: Plan = {
      id: id(),
      symbol: symbol.trim().toUpperCase(),
      marketContext: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
      scenarios: [],
      observations: [],
    };
    plans = [created, ...plans];
    emit();
    return created.id;
  },
  setSymbol(planId: number, symbol: string) {
    mutate(planId, p => ({ ...p, symbol: symbol.trim().toUpperCase() }));
  },
  setMarketContext(planId: number, marketContext: JSONContent) {
    mutate(planId, p => ({ ...p, marketContext }));
  },
  addScenario(
    planId: number,
    input: { name: string; side: Side; primaryTimeFrame: ScenarioTimeFrame }
  ): number {
    const scenarioId = id();
    mutate(planId, p => ({
      ...p,
      scenarios: [
        ...p.scenarios,
        {
          id: scenarioId,
          ...input,
          content: null,
          outcome: null,
          position: p.scenarios.length,
        },
      ],
    }));
    return scenarioId;
  },
  updateScenario(
    planId: number,
    scenarioId: number,
    patch: Partial<Omit<Scenario, "id" | "position" | "outcome">>
  ) {
    mutate(planId, p => ({
      ...p,
      scenarios: p.scenarios.map(s =>
        s.id === scenarioId ? { ...s, ...patch } : s
      ),
    }));
  },
  deleteScenario(planId: number, scenarioId: number) {
    mutate(planId, p => ({
      ...p,
      scenarios: p.scenarios
        .filter(s => s.id !== scenarioId)
        .map((s, position) => ({ ...s, position })),
    }));
  },
  moveScenario(planId: number, scenarioId: number, delta: -1 | 1) {
    mutate(planId, p => {
      const list = [...p.scenarios];
      const from = list.findIndex(s => s.id === scenarioId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= list.length) return p;
      [list[from], list[to]] = [list[to], list[from]];
      return {
        ...p,
        scenarios: list.map((s, position) => ({ ...s, position })),
      };
    });
  },
  addObservation(planId: number, content: JSONContent) {
    const now = Date.now();
    mutate(planId, p => ({
      ...p,
      observations: [
        ...p.observations,
        { id: id(), content, createdAt: now, updatedAt: now },
      ],
    }));
  },
  updateObservation(
    planId: number,
    observationId: number,
    content: JSONContent
  ) {
    mutate(planId, p => ({
      ...p,
      observations: p.observations.map(o =>
        o.id === observationId ? { ...o, content, updatedAt: Date.now() } : o
      ),
    }));
  },
  deleteObservation(planId: number, observationId: number) {
    mutate(planId, p => ({
      ...p,
      observations: p.observations.filter(o => o.id !== observationId),
    }));
  },
  // Close requires a verdict for every scenario; a plan with none closes directly.
  close(planId: number, verdicts: Record<number, Outcome>) {
    mutate(planId, p => {
      if (p.scenarios.some(s => !verdicts[s.id])) return p;
      return {
        ...p,
        closedAt: Date.now(),
        scenarios: p.scenarios.map(s => ({ ...s, outcome: verdicts[s.id] })),
      };
    });
  },
  // Reopen keeps outcomes so a re-close pre-fills them.
  reopen(planId: number) {
    mutate(planId, p => ({ ...p, closedAt: null }));
  },
  delete(planId: number) {
    plans = plans.filter(p => p.id !== planId);
    emit();
  },
};

// ---------- derived helpers shared by the variants ----------

export function isEmptyDoc(content: JSONContent | null): boolean {
  if (!content?.content) return true;
  return content.content.every(
    block => block.type === "paragraph" && !block.content?.length
  );
}

export function openPlans(all: Plan[]): Plan[] {
  return all
    .filter(p => p.closedAt === null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function closedPlans(all: Plan[]): Plan[] {
  return all
    .filter(p => p.closedAt !== null)
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
}

export function outcomeTally(p: Plan): {
  triggered: number;
  invalidated: number;
} {
  return {
    triggered: p.scenarios.filter(s => s.outcome === "triggered").length,
    invalidated: p.scenarios.filter(s => s.outcome === "invalidated").length,
  };
}

export function initialVerdicts(p: Plan): Record<number, Outcome> {
  const verdicts: Record<number, Outcome> = {};
  for (const s of p.scenarios) if (s.outcome) verdicts[s.id] = s.outcome;
  return verdicts;
}
