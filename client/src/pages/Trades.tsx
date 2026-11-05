import { Button } from "@/components/ui/button";
import { SyncLine } from "@/components/sync/SyncLine";
import { useAccount } from "@/contexts/AccountContext";
import { useSyncAccount } from "@/hooks/useSyncAccount";
import {
  SectionHeader,
  fmtDate,
  fmtDateTime,
  fmtDecimal,
  fmtMoney,
  toneClass,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { utc8Parts } from "@shared/time";
import type { Trade } from "@shared/types";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const hhmm = (ts: number) => fmtDateTime(ts).slice(-5);
// Open trades are not grouped by day, so their time carries the date.
const dayHhmm = (ts: number) => {
  const p = utc8Parts(ts);
  return `${p.monthName.toLowerCase()} ${p.day} ${p.hhmm}`;
};
const px = (v: string | null) => fmtDecimal(v, 4);

function Pnl({ value, className }: { value: number; className?: string }) {
  const tone = value > 0 ? "win" : value < 0 ? "loss" : undefined;
  return (
    <span className={cn(toneClass(tone), className)}>
      {value >= 0 ? "+" : "-"}${fmtMoney(Math.abs(value))}
    </span>
  );
}

function TradeLine({ trade }: { trade: Trade }) {
  const isOpen = trade.status === "open";
  return (
    <Link
      href={`/trades/${trade.id}`}
      className="grid grid-cols-[8rem_1fr_auto] gap-x-6 items-baseline py-3 border-b border-border last:border-b-0 tabular-nums text-sm hover:text-foreground"
    >
      <span className="text-muted-foreground">
        {isOpen
          ? `${trade.openTimeApprox ? "~" : ""}${dayHhmm(trade.openTime)}`
          : hhmm(trade.closeTime ?? trade.openTime)}
      </span>
      <span>
        <span className="font-medium">{trade.symbol.toLowerCase()}</span>{" "}
        {trade.side} {fmtDecimal(trade.quantity)} @ {px(trade.entryPrice)}
        {trade.exitPrice !== null && <> → {px(trade.exitPrice)}</>}
        {isOpen && (
          <span className="text-label">
            {" "}
            · stop {px(trade.stopLossPrice)} · target{" "}
            {px(trade.takeProfitPrice)}
          </span>
        )}
      </span>
      <Pnl
        value={parseFloat(trade.realizedPnlUsd)}
        className="font-medium text-right"
      />
    </Link>
  );
}

// Closed trades newest-first, bucketed by UTC+8 close day.
function groupByCloseDay(closed: Trade[]): [string, Trade[]][] {
  const days = new Map<string, Trade[]>();
  const sorted = [...closed].sort(
    (a, b) => (b.closeTime ?? 0) - (a.closeTime ?? 0)
  );
  for (const trade of sorted) {
    const day = fmtDate(trade.closeTime ?? trade.openTime);
    days.set(day, [...(days.get(day) ?? []), trade]);
  }
  return [...days.entries()];
}

export default function Trades() {
  const { selectedAccount, isLoading: isAccountLoading } = useAccount();
  const utils = trpc.useUtils();
  const sync = useSyncAccount();

  const { mutate: runAutoSync } = trpc.account.autoSync.useMutation({
    onSuccess: () => {
      utils.account.invalidate();
      utils.trade.invalidate();
      utils.stats.invalidate();
    },
    onError: error => {
      toast.error(error.message || "auto sync failed");
    },
  });

  useEffect(() => {
    runAutoSync();
  }, [runAutoSync]);

  const { data: trades, isLoading: isTradesLoading } = trpc.trade.list.useQuery(
    { accountId: selectedAccount?.id ?? 0 },
    { enabled: selectedAccount !== null }
  );

  if (isAccountLoading || (selectedAccount !== null && isTradesLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  if (!selectedAccount) {
    return (
      <div className="space-y-10">
        <h1 className="text-title">trades</h1>
        <p className="text-sm text-muted-foreground">
          no linked account.{" "}
          <Link href="/accounts" className="underline underline-offset-4">
            link one →
          </Link>
        </p>
      </div>
    );
  }

  if (
    selectedAccount.lastSyncedAt === null &&
    selectedAccount.lastSyncErrorCode === null
  ) {
    return (
      <div className="space-y-10">
        <h1 className="text-title">trades</h1>
        <section className="border-t border-border pt-16 max-w-md">
          <p>nothing synced yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            sync pulls the last 30 days of fills from binance and folds them
            into trades.
          </p>
          <Button
            variant="outline"
            className="mt-6"
            disabled={sync.isPending}
            onClick={() => sync.mutate({ id: selectedAccount.id })}
          >
            {sync.isPending ? "syncing…" : "sync now"}
          </Button>
        </section>
      </div>
    );
  }

  const open = (trades ?? []).filter(t => t.status === "open");
  const days = groupByCloseDay(
    (trades ?? []).filter(t => t.status === "closed")
  );

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <h1 className="text-title">trades</h1>
        <SyncLine
          account={selectedAccount}
          onSync={() => sync.mutate({ id: selectedAccount.id })}
          isSyncing={sync.isPending}
        />
      </header>

      {selectedAccount.lastSyncedAt !== null &&
        open.length === 0 &&
        days.length === 0 && (
          <p className="text-sm text-muted-foreground border-t border-border pt-16">
            no trades in the last 30 days.
          </p>
        )}

      {open.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>open · {open.length}</SectionHeader>
          {open.map(trade => (
            <TradeLine key={trade.id} trade={trade} />
          ))}
        </section>
      )}

      {days.map(([day, dayTrades]) => (
        <section key={day} className="space-y-2">
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <h2 className="text-label">{day}</h2>
            <Pnl
              value={dayTrades.reduce(
                (sum, t) => sum + parseFloat(t.realizedPnlUsd),
                0
              )}
              className="text-label"
            />
          </div>
          {dayTrades.map(trade => (
            <TradeLine key={trade.id} trade={trade} />
          ))}
        </section>
      ))}
    </div>
  );
}
