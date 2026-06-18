import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  INPUT_CLASS,
  type Tone,
  fmtDateTime,
  fmtDecimal,
  fmtMoney,
  fmtRatio,
  toneClass,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface FormData {
  endTime: string;
  exitPrice: string;
}

const EMPTY_FORM: FormData = {
  endTime: "",
  exitPrice: "",
};

interface CloseTradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: {
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
  } | null;
}

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function parsePositiveDecimal(input: string | null): number | null {
  if (input === null) return null;
  const value = input.trim();
  if (!DECIMAL_PATTERN.test(value)) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type ClosePreview =
  | { kind: "missingExit" }
  | { kind: "invalidExit" }
  | {
      kind: "ok";
      actualRr: number;
      returnAmount: number;
      outcome: "win" | "loss" | "breakeven";
    };

// Mirrors server-side close calculations for preview only. The server is
// authoritative and recomputes from the persisted plan when close runs.
function previewClose(
  direction: string,
  entry: number,
  stopLoss: number,
  positionSize: number,
  exitStr: string
): ClosePreview {
  if (!exitStr.trim()) return { kind: "missingExit" };
  const exit = parsePositiveDecimal(exitStr);
  if (exit === null) return { kind: "invalidExit" };

  const isLong = direction === "long";
  const reward = isLong ? exit - entry : entry - exit;
  const risk = isLong ? entry - stopLoss : stopLoss - entry;
  if (risk <= 0) return { kind: "invalidExit" };

  const actualRr = reward / risk;
  const priceDelta = isLong ? exit - entry : entry - exit;
  const returnAmount = (positionSize * priceDelta) / entry;
  const rounded = Math.round(returnAmount * 100) / 100;
  const outcome: "win" | "loss" | "breakeven" =
    rounded > 0 ? "win" : rounded < 0 ? "loss" : "breakeven";
  return { kind: "ok", actualRr, returnAmount: rounded, outcome };
}

export function CloseTradeModal({
  open,
  onOpenChange,
  trade,
}: CloseTradeModalProps) {
  const utils = trpc.useUtils();
  // Use the trade's own accountId so the balance preview stays accurate
  // even if the user switches the active account while the modal is open.
  const tradeAccountId = trade?.accountId;

  const { data: formDefaults } = trpc.transaction.getFormDefaults.useQuery(
    { accountId: tradeAccountId! },
    { enabled: open && !!tradeAccountId }
  );

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setFormData({
        ...EMPTY_FORM,
        endTime: now.toISOString().slice(0, 16),
      });
    }
  }, [open]);

  const closeMutation = trpc.transaction.close.useMutation({
    onSuccess: () => {
      toast.success("trade closed");
      utils.transaction.list.invalidate();
      utils.transaction.get.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
      onOpenChange(false);
    },
    onError: error => {
      toast.error(error.message || "failed to close trade");
    },
  });

  const entryNum = useMemo(
    () => parsePositiveDecimal(trade?.entryPrice ?? null),
    [trade?.entryPrice]
  );
  const stopNum = useMemo(
    () => parsePositiveDecimal(trade?.plannedStopLossPrice ?? null),
    [trade?.plannedStopLossPrice]
  );
  const positionNum = useMemo(
    () => parsePositiveDecimal(trade?.positionSizeUsdt ?? null),
    [trade?.positionSizeUsdt]
  );

  const isLegacyOpen =
    !!trade && (entryNum === null || stopNum === null || positionNum === null);

  const currentBalanceNum = useMemo(() => {
    const v = parseFloat(formDefaults?.currentBalance || "0");
    return Number.isNaN(v) ? 0 : v;
  }, [formDefaults?.currentBalance]);

  const preview = useMemo<ClosePreview>(() => {
    if (!trade) return { kind: "missingExit" };
    if (entryNum === null || stopNum === null || positionNum === null) {
      return { kind: "missingExit" };
    }
    return previewClose(
      trade.direction,
      entryNum,
      stopNum,
      positionNum,
      formData.exitPrice
    );
  }, [trade, entryNum, stopNum, positionNum, formData.exitPrice]);

  const hasOkPreview = preview.kind === "ok";
  const previewReturn = hasOkPreview ? preview.returnAmount : 0;
  const previewBalance = currentBalanceNum + previewReturn;
  const previewTone: Tone =
    hasOkPreview && preview.outcome === "win"
      ? "win"
      : hasOkPreview && preview.outcome === "loss"
        ? "loss"
        : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trade) return;

    if (isLegacyOpen) {
      toast.error(
        "this trade is missing entry price, position size, or planned stop loss"
      );
      return;
    }

    if (!formData.endTime || !formData.exitPrice) {
      toast.error("fill in all required fields");
      return;
    }

    if (preview.kind === "invalidExit") {
      toast.error("enter a valid positive exit price");
      return;
    }

    const endTimestamp = new Date(formData.endTime).getTime();
    if (endTimestamp <= trade.startTime) {
      toast.error("end time must be after start time");
      return;
    }

    closeMutation.mutate({
      id: trade.id,
      endTime: endTimestamp,
      exitPrice: formData.exitPrice,
    });
  };

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!trade) return null;

  const submitDisabled =
    closeMutation.isPending || isLegacyOpen || !hasOkPreview;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>close trade</DialogTitle>
            <DialogDescription>
              record the exit price; outcome, r/r, and pnl are computed from the
              trade plan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-8 pt-2">
            {/* Trade context */}
            <div className="border-y border-border py-3">
              <div className="flex items-baseline gap-2 flex-wrap text-sm">
                <span className="font-medium text-foreground">
                  {trade.tradingPair}
                </span>
                <span className="text-muted-foreground">·</span>
                <span>{trade.direction}</span>
                <span className="text-muted-foreground">·</span>
                <span>{trade.timeFrame}</span>
              </div>
              <p className="text-label mt-1">
                opened {fmtDateTime(trade.startTime)}
              </p>
            </div>

            {/* Legacy warning */}
            {isLegacyOpen && (
              <div className="border-l-2 border-foreground pl-3 py-1 status-loss">
                <p className="text-sm">this trade predates the plan fields.</p>
                <p className="text-label mt-1">
                  entry price, position size, or planned stop loss is missing.
                  edit the trade to add them, or delete and re-record it.
                </p>
              </div>
            )}

            {/* Plan readout */}
            <section aria-labelledby="plan-readout" className="space-y-4">
              <p id="plan-readout" className="text-label">
                trade plan
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 tabular-nums">
                <Field label="entry">{fmtDecimal(trade.entryPrice)}</Field>
                <Field label="size (usdt)">
                  {trade.positionSizeUsdt
                    ? fmtMoney(trade.positionSizeUsdt)
                    : "—"}
                </Field>
                <Field label="planned stop">
                  {fmtDecimal(trade.plannedStopLossPrice)}
                </Field>
                <Field label="planned target">
                  {fmtDecimal(trade.plannedTakeProfitPrice)}
                </Field>
                <Field label="planned r/r">
                  {fmtRatio(trade.plannedRiskRewardRatio)}
                </Field>
              </div>
            </section>

            {/* Form */}
            <div className="space-y-6">
              <Field label="end time" htmlFor="endTime">
                <input
                  id="endTime"
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={e => updateField("endTime", e.target.value)}
                  className={INPUT_CLASS}
                  disabled={isLegacyOpen}
                />
              </Field>

              <Field label="exit price" htmlFor="exitPrice">
                <input
                  id="exitPrice"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={formData.exitPrice}
                  onChange={e => updateField("exitPrice", e.target.value)}
                  className={cn(INPUT_CLASS, "tabular-nums")}
                  disabled={isLegacyOpen}
                />
                {preview.kind === "invalidExit" && (
                  <p className="text-label status-loss">
                    enter a valid positive exit price
                  </p>
                )}
              </Field>
            </div>

            {/* Computed readout */}
            <section aria-labelledby="computed-readout" className="space-y-4">
              <p id="computed-readout" className="text-label">
                computed
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 tabular-nums">
                <Field label="actual r/r">
                  <span className={hasOkPreview ? toneClass(previewTone) : ""}>
                    {hasOkPreview ? fmtRatio(preview.actualRr) : "—"}
                  </span>
                </Field>
                <Field label="outcome">
                  <span className={hasOkPreview ? toneClass(previewTone) : ""}>
                    {hasOkPreview
                      ? preview.outcome === "breakeven"
                        ? "breakeven"
                        : preview.outcome
                      : "—"}
                  </span>
                </Field>
                <Field label="return">
                  {hasOkPreview ? (
                    <span className={toneClass(previewTone)}>
                      {previewReturn >= 0 ? "+" : "-"}$
                      {fmtMoney(Math.abs(previewReturn))}
                    </span>
                  ) : (
                    "—"
                  )}
                </Field>
              </div>
            </section>

            {/* Hero: new balance preview */}
            <section
              className="border-t border-border pt-5"
              aria-labelledby="preview-label"
            >
              <p id="preview-label" className="text-label">
                new balance
              </p>
              <p
                className={cn(
                  "mt-2 text-4xl font-medium leading-none tabular-nums",
                  hasOkPreview && toneClass(previewTone)
                )}
              >
                ${fmtMoney(previewBalance)}
              </p>
              <p className="text-label mt-3">
                from ${fmtMoney(currentBalanceNum)}
                {hasOkPreview && (
                  <>
                    <span className="mx-2" aria-hidden="true">
                      ·
                    </span>
                    <span className={toneClass(previewTone)}>
                      {previewReturn >= 0 ? "+" : "-"}$
                      {fmtMoney(Math.abs(previewReturn))}
                    </span>
                  </>
                )}
              </p>
            </section>
          </div>

          <DialogFooter className="pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={closeMutation.isPending}
            >
              cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {closeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "close trade"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
