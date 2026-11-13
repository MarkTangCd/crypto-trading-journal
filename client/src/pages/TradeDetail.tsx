import { AgentDrawerToggle } from "@/components/review-agent/AgentDrawerToggle";
import { useVariant } from "@/components/journal-prototype/shared";
import { TradeLinkA } from "@/components/journal-prototype/VariantA";
import { TradeLinkB } from "@/components/journal-prototype/VariantB";
import { TradeLinkC } from "@/components/journal-prototype/VariantC";
import { Button } from "@/components/ui/button";
import {
  Field,
  INPUT_CLASS,
  type Tone,
  fmtDateTime,
  fmtDecimal,
  fmtDuration,
  fmtMoney,
  toneClass,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { parseDatetimeLocalUtc8, toDatetimeLocalUtc8 } from "@shared/time";
import type { Trade } from "@shared/types";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useParams } from "wouter";

const px = (v: string | number | null) => fmtDecimal(v, 4);
const signed = (v: number) => `${v >= 0 ? "+" : "-"}$${fmtMoney(Math.abs(v))}`;
const pnlTone = (v: number): Tone =>
  v > 0 ? "win" : v < 0 ? "loss" : undefined;

// Price-based R of a closed trade; null without a stop or a usable risk.
function rMultiple(trade: Trade): number | null {
  if (trade.stopLossPrice === null || trade.exitPrice === null) return null;
  const entry = parseFloat(trade.entryPrice);
  const exit = parseFloat(trade.exitPrice);
  const stop = parseFloat(trade.stopLossPrice);
  const risk = trade.side === "long" ? entry - stop : stop - entry;
  if (!(risk > 0)) return null;
  return (trade.side === "long" ? exit - entry : entry - exit) / risk;
}

