import { OpenGoals } from "@/components/goals/OpenGoals";
import { ProfitCalendar } from "@/components/ProfitCalendar";
import { SyncLine } from "@/components/sync/SyncLine";
import { SectionHeader, type Tone, fmtMoney, toneClass } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAccount } from "@/contexts/AccountContext";
import { useAutoSync, useSyncAccount } from "@/hooks/useSyncAccount";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";

function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: Tone;
  note?: string;
}) {
  return (
    <div>
      <p className="text-label">{label}</p>
      <p
        className={cn(
          "mt-2 text-4xl font-medium leading-none tabular-nums",
          toneClass(tone)
        )}
      >
        {value}
      </p>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-16">
      <h1 className="sr-only">Dashboard</h1>
      <OpenGoals />
      <AccountStats />
    </div>
  );
}

const signed = (v: number) => `${v >= 0 ? "+" : "-"}$${fmtMoney(Math.abs(v))}`;
const pnlTone = (v: number): Tone =>
  v > 0 ? "win" : v < 0 ? "loss" : undefined;

// Per-account ledger. Keeps its own loading / empty states so the goals strip
// above renders regardless of account stats.
function AccountStats() {
  const { selectedAccount, isLoading: isAccountLoading } = useAccount();
  const sync = useSyncAccount();
  useAutoSync();

  const { data: stats, isLoading } = trpc.stats.get.useQuery(
    { accountId: selectedAccount?.id ?? 0 },
    { enabled: selectedAccount !== null }
  );

  if (isAccountLoading || (selectedAccount !== null && isLoading)) {
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
      <p className="text-sm text-muted-foreground border-t border-border pt-16">
        no linked account.{" "}
        <Link href="/accounts" className="underline underline-offset-4">
          link one →
        </Link>
      </p>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">unable to load statistics.</p>
      </div>
    );
  }

  const neverSynced = stats.lastSyncedAt === null;
  const unrealized = parseFloat(stats.unrealizedPnlUsdt ?? "0");
  const realized = parseFloat(stats.realizedPnlUsd);
  const winRate =
    stats.winRate === null ? null : parseFloat(stats.winRate) * 100;
  const expectancy =
    stats.expectancyUsd === null ? null : parseFloat(stats.expectancyUsd);

  return (
    <div className="space-y-16">
      {/* Hero: the page anchor. Wallet balance as last synced. */}
      <section aria-labelledby="hero-label">
        <p id="hero-label" className="text-label">
          balance
        </p>
        {/* Not cn(): tailwind-merge drops text-display next to a text-* color. */}
        <p
          className={`text-display mt-2 tabular-nums ${neverSynced || stats.balanceUsdt === null ? "text-muted-foreground" : ""}`}
        >
          {neverSynced || stats.balanceUsdt === null
            ? "—"
            : `$${fmtMoney(stats.balanceUsdt)}`}
        </p>
        {!neverSynced && stats.openCount > 0 && (
          <p
            className={cn(
              "mt-3 text-2xl font-medium tabular-nums",
              toneClass(pnlTone(unrealized))
            )}
          >
            {signed(unrealized)} <span className="text-label">unrealized</span>
          </p>
        )}
        <div className="mt-4">
          <SyncLine
            account={selectedAccount}
            onSync={() => sync.mutate({ id: selectedAccount.id })}
            isSyncing={sync.isPending}
          />
        </div>
      </section>

      {!neverSynced && (
        <>
          <section aria-labelledby="realized-label">
            <SectionHeader id="realized-label">
              realized · synced trades
            </SectionHeader>
            <p
              className={cn(
                "mt-6 text-2xl font-medium tabular-nums",
                toneClass(pnlTone(realized))
              )}
            >
              {signed(realized)}{" "}
              <span className="text-label">
                · fees ${fmtMoney(stats.feeUsd)}
              </span>
            </p>
          </section>

          {/* Performance ledger: four headline metrics, bracketed by hairlines. */}
          <section aria-labelledby="perf-label">
            <SectionHeader id="perf-label">performance</SectionHeader>
            {stats.closedCount === 0 ? (
              <p className="text-sm text-muted-foreground pt-8">
                no closed trades in the last 30 days.
              </p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 pt-8 pb-8 border-b border-border">
                <Stat
                  label="win rate"
                  value={winRate === null ? "n/a" : `${winRate.toFixed(1)}%`}
                  tone={
                    winRate === null
                      ? undefined
                      : winRate >= 50
                        ? "win"
                        : "loss"
                  }
                  note={`${stats.winCount} of ${stats.closedCount}`}
                />
                <Stat
                  label="profit factor"
                  value={
                    stats.profitFactor === null
                      ? "n/a"
                      : parseFloat(stats.profitFactor).toFixed(2)
                  }
                  note="gross profit ÷ gross loss"
                />
                <Stat
                  label="expectancy"
                  value={expectancy === null ? "n/a" : signed(expectancy)}
                  tone={expectancy === null ? undefined : pnlTone(expectancy)}
                  note="per trade"
                />
                <Stat
                  label="losing streak"
                  value={`${stats.losingStreak}`}
                  tone={stats.losingStreak > 5 ? "loss" : undefined}
                  note="current"
                />
              </div>
            )}
          </section>

          <ProfitCalendar accountId={selectedAccount.id} />

          {stats.openCount > 0 && (
            <section aria-labelledby="open-label">
              <SectionHeader id="open-label">open</SectionHeader>
              <p className="mt-6 text-sm tabular-nums">
                {stats.openCount}{" "}
                {stats.openCount === 1 ? "position" : "positions"} · $
                {fmtMoney(stats.openExposureUsdt)} exposure
                {stats.exposureRatio !== null &&
                  ` · ${parseFloat(stats.exposureRatio).toFixed(2)}× balance`}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
