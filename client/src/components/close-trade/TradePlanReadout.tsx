import { Field, fmtDecimal, fmtMoney, fmtRatio } from "@/lib/ledger";

type Props = {
  entryPrice: string | null;
  positionSizeUsdt: string | null;
  plannedStopLossPrice: string | null;
  plannedTakeProfitPrice: string | null;
  plannedRiskRewardRatio: string | null;
};

export function TradePlanReadout(props: Props) {
  return (
    <section aria-labelledby="plan-readout" className="space-y-4">
      <p id="plan-readout" className="text-label">
        trade plan
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 tabular-nums">
        <Field label="entry">{fmtDecimal(props.entryPrice)}</Field>
        <Field label="size (usdt)">
          {props.positionSizeUsdt ? fmtMoney(props.positionSizeUsdt) : "—"}
        </Field>
        <Field label="planned stop">
          {fmtDecimal(props.plannedStopLossPrice)}
        </Field>
        <Field label="planned target">
          {fmtDecimal(props.plannedTakeProfitPrice)}
        </Field>
        <Field label="planned r/r">
          {fmtRatio(props.plannedRiskRewardRatio)}
        </Field>
      </div>
    </section>
  );
}
