import { Button } from "@/components/ui/button";
import CandlestickChart from "@/components/CandlestickChart";
import { useAccount } from "@/contexts/AccountContext";
import {
  Field,
  INPUT_CLASS,
  SELECT_CLASS,
  SectionHeader,
  TEXTAREA_CLASS,
  fmtMoney,
  fmtRatio,
} from "@/lib/ledger";
import { MOCK_CANDLE_DATA } from "@/lib/mockCandleData";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  MARKET_CYCLES,
  TRANSACTION_TYPES,
  type MarketCycle,
  type TransactionType,
} from "@shared/const";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const TIME_FRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

type Direction = "long" | "short" | "";

interface FormData {
  tradingPair: string;
  timeFrame: string;
  startTime: string;
  direction: Direction;
  context: string;
  tradeItems: string[];
  marketCycle: MarketCycle | "";
  transactionType: TransactionType | "";
  tvUrl: string;
  entryPrice: string;
  positionSizeUsdt: string;
  plannedStopLossPrice: string;
  plannedTakeProfitPrice: string;
}

// Decimal input pattern matching the server's tradeMath parser.
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function parsePositiveDecimal(input: string): number | null {
  const value = input.trim();
  if (!DECIMAL_PATTERN.test(value)) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type PlannedRrPreview =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; value: number };

// Mirrors server-side calculatePlannedRiskRewardRatio for UI preview only.
// Server remains authoritative — payload never includes plannedRiskRewardRatio.
function previewPlannedRiskReward(
  direction: Direction,
  entryStr: string,
  stopStr: string,
  targetStr: string
): PlannedRrPreview {
  if (!direction || !entryStr || !stopStr || !targetStr) {
    return { kind: "empty" };
  }
  const entry = parsePositiveDecimal(entryStr);
  const stop = parsePositiveDecimal(stopStr);
  const target = parsePositiveDecimal(targetStr);
  if (entry === null || stop === null || target === null) {
    return { kind: "invalid", reason: "enter positive decimals" };
  }
  if (direction === "long") {
    if (stop >= entry) {
      return { kind: "invalid", reason: "stop must be below entry" };
    }
    if (target <= entry) {
      return { kind: "invalid", reason: "target must be above entry" };
    }
    return { kind: "ok", value: (target - entry) / (entry - stop) };
  }
  // short
  if (stop <= entry) {
    return { kind: "invalid", reason: "stop must be above entry" };
  }
  if (target >= entry) {
    return { kind: "invalid", reason: "target must be below entry" };
  }
  return { kind: "ok", value: (entry - target) / (stop - entry) };
}

