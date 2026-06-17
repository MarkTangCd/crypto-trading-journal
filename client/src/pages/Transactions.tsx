import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CloseTradeModal } from "@/components/CloseTradeModal";
import { useAccount } from "@/contexts/AccountContext";
import {
  SELECT_CLASS,
  type Tone,
  fmtDateTime,
  fmtDecimal,
  fmtMoney,
  fmtRatio,
  toneClass,
} from "@/lib/ledger";
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
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type SortBy = "createdAt" | "startTime" | "endTime" | "returnAmount";
type SortOrder = "asc" | "desc";
type Outcome = "win" | "loss" | "breakeven" | undefined;
type Direction = "long" | "short" | undefined;
type Status = "open" | "closed" | "reviewed" | undefined;

const FILTER_SELECT_CLASS = cn(SELECT_CLASS, "min-w-[8rem]");

function FilterField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label">{label}</span>
      <select
        className={FILTER_SELECT_CLASS}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function SortHeader({
  active,
  order,
  onClick,
  align,
  children,
}: {
  active: boolean;
  order: SortOrder;
  onClick: () => void;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  const indicator = active ? (order === "desc" ? "↓" : "↑") : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-label hover:text-foreground transition-colors inline-flex items-baseline gap-1",
        align === "right" && "ml-auto"
      )}
    >
      <span>{children}</span>
      {indicator && (
        <span aria-hidden="true" className="text-foreground">
          {indicator}
        </span>
      )}
    </button>
  );
}

