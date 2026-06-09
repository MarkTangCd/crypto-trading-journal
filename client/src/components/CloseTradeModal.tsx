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
  SELECT_CLASS,
  type Tone,
  fmtDateTime,
  fmtMoney,
  toneClass,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Outcome = "win" | "loss" | "breakeven" | "";

interface FormData {
  endTime: string;
  outcome: Outcome;
  riskRewardRatio: string;
  returnAmount: string;
}

const EMPTY_FORM: FormData = {
  endTime: "",
  outcome: "",
  riskRewardRatio: "",
  returnAmount: "",
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
  } | null;
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

  const currentBalanceNum = useMemo(() => {
    const v = parseFloat(formDefaults?.currentBalance || "0");
    return Number.isNaN(v) ? 0 : v;
  }, [formDefaults?.currentBalance]);

  const returnNum = useMemo(() => {
    const v = parseFloat(formData.returnAmount || "0");
    return Number.isNaN(v) ? 0 : v;
  }, [formData.returnAmount]);

  const previewBalance = currentBalanceNum + returnNum;
  const previewTone: Tone =
    formData.outcome === "breakeven"
      ? undefined
      : returnNum > 0
        ? "win"
        : returnNum < 0
          ? "loss"
          : undefined;
  const hasReturn = formData.returnAmount.trim() !== "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trade) return;

    if (
      !formData.endTime ||
      !formData.outcome ||
      !formData.riskRewardRatio ||
      !formData.returnAmount
    ) {
      toast.error("fill in all required fields");
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
      outcome: formData.outcome as "win" | "loss" | "breakeven",
      riskRewardRatio: formData.riskRewardRatio,
      returnAmount: formData.returnAmount,
    });
  };

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!trade) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>close trade</DialogTitle>
            <DialogDescription>
              resolve the open position with outcome, r/r, and final pnl.
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

            {/* Form */}
            <div className="space-y-6">
              <Field label="end time" htmlFor="endTime">
                <input
                  id="endTime"
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={e => updateField("endTime", e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>

              <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                <Field label="outcome" htmlFor="outcome">
                  <select
                    id="outcome"
                    value={formData.outcome}
                    onChange={e =>
                      updateField("outcome", e.target.value as Outcome)
                    }
                    className={SELECT_CLASS}
                  >
                    <option value="">—</option>
                    <option value="win">win</option>
                    <option value="loss">loss</option>
                    <option value="breakeven">breakeven</option>
                  </select>
                </Field>
                <Field label="r/r ratio" htmlFor="riskRewardRatio">
                  <input
                    id="riskRewardRatio"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="2.5"
                    value={formData.riskRewardRatio}
                    onChange={e =>
                      updateField("riskRewardRatio", e.target.value)
                    }
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>

              <Field label="return amount" htmlFor="returnAmount">
                <input
                  id="returnAmount"
                  type="number"
                  step="0.01"
                  placeholder="-50 or 100"
                  value={formData.returnAmount}
                  onChange={e => updateField("returnAmount", e.target.value)}
                  className={INPUT_CLASS}
                />
                <p className="text-label">
                  negative for loss · positive for profit
                </p>
              </Field>
            </div>

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
                  hasReturn && toneClass(previewTone)
                )}
              >
                ${fmtMoney(previewBalance)}
              </p>
              <p className="text-label mt-3">
                from ${fmtMoney(currentBalanceNum)}
                {hasReturn && (
                  <>
                    <span className="mx-2" aria-hidden="true">
                      ·
                    </span>
                    <span className={toneClass(previewTone)}>
                      {returnNum >= 0 ? "+" : "-"}$
                      {fmtMoney(Math.abs(returnNum))}
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
            <Button type="submit" disabled={closeMutation.isPending}>
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