export default function NewTransaction() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { selectedAccount } = useAccount();
  const accountId = selectedAccount?.id;

  const { data: formDefaults, isLoading: loadingDefaults } =
    trpc.transaction.getFormDefaults.useQuery(
      { accountId: accountId! },
      { enabled: !!accountId }
    );

  const createMutation = trpc.transaction.create.useMutation({
    onSuccess: () => {
      toast.success("trade recorded");
      utils.transaction.list.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
      setLocation("/transactions");
    },
    onError: error => {
      toast.error(error.message || "failed to record trade");
    },
  });

  const [formData, setFormData] = useState<FormData>({
    tradingPair: "",
    timeFrame: "",
    startTime: "",
    direction: "",
    context: "",
    tradeItems: [],
    marketCycle: "",
    transactionType: "",
    tvUrl: "",
    entryPrice: "",
    positionSizeUsdt: "",
    plannedStopLossPrice: "",
    plannedTakeProfitPrice: "",
  });

  const plannedRrPreview = useMemo(
    () =>
      previewPlannedRiskReward(
        formData.direction,
        formData.entryPrice,
        formData.plannedStopLossPrice,
        formData.plannedTakeProfitPrice
      ),
    [
      formData.direction,
      formData.entryPrice,
      formData.plannedStopLossPrice,
      formData.plannedTakeProfitPrice,
    ]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountId) {
      toast.error("select an account first");
      return;
    }

    if (
      !formData.tradingPair ||
      !formData.timeFrame ||
      !formData.startTime ||
      !formData.direction ||
      !formData.context ||
      !formData.marketCycle ||
      !formData.transactionType ||
      !formData.entryPrice ||
      !formData.positionSizeUsdt ||
      !formData.plannedStopLossPrice ||
      !formData.plannedTakeProfitPrice
    ) {
      toast.error("fill in all required fields");
      return;
    }

    if (plannedRrPreview.kind === "invalid") {
      toast.error(`invalid plan: ${plannedRrPreview.reason}`);
      return;
    }

    const startTimestamp = new Date(formData.startTime).getTime();

    // Snapshot the selected accountId at submit time so a later account
    // switch cannot misroute this in-flight create request.
    createMutation.mutate({
      accountId,
      tradingPair: formData.tradingPair,
      timeFrame: formData.timeFrame,
      startTime: startTimestamp,
      direction: formData.direction as "long" | "short",
      context: formData.context,
      tradeItems: formData.tradeItems,
      marketCycle: formData.marketCycle as MarketCycle,
      transactionType: formData.transactionType as TransactionType,
      tvUrl: formData.tvUrl || undefined,
      entryPrice: formData.entryPrice,
      positionSizeUsdt: formData.positionSizeUsdt,
      plannedStopLossPrice: formData.plannedStopLossPrice,
      plannedTakeProfitPrice: formData.plannedTakeProfitPrice,
    });
  };

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const [tradeItemInput, setTradeItemInput] = useState("");

  const addTradeItem = () => {
    const tradeItem = tradeItemInput.trim();
    if (!tradeItem) {
      setTradeItemInput("");
      return;
    }
    setFormData(prev => ({
      ...prev,
      tradeItems: [...prev.tradeItems, tradeItem],
    }));
    setTradeItemInput("");
  };

  const handleTradeItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    addTradeItem();
  };

  if (loadingDefaults) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  const currentBalance = formDefaults?.currentBalance || "0";
  const streak = formDefaults?.consecutiveLosses ?? 0;

  return (
    <div className="space-y-12 max-w-3xl">
      <h1 className="sr-only">new trade</h1>

      <Link
        href="/transactions"
        className="text-label hover:text-foreground transition-colors inline-block"
      >
        ← transactions
      </Link>

      {/* Header */}
      <header className="space-y-2">
        <p className="text-title">open trade</p>
        <p className="text-label">log a new entry to the journal</p>
      </header>

      {/* Account meta strip: balance · streak */}
      <div className="border-y border-border py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        <div className="flex items-baseline justify-between gap-2 sm:block">
          <p className="text-label">current balance</p>
          <p className="sm:mt-1.5 tabular-nums">${fmtMoney(currentBalance)}</p>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:block">
          <p className="text-label">losing streak</p>
          <p
            className={cn(
              "sm:mt-1.5 tabular-nums",
              streak > 3 && "status-loss"
            )}
          >
            {streak}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-12">
        {/* Instrument */}
        <section className="space-y-6">
          <SectionHeader>instrument</SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
            <Field label="trading pair" htmlFor="tradingPair">
              <input
                id="tradingPair"
                type="text"
                placeholder="btcusdt"
                value={formData.tradingPair}
                onChange={e =>
                  updateField("tradingPair", e.target.value.toUpperCase())
                }
                className={cn(INPUT_CLASS, "uppercase")}
              />
            </Field>
            <Field label="timeframe" htmlFor="timeFrame">
              <select
                id="timeFrame"
                value={formData.timeFrame}
                onChange={e => updateField("timeFrame", e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {TIME_FRAMES.map(tf => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="direction" htmlFor="direction">
              <select
                id="direction"
                value={formData.direction}
                onChange={e =>
                  updateField("direction", e.target.value as Direction)
                }
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                <option value="long">long</option>
                <option value="short">short</option>
              </select>
            </Field>
          </div>
        </section>

        {/* Chart */}
        <section className="space-y-4">
          <SectionHeader>chart</SectionHeader>
          <CandlestickChart data={MOCK_CANDLE_DATA} />
          <p className="text-label">click a candle to mark the entry point.</p>
        </section>

        {/* Entry time */}
        <section className="space-y-6">
          <SectionHeader>entry time</SectionHeader>
          <Field label="started" htmlFor="startTime">
            <input
              id="startTime"
              type="datetime-local"
              value={formData.startTime}
              onChange={e => updateField("startTime", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </section>

        {/* Plan */}
        <section className="space-y-6">
          <SectionHeader>plan</SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <Field label="entry price" htmlFor="entryPrice">
              <input
                id="entryPrice"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.entryPrice}
                onChange={e => updateField("entryPrice", e.target.value)}
                className={cn(INPUT_CLASS, "tabular-nums")}
              />
            </Field>
            <Field label="position size (usdt)" htmlFor="positionSizeUsdt">
              <input
                id="positionSizeUsdt"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.positionSizeUsdt}
                onChange={e => updateField("positionSizeUsdt", e.target.value)}
                className={cn(INPUT_CLASS, "tabular-nums")}
              />
            </Field>
            <Field label="planned stop loss" htmlFor="plannedStopLossPrice">
              <input
                id="plannedStopLossPrice"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.plannedStopLossPrice}
                onChange={e =>
                  updateField("plannedStopLossPrice", e.target.value)
                }
                className={cn(INPUT_CLASS, "tabular-nums")}
              />
            </Field>
            <Field label="planned take profit" htmlFor="plannedTakeProfitPrice">
              <input
                id="plannedTakeProfitPrice"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.plannedTakeProfitPrice}
                onChange={e =>
                  updateField("plannedTakeProfitPrice", e.target.value)
                }
                className={cn(INPUT_CLASS, "tabular-nums")}
              />
            </Field>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-label">planned r/r</p>
            <p
              className={cn(
                "mt-2 text-2xl font-medium leading-none tabular-nums",
                plannedRrPreview.kind === "invalid" && "status-loss"
              )}
            >
              {plannedRrPreview.kind === "ok"
                ? fmtRatio(plannedRrPreview.value)
                : "—"}
            </p>
            {plannedRrPreview.kind === "invalid" && (
              <p className="text-label mt-2 status-loss">
                {plannedRrPreview.reason}
              </p>
            )}
          </div>
        </section>

        {/* Classification */}
        <section className="space-y-6">
          <SectionHeader>classification</SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <Field label="market cycle" htmlFor="marketCycle">
              <select
                id="marketCycle"
                value={formData.marketCycle}
                onChange={e =>
                  updateField("marketCycle", e.target.value as MarketCycle | "")
                }
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {MARKET_CYCLES.map(c => (
                  <option key={c} value={c}>
                    {c.toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="type" htmlFor="transactionType">
              <select
                id="transactionType"
                value={formData.transactionType}
                onChange={e =>
                  updateField(
                    "transactionType",
                    e.target.value as TransactionType | ""
                  )
                }
                className={SELECT_CLASS}
              >
                <option value="">—</option>
                {TRANSACTION_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t.toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* Context */}
        <section className="space-y-6">
          <SectionHeader>context</SectionHeader>
          <Field label="market background" htmlFor="context">
            <textarea
              id="context"
              rows={5}
              placeholder="state the broader market conditions."
              value={formData.context}
              onChange={e => updateField("context", e.target.value)}
              className={cn(TEXTAREA_CLASS, "min-h-[7rem]")}
            />
          </Field>
          <Field label="trade items" htmlFor="tradeItemInput">
            <div className="space-y-3">
              {formData.tradeItems.length > 0 && (
                <div
                  className="flex flex-wrap gap-2"
                  aria-label="trade item tags"
                >
                  {formData.tradeItems.map((item, index) => (
                    <span
                      key={`${item}-${index}`}
                      className="border border-border px-2 py-1 text-xs font-mono text-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}
              <input
                id="tradeItemInput"
                type="text"
                placeholder="press enter to add"
                value={tradeItemInput}
                onChange={e => setTradeItemInput(e.target.value)}
                onKeyDown={handleTradeItemKeyDown}
                className={INPUT_CLASS}
              />
            </div>
          </Field>
          <Field label="tradingview url (optional)" htmlFor="tvUrl">
            <input
              id="tvUrl"
              type="url"
              placeholder="https://www.tradingview.com/chart/..."
              value={formData.tvUrl}
              onChange={e => updateField("tvUrl", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </section>

        {/* Submit row */}
        <div className="flex items-center gap-6 pt-6 border-t border-border">
          <Button
            type="submit"
            disabled={createMutation.isPending || !accountId}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "record trade"
            )}
          </Button>
          <button
            type="button"
            onClick={() => setLocation("/transactions")}
            className="text-label hover:text-foreground transition-colors"
          >
            cancel
          </button>
        </div>
      </form>
    </div>
  );
}
