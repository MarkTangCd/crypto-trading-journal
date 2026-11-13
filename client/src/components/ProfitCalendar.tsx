import { type Tone, fmtMoney, toneClass } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { utc8DayKey, utc8Parts } from "@shared/time";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const signed = (v: number) => `${v >= 0 ? "+" : "-"}$${fmtMoney(Math.abs(v))}`;
const pnlTone = (v: number): Tone =>
  v > 0 ? "win" : v < 0 ? "loss" : undefined;
// Whole dollars without the currency sign, for phone-width cells.
const compact = (v: number) =>
  `${v >= 0 ? "+" : "-"}${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
const pad = (n: number) => String(n).padStart(2, "0");

// Month grid of daily PnL for one account. Days are UTC+8 close days.
export function ProfitCalendar({ accountId }: { accountId: number }) {
  const today = utc8DayKey(Date.now());
  const currentMonth = today.slice(0, 7);
  // "yyyy-mm"; months are navigated client-side over one full fetch.
  const [month, setMonth] = useState(currentMonth);

  const { data: days, isLoading } = trpc.stats.dailyPnl.useQuery({
    accountId,
  });

  const [year, monthNumber] = month.split("-").map(Number);
  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  const first = Date.UTC(year, monthNumber - 1, 1);
  // Blank cells before the 1st so weeks start on Monday.
  const leading = (new Date(first).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const trailing = (7 - ((leading + dayCount) % 7)) % 7;
  const cellClass = "min-h-20 border-t border-border py-2 pr-2 tabular-nums";

  const byDay = new Map((days ?? []).map(d => [d.day, d]));
  const monthDays = (days ?? []).filter(d => d.day.startsWith(month));
  const monthPnl = monthDays.reduce((sum, d) => sum + parseFloat(d.pnlUsd), 0);
  const winningDays = monthDays.filter(d => parseFloat(d.pnlUsd) > 0).length;

  return (
    <section aria-labelledby="calendar-label">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 id="calendar-label" className="text-label">
          calendar · {utc8Parts(first).monthName} {year}
        </h2>
        <div className="flex items-baseline gap-4 text-label">
          <button
            type="button"
            aria-label="previous month"
            onClick={() => shiftMonth(-1)}
            className="hover:text-foreground transition-colors"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="next month"
            onClick={() => shiftMonth(1)}
            disabled={month === currentMonth}
            className="hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground"
          >
            →
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2
            className="h-6 w-6 animate-spin text-foreground"
            aria-label="loading"
          />
        </div>
      ) : (
        <>
          {monthDays.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              no closed trades this month.
            </p>
          ) : (
            <p
              className={cn(
                "mt-6 text-2xl font-medium tabular-nums",
                toneClass(pnlTone(monthPnl))
              )}
            >
              {signed(monthPnl)}{" "}
              <span className="text-label">
                · {winningDays} of {monthDays.length} days won
              </span>
            </p>
          )}

          <div className="mt-6 grid grid-cols-7">
            {WEEKDAYS.map(weekday => (
              <p key={weekday} className="text-label pb-2">
                {weekday}
              </p>
            ))}
            {Array.from({ length: leading }, (_, i) => (
              <div key={`lead-${i}`} className={cellClass} />
            ))}
            {Array.from({ length: dayCount }, (_, i) => {
              const key = `${month}-${pad(i + 1)}`;
              // Future days stay blank.
              if (key > today) return <div key={key} className={cellClass} />;

              const dateLabel = (
                <p
                  className={cn(
                    "text-xs text-muted-foreground",
                    key === today &&
                      "text-foreground underline underline-offset-4"
                  )}
                >
                  {i + 1}
                </p>
              );
              const entry = byDay.get(key);
              if (!entry) {
                return (
                  <div key={key} className={cellClass}>
                    {dateLabel}
                  </div>
                );
              }

              const pnl = parseFloat(entry.pnlUsd);
              return (
                <Link
                  key={key}
                  href={`/trades#${key}`}
                  className={cn(cellClass, "block hover:bg-muted/50")}
                >
                  {dateLabel}
                  <p
                    className={cn(
                      "mt-1 text-xs sm:text-sm font-medium",
                      toneClass(pnlTone(pnl))
                    )}
                  >
                    <span className="sm:hidden">{compact(pnl)}</span>
                    <span className="hidden sm:inline">{signed(pnl)}</span>
                  </p>
                  <p className="hidden sm:block text-xs text-muted-foreground">
                    {entry.tradeCount}{" "}
                    {entry.tradeCount === 1 ? "trade" : "trades"}
                  </p>
                </Link>
              );
            })}
            {Array.from({ length: trailing }, (_, i) => (
              <div key={`trail-${i}`} className={cellClass} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
