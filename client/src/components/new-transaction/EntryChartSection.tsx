import CandlestickChart, {
  type CandleClickPayload,
} from "@/components/CandlestickChart";
import { EntryFromCandleDialog } from "@/components/new-transaction/EntryFromCandleDialog";
import { useDebouncedKlines } from "@/hooks/useDebouncedKlines";
import { SectionHeader } from "@/lib/ledger";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

interface Props {
  tradingPair: string;
  timeFrame: string;
  onPickEntryPrice: (price: string) => void;
}

export function EntryChartSection({
  tradingPair,
  timeFrame,
  onPickEntryPrice,
}: Props) {
  const { shouldShow, isLoading, isError, data } = useDebouncedKlines({
    tradingPair,
    timeFrame,
  });

  const [pickerCandle, setPickerCandle] = useState<CandleClickPayload | null>(
    null
  );

  const chartData = useMemo<CandlestickData<UTCTimestamp>[]>(
    () =>
      data.map(c => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    [data]
  );

  if (!shouldShow) return null;

  return (
    <section className="space-y-4">
      <SectionHeader>chart</SectionHeader>

      {isLoading && (
        <div className="flex h-[400px] items-center justify-center border border-border">
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-label="loading candles"
          />
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex h-[400px] items-center justify-center border border-border">
          <p className="text-label">failed to load candles · try again</p>
        </div>
      )}

      {!isLoading && !isError && chartData.length === 0 && (
        <div className="flex h-[400px] items-center justify-center border border-border">
          <p className="text-label">
            no data for {tradingPair.toLowerCase()} · {timeFrame.toLowerCase()}
          </p>
        </div>
      )}

      {!isLoading && !isError && chartData.length > 0 && (
        <>
          <CandlestickChart data={chartData} onCandleClick={setPickerCandle} />
          <p className="text-label">
            click a candle to suggest the entry price.
          </p>
        </>
      )}

      <EntryFromCandleDialog
        candle={pickerCandle}
        onPick={price => {
          onPickEntryPrice(price);
          setPickerCandle(null);
        }}
        onClose={() => setPickerCandle(null)}
      />
    </section>
  );
}
