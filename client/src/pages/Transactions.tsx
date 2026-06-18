import { Button } from "@/components/ui/button";
import { CloseTradeModal } from "@/components/CloseTradeModal";
import { DeleteTradeDialog } from "@/components/transactions/DeleteTradeDialog";
import {
  TransactionsFilters,
  type Direction,
  type Outcome,
  type Status,
} from "@/components/transactions/TransactionsFilters";
import {
  TransactionsTable,
  type CloseTradePayload,
  type SortBy,
  type SortOrder,
} from "@/components/transactions/TransactionsTable";
import { useAccount } from "@/contexts/AccountContext";
import { trpc } from "@/lib/trpc";
import { type MarketCycle, type TransactionType } from "@shared/const";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

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
  const [closeTrade, setCloseTrade] = useState<CloseTradePayload | null>(null);

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

      <TransactionsFilters
        outcome={outcomeFilter}
        direction={directionFilter}
        status={statusFilter}
        marketCycle={marketCycleFilter}
        transactionType={transactionTypeFilter}
        pair={pairFilter}
        tradingPairs={tradingPairs}
        onChangeOutcome={setOutcomeFilter}
        onChangeDirection={setDirectionFilter}
        onChangeStatus={setStatusFilter}
        onChangeMarketCycle={setMarketCycleFilter}
        onChangeTransactionType={setTransactionTypeFilter}
        onChangePair={setPairFilter}
        onClear={clearFilters}
        hasFilters={hasFilters}
      />

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2
            className="h-6 w-6 animate-spin text-foreground"
            aria-label="loading"
          />
        </div>
      ) : transactions && transactions.length > 0 ? (
        <TransactionsTable
          transactions={transactions}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onToggleSort={toggleSort}
          onCloseClick={setCloseTrade}
          onDeleteClick={setDeleteId}
        />
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

      <DeleteTradeDialog
        open={deleteId !== null}
        pending={deleteMutation.isPending}
        onOpenChange={open => !open && setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate({ id: deleteId })}
      />

      <CloseTradeModal
        open={closeTrade !== null}
        onOpenChange={open => !open && setCloseTrade(null)}
        trade={closeTrade}
      />
    </div>
  );
}
