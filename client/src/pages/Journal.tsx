import { useAccount } from "@/contexts/AccountContext";
import {
  INPUT_CLASS,
  SectionHeader,
  fmtDayTime,
  fmtDecimal,
  fmtMoney,
  toneClass,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { Trade } from "@shared/types";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";

const LINK = "text-label hover:text-foreground transition-colors";
const TH = "text-label font-normal text-left py-3 pr-6 whitespace-nowrap";
const TD = "py-3 pr-6 align-baseline whitespace-nowrap";

const px = (v: string | null) => fmtDecimal(v, 4);

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Pnl({ value }: { value: number }) {
  const tone = value > 0 ? "win" : value < 0 ? "loss" : undefined;
  return (
    <span className={toneClass(tone)}>
      {value >= 0 ? "+" : "-"}${fmtMoney(Math.abs(value))}
    </span>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2
        className="h-6 w-6 animate-spin text-foreground"
        aria-label="loading"
      />
    </div>
  );
}

function stateWord(entry: {
  reviewedAt: Date | null;
  openTradeCount: number;
}): string {
  if (entry.reviewedAt !== null) return "reviewed";
  return entry.openTradeCount > 0
    ? `${entry.openTradeCount} open`
    : "to review";
}

const entriesWord = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

export default function Journal() {
  const params = new URLSearchParams(useSearch());
  const picking = params.get("new") === "1";
  const pick = Number(params.get("pick"));
  const [, setLocation] = useLocation();
  const { selectedAccount, accounts } = useAccount();
  const { data: entries, isLoading, error } = trpc.journal.list.useQuery();

  if (isLoading) return <Spinner />;

  const all = entries ?? [];
  const toReview = all.filter(entry => stateWord(entry) === "to review");

  return (
    <div className="space-y-12 max-w-5xl">
      <header className="flex items-baseline justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-title">journal</h1>
          <p className="text-label tabular-nums">
            {entriesWord(all.length)} · {toReview.length} to review
          </p>
        </div>
        <div className="flex items-baseline gap-6">
          <Link href="/journal/setups" className={LINK}>
            setups
          </Link>
          {!picking && (
            <Link
              href="/journal?new=1"
              className="text-sm hover:underline underline-offset-4"
            >
              new entry →
            </Link>
          )}
        </div>
      </header>

      {picking ? (
        <Picker preselect={Number.isInteger(pick) && pick > 0 ? pick : null} />
      ) : error ? (
        <p className="text-sm">failed to load journal: {error.message}</p>
      ) : all.length === 0 ? (
        <p className="text-sm border-t border-border pt-16">
          no journal entries yet. pick the trades of a position with{" "}
          <Link href="/journal?new=1" className="underline underline-offset-4">
            new entry →
          </Link>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>date</th>
                <th className={TH}>symbol</th>
                <th className={TH}>side</th>
                <th className={TH}>setups</th>
                <th className={cn(TH, "text-right")}>trades</th>
                <th className={cn(TH, "text-right")}>net pnl</th>
                <th className={cn(TH, "pr-0")}>state</th>
              </tr>
            </thead>
            <tbody>
              {all.map(entry => {
                const word = stateWord(entry);
                const href = `/journal/${entry.id}`;
                const account =
                  entry.accountId === selectedAccount?.id
                    ? undefined
                    : accounts.find(a => a.id === entry.accountId);
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setLocation(href)}
                    className="border-b border-border cursor-pointer hover:bg-foreground/[0.03]"
                  >
                    <td className={TD}>
                      <Link
                        href={href}
                        className="hover:underline underline-offset-4"
                      >
                        {entry.date === null ? "—" : fmtDayTime(entry.date)}
                      </Link>
                    </td>
                    <td className={cn(TD, "font-medium")}>
                      {entry.symbol.toLowerCase()}
                      {account && (
                        <span className="text-label font-normal">
                          {" "}
                          · {account.name}
                        </span>
                      )}
                    </td>
                    <td className={TD}>{entry.sides.join(" / ")}</td>
                    <td className={cn(TD, "whitespace-normal min-w-[10rem]")}>
                      {entry.setupNames.length > 0 ? (
                        entry.setupNames.join(", ")
                      ) : (
                        <span className="text-label">—</span>
                      )}
                    </td>
                    <td className={cn(TD, "text-right")}>{entry.tradeCount}</td>
                    <td className={cn(TD, "text-right")}>
                      <Pnl value={entry.netPnlUsd} />
                    </td>
                    <td
                      className={cn(
                        TD,
                        "pr-0",
                        word === "reviewed"
                          ? "text-muted-foreground"
                          : "font-medium"
                      )}
                    >
                      {word === "reviewed" ? word : `● ${word}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Replaces the table: tick the trades of one position, then create the entry.
function Picker({ preselect }: { preselect: number | null }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { selectedAccount, isLoading: isAccountLoading } = useAccount();
  const { data: trades, isLoading: isTradesLoading } =
    trpc.journal.pickableTrades.useQuery(
      { accountId: selectedAccount?.id ?? 0 },
      { enabled: selectedAccount !== null }
    );
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<number[]>(
    preselect === null ? [] : [preselect]
  );

  const create = trpc.journal.create.useMutation({
    onSuccess: ({ id }) => {
      utils.journal.list.invalidate();
      utils.journal.pickableTrades.invalidate();
      setLocation(`/journal/${id}`);
    },
    onError: error => {
      toast.error(error.message || "failed to create entry");
    },
  });

  if (isAccountLoading || (selectedAccount !== null && isTradesLoading)) {
    return <Spinner />;
  }

  if (!selectedAccount) {
    return (
      <p className="text-sm text-muted-foreground">
        no linked account.{" "}
        <Link href="/accounts" className="underline underline-offset-4">
          link one →
        </Link>
      </p>
    );
  }

  const pickable = trades ?? [];
  // Drop ticks that are not pickable here (another account, already linked).
  const selected = ticked.filter(id => pickable.some(t => t.id === id));
  const lockedSymbol = pickable.find(t => t.id === selected[0])?.symbol ?? null;
  const q = query.trim().toUpperCase();
  const visible = pickable.filter(t => !q || t.symbol.includes(q));
  const isDisabled = (t: Trade) =>
    lockedSymbol !== null && t.symbol !== lockedSymbol;
  const toggle = (id: number) =>
    setTicked(current =>
      current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    );

  return (
    <section aria-labelledby="picker-label" className="space-y-6">
      <SectionHeader id="picker-label">
        pick the trades of this entry · {selectedAccount.exchange}{" "}
        {selectedAccount.name}
      </SectionHeader>
      <input
        type="text"
        value={query}
        onChange={event => setQuery(event.target.value.toUpperCase())}
        placeholder="search symbol"
        aria-label="search symbol"
        autoFocus
        className={cn(INPUT_CLASS, "max-w-xs placeholder:normal-case")}
      />
      {lockedSymbol && (
        <p className="text-label">
          locked to {lockedSymbol.toLowerCase()}: an entry holds one symbol.
          untick every trade to pick another.
        </p>
      )}
      {visible.length === 0 ? (
        <p className="text-sm py-6">
          {pickable.length === 0
            ? "every trade in this account is already in an entry."
            : "no unlinked trades match this symbol."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className={cn(TH, "w-8")}>
                  <span className="sr-only">pick</span>
                </th>
                <th className={TH}>opened</th>
                <th className={TH}>symbol</th>
                <th className={TH}>status</th>
                <th className={TH}>position</th>
                <th className={cn(TH, "text-right pr-0")}>pnl</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(t => {
                const disabled = isDisabled(t);
                const checked = selected.includes(t.id);
                return (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b border-border",
                      disabled ? "opacity-35" : "hover:bg-foreground/[0.03]",
                      checked && "bg-foreground/[0.05]"
                    )}
                  >
                    <td className={TD}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(t.id)}
                        aria-label={`pick ${t.symbol} ${t.side} opened ${fmtDayTime(t.openTime)}`}
                        className="accent-foreground h-4 w-4 align-middle"
                      />
                    </td>
                    <td className={TD}>{fmtDayTime(t.openTime)}</td>
                    <td className={cn(TD, "font-medium")}>
                      {t.symbol.toLowerCase()}
                    </td>
                    <td className={TD}>{t.status}</td>
                    <td className={TD}>
                      {t.side} {fmtDecimal(t.quantity)} @ {px(t.entryPrice)}
                      {t.exitPrice !== null && <> → {px(t.exitPrice)}</>}
                    </td>
                    <td className={cn(TD, "text-right pr-0")}>
                      {t.status === "open" ? (
                        <span className="text-label">open</span>
                      ) : (
                        <Pnl value={parseFloat(t.realizedPnlUsd)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-baseline gap-8 border-t border-border pt-4">
        <button
          type="button"
          disabled={selected.length === 0 || create.isPending}
          onClick={() => create.mutate({ tradeIds: selected })}
          className="bg-foreground text-background px-4 py-2 text-sm disabled:opacity-40"
        >
          {selected.length > 0
            ? `create entry with ${plural(selected.length, "trade")} →`
            : "tick at least one trade"}
        </button>
        <Link href="/journal" className={LINK}>
          cancel
        </Link>
      </div>
    </section>
  );
}
