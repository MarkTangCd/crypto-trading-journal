// PROTOTYPE — throwaway (task-47). Three variants of the post-sync journal
// (accounts · trades · trade detail · dashboard) on one dev-only route,
// /prototype/exchange-sync, switchable via ?variant=A|B|C, ?screen=, ?state=.
// Fixture data only; no tRPC, no mutations. Never ship.
import { Button } from "@/components/ui/button";
import {
  PrototypeSwitcher,
  usePrototypeParams,
} from "@/components/PrototypeSwitcher";
import {
  Field,
  INPUT_CLASS,
  SectionHeader,
  TEXTAREA_CLASS,
  type Tone,
  fmtDate,
  fmtDateTime,
  fmtDecimal,
  fmtDuration,
  fmtMoney,
  toneClass,
} from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { useState } from "react";

// ---------------------------------------------------------------- fixtures

type Trade = {
  id: number;
  symbol: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
  side: "long" | "short";
  status: "open" | "closed";
  openTime: number;
  closeTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  positionSizeUsdt: number;
  feeUsd: number;
  realizedPnlUsd: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  openTimeApprox: boolean;
};

type AccountState = "synced" | "never" | "failed";

const NOW = Date.UTC(2026, 10, 4, 12, 3, 0);
const H = 3600000;
const D = 24 * H;
const T = (daysAgo: number, hours = 0) => NOW - daysAgo * D + hours * H;

const TRADES: Trade[] = [
  {
    id: 14,
    symbol: "BTCUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "open",
    openTime: T(0, -5),
    closeTime: null,
    entryPrice: 99000,
    exitPrice: null,
    quantity: 0.2,
    positionSizeUsdt: 19800,
    feeUsd: 3.96,
    realizedPnlUsd: null,
    stopLossPrice: 95000,
    takeProfitPrice: 105000,
    openTimeApprox: false,
  },
  {
    id: 13,
    symbol: "ETHUSDT",
    positionSide: "BOTH",
    side: "short",
    status: "open",
    openTime: T(1, -2),
    closeTime: null,
    entryPrice: 3620,
    exitPrice: null,
    quantity: 2,
    positionSizeUsdt: 7240,
    feeUsd: 1.45,
    realizedPnlUsd: null,
    stopLossPrice: 3740,
    takeProfitPrice: null,
    openTimeApprox: false,
  },
  {
    id: 12,
    symbol: "BTCUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "closed",
    openTime: T(2, -6),
    closeTime: T(2, 1),
    entryPrice: 98200,
    exitPrice: 101400,
    quantity: 0.15,
    positionSizeUsdt: 14730,
    feeUsd: 5.99,
    realizedPnlUsd: 474.01,
    stopLossPrice: 96500,
    takeProfitPrice: 101500,
    openTimeApprox: false,
  },
  {
    id: 11,
    symbol: "SOLUSDT",
    positionSide: "BOTH",
    side: "short",
    status: "closed",
    openTime: T(3, -1),
    closeTime: T(3, 3),
    entryPrice: 182.4,
    exitPrice: 186.1,
    quantity: 40,
    positionSizeUsdt: 7296,
    feeUsd: 2.95,
    realizedPnlUsd: -150.95,
    stopLossPrice: 186,
    takeProfitPrice: 175,
    openTimeApprox: false,
  },
  {
    id: 10,
    symbol: "BTCUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "closed",
    openTime: T(5, -8),
    closeTime: T(4, 2),
    entryPrice: 97100,
    exitPrice: 97100,
    quantity: 0.1,
    positionSizeUsdt: 9710,
    feeUsd: 3.88,
    realizedPnlUsd: -3.88,
    stopLossPrice: 95800,
    takeProfitPrice: 99500,
    openTimeApprox: false,
  },
  {
    id: 9,
    symbol: "ETHUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "closed",
    openTime: T(7, -3),
    closeTime: T(6, -4),
    entryPrice: 3410,
    exitPrice: 3365,
    quantity: 3,
    positionSizeUsdt: 10230,
    feeUsd: 4.07,
    realizedPnlUsd: -139.07,
    stopLossPrice: 3360,
    takeProfitPrice: 3520,
    openTimeApprox: false,
  },
  {
    id: 8,
    symbol: "BTCUSDT",
    positionSide: "BOTH",
    side: "short",
    status: "closed",
    openTime: T(9, -2),
    closeTime: T(8, -7),
    entryPrice: 100900,
    exitPrice: 99300,
    quantity: 0.12,
    positionSizeUsdt: 12108,
    feeUsd: 4.8,
    realizedPnlUsd: 187.2,
    stopLossPrice: 102000,
    takeProfitPrice: 99000,
    openTimeApprox: false,
  },
  {
    id: 7,
    symbol: "DOGEUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "closed",
    openTime: T(12, -1),
    closeTime: T(11, 5),
    entryPrice: 0.1621,
    exitPrice: 0.1702,
    quantity: 60000,
    positionSizeUsdt: 9726,
    feeUsd: 3.98,
    realizedPnlUsd: 482.02,
    stopLossPrice: null,
    takeProfitPrice: null,
    openTimeApprox: false,
  },
  {
    id: 6,
    symbol: "BTCUSDT",
    positionSide: "BOTH",
    side: "long",
    status: "closed",
    openTime: T(30),
    closeTime: T(26, 3),
    entryPrice: 94400,
    exitPrice: 96900,
    quantity: 0.2,
    positionSizeUsdt: 18880,
    feeUsd: 3.88,
    realizedPnlUsd: 496.12,
    stopLossPrice: null,
    takeProfitPrice: null,
    openTimeApprox: true,
  },
];

