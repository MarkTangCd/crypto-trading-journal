import { Field, fmtRatio, INPUT_CLASS, SectionHeader } from "@/lib/ledger";
import type { PlannedRrPreview } from "@/lib/plannedRiskReward";
import { cn } from "@/lib/utils";

type Props = {
  entryPrice: string;
  positionSizeUsdt: string;
  plannedStopLossPrice: string;
  plannedTakeProfitPrice: string;
  preview: PlannedRrPreview;
  onChange<
    K extends
      | "entryPrice"
      | "positionSizeUsdt"
      | "plannedStopLossPrice"
      | "plannedTakeProfitPrice",
  >(
    field: K,
    value: string
  ): void;
};

export function PlanSection(props: Props) {
  return (
    <section className="space-y-6">
      <SectionHeader>plan</SectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <Field label="entry price" htmlFor="entryPrice">
          <input
            id="entryPrice"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={props.entryPrice}
            onChange={e => props.onChange("entryPrice", e.target.value)}
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
        <Field label="position size (usdt)" htmlFor="positionSizeUsdt">
          <input
            id="positionSizeUsdt"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={props.positionSizeUsdt}
            onChange={e => props.onChange("positionSizeUsdt", e.target.value)}
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
        <Field label="planned stop loss" htmlFor="plannedStopLossPrice">
          <input
            id="plannedStopLossPrice"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={props.plannedStopLossPrice}
            onChange={e =>
              props.onChange("plannedStopLossPrice", e.target.value)
            }
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
        <Field label="planned take profit" htmlFor="plannedTakeProfitPrice">
          <input
            id="plannedTakeProfitPrice"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={props.plannedTakeProfitPrice}
            onChange={e =>
              props.onChange("plannedTakeProfitPrice", e.target.value)
            }
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-label">planned r/r</p>
        <p
          className={cn(
            "mt-2 text-2xl font-medium leading-none tabular-nums",
            props.preview.kind === "invalid" && "status-loss"
          )}
        >
          {props.preview.kind === "ok" ? fmtRatio(props.preview.value) : "—"}
        </p>
        {props.preview.kind === "invalid" && (
          <p className="text-label mt-2 status-loss">{props.preview.reason}</p>
        )}
      </div>
    </section>
  );
}
