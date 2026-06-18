import { SELECT_CLASS } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import {
  MARKET_CYCLES,
  TRANSACTION_TYPES,
  type MarketCycle,
  type TransactionType,
} from "@shared/const";
import type React from "react";

type Outcome = "win" | "loss" | "breakeven" | undefined;
type Direction = "long" | "short" | undefined;
type Status = "open" | "closed" | "reviewed" | undefined;

const FILTER_SELECT_CLASS = cn(SELECT_CLASS, "min-w-[8rem]");

function FilterField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label">{label}</span>
      <select
        className={FILTER_SELECT_CLASS}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

type Props = {
  outcome: Outcome;
  direction: Direction;
  status: Status;
  marketCycle: MarketCycle | undefined;
  transactionType: TransactionType | undefined;
  pair: string;
  tradingPairs: string[] | undefined;
  onChangeOutcome: (v: Outcome) => void;
  onChangeDirection: (v: Direction) => void;
  onChangeStatus: (v: Status) => void;
  onChangeMarketCycle: (v: MarketCycle | undefined) => void;
  onChangeTransactionType: (v: TransactionType | undefined) => void;
  onChangePair: (v: string) => void;
  onClear: () => void;
  hasFilters: boolean;
};

export type { Outcome, Direction, Status };
export function TransactionsFilters(props: Props) {
  const parseOutcome = (v: string): Outcome =>
    v === "all" ? undefined : (v as Outcome);
  const parseDirection = (v: string): Direction =>
    v === "all" ? undefined : (v as Direction);
  const parseStatus = (v: string): Status =>
    v === "all" ? undefined : (v as Status);
  const parseMarketCycle = (v: string): MarketCycle | undefined =>
    v === "all" ? undefined : (v as MarketCycle);
  const parseTransactionType = (v: string): TransactionType | undefined =>
    v === "all" ? undefined : (v as TransactionType);

  return (
    <section aria-label="filters" className="border-b border-border pb-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <FilterField
          label="outcome"
          value={props.outcome ?? "all"}
          onChange={v => props.onChangeOutcome(parseOutcome(v))}
        >
          <option value="all">all</option>
          <option value="win">win</option>
          <option value="loss">loss</option>
          <option value="breakeven">breakeven</option>
        </FilterField>
        <FilterField
          label="direction"
          value={props.direction ?? "all"}
          onChange={v => props.onChangeDirection(parseDirection(v))}
        >
          <option value="all">all</option>
          <option value="long">long</option>
          <option value="short">short</option>
        </FilterField>
        <FilterField
          label="status"
          value={props.status ?? "all"}
          onChange={v => props.onChangeStatus(parseStatus(v))}
        >
          <option value="all">all</option>
          <option value="open">open</option>
          <option value="closed">closed</option>
          <option value="reviewed">reviewed</option>
        </FilterField>
        <FilterField
          label="pair"
          value={props.pair || "all"}
          onChange={v => props.onChangePair(v === "all" ? "" : v)}
        >
          <option value="all">all</option>
          {props.tradingPairs?.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </FilterField>
        <FilterField
          label="cycle"
          value={props.marketCycle ?? "all"}
          onChange={v => props.onChangeMarketCycle(parseMarketCycle(v))}
        >
          <option value="all">all</option>
          {MARKET_CYCLES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterField>
        <FilterField
          label="type"
          value={props.transactionType ?? "all"}
          onChange={v => props.onChangeTransactionType(parseTransactionType(v))}
        >
          <option value="all">all</option>
          {TRANSACTION_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </FilterField>
        {props.hasFilters && (
          <button
            type="button"
            onClick={props.onClear}
            className="text-label hover:text-foreground transition-colors ml-auto self-end pb-1.5"
          >
            clear filters →
          </button>
        )}
      </div>
    </section>
  );
}