const ACCOUNT = {
  id: 1,
  name: "main",
  exchange: "binance",
  keyTail: "a9f2",
  notes: "swing + intraday on the same wallet",
  balanceUsdt: 12480.32,
  unrealizedPnlUsdt: 132.1,
  lastSyncedAt: NOW - 4 * 60000,
  lastError: "api key invalid or revoked (binance -2015)",
  failedAt: NOW - 11 * 60000,
};
const OTHER_ACCOUNTS = [
  {
    id: 2,
    name: "scalp",
    exchange: "binance",
    keyTail: "7c1e",
    state: "never" as AccountState,
  },
];

const closed = TRADES.filter(t => t.status === "closed");
const open = TRADES.filter(t => t.status === "open");
const wins = closed.filter(t => (t.realizedPnlUsd ?? 0) > 0);
const losses = closed.filter(t => (t.realizedPnlUsd ?? 0) < 0);
const grossWin = wins.reduce((s, t) => s + (t.realizedPnlUsd ?? 0), 0);
const grossLoss = -losses.reduce((s, t) => s + (t.realizedPnlUsd ?? 0), 0);
const STATS = {
  trades: closed.length,
  wins: wins.length,
  winRate: (wins.length / closed.length) * 100,
  profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
  realized: closed.reduce((s, t) => s + (t.realizedPnlUsd ?? 0), 0),
  expectancy:
    closed.reduce((s, t) => s + (t.realizedPnlUsd ?? 0), 0) / closed.length,
  fees: TRADES.reduce((s, t) => s + t.feeUsd, 0),
  longestLosingStreak: 2,
  openExposure: open.reduce((s, t) => s + t.positionSizeUsdt, 0),
  openCount: open.length,
};

// ---------------------------------------------------------------- atoms

const pnlTone = (v: number | null): Tone =>
  v == null || v === 0 ? undefined : v > 0 ? "win" : "loss";
const signed = (v: number) => `${v >= 0 ? "+" : "-"}$${fmtMoney(Math.abs(v))}`;
const px = (v: number | null) => (v == null ? "—" : fmtDecimal(v, 4));
const time = (ts: number) => fmtDateTime(ts);
const hhmm = (ts: number) => time(ts).slice(-5);
const ago = (ts: number) => fmtDuration(ts, NOW) + " ago";

// Last-synced line shared by every variant: the one place the sync state is
// spelled out. Failure is ink, not a signal hue (One-Signal Rule).
function SyncLine({
  state,
  onSync,
  compact,
}: {
  state: AccountState;
  onSync?: () => void;
  compact?: boolean;
}) {
  const btn = (label: string) => (
    <button
      type="button"
      onClick={onSync}
      className="underline underline-offset-4 hover:text-foreground transition-colors"
    >
      {label}
    </button>
  );
  if (state === "never")
    return <p className="text-label">never synced · {btn("sync now")}</p>;
  if (state === "failed")
    return (
      <div className={cn("text-label space-y-1", compact && "space-y-0")}>
        <p>
          ! sync failed {ago(ACCOUNT.failedAt)} — {ACCOUNT.lastError}
        </p>
        <p>
          last successful sync {time(ACCOUNT.lastSyncedAt)} · {btn("retry")}
        </p>
      </div>
    );
  return (
    <p className="text-label">
      synced {hhmm(ACCOUNT.lastSyncedAt)} · {TRADES.length} trades ·{" "}
      {btn("sync now")}
    </p>
  );
}

// SL/TP that came from the exchange are read-only; a null level on a closed
// trade is the hand-editable fallback.
function Level({
  label,
  value,
  editable,
}: {
  label: string;
  value: number | null;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (value != null) return <Field label={label}>{px(value)}</Field>;
  if (!editable)
    return (
      <Field label={label}>
        <span className="text-muted-foreground">—</span>
      </Field>
    );
  return (
    <Field label={`${label} · not on exchange`}>
      {editing ? (
        <input
          autoFocus
          className={cn(INPUT_CLASS, "max-w-[10rem]")}
          inputMode="decimal"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => setEditing(false)}
          placeholder="price"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {draft ? fmtDecimal(draft) : "set by hand →"}
        </button>
      )}
    </Field>
  );
}

function LinkForm({
  inline,
  showError,
}: {
  inline?: boolean;
  showError: boolean;
}) {
  return (
    <div className={cn("space-y-6", inline ? "max-w-md" : "")}>
      <Field label="name" htmlFor="p-name">
        <input
          id="p-name"
          className={INPUT_CLASS}
          placeholder="main · swing · scalp"
        />
      </Field>
      <Field label="exchange" htmlFor="p-exchange">
        <input
          id="p-exchange"
          className={cn(INPUT_CLASS, "text-muted-foreground")}
          value="binance usdⓈ-m futures"
          readOnly
        />
      </Field>
      <Field label="api key" htmlFor="p-key">
        <input id="p-key" className={INPUT_CLASS} placeholder="64 characters" />
      </Field>
      <Field label="api secret" htmlFor="p-secret">
        <input
          id="p-secret"
          type="password"
          className={INPUT_CLASS}
          placeholder="stored encrypted; never shown again"
        />
        {showError && (
          <p className="text-sm mt-2">
            ! this key can trade. the journal only accepts keys with reading
            enabled and futures trading, withdrawals and transfers off —
            re-create it on binance and paste again.
          </p>
        )}
      </Field>
      <Field label="notes (optional)" htmlFor="p-notes">
        <textarea
          id="p-notes"
          rows={2}
          className={TEXTAREA_CLASS}
          placeholder="why this account exists."
        />
      </Field>
      <div className="flex gap-3">
        <Button>link account</Button>
        <p className="text-label self-center">
          verifies permissions, then backfills 30 days
        </p>
      </div>
    </div>
  );
}

