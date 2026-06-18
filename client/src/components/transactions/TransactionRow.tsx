import {
  type Tone,
  fmtDateTime,
  fmtDecimal,
  fmtMoney,
  fmtRatio,
  toneClass,
} from "@/lib/ledger";
import { cn } from "@/lib/utils";
import type { Transaction } from "@shared/types";
import { Link } from "wouter";
type CloseTradePayload = {
  id: number;
  accountId: number;
  tradingPair: string;
  direction: string;
  timeFrame: string;
  startTime: number;
  entryPrice: string | null;
  positionSizeUsdt: string | null;
  plannedStopLossPrice: string | null;
  plannedTakeProfitPrice: string | null;
  plannedRiskRewardRatio: string | null;
};
function outcomeTone(outcome: Transaction["outcome"]): Tone {
  return outcome === "win" ? "win" : outcome === "loss" ? "loss" : undefined;
}
function returnTone(returnAmount: string | null): Tone {
  if (returnAmount === null) return undefined;
  const n = parseFloat(returnAmount);
  return n > 0 ? "win" : n < 0 ? "loss" : undefined;
}
function formatMeta(tx: Transaction): string {
  return [tx.timeFrame, tx.marketCycle, tx.transactionType]
    .filter(Boolean)
    .join(" · ")
    .toLowerCase();
}
function formatPlanMeta(tx: Transaction): string {
  const parts: string[] = [];
  if (tx.entryPrice) parts.push(`entry ${fmtDecimal(tx.entryPrice)}`);
  if (tx.positionSizeUsdt)
    parts.push(`size ${fmtMoney(tx.positionSizeUsdt)} usdt`);
  return parts.join(" · ");
}
function statusMark(status: Transaction["status"]): string | null {
  return status === "open"
    ? "[open]"
    : status === "reviewed"
      ? "[reviewed]"
      : null;
}
type Props = {
  tx: Transaction;
  onCloseClick: (payload: CloseTradePayload) => void;
  onDeleteClick: (id: number) => void;
};
export type { CloseTradePayload };
function TransactionActions({ tx, onCloseClick, onDeleteClick }: Props) {
  return (
    <div className="inline-flex items-center gap-3">
      {tx.status === "open" && (
        <button
          type="button"
          onClick={() =>
            onCloseClick({
              id: tx.id,
              accountId: tx.accountId,
              tradingPair: tx.tradingPair,
              direction: tx.direction,
              timeFrame: tx.timeFrame,
              startTime: tx.startTime,
              entryPrice: tx.entryPrice ?? null,
              positionSizeUsdt: tx.positionSizeUsdt ?? null,
              plannedStopLossPrice: tx.plannedStopLossPrice ?? null,
              plannedTakeProfitPrice: tx.plannedTakeProfitPrice ?? null,
              plannedRiskRewardRatio: tx.plannedRiskRewardRatio ?? null,
            })
          }
          className="hover:text-foreground transition-colors"
        >
          close →
        </button>
      )}
      {tx.tvUrl && (
        <a
          href={tx.tvUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="open in tradingview"
        >
          tv ↗
        </a>
      )}
      <Link
        href={`/transactions/${tx.id}`}
        className="hover:text-foreground transition-colors"
      >
        view →
      </Link>
      <button
        type="button"
        onClick={() => onDeleteClick(tx.id)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        del
      </button>
    </div>
  );
}
export function TransactionRow({ tx, onCloseClick, onDeleteClick }: Props) {
  const tone = outcomeTone(tx.outcome);
  const ret = tx.returnAmount !== null ? parseFloat(tx.returnAmount) : null;
  const retTone = returnTone(tx.returnAmount);
  const balance =
    tx.accountBalance !== null ? parseFloat(tx.accountBalance) : null;
  const meta = formatMeta(tx);
  const planMeta = formatPlanMeta(tx);
  const mark = statusMark(tx.status);
  const ratio = tx.plannedRiskRewardRatio;
  return (
    <tr className="border-b border-border last:border-b-0 align-top">
      <td className="py-4 pr-4 whitespace-nowrap text-muted-foreground">
        {fmtDateTime(tx.startTime)}
      </td>
      <td className="py-4 px-4 min-w-[10rem]">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-foreground">{tx.tradingPair}</span>
          {mark && <span className="text-label">{mark}</span>}
        </div>
        {meta && (
          <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
        )}
        {planMeta && (
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
            {planMeta}
          </div>
        )}
      </td>
      <td className="py-4 px-4">{tx.direction}</td>
      <td className={cn("py-4 px-4", toneClass(tone))}>
        {tx.outcome ? (
          tx.outcome === "breakeven" ? (
            "be"
          ) : (
            tx.outcome
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {tx.outcome === "loss" &&
          tx.consecutiveLosses != null &&
          tx.consecutiveLosses > 3 && (
            <div className="mt-1 text-xs status-loss">
              {tx.consecutiveLosses} in a row
            </div>
          )}
      </td>
      <td className="py-4 px-4 text-right">
        {ratio ? (
          <span className="inline-flex items-baseline gap-1 justify-end">
            <span className="text-xs text-muted-foreground">plan</span>
            <span>{fmtRatio(ratio)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td
        className={cn(
          "py-4 px-4 text-right font-medium whitespace-nowrap",
          toneClass(retTone)
        )}
      >
        {ret !== null ? (
          <>
            {ret >= 0 ? "+" : "-"}${fmtMoney(Math.abs(ret))}
          </>
        ) : (
          <span className="text-muted-foreground font-normal">—</span>
        )}
      </td>
      <td className="py-4 px-4 text-right whitespace-nowrap">
        {balance !== null ? (
          `$${fmtMoney(balance)}`
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-4 pl-4 text-right whitespace-nowrap text-sm">
        <TransactionActions
          tx={tx}
          onCloseClick={onCloseClick}
          onDeleteClick={onDeleteClick}
        />
      </td>
    </tr>
  );
}
