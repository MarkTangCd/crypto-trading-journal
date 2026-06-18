import { cn } from "@/lib/utils";
import type { Transaction } from "@shared/types";
import type React from "react";
import { TransactionRow, type CloseTradePayload } from "./TransactionRow";

type SortBy = "createdAt" | "startTime" | "endTime" | "returnAmount";
type SortOrder = "asc" | "desc";

function SortHeader({
  active,
  order,
  onClick,
  align,
  children,
}: {
  active: boolean;
  order: SortOrder;
  onClick: () => void;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  const indicator = active ? (order === "desc" ? "↓" : "↑") : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-label hover:text-foreground transition-colors inline-flex items-baseline gap-1",
        align === "right" && "ml-auto"
      )}
    >
      <span>{children}</span>
      {indicator && (
        <span aria-hidden="true" className="text-foreground">
          {indicator}
        </span>
      )}
    </button>
  );
}

type Props = {
  transactions: Transaction[];
  sortBy: SortBy;
  sortOrder: SortOrder;
  onToggleSort: (column: SortBy) => void;
  onCloseClick: (payload: CloseTradePayload) => void;
  onDeleteClick: (id: number) => void;
};

export type { SortBy, SortOrder, CloseTradePayload };
export function TransactionsTable(props: Props) {
  return (
    <section aria-label="trades" className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border">
            <th className="py-3 pr-4 text-left">
              <SortHeader
                active={props.sortBy === "startTime"}
                order={props.sortOrder}
                onClick={() => props.onToggleSort("startTime")}
                align="left"
              >
                date
              </SortHeader>
            </th>
            <th className="py-3 px-4 text-left text-label font-normal">pair</th>
            <th className="py-3 px-4 text-left text-label font-normal">side</th>
            <th className="py-3 px-4 text-left text-label font-normal">
              outcome
            </th>
            <th className="py-3 px-4 text-right text-label font-normal">r/r</th>
            <th className="py-3 px-4 text-right">
              <SortHeader
                active={props.sortBy === "returnAmount"}
                order={props.sortOrder}
                onClick={() => props.onToggleSort("returnAmount")}
                align="right"
              >
                return
              </SortHeader>
            </th>
            <th className="py-3 px-4 text-right text-label font-normal">
              balance
            </th>
            <th
              className="py-3 pl-4 text-right text-label font-normal"
              aria-label="actions"
            />
          </tr>
        </thead>
        <tbody>
          {props.transactions.map(tx => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              onCloseClick={props.onCloseClick}
              onDeleteClick={props.onDeleteClick}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