function Pnl({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  if (value == null)
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <span className={cn(toneClass(pnlTone(value)), className)}>
      {signed(value)}
    </span>
  );
}

// Horizontal price ruler: sl — entry — exit — tp on one axis. Variant C's trademark.
function PriceRuler({ t }: { t: Trade }) {
  const pts = [
    { k: "stop", v: t.stopLossPrice },
    { k: "entry", v: t.entryPrice },
    { k: "exit", v: t.exitPrice },
    { k: "target", v: t.takeProfitPrice },
  ].filter((p): p is { k: string; v: number } => p.v != null);
  const vals = pts.map(p => p.v);
  const lo = Math.min(...vals),
    hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (v: number) => 6 + ((v - lo) / span) * 88;
  return (
    <svg viewBox="0 0 100 18" className="w-full h-24" aria-label="price levels">
      <line
        x1="4"
        y1="9"
        x2="96"
        y2="9"
        stroke="currentColor"
        strokeWidth="0.2"
      />
      {pts.map((p, i) => (
        <g
          key={p.k}
          className={p.k === "exit" ? toneClass(pnlTone(t.realizedPnlUsd)) : ""}
          fill="currentColor"
        >
          <line
            x1={x(p.v)}
            y1={p.k === "entry" ? 5 : 7}
            x2={x(p.v)}
            y2={p.k === "entry" ? 13 : 11}
            stroke="currentColor"
            strokeWidth={p.k === "entry" ? 0.6 : 0.3}
          />
          <text
            x={x(p.v)}
            y={i % 2 === 0 ? 3.5 : 16.5}
            fontSize="2.2"
            textAnchor="middle"
            style={{ letterSpacing: "0.04em" }}
          >
            {p.k} {fmtDecimal(p.v, 4)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// =================================================================== variant A
// "ledger": tables and key/value grids. Closest to today's pages.

function AccountsA({
  state,
  showError,
}: {
  state: AccountState;
  showError: boolean;
}) {
  const [linking, setLinking] = useState(showError);
  return (
    <div className="space-y-10">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <p className="text-title">accounts</p>
          <p className="text-label">one account = one exchange api key</p>
        </div>
        <Button variant="outline" onClick={() => setLinking(v => !v)}>
          link account
        </Button>
      </header>
      <section className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border">
              {["name", "exchange", "key", "balance", "last sync", ""].map(
                (h, i) => (
                  <th
                    key={i}
                    className={cn(
                      "py-3 text-label font-normal",
                      i >= 3 && i < 5
                        ? "px-4 text-right"
                        : i === 5
                          ? "pl-4"
                          : "pr-4 text-left"
                    )}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border align-top">
              <td className="py-4 pr-4 font-medium">
                {ACCOUNT.name} <span className="text-label">[active]</span>
              </td>
              <td className="py-4 pr-4">{ACCOUNT.exchange}</td>
              <td className="py-4 pr-4 text-muted-foreground">
                ····{ACCOUNT.keyTail} · read-only
              </td>
              <td className="py-4 px-4 text-right">
                {state === "never" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  `$${fmtMoney(ACCOUNT.balanceUsdt)}`
                )}
              </td>
              <td className="py-4 px-4 text-right">
                {state === "never"
                  ? "never"
                  : state === "failed"
                    ? `! failed ${ago(ACCOUNT.failedAt)}`
                    : hhmm(ACCOUNT.lastSyncedAt)}
              </td>
              <td className="py-4 pl-4 text-right whitespace-nowrap">
                <span className="inline-flex gap-3">
                  <button className="hover:text-foreground">sync →</button>
                  <button className="text-muted-foreground hover:text-foreground">
                    edit
                  </button>
                  <button className="text-muted-foreground hover:text-foreground">
                    unlink
                  </button>
                </span>
              </td>
            </tr>
            {OTHER_ACCOUNTS.map(a => (
              <tr
                key={a.id}
                className="border-b border-border last:border-b-0 align-top"
              >
                <td className="py-4 pr-4 font-medium">{a.name}</td>
                <td className="py-4 pr-4">{a.exchange}</td>
                <td className="py-4 pr-4 text-muted-foreground">
                  ····{a.keyTail} · read-only
                </td>
                <td className="py-4 px-4 text-right text-muted-foreground">
                  —
                </td>
                <td className="py-4 px-4 text-right">never</td>
                <td className="py-4 pl-4 text-right">
                  <span className="inline-flex gap-3">
                    <button className="hover:text-foreground">select →</button>
                    <button className="hover:text-foreground">sync →</button>
                    <button className="text-muted-foreground hover:text-foreground">
                      unlink
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {state === "failed" && <SyncLine state={state} />}
      {linking && (
        <section className="space-y-6 border-t border-border pt-8">
          <SectionHeader>link account</SectionHeader>
          <LinkForm inline showError={showError} />
        </section>
      )}
    </div>
  );
}

function TradesA({
  state,
  onOpen,
}: {
  state: AccountState;
  onOpen: () => void;
}) {
  return (
    <div className="space-y-10">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <p className="text-title">trades</p>
        <SyncLine state={state} />
      </header>
      {state === "never" ? (
        <section className="border-t border-border pt-16 text-center">
          <p>nothing synced yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            sync pulls the last 30 days of fills from binance.
          </p>
          <Button variant="outline" className="mt-6">
            sync now
          </Button>
        </section>
      ) : (
        <section className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 text-left text-label font-normal">
                  opened ↓
                </th>
                <th className="py-3 px-4 text-left text-label font-normal">
                  symbol
                </th>
                <th className="py-3 px-4 text-left text-label font-normal">
                  side
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  qty
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  entry
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  exit
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  size usdt
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  stop / target
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  fee
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  pnl
                </th>
                <th className="py-3 pl-4" />
              </tr>
            </thead>
            <tbody>
              {TRADES.map(t => (
                <tr
                  key={t.id}
                  className="border-b border-border last:border-b-0 align-top"
                >
                  <td className="py-4 pr-4 whitespace-nowrap text-muted-foreground">
                    {time(t.openTime)}
                    {t.openTimeApprox && <span className="text-label"> ~</span>}
                  </td>
                  <td className="py-4 px-4 font-medium">
                    {t.symbol.toLowerCase()}{" "}
                    {t.status === "open" && (
                      <span className="text-label">[open]</span>
                    )}
                  </td>
                  <td className="py-4 px-4">{t.side}</td>
                  <td className="py-4 px-4 text-right">
                    {fmtDecimal(t.quantity)}
                  </td>
                  <td className="py-4 px-4 text-right">{px(t.entryPrice)}</td>
                  <td className="py-4 px-4 text-right">{px(t.exitPrice)}</td>
                  <td className="py-4 px-4 text-right">
                    {fmtMoney(t.positionSizeUsdt)}
                  </td>
                  <td className="py-4 px-4 text-right text-muted-foreground">
                    {px(t.stopLossPrice)} / {px(t.takeProfitPrice)}
                  </td>
                  <td className="py-4 px-4 text-right text-muted-foreground">
                    {fmtMoney(t.feeUsd)}
                  </td>
                  <td className="py-4 px-4 text-right font-medium">
                    <Pnl value={t.realizedPnlUsd} />
                  </td>
                  <td className="py-4 pl-4 text-right">
                    <button onClick={onOpen} className="hover:text-foreground">
                      view →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function DetailA({ t }: { t: Trade }) {
  const isOpen = t.status === "open";
  return (
    <div className="space-y-16">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label">← trades</span>
        <Button variant="outline">打开 AI 复盘</Button>
      </div>
      <header className="space-y-2">
        <div className="flex items-baseline gap-3">
          <p className="text-title">{t.symbol.toLowerCase()}</p>
          {isOpen && <span className="text-label">[open]</span>}
        </div>
        <p className="text-label">
          {t.side} · {time(t.openTime)}
          {t.openTimeApprox && " (approximate)"} · binance
        </p>
      </header>
      <section>
        <p className="text-label">
          {isOpen ? "position" : "pnl · net of fees"}
        </p>
        {isOpen ? (
          <p className="text-display mt-2">open</p>
        ) : (
          <p
            className={cn(
              "text-display mt-2",
              toneClass(pnlTone(t.realizedPnlUsd))
            )}
          >
            {signed(t.realizedPnlUsd ?? 0)}
          </p>
        )}
        <p className="text-label mt-4">
          {isOpen
            ? `since ${time(t.openTime)}`
            : `${(t.realizedPnlUsd ?? 0) > 0 ? "win" : (t.realizedPnlUsd ?? 0) < 0 ? "loss" : "breakeven"} · held ${fmtDuration(t.openTime, t.closeTime ?? NOW)}`}
        </p>
      </section>
      <section className="space-y-6">
        <SectionHeader>position</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 tabular-nums">
          <Field label="entry">{px(t.entryPrice)}</Field>
          <Field label="exit">{px(t.exitPrice)}</Field>
          <Field label="quantity">{fmtDecimal(t.quantity)}</Field>
          <Field label="size (usdt)">{fmtMoney(t.positionSizeUsdt)}</Field>
          <Field label="opened">
            {time(t.openTime)}
            {t.openTimeApprox && (
              <span className="text-label">
                {" "}
                · approximate, before the sync window
              </span>
            )}
          </Field>
          <Field label="closed">{t.closeTime ? time(t.closeTime) : "—"}</Field>
          <Field label="fees">${fmtMoney(t.feeUsd)}</Field>
          <Field label="gross pnl">
            {t.realizedPnlUsd == null
              ? "—"
              : signed(t.realizedPnlUsd + t.feeUsd)}
          </Field>
        </div>
      </section>
      <section className="space-y-6">
        <SectionHeader>protection</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 tabular-nums">
          <Level label="stop loss" value={t.stopLossPrice} editable={!isOpen} />
          <Level
            label="take profit"
            value={t.takeProfitPrice}
            editable={!isOpen}
          />
          <Field label="source">
            {isOpen
              ? "exchange · refreshed each sync"
              : t.stopLossPrice != null
                ? "exchange · frozen at close"
                : "not seen while open"}
          </Field>
        </div>
      </section>
    </div>
  );
}

function DashboardA({ state }: { state: AccountState }) {
  const never = state === "never";
  return (
    <div className="space-y-16">
      <section>
        <p className="text-label">balance</p>
        <p
          className={cn("text-display mt-2", never && "text-muted-foreground")}
        >
          {never ? "—" : `$${fmtMoney(ACCOUNT.balanceUsdt)}`}
        </p>
        {!never && STATS.openCount > 0 && (
          <p
            className={cn(
              "mt-3 text-2xl font-medium tabular-nums",
              toneClass(pnlTone(ACCOUNT.unrealizedPnlUsdt))
            )}
          >
            {signed(ACCOUNT.unrealizedPnlUsdt)}{" "}
            <span className="text-label">unrealized</span>
          </p>
        )}
        <div className="mt-4">
          <SyncLine state={state} />
        </div>
      </section>
      {never ? (
        <section className="border-t border-border pt-16 text-center">
          <p>this account has never synced.</p>
          <Button variant="outline" className="mt-6">
            sync now
          </Button>
        </section>
      ) : (
        <>
          <section>
            <SectionHeader>realized · synced trades</SectionHeader>
            <p
              className={cn(
                "mt-6 text-2xl font-medium tabular-nums",
                toneClass(pnlTone(STATS.realized))
              )}
            >
              {signed(STATS.realized)}{" "}
              <span className="text-label">
                over {STATS.trades} closed trades · fees ${fmtMoney(STATS.fees)}
              </span>
            </p>
          </section>
          <section>
            <SectionHeader>performance</SectionHeader>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 pt-8 pb-8 border-b border-border tabular-nums">
              {[
                [
                  "win rate",
                  `${STATS.winRate.toFixed(1)}%`,
                  `${STATS.wins} of ${STATS.trades}`,
                  STATS.winRate >= 50 ? "win" : "loss",
                ],
                [
                  "profit factor",
                  STATS.profitFactor?.toFixed(2) ?? "n/a",
                  "gross profit ÷ gross loss",
                  undefined,
                ],
                [
                  "expectancy",
                  signed(STATS.expectancy),
                  "per trade",
                  pnlTone(STATS.expectancy),
                ],
                [
                  "losing streak",
                  `${STATS.longestLosingStreak}`,
                  "max consecutive",
                  undefined,
                ],
              ].map(([l, v, n, tone]) => (
                <div key={l as string} className="space-y-2">
                  <p className="text-label">{l}</p>
                  <p
                    className={cn(
                      "text-3xl font-medium",
                      toneClass(tone as Tone)
                    )}
                  >
                    {v}
                  </p>
                  <p className="text-label">{n}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <SectionHeader>open</SectionHeader>
            <p className="mt-6 text-sm tabular-nums">
              {STATS.openCount} positions · ${fmtMoney(STATS.openExposure)}{" "}
              exposure · {(STATS.openExposure / ACCOUNT.balanceUsdt).toFixed(2)}
              × balance
            </p>
          </section>
        </>
      )}
    </div>
  );
}

// =================================================================== variant B
// "dossier": one account at a time, read top to bottom, no tables.

function AccountsB({
  state,
  showError,
}: {
  state: AccountState;
  showError: boolean;
}) {
  const never = state === "never";
  return (
    <div className="space-y-16">
      <header className="space-y-2">
        <p className="text-title">{ACCOUNT.name}</p>
        <p className="text-label">
          binance usdⓈ-m · key ····{ACCOUNT.keyTail} · read-only verified{" "}
          {fmtDate(T(31))}
        </p>
      </header>
      <section>
        <p className="text-label">wallet balance</p>
        <p
          className={cn("text-display mt-2", never && "text-muted-foreground")}
        >
          {never ? "—" : `$${fmtMoney(ACCOUNT.balanceUsdt)}`}
        </p>
        <div className="mt-4">
          <SyncLine state={state} />
        </div>
      </section>
      <section className="space-y-3 text-sm max-w-xl">
        <p>{ACCOUNT.notes}</p>
        <p className="text-label">
          linked {fmtDate(T(31))} · backfilled 30 days · {TRADES.length} trades
          · {STATS.openCount} open
        </p>
        <div className="flex gap-6 text-label pt-2">
          <button className="hover:text-foreground">edit name / notes</button>
          <button className="hover:text-foreground">replace api key</button>
          <button className="hover:text-foreground">
            unlink · deletes its trades
          </button>
        </div>
      </section>
      <section className="space-y-4">
        <SectionHeader>other accounts</SectionHeader>
        {OTHER_ACCOUNTS.map(a => (
          <div
            key={a.id}
            className="flex items-baseline justify-between gap-4 flex-wrap text-sm"
          >
            <span className="font-medium">
              {a.name} <span className="text-label">····{a.keyTail}</span>
            </span>
            <span className="text-label">
              never synced ·{" "}
              <button className="underline underline-offset-4 hover:text-foreground">
                select →
              </button>
            </span>
          </div>
        ))}
      </section>
      <section className="space-y-6">
        <SectionHeader>link another account</SectionHeader>
        <LinkForm inline showError={showError} />
      </section>
    </div>
  );
}

function TradeLine({ t, onOpen }: { t: Trade; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left grid grid-cols-[6rem_1fr_auto] gap-x-6 items-baseline py-3 border-b border-border last:border-b-0 tabular-nums text-sm hover:text-foreground"
    >
      <span className="text-muted-foreground">
        {hhmm(t.closeTime ?? t.openTime)}
      </span>
      <span>
        <span className="font-medium">{t.symbol.toLowerCase()}</span> {t.side}{" "}
        {fmtDecimal(t.quantity)} @ {px(t.entryPrice)}
        {t.exitPrice != null && <> → {px(t.exitPrice)}</>}
        {t.status === "open" && (
          <span className="text-label">
            {" "}
            · stop {px(t.stopLossPrice)} · target {px(t.takeProfitPrice)}
          </span>
        )}
        {t.openTimeApprox && (
          <span className="text-label"> · opened before the window</span>
        )}
      </span>
      <Pnl value={t.realizedPnlUsd} className="font-medium" />
    </button>
  );
}

function TradesB({
  state,
  onOpen,
}: {
  state: AccountState;
  onOpen: () => void;
}) {
  if (state === "never")
    return (
      <div className="space-y-10">
        <p className="text-title">trades</p>
        <section className="border-t border-border pt-16 max-w-md">
          <p>nothing synced yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            sync pulls the last 30 days of fills from binance and folds them
            into trades.
          </p>
          <Button variant="outline" className="mt-6">
            sync now
          </Button>
        </section>
      </div>
    );
  const days = new Map<string, Trade[]>();
  for (const t of closed) {
    const k = fmtDate(t.closeTime ?? t.openTime);
    days.set(k, [...(days.get(k) ?? []), t]);
  }
  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <p className="text-title">trades</p>
        <SyncLine state={state} />
      </header>
      <section className="space-y-2">
        <SectionHeader>open · {open.length}</SectionHeader>
        {open.map(t => (
          <TradeLine key={t.id} t={t} onOpen={onOpen} />
        ))}
      </section>
      {[...days.entries()].map(([day, ts]) => {
        const sum = ts.reduce((s, t) => s + (t.realizedPnlUsd ?? 0), 0);
        return (
          <section key={day} className="space-y-2">
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <h2 className="text-label">{day}</h2>
              <Pnl value={sum} className="text-label" />
            </div>
            {ts.map(t => (
              <TradeLine key={t.id} t={t} onOpen={onOpen} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function DetailB({ t }: { t: Trade }) {
  const isOpen = t.status === "open";
  return (
    <div className="space-y-16">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label">← trades</span>
        <Button variant="outline">打开 AI 复盘</Button>
      </div>
      <header className="space-y-2">
        <p className="text-title">
          {t.symbol.toLowerCase()} {t.side}
        </p>
        <p className="text-label">
          {fmtDecimal(t.quantity)} · ${fmtMoney(t.positionSizeUsdt)} · binance
          {t.openTimeApprox && " · opened before the sync window"}
        </p>
      </header>
      <section>
        <p className="text-label">{isOpen ? "position" : "net"}</p>
        {isOpen ? (
          <p className="text-display mt-2">open</p>
        ) : (
          <p
            className={cn(
              "text-display mt-2",
              toneClass(pnlTone(t.realizedPnlUsd))
            )}
          >
            {signed(t.realizedPnlUsd ?? 0)}
          </p>
        )}
        {!isOpen && (
          <p className="text-label mt-4">
            gross {signed((t.realizedPnlUsd ?? 0) + t.feeUsd)} − fees $
            {fmtMoney(t.feeUsd)}
          </p>
        )}
      </section>
      <section className="grid grid-cols-2 gap-x-12 tabular-nums">
        <div className="space-y-6 border-r border-border pr-8">
          <SectionHeader>in</SectionHeader>
          <p className="text-3xl font-medium">{px(t.entryPrice)}</p>
          <p className="text-label">
            {time(t.openTime)}
            {t.openTimeApprox && " ~"}
          </p>
          <p className="text-sm">
            {fmtDecimal(t.quantity)}{" "}
            {t.symbol.replace("USDT", "").toLowerCase()} · $
            {fmtMoney(t.positionSizeUsdt)}
          </p>
        </div>
        <div className="space-y-6 pl-4">
          <SectionHeader>out</SectionHeader>
          <p
            className={cn(
              "text-3xl font-medium",
              !isOpen && toneClass(pnlTone(t.realizedPnlUsd))
            )}
          >
            {isOpen ? "—" : px(t.exitPrice)}
          </p>
          <p className="text-label">
            {t.closeTime ? time(t.closeTime) : "still open"}
          </p>
          <p className="text-sm">
            {t.closeTime
              ? `held ${fmtDuration(t.openTime, t.closeTime)}`
              : `open for ${fmtDuration(t.openTime, NOW)}`}
          </p>
        </div>
      </section>
      <section className="space-y-3 text-sm">
        <SectionHeader>protection</SectionHeader>
        {t.stopLossPrice == null && t.takeProfitPrice == null && !isOpen ? (
          <div className="grid grid-cols-2 gap-x-8 pt-2">
            <Level label="stop" value={null} editable />
            <Level label="target" value={null} editable />
          </div>
        ) : (
          <p className="pt-2">
            stop {px(t.stopLossPrice)} · target {px(t.takeProfitPrice)}{" "}
            <span className="text-label">
              ·{" "}
              {isOpen
                ? "live from binance, refreshed each sync"
                : "as set on binance when the trade closed"}
            </span>
          </p>
        )}
      </section>
    </div>
  );
}

function DashboardB({ state }: { state: AccountState }) {
  const never = state === "never";
  return (
    <div className="space-y-16 max-w-2xl">
      <section>
        <p className="text-label">{ACCOUNT.name} · balance</p>
        <p
          className={cn("text-display mt-2", never && "text-muted-foreground")}
        >
          {never ? "—" : `$${fmtMoney(ACCOUNT.balanceUsdt)}`}
        </p>
        <div className="mt-4">
          <SyncLine state={state} />
        </div>
      </section>
      {never ? (
        <p className="text-sm">
          sync once and this page fills itself from your binance fills.
        </p>
      ) : (
        <section className="space-y-4 text-sm tabular-nums">
          <p>
            <Pnl value={ACCOUNT.unrealizedPnlUsdt} className="font-medium" />{" "}
            unrealized on {STATS.openCount} open positions · $
            {fmtMoney(STATS.openExposure)} exposure
          </p>
          <p className="border-t border-border pt-4">
            <Pnl value={STATS.realized} className="font-medium" /> realized over{" "}
            {STATS.trades} closed trades since {fmtDate(T(30))}, after $
            {fmtMoney(STATS.fees)} in fees
          </p>
          <p>
            {STATS.wins} won, {STATS.trades - STATS.wins} lost or flat ·{" "}
            <span className={toneClass(STATS.winRate >= 50 ? "win" : "loss")}>
              {STATS.winRate.toFixed(1)}%
            </span>
          </p>
          <p>
            profit factor {STATS.profitFactor?.toFixed(2)} · expectancy{" "}
            <Pnl value={STATS.expectancy} /> per trade
          </p>
          <p>longest losing streak {STATS.longestLosingStreak}</p>
        </section>
      )}
    </div>
  );
}

// =================================================================== variant C
// "instrument": numeral-first, asymmetric, the price ruler as the detail's anchor.

function AccountsC({
  state,
  showError,
}: {
  state: AccountState;
  showError: boolean;
}) {
  const never = state === "never";
  return (
    <div className="space-y-20">
      <h2 className="sr-only">accounts</h2>
      <section>
        <p className="text-label">
          {ACCOUNT.name} · binance · ····{ACCOUNT.keyTail} · active
        </p>
        <p
          className={cn("text-display mt-2", never && "text-muted-foreground")}
        >
          {never ? "—" : `$${fmtMoney(ACCOUNT.balanceUsdt)}`}
        </p>
        <div className="mt-4 flex items-baseline gap-6 flex-wrap">
          <SyncLine state={state} compact />
          <span className="text-label">
            <button className="hover:text-foreground">edit</button> ·{" "}
            <button className="hover:text-foreground">unlink</button>
          </span>
        </div>
      </section>
      {OTHER_ACCOUNTS.map(a => (
        <section key={a.id} className="pl-[12vw]">
          <p className="text-label">
            {a.name} · {a.exchange} · ····{a.keyTail}
          </p>
          <p className="text-display mt-2 text-muted-foreground">—</p>
          <div className="mt-4 flex items-baseline gap-6">
            <SyncLine state="never" compact />
            <span className="text-label">
              <button className="hover:text-foreground">select →</button>
            </span>
          </div>
        </section>
      ))}
      <section className="border-t border-border pt-10">
        <p className="text-label mb-8">link account</p>
        <LinkForm inline showError={showError} />
      </section>
    </div>
  );
}

function TradesC({
  state,
  onOpen,
}: {
  state: AccountState;
  onOpen: () => void;
}) {
  if (state === "never")
    return (
      <div className="space-y-6">
        <p className="text-label">trades</p>
        <p className="text-display text-muted-foreground">—</p>
        <SyncLine state={state} />
      </div>
    );
  let running = 0;
  const rows = [...closed]
    .reverse()
    .map(t => {
      running += t.realizedPnlUsd ?? 0;
      return { t, running };
    })
    .reverse();
  return (
    <div className="space-y-20">
      <section className="space-y-10">
        <p className="text-label">open · {open.length}</p>
        {open.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={onOpen}
            className="block text-left w-full"
          >
            <p className="text-label">
              {t.symbol.toLowerCase()} {t.side} · {fmtDecimal(t.quantity)} ·
              since {time(t.openTime)}
            </p>
            <p className="text-display mt-1">{px(t.entryPrice)}</p>
            <p className="text-label mt-2">
              stop {px(t.stopLossPrice)} · target {px(t.takeProfitPrice)} · $
              {fmtMoney(t.positionSizeUsdt)}
            </p>
          </button>
        ))}
      </section>
      <section>
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <p className="text-label">closed · {closed.length}</p>
          <SyncLine state={state} />
        </div>
        <div className="tabular-nums text-sm">
          {rows.map(({ t, running }) => (
            <button
              key={t.id}
              type="button"
              onClick={onOpen}
              className="w-full grid grid-cols-[7rem_8rem_1fr_7rem_8rem] gap-x-4 py-3 border-b border-border text-left items-baseline hover:text-foreground"
            >
              <span className="text-muted-foreground">
                {fmtDate(t.closeTime ?? 0).slice(0, 6)}
                {t.openTimeApprox && " ~"}
              </span>
              <span className="font-medium">{t.symbol.toLowerCase()}</span>
              <span className="text-muted-foreground">
                {t.side} {fmtDecimal(t.quantity)} · {px(t.entryPrice)} →{" "}
                {px(t.exitPrice)}
              </span>
              <Pnl
                value={t.realizedPnlUsd}
                className="text-right font-medium"
              />
              <span className="text-right text-muted-foreground">
                {signed(running)}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function DetailC({ t }: { t: Trade }) {
  const isOpen = t.status === "open";
  return (
    <div className="space-y-16">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label">← trades</span>
        <Button variant="outline">打开 AI 复盘</Button>
      </div>
      <section>
        <p className="text-label">
          {t.symbol.toLowerCase()} {t.side} · {fmtDecimal(t.quantity)} ·{" "}
          {time(t.openTime)}
          {t.openTimeApprox && " ~"}
          {t.closeTime && ` → ${time(t.closeTime)}`}
        </p>
        {isOpen ? (
          <p className="text-display mt-2">open</p>
        ) : (
          <p
            className={cn(
              "text-display mt-2",
              toneClass(pnlTone(t.realizedPnlUsd))
            )}
          >
            {signed(t.realizedPnlUsd ?? 0)}
          </p>
        )}
        <p className="text-label mt-4">
          ${fmtMoney(t.positionSizeUsdt)} · fees ${fmtMoney(t.feeUsd)}
          {!isOpen && ` · held ${fmtDuration(t.openTime, t.closeTime ?? NOW)}`}
        </p>
      </section>
      <section className="pt-6">
        <PriceRuler t={t} />
        {!isOpen && t.stopLossPrice == null && t.takeProfitPrice == null && (
          <div className="grid grid-cols-2 gap-x-8 max-w-md mt-6">
            <Level label="stop" value={null} editable />
            <Level label="target" value={null} editable />
          </div>
        )}
        <p className="text-label mt-4">
          {isOpen
            ? "stop / target live from binance, refreshed each sync"
            : t.stopLossPrice != null
              ? "stop / target as set on binance at close"
              : "no stop or target seen on binance while this trade was open"}
          {t.openTimeApprox &&
            " · open time is the start of the sync window, not the real entry"}
        </p>
      </section>
    </div>
  );
}

function DashboardC({ state }: { state: AccountState }) {
  const never = state === "never";
  return (
    <div className="space-y-20">
      <section>
        <p className="text-label">balance</p>
        <p
          className={cn("text-display mt-2", never && "text-muted-foreground")}
        >
          {never ? "—" : `$${fmtMoney(ACCOUNT.balanceUsdt)}`}
        </p>
        <div className="mt-4">
          <SyncLine state={state} />
        </div>
      </section>
      {!never && (
        <>
          <section className="grid grid-cols-2 gap-x-12 max-w-3xl tabular-nums">
            <div>
              <p className="text-label">win rate · {STATS.trades} closed</p>
              <p
                className={cn(
                  "text-6xl font-medium mt-2",
                  toneClass(STATS.winRate >= 50 ? "win" : "loss")
                )}
              >
                {STATS.winRate.toFixed(0)}%
              </p>
            </div>
            <div className="pl-[4vw]">
              <p className="text-label">losing streak · longest</p>
              <p className="text-6xl font-medium mt-2">
                {STATS.longestLosingStreak}
              </p>
            </div>
          </section>
          <section className="text-sm tabular-nums space-y-2 border-t border-border pt-6 max-w-3xl">
            <p>
              <Pnl value={STATS.realized} className="font-medium" /> realized ·{" "}
              <Pnl value={ACCOUNT.unrealizedPnlUsdt} className="font-medium" />{" "}
              unrealized · ${fmtMoney(STATS.fees)} fees
            </p>
            <p className="text-label">
              profit factor {STATS.profitFactor?.toFixed(2)} · expectancy{" "}
              {signed(STATS.expectancy)} · {STATS.openCount} open, $
              {fmtMoney(STATS.openExposure)} exposure
            </p>
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- switcher

const VARIANTS = [
  { key: "A", name: "ledger" },
  { key: "B", name: "dossier" },
  { key: "C", name: "instrument" },
];
const SCREENS = ["accounts", "trades", "trade", "dashboard"];
const STATES: AccountState[] = ["synced", "never", "failed"];
const TRADE_IDS = ["14", "12", "7", "6"]; // open w/ sl+tp · closed w/ frozen levels · closed, null levels · seeded

export default function PrototypeExchangeSync() {
  const { params, set } = usePrototypeParams();
  const variant = params.get("variant") ?? "A";
  const screen = params.get("screen") ?? "accounts";
  const state = (params.get("state") as AccountState) ?? "synced";
  const showError = params.get("error") === "1";
  const tradeId = Number(params.get("trade") ?? TRADE_IDS[0]);
  const trade = TRADES.find(t => t.id === tradeId) ?? TRADES[0];
  const openTrade = () => set("screen", "trade");

  const screens = {
    A: {
      accounts: <AccountsA state={state} showError={showError} />,
      trades: <TradesA state={state} onOpen={openTrade} />,
      trade: <DetailA t={trade} />,
      dashboard: <DashboardA state={state} />,
    },
    B: {
      accounts: <AccountsB state={state} showError={showError} />,
      trades: <TradesB state={state} onOpen={openTrade} />,
      trade: <DetailB t={trade} />,
      dashboard: <DashboardB state={state} />,
    },
    C: {
      accounts: <AccountsC state={state} showError={showError} />,
      trades: <TradesC state={state} onOpen={openTrade} />,
      trade: <DetailC t={trade} />,
      dashboard: <DashboardC state={state} />,
    },
  } as const;
  const v =
    (screens as Record<string, Record<string, React.ReactNode>>)[variant] ??
    screens.A;

  return (
    <div className="pb-24">
      <p className="text-label mb-8">
        prototype · exchange sync · variant {variant} · {screen} · account{" "}
        {state}
        {screen === "trade" && (
          <>
            {" "}
            · trade{" "}
            {TRADE_IDS.map(id => (
              <button
                key={id}
                type="button"
                onClick={() => set("trade", id)}
                className={cn(
                  "ml-2 underline-offset-4",
                  String(tradeId) === id
                    ? "underline text-foreground"
                    : "hover:text-foreground"
                )}
              >
                #{id}
              </button>
            ))}
          </>
        )}
        {screen === "accounts" && (
          <>
            {" "}
            ·{" "}
            <button
              type="button"
              onClick={() => set("error", showError ? "0" : "1")}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {showError ? "hide" : "show"} read-only error
            </button>
          </>
        )}
      </p>
      {v[screen] ?? v.accounts}
      <PrototypeSwitcher
        variants={VARIANTS}
        screens={SCREENS}
        states={STATES}
      />
    </div>
  );
}
