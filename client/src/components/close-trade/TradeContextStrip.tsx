import { fmtDateTime } from "@/lib/ledger";

type Props = {
  tradingPair: string;
  direction: string;
  timeFrame: string;
  startTime: number;
};

export function TradeContextStrip({
  tradingPair,
  direction,
  timeFrame,
  startTime,
}: Props) {
  return (
    <div className="border-y border-border py-3">
      <div className="flex items-baseline gap-2 flex-wrap text-sm">
        <span className="font-medium text-foreground">{tradingPair}</span>
        <span className="text-muted-foreground">·</span>
        <span>{direction}</span>
        <span className="text-muted-foreground">·</span>
        <span>{timeFrame}</span>
      </div>
      <p className="text-label mt-1">opened {fmtDateTime(startTime)}</p>
    </div>
  );
}
