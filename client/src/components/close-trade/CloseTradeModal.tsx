import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { CloseInputs } from "./CloseInputs";
import { ComputedReadout } from "./ComputedReadout";
import { LegacyWarning } from "./LegacyWarning";
import { NewBalanceHero } from "./NewBalanceHero";
import { TradeContextStrip } from "./TradeContextStrip";
import { TradePlanReadout } from "./TradePlanReadout";
import { useCloseTradeForm } from "./useCloseTradeForm";

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

export function CloseTradeModal({
  open,
  onOpenChange,
  trade,
}: CloseTradeModalProps) {
  const {
    formData,
    closeMutation,
    isLegacyOpen,
    currentBalanceNum,
    preview,
    submitDisabled,
    updateField,
    handleSubmit,
  } = useCloseTradeForm(trade, open, onOpenChange);

  if (!trade) return null;

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
            <TradeContextStrip
              tradingPair={trade.tradingPair}
              direction={trade.direction}
              timeFrame={trade.timeFrame}
              startTime={trade.startTime}
            />

            {isLegacyOpen && <LegacyWarning />}

            <TradePlanReadout
              entryPrice={trade.entryPrice}
              positionSizeUsdt={trade.positionSizeUsdt}
              plannedStopLossPrice={trade.plannedStopLossPrice}
              plannedTakeProfitPrice={trade.plannedTakeProfitPrice}
              plannedRiskRewardRatio={trade.plannedRiskRewardRatio}
            />

            <CloseInputs
              endTime={formData.endTime}
              exitPrice={formData.exitPrice}
              disabled={isLegacyOpen}
              showInvalidExitError={preview.kind === "invalidExit"}
              onChangeEndTime={v => updateField("endTime", v)}
              onChangeExitPrice={v => updateField("exitPrice", v)}
            />

            <ComputedReadout preview={preview} />
            <NewBalanceHero
              preview={preview}
              currentBalance={currentBalanceNum}
            />
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
