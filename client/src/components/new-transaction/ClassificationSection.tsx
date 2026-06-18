import { Field, SELECT_CLASS, SectionHeader } from "@/lib/ledger";
import {
  MARKET_CYCLES,
  TRANSACTION_TYPES,
  type MarketCycle,
  type TransactionType,
} from "@shared/const";

type Props = {
  marketCycle: MarketCycle | "";
  transactionType: TransactionType | "";
  onChangeMarketCycle: (v: MarketCycle | "") => void;
  onChangeTransactionType: (v: TransactionType | "") => void;
};

export function ClassificationSection(props: Props) {
  return (
    <section className="space-y-6">
      <SectionHeader>classification</SectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <Field label="market cycle" htmlFor="marketCycle">
          <select
            id="marketCycle"
            value={props.marketCycle}
            onChange={e =>
              props.onChangeMarketCycle(e.target.value as MarketCycle | "")
            }
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            {MARKET_CYCLES.map(c => (
              <option key={c} value={c}>
                {c.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="type" htmlFor="transactionType">
          <select
            id="transactionType"
            value={props.transactionType}
            onChange={e =>
              props.onChangeTransactionType(
                e.target.value as TransactionType | ""
              )
            }
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            {TRANSACTION_TYPES.map(t => (
              <option key={t} value={t}>
                {t.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}
