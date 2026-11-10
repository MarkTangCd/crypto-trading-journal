import { PlanEditor } from "@/components/plans/PlanEditor";
import { SectionHeader, fmtDayTime } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { isEmptyDoc, type RichTextDoc } from "@shared/richText";
import type { PlanObservation } from "@shared/types";
import { useRef, useState } from "react";
import { toast } from "sonner";

function useInvalidatePlan(planId: number) {
  const utils = trpc.useUtils();
  return () => {
    utils.plan.get.invalidate({ id: planId });
    utils.plan.list.invalidate();
  };
}

function ObservationRow({
  planId,
  observation,
  editable,
  onSaved,
}: {
  planId: number;
  observation: PlanObservation;
  editable: boolean;
  onSaved: (at: Date) => void;
}) {
  const invalidate = useInvalidatePlan(planId);

  // Autosave: never invalidate plan.get here, it would reset the editor.
  const contentMutation = trpc.plan.updateObservation.useMutation({
    onSuccess: ({ updatedAt }) => onSaved(updatedAt),
    onError: error => {
      // The editor flushes on unmount, so typing then deleting the
      // observation saves into a row that is already gone; nothing is lost.
      if (error.data?.code === "NOT_FOUND") return;
      toast.error(error.message || "failed to save observation");
    },
  });

  const deleteMutation = trpc.plan.deleteObservation.useMutation({
    onSuccess: invalidate,
    onError: error => {
      toast.error(error.message || "failed to delete observation");
    },
  });

  const time = fmtDayTime(observation.createdAt);

  return (
    <li className="group grid grid-cols-[7rem_1fr_auto] gap-x-6 py-3 border-b border-border">
      <span className="text-sm tabular-nums pt-px">{time}</span>
      <PlanEditor
        planId={planId}
        content={observation.content}
        editable={editable}
        onSave={doc => {
          // The server rejects empty observations; deleting is explicit.
          if (isEmptyDoc(doc)) return;
          contentMutation.mutate({
            planId,
            observationId: observation.id,
            content: doc,
          });
        }}
      />
      {editable ? (
        <button
          type="button"
          onClick={() =>
            deleteMutation.mutate({ planId, observationId: observation.id })
          }
          disabled={deleteMutation.isPending}
          aria-label={`delete observation ${time}`}
          className="text-label hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          del
        </button>
      ) : (
        <span />
      )}
    </li>
  );
}

function ObservationComposer({
  planId,
  onSaved,
}: {
  planId: number;
  onSaved: (at: Date) => void;
}) {
  const invalidate = useInvalidatePlan(planId);
  const doc = useRef<RichTextDoc | null>(null);
  const [empty, setEmpty] = useState(true);
  // Remount the editor after each log to clear it.
  const [round, setRound] = useState(0);

  const addMutation = trpc.plan.addObservation.useMutation({
    onSuccess: observation => {
      onSaved(observation.updatedAt);
      doc.current = null;
      setEmpty(true);
      setRound(r => r + 1);
      invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to log observation");
    },
  });

  const canSubmit = !empty && !addMutation.isPending;

  const submit = () => {
    if (!canSubmit || !doc.current) return;
    addMutation.mutate({ planId, content: doc.current });
  };

  return (
    <div
      className="space-y-2"
      onKeyDownCapture={event => {
        // Capture phase, so Tiptap's Mod-Enter hard break never fires.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();
          submit();
        }
      }}
    >
      <PlanEditor
        key={round}
        planId={planId}
        content={null}
        editable
        debounceMs={0}
        onSave={next => {
          doc.current = next;
          setEmpty(isEmptyDoc(next));
        }}
        placeholder="what is the market doing right now?"
        className="border-b border-border focus-within:border-foreground pb-2"
      />
      <div className="flex items-center justify-between gap-4">
        <span className="text-label">⌘↵ to log · time is stamped on log</span>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="text-sm hover:underline disabled:opacity-40 disabled:hover:no-underline"
        >
          log observation →
        </button>
      </div>
    </div>
  );
}

/**
 * Observations section of the plan detail page: oldest first with their
 * UTC+8 log time, editable while the plan is open, composer at the foot.
 */
export function PlanObservations({
  planId,
  observations,
  editable,
  onSaved,
}: {
  planId: number;
  observations: PlanObservation[];
  editable: boolean;
  onSaved: (at: Date) => void;
}) {
  return (
    <section aria-labelledby="observations-label" className="space-y-4">
      <SectionHeader id="observations-label">
        observations · {observations.length}
      </SectionHeader>
      {observations.length === 0 && (
        <p className="text-sm">
          {editable
            ? "nothing logged yet. log what you see as it happens."
            : "nothing was logged."}
        </p>
      )}
      <ul>
        {observations.map(observation => (
          <ObservationRow
            key={observation.id}
            planId={planId}
            observation={observation}
            editable={editable}
            onSaved={onSaved}
          />
        ))}
      </ul>
      {editable && <ObservationComposer planId={planId} onSaved={onSaved} />}
    </section>
  );
}
