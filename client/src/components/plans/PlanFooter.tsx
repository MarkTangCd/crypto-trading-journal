import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { SCENARIO_OUTCOMES } from "@shared/const";
import type { Plan, PlanObservation, PlanScenario } from "@shared/types";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Outcome = (typeof SCENARIO_OUTCOMES)[number];
type PlanWithChildren = Plan & {
  scenarios: PlanScenario[];
  observations: PlanObservation[];
};

const OUTCOME_LABEL: Record<Outcome, string> = {
  triggered: "● triggered",
  invalidated: "○ invalidated",
};

function VerdictToggle({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Outcome | undefined;
  onChange: (outcome: Outcome) => void;
}) {
  return (
    <div role="radiogroup" aria-label={`verdict for ${name}`} className="flex">
      {SCENARIO_OUTCOMES.map(outcome => (
        <button
          key={outcome}
          type="button"
          role="radio"
          aria-checked={value === outcome}
          onClick={() => onChange(outcome)}
          className={cn(
            "border border-border -ml-px first:ml-0 px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
            value === outcome
              ? "bg-foreground text-background border-foreground relative z-10"
              : "hover:border-foreground"
          )}
        >
          {OUTCOME_LABEL[outcome]}
        </button>
      ))}
    </div>
  );
}

function ClosePanel({
  plan,
  isPending,
  onClose,
  onCancel,
}: {
  plan: PlanWithChildren;
  isPending: boolean;
  onClose: (verdicts: { scenarioId: number; outcome: Outcome }[]) => void;
  onCancel: () => void;
}) {
  // Pre-filled from the outcomes stored by the previous close, if any.
  const [verdicts, setVerdicts] = useState<Record<number, Outcome>>(() => {
    const initial: Record<number, Outcome> = {};
    for (const s of plan.scenarios) if (s.outcome) initial[s.id] = s.outcome;
    return initial;
  });
  const done = plan.scenarios.filter(s => verdicts[s.id]).length;
  const ready = done === plan.scenarios.length;

  return (
    <section
      aria-labelledby="close-plan-label"
      className="space-y-4 border-t border-foreground pt-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="close-plan-label" className="text-base font-medium">
          close the plan
        </h2>
        <span className="text-label tabular-nums">
          {done} of {plan.scenarios.length} verdicts
        </span>
      </div>
      <p className="text-sm max-w-prose">
        for each scenario: did the market reach it? one it never reached is
        invalidated.
      </p>
      <ul>
        {plan.scenarios.map((s, index) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-border"
          >
            <span className="text-sm">
              <span className="font-medium">
                {String.fromCharCode(97 + index)} · {s.name}
              </span>
              {/* .text-label lowercases; timeframes keep uppercase H/D */}
              <span className="text-label normal-case!">
                {" "}
                {s.side} · {s.primaryTimeFrame}
              </span>
            </span>
            <VerdictToggle
              name={s.name}
              value={verdicts[s.id]}
              onChange={outcome =>
                setVerdicts(current => ({ ...current, [s.id]: outcome }))
              }
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-6 pt-2">
        <button
          type="button"
          disabled={!ready || isPending}
          onClick={() =>
            onClose(
              plan.scenarios.map(s => ({
                scenarioId: s.id,
                outcome: verdicts[s.id],
              }))
            )
          }
          className="bg-foreground text-background px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
        >
          close plan
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-label hover:text-foreground"
        >
          cancel
        </button>
      </div>
    </section>
  );
}

/**
 * Foot of the plan detail page: close (inline verdict panel), reopen and
 * delete (behind a confirmation).
 */
export function PlanFooter({
  plan,
  closing,
  onClosingChange,
}: {
  plan: PlanWithChildren;
  closing: boolean;
  onClosingChange: (closing: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [deleting, setDeleting] = useState(false);
  const isOpen = plan.closedAt === null;

  const invalidate = () => {
    utils.plan.get.invalidate({ id: plan.id });
    utils.plan.list.invalidate();
  };

  const closeMutation = trpc.plan.close.useMutation({
    onSuccess: () => {
      onClosingChange(false);
      invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to close plan");
    },
  });

  const reopenMutation = trpc.plan.reopen.useMutation({
    onSuccess: invalidate,
    onError: error => {
      toast.error(error.message || "failed to reopen plan");
    },
  });

  const deleteMutation = trpc.plan.delete.useMutation({
    onSuccess: () => {
      setLocation("/plans");
      // Mark stale without refetching: this page is still mounted for a
      // moment and the plan no longer exists.
      utils.plan.get.invalidate({ id: plan.id }, { refetchType: "none" });
      utils.plan.list.invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to delete plan");
    },
  });

  return (
    <>
      {closing ? (
        <ClosePanel
          plan={plan}
          isPending={closeMutation.isPending}
          onClose={verdicts => closeMutation.mutate({ id: plan.id, verdicts })}
          onCancel={() => onClosingChange(false)}
        />
      ) : (
        <footer className="flex items-center gap-6 border-t border-foreground pt-6">
          {isOpen ? (
            <button
              type="button"
              disabled={closeMutation.isPending}
              onClick={() =>
                plan.scenarios.length === 0
                  ? closeMutation.mutate({ id: plan.id, verdicts: [] })
                  : onClosingChange(true)
              }
              className="bg-foreground text-background px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
            >
              close plan →
            </button>
          ) : (
            <button
              type="button"
              disabled={reopenMutation.isPending}
              onClick={() => reopenMutation.mutate({ id: plan.id })}
              className="border border-foreground px-4 py-2 text-sm hover:bg-foreground hover:text-background disabled:opacity-40"
            >
              reopen plan
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="text-label hover:text-foreground"
          >
            delete plan
          </button>
        </footer>
      )}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>delete plan?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan.symbol} with {plan.scenarios.length} scenarios,{" "}
              {plan.observations.length} observations and every image in it.
              this can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate({ id: plan.id })}
            >
              delete plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
