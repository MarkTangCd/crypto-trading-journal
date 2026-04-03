import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAccount } from "@/contexts/AccountContext";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  BarChart3,
  DollarSign,
  Percent,
  Hash,
  Flame,
  Wallet,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { useLocation } from "wouter";

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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Unable to load statistics</p>
      </div>
    );
  }

  const statCards = [
    {
      title: "Win Count",
      value: stats.winCount,
      icon: TrendingUp,
      description: "Total winning trades",
      color: "status-win",
    },
    {
      title: "Loss Count",
      value: stats.lossCount,
      icon: TrendingDown,
      description: "Total losing trades",
      color: "status-loss",
    },
    {
      title: "Break Even",
      value: stats.breakevenCount,
      icon: Minus,
      description: "Total breakeven trades",
      color: "status-breakeven",
    },
    {
      title: "Win Rate",
      value: `${stats.winRate.toFixed(1)}%`,
      icon: Percent,
      description: "Percentage of winning trades",
      color: stats.winRate >= 50 ? "status-win" : "status-loss",
    },
    {
      title: "Total Trades",
      value: stats.totalTrades,
      icon: Hash,
      description: "Number of trades recorded",
      color: "",
    },
    {
      title: "Average Profit",
      value: `$${stats.avgProfit.toFixed(2)}`,
      icon: TrendingUp,
      description: "Average profit per winning trade",
      color: "status-win",
    },
    {
      title: "Average Loss",
      value: `$${stats.avgLoss.toFixed(2)}`,
      icon: TrendingDown,
      description: "Average loss per losing trade",
      color: "status-loss",
    },
    {
      title: "Total Profit",
      value: `$${stats.totalProfit.toFixed(2)}`,
      icon: DollarSign,
      description: "Sum of all profitable trades",
      color: "status-win",
    },
    {
      title: "Total Reward",
      value: `$${stats.totalReward.toFixed(2)}`,
      icon: Target,
      description: "Net profit/loss (all trades)",
      color: stats.totalReward >= 0 ? "status-win" : "status-loss",
    },
    {
      title: "Losing Streak",
      value: stats.losingStreak,
      icon: Flame,
      description: "Maximum consecutive losses",
      color: stats.losingStreak > 3 ? "status-loss" : "",
    },
    {
      title: "Original Balance",
      value: `$${stats.originalBalance.toFixed(2)}`,
      icon: Wallet,
      description: "Starting account balance",
      color: "",
    },
    {
      title: "Latest Balance",
      value: `$${stats.latestBalance.toFixed(2)}`,
      icon: BarChart3,
      description: "Current account balance",
      color:
        stats.latestBalance >= stats.originalBalance
          ? "status-win"
          : "status-loss",
    },
  ];

  const balanceChange = stats.latestBalance - stats.originalBalance;
  const balanceChangePercent =
    stats.originalBalance > 0
      ? ((balanceChange / stats.originalBalance) * 100).toFixed(2)
      : "0.00";

  // Sort system stats by win rate descending
  const sortedSystemStats = systemStats
    ? [...systemStats].sort((a, b) => b.winRate - a.winRate)
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-heading">Statistics Dashboard</h1>
        <p className="text-subtitle mt-1">
          Overview of your trading performance
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
            style={{
              background: "var(--color-pastel-blue)",
              transform: "translate(30%, -30%)",
            }}
          />
          <CardHeader className="pb-2">
            <CardDescription className="text-subtitle">
              Account Performance
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              <span
                className={balanceChange >= 0 ? "status-win" : "status-loss"}
              >
                {balanceChange >= 0 ? "+" : ""}
                {balanceChangePercent}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {balanceChange >= 0 ? "+" : ""}${balanceChange.toFixed(2)} from
              original
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
            style={{
              background: "var(--color-pastel-pink)",
              transform: "translate(30%, -30%)",
            }}
          />
          <CardHeader className="pb-2">
            <CardDescription className="text-subtitle">
              Win Rate
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              <span
                className={stats.winRate >= 50 ? "status-win" : "status-loss"}
              >
                {stats.winRate.toFixed(1)}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {stats.winCount} wins / {stats.totalTrades} trades
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
            style={{
              background: "var(--color-pastel-blue)",
              transform: "translate(30%, -30%)",
            }}
          />
          <CardHeader className="pb-2">
            <CardDescription className="text-subtitle">
              Net Reward
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              <span
                className={
                  stats.totalReward >= 0 ? "status-win" : "status-loss"
                }
              >
                ${stats.totalReward.toFixed(2)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Total profit minus losses
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
            style={{
              background: "var(--color-pastel-pink)",
              transform: "translate(30%, -30%)",
            }}
          />
          <CardHeader className="pb-2">
            <CardDescription className="text-subtitle">
              Current Balance
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              ${stats.latestBalance.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Started with ${stats.originalBalance.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trading System Statistics */}
      {sortedSystemStats.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Trading System Performance
                </CardTitle>
                <CardDescription className="text-subtitle">
                  Win rate statistics by trading system
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/trading-systems")}
              >
                Manage Systems
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedSystemStats.map(system => (
                <div
                  key={system.systemId}
                  className={`p-4 rounded-lg border transition-all ${
                    system.isActive
                      ? "border-green-200 bg-green-50/30"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{system.systemName}</h4>
                        {system.isActive && (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                      {system.elements.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {system.elements.map(el => (
                            <Badge
                              key={el.id}
                              variant="outline"
                              className="text-xs"
                            >
                              {el.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Win Rate</p>
                          <p
                            className={`font-semibold ${system.winRate >= 50 ? "status-win" : "status-loss"}`}
                          >
                            {system.winRate.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Trades</p>
                          <p className="font-semibold">{system.totalTrades}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">W/L/BE</p>
                          <p className="font-semibold">
                            <span className="status-win">
                              {system.winCount}
                            </span>
                            {" / "}
                            <span className="status-loss">
                              {system.lossCount}
                            </span>
                            {" / "}
                            <span className="status-breakeven">
                              {system.breakevenCount}
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Return</p>
                          <p
                            className={`font-semibold ${system.totalReturn >= 0 ? "status-win" : "status-loss"}`}
                          >
                            ${system.totalReturn.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Win Rate Visual Bar */}
                    <div className="hidden sm:block w-24 shrink-0">
                      <div className="text-center mb-1">
                        <span
                          className={`text-lg font-bold ${system.winRate >= 50 ? "status-win" : "status-loss"}`}
                        >
                          {system.winRate.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            system.winRate >= 50 ? "bg-green-500" : "bg-red-400"
                          }`}
                          style={{ width: `${Math.min(system.winRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prompt to create systems if none exist */}
      {sortedSystemStats.length === 0 && stats.totalTrades > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">
              Track Performance by Trading System
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create trading systems to categorize your trades and analyze which
              strategies work best
            </p>
            <Button onClick={() => setLocation("/trading-systems")}>
              Create Trading System
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Detailed Stats Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Detailed Statistics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {statCards.map(stat => (
            <Card
              key={stat.title}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className={`text-2xl font-bold ${stat.color}`}>
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stat.description}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <stat.icon
                      className={`h-5 w-5 ${stat.color || "text-muted-foreground"}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Performance Insights */}
      {stats.totalTrades > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Performance Insights
            </CardTitle>
            <CardDescription className="text-subtitle">
              Key observations from your trading data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">
                  Profit Factor
                </p>
                <p className="text-xl font-semibold">
                  {stats.avgLoss > 0
                    ? (stats.avgProfit / stats.avgLoss).toFixed(2)
                    : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ratio of average profit to average loss
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Expectancy</p>
                <p
                  className={`text-xl font-semibold ${
                    stats.totalTrades > 0
                      ? stats.totalReward / stats.totalTrades >= 0
                        ? "status-win"
                        : "status-loss"
                      : ""
                  }`}
                >
                  $
                  {stats.totalTrades > 0
                    ? (stats.totalReward / stats.totalTrades).toFixed(2)
                    : "0.00"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Expected return per trade
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">
                  Risk Assessment
                </p>
                <p
                  className={`text-xl font-semibold ${
                    stats.losingStreak <= 3
                      ? "status-win"
                      : stats.losingStreak <= 5
                        ? "status-breakeven"
                        : "status-loss"
                  }`}
                >
                  {stats.losingStreak <= 3
                    ? "Low"
                    : stats.losingStreak <= 5
                      ? "Medium"
                      : "High"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on max losing streak of {stats.losingStreak}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {stats.totalTrades === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No trading data yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Start recording transactions to see your statistics
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
