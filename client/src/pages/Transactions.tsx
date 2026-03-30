import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  ArrowUpDown,
  Plus,
  Eye,
  Trash2,
  Loader2,
  ExternalLink,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SortBy = "createdAt" | "startTime" | "endTime" | "returnAmount";
type SortOrder = "asc" | "desc";
type Outcome = "win" | "loss" | "breakeven" | undefined;
type Direction = "long" | "short" | undefined;

function getConfidenceColor(level: number): string {
  if (level >= 80) return "text-green-600";
  if (level >= 60) return "text-emerald-500";
  if (level >= 40) return "text-yellow-500";
  if (level >= 20) return "text-orange-500";
  return "text-red-500";
}

function getConfidenceBgColor(level: number): string {
  if (level >= 80) return "bg-green-100";
  if (level >= 60) return "bg-emerald-100";
  if (level >= 40) return "bg-yellow-100";
  if (level >= 20) return "bg-orange-100";
  return "bg-red-100";
}

export default function Transactions() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome>(undefined);
  const [directionFilter, setDirectionFilter] = useState<Direction>(undefined);
  const [pairFilter, setPairFilter] = useState<string>("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: transactions, isLoading } = trpc.transaction.list.useQuery({
    sortBy,
    sortOrder,
    outcome: outcomeFilter,
    direction: directionFilter,
    tradingPair: pairFilter || undefined,
  });

  const { data: tradingPairs } = trpc.transaction.getTradingPairs.useQuery();

  const deleteMutation = trpc.transaction.delete.useMutation({
    onSuccess: () => {
      toast.success("Transaction deleted");
      utils.transaction.list.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
      setDeleteId(null);
    },
    onError: error => {
      toast.error(error.message || "Failed to delete transaction");
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
    setPairFilter("");
  };

  const hasFilters = outcomeFilter || directionFilter || pairFilter;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-heading">Transactions</h1>
          <p className="text-subtitle mt-1">
            View and manage your trading history
          </p>
        </div>
        <Button onClick={() => setLocation("/transactions/new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Transaction
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Filters</CardTitle>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Outcome</label>
              <Select
                value={outcomeFilter || "all"}
                onValueChange={v =>
                  setOutcomeFilter(v === "all" ? undefined : (v as Outcome))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All outcomes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="win">Win</SelectItem>
                  <SelectItem value="loss">Loss</SelectItem>
                  <SelectItem value="breakeven">Break Even</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Direction</label>
              <Select
                value={directionFilter || "all"}
                onValueChange={v =>
                  setDirectionFilter(v === "all" ? undefined : (v as Direction))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All directions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All directions</SelectItem>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                Trading Pair
              </label>
              <Select
                value={pairFilter || "all"}
                onValueChange={v => setPairFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All pairs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All pairs</SelectItem>
                  {tradingPairs?.map(pair => (
                    <SelectItem key={pair} value={pair}>
                      {pair}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pair</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort("startTime")}
                      >
                        Start Time
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>Time Frame</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          Conf.
                        </TooltipTrigger>
                        <TooltipContent>Confidence Level</TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead>R:R</TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort("returnAmount")}
                      >
                        Return
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Streak</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">
                        {tx.tradingPair}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            tx.direction === "long"
                              ? "direction-long border-current"
                              : "direction-short border-current"
                          }
                        >
                          {tx.direction.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(tx.startTime), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>{tx.timeFrame}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            tx.outcome === "win"
                              ? "status-win border-current"
                              : tx.outcome === "loss"
                                ? "status-loss border-current"
                                : "status-breakeven border-current"
                          }
                        >
                          {tx.outcome
                            ? tx.outcome === "breakeven"
                              ? "BE"
                              : tx.outcome.toUpperCase()
                            : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {tx.confidenceLevel !== null ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getConfidenceBgColor(tx.confidenceLevel)} ${getConfidenceColor(tx.confidenceLevel)}`}
                              >
                                {tx.confidenceLevel}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Confidence Level: {tx.confidenceLevel}%
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{tx.riskRewardRatio ?? "—"}</TableCell>
                      <TableCell
                        className={
                          tx.returnAmount && parseFloat(tx.returnAmount) >= 0
                            ? "status-win font-medium"
                            : "status-loss font-medium"
                        }
                      >
                        {tx.returnAmount
                          ? `${parseFloat(tx.returnAmount) >= 0 ? "+" : ""}${tx.returnAmount}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {tx.accountBalance ? `$${tx.accountBalance}` : "—"}
                      </TableCell>
                      <TableCell>
                        {tx.consecutiveLosses && tx.consecutiveLosses > 0 ? (
                          <span className="status-loss">
                            {tx.consecutiveLosses}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {tx.consecutiveLosses ?? "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.status !== "open" ? (
                          <Badge variant="secondary" className="bg-accent">
                            {tx.status.toUpperCase()}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {tx.tvUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => window.open(tx.tvUrl!, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              setLocation(`/transactions/${tx.id}`)
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(tx.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No transactions yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Start by recording your first trade
              </p>
              <Button onClick={() => setLocation("/transactions/new")}>
                <Plus className="mr-2 h-4 w-4" />
                New Transaction
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteId && deleteMutation.mutate({ id: deleteId })
              }
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
