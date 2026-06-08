import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CloseTradeModal } from "@/components/CloseTradeModal";
import {
  Field,
  SectionHeader,
  type Tone,
  fmtDateTime,
  fmtDuration,
  fmtMoney,
  toneClass,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useParams } from "wouter";

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
      toast.success("reflection saved");
      utils.transaction.get.invalidate({ id: transactionId });
      utils.transaction.list.invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to save reflection");
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
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="border-t border-border pt-16 text-center max-w-md mx-auto">
        <p>trade not found.</p>
        <p className="text-sm text-muted-foreground mt-2">
          it may have been deleted, or the link is wrong.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => setLocation("/transactions")}
        >
          back to transactions
        </Button>
      </div>
    );
  }

  const returnNum =
    transaction.returnAmount !== null
      ? parseFloat(transaction.returnAmount)
      : null;
  const balanceAfter =
    transaction.accountBalance !== null
      ? parseFloat(transaction.accountBalance)
      : null;
  const balanceAtEntry =
    balanceAfter !== null && returnNum !== null
      ? balanceAfter - returnNum
      : null;
  const outcome = transaction.outcome;
  const isOpen = transaction.status === "open";
  const isReviewed = transaction.status === "reviewed";
  const heroTone: Tone =
    outcome === "win" ? "win" : outcome === "loss" ? "loss" : undefined;
  const returnPct =
    returnNum !== null && balanceAtEntry !== null && balanceAtEntry > 0
      ? (returnNum / balanceAtEntry) * 100
      : null;
  const statusMark = isOpen ? "[open]" : isReviewed ? "[reviewed]" : null;
  const headerMeta = [
    transaction.direction,
    transaction.timeFrame,
    fmtDateTime(transaction.startTime),
  ]
    .filter(Boolean)
    .join(" · ")
    .toLowerCase();

  return (
    <div className="space-y-16">
      <h1 className="sr-only">trade {transaction.tradingPair}</h1>

      <Link
        href="/transactions"
        className="text-label hover:text-foreground transition-colors inline-block"
      >
        ← transactions
      </Link>

      {/* Page header: pair + status marker + meta */}
      <header className="space-y-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-title">{transaction.tradingPair}</p>
          {statusMark && (
            <span className="text-label">{statusMark}</span>
          )}
        </div>
        <p className="text-label">{headerMeta}</p>
      </header>

      {/* Hero numeral: PnL for closed trades, open marker otherwise */}
      <section aria-labelledby="hero-label">
        {isOpen ? (
          <>
            <p id="hero-label" className="text-label">
              position
            </p>
            <p className="text-display mt-2 tabular-nums">open</p>
            <p className="text-label mt-4">
              since {fmtDateTime(transaction.startTime)}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() =>
                setCloseTrade({
                  id: transaction.id,
                  tradingPair: transaction.tradingPair,
                  direction: transaction.direction,
                  timeFrame: transaction.timeFrame,
                  startTime: transaction.startTime,
                })
              }
            >
              close trade →
            </Button>
          </>
        ) : returnNum !== null ? (
          <>
            <p id="hero-label" className="text-label">
              return
            </p>
            <p
              className={cn(
                "text-display mt-2 tabular-nums",
                toneClass(heroTone)
              )}
            >
              {returnNum >= 0 ? "+" : "-"}${fmtMoney(Math.abs(returnNum))}
            </p>
            {(returnPct !== null || transaction.riskRewardRatio) && (
              <p
                className={cn(
                  "mt-3 text-2xl font-medium tabular-nums",
                  toneClass(heroTone)
                )}
              >
                {returnPct !== null && (
                  <span>
                    {returnPct >= 0 ? "+" : ""}
                    {returnPct.toFixed(2)}%
                  </span>
                )}
                {returnPct !== null && transaction.riskRewardRatio && (
                  <span
                    className="text-muted-foreground mx-3"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                )}
                {transaction.riskRewardRatio && (
                  <span>r/r {transaction.riskRewardRatio}</span>
                )}
              </p>
            )}
            <p className="text-label mt-4">
              {outcome === "breakeven" ? "breakeven" : (outcome ?? "unresolved")}
              {transaction.endTime && (
                <>
                  {" · held "}
                  {fmtDuration(transaction.startTime, transaction.endTime)}
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p id="hero-label" className="text-label">
              return
            </p>
            <p className="text-display mt-2 tabular-nums text-muted-foreground">
              —
            </p>
          </>
        )}
      </section>

      {/* Setup: pre-trade context as a flat key/value grid */}
      <section aria-labelledby="setup-label" className="space-y-6">
        <SectionHeader id="setup-label">setup</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-6 tabular-nums">
          <Field label="direction">{transaction.direction}</Field>
          <Field label="timeframe">{transaction.timeFrame}</Field>
          {transaction.marketCycle && (
            <Field label="cycle">{transaction.marketCycle.toLowerCase()}</Field>
          )}
          {transaction.transactionType && (
            <Field label="type">{transaction.transactionType.toLowerCase()}</Field>
          )}
          {transaction.riskRewardRatio && (
            <Field label="r/r">{transaction.riskRewardRatio}</Field>
          )}
          {balanceAtEntry !== null && (
            <Field label="balance @ entry">
              ${fmtMoney(balanceAtEntry)}
            </Field>
          )}
          <Field label="started">{fmtDateTime(transaction.startTime)}</Field>
          {transaction.endTime && (
            <Field label="closed">{fmtDateTime(transaction.endTime)}</Field>
          )}
        </div>
        {transaction.tradingLogic && (
          <div>
            <p className="text-label">thesis</p>
            <p className="mt-2 text-sm whitespace-pre-wrap">
              {transaction.tradingLogic}
            </p>
          </div>
        )}
        {transaction.tvUrl && (
          <a
            href={transaction.tvUrl}
            target="_blank"
            rel="noreferrer"
            className="text-label hover:text-foreground transition-colors inline-block"
          >
            entry chart ↗
          </a>
        )}
      </section>

      {/* Resolution: closed-trade numbers */}
      {!isOpen && (
        <section aria-labelledby="resolution-label" className="space-y-6">
          <SectionHeader id="resolution-label">resolution</SectionHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 tabular-nums">
            <Field label="outcome">
              <span className={toneClass(heroTone)}>
                {outcome === "breakeven" ? "breakeven" : (outcome ?? "—")}
              </span>
            </Field>
            <Field label="return">
              {returnNum !== null ? (
                <span className={toneClass(heroTone)}>
                  {returnNum >= 0 ? "+" : "-"}${fmtMoney(Math.abs(returnNum))}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            <Field label="balance after">
              {balanceAfter !== null ? (
                `$${fmtMoney(balanceAfter)}`
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            <Field label="held">
              {transaction.endTime ? (
                fmtDuration(transaction.startTime, transaction.endTime)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            {transaction.consecutiveLosses != null &&
              transaction.consecutiveLosses > 0 && (
                <Field label="losing streak">
                  <span
                    className={
                      transaction.consecutiveLosses > 3 ? "status-loss" : ""
                    }
                  >
                    {transaction.consecutiveLosses} in a row
                  </span>
                </Field>
              )}
          </div>
        </section>
      )}

      {/* Reflection: post-trade writing surface */}
      {!isOpen && (
        <section aria-labelledby="reflection-label" className="space-y-6">
          <SectionHeader id="reflection-label">reflection</SectionHeader>
          <div className="space-y-2">
            <Label htmlFor="reviewFeedback" className="text-label">
              what did i learn?
            </Label>
            <Textarea
              id="reviewFeedback"
              placeholder="what did you read right? what would you change?"
              rows={6}
              value={reviewFeedback}
              onChange={e => setReviewFeedback(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reviewChartUrl" className="text-label">
              post-review chart url
            </Label>
            <Input
              id="reviewChartUrl"
              type="url"
              placeholder="https://www.tradingview.com/chart/..."
              value={reviewChartUrl}
              onChange={e => setReviewChartUrl(e.target.value)}
            />
            {transaction.reviewChartUrl && (
              <a
                href={transaction.reviewChartUrl}
                target="_blank"
                rel="noreferrer"
                className="text-label hover:text-foreground transition-colors inline-block mt-1"
              >
                view current chart ↗
              </a>
            )}
          </div>
          <div>
            <Button
              onClick={handleSaveReview}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "save reflection"
              )}
            </Button>
          </div>
        </section>
      )}

      <CloseTradeModal
        open={closeTrade !== null}
        onOpenChange={open => !open && setCloseTrade(null)}
        trade={closeTrade}
      />
    </div>
  );
}
