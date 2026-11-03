import { SectionHeader } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

// Dashboard strip: every open goal, in createdAt order, with a mark-done
// checkbox. Independent of the selected account and of stats loading.
export function OpenGoals() {
  const utils = trpc.useUtils();
  const { data: goals, isLoading } = trpc.goal.list.useQuery();

  const setDoneMutation = trpc.goal.setDone.useMutation({
    onSuccess: () => {
      toast.success("goal done");
      utils.goal.list.invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to update goal");
    },
  });

  const openGoals = goals?.filter(goal => goal.completedAt === null) ?? [];

  return (
    <section aria-labelledby="goals-label">
      <SectionHeader id="goals-label">goals</SectionHeader>
      {isLoading ? (
        <div className="py-4">
          <Loader2
            className="h-4 w-4 animate-spin text-foreground"
            aria-label="loading"
          />
        </div>
      ) : openGoals.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          no open goals.{" "}
          <Link
            href="/goals"
            className="hover:text-foreground transition-colors"
          >
            set one →
          </Link>
        </p>
      ) : (
        <ul>
          {openGoals.map(goal => (
            <li
              key={goal.id}
              className="flex items-baseline gap-3 py-3 border-b border-border"
            >
              <input
                type="checkbox"
                checked={false}
                disabled={setDoneMutation.isPending}
                onChange={() =>
                  setDoneMutation.mutate({ id: goal.id, done: true })
                }
                aria-label={`mark done: ${goal.text}`}
                className="h-4 w-4 shrink-0 translate-y-0.5 cursor-pointer rounded-none accent-foreground"
              />
              <span className="text-base">{goal.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
