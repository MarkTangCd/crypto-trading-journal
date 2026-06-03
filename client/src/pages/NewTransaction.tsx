import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import CandlestickChart from "@/components/CandlestickChart";
import { useAccount } from "@/contexts/AccountContext";
import { getConfidenceLabel } from "@/lib/confidence";
import {
  Field,
  INPUT_CLASS,
  SELECT_CLASS,
  SectionHeader,
  TEXTAREA_CLASS,
  fmtMoney,
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
  tradingLogic: string;
  marketCycle: MarketCycle | "";
  transactionType: TransactionType | "";
  tvUrl: string;
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
      utils.stats.getBySystem.invalidate();
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
    tradingLogic: "",
    marketCycle: "",
    transactionType: "",
    tvUrl: "",
  });

  const [selectedElementIds, setSelectedElementIds] = useState<number[]>([]);

  const activeSystemElements = useMemo(
    () => formDefaults?.activeSystem?.elements || [],
    [formDefaults?.activeSystem?.elements]
  );

  const calculatedConfidence = useMemo(() => {
    if (activeSystemElements.length === 0 || selectedElementIds.length === 0) {
      return null;
    }
    const picked = activeSystemElements.filter(
      (el: { id: number }) => selectedElementIds.includes(el.id)
    );
    if (picked.length === 0) return null;
    const total = picked.reduce(
      (sum: number, el: { confidenceLevel: number }) =>
        sum + el.confidenceLevel,
      0
    );
    return parseFloat((total / picked.length).toFixed(1));
  }, [activeSystemElements, selectedElementIds]);

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
      !formData.tradingLogic ||
      !formData.marketCycle ||
      !formData.transactionType
    ) {
      toast.error("fill in all required fields");
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
      tradingLogic: formData.tradingLogic,
      marketCycle: formData.marketCycle as MarketCycle,
      transactionType: formData.transactionType as TransactionType,
      tvUrl: formData.tvUrl || undefined,
      selectedElementIds,
    });
  };

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleElement = (elementId: number) => {
    setSelectedElementIds(prev =>
      prev.includes(elementId)
        ? prev.filter(id => id !== elementId)
        : [...prev, elementId]
    );
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

  const activeSystem = formDefaults?.activeSystem;
  const currentBalance = formDefaults?.currentBalance || "0";
  const streak = formDefaults?.consecutiveLosses ?? 0;
  const confidenceLabel =
    calculatedConfidence !== null
      ? getConfidenceLabel(calculatedConfidence).toLowerCase()
      : null;

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

      {/* Account meta strip: system · balance · streak */}
      <div className="border-y border-border py-4 grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3">
        <div className="flex items-baseline justify-between gap-2 sm:block">
          <p className="text-label">system</p>
          <p className="sm:mt-1.5 flex items-baseline gap-2 flex-wrap">
            {activeSystem ? (
              <>
                <span className="font-medium text-foreground">
                  {activeSystem.name}
                </span>
                <button
                  type="button"
                  onClick={() => setLocation("/trading-systems")}
                  className="text-label hover:text-foreground transition-colors"
                >
                  change →
                </button>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">none</span>
                <button
                  type="button"
                  onClick={() => setLocation("/trading-systems")}
                  className="text-label hover:text-foreground transition-colors"
                >
                  select →
                </button>
              </>
            )}
          </p>
        </div>
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

      {/* Hero: calculated confidence (live) */}
      <section aria-labelledby="conf-label">
        <p id="conf-label" className="text-label">
          confidence
        </p>
        <p
          className={cn(
            "text-display mt-2 tabular-nums",
            calculatedConfidence === null && "text-muted-foreground"
          )}
        >
          {calculatedConfidence !== null
            ? `${calculatedConfidence}/5`
            : "—/5"}
        </p>
        <p className="text-label mt-3">
          {calculatedConfidence !== null
            ? `${selectedElementIds.length} of ${activeSystemElements.length} elements · ${confidenceLabel}`
            : activeSystemElements.length > 0
              ? "select trading elements below"
              : "no active system — confidence won't be computed"}
        </p>
      </section>

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

        {/* Context */}
        <section className="space-y-6">
          <SectionHeader>context</SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <Field label="market cycle" htmlFor="marketCycle">
              <select
                id="marketCycle"
                value={formData.marketCycle}
                onChange={e =>
                  updateField(
                    "marketCycle",
                    e.target.value as MarketCycle | ""
                  )
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

        {/* Elements */}
        {activeSystemElements.length > 0 && (
          <section className="space-y-6">
            <SectionHeader>elements</SectionHeader>
            <ul className="divide-y divide-border border-b border-border">
              {activeSystemElements.map(
                (element: {
                  id: number;
                  name: string;
                  confidenceLevel: number;
                  description?: string | null;
                }) => {
                  const checked = selectedElementIds.includes(element.id);
                  return (
                    <li key={element.id}>
                      <label className="flex items-baseline gap-3 py-3 cursor-pointer group">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleElement(element.id)}
                          className="rounded-none translate-y-0.5"
                        />
                        <span
                          className={cn(
                            "flex-1 font-medium transition-colors",
                            !checked &&
                              "text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          {element.name}
                          {element.description && (
                            <span className="text-muted-foreground font-normal ml-2 text-xs">
                              · {element.description}
                            </span>
                          )}
                        </span>
                        <span className="text-label tabular-nums">
                          {element.confidenceLevel}/5
                        </span>
                      </label>
                    </li>
                  );
                }
              )}
            </ul>
          </section>
        )}

        {/* Thesis */}
        <section className="space-y-6">
          <SectionHeader>thesis</SectionHeader>
          <Field label="why this trade?" htmlFor="tradingLogic">
            <textarea
              id="tradingLogic"
              rows={5}
              placeholder="state the setup, the trigger, the invalidation."
              value={formData.tradingLogic}
              onChange={e => updateField("tradingLogic", e.target.value)}
              className={cn(TEXTAREA_CLASS, "min-h-[7rem]")}
            />
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
          <Button type="submit" disabled={createMutation.isPending || !accountId}>
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
