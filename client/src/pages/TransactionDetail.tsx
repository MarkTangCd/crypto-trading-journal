import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, Loader2, Gauge, Tag } from "lucide-react";
import { toast } from "sonner";
import { CloseTradeModal } from "@/components/CloseTradeModal";

function getConfidenceColor(level: number): string {
  if (level >= 80) return "text-green-600";
  if (level >= 60) return "text-emerald-500";
  if (level >= 40) return "text-yellow-500";
  if (level >= 20) return "text-orange-500";
  return "text-red-500";
}

function getConfidenceLabel(level: number): string {
  if (level >= 80) return "Very High";
  if (level >= 60) return "High";
  if (level >= 40) return "Medium";
  if (level >= 20) return "Low";
  return "Very Low";
}

function getConfidenceBgColor(level: number): string {
  if (level >= 80) return "bg-green-100";
  if (level >= 60) return "bg-emerald-100";
  if (level >= 40) return "bg-yellow-100";
  if (level >= 20) return "bg-orange-100";
  return "bg-red-100";
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "open":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
    case "closed":
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
    case "reviewed":
      return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

export default function TransactionDetail() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const transactionId = parseInt(params.id || "0");
  const utils = trpc.useUtils();

  const { data: transaction, isLoading } = trpc.transaction.get.useQuery(
    { id: transactionId },
    { enabled: transactionId > 0 }
  );

  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewChartUrl, setReviewChartUrl] = useState("");
  const [closeTrade, setCloseTrade] = useState<{
    id: number;
    tradingPair: string;
    direction: string;
    timeFrame: string;
    startTime: number;
  } | null>(null);

  useEffect(() => {
    if (transaction) {
      setReviewFeedback(transaction.reviewFeedback || "");
      setReviewChartUrl(transaction.reviewChartUrl || "");
    }
  }, [transaction]);

  const updateMutation = trpc.transaction.update.useMutation({
    onSuccess: () => {
      toast.success("Review saved successfully");
      utils.transaction.get.invalidate({ id: transactionId });
      utils.transaction.list.invalidate();
    },
    onError: error => {
      toast.error(error.message || "Failed to save review");
    },
  });

  const handleSaveReview = () => {
    updateMutation.mutate({
      id: transactionId,
      reviewFeedback: reviewFeedback || undefined,
      reviewChartUrl: reviewChartUrl || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-lg font-semibold">Transaction not found</h2>
        <p className="text-muted-foreground mt-1">
          The transaction you're looking for doesn't exist.
        </p>
        <Button className="mt-4" onClick={() => setLocation("/transactions")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Transactions
        </Button>
      </div>
    );
  }

  const elements = transaction.elements || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/transactions")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-heading flex items-center gap-3">
              {transaction.tradingPair}
              <Badge
                variant="outline"
                className={
                  transaction.direction === "long"
                    ? "direction-long border-current"
                    : "direction-short border-current"
                }
              >
                {transaction.direction.toUpperCase()}
              </Badge>
              {transaction.status !== "open" ? (
                <Badge variant="secondary" className="bg-accent">
                  {transaction.status.toUpperCase()}
                </Badge>
              ) : null}
            </h1>
            <p className="text-subtitle mt-1">
              {format(
                new Date(transaction.startTime),
                "MMMM d, yyyy 'at' HH:mm"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={transaction.status !== "open"}
            onClick={() => {
              // Future task: inline edit form
              toast.info("Edit functionality coming soon");
            }}
          >
            Edit
          </Button>
          {transaction.status === "open" && (
            <Button onClick={() => setCloseTrade(transaction)}>
              Close Trade
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column - Trade details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Trade Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Trading Pair
                    </p>
                    <p className="font-semibold">{transaction.tradingPair}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Time Frame</p>
                    <p className="font-semibold">{transaction.timeFrame}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Direction</p>
                    <p
                      className={`font-semibold ${transaction.direction === "long" ? "direction-long" : "direction-short"}`}
                    >
                      {transaction.direction.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Start Time</p>
                    <p className="font-semibold">
                      {format(
                        new Date(transaction.startTime),
                        "MMM d, yyyy HH:mm"
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">End Time</p>
                    <p className="font-semibold">
                      {transaction.endTime
                        ? format(
                            new Date(transaction.endTime),
                            "MMM d, yyyy HH:mm"
                          )
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-semibold">
                      {transaction.endTime
                        ? `${Math.round((transaction.endTime - transaction.startTime) / (1000 * 60))} minutes`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Trading Logic
                </p>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap">
                    {transaction.tradingLogic}
                  </p>
                </div>
              </div>

              {transaction.tvUrl && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      TradingView Chart
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => window.open(transaction.tvUrl!, "_blank")}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Chart
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Trading Elements Used */}
          {elements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Trading Elements Used
                </CardTitle>
                <CardDescription className="text-subtitle">
                  The trading opportunity elements identified in this trade
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {elements.map(
                    (element: {
                      id: number;
                      name: string;
                      confidenceLevel: number;
                    }) => (
                      <div
                        key={element.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card"
                      >
                        <span className="font-medium">{element.name}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${getConfidenceBgColor(element.confidenceLevel)} ${getConfidenceColor(element.confidenceLevel)}`}
                        >
                          {element.confidenceLevel}%
                        </span>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Review Section */}
          {transaction.status !== "open" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  Trade Review
                </CardTitle>
                <CardDescription className="text-subtitle">
                  Add your post-trade analysis and feedback
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reviewFeedback">Review Feedback</Label>
                  <Textarea
                    id="reviewFeedback"
                    placeholder="What did you learn from this trade? What could you have done better?"
                    rows={5}
                    value={reviewFeedback}
                    onChange={e => setReviewFeedback(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reviewChartUrl">
                    Post-Review Chart URL (Optional)
                  </Label>
                  <Input
                    id="reviewChartUrl"
                    type="url"
                    placeholder="https://www.tradingview.com/chart/..."
                    value={reviewChartUrl}
                    onChange={e => setReviewChartUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Attach a TradingView chart showing your post-trade analysis
                  </p>
                </div>

                {transaction.reviewChartUrl && (
                  <div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        window.open(transaction.reviewChartUrl!, "_blank")
                      }
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Review Chart
                    </Button>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    onClick={handleSaveReview}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Review"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column - Outcome summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Outcome</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {transaction.status === "open" ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin mb-2 opacity-50" />
                  <p>Trade is currently open</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">
                      Result
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        transaction.outcome === "win"
                          ? "status-win border-current"
                          : transaction.outcome === "loss"
                            ? "status-loss border-current"
                            : "status-breakeven border-current"
                      }
                    >
                      {transaction.outcome
                        ? transaction.outcome === "breakeven"
                          ? "BREAK EVEN"
                          : transaction.outcome.toUpperCase()
                        : "—"}
                    </Badge>
                  </div>
                  {transaction.confidenceLevel !== null && (
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        Confidence
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${getConfidenceColor(transaction.confidenceLevel)}`}
                        >
                          {transaction.confidenceLevel}%
                        </span>
                        <span
                          className={`text-xs ${getConfidenceColor(transaction.confidenceLevel)}`}
                        >
                          ({getConfidenceLabel(transaction.confidenceLevel)})
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">
                      Risk-Reward
                    </span>
                    <span className="font-semibold">
                      {transaction.riskRewardRatio ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">
                      Return
                    </span>
                    <span
                      className={`font-semibold ${transaction.returnAmount && parseFloat(transaction.returnAmount) >= 0 ? "status-win" : "status-loss"}`}
                    >
                      {transaction.returnAmount
                        ? `${parseFloat(transaction.returnAmount) >= 0 ? "+" : ""}$${transaction.returnAmount}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">
                      Balance After
                    </span>
                    <span className="font-semibold">
                      {transaction.accountBalance
                        ? `$${transaction.accountBalance}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">
                      Losing Streak
                    </span>
                    <span
                      className={`font-semibold ${transaction.consecutiveLosses && transaction.consecutiveLosses > 0 ? "status-loss" : ""}`}
                    >
                      {transaction.consecutiveLosses ?? "—"}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>
                  {format(new Date(transaction.createdAt), "MMM d, yyyy HH:mm")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>
                  {format(new Date(transaction.updatedAt), "MMM d, yyyy HH:mm")}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <CloseTradeModal
        open={closeTrade !== null}
        onOpenChange={open => !open && setCloseTrade(null)}
        trade={closeTrade}
      />
    </div>
  );
}
