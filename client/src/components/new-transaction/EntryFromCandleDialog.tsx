import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtDateTime, fmtDecimal } from "@/lib/ledger";
import { cn } from "@/lib/utils";

type OhlcKey = "open" | "high" | "low" | "close";

export interface CandidateCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  candle: CandidateCandle | null;
  onPick: (price: string) => void;
  onClose: () => void;
}

const OPTIONS: { key: OhlcKey; label: string; tone?: "win" | "loss" }[] = [
  { key: "open", label: "open" },
  { key: "high", label: "high", tone: "win" },
  { key: "low", label: "low", tone: "loss" },
  { key: "close", label: "close" },
];

export function EntryFromCandleDialog({ candle, onPick, onClose }: Props) {
  const open = candle !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="rounded-none border border-foreground bg-background p-6 sm:max-w-sm"
        showCloseButton={false}
      >
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-label font-medium tracking-[0.14em] uppercase-off">
            {candle ? fmtDateTime(candle.time * 1000) : "candle"}
          </DialogTitle>
          <DialogDescription className="text-label">
            pick the price to fill entry price
          </DialogDescription>
        </DialogHeader>

        {candle && (
          <div className="grid grid-cols-2 border-t border-border">
            {OPTIONS.map(({ key, label, tone }, i) => {
              const value = candle[key];
              const borderR = i % 2 === 0 ? "border-r border-border" : "";
              const borderB = i < 2 ? "border-b border-border" : "";
              const toneClass =
                tone === "win"
                  ? "status-win"
                  : tone === "loss"
                    ? "status-loss"
                    : "text-foreground";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPick(String(value))}
                  className={cn(
                    "flex flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus:bg-muted/60 focus:outline-none",
                    borderR,
                    borderB
                  )}
                >
                  <span className="text-label">{label}</span>
                  <span
                    className={cn(
                      "text-base font-medium tabular-nums tracking-tight",
                      toneClass
                    )}
                  >
                    {fmtDecimal(value)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-label">selection is optional</span>
          <button
            type="button"
            onClick={onClose}
            className="text-label hover:text-foreground transition-colors"
          >
            cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
