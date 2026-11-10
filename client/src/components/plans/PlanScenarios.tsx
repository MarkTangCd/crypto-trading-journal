import { PlanEditor } from "@/components/plans/PlanEditor";
import { INPUT_CLASS, SectionHeader } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  SCENARIO_NAME_MAX,
  SCENARIO_SIDES,
  SCENARIO_TIME_FRAMES,
  type ScenarioTimeFrame,
} from "@shared/const";
import { isEmptyDoc } from "@shared/richText";
import type { PlanScenario } from "@shared/types";
import { useState } from "react";
import { toast } from "sonner";

type Side = (typeof SCENARIO_SIDES)[number];

// One-click side / timeframe picker, keyboard reachable.
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: readonly T[];
  value: string;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap">
      {options.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            "px-2 py-0.5 text-xs transition-colors",
            value === option
              ? "bg-foreground text-background"
              : "hover:underline disabled:hover:no-underline disabled:opacity-40"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function useInvalidatePlan(planId: number) {
  const utils = trpc.useUtils();
  return () => {
    utils.plan.get.invalidate({ id: planId });
    utils.plan.list.invalidate();
  };
}

function ScenarioRow({
  planId,
  scenario,
  letter,
  editable,
  onSaved,
}: {
  planId: number;
  scenario: PlanScenario;
  letter: string;
  editable: boolean;
  onSaved: (at: Date) => void;
}) {
  const invalidate = useInvalidatePlan(planId);
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const updateMutation = trpc.plan.updateScenario.useMutation({
    onSuccess: ({ updatedAt }) => {
      onSaved(updatedAt);
      setNameDraft(null);
      invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to save scenario");
      setNameDraft(null);
    },
  });

  // Autosave: never invalidate plan.get here, it would reset the editor.
  const contentMutation = trpc.plan.updateScenario.useMutation({
    onSuccess: ({ updatedAt }) => onSaved(updatedAt),
    onError: error => {
      // The editor flushes on unmount, so typing then deleting the scenario
      // saves into a row that is already gone; nothing is lost.
      if (error.data?.code === "NOT_FOUND") return;
      toast.error(error.message || "failed to save scenario");
    },
  });

  const deleteMutation = trpc.plan.deleteScenario.useMutation({
    onSuccess: invalidate,
    onError: error => {
      toast.error(error.message || "failed to delete scenario");
    },
  });

  const commitName = () => {
    if (nameDraft === null) return;
    const value = nameDraft.trim();
    if (!value || value === scenario.name) {
      setNameDraft(null);
      return;
    }
    updateMutation.mutate({ planId, scenarioId: scenario.id, name: value });
  };

  return (
    <li className="grid grid-cols-[2rem_1fr] gap-x-4 py-5 border-b border-border">
      <span className="text-heading leading-none pt-0.5" aria-hidden>
        {letter}
      </span>
      <div className="space-y-3 min-w-0">
        {editable ? (
          <input
            type="text"
            value={nameDraft ?? scenario.name}
            onChange={event => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={event => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            maxLength={SCENARIO_NAME_MAX}
            aria-label={`scenario ${letter} name`}
            className="w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none text-base font-medium px-0"
          />
        ) : (
          <p className="text-base font-medium">{scenario.name}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segmented<Side>
            options={SCENARIO_SIDES}
            value={scenario.side}
            onChange={side =>
              side !== scenario.side &&
              updateMutation.mutate({ planId, scenarioId: scenario.id, side })
            }
            label={`scenario ${letter} side`}
            disabled={!editable}
          />
          <Segmented<ScenarioTimeFrame>
            options={SCENARIO_TIME_FRAMES}
            value={scenario.primaryTimeFrame}
            onChange={primaryTimeFrame =>
              primaryTimeFrame !== scenario.primaryTimeFrame &&
              updateMutation.mutate({
                planId,
                scenarioId: scenario.id,
                primaryTimeFrame,
              })
            }
            label={`scenario ${letter} primary timeframe`}
            disabled={!editable}
          />
          {editable && (
            <button
              type="button"
              onClick={() =>
                deleteMutation.mutate({ planId, scenarioId: scenario.id })
              }
              disabled={deleteMutation.isPending}
              aria-label={`delete scenario ${letter}`}
              className="text-label hover:text-foreground ml-auto"
            >
              del
            </button>
          )}
        </div>
        <PlanEditor
          planId={planId}
          content={scenario.content}
          editable={editable}
          onSave={doc =>
            contentMutation.mutate({
              planId,
              scenarioId: scenario.id,
              content: isEmptyDoc(doc) ? null : doc,
            })
          }
          placeholder="trigger, entry, stop, target. paste a chart if it helps."
        />
      </div>
    </li>
  );
}

function AddScenario({
  planId,
  onSaved,
}: {
  planId: number;
  onSaved: (at: Date) => void;
}) {
  const invalidate = useInvalidatePlan(planId);
  const [name, setName] = useState("");
  const [side, setSide] = useState<Side>("long");
  const [timeFrame, setTimeFrame] = useState<ScenarioTimeFrame>("1H");

  const addMutation = trpc.plan.addScenario.useMutation({
    onSuccess: scenario => {
      onSaved(scenario.updatedAt);
      setName("");
      invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to add scenario");
    },
  });

  const canSubmit = name.trim() !== "" && !addMutation.isPending;

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (!canSubmit) return;
        addMutation.mutate({
          planId,
          name: name.trim(),
          side,
          primaryTimeFrame: timeFrame,
        });
      }}
      className="grid grid-cols-[2rem_1fr] gap-x-4 pt-4"
    >
      <span className="text-heading leading-none opacity-30" aria-hidden>
        +
      </span>
      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={event => setName(event.target.value)}
          maxLength={SCENARIO_NAME_MAX}
          placeholder="new scenario, e.g. range high reclaim"
          aria-label="new scenario name"
          className={INPUT_CLASS}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segmented<Side>
            options={SCENARIO_SIDES}
            value={side}
            onChange={setSide}
            label="new scenario side"
          />
          <Segmented<ScenarioTimeFrame>
            options={SCENARIO_TIME_FRAMES}
            value={timeFrame}
            onChange={setTimeFrame}
            label="new scenario primary timeframe"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="text-label hover:text-foreground disabled:opacity-50 ml-auto"
          >
            add scenario →
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * Scenarios section of the plan detail page: lettered a, b, c… in id order,
 * inline edits while the plan is open, add form at the end.
 */
export function PlanScenarios({
  planId,
  scenarios,
  editable,
  onSaved,
}: {
  planId: number;
  scenarios: PlanScenario[];
  editable: boolean;
  onSaved: (at: Date) => void;
}) {
  return (
    <section aria-labelledby="scenarios-label" className="space-y-2">
      <SectionHeader id="scenarios-label">
        scenarios · {scenarios.length}
      </SectionHeader>
      {scenarios.length === 0 && !editable && (
        <p className="py-4 text-sm">no scenarios were written.</p>
      )}
      <ol>
        {scenarios.map((scenario, index) => (
          <ScenarioRow
            key={scenario.id}
            planId={planId}
            scenario={scenario}
            letter={String.fromCharCode(97 + index)}
            editable={editable}
            onSaved={onSaved}
          />
        ))}
      </ol>
      {editable && <AddScenario planId={planId} onSaved={onSaved} />}
    </section>
  );
}