export default function Transactions() {
  const utils = trpc.useUtils();
  const { selectedAccount } = useAccount();
  const accountId = selectedAccount?.id;

  const [sortBy, setSortBy] = useState<SortBy>("startTime");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome>(undefined);
  const [directionFilter, setDirectionFilter] = useState<Direction>(undefined);
  const [statusFilter, setStatusFilter] = useState<Status>(undefined);
  const [marketCycleFilter, setMarketCycleFilter] = useState<
    MarketCycle | undefined
  >(undefined);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<
    TransactionType | undefined
  >(undefined);
  const [pairFilter, setPairFilter] = useState<string>("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [closeTrade, setCloseTrade] = useState<{
    id: number;
    accountId: number;
    tradingPair: string;
    direction: string;
    timeFrame: string;
    startTime: number;
    entryPrice: string | null;
    positionSizeUsdt: string | null;
    plannedStopLossPrice: string | null;
    plannedTakeProfitPrice: string | null;
    plannedRiskRewardRatio: string | null;
  } | null>(null);

  const { data: transactions, isLoading } = trpc.transaction.list.useQuery(
    {
      accountId: accountId!,
      sortBy,
      sortOrder,
      outcome: outcomeFilter,
      direction: directionFilter,
      status: statusFilter,
      marketCycle: marketCycleFilter,
      transactionType: transactionTypeFilter,
      tradingPair: pairFilter || undefined,
    },
    { enabled: !!accountId }
  );

  const { data: tradingPairs } = trpc.transaction.getTradingPairs.useQuery(
    { accountId: accountId! },
    { enabled: !!accountId }
  );

  const deleteMutation = trpc.transaction.delete.useMutation({
    onSuccess: () => {
      toast.success("trade deleted");
      utils.transaction.list.invalidate();
      utils.transaction.get.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
      setDeleteId(null);
    },
    onError: error => {
      toast.error(error.message || "failed to delete trade");
    },
  });

  const toggleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const clearFilters = () => {
    setOutcomeFilter(undefined);
    setDirectionFilter(undefined);
    setStatusFilter(undefined);
    setMarketCycleFilter(undefined);
    setTransactionTypeFilter(undefined);
    setPairFilter("");
  };

  const hasFilters = Boolean(
    outcomeFilter ||
      directionFilter ||
      statusFilter ||
      marketCycleFilter ||
      transactionTypeFilter ||
      pairFilter
  );

  return (
    <div className="space-y-10">
      <h1 className="sr-only">Transactions</h1>

      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <p className="text-title">transactions</p>
        <Button variant="outline" asChild>
          <Link href="/transactions/new">new trade</Link>
        </Button>
      </header>

      <section aria-label="filters" className="border-b border-border pb-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <FilterField
            label="outcome"
            value={outcomeFilter ?? "all"}
            onChange={v =>
              setOutcomeFilter(v === "all" ? undefined : (v as Outcome))
            }
          >
            <option value="all">all</option>
            <option value="win">win</option>
            <option value="loss">loss</option>
            <option value="breakeven">breakeven</option>
          </FilterField>
          <FilterField
            label="direction"
            value={directionFilter ?? "all"}
            onChange={v =>
              setDirectionFilter(v === "all" ? undefined : (v as Direction))
            }
          >
            <option value="all">all</option>
            <option value="long">long</option>
            <option value="short">short</option>
          </FilterField>
          <FilterField
            label="status"
            value={statusFilter ?? "all"}
            onChange={v =>
              setStatusFilter(v === "all" ? undefined : (v as Status))
            }
          >
            <option value="all">all</option>
            <option value="open">open</option>
            <option value="closed">closed</option>
            <option value="reviewed">reviewed</option>
          </FilterField>
          <FilterField
            label="pair"
            value={pairFilter || "all"}
            onChange={v => setPairFilter(v === "all" ? "" : v)}
          >
            <option value="all">all</option>
            {tradingPairs?.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </FilterField>
          <FilterField
            label="cycle"
            value={marketCycleFilter ?? "all"}
            onChange={v =>
              setMarketCycleFilter(
                v === "all" ? undefined : (v as MarketCycle)
              )
            }
          >
            <option value="all">all</option>
            {MARKET_CYCLES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FilterField>
          <FilterField
            label="type"
            value={transactionTypeFilter ?? "all"}
            onChange={v =>
              setTransactionTypeFilter(
                v === "all" ? undefined : (v as TransactionType)
              )
            }
          >
            <option value="all">all</option>
            {TRANSACTION_TYPES.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </FilterField>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-label hover:text-foreground transition-colors ml-auto self-end pb-1.5"
            >
              clear filters →
            </button>
          )}
        </div>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2
            className="h-6 w-6 animate-spin text-foreground"
            aria-label="loading"
          />
        </div>
      ) : transactions && transactions.length > 0 ? (
        <section aria-label="trades" className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 text-left">
                  <SortHeader
                    active={sortBy === "startTime"}
                    order={sortOrder}
                    onClick={() => toggleSort("startTime")}
                    align="left"
                  >
                    date
                  </SortHeader>
                </th>
                <th className="py-3 px-4 text-left text-label font-normal">
                  pair
                </th>
                <th className="py-3 px-4 text-left text-label font-normal">
                  side
                </th>
                <th className="py-3 px-4 text-left text-label font-normal">
                  outcome
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  r/r
                </th>
                <th className="py-3 px-4 text-right">
                  <SortHeader
                    active={sortBy === "returnAmount"}
                    order={sortOrder}
                    onClick={() => toggleSort("returnAmount")}
                    align="right"
                  >
                    return
                  </SortHeader>
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  balance
                </th>
                <th
                  className="py-3 pl-4 text-right text-label font-normal"
                  aria-label="actions"
                />
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => {
                const outcomeTone: Tone =
                  tx.outcome === "win"
                    ? "win"
                    : tx.outcome === "loss"
                      ? "loss"
                      : undefined;
                const returnNum =
                  tx.returnAmount !== null
                    ? parseFloat(tx.returnAmount)
                    : null;
                const returnTone: Tone =
                  returnNum === null
                    ? undefined
                    : returnNum > 0
                      ? "win"
                      : returnNum < 0
                        ? "loss"
                        : undefined;
                const balanceNum =
                  tx.accountBalance !== null
                    ? parseFloat(tx.accountBalance)
                    : null;
                const meta = [
                  tx.timeFrame,
                  tx.marketCycle,
                  tx.transactionType,
                ]
                  .filter(Boolean)
                  .join(" · ")
                  .toLowerCase();
                const planMetaParts: string[] = [];
                if (tx.entryPrice) {
                  planMetaParts.push(`entry ${fmtDecimal(tx.entryPrice)}`);
                }
                if (tx.positionSizeUsdt) {
                  planMetaParts.push(
                    `size ${fmtMoney(tx.positionSizeUsdt)} usdt`
                  );
                }
                const planMeta = planMetaParts.join(" · ");
                const isOpen = tx.status === "open";
                const ratioValue = isOpen
                  ? tx.plannedRiskRewardRatio
                  : tx.riskRewardRatio;
                const ratioLabel = isOpen ? "plan" : null;
                const statusMark =
                  tx.status === "open"
                    ? "[open]"
                    : tx.status === "reviewed"
                      ? "[reviewed]"
                      : null;
                return (
                  <tr
                    key={tx.id}
                    className="border-b border-border last:border-b-0 align-top"
                  >
                    <td className="py-4 pr-4 whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(tx.startTime)}
                    </td>
                    <td className="py-4 px-4 min-w-[10rem]">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-foreground">
                          {tx.tradingPair}
                        </span>
                        {statusMark && (
                          <span className="text-label">{statusMark}</span>
                        )}
                      </div>
                      {meta && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {meta}
                        </div>
                      )}
                      {planMeta && (
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                          {planMeta}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">{tx.direction}</td>
                    <td className={cn("py-4 px-4", toneClass(outcomeTone))}>
                      {tx.outcome ? (
                        tx.outcome === "breakeven" ? (
                          "be"
                        ) : (
                          tx.outcome
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {tx.outcome === "loss" &&
                        tx.consecutiveLosses != null &&
                        tx.consecutiveLosses > 3 && (
                          <div className="mt-1 text-xs status-loss">
                            {tx.consecutiveLosses} in a row
                          </div>
                        )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {ratioValue ? (
                        <span className="inline-flex items-baseline gap-1 justify-end">
                          {ratioLabel && (
                            <span className="text-xs text-muted-foreground">
                              {ratioLabel}
                            </span>
                          )}
                          <span>{fmtRatio(ratioValue)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "py-4 px-4 text-right font-medium whitespace-nowrap",
                        toneClass(returnTone)
                      )}
                    >
                      {returnNum !== null ? (
                        <>
                          {returnNum >= 0 ? "+" : "-"}$
                          {fmtMoney(Math.abs(returnNum))}
                        </>
                      ) : (
                        <span className="text-muted-foreground font-normal">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      {balanceNum !== null ? (
                        `$${fmtMoney(balanceNum)}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-4 pl-4 text-right whitespace-nowrap text-sm">
                      <div className="inline-flex items-center gap-3">
                        {tx.status === "open" && (
                          <button
                            type="button"
                            onClick={() =>
                              setCloseTrade({
                                id: tx.id,
                                accountId: tx.accountId,
                                tradingPair: tx.tradingPair,
                                direction: tx.direction,
                                timeFrame: tx.timeFrame,
                                startTime: tx.startTime,
                                entryPrice: tx.entryPrice ?? null,
                                positionSizeUsdt: tx.positionSizeUsdt ?? null,
                                plannedStopLossPrice:
                                  tx.plannedStopLossPrice ?? null,
                                plannedTakeProfitPrice:
                                  tx.plannedTakeProfitPrice ?? null,
                                plannedRiskRewardRatio:
                                  tx.plannedRiskRewardRatio ?? null,
                              })
                            }
                            className="hover:text-foreground transition-colors"
                          >
                            close →
                          </button>
                        )}
                        {tx.tvUrl && (
                          <a
                            href={tx.tvUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="open in tradingview"
                          >
                            tv ↗
                          </a>
                        )}
                        <Link
                          href={`/transactions/${tx.id}`}
                          className="hover:text-foreground transition-colors"
                        >
                          view →
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteId(tx.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          del
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : hasFilters ? (
        <section className="border-t border-border pt-10 max-w-md">
          <p>no trades match these filters.</p>
          <p className="text-sm text-muted-foreground mt-1">
            adjust or clear the filter set.
          </p>
          <Button variant="outline" className="mt-5" onClick={clearFilters}>
            clear filters
          </Button>
        </section>
      ) : (
        <section className="border-t border-border pt-16 text-center">
          <p>no trades recorded.</p>
          <p className="text-sm text-muted-foreground mt-2">
            log a trade to start the journal.
          </p>
          <Button variant="outline" className="mt-6" asChild>
            <Link href="/transactions/new">log a trade</Link>
          </Button>
        </section>
      )}

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>delete trade?</AlertDialogTitle>
            <AlertDialogDescription>
              this removes the trade and its tagged elements. it can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteId && deleteMutation.mutate({ id: deleteId })
              }
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CloseTradeModal
        open={closeTrade !== null}
        onOpenChange={open => !open && setCloseTrade(null)}
        trade={closeTrade}
      />
    </div>
  );
}
