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
import { INPUT_CLASS, SectionHeader, fmtDate } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { Goal } from "@shared/types";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const GOAL_MAX_LENGTH = 200;

export default function Goals() {
  const utils = trpc.useUtils();
  const { data: goals, isLoading } = trpc.goal.list.useQuery();
  const [draft, setDraft] = useState("");
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editText, setEditText] = useState("");
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);

  const onError = (fallback: string) => (error: { message?: string }) => {
    toast.error(error.message || fallback);
  };

  const createMutation = trpc.goal.create.useMutation({
    onSuccess: () => {
      toast.success("goal added");
      utils.goal.list.invalidate();
      setDraft("");
    },
    onError: onError("failed to add goal"),
  });

  const updateMutation = trpc.goal.update.useMutation({
    onSuccess: () => {
      toast.success("goal updated");
      utils.goal.list.invalidate();
      setEditingGoal(null);
    },
    onError: onError("failed to update goal"),
  });

  const setDoneMutation = trpc.goal.setDone.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(variables.done ? "goal done" : "goal reopened");
      utils.goal.list.invalidate();
    },
    onError: onError("failed to update goal"),
  });

  const deleteMutation = trpc.goal.delete.useMutation({
    onSuccess: () => {
      toast.success("goal deleted");
      utils.goal.list.invalidate();
      setDeletingGoal(null);
    },
    onError: onError("failed to delete goal"),
  });

  const handleCreate = () => {
    const text = draft.trim();
    if (!text) return;
    createMutation.mutate({ text });
  };

  const startEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setEditText(goal.text);
  };

  const handleUpdate = () => {
    if (!editingGoal) return;
    const text = editText.trim();
    if (!text) {
      toast.error("goal text is required");
      return;
    }
    updateMutation.mutate({ id: editingGoal.id, text });
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

  const openGoals = goals?.filter(goal => goal.completedAt === null) ?? [];
  const doneGoals = goals?.filter(goal => goal.completedAt !== null) ?? [];

  return (
    <div className="space-y-12 max-w-3xl">
      <header className="space-y-2">
        <p className="text-title">goals</p>
        <p className="text-label">near-term intentions, in your own words</p>
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
          value={draft}
          maxLength={GOAL_MAX_LENGTH}
          onChange={event => setDraft(event.target.value)}
          placeholder="e.g. no trades without a written thesis"
          aria-label="new goal"
          className={INPUT_CLASS}
        />
        <button
          type="submit"
          disabled={createMutation.isPending || draft.trim().length === 0}
          className="text-label hover:text-foreground transition-colors disabled:opacity-50 whitespace-nowrap pb-1.5"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "add →"
          )}
        </button>
      </form>

      <section aria-labelledby="open-label">
        <SectionHeader id="open-label">open</SectionHeader>
        {openGoals.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">no open goals.</p>
        ) : (
          <ul>
            {openGoals.map(goal => {
              const isEditing = editingGoal?.id === goal.id;
              return (
                <li
                  key={goal.id}
                  className="flex items-baseline gap-3 py-3 border-b border-border"
                >
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={setDoneMutation.isPending || isEditing}
                    onChange={() =>
                      setDoneMutation.mutate({ id: goal.id, done: true })
                    }
                    aria-label={`mark done: ${goal.text}`}
                    className="h-4 w-4 shrink-0 translate-y-0.5 cursor-pointer rounded-none accent-foreground"
                  />
                  {isEditing ? (
                    <input
                      type="text"
                      value={editText}
                      maxLength={GOAL_MAX_LENGTH}
                      autoFocus
                      onChange={event => setEditText(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter") handleUpdate();
                        if (event.key === "Escape") setEditingGoal(null);
                      }}
                      aria-label="edit goal"
                      className={cn(INPUT_CLASS, "flex-1")}
                    />
                  ) : (
                    <span className="flex-1 text-base">{goal.text}</span>
                  )}
                  <div className="inline-flex items-center gap-3 text-sm text-muted-foreground whitespace-nowrap">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={handleUpdate}
                          disabled={updateMutation.isPending}
                          className="hover:text-foreground transition-colors"
                        >
                          save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGoal(null)}
                          className="hover:text-foreground transition-colors"
                        >
                          cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(goal)}
                          className="hover:text-foreground transition-colors"
                        >
                          edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingGoal(goal)}
                          className="hover:text-foreground transition-colors"
                        >
                          del
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {doneGoals.length > 0 && (
        <section aria-labelledby="done-label">
          <SectionHeader id="done-label">done</SectionHeader>
          <ul>
            {doneGoals.map(goal => (
              <li
                key={goal.id}
                className="flex items-baseline gap-3 py-3 border-b border-border text-muted-foreground"
              >
                <span className="flex-1 text-base line-through">
                  {goal.text}
                </span>
                <span className="text-label whitespace-nowrap">
                  {goal.completedAt ? fmtDate(goal.completedAt) : ""}
                </span>
                <div className="inline-flex items-center gap-3 text-sm whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setDoneMutation.mutate({ id: goal.id, done: false })
                    }
                    disabled={setDoneMutation.isPending}
                    className="hover:text-foreground transition-colors"
                  >
                    reopen
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingGoal(goal)}
                    className="hover:text-foreground transition-colors"
                  >
                    del
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog
        open={deletingGoal !== null}
        onOpenChange={open => !open && setDeletingGoal(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>delete goal?</AlertDialogTitle>
            <AlertDialogDescription>
              this removes &quot;{deletingGoal?.text}&quot;. it can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingGoal && deleteMutation.mutate({ id: deletingGoal.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
