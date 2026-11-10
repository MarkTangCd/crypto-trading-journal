import { INPUT_CLASS, SectionHeader, fmtDate, fmtDuration } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { utc8Parts } from "@shared/time";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

const ROW_CLASS =
  "grid grid-cols-[7rem_1fr_auto] gap-x-6 items-baseline py-3 border-b border-border text-sm hover:underline";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Filled = triggered, hollow = invalidated, dot = no verdict. Ink only:
// scenario outcomes are not trade wins or losses (One-Signal Rule).
function outcomeGlyph(outcome: string | null): string {
  if (outcome === "triggered") return "●";
  if (outcome === "invalidated") return "○";
  return "·";
}

export default function Plans() {
  const [, setLocation] = useLocation();
  const { data: plans, isLoading } = trpc.plan.list.useQuery();
  const { data: symbolSuggestions } = trpc.plan.symbolSuggestions.useQuery();
  const [symbol, setSymbol] = useState("");

  const createMutation = trpc.plan.create.useMutation({
    onSuccess: ({ id }) => setLocation(`/plans/${id}`),
    onError: error => {
      toast.error(
        error.data?.code === "BAD_REQUEST"
          ? "invalid symbol"
          : error.message || "failed to open plan"
      );
    },
  });

  const handleCreate = () => {
    const value = symbol.trim();
    if (!value) return;
    createMutation.mutate({ symbol: value });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  const allPlans = plans ?? [];
  // listPlans already orders open plans newest first and closed by closedAt.
  const openPlans = allPlans.filter(plan => plan.closedAt === null);
  const closedPlans = allPlans.filter(plan => plan.closedAt !== null);
  const closedByDay = new Map<string, typeof closedPlans>();
  for (const plan of closedPlans) {
    const day = fmtDate(plan.closedAt ?? plan.createdAt);
    closedByDay.set(day, [...(closedByDay.get(day) ?? []), plan]);
  }
  const now = Date.now();

  return (
    <div className="space-y-12 max-w-3xl">
      <header className="space-y-2">
        <p className="text-title">plans</p>
        <p className="text-label">
          scenarios written before the market decides
        </p>
      </header>

      <form
        onSubmit={event => {
          event.preventDefault();
          handleCreate();
        }}
        className="flex items-end gap-4"
      >
        <input
          type="text"
          value={symbol}
          onChange={event => setSymbol(event.target.value.toUpperCase())}
          list="plan-symbols"
          placeholder="symbol, e.g. BTCUSDT"
          aria-label="symbol for a new plan"
          className={cn(INPUT_CLASS, "placeholder:normal-case")}
        />
        <datalist id="plan-symbols">
          {symbolSuggestions?.map(suggestion => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={createMutation.isPending || symbol.trim().length === 0}
          className="text-label hover:text-foreground transition-colors disabled:opacity-50 whitespace-nowrap pb-1.5"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "open plan →"
          )}
        </button>
      </form>

      <section aria-labelledby="open-plans-label">
        <SectionHeader id="open-plans-label">
          open · {openPlans.length}
        </SectionHeader>
        {openPlans.length === 0 ? (
          <p className="py-4 text-sm">
            {allPlans.length === 0
              ? "no plans yet. type a symbol above to write the first one."
              : "no open plans. type a symbol above to write one."}
          </p>
        ) : (
          <ul>
            {openPlans.map(plan => (
              <li key={plan.id}>
                <Link href={`/plans/${plan.id}`} className={ROW_CLASS}>
                  <span className="tabular-nums">
                    {fmtDuration(plan.createdAt.getTime(), now)}
                  </span>
                  <span>
                    <span className="font-medium">
                      {plan.symbol.toLowerCase()}
                    </span>
                    <span className="text-label tabular-nums">
                      {" "}
                      · {plural(plan.scenarioCount, "scenario")} ·{" "}
                      {plural(plan.observationCount, "observation")}
                    </span>
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {[...closedByDay].map(([day, dayPlans]) => (
        <section key={day} aria-label={`closed ${day}`}>
          <SectionHeader>closed · {day}</SectionHeader>
          <ul>
            {dayPlans.map(plan => {
              const triggered = plan.outcomes.filter(
                outcome => outcome === "triggered"
              ).length;
              const invalidated = plan.outcomes.filter(
                outcome => outcome === "invalidated"
              ).length;
              return (
                <li key={plan.id}>
                  <Link href={`/plans/${plan.id}`} className={ROW_CLASS}>
                    <span className="tabular-nums">
                      {utc8Parts(plan.closedAt ?? plan.createdAt).hhmm}
                    </span>
                    <span>
                      <span className="font-medium">
                        {plan.symbol.toLowerCase()}
                      </span>{" "}
                      <span className="tracking-[0.2em]" aria-hidden>
                        {plan.outcomes.map(outcomeGlyph).join("")}
                      </span>
                    </span>
                    <span className="text-label tabular-nums">
                      {plan.scenarioCount === 0
                        ? "—"
                        : `${triggered} triggered · ${invalidated} invalidated`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
