import { Field, INPUT_CLASS } from "@/lib/ledger";
import { cn } from "@/lib/utils";

type Props = {
  endTime: string;
  exitPrice: string;
  disabled: boolean;
  showInvalidExitError: boolean;
  onChangeEndTime: (v: string) => void;
  onChangeExitPrice: (v: string) => void;
};

export function CloseInputs(props: Props) {
  return (
    <div className="space-y-6">
      <Field label="end time" htmlFor="endTime">
        <input
          id="endTime"
          type="datetime-local"
          value={props.endTime}
          onChange={e => props.onChangeEndTime(e.target.value)}
          className={INPUT_CLASS}
          disabled={props.disabled}
        />
      </Field>

      <Field label="exit price" htmlFor="exitPrice">
        <input
          id="exitPrice"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={props.exitPrice}
          onChange={e => props.onChangeExitPrice(e.target.value)}
          className={cn(INPUT_CLASS, "tabular-nums")}
          disabled={props.disabled}
        />
        {props.showInvalidExitError && (
          <p className="text-label status-loss">
            enter a valid positive exit price
          </p>
        )}
      </Field>
    </div>
  );
}
