import { Field, INPUT_CLASS, SectionHeader, SELECT_CLASS } from "@/lib/ledger";
import type { Direction } from "@/lib/plannedRiskReward";
import { cn } from "@/lib/utils";

const TIME_FRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

type Props = {
  tradingPair: string;
  timeFrame: string;
  direction: Direction;
  onChange<K extends "tradingPair" | "timeFrame" | "direction">(
    field: K,
    value: { tradingPair: string; timeFrame: string; direction: Direction }[K]
  ): void;
};

export function InstrumentSection(props: Props) {
  return (
    <section className="space-y-6">
      <SectionHeader>instrument</SectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
        <Field label="trading pair" htmlFor="tradingPair">
          <input
            id="tradingPair"
            type="text"
            placeholder="btcusdt"
            value={props.tradingPair}
            onChange={e =>
              props.onChange("tradingPair", e.target.value.toUpperCase())
            }
            className={cn(INPUT_CLASS, "uppercase")}
          />
        </Field>
        <Field label="timeframe" htmlFor="timeFrame">
          <select
            id="timeFrame"
            value={props.timeFrame}
            onChange={e => props.onChange("timeFrame", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            {TIME_FRAMES.map(tf => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </Field>
        <Field label="direction" htmlFor="direction">
          <select
            id="direction"
            value={props.direction}
            onChange={e =>
              props.onChange("direction", e.target.value as Direction)
            }
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            <option value="long">long</option>
            <option value="short">short</option>
          </select>
        </Field>
      </div>
    </section>
  );
}
