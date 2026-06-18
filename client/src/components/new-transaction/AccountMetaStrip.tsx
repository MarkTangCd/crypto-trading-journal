import { fmtMoney } from "@/lib/ledger";
import { cn } from "@/lib/utils";

type Props = {
  currentBalance: string;
  consecutiveLosses: number;
};

export function AccountMetaStrip(props: Props) {
  return (
    <div className="border-y border-border py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <p className="text-label">current balance</p>
        <p className="sm:mt-1.5 tabular-nums">
          ${fmtMoney(props.currentBalance)}
        </p>
      </div>
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <p className="text-label">losing streak</p>
        <p
          className={cn(
            "sm:mt-1.5 tabular-nums",
            props.consecutiveLosses > 3 && "status-loss"
          )}
        >
          {props.consecutiveLosses}
        </p>
      </div>
    </div>
  );
}
