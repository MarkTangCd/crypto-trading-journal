import { Button } from "@/components/ui/button";
import {
  SectionHeader,
  type Tone,
  fmtMoney,
  toneClass,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAccount } from "@/contexts/AccountContext";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";

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
  const [, setLocation] = useLocation();
  const { selectedAccount } = useAccount();
  const accountId = selectedAccount?.id;

  const { data: stats, isLoading: statsLoading } = trpc.stats.get.useQuery(
    { accountId: accountId! },
    { enabled: !!accountId }
  );
  const { data: systemStats, isLoading: systemStatsLoading } =
    trpc.stats.getBySystem.useQuery(
      { accountId: accountId! },
      { enabled: !!accountId }
    );

  const isLoading = statsLoading || systemStatsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">unable to load statistics.</p>
      </div>
    );
  }

  const balanceChange = stats.latestBalance - stats.originalBalance;
  const balanceChangePercent =
    stats.originalBalance > 0
      ? (balanceChange / stats.originalBalance) * 100
      : 0;

  const balanceTone: Tone =
    balanceChange > 0 ? "win" : balanceChange < 0 ? "loss" : undefined;

  const sortedSystemStats = systemStats
    ? [...systemStats].sort((a, b) => b.winRate - a.winRate)
    : [];

  const profitFactor =
    stats.avgLoss > 0 ? stats.avgProfit / stats.avgLoss : null;

  const expectancy =
    stats.totalTrades > 0 ? stats.totalReward / stats.totalTrades : 0;

  return (
    <div className="space-y-16">
      <h1 className="sr-only">Dashboard</h1>

      {/* Hero: the page anchor. One numeral, one delta, one footnote. */}
      <section aria-labelledby="hero-label">
        <p id="hero-label" className="text-label">
          balance
        </p>
        <p className="text-display mt-2 tabular-nums">
          ${fmtMoney(stats.latestBalance)}
        </p>
        {stats.totalTrades > 0 && (
          <p
            className={cn(
              "mt-3 text-2xl font-medium tabular-nums",
              toneClass(balanceTone)
            )}
          >
            <span>
              {balanceChange >= 0 ? "+" : "-"}$
              {fmtMoney(Math.abs(balanceChange))}
            </span>
            <span className="text-muted-foreground mx-3" aria-hidden="true">
              ·
            </span>
            <span>
              {balanceChangePercent >= 0 ? "+" : ""}
              {balanceChangePercent.toFixed(2)}%
            </span>
          </p>
        )}
        <p className="text-label mt-4">
          since ${fmtMoney(stats.originalBalance)}
        </p>
      </section>

      {/* Performance ledger: four headline metrics, bracketed by hairlines. */}
      {stats.totalTrades > 0 && (
        <section aria-labelledby="perf-label">
          <SectionHeader id="perf-label">performance</SectionHeader>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 pt-8 pb-8 border-b border-border">
            <Stat
              label="win rate"
              value={`${stats.winRate.toFixed(1)}%`}
              tone={stats.winRate >= 50 ? "win" : "loss"}
              note={`${stats.winCount} of ${stats.totalTrades}`}
            />
            <Stat
              label="profit factor"
              value={profitFactor !== null ? profitFactor.toFixed(2) : "n/a"}
              note="avg profit ÷ avg loss"
            />
            <Stat
              label="expectancy"
              value={`$${fmtMoney(expectancy)}`}
              tone={expectancy >= 0 ? "win" : "loss"}
              note="per trade"
            />
            <Stat
              label="losing streak"
              value={`${stats.losingStreak}`}
              tone={stats.losingStreak > 5 ? "loss" : undefined}
              note="max consecutive"
            />
          </div>
        </section>
      )}

      {/* By-system ledger: a real data table, instrument-grade alignment. */}
      {sortedSystemStats.length > 0 && (
        <section aria-labelledby="sys-label">
          <SectionHeader
            id="sys-label"
            action={{
              label: "manage systems",
              onClick: () => setLocation("/trading-systems"),
            }}
          >
            by system
          </SectionHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 text-label font-normal text-left">
                    system
                  </th>
                  <th className="py-3 px-4 text-label font-normal text-right">
                    win rate
                  </th>
                  <th className="py-3 px-4 text-label font-normal text-right">
                    trades
                  </th>
                  <th className="py-3 px-4 text-label font-normal text-right whitespace-nowrap">
                    w / l / be
                  </th>
                  <th className="py-3 pl-4 text-label font-normal text-right">
                    net
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSystemStats.map(sys => {
                  const sysTone: Tone = sys.winRate >= 50 ? "win" : "loss";
                  const netTone: Tone =
                    sys.totalReturn > 0
                      ? "win"
                      : sys.totalReturn < 0
                        ? "loss"
                        : undefined;
                  return (
                    <tr
                      key={sys.systemId}
                      className="border-b border-border last:border-b-0 align-top"
                    >
                      <td className="py-4 pr-4">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-medium text-foreground">
                            {sys.systemName}
                          </span>
                          {sys.isActive && (
                            <span className="text-label">[active]</span>
                          )}
                        </div>
                        {sys.elements.length > 0 && (
                          <div className="mt-1.5 text-xs text-muted-foreground">
                            {sys.elements.map(e => e.name).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td
                        className={cn(
                          "py-4 px-4 text-right font-medium",
                          toneClass(sysTone)
                        )}
                      >
                        {sys.winRate.toFixed(1)}%
                      </td>
                      <td className="py-4 px-4 text-right">
                        {sys.totalTrades}
                      </td>
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <span className="status-win">{sys.winCount}</span>
                        <span
                          className="text-muted-foreground mx-1"
                          aria-hidden="true"
                        >
                          /
                        </span>
                        <span className="status-loss">{sys.lossCount}</span>
                        <span
                          className="text-muted-foreground mx-1"
                          aria-hidden="true"
                        >
                          /
                        </span>
                        <span>{sys.breakevenCount}</span>
                      </td>
                      <td
                        className={cn(
                          "py-4 pl-4 text-right font-medium whitespace-nowrap",
                          toneClass(netTone)
                        )}
                      >
                        {sys.totalReturn >= 0 ? "+" : "-"}$
                        {fmtMoney(Math.abs(sys.totalReturn))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Empty: trades logged but no systems defined. */}
      {sortedSystemStats.length === 0 && stats.totalTrades > 0 && (
        <section className="border-t border-border pt-10 max-w-md">
          <p className="text-label">by system</p>
          <p className="mt-3">no trading systems yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            categorize trades by system to see which rule sets are working.
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => setLocation("/trading-systems")}
          >
            create trading system
          </Button>
        </section>
      )}

      {/* Empty: no trades at all. */}
      {stats.totalTrades === 0 && (
        <section className="border-t border-border pt-16 text-center">
          <p>no trades recorded.</p>
          <p className="text-sm text-muted-foreground mt-2">
            log a trade to start the journal.
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => setLocation("/transactions/new")}
          >
            log a trade
          </Button>
        </section>
      )}
    </div>
  );
}
