import { PlanEditor } from "@/components/plans/PlanEditor";
import { PlanObservations } from "@/components/plans/PlanObservations";
import { PlanScenarios } from "@/components/plans/PlanScenarios";
import { SectionHeader, fmtDayTime, fmtDuration } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { isEmptyDoc } from "@shared/richText";
import { utc8Parts } from "@shared/time";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

export default function PlanDetail() {
  const params = useParams<{ id: string }>();
  const planId = parseInt(params.id || "0");
  const utils = trpc.useUtils();
  const {
    data: plan,
    isLoading,
    error,
  } = trpc.plan.get.useQuery(
    { id: planId },
    { enabled: planId > 0, retry: false }
  );
  const { data: symbolSuggestions } = trpc.plan.symbolSuggestions.useQuery();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [symbolDraft, setSymbolDraft] = useState<string | null>(null);

  // Autosave: set the saved mark from the result; never invalidate plan.get
  // here, it would reset the editor.
  const autosaveMutation = trpc.plan.update.useMutation({
    onSuccess: ({ updatedAt }) => setSavedAt(updatedAt),
    onError: error => {
      toast.error(error.message || "failed to save market context");
    },
  });

  const symbolMutation = trpc.plan.update.useMutation({
    onSuccess: ({ updatedAt }) => {
      setSavedAt(updatedAt);
      setSymbolDraft(null);
      utils.plan.get.invalidate({ id: planId });
      utils.plan.list.invalidate();
    },
    onError: error => {
      toast.error(
        error.data?.code === "BAD_REQUEST"
          ? "invalid symbol"
          : error.message || "failed to save symbol"
      );
      setSymbolDraft(null);
    },
  });

  if (planId > 0 && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4 max-w-3xl">
        <p className="text-title">
          {!error || error.data?.code === "NOT_FOUND"
            ? "plan not found"
            : "failed to load plan"}
        </p>
        <Link href="/plans" className="text-sm hover:underline">
          ← plans
        </Link>
      </div>
    );
  }

  const isOpen = plan.closedAt === null;
  const symbol = symbolDraft ?? plan.symbol;

  const commitSymbol = () => {
    if (symbolDraft === null) return;
    const value = symbolDraft.trim();
    if (!value || value === plan.symbol) {
      setSymbolDraft(null);
      return;
    }
    symbolMutation.mutate({ id: plan.id, symbol: value });
  };

  return (
    <div className="space-y-12 max-w-3xl pb-24">
      <div className="flex items-baseline justify-between gap-4">
        <Link href="/plans" className="text-label hover:text-foreground">
          ← plans
        </Link>
        {savedAt && (
          <span className="text-label tabular-nums" aria-live="polite">
            saved {utc8Parts(savedAt).hhmm}
          </span>
        )}
      </div>

      <header className="space-y-3">
        {isOpen ? (
          <>
            <input
              type="text"
              value={symbol}
              onChange={event =>
                setSymbolDraft(event.target.value.toUpperCase())
              }
              onBlur={commitSymbol}
              onKeyDown={event => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              list="plan-detail-symbols"
              aria-label="symbol"
              className="text-display w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none px-0"
            />
            <datalist id="plan-detail-symbols">
              {symbolSuggestions?.map(suggestion => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </>
        ) : (
          <h1 className="text-display">{plan.symbol}</h1>
        )}
        <p className="text-label tabular-nums">
          {plan.closedAt === null
            ? `open · since ${fmtDayTime(plan.createdAt)} · ${fmtDuration(plan.createdAt.getTime(), Date.now())}`
            : `closed ${fmtDayTime(plan.closedAt)} · was open ${fmtDuration(plan.createdAt.getTime(), plan.closedAt.getTime())}`}
        </p>
      </header>

      <section aria-labelledby="market-context-label" className="space-y-4">
        <SectionHeader id="market-context-label">market context</SectionHeader>
        {!isOpen && plan.marketContext === null ? (
          <p className="text-sm">no market context was written.</p>
        ) : (
          <PlanEditor
            planId={plan.id}
            content={plan.marketContext}
            editable={isOpen}
            onSave={doc =>
              autosaveMutation.mutate({
                id: plan.id,
                marketContext: isEmptyDoc(doc) ? null : doc,
              })
            }
            placeholder="what is the market doing, and why does this symbol matter now?"
          />
        )}
      </section>

      <PlanScenarios
        planId={plan.id}
        scenarios={plan.scenarios}
        editable={isOpen}
        onSaved={setSavedAt}
      />

      <PlanObservations
        planId={plan.id}
        observations={plan.observations}
        editable={isOpen}
        onSaved={setSavedAt}
      />
    </div>
  );
}