// Horizontal ruler: stop — entry — exit — target on one axis.
function PriceRuler({ trade }: { trade: Trade }) {
  const points = [
    { key: "stop", value: trade.stopLossPrice },
    { key: "entry", value: trade.entryPrice },
    { key: "exit", value: trade.exitPrice },
    { key: "target", value: trade.takeProfitPrice },
  ].flatMap(p => (p.value === null ? [] : [{ ...p, v: parseFloat(p.value) }]));
  const values = points.map(p => p.v);
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const x = (v: number) => 6 + ((v - lo) / span) * 88;
  const exitTone = toneClass(pnlTone(parseFloat(trade.realizedPnlUsd)));

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
      {points.map((p, i) => (
        <g
          key={p.key}
          className={p.key === "exit" ? exitTone : ""}
          fill="currentColor"
        >
          <line
            x1={x(p.v)}
            y1={p.key === "entry" ? 5 : 7}
            x2={x(p.v)}
            y2={p.key === "entry" ? 13 : 11}
            stroke="currentColor"
            strokeWidth={p.key === "entry" ? 0.6 : 0.3}
          />
          <text
            x={x(p.v)}
            y={i % 2 === 0 ? 3.5 : 16.5}
            fontSize="2.2"
            textAnchor="middle"
            style={{ letterSpacing: "0.04em" }}
          >
            {p.key} {px(p.v)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function useUpdateTrade() {
  const utils = trpc.useUtils();
  return trpc.trade.update.useMutation({
    onSuccess: () => {
      toast.success("trade updated");
      utils.trade.invalidate();
      utils.stats.invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to update trade");
    },
  });
}

// Hand-edit fallback for a level binance never had on a closed trade.
function LevelEdit({
  tradeId,
  field,
  label,
}: {
  tradeId: number;
  field: "stopLossPrice" | "takeProfitPrice";
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const update = useUpdateTrade();

  return (
    <Field label={`${label} · not on exchange`} htmlFor={field}>
      {editing ? (
        <form
          className="flex items-baseline gap-4"
          onSubmit={e => {
            e.preventDefault();
            update.mutate({ id: tradeId, [field]: draft.trim() });
          }}
        >
          <input
            id={field}
            autoFocus
            className={cn(INPUT_CLASS, "max-w-[10rem]")}
            inputMode="decimal"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="price"
          />
          <button
            type="submit"
            disabled={update.isPending || draft.trim() === ""}
            className="text-label hover:text-foreground transition-colors"
          >
            {update.isPending ? "saving…" : "save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-label hover:text-foreground transition-colors"
          >
            cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          set by hand →
        </button>
      )}
    </Field>
  );
}

// Seeded trades open at the backfill start; the real entry is earlier.
function OpenTimeEdit({ trade }: { trade: Trade }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toDatetimeLocalUtc8(trade.openTime));
  const update = useUpdateTrade();

  const save = () => {
    const openTime = parseDatetimeLocalUtc8(draft);
    // Compare at the input's minute precision so the untouched default fails.
    const windowStart = parseDatetimeLocalUtc8(
      toDatetimeLocalUtc8(trade.openTime)
    );
    if (Number.isNaN(openTime) || openTime >= windowStart) {
      toast.error("open time must be before the sync window start");
      return;
    }
    update.mutate({ id: trade.id, openTime });
  };

  return (
    <Field label="open time · approximate" htmlFor="openTime">
      {editing ? (
        <form
          className="flex items-baseline gap-4"
          onSubmit={e => {
            e.preventDefault();
            save();
          }}
        >
          <input
            id="openTime"
            type="datetime-local"
            className={cn(INPUT_CLASS, "max-w-[14rem]")}
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <span className="text-label">utc+8</span>
          <button
            type="submit"
            disabled={update.isPending}
            className="text-label hover:text-foreground transition-colors"
          >
            {update.isPending ? "saving…" : "save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-label hover:text-foreground transition-colors"
          >
            cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          set the real open time →
        </button>
      )}
    </Field>
  );
}

export default function TradeDetail() {
  const [, setLocation] = useLocation();
  const variant = useVariant();
  const params = useParams<{ id: string }>();
  const tradeId = parseInt(params.id || "0");

  const {
    data: trade,
    isLoading,
    error,
  } = trpc.trade.get.useQuery(
    { id: tradeId },
    { enabled: tradeId > 0, retry: false }
  );

  if (tradeId > 0 && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  if (!trade) {
    const notFound = !error || error.data?.code === "NOT_FOUND";
    return (
      <div className="border-t border-border pt-16 text-center max-w-md mx-auto">
        <p>{notFound ? "trade not found." : "failed to load trade."}</p>
        <p className="text-sm text-muted-foreground mt-2">
          {notFound
            ? "it may have been unlinked with its account, or the link is wrong."
            : error.message}
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => setLocation("/trades")}
        >
          back to trades
        </Button>
      </div>
    );
  }

  const isOpen = trade.status === "open";
  const pnl = parseFloat(trade.realizedPnlUsd);
  const r = isOpen ? null : rMultiple(trade);
  const subLine = [
    `$${fmtMoney(trade.positionSizeUsdt)}`,
    !isOpen &&
      trade.closeTime !== null &&
      `held ${fmtDuration(trade.openTime, trade.closeTime)}`,
    r !== null && `${r >= 0 ? "+" : ""}${r.toFixed(2)}r`,
  ].filter(Boolean);
  const canSetStop = !isOpen && trade.stopLossPrice === null;
  const canSetTarget = !isOpen && trade.takeProfitPrice === null;

  return (
    <div className="space-y-16">
      <h1 className="sr-only">trade {trade.symbol}</h1>

      <div className="flex items-center justify-between gap-3">
        <Link
          href="/trades"
          className="text-label hover:text-foreground transition-colors inline-block"
        >
          ← trades
        </Link>
        {/* PROTOTYPE (TASK-88): variant C puts the journal link in the top bar. */}
        <div className="flex items-center gap-6">
          {variant === "C" && <TradeLinkC trade={trade} />}
          <AgentDrawerToggle tradeId={trade.id} />
        </div>
      </div>

      <section aria-label="result">
        <p className="text-label">
          {trade.symbol.toLowerCase()} {trade.side} ·{" "}
          {fmtDecimal(trade.quantity)} · {fmtDateTime(trade.openTime)}
          {trade.openTimeApprox && " ~"}
          {trade.closeTime !== null && ` → ${fmtDateTime(trade.closeTime)}`} ·
          fees ${fmtMoney(trade.feeUsd)}
        </p>
        {/* Not cn(): tailwind-merge drops text-display next to a text-* color. */}
        <p
          className={`text-display mt-2 ${isOpen ? "" : toneClass(pnlTone(pnl))}`}
        >
          {isOpen ? "open" : signed(pnl)}
        </p>
        <p className="text-label mt-4">{subLine.join(" · ")}</p>
        {/* PROTOTYPE (TASK-88): journal link, variant A under the result. */}
        {variant === "A" && <TradeLinkA trade={trade} />}
      </section>

      <section aria-label="price levels" className="pt-6">
        <PriceRuler trade={trade} />
        {(canSetStop || canSetTarget) && (
          <div className="grid grid-cols-2 gap-x-8 max-w-md mt-6">
            {canSetStop && (
              <LevelEdit
                tradeId={trade.id}
                field="stopLossPrice"
                label="stop"
              />
            )}
            {canSetTarget && (
              <LevelEdit
                tradeId={trade.id}
                field="takeProfitPrice"
                label="target"
              />
            )}
          </div>
        )}
        <p className="text-label mt-4">
          {isOpen
            ? "stop / target live from binance, refreshed each sync"
            : trade.stopLossPrice === null && trade.takeProfitPrice === null
              ? "no stop or target seen on binance while this trade was open"
              : "stop / target as set on binance when the trade closed"}
        </p>
      </section>

      {trade.openTimeApprox && (
        <section aria-label="open time" className="max-w-md space-y-2">
          <OpenTimeEdit trade={trade} />
          <p className="text-label">
            open time is the start of the sync window, not the real entry
          </p>
        </section>
      )}

      {/* PROTOTYPE (TASK-88): variant B closes the page with a journal section. */}
      {variant === "B" && <TradeLinkB trade={trade} />}
    </div>
  );
}
